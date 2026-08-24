import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

// CLAUDE.md UI rule: "Status is encoded in chips with semantic color:
// Active=neutral, On Hold=amber, Cancelled=muted/strikethrough,
// Dispute=red, Probation Complete=green. Color-blind safe — include a
// label in every chip, not color alone." Every chip here carries text, not
// just a color swatch.

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  ACTIVE: "bg-secondary text-secondary-foreground",
  ON_HOLD: "bg-warn/15 text-warn",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
};

export function ApplicationStatusChip({ status }: { status: ApplicationStatus }) {
  return <Badge className={cn("border-0", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</Badge>;
}

export function DisputeChip({ label }: { label: string }) {
  return <Badge className="border-0 bg-critical/15 text-critical">⚠ {label}</Badge>;
}

export function ProbationCompleteChip() {
  return <Badge className="border-0 bg-good/15 text-good">Probation Complete</Badge>;
}

export function ProbationInProgressChip({ daysRemaining }: { daysRemaining: number }) {
  return <Badge variant="outline">Probation in progress ({daysRemaining}d left)</Badge>;
}

export function MidContractChip() {
  return <Badge variant="secondary">Mid-contract milestone</Badge>;
}

export function ContractClosedChip() {
  return <Badge className="border-0 bg-accent text-accent-foreground">Contract/Agreement Closed</Badge>;
}

// Renders whichever milestone badges apply per CLAUDE.md's Agent Portal
// spec: "Probation in progress (X days remaining)" or "Probation
// complete", plus "Mid-contract milestone" at +1yr / "Contract/Agreement
// Closed" at +2yr — these can show together (probation usually finishes
// well before the 1-year mark).
export function MilestoneBadges({
  milestone,
}: {
  milestone: import("@/lib/business/tracking").MilestoneLabel;
}) {
  switch (milestone.kind) {
    case "not_departed":
      return null;
    case "probation_in_progress":
      return <ProbationInProgressChip daysRemaining={milestone.daysRemaining} />;
    case "probation_complete":
      return <ProbationCompleteChip />;
    case "mid_contract":
      return <MidContractChip />;
    case "contract_closed":
      return <ContractClosedChip />;
  }
}
