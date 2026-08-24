"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCandidates, type CandidateListRow } from "@/lib/actions/candidates";
import { listAgentsForInvoice } from "@/lib/actions/invoices";
import {
  WORKER_CATEGORY_LABELS,
  DEST_COUNTRY_LABELS,
  DISPUTE_TYPE_LABELS,
  deriveProbationStatus,
  deriveContractStage,
  type ContractStage,
} from "@/lib/business/tracking";
import type { DisputeType } from "@prisma/client";

// Row-level dispute chip shows the actual type/reason, not a generic
// "Dispute" label — the type is exactly what a staff member scanning the
// table needs to triage at a glance.
function disputeChipLabel(types: DisputeType[]): string {
  if (types.length === 0) return "Dispute";
  const label = DISPUTE_TYPE_LABELS[types[0]!];
  return types.length > 1 ? `${label} +${types.length - 1}` : label;
}
import type { SessionUser } from "@/lib/auth/session";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationStatusChip, DisputeChip, ProbationCompleteChip, ProbationInProgressChip } from "./status-chip";
import { CandidateDetailDialog } from "./candidate-detail-dialog";
import type { ApplicationStatus, DestCountry } from "@prisma/client";

const CONTRACT_STAGE_LABELS: Record<ContractStage, string> = {
  PRE_DEPARTURE: "Pre-departure",
  WORK_IN_PROGRESS: "Work in Progress",
  PROBATION_COMPLETED: "Probation Completed",
  MID_CONTRACT: "Mid-Contract",
  CONTRACT_CLOSED: "Contract Closed",
};

export function CandidateTable({ user }: { user: SessionUser }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["candidates", statusFilter, agentFilter, countryFilter],
    queryFn: async () => {
      const res = await listCandidates({
        status: statusFilter === "all" ? undefined : (statusFilter as ApplicationStatus),
        agentId: agentFilter === "all" ? undefined : agentFilter,
        destinationCountry: countryFilter === "all" ? undefined : (countryFilter as DestCountry),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["invoice-agents"],
    queryFn: async () => {
      const res = await listAgentsForInvoice();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: user.role !== "AGENT",
  });

  const rows = useMemo(() => {
    if (!data) return [];
    if (stageFilter === "all") return data;
    return data.filter((r) => deriveContractStage(r) === stageFilter);
  }, [data, stageFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Status"
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "ON_HOLD", label: "On Hold" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        {user.role !== "AGENT" && (
          <FilterSelect
            value={agentFilter}
            onChange={setAgentFilter}
            placeholder="Agent"
            options={(agents ?? []).map((a) => ({ value: a.id, label: a.companyName }))}
          />
        )}
        <FilterSelect
          value={countryFilter}
          onChange={setCountryFilter}
          placeholder="Destination"
          options={(Object.keys(DEST_COUNTRY_LABELS) as DestCountry[]).map((c) => ({
            value: c,
            label: DEST_COUNTRY_LABELS[c],
          }))}
        />
        <FilterSelect
          value={stageFilter}
          onChange={setStageFilter}
          placeholder="Contract stage"
          options={(Object.keys(CONTRACT_STAGE_LABELS) as ContractStage[]).map((s) => ({
            value: s,
            label: CONTRACT_STAGE_LABELS[s],
          }))}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No candidates match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <CandidateRow key={r.id} row={r} onClick={() => setSelectedId(r.id)} />
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

function CandidateRow({ row, onClick }: { row: CandidateListRow; onClick: () => void }) {
  const probation = deriveProbationStatus(row);
  return (
    <TableRow className="cursor-pointer transition-colors hover:bg-accent/40" onClick={onClick}>
      <TableCell>
        <Avatar className="h-8 w-8">
          {row.headshotUrl && <AvatarImage src={row.headshotUrl} alt={row.fullName} />}
          <AvatarFallback>{row.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </TableCell>
      <TableCell className="font-medium">
        {row.fullName}
        {row.hasActiveDispute && (
          <span className="ml-2 inline-block align-middle">
            <DisputeChip label={disputeChipLabel(row.activeDisputeTypes)} />
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{WORKER_CATEGORY_LABELS[row.category]}</Badge>
      </TableCell>
      <TableCell>
        {probation.kind === "complete" ? (
          <ProbationCompleteChip />
        ) : probation.kind === "in_progress" ? (
          <ProbationInProgressChip daysRemaining={probation.daysRemaining} />
        ) : (
          row.currentPipelineStep ?? <span className="text-muted-foreground">Not started</span>
        )}
      </TableCell>
      <TableCell>{row.agentName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
      <TableCell>{row.destinationCountry ? DEST_COUNTRY_LABELS[row.destinationCountry] : "—"}</TableCell>
      <TableCell>{row.departureDate ? new Date(row.departureDate).toLocaleDateString() : "—"}</TableCell>
      <TableCell>
        <ApplicationStatusChip status={row.applicationStatus} />
      </TableCell>
    </TableRow>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
