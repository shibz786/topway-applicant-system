"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCanViewCandidate } from "@/lib/auth/candidate-access";
import { storage } from "@/lib/storage/adapter";
import {
  candidateSchema,
  personalDetailsSchema,
  experienceSkillsSchema,
  type CandidateInput,
  type PersonalDetailsInput,
  type ExperienceSkillsInput,
} from "@/lib/validation/candidate";
import { PIPELINE_STEPS } from "@/lib/business/tracking";
import { runAction, ActionError, type ActionResult } from "./result";
import type { ApplicationStatus, DestCountry } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// List (ATS table)
// ─────────────────────────────────────────────────────────────────

export type CandidateListFilters = {
  status?: ApplicationStatus;
  agentId?: string;
  destinationCountry?: DestCountry;
};

export type CandidateListRow = Awaited<ReturnType<typeof listCandidatesInternal>>[number];

async function listCandidatesInternal(user: Awaited<ReturnType<typeof requireSession>>, filters: CandidateListFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.tracking = { applicationStatus: filters.status };
  if (filters.destinationCountry) {
    where.tracking = { ...(where.tracking as object), destinationCountry: filters.destinationCountry };
  }

  // Agents only ever see their own candidates (current placement or
  // remarketing-visible from a prior one) — this is enforced here, not
  // left to the client to filter.
  if (user.role === "AGENT") {
    if (!user.agentId) return [];
    where.placements = {
      some: { agentId: user.agentId, OR: [{ isCurrent: true }, { remarketingDate: { not: null } }] },
    };
  } else if (filters.agentId) {
    where.placements = { some: { agentId: filters.agentId, isCurrent: true } };
  }

  const rows = await db.candidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      tracking: true,
      placements: { where: { isCurrent: true }, include: { agent: { select: { companyName: true } } }, take: 1 },
      disputes: { where: { resolvedAt: null }, select: { id: true, type: true } },
      documents: { where: { type: "headshot" }, select: { r2Key: true }, take: 1 },
    },
  });

  return Promise.all(
    rows.map(async (r) => {
      const currentStep = [...PIPELINE_STEPS]
        .reverse()
        .find((s) => r.tracking && (r.tracking as unknown as Record<string, Date | null>)[s.key]);

      const headshotKey = r.documents[0]?.r2Key;
      const headshotUrl = headshotKey ? await storage.createSignedDownloadUrl(headshotKey, 900) : null;

      return {
        id: r.id,
        fullName: r.fullName,
        category: r.category,
        applicationStatus: r.tracking?.applicationStatus ?? "ACTIVE",
        currentPipelineStep: currentStep?.label ?? null,
        agentName: r.placements[0]?.agent.companyName ?? null,
        destinationCountry: r.tracking?.destinationCountry ?? null,
        departureDate: r.tracking?.departureDate ?? null,
        probationEndDate: r.tracking?.probationEndDate ?? null,
        contractMidDate: r.tracking?.contractMidDate ?? null,
        contractEndDate: r.tracking?.contractEndDate ?? null,
        hasActiveDispute: r.disputes.length > 0,
        activeDisputeTypes: r.disputes.map((d) => d.type),
        headshotUrl,
      };
    }),
  );
}

export async function listCandidates(filters: CandidateListFilters = {}): Promise<ActionResult<CandidateListRow[]>> {
  return runAction(async () => {
    const user = await requireSession();
    return listCandidatesInternal(user, filters);
  });
}

// ─────────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────────

async function getCandidateInternal(id: string) {
  return db.candidate.findUnique({
    where: { id },
    include: {
      tracking: true,
      disputes: { orderBy: { createdAt: "desc" } },
      documents: true,
      placements: {
        orderBy: { startDate: "desc" },
        include: { agent: { select: { id: true, companyName: true, country: true } } },
      },
    },
  });
}

export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof getCandidateInternal>>>;

