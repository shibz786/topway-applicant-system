import type { DestCountry, ApplicationStatus, DisputeType } from "@prisma/client";

// Probation rules, stored in code per CLAUDE.md ("not a DB table").
export const PROBATION_DAYS: Record<DestCountry, number> = {
  SAUDI_ARABIA: 90,
  KUWAIT: 180,
  OMAN: 180,
  QATAR: 270,
};

export const DEST_COUNTRY_LABELS: Record<DestCountry, string> = {
  SAUDI_ARABIA: "Saudi Arabia",
  KUWAIT: "Kuwait",
  OMAN: "Oman",
  QATAR: "Qatar",
};

export const WORKER_CATEGORY_LABELS = {
  FIRST_TIMER: "First Timer",
  EXPERIENCED: "Experienced",
  CONTRACTED: "Contracted",
} as const;

export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  NONE: "None",
  RUNAWAY: "Runaway",
  REFUSAL_TO_WORK: "Refusal to Work",
  MEDICALLY_UNFIT: "Medically Unfit",
  OTHER: "Other",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Departure date + destination country must always be set together
// (CLAUDE.md business logic). Called on save of departureDate — computes
// and returns the three derived milestone dates for storage.
export function computeDepartureMilestones(
  departureDate: Date,
  destinationCountry: DestCountry,
  contractDurationMonths: number,
): { probationEndDate: Date; contractMidDate: Date; contractEndDate: Date } {
  const probationDays = PROBATION_DAYS[destinationCountry];
  const probationEndDate = new Date(departureDate.getTime() + probationDays * DAY_MS);
  const contractMidDate = new Date(departureDate.getTime() + 365 * DAY_MS);

  const contractEndDate = new Date(departureDate);
  contractEndDate.setMonth(contractEndDate.getMonth() + (contractDurationMonths || 24));

  return { probationEndDate, contractMidDate, contractEndDate };
}

export type ProbationStatus =
  | { kind: "not_departed" }
  | { kind: "in_progress"; daysRemaining: number }
  | { kind: "complete" };

// Derived, never manually set (CLAUDE.md).
export function deriveProbationStatus(tracking: {
  departureDate: Date | null;
  probationEndDate: Date | null;
}): ProbationStatus {
  if (!tracking.departureDate || !tracking.probationEndDate) return { kind: "not_departed" };
  const now = Date.now();
  if (now >= tracking.probationEndDate.getTime()) return { kind: "complete" };
  const daysRemaining = Math.ceil((tracking.probationEndDate.getTime() - now) / DAY_MS);
  return { kind: "in_progress", daysRemaining };
}

// Named to match the Topway Staff Tracking View's tab labels literally
// (CLAUDE.md Phase 5: "Work in Progress / Probation Completed /
// Mid-Contract / Contract Closed"). Originally named PROBATION/MID_CONTRACT/
// APPROACHING_END/CLOSED in Phase 3 before Phase 5's tab spec made clear
// that naming didn't match — renamed once, here, rather than carrying two
// different vocabularies for the same four stages.
export type ContractStage =
  | "PRE_DEPARTURE"
  | "WORK_IN_PROGRESS"
  | "PROBATION_COMPLETED"
  | "MID_CONTRACT"
  | "CONTRACT_CLOSED";

// Used by the ATS table's "contract stage" filter and the Tracking View's
// first four tabs. ("Remarketing Eligible" and "Dispute Active", the
// Tracking View's other two tabs, are cross-cutting attributes handled by
// isRemarketingEligible() and a plain hasActiveDispute check — a candidate
// can be e.g. both MID_CONTRACT and Dispute Active at once, so they aren't
// part of this mutually-exclusive stage enum.)
export function deriveContractStage(tracking: {
  departureDate: Date | null;
  probationEndDate: Date | null;
  contractMidDate: Date | null;
  contractEndDate: Date | null;
}): ContractStage {
  if (!tracking.departureDate) return "PRE_DEPARTURE";
  const now = Date.now();
  if (tracking.contractEndDate && now >= tracking.contractEndDate.getTime()) return "CONTRACT_CLOSED";
  if (tracking.contractMidDate && now >= tracking.contractMidDate.getTime()) return "MID_CONTRACT";
  if (tracking.probationEndDate && now >= tracking.probationEndDate.getTime()) return "PROBATION_COMPLETED";
  return "WORK_IN_PROGRESS";
}

// Remarketing eligibility, derived, never manually set (CLAUDE.md):
// applicationStatus ACTIVE, contractMidDate has passed, no active
// (unresolved) dispute.
export function isRemarketingEligible(candidate: {
  applicationStatus: ApplicationStatus;
  contractMidDate: Date | null;
  hasActiveDispute: boolean;
}): boolean {
  if (candidate.applicationStatus !== "ACTIVE") return false;
  if (candidate.hasActiveDispute) return false;
  if (!candidate.contractMidDate) return false;
  return Date.now() >= candidate.contractMidDate.getTime();
}

// Agent Portal card text, exactly per spec: "Probation in progress (X days
// remaining)" / "Probation complete" / "Mid-contract milestone" /
// "Contract/Agreement Closed". Distinct from deriveContractStage (which
// drives the admin table's filter) because the portal can show BOTH a
// probation state AND a milestone badge at once — probation usually
// completes well before the 1-year mid-contract mark.
export type MilestoneLabel =
  | { kind: "not_departed" }
  | { kind: "probation_in_progress"; daysRemaining: number }
  | { kind: "probation_complete" }
  | { kind: "mid_contract" }
  | { kind: "contract_closed" };

export function deriveMilestoneLabel(tracking: {
  departureDate: Date | null;
  probationEndDate: Date | null;
  contractMidDate: Date | null;
  contractEndDate: Date | null;
}): MilestoneLabel {
  if (!tracking.departureDate) return { kind: "not_departed" };
  const now = Date.now();

  if (tracking.contractEndDate && now >= tracking.contractEndDate.getTime()) {
    return { kind: "contract_closed" };
  }
  if (tracking.contractMidDate && now >= tracking.contractMidDate.getTime()) {
    return { kind: "mid_contract" };
  }
  if (tracking.probationEndDate) {
    if (now >= tracking.probationEndDate.getTime()) return { kind: "probation_complete" };
    const daysRemaining = Math.ceil((tracking.probationEndDate.getTime() - now) / DAY_MS);
    return { kind: "probation_in_progress", daysRemaining };
  }
  return { kind: "not_departed" };
}

export const PIPELINE_STEPS = [
  { key: "musanedDate", label: "Musaned" },
  { key: "enjazDate", label: "Enjaz" },
  { key: "bureauDate", label: "Bureau" },
  { key: "wakalahDate", label: "Wakalah" },
  { key: "embassyDate", label: "Embassy" },
  { key: "paymentDate", label: "Payment" },
] as const;

export type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];
