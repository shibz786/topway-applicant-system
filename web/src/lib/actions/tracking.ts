"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { computeDepartureMilestones } from "@/lib/business/tracking";
import {
  setPipelineDateSchema,
  setDepartureSchema,
  putOnHoldSchema,
  cancelApplicationSchema,
  resumeApplicationSchema,
  createDisputeSchema,
  resolveDisputeSchema,
  updateTrackingNotesSchema,
  type SetPipelineDateInput,
  type SetDepartureInput,
  type PutOnHoldInput,
  type CreateDisputeInput,
} from "@/lib/validation/tracking";
import { runAction, ActionError, type ActionResult } from "./result";

async function getTrackingOrThrow(candidateId: string) {
  const tracking = await db.tracking.findUnique({ where: { candidateId } });
  if (!tracking) throw new ActionError("This candidate has no tracking record yet");
  return tracking;
}

export async function setPipelineDate(input: SetPipelineDateInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = setPipelineDateSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { candidateId, step, date } = parsed.data;

    await getTrackingOrThrow(candidateId);

    await runAsActor(user, () =>
      db.tracking.update({
        where: { candidateId },
        data: { [step]: date ? new Date(date) : null },
      }),
    );
    return null;
  });
}

// Departure date + destination country must always be set together — never
// callable with just one (the Zod schema requires both). Computes and
// stores the three derived milestone dates in the same write.
export async function setDeparture(input: SetDepartureInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = setDepartureSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { candidateId, departureDate, destinationCountry } = parsed.data;

    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new ActionError("Candidate not found");
    await getTrackingOrThrow(candidateId);

    const departure = new Date(departureDate);
    const milestones = computeDepartureMilestones(departure, destinationCountry, candidate.contractDuration);

    await runAsActor(user, () =>
      db.tracking.update({
        where: { candidateId },
        data: {
          departureDate: departure,
          destinationCountry,
          probationEndDate: milestones.probationEndDate,
          contractMidDate: milestones.contractMidDate,
          contractEndDate: milestones.contractEndDate,
        },
      }),
    );
    return null;
  });
}

export async function updateTrackingNotes(input: {
  candidateId: string;
  notes?: string;
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = updateTrackingNotesSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { candidateId, notes } = parsed.data;

    await getTrackingOrThrow(candidateId);
    await runAsActor(user, () =>
      db.tracking.update({ where: { candidateId }, data: { notes: notes || null } }),
    );
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────
// Application status actions — explicit, modal-confirmed, never a bare
// dropdown change (CLAUDE.md UI rule).
// ─────────────────────────────────────────────────────────────────

export async function putOnHold(input: PutOnHoldInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = putOnHoldSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "A reason is required");
    const { candidateId, reason } = parsed.data;

    await getTrackingOrThrow(candidateId);
    await runAsActor(user, () =>
      db.tracking.update({
        where: { candidateId },
        data: { applicationStatus: "ON_HOLD", onHoldReason: reason, onHoldAt: new Date() },
      }),
    );
    return null;
  });
}

export async function cancelApplication(input: { candidateId: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = cancelApplicationSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Invalid input");
    const { candidateId } = parsed.data;

    await getTrackingOrThrow(candidateId);
    await runAsActor(user, () =>
      db.tracking.update({ where: { candidateId }, data: { applicationStatus: "CANCELLED" } }),
    );
    return null;
  });
}

// Restores ACTIVE and clears hold fields, per CLAUDE.md.
export async function resumeApplication(input: { candidateId: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = resumeApplicationSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Invalid input");
    const { candidateId } = parsed.data;

    await getTrackingOrThrow(candidateId);
    await runAsActor(user, () =>
      db.tracking.update({
        where: { candidateId },
        data: { applicationStatus: "ACTIVE", onHoldReason: null, onHoldAt: null },
      }),
    );
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────
// Disputes
// ─────────────────────────────────────────────────────────────────

export async function createDispute(input: CreateDisputeInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = createDisputeSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { candidateId, type, notes } = parsed.data;

    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new ActionError("Candidate not found");

    const dispute = await runAsActor(user, () =>
      db.dispute.create({ data: { candidateId, type, notes: notes || null } }),
    );
    return { id: dispute.id };
  });
}

export async function resolveDispute(input: { disputeId: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "tracking");

    const parsed = resolveDisputeSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Invalid input");
    const { disputeId } = parsed.data;

    const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new ActionError("Dispute not found");

    await runAsActor(user, () =>
      db.dispute.update({ where: { id: disputeId }, data: { resolvedAt: new Date() } }),
    );
    return null;
  });
}
