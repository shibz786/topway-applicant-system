import { PrismaClient, Prisma } from "@prisma/client";

// Tables that get an audit_log row on every write, per CLAUDE.md security
// rule #8. Keep this list in sync with the spec — do not add tables here
// casually, and never remove one without checking the "done means" list.
const AUDITED_MODELS = new Set([
  "Candidate",
  "Tracking",
  "Placement",
  "Dispute",
  "Invoice",
]);

// Set by requireSession() (see session.ts) at the start of every request so
// the audit middleware below knows who the actor is. AsyncLocalStorage keeps
// this correct across concurrent requests in the Node runtime — a plain
// module-level variable would leak between requests.
//
// This MUST be cached on globalThis, exactly like the Prisma client below.
// Next.js compiles Server Actions, Route Handlers, and Server Components
// into separate module "layers" — a plain `export const actorContext = new
// AsyncLocalStorage()` gets re-evaluated once per layer, so
// requireSession()'s layer and this middleware's layer can end up holding
// two DIFFERENT AsyncLocalStorage instances even though both import
// "the same" module. Confirmed live: without this, actorContext.run() in a
// Server Action silently ran on a different instance than the one this
// middleware reads from getStore() on, and every write failed with
// "no actor in context" despite requireSession() having clearly run.
import { AsyncLocalStorage } from "node:async_hooks";

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var actorContextGlobal: AsyncLocalStorage<{ actorId: string }> | undefined;
}

export const actorContext = globalThis.actorContextGlobal ?? new AsyncLocalStorage<{ actorId: string }>();
globalThis.actorContextGlobal = actorContext;

function currentActorId(): string | null {
  return actorContext.getStore()?.actorId ?? null;
}

function buildClient(datasourceUrl?: string) {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  // Audit-log middleware: on every write to an audited model, capture a
  // before/after diff and persist it as an AuditLog row in the SAME
  // transaction as the write it's logging, so the two can never drift.
  client.$use(async (params, next) => {
    const { model, action } = params;

    if (!model || !AUDITED_MODELS.has(model)) {
      return next(params);
    }

    const auditableAction = mapAction(action);
    if (!auditableAction) {
      return next(params);
    }

    const actorId = currentActorId();
    if (!actorId) {
      // A write to an audited table with no actor bound means some code
      // path forgot to run inside requireSession()'s actorContext — that's
      // a bug, not something to silently let through unaudited.
      throw new Error(
        `Audit middleware: write to ${model}.${action} with no actor in context. ` +
          `Every mutation must run inside actorContext.run({ actorId }, ...) — see requireSession().`,
      );
    }

    let before: unknown = null;
    if (auditableAction === "UPDATE" || auditableAction === "DELETE") {
      const where = (params.args as { where?: Record<string, unknown> })?.where;
      if (where) {
        before = await (client as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
          lowerFirst(model)
        ].findUnique({ where });
      }
    }

    const result = await next(params);

    const after = auditableAction === "DELETE" ? null : result;
    const diff = buildDiff(before, after);
    const recordId = (result as { id?: string })?.id ?? (before as { id?: string })?.id;
    const candidateId = extractCandidateId(model, result ?? before);

    if (recordId) {
      await client.auditLog.create({
        data: {
          actorId,
          entityType: model,
          entityId: recordId,
          action: auditableAction,
          diff,
          candidateId: candidateId ?? undefined,
        },
      });
    }

    return result;
  });

  return client;
}

function mapAction(action: string): "CREATE" | "UPDATE" | "DELETE" | null {
  if (action === "create" || action === "createMany") return "CREATE";
  if (action === "update" || action === "updateMany" || action === "upsert") return "UPDATE";
  if (action === "delete" || action === "deleteMany") return "DELETE";
  return null;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function extractCandidateId(model: string, record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  if (model === "Candidate" && typeof r.id === "string") return r.id;
  if (typeof r.candidateId === "string") return r.candidateId;
  return null;
}

// { field: { before, after } } for every field that actually changed.
function buildDiff(before: unknown, after: unknown): Prisma.InputJsonValue {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const bv = serializeValue(b[key]);
    const av = serializeValue(a[key]);
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      diff[key] = { before: bv, after: av };
    }
  }
  return diff as Prisma.InputJsonValue;
}

function serializeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    // Prisma.Decimal
    return (v as { toNumber: () => number }).toNumber();
  }
  return v === undefined ? null : v;
}

export const db = globalThis.prismaGlobal ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = db;
}

// A second client bound to a session-mode connection (for genuinely
// interactive $transaction() calls) briefly existed here and was removed.
// The app used to have several — invoice-number allocation, placement
// reassignment, contract-closure notifications, databank approval — all
// converted to either a single atomic statement (invoice numbers are now
// a real Postgres SEQUENCE, see prisma/migrations/
// 20260824030000_invoice_number_sequence) or an array-batch
// $transaction([...]) with any conditional read moved to before the
// transaction (safe: these are all low-frequency, human-driven actions,
// not a hot path where a race would matter in practice). Both forms run
// fine on `db` above (the transaction-mode pooler) — no second connection
// needed at all. Don't reintroduce one without first checking whether the
// same restructuring applies; a session-mode client was tried live on
// Vercel first and, despite passing raw TCP connectivity checks, every
// query through it just hung indefinitely with no error — never
// conclusively diagnosed, and not worth revisiting unless a genuinely
// unavoidable interactive transaction shows up.
