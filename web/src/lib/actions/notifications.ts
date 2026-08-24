"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor, type SessionUser } from "@/lib/auth/session";
import { ActionError, runAction, type ActionResult } from "./result";

// Notification.type is a free-form String per the schema ("CONTRACT_CLOSED"
// | "PROBATION_COMPLETE" | etc.). For DATABANK_REQUEST specifically we also
// need to know WHICH agent is asking, and there's no requester column on
// Notification (userId is the *recipient*, not the sender) — rather than
// add a column outside the 12 specified models a second time (see
// CompanySettings in Phase 2, which WAS confirmed with the user first；
// this one is small/internal enough that it didn't seem worth a second
// interrupt), the requesting agent's id is encoded in the type string as
// `DATABANK_REQUEST:<agentId>`. Always match with startsWith(), never
// equality, and parse the suffix with parseDatabankRequestType() below.
const DATABANK_REQUEST_PREFIX = "DATABANK_REQUEST:";

function databankRequestType(agentId: string): string {
  return `${DATABANK_REQUEST_PREFIX}${agentId}`;
}

function parseDatabankRequestAgentId(type: string): string | null {
  return type.startsWith(DATABANK_REQUEST_PREFIX) ? type.slice(DATABANK_REQUEST_PREFIX.length) : null;
}

// ─────────────────────────────────────────────────────────────────
// Contract-closure notifications (CLAUDE.md: "Runs on page load for
// admin/staff (or via daily cron if you set one up)"). No cron
// infrastructure exists yet (Upstash/Vercel cron are later phases) — this
// runs opportunistically whenever a portal page that cares about it loads,
// which is an honest reading of "on page load" for now.
// ─────────────────────────────────────────────────────────────────

// Writes to Tracking (audited — CLAUDE.md rule #8) with no logged-in actor
// initiating them, because this is a system-triggered check, not a direct
// user action. There's no real cron/system user in this schema, so the
// write is attributed to whichever user's page load happened to trigger
// the check — an honest reflection of how it's actually invoked (see the
// comment above), not a guess. Requires a caller, never runs anonymously.
export async function checkContractClosureNotifications(triggeringUser: SessionUser): Promise<void> {
  const due = await db.tracking.findMany({
    where: { contractEndDate: { lt: new Date() }, contractClosureNotified: false },
    select: { candidateId: true },
  });
  if (due.length === 0) return;

  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });

  for (const { candidateId } of due) {
    const placement = await db.placement.findFirst({
      where: { candidateId, isCurrent: true },
      select: { agent: { select: { userId: true } } },
    });
    const recipientIds = new Set(admins.map((a) => a.id));
    if (placement?.agent.userId) recipientIds.add(placement.agent.userId);

    await db.$transaction(async (tx) => {
      for (const userId of recipientIds) {
        await tx.notification.create({
          data: { candidateId, userId, type: "CONTRACT_CLOSED" },
        });
      }
      await runAsActor(triggeringUser, () =>
        tx.tracking.update({ where: { candidateId }, data: { contractClosureNotified: true } }),
      );
    });
  }
}

export type ContractClosureNotification = Awaited<
  ReturnType<typeof getUnseenContractClosureNotificationsInternal>
>[number];

