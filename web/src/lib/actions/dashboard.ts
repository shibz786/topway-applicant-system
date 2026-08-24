"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { deriveContractStage, deriveMilestoneLabel, type ContractStage } from "@/lib/business/tracking";
import { getUnseenContractClosureNotifications } from "./notifications";
import { runAction, type ActionResult } from "./result";
import { Prisma } from "@prisma/client";

// The dashboard's whole reason to exist: answer "what needs me right now"
// before anything else, then give a one-glance read on where the agency's
// whole candidate roster sits, then get out of the way. Not a "you are
// logged in as X" bio card (which is what this route used to be — see
// CLAUDE.md's redesign entry). Two genuinely different shapes: ADMIN/STAFF
// get the agency-wide ops view (permission-gated per section, same flags
// the nav already uses to hide links), AGENT gets a light "your day"
// summary that points at the richer Agent Portal (/agent) rather than
// duplicating it.

function decimalToNumber(d: Prisma.Decimal | number): number {
  return typeof d === "number" ? d : d.toNumber();
}

// getUnseenContractClosureNotifications() also runs
// checkContractClosureNotifications() as a side effect — the dashboard is
// itself a legitimate "page load" per that function's own doc comment, so
// calling the public action (rather than reaching for its private
// internals) is the correct way to trigger it here too, not a shortcut.
// Degrades to "nothing unseen" rather than failing the whole dashboard if
// this one section has trouble.
async function unwrapUnseenClosures() {
  const res = await getUnseenContractClosureNotifications();
  return res.ok ? res.data : [];
}

const STAGE_LABELS: Record<ContractStage, string> = {
  PRE_DEPARTURE: "Documentation / pre-departure",
  WORK_IN_PROGRESS: "Departed, probation",
  PROBATION_COMPLETED: "Probation complete",
  MID_CONTRACT: "Mid-contract",
  CONTRACT_CLOSED: "Contract closed",
};
const STAGE_ORDER: ContractStage[] = [
  "PRE_DEPARTURE",
  "WORK_IN_PROGRESS",
  "PROBATION_COMPLETED",
  "MID_CONTRACT",
  "CONTRACT_CLOSED",
];

export type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  severity: "critical" | "warn";
  href: string;
};

export type ActivityItem = { id: string; label: string; detail: string; at: Date };

export type OpsDashboardData = {
  kind: "ops";
  kpis: {
    activeCandidates: number;
    onHoldCandidates: number;
    openDisputes: number;
    departedThisMonth: number;
    agentsCount: number | null;
    outstandingTotal: number | null;
    paidTotal: number | null;
    currency: string;
  };
  attention: AttentionItem[];
  pipeline: { key: ContractStage; label: string; count: number }[];
  activity: ActivityItem[];
  canManageAgents: boolean;
  canManageInvoices: boolean;
};

export type AgentDashboardData = {
  kind: "agent";
  myCandidatesCount: number;
  milestonesSoon: { candidateId: string; name: string; label: string }[];
  unseenNotifications: number;
  hasDatabankAccess: boolean;
};

export type DashboardData = OpsDashboardData | AgentDashboardData;