export async function getCandidate(id: string): Promise<ActionResult<CandidateDetail>> {
  return runAction(async () => {
    const user = await requireSession();
    await assertCanViewCandidate(user, id);
    const candidate = await getCandidateInternal(id);
    if (!candidate) throw new ActionError("Candidate not found");
    return candidate;
  });
}

// Admin-only, per the permissions matrix ("View audit log — Admin" only).
export async function getCandidateAuditLog(id: string) {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });
    return db.auditLog.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, username: true } } },
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// Create / update (Profile Builder — draft-saved-per-step)
// ─────────────────────────────────────────────────────────────────

// Sensible defaults for the fields the wizard hasn't collected yet — a
// Candidate row is created after step 1 so uploads (step 3) have an id to
// attach to, per "Draft saved to DB on each step". There's no separate
// draft/published flag in the schema — an incomplete row is just a
// Candidate a staff member can reopen and finish editing later.
const STEP2_DEFAULTS = {
  category: "FIRST_TIMER" as const,
  skills: [] as string[],
  languages: [] as string[],
  yearsExperience: 0,
  contractDuration: 24,
};

export async function createCandidateDraft(input: PersonalDetailsInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const parsed = personalDetailsSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const candidate = await runAsActor(user, () =>
      db.candidate.create({
        data: {
          fullName: data.fullName,
          nationality: data.nationality,
          dateOfBirth: new Date(data.dateOfBirth),
          passportNumber: data.passportNumber,
          passportExpiry: new Date(data.passportExpiry),
          idNumber: data.idNumber || null,
          phone: data.phone || null,
          address: data.address || null,
          religion: data.religion || null,
          ...STEP2_DEFAULTS,
        },
      }),
    );

    await runAsActor(user, () => db.tracking.create({ data: { candidateId: candidate.id } }));

    return { id: candidate.id };
  });
}

export async function updateCandidatePersonal(id: string, input: PersonalDetailsInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const parsed = personalDetailsSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) throw new ActionError("Candidate not found");

    await runAsActor(user, () =>
      db.candidate.update({
        where: { id },
        data: {
          fullName: data.fullName,
          nationality: data.nationality,
          dateOfBirth: new Date(data.dateOfBirth),
          passportNumber: data.passportNumber,
          passportExpiry: new Date(data.passportExpiry),
          idNumber: data.idNumber || null,
          phone: data.phone || null,
          address: data.address || null,
          religion: data.religion || null,
        },
      }),
    );
    return null;
  });
}

export async function updateCandidateExperience(
  id: string,
  input: ExperienceSkillsInput,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const parsed = experienceSkillsSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) throw new ActionError("Candidate not found");

    await runAsActor(user, () => db.candidate.update({ where: { id }, data }));
    return null;
  });
}

// Full-record update, used when editing an already-complete profile from
// the ATS detail panel rather than stepping through the wizard again.
export async function updateCandidateFull(id: string, input: CandidateInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const parsed = candidateSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) throw new ActionError("Candidate not found");

    await runAsActor(user, () =>
      db.candidate.update({
        where: { id },
        data: {
          fullName: data.fullName,
          nationality: data.nationality,
          dateOfBirth: new Date(data.dateOfBirth),
          passportNumber: data.passportNumber,
          passportExpiry: new Date(data.passportExpiry),
          idNumber: data.idNumber || null,
          phone: data.phone || null,
          address: data.address || null,
          religion: data.religion || null,
          category: data.category,
          skills: data.skills,
          languages: data.languages,
          yearsExperience: data.yearsExperience,
          contractDuration: data.contractDuration,
        },
      }),
    );
    return null;
  });
}

// Hard delete isn't in the spec's action list (only "create/edit" is) and
// candidates accumulate audited children (Dispute, Placement) whose own
// bulk-delete would need the same before/after diff machinery as a
// single-record delete — not worth the risk for a feature nobody asked
// for. If this becomes needed, model it as an application-status action
// (e.g. an "Archived" state) instead of a real delete, consistent with how
// Cancel/Hold/Resume already work.
