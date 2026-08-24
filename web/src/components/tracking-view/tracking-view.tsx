"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCandidates, type CandidateListRow } from "@/lib/actions/candidates";
import {
  WORKER_CATEGORY_LABELS,
  DEST_COUNTRY_LABELS,
  deriveContractStage,
  isRemarketingEligible,
  type ContractStage,
} from "@/lib/business/tracking";
import type { SessionUser } from "@/lib/auth/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationStatusChip, DisputeChip } from "@/components/candidates/status-chip";
import { Badge } from "@/components/ui/badge";
import { CandidateDetailDialog } from "@/components/candidates/candidate-detail-dialog";

type TabKey = "WORK_IN_PROGRESS" | "PROBATION_COMPLETED" | "MID_CONTRACT" | "CONTRACT_CLOSED" | "REMARKETING" | "DISPUTE";

const TABS: { key: TabKey; label: string }[] = [
  { key: "WORK_IN_PROGRESS", label: "Work in Progress" },
  { key: "PROBATION_COMPLETED", label: "Probation Completed" },
  { key: "MID_CONTRACT", label: "Mid-Contract" },
  { key: "CONTRACT_CLOSED", label: "Contract Closed" },
  { key: "REMARKETING", label: "Remarketing Eligible" },
  { key: "DISPUTE", label: "Dispute Active" },
];

function matchesTab(row: CandidateListRow, tab: TabKey): boolean {
  const stage: ContractStage = deriveContractStage(row);
  switch (tab) {
    case "WORK_IN_PROGRESS":
    case "PROBATION_COMPLETED":
    case "MID_CONTRACT":
    case "CONTRACT_CLOSED":
      return stage === tab;
    case "REMARKETING":
      return isRemarketingEligible({
        applicationStatus: row.applicationStatus,
        contractMidDate: row.contractMidDate,
        hasActiveDispute: row.hasActiveDispute,
      });
    case "DISPUTE":
      return row.hasActiveDispute;
  }
}

// The Topway Staff Tracking View — post-departure tabs. Deliberately a
// separate page from /admin/candidates: that's the general ATS table for
// managing profiles; this is the operational view for what happens to a
// candidate after they've left (pipeline tabs 1-4 are mutually exclusive
// stages, the last two — Remarketing Eligible, Dispute Active — are
// cross-cutting, so a candidate can appear under both a stage tab and one
// of those at once).
export function TrackingView({ user }: { user: SessionUser }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const res = await listCandidates();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const rowsByTab = useMemo(() => {
    const departed = (data ?? []).filter((r) => r.departureDate);
    return Object.fromEntries(TABS.map((t) => [t.key, departed.filter((r) => matchesTab(r, t.key))])) as Record<
      TabKey,
      CandidateListRow[]
    >;
  }, [data]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="WORK_IN_PROGRESS">
        <TabsList className="h-auto flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              {t.label}
              <Badge variant="secondary" className="text-xs">
                {rowsByTab[t.key]?.length ?? 0}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="pt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Departed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && rowsByTab[t.key]?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No candidates in this view.
                      </TableCell>
                    </TableRow>
                  )}
                  {rowsByTab[t.key]?.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                      <TableCell className="font-medium">
                        {r.fullName}
                        {r.hasActiveDispute && (
                          <span className="ml-2 inline-block align-middle">
                            <DisputeChip label="Dispute" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{WORKER_CATEGORY_LABELS[r.category]}</Badge>
                      </TableCell>
                      <TableCell>{r.agentName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                      <TableCell>{r.destinationCountry ? DEST_COUNTRY_LABELS[r.destinationCountry] : "—"}</TableCell>
                      <TableCell>{r.departureDate ? new Date(r.departureDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        <ApplicationStatusChip status={r.applicationStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <CandidateDetailDialog
        candidateId={selectedId}
        user={user}
        open={!!selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