async function buildOpsDashboard(user: Awaited<ReturnType<typeof requireSession>>): Promise<OpsDashboardData> {
  const canManageAgents = user.role === "ADMIN" || user.permissions.agents;
  const canManageInvoices = user.role === "ADMIN" || user.permissions.invoices;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [trackingRows, openDisputeRows, agentsCount, unseenClosures, invoiceRows, recentCandidates, recentDisputes] =
    await Promise.all([
      db.tracking.findMany({
        select: {
          applicationStatus: true,
          departureDate: true,
          probationEndDate: true,
          contractMidDate: true,
          contractEndDate: true,
        },
      }),
      db.dispute.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { candidate: { select: { id: true, fullName: true } } },
      }),
      canManageAgents ? db.agent.count() : Promise.resolve(null),
      unwrapUnseenClosures(),
      canManageInvoices
        ? db.invoice.findMany({
            where: { status: { in: ["SENT", "DRAFT"] } },
            select: { id: true, number: true, status: true, totalAmount: true, currency: true, dueAt: true },
          })
        : Promise.resolve([]),
      db.candidate.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, fullName: true, createdAt: true },
      }),
      db.dispute.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { candidate: { select: { fullName: true } } },
      }),
    ]);

  const activeCandidates = trackingRows.filter((t) => t.applicationStatus === "ACTIVE").length;
  const onHoldCandidates = trackingRows.filter((t) => t.applicationStatus === "ON_HOLD").length;
  const departedThisMonth = trackingRows.filter(
    (t) => t.departureDate && t.departureDate.getTime() >= monthStart.getTime(),
  ).length;

  const pipelineCounts = new Map<ContractStage, number>(STAGE_ORDER.map((k) => [k, 0]));
  for (const t of trackingRows) {
    if (t.applicationStatus !== "ACTIVE") continue; // on-hold/cancelled aren't "in" the pipeline
    const stage = deriveContractStage(t);
    pipelineCounts.set(stage, (pipelineCounts.get(stage) ?? 0) + 1);
  }
  const pipeline = STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key], count: pipelineCounts.get(key) ?? 0 }));

  const attention: AttentionItem[] = [];
  for (const d of openDisputeRows) {
    attention.push({
      id: `dispute-${d.id}`,
      title: `${d.candidate.fullName}: ${d.type.replaceAll("_", " ").toLowerCase()}`,
      subtitle: `Reported ${relativeDay(d.createdAt)}`,
      severity: "critical",
      href: "/admin/candidates",
    });
  }
  if (unseenClosures.length > 0) {
    for (const n of unseenClosures.slice(0, 3)) {
      attention.push({
        id: `closure-${n.id}`,
        title: `${n.candidate.fullName}: contract closed`,
        subtitle: "Needs review acknowledgement",
        severity: "warn",
        href: "/admin/tracking",
      });
    }
  }
  const now = Date.now();
  const overdueInvoices = invoiceRows.filter((i) => i.status === "SENT" && i.dueAt && i.dueAt.getTime() < now);
  for (const inv of overdueInvoices.slice(0, 3)) {
    attention.push({
      id: `invoice-${inv.id}`,
      title: `Invoice #${inv.number} overdue`,
      subtitle: `${inv.currency} ${decimalToNumber(inv.totalAmount).toLocaleString()} · due ${relativeDay(inv.dueAt!)}`,
      severity: "warn",
      href: "/invoices",
    });
  }

  const outstandingTotal = canManageInvoices
    ? invoiceRows.filter((i) => i.status === "SENT").reduce((sum, i) => sum + decimalToNumber(i.totalAmount), 0)
    : null;
  // Paid total isn't in invoiceRows (only SENT/DRAFT fetched above) — a
  // second light query, only when the caller can see invoices at all.
  const paidTotal = canManageInvoices
    ? decimalToNumber(
        (await db.invoice.aggregate({ where: { status: "PAID" }, _sum: { totalAmount: true } }))._sum
          .totalAmount ?? 0,
      )
    : null;
  const currency = invoiceRows[0]?.currency ?? "USD";

  const activity: ActivityItem[] = [
    ...recentCandidates.map((c) => ({
      id: `cand-${c.id}`,
      label: "New candidate added",
      detail: c.fullName,
      at: c.createdAt,
    })),
    ...recentDisputes.map((d) => ({
      id: `disp-${d.id}`,
      label: "Dispute logged",
      detail: d.candidate.fullName,
      at: d.createdAt,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  return {
    kind: "ops",
    kpis: {
      activeCandidates,
      onHoldCandidates,
      openDisputes: openDisputeRows.length,
      departedThisMonth,
      agentsCount,
      outstandingTotal,
      paidTotal,
      currency,
    },
    attention: attention.slice(0, 6),
    pipeline,
    activity,
    canManageAgents,
    canManageInvoices,
  };
}

async function buildAgentDashboard(user: Awaited<ReturnType<typeof requireSession>>): Promise<AgentDashboardData> {
  if (!user.agentId) {
    return { kind: "agent", myCandidatesCount: 0, milestonesSoon: [], unseenNotifications: 0, hasDatabankAccess: false };
  }
  const [placements, unseen] = await Promise.all([
    db.placement.findMany({
      where: { agentId: user.agentId, OR: [{ isCurrent: true }, { remarketingDate: { not: null } }] },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            tracking: {
              select: { departureDate: true, probationEndDate: true, contractMidDate: true, contractEndDate: true },
            },
          },
        },
      },
    }),
    unwrapUnseenClosures(),
  ]);

  const milestonesSoon: { candidateId: string; name: string; label: string }[] = [];
  for (const p of placements) {
    if (!p.candidate.tracking) continue;
    const m = deriveMilestoneLabel(p.candidate.tracking);
    if (m.kind === "probation_in_progress" && m.daysRemaining <= 14) {
      milestonesSoon.push({
        candidateId: p.candidate.id,
        name: p.candidate.fullName,
        label: `Probation ends in ${m.daysRemaining}d`,
      });
    } else if (m.kind === "probation_complete" || m.kind === "mid_contract") {
      milestonesSoon.push({
        candidateId: p.candidate.id,
        name: p.candidate.fullName,
        label: m.kind === "probation_complete" ? "Probation complete" : "Mid-contract milestone",
      });
    }
  }

  return {
    kind: "agent",
    myCandidatesCount: placements.length,
    milestonesSoon: milestonesSoon.slice(0, 5),
    unseenNotifications: unseen.length,
    hasDatabankAccess: user.agentDataBankAccess,
  };
}

function relativeDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export async function getDashboardData(): Promise<ActionResult<DashboardData>> {
  return runAction(async () => {
    const user = await requireSession();
    return user.role === "AGENT" ? buildAgentDashboard(user) : buildOpsDashboard(user);
  });
}
