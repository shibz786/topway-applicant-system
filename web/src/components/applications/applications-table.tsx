"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCandidates } from "@/lib/actions/candidates";
import { listAgentsForInvoice } from "@/lib/actions/invoices";
import { WORKFORCE_MODULE_LABELS, type WorkforceModule } from "@/lib/validation/candidate";
import { DISPUTE_TYPE_LABELS } from "@/lib/business/tracking";
import { ApplicationStatusChip, DisputeChip } from "@/components/candidates/status-chip";
import { CandidateDetailDialog } from "@/components/candidates/candidate-detail-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/auth/session";
import type { ApplicationStatus, DisputeType } from "@prisma/client";

function disputeChipLabel(types: DisputeType[]): string {
  if (types.length === 0) return "Dispute";
  const label = DISPUTE_TYPE_LABELS[types[0]!];
  return types.length > 1 ? `${label} +${types.length - 1}` : label;
}

// D1: "view, search and filter every application across all 4 categories
// (by category, status, nationality, agent and date), with correct role-
// based access. Agents only see what they're allowed to see." Reuses
// listCandidates() directly (the same action every per-module list and
// the Tracking View already use) rather than a parallel query, so this
// view can never disagree with the module-scoped lists about what a
// candidate's status is - the explicit lesson CLAUDE.md's Phase 5 entry
// already learned once for the Tracking View.
export function ApplicationsTable({ user }: { user: SessionUser }) {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [nationality, setNationality] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["applications", moduleFilter, statusFilter, agentFilter, nationality],
    queryFn: async () => {
      const res = await listCandidates({
        workforceModule: moduleFilter === "all" ? undefined : (moduleFilter as WorkforceModule),
        status: statusFilter === "all" ? undefined : (statusFilter as ApplicationStatus),
        agentId: agentFilter === "all" ? undefined : agentFilter,
        nationality: nationality.trim() || undefined,
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
        <Input
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          placeholder="Nationality…"
          className="h-9 w-40"
        />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(WORKFORCE_MODULE_LABELS) as WorkforceModule[]).map((m) => (
              <SelectItem key={m} value={m}>
                {WORKFORCE_MODULE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {user.role !== "AGENT" && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {rows.length} {rows.length === 1 ? "application" : "applications"}
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No applications match these filters.
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
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {WORKFORCE_MODULE_LABELS[r.workforceModule as WorkforceModule]}
                  </Badge>
                </TableCell>
                <TableCell>{r.nationality}</TableCell>
                <TableCell>{r.agentName ?? "Unassigned"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString()}
                </TableCell>
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
