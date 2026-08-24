"use server";

import { db } from "@/lib/db";
import { requireSession, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { DISPUTE_TYPE_LABELS } from "@/lib/business/tracking";
import { runAction, type ActionResult } from "./result";
import type { DisputeType, WorkerCategory } from "@prisma/client";

// The blacklist portal, per the user's own framing: "when agents start
// using this platform, disputed candidates can be identified through the
// system, including which agent handled the candidate. This can help
// licence holders share information, support each other, and avoid
// repeated problems." Every company (agent) using the platform sees it —
// this is deliberately NOT a manually-curated list (no new "isBlacklisted"
// flag/model): it's derived straight from the Dispute records that already
// exist, same "derived, never manually set" philosophy as
// deriveContractStage()/isRemarketingEligible() in business/tracking.ts.
// A candidate with zero disputes never appears here at all.
//
// Access: ADMIN always; STAFF needs the `tracking` permission (the same
// flag that already gates dispute visibility in the Tracking View's
// "Dispute Active" tab — this isn't a new permission); every AGENT, no
// flag required — the whole point is every company using the platform can
// see this, not just databank-enabled ones.
function assertCanViewBlacklist(user: SessionUser): void {
  if (user.role === "ADMIN" || user.role === "AGENT") return;
  if (user.role === "STAFF" && user.permissions.tracking) return;
  throw new ForbiddenError("Missing permission: tracking");
}

export type BlacklistDisputeEntry = {
  id: string;
  type: DisputeType;
  typeLabel: string;
  notes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  agentName: string | null;
  agentCountry: string | null;
  agentLicenseNo: string | null;
  agentContactNo: string | null;
};

export type BlacklistEntry = {
  candidateId: string;
  fullName: string;
  nationality: string;
  category: WorkerCategory;
  passportNumber: string;
  idNumber: string | null;
  disputeCount: number;
  hasUnresolvedDispute: boolean;
  mostRecentAt: Date;
  disputes: BlacklistDisputeEntry[];
};

async function listBlacklistInternal(): Promise<BlacklistEntry[]> {
  const disputes = await db.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          nationality: true,
          category: true,
          passportNumber: true,
          idNumber: true,
          placements: {
            select: {
              startDate: true,
              endDate: true,
              agent: { select: { companyName: true, country: true, licenseNo: true, contactNo: true } },
            },
          },
        },
      },
    },
  });

  const byCandidate = new Map<string, BlacklistEntry>();
  for (const d of disputes) {
    const c = d.candidate;
    // Attribute the dispute to whichever placement was active when it was
    // reported — the whole point is "which agent handled the candidate" at
    // that specific moment, not just whoever has them now.
    const placement = c.placements.find(
      (p) => p.startDate.getTime() <= d.createdAt.getTime() && (!p.endDate || p.endDate.getTime() >= d.createdAt.getTime()),
    );

    const entry = byCandidate.get(c.id) ?? {
      candidateId: c.id,
      fullName: c.fullName,
      nationality: c.nationality,
      category: c.category,
      passportNumber: c.passportNumber,
      idNumber: c.idNumber,
      disputeCount: 0,
      hasUnresolvedDispute: false,
      mostRecentAt: d.createdAt,
      disputes: [],
    };

    entry.disputeCount += 1;
    if (!d.resolvedAt) entry.hasUnresolvedDispute = true;
    entry.disputes.push({
      id: d.id,
      type: d.type,
      typeLabel: DISPUTE_TYPE_LABELS[d.type],
      notes: d.notes,
      createdAt: d.createdAt,
      resolvedAt: d.resolvedAt,
      agentName: placement?.agent.companyName ?? null,
      agentCountry: placement?.agent.country ?? null,
      agentLicenseNo: placement?.agent.licenseNo ?? null,
      agentContactNo: placement?.agent.contactNo ?? null,
    });
    byCandidate.set(c.id, entry);
  }

  return [...byCandidate.values()].sort((a, b) => b.mostRecentAt.getTime() - a.mostRecentAt.getTime());
}

export async function listBlacklist(): Promise<ActionResult<BlacklistEntry[]>> {
  return runAction(async () => {
    const user = await requireSession();
    assertCanViewBlacklist(user);
    return listBlacklistInternal();
  });
}

export type BlacklistMatch = {
  candidateId: string;
  fullName: string;
  matchedOn: "passport" | "idNumber";
  disputeCount: number;
  hasUnresolvedDispute: boolean;
  mostRecentAgentName: string | null;
};

// Surfaced on the Profile Builder's personal-details step (per the user's
// request: "when a new application is made... it should appear that this
// candidate is blacklisted by xyz agent") so whoever is onboarding a
// candidate sees this before finishing the form, not buried on a separate
// portal they'd have to think to check. Matches on passport number OR ID
// number — a candidate can resurface under a renewed passport, so passport
// alone isn't enough to catch a repeat. A soft warning, not a hard block:
// re-onboarding a previously-disputed candidate can be a legitimate,
// informed decision, so this only informs, never prevents saving.
export async function checkBlacklistMatch(input: {
  passportNumber?: string;
  idNumber?: string;
  excludeCandidateId?: string;
}): Promise<ActionResult<BlacklistMatch[]>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const passportNumber = input.passportNumber?.trim();
    const idNumber = input.idNumber?.trim();
    const or: Record<string, unknown>[] = [];
    if (passportNumber) or.push({ passportNumber: { equals: passportNumber, mode: "insensitive" } });
    if (idNumber) or.push({ idNumber: { equals: idNumber, mode: "insensitive" } });
    if (or.length === 0) return [];

    const candidates = await db.candidate.findMany({
      where: {
        OR: or,
        ...(input.excludeCandidateId ? { id: { not: input.excludeCandidateId } } : {}),
      },
      select: {
        id: true,
        fullName: true,
        passportNumber: true,
        idNumber: true,
        disputes: {
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, resolvedAt: true },
        },
        placements: {
          select: { startDate: true, endDate: true, agent: { select: { companyName: true } } },
        },
      },
    });

    return candidates
      .filter((c) => c.disputes.length > 0)
      .map((c) => {
        const mostRecent = c.disputes[0];
        const placement = c.placements.find(
          (p) =>
            p.startDate.getTime() <= mostRecent.createdAt.getTime() &&
            (!p.endDate || p.endDate.getTime() >= mostRecent.createdAt.getTime()),
        );
        return {
          candidateId: c.id,
          fullName: c.fullName,
          matchedOn: (passportNumber && c.passportNumber.toLowerCase() === passportNumber.toLowerCase()
            ? "passport"
            : "idNumber") as "passport" | "idNumber",
          disputeCount: c.disputes.length,
          hasUnresolvedDispute: c.disputes.some((d) => !d.resolvedAt),
          mostRecentAgentName: placement?.agent.companyName ?? null,
        };
      });
  });
}
