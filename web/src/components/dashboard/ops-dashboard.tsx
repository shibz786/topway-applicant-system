"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData, type OpsDashboardData } from "@/lib/actions/dashboard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// The dashboard's whole job: what needs a decision right now, then where
// the whole roster stands, then what happened recently. Everything here
// reads real numbers off the DB — see lib/actions/dashboard.ts — nothing
// is a placeholder.
export function OpsDashboard({ name }: { name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await getDashboardData();
      if (!res.ok) throw new Error(res.error);
      if (res.data.kind !== "ops") throw new Error("unexpected dashboard shape");
      return res.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return <OpsDashboardBody name={name} data={data} />;
}

const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

function OpsDashboardBody({ name, data }: { name: string; data: OpsDashboardData }) {
  const totalAttentionCount = data.attention.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{today}</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-balance">
            {greeting()}, {name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalAttentionCount === 0
              ? "Nothing needs a decision today."
              : `${totalAttentionCount} item${totalAttentionCount === 1 ? "" : "s"} need${totalAttentionCount === 1 ? "s" : ""} a decision today.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/candidates/new" className={buttonish("outline")}>
            + Candidate
          </Link>
          {data.canManageInvoices && (
            <Link href="/invoices/new" className={buttonish("solid")}>
              + Invoice
            </Link>
          )}
        </div>
      </div>

      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:delay-[70ms] motion-safe:fill-mode-both">
        <Kpis data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:delay-[130ms] motion-safe:fill-mode-both">
          <AttentionCard items={data.attention} />
          <ActivityCard items={data.activity} />
        </div>
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:delay-[190ms] motion-safe:fill-mode-both">
          <PipelineCard pipeline={data.pipeline} />
          <QuickLinks canManageAgents={data.canManageAgents} canManageInvoices={data.canManageInvoices} />
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function buttonish(kind: "outline" | "solid") {
  return cn(
    "inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
    kind === "solid" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-card hover:bg-accent",
  );
}

function Kpis({ data }: { data: OpsDashboardData }) {
  const items: { label: string; value: string; sub?: string; tone?: "critical" }[] = [
    { label: "Active candidates", value: String(data.kpis.activeCandidates) },
    {
      label: "Open disputes",
      value: String(data.kpis.openDisputes),
      tone: data.kpis.openDisputes > 0 ? "critical" : undefined,
    },
    { label: "Departed this mo.", value: String(data.kpis.departedThisMonth) },
  ];
  if (data.canManageInvoices && data.kpis.outstandingTotal !== null) {
    items.push({
      label: "Outstanding",
      value: `${data.kpis.currency} ${data.kpis.outstandingTotal.toLocaleString()}`,
      sub: data.kpis.paidTotal ? `${data.kpis.currency} ${data.kpis.paidTotal.toLocaleString()} paid` : undefined,
    });
  }
  if (data.canManageAgents && data.kpis.agentsCount !== null) {
    items.push({ label: "Agents", value: String(data.kpis.agentsCount) });
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border bg-card sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="p-3.5 transition-colors hover:bg-accent/30">
          <p className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">{item.label}</p>
          <p
            className={cn(
              "mt-1.5 font-heading text-xl font-semibold tabular-nums",
              item.tone === "critical" && "text-critical",
            )}
          >
            {item.value}
          </p>
          {item.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function AttentionCard({ items }: { items: OpsDashboardData["attention"] }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h3 className="font-heading text-[15px] font-semibold">Needs attention</h3>
        <span className="font-mono text-[10.5px] text-muted-foreground">{items.length} entries</span>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">All clear — no open disputes, overdue invoices, or unreviewed closures.</p>
      ) : (
        <div>
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/50"
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", item.severity === "critical" ? "bg-critical" : "bg-warn")} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase",
                  item.severity === "critical" ? "border-critical/40 text-critical" : "border-warn/40 text-warn",
                )}
              >
                {item.severity === "critical" ? "Dispute" : "Review"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityCard({ items }: { items: OpsDashboardData["activity"] }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-b px-4 py-3">
        <h3 className="font-heading text-[15px] font-semibold">Recent activity</h3>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing recent.</p>
      ) : (
        <div className="px-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 border-b border-dashed py-2.5 text-sm last:border-b-0">
              <span className="w-16 shrink-0 font-mono text-[10.5px] text-muted-foreground">{relTime(item.at)}</span>
              <span>
                {item.label} — <span className="font-medium">{item.detail}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function relTime(d: Date): string {
  const date = new Date(d);
  const hrs = Math.floor((Date.now() - date.getTime()) / (60 * 60 * 1000));
  if (hrs < 1) return "now";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function PipelineCard({ pipeline }: { pipeline: OpsDashboardData["pipeline"] }) {
  const total = pipeline.reduce((s, p) => s + p.count, 0) || 1;
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h3 className="font-heading text-[15px] font-semibold">Register</h3>
        <span className="font-mono text-[10.5px] text-muted-foreground">{total} total</span>
      </div>
      <div className="px-4 py-2">
        {pipeline.map((stage) => {
          const done = stage.count > 0;
          return (
            <div key={stage.key} className="flex items-center gap-2.5 border-b border-dotted py-2 text-sm last:border-b-0">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  done ? "border-primary bg-primary/10 text-primary" : "border-border text-transparent",
                )}
              >
                ✓
              </span>
              <span className={cn("flex-1", done ? "text-foreground" : "text-muted-foreground")}>{stage.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{stage.count}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function QuickLinks({ canManageAgents, canManageInvoices }: { canManageAgents: boolean; canManageInvoices: boolean }) {
  const links = [
    { href: "/admin/candidates", label: "View candidates" },
    { href: "/admin/tracking", label: "Tracking board" },
    ...(canManageInvoices ? [{ href: "/invoices", label: "All invoices" }] : []),
    ...(canManageAgents ? [{ href: "/admin/agents", label: "Manage agents" }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-full border bg-card px-3.5 py-1.5 font-mono text-[11.5px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