async function getUnseenContractClosureNotificationsInternal(userId: string) {
  return db.notification.findMany({
    where: { userId, type: "CONTRACT_CLOSED", seenAt: null },
    include: { candidate: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getUnseenContractClosureNotifications(): Promise<
  ActionResult<ContractClosureNotification[]>
> {
  return runAction(async () => {
    const user = await requireSession();
    await checkContractClosureNotifications(user);
    return getUnseenContractClosureNotificationsInternal(user.id);
  });
}

export async function markNotificationSeen(notificationId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    const notification = await db.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.userId !== user.id) return null; // not yours — silently no-op
    await db.notification.update({ where: { id: notificationId }, data: { seenAt: new Date() } });
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────
// Databank assignment requests — agent-initiated, admin-approved.
// "Request assignment submits a notification to admin — not
// self-service" (CLAUDE.md).
// ─────────────────────────────────────────────────────────────────

export async function requestDatabankAssignment(candidateId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession({ role: "AGENT" });
    if (!user.agentId) throw new ActionError("No agent profile");

    const agent = await db.agent.findUnique({ where: { id: user.agentId } });
    if (!agent?.dataBankAccess) throw new ActionError("Databank access is not enabled for your account");

    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate || !candidate.inDatabank) throw new ActionError("Candidate not found in databank");

    const type = databankRequestType(user.agentId);
    const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });

    // Avoid spamming duplicate requests — skip admins who already have an
    // unseen request for this exact candidate+agent pair.
    const existing = await db.notification.findMany({
      where: { candidateId, type, seenAt: null },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((n) => n.userId));

    await Promise.all(
      admins
        .filter((a) => !alreadyNotified.has(a.id))
        .map((a) => db.notification.create({ data: { candidateId, userId: a.id, type } })),
    );
    return null;
  });
}

export type DatabankRequestRow = {
  notificationId: string;
  candidateId: string;
  candidateName: string;
  agentId: string;
  agentCompanyName: string;
  createdAt: Date;
};

export async function listDatabankRequests(): Promise<ActionResult<DatabankRequestRow[]>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });

    const notifications = await db.notification.findMany({
      where: { type: { startsWith: DATABANK_REQUEST_PREFIX }, seenAt: null },
      include: { candidate: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    const agentIds = [...new Set(notifications.map((n) => parseDatabankRequestAgentId(n.type)).filter((x): x is string => !!x))];
    const agents = await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, companyName: true } });
    const agentById = new Map(agents.map((a) => [a.id, a.companyName]));

    // Collapse to one row per (candidate, agent) — several admins each got
    // their own notification row for the same request.
    const seen = new Set<string>();
    const rows: DatabankRequestRow[] = [];
    for (const n of notifications) {
      const agentId = parseDatabankRequestAgentId(n.type);
      if (!agentId) continue;
      const key = `${n.candidateId}:${agentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        notificationId: n.id,
        candidateId: n.candidateId,
        candidateName: n.candidate.fullName,
        agentId,
        agentCompanyName: agentById.get(agentId) ?? "Unknown agent",
        createdAt: n.createdAt,
      });
    }
    return rows;
  });
}

// Approves a databank request: assigns the candidate to the requesting
// agent (reusing the same Placement logic as manual assignment) and
// dismisses every admin's notification for this candidate+agent pair.
export async function approveDatabankRequest(input: {
  candidateId: string;
  agentId: string;
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession({ role: "ADMIN" });

    const [candidate, agent] = await Promise.all([
      db.candidate.findUnique({ where: { id: input.candidateId } }),
      db.agent.findUnique({ where: { id: input.agentId } }),
    ]);
    if (!candidate) throw new ActionError("Candidate not found");
    if (!agent) throw new ActionError("Agent not found");

    await db.$transaction(async (tx) => {
      const current = await tx.placement.findFirst({
        where: { candidateId: input.candidateId, isCurrent: true },
      });
      if (current && current.agentId !== input.agentId) {
        await runAsActor(user, () =>
          tx.placement.update({
            where: { id: current.id },
            data: { isCurrent: false, endDate: new Date(), changeReason: "Reassigned via databank request" },
          }),
        );
      }
      if (!current || current.agentId !== input.agentId) {
        await runAsActor(user, () =>
          tx.placement.create({ data: { candidateId: input.candidateId, agentId: input.agentId } }),
        );
      }
      await tx.notification.updateMany({
        where: { candidateId: input.candidateId, type: databankRequestType(input.agentId), seenAt: null },
        data: { seenAt: new Date() },
      });
    });
    return null;
  });
}

export async function dismissDatabankRequest(input: { candidateId: string; agentId: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });
    await db.notification.updateMany({
      where: { candidateId: input.candidateId, type: databankRequestType(input.agentId), seenAt: null },
      data: { seenAt: new Date() },
    });
    return null;
  });
}
