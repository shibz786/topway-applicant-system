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
// — a serializable transaction with a bounded retry handles the race
// between two concurrent creates without needing a dedicated counter table.
async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const invoices = await tx.invoice.findMany({ select: { number: true } });
  const max = invoices.reduce((acc, inv) => {
    const n = parseInt(inv.number, 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return String(max + 1).padStart(2, "0");
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

    // actorContext.run() is wrapped around each individual query INSIDE the
    // transaction callback, not around the whole db.$transaction(...) call.
    // AsyncLocalStorage's store does not reliably survive being entered
    // outside and read from inside Prisma's interactive-transaction
    // callback (its Rust query engine bridge appears to resume the
    // continuation off the tracked async chain) — confirmed by actually
    // running this against the dev DB, where the audit middleware's own
    // "no actor in context" guard caught it. Wrapping inside the callback,
    // right around the write, is what actually keeps the context intact.
    return db.$transaction(
      async (tx) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = await nextInvoiceNumber(tx);
          try {
            const invoice = await runAsActor(user, () =>
              tx.invoice.create({
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
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
              continue; // number collided with a concurrent create — retry with a fresh max
            }
            throw err;
          }
        }
        throw new ActionError("Could not allocate an invoice number — please try again");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
      throw new ActionError("Only draft invoices can be edited — void and recreate instead");
    }

    // See the long comment in createInvoice() above — actorContext.run()
    // has to wrap the write itself, inside the transaction callback.
    await db.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await runAsActor(user, () =>
        tx.invoice.update({
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
      );
    });
    return null;
  });
}

export async function duplicateInvoice(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const source = await getInvoiceInternal(id);
    if (!source) throw new ActionError("Invoice not found");

    return db.$transaction(
      async (tx) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = await nextInvoiceNumber(tx);
          try {
            const created = await runAsActor(user, () =>
              tx.invoice.create({
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
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
            throw err;
          }
        }
        throw new ActionError("Could not allocate an invoice number — please try again");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
      throw new ActionError("Only draft invoices can be deleted — void it instead");
    }

    // Interactive form, not the array-batch form — see the comment in
    // createInvoice() above about actorContext needing to wrap the write
    // from inside the transaction callback.
    await db.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await runAsActor(user, () => tx.invoice.delete({ where: { id } }));
    });
    return null;
  });
}
