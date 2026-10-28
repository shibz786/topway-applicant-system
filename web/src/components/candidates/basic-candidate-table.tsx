"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCandidates } from "@/lib/actions/candidates";
import { ApplicationStatusChip, DisputeChip } from "./status-chip";
import { DISPUTE_TYPE_LABELS } from "@/lib/business/tracking";
import { CandidateDetailDialog } from "./candidate-detail-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/auth/session";
import type { ApplicationStatus, DisputeType } from "@prisma/client";

function disputeChipLabel(types: DisputeType[]): string {
  if (types.length === 0) return "Dispute";
  const label = DISPUTE_TYPE_LABELS[types[0]!];
  return types.length > 1 ? `${label} +${types.length - 1}` : label;
}

// C3/C4: Skilled & Technical / Professional Workforce get "their own
// candidate list" too, but a simpler one than Domestic/General's - no
// pipeline/departure/destination columns, since those modules don't have
// a visa pipeline the same way. Trade/skill stands in for "Category".
export function BasicCandidateTable({
  user,
  workforceModule,
}: {
  user: SessionUser;
  workforceModule: "SKILLED" | "PROFESSIONAL";
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["candidates", workforceModule, statusFilter],
    queryFn: async () => {
      const res = await listCandidates({
        workforceModule,
        status: statusFilter === "all" ? undefined : (statusFilter as ApplicationStatus),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) => r.fullName.toLowerCase().includes(q) || r.passportNumber.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or passport…"
          className="h-9 w-56"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Trade / Skill</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No candidates yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(r.id)}>
                <TableCell className="font-medium">
                  {r.fullName}
                  {r.hasActiveDispute && (
                    <span className="ml-2 inline-block">
                      <DisputeChip label={disputeChipLabel(r.activeDisputeTypes)} />
                    </span>
                  )}
                </TableCell>
                <TableCell>{r.nationality}</TableCell>
                <TableCell className="text-muted-foreground">{r.trade || "-"}</TableCell>
                <TableCell>
                  <ApplicationStatusChip status={r.applicationStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CandidateDetailDialog
        candidateId={selectedId}
        user={user}
        open={!!selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
