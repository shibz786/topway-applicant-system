"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { storage } from "@/lib/storage/adapter";
import { PIPELINE_STEPS } from "@/lib/business/tracking";
import { requestDatabankAssignment } from "./notifications";
import { runAction, ActionError, type ActionResult } from "./result";
import type { WorkerCategory, DestCountry } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// My Applications — candidates in the agent's current Placement, plus any
// with remarketingDate set on a prior Placement of theirs (CLAUDE.md: dual-
// agent visibility during a change of employer). Cards show photo, name,
// category badge, current pipeline stage OR probation status (whichever is
// more current — i.e. probation/milestone once departed, pipeline stage
// before that), dispute alert chip if active.
// ─────────────────────────────────────────────────────────────────

export type MyApplicationCard = Awaited<ReturnType<typeof listMyApplicationsInternal>>[number];

async function listMyApplicationsInternal(agentId: string) {
  const placements = await db.placement.findMany({
    where: { agentId, OR: [{ isCurrent: true }, { remarketingDate: { not: null } }] },
    include: {
      candidate: {
        include: {
          tracking: true,
          disputes: { where: { resolvedAt: null }, select: { id: true, type: true } },
          documents: { where: { type: "headshot" }, select: { r2Key: true }, take: 1 },
        },
      },
    },
  });

  return Promise.all(
    placements.map(async (p) => {
      const c = p.candidate;
      const currentStep = [...PIPELINE_STEPS]
        .reverse()
        .find((s) => c.tracking && (c.tracking as unknown as Record<string, Date | null>)[s.key]);
      const headshotKey = c.documents[0]?.r2Key;
      const headshotUrl = headshotKey ? await storage.createSignedDownloadUrl(headshotKey, 900) : null;

      return {
        candidateId: c.id,
        fullName: c.fullName,
        category: c.category,
        headshotUrl,
        applicationStatus: c.tracking?.applicationStatus ?? "ACTIVE",
        currentPipelineStep: currentStep?.label ?? null,
        departureDate: c.tracking?.departureDate ?? null,
        probationEndDate: c.tracking?.probationEndDate ?? null,
        contractMidDate: c.tracking?.contractMidDate ?? null,
        contractEndDate: c.tracking?.contractEndDate ?? null,
        hasActiveDispute: c.disputes.length > 0,
        activeDisputeTypes: c.disputes.map((d) => d.type),
        isRemarketing: !p.isCurrent && !!p.remarketingDate,
      };
    }),
  );
}

export async function listMyApplications(): Promise<ActionResult<MyApplicationCard[]>> {
  return runAction(async () => {
    const user = await requireSession({ role: "AGENT" });
    if (!user.agentId) return [];
    return listMyApplicationsInternal(user.agentId);
  });
}

// ─────────────────────────────────────────────────────────────────
// Databank — only reachable if agent.dataBankAccess. Browse opt-in
// candidates, filter by category/skills/destination.
// ─────────────────────────────────────────────────────────────────

export type DatabankFilters = {
  category?: WorkerCategory;
  skill?: string;
  destinationCountry?: DestCountry;
};

export type DatabankCard = Awaited<ReturnType<typeof listDatabankInternal>>[number];

async function listDatabankInternal(filters: DatabankFilters) {
  // The databank shows two overlapping groups (CLAUDE.md): candidates
  // explicitly opted in (inDatabank), and candidates who've become
  // "Remarketing Eligible" (ACTIVE, past contractMidDate, no active
  // dispute) even if never manually opted in — the Tracking View's
  // Remarketing Eligible tab and this listing share that exact rule, kept
  // as one OR clause so they can never drift apart.
  const eligibilityOr = [
    { inDatabank: true },
    {
      tracking: { applicationStatus: "ACTIVE" as const, contractMidDate: { lte: new Date() } },
      disputes: { none: { resolvedAt: null } },
    },
  ];

  const andConditions: Record<string, unknown>[] = [{ OR: eligibilityOr }];
  if (filters.category) andConditions.push({ category: filters.category });
  if (filters.skill) andConditions.push({ skills: { has: filters.skill } });
  if (filters.destinationCountry) {
    andConditions.push({ tracking: { destinationCountry: filters.destinationCountry } });
  }

  const rows = await db.candidate.findMany({
    where: { AND: andConditions },
    include: {
      tracking: true,
      documents: { where: { type: "headshot" }, select: { r2Key: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    rows.map(async (c) => {
      const headshotKey = c.documents[0]?.r2Key;
      const headshotUrl = headshotKey ? await storage.createSignedDownloadUrl(headshotKey, 900) : null;
      return {
        candidateId: c.id,
        fullName: c.fullName,
        category: c.category,
        skills: c.skills,
        destinationCountry: c.tracking?.destinationCountry ?? null,
        headshotUrl,
        isRemarketingEligible: !c.inDatabank,
      };
    }),
  );
}

export async function listDatabank(filters: DatabankFilters = {}): Promise<ActionResult<DatabankCard[]>> {
  return runAction(async () => {
    const user = await requireSession({ role: "AGENT" });
    if (!user.agentId) throw new ActionError("No agent profile");
    const agent = await db.agent.findUnique({ where: { id: user.agentId } });
    if (!agent?.dataBankAccess) throw new ActionError("Databank access is not enabled for your account");
    return listDatabankInternal(filters);
  });
}

export async function requestAssignment(candidateId: string): Promise<ActionResult<null>> {
  return requestDatabankAssignment(candidateId);
}

// Used by admin/staff to opt a candidate in or out of the shared databank.
export async function toggleCandidateDatabank(candidateId: string, inDatabank: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");
    await runAsActor(user, () => db.candidate.update({ where: { id: candidateId }, data: { inDatabank } }));
    return null;
  });
}
