"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBlacklist, type BlacklistEntry } from "@/lib/actions/blacklist";
import { WORKER_CATEGORY_LABELS } from "@/lib/business/tracking";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function BlacklistTable() {
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["blacklist"],
    queryFn: async () => {
      const res = await listBlacklist();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const filtered = (data ?? []).filter((e) => e.fullName.toLowerCase().includes(query.trim().toLowerCase()));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No disputes have been recorded. Nobody appears on the blacklist.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-xs"
      />
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {filtered.length} of {data.length} entries
      </p>
      <div className="space-y-3">
        {filtered.map((entry) => (
          <BlacklistCard key={entry.candidateId} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// Bottom-right of each dispute listing: which agent handled this candidate
// at the time, plus how to reach/verify them — the whole point of the
// portal per CLAUDE.md ("which agent handled the candidate... can help
// licence holders share information, support each other"). License/contact
// number are blank on older placements whose agent record predates these
// fields, not a bug.
function AgentAttribution({
  name,
  country,
  licenseNo,
  contactNo,
}: {
  name: string | null;
  country: string | null;
  licenseNo: string | null;
  contactNo: string | null;
}) {
  if (!name) {
    return <span className="text-xs text-muted-foreground">No agent on record</span>;
  }
  return (
    <div className="text-xs">
      <p className="font-medium text-foreground">
        {name}
        {country ? ` (${country})` : ""}
      </p>
      <p className="text-muted-foreground">License no: {licenseNo || "-"}</p>
      <p className="text-muted-foreground">Contact no: {contactNo || "-"}</p>
    </div>
  );
}

function BlacklistCard({ entry }: { entry: BlacklistEntry }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <p className="font-heading font-semibold">{entry.fullName}</p>
          <Badge variant="secondary" className="text-xs">
            {WORKER_CATEGORY_LABELS[entry.category]}
          </Badge>
          <span className="text-xs text-muted-foreground">{entry.nationality}</span>
        </div>
        <Badge
          className={cn(
            "border-0 text-xs",
            entry.hasUnresolvedDispute ? "bg-critical/15 text-critical" : "bg-warn/15 text-warn",
          )}
        >
          {entry.hasUnresolvedDispute ? "Open dispute" : "Resolved history"} · {entry.disputeCount}
        </Badge>
      </div>
      <div className="divide-y">
        {entry.disputes.map((d) => (
          <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.typeLabel}</span>
                {!d.resolvedAt && (
                  <span className="rounded-full border border-critical/40 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-critical uppercase">
                    Open
                  </span>
                )}
              </div>
              {d.notes && <p className="mt-0.5 text-xs text-muted-foreground">{d.notes}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <span className="font-mono text-[11px] text-muted-foreground">
                {new Date(d.createdAt).toLocaleDateString()}
              </span>
              <AgentAttribution
                name={d.agentName}
                country={d.agentCountry}
                licenseNo={d.agentLicenseNo}
                contactNo={d.agentContactNo}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
