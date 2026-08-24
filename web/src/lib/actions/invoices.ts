"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import {
  invoiceFormSchema,
  setInvoiceStatusSchema,
  ALLOWED_STATUS_TRANSITIONS,
  type InvoiceFormInput,
  type InvoiceStatus,
} from "@/lib/validation/invoice";
import { runAction, ActionError, type ActionResult } from "./result";
import { Prisma } from "@prisma/client";

// Every action in this file starts the same way: requireSession(), then
// requirePermission(user, "invoices") — admin always passes, staff needs
// the flag. This is CLAUDE.md rule #4, checked on the action, not the
// route. Never trust a client-side nav-link hide to be the real gate.

// Prisma's Decimal is a class instance, not a plain object — React's RSC
// serialization (Server Action return values crossing to a Client
// Component) throws "Only plain objects can be passed..." if one leaks
// through un-converted. Every action below that reaches a client
// component must return plain numbers, never a raw Decimal. Found this by
// actually driving the invoices page in a browser, not by typechecking —
// tsc has no idea Decimal isn't RSC-serializable.
function decimalToNumber(d: Prisma.Decimal | number): number {
  return typeof d === "number" ? d : d.toNumber();
}

async function listInvoicesInternal() {
  const rows = await db.invoice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { id: true } },
    },
  });
  return rows.map((r) => ({ ...r, totalAmount: decimalToNumber(r.totalAmount) }));
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoicesInternal>>[number];

export async function listInvoices(): Promise<ActionResult<InvoiceListRow[]>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");
    return listInvoicesInternal();
  });
}

async function getInvoiceInternal(id: string) {
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      items: { include: { candidate: { select: { id: true, fullName: true } } } },
    },
  });
  if (!invoice) return null;
  return {
    ...invoice,
    totalAmount: decimalToNumber(invoice.totalAmount),
    items: invoice.items.map((item) => ({ ...item, amount: decimalToNumber(item.amount) })),
  };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceInternal>>>;

export async function getInvoice(id: string): Promise<ActionResult<InvoiceDetail>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");
    const invoice = await getInvoiceInternal(id);
    if (!invoice) throw new ActionError("Invoice not found");
    return invoice;
  });
}

export async function listAgentsForInvoice(): Promise<
  ActionResult<{ id: string; companyName: string; country: string }[]>
> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");
    return db.agent.findMany({
      select: { id: true, companyName: true, country: true },
      orderBy: { companyName: "asc" },
    });
  });
}

export async function listCandidatesForInvoice(): Promise<
  ActionResult<{ id: string; fullName: string }[]>
> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");
    return db.candidate.findMany({
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  });
}

// Sequential invoice numbers, generated server-side (never client-supplied)
// — a real Postgres SEQUENCE (see prisma/migrations/
// 20260824030000_invoice_number_sequence), not a MAX(number)+1 read
// wrapped in an interactive transaction like this used to be. That
// approach was correct in principle but needs a connection pool that can
// hold one connection across multiple round-trips, and neither of
// Supabase's pooler modes gave this app both that AND the connection
// headroom to survive many concurrent Vercel serverless instances (full
// story in the datasource block comment in schema.prisma). nextval() is a
// single atomic statement — safe on the regular pooled `db` client, no
// transaction or retry loop needed at all.
async function nextInvoiceNumber(): Promise<string> {
  const [{ nextval }] = await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_number_seq')`;
  return String(nextval).padStart(2, "0");
}

function totalFromItems(items: InvoiceFormInput["items"]): number {
  return items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
}

export async function createInvoice(input: InvoiceFormInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const parsed = invoiceFormSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const number = await nextInvoiceNumber();
    const invoice = await runAsActor(user, () =>
      db.invoice.create({
        data: {
          number,
          status: "DRAFT",
          agentId: data.agentId || null,
          totalAmount: totalFromItems(data.items),
          currency: data.currency,
          notes: data.notes || null,
          issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          items: {
            create: data.items.map((item) => ({
              candidateId: item.candidateId || null,
              description: item.description,
              amount: item.amount,
              quantity: item.quantity,
            })),
          },
        },
      }),
    );
    return { id: invoice.id };
  });
}

export async function updateInvoice(id: string, input: InvoiceFormInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const parsed = invoiceFormSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing) throw new ActionError("Invoice not found");
    if (existing.status !== "DRAFT") {
      throw new ActionError("Only draft invoices can be edited, void and recreate instead");
    }

    // Array-batch form, not the interactive callback form — the two writes
    // don't depend on reading anything back mid-transaction, so this
    // doesn't need dbDirect (see the long comment on the datasource block
    // in schema.prisma for why that distinction matters here). Wrapping
    // the whole batch in runAsActor() — not each query individually —
    // because $transaction([...]) needs literal query-builder expressions
    // as its array elements, not the result of another async wrapper.
    await runAsActor(user, () =>
      db.$transaction([
        db.invoiceItem.deleteMany({ where: { invoiceId: id } }),
        db.invoice.update({
          where: { id },
          data: {
            agentId: data.agentId || null,
            totalAmount: totalFromItems(data.items),
            currency: data.currency,
            notes: data.notes || null,
            issuedAt: data.issuedAt ? new Date(data.issuedAt) : null,
            dueAt: data.dueAt ? new Date(data.dueAt) : null,
            items: {
              create: data.items.map((item) => ({
                candidateId: item.candidateId || null,
                description: item.description,
                amount: item.amount,
                quantity: item.quantity,
              })),
            },
          },
        }),
      ]),
    );
    return null;
  });
}

export async function duplicateInvoice(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const source = await getInvoiceInternal(id);
    if (!source) throw new ActionError("Invoice not found");

    const number = await nextInvoiceNumber();
    const created = await runAsActor(user, () =>
      db.invoice.create({
        data: {
          number,
          status: "DRAFT",
          agentId: source.agentId,
          totalAmount: source.totalAmount,
          currency: source.currency,
          notes: source.notes,
          items: {
            create: source.items.map((item) => ({
              candidateId: item.candidateId,
              description: item.description,
              amount: item.amount,
              quantity: item.quantity,
            })),
          },
        },
      }),
    );
    return { id: created.id };
  });
}

export async function setInvoiceStatus(input: {
  id: string;
  status: InvoiceStatus;
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const parsed = setInvoiceStatusSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { id, status } = parsed.data;

    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing) throw new ActionError("Invoice not found");

    const currentStatus = existing.status as InvoiceStatus;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new ActionError(`Cannot move an invoice from ${currentStatus} to ${status}`);
    }

    await runAsActor(user, () =>
      db.invoice.update({
        where: { id },
        data: {
          status,
          paidAt: status === "PAID" ? new Date() : existing.paidAt,
        },
      }),
    );
    return null;
  });
}

// Hard delete is only allowed for drafts that were never sent — anything
// past that point is a financial record and must be voided (status change,
// audit-logged), never removed.
export async function deleteDraftInvoice(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "DRAFT") {
      throw new ActionError("Only draft invoices can be deleted, void it instead");
    }

    // Array-batch form — see the comment in updateInvoice() above, same
    // reasoning applies here (no read-then-conditional-write dependency
    // between the two statements, so this doesn't need dbDirect).
    await runAsActor(user, () =>
      db.$transaction([db.invoiceItem.deleteMany({ where: { invoiceId: id } }), db.invoice.delete({ where: { id } })]),
    );
    return null;
  });
}
