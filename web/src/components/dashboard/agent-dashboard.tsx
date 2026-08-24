"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData, type AgentDashboardData } from "@/lib/actions/dashboard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Deliberately light — the Agent Portal (/agent) is already the agent's
// real, well-built workspace (Phase 4/5: card UI, milestone badges,
// databank). This just orients them for the day and sends them there,
// rather than duplicating that portal's content in a second place.
export function AgentDashboard({ name }: { name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await getDashboardData();
      if (!res.ok) throw new Error(res.error);
      if (res.data.kind !== "agent") throw new Error("unexpected dashboard shape");
      return res.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return <AgentDashboardBody name={name} data={data} />;
}

function AgentDashboardBody({ name, data }: { name: string; data: AgentDashboardData }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <div>
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-balance">
          {greeting()}, {name.split(" ")[0]}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">My candidates</p>
          <p className="mt-1.5 font-heading text-2xl font-semibold tabular-nums">{data.myCandidatesCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">Unseen updates</p>
          <p className="mt-1.5 font-heading text-2xl font-semibold tabular-nums">{data.unseenNotifications}</p>
        </Card>
      </div>

      {data.milestonesSoon.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-heading text-[15px] font-semibold">Coming up</h3>
          </div>
          <div className="px-4">
            {data.milestonesSoon.map((m) => (
              <div key={m.candidateId} className="flex items-center justify-between border-b border-dashed py-2.5 text-sm last:border-b-0">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Link
        href="/agent"
        className="flex items-center justify-between rounded-lg border bg-card px-4 py-3.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
      >
        Go to My Applications
        <span aria-hidden>→</span>
      </Link>
      {data.hasDatabankAccess && (
        <p className="text-xs text-muted-foreground">
          You also have Databank access — remarketing-eligible candidates are waiting in the same portal.
        </p>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
