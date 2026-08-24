"use client";

import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCandidate } from "@/lib/actions/candidates";
import { setPipelineDate } from "@/lib/actions/tracking";
import { toggleCandidateDatabank } from "@/lib/actions/agent-portal";
import { WORKER_CATEGORY_LABELS, type PipelineStepKey } from "@/lib/business/tracking";
import type { SessionUser } from "@/lib/auth/session";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ApplicationStatusChip } from "./status-chip";
import { PipelineStepper } from "./pipeline-stepper";
import { StatusActions } from "./status-actions";
import { DisputePanel } from "./dispute-panel";
import { DocumentUpload } from "./document-upload";
import { DepartureSection } from "./departure-section";
import { AuditLogView } from "./audit-log-view";
import { AgentAssignment } from "./agent-assignment";
import { ChangeEmployerDialog } from "./change-employer-dialog";

// A centered popup, not a side sheet (the user's explicit call after
// reviewing the redesign directions) — a candidate record is something you
// stop and read/act on, not a drawer you keep the rest of the table
// visible behind. Same shadcn Dialog primitive every other modal in the
// app already uses (StatusActions' confirmations, ChangeEmployerDialog),
// just widened and given its own internal scroll for a record this dense.
export function CandidateDetailDialog({
  candidateId,
  user,
  open,
  onOpenChange,
}: {
  candidateId: string | null;
  user: SessionUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["candidate", candidateId];

  const { data: candidate, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getCandidate(candidateId!);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!candidateId && open,
  });

  const pipelineMutation = useMutation({
    mutationFn: async (input: { step: PipelineStepKey; date: string | null }) => {
      const res = await setPipelineDate({ candidateId: candidateId!, ...input });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Pipeline updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  const databankMutation = useMutation({
    mutationFn: async (inDatabank: boolean) => {
      const res = await toggleCandidateDatabank(candidateId!, inDatabank);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Databank listing updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canEditProfile = user.role === "ADMIN" || user.permissions.applications;
  const canEditTracking = user.role === "ADMIN" || user.permissions.tracking;
  const isAgent = user.role === "AGENT";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-full max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
        {isLoading && (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}
        {candidate && (
          <>
            <DialogHeader className="border-b bg-muted/40 px-6 py-4">
              <DialogTitle className="flex items-center gap-2 text-lg">
                {candidate.fullName}
                {candidate.tracking && <ApplicationStatusChip status={candidate.tracking.applicationStatus} />}
              </DialogTitle>
              <DialogDescription>
                {candidate.nationality} · {WORKER_CATEGORY_LABELS[candidate.category]}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 pb-6">
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/candidates/${candidate.id}/pdf`} target="_blank" rel="noreferrer">
                    View PDF
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/candidates/${candidate.id}/pdf?download=1`}>Download PDF</a>
                </Button>
                {canEditProfile && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/candidates/${candidate.id}/edit`}>Edit Profile</Link>
                  </Button>
                )}
              </div>

              {!isAgent && candidate.tracking && (
                <div className="flex flex-wrap gap-2">
                  <StatusActions
                    candidateId={candidate.id}
                    status={candidate.tracking.applicationStatus}
                    onChanged={refresh}
                  />
                </div>
              )}
              {candidate.tracking?.applicationStatus === "ON_HOLD" && candidate.tracking.onHoldReason && (
                <p className="rounded-md bg-warn/10 p-2 text-xs text-warn">
                  On hold: {candidate.tracking.onHoldReason}
                </p>
              )}

              <Separator />

              {(user.role === "ADMIN" || user.permissions.agents) && (
                <div className="space-y-2">
                  <AgentAssignment
                    candidateId={candidate.id}
                    currentAgentName={candidate.placements.find((p) => p.isCurrent)?.agent.companyName ?? null}
                    onChanged={refresh}
                  />
                  <ChangeEmployerDialog
                    candidateId={candidate.id}
                    currentAgentId={candidate.placements.find((p) => p.isCurrent)?.agent.id ?? null}
                    onChanged={refresh}
                  />
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">Visa Pipeline</h3>
                <PipelineStepper
                  tracking={candidate.tracking ?? {}}
                  onSetDate={
                    canEditTracking && !isAgent
                      ? (step, date) => pipelineMutation.mutate({ step, date })
                      : undefined
                  }
                />
              </div>

              <DepartureSection
                candidateId={candidate.id}
                departureDate={candidate.tracking?.departureDate ?? null}
                destinationCountry={candidate.tracking?.destinationCountry ?? null}
                probationEndDate={candidate.tracking?.probationEndDate ?? null}
                contractMidDate={candidate.tracking?.contractMidDate ?? null}
                contractEndDate={candidate.tracking?.contractEndDate ?? null}
                canEdit={canEditTracking && !isAgent}
                onChanged={refresh}
              />

              <Tabs defaultValue="profile">
                <TabsList className="w-full">
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="disputes">Disputes</TabsTrigger>
                  <TabsTrigger value="placements">Placements</TabsTrigger>
                  {user.role === "ADMIN" && <TabsTrigger value="audit">Audit Log</TabsTrigger>}
                </TabsList>

                <TabsContent value="profile" className="space-y-2 text-sm">
                  <Field label="Passport No." value={candidate.passportNumber} />
                  <Field label="Passport Expiry" value={new Date(candidate.passportExpiry).toLocaleDateString()} />
                  <Field label="Date of Birth" value={new Date(candidate.dateOfBirth).toLocaleDateString()} />
                  {candidate.religion && <Field label="Religion" value={candidate.religion} />}
                  {candidate.phone && <Field label="Phone" value={candidate.phone} />}
                  {candidate.address && <Field label="Address" value={candidate.address} />}
                  <Field label="Years Experience" value={String(candidate.yearsExperience)} />
                  <Field label="Contract Duration" value={`${candidate.contractDuration} months`} />
                  <Field label="Skills" value={candidate.skills.join(", ") || "-"} />
                  <Field label="Languages" value={candidate.languages.join(", ") || "-"} />

                  {canEditProfile && !isAgent && (
                    <div className="flex items-center justify-between rounded-md border p-2 pt-2">
                      <Label htmlFor="databank-toggle" className="text-sm font-normal">
                        Opt into shared databank
                      </Label>
                      <Switch
                        id="databank-toggle"
                        checked={candidate.inDatabank}
                        onCheckedChange={(v) => databankMutation.mutate(v)}
                      />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="documents">
                  <DocumentUpload candidateId={candidate.id} canEdit={canEditProfile && !isAgent} />
                </TabsContent>

                <TabsContent value="disputes">
                  <DisputePanel
                    candidateId={candidate.id}
                    disputes={candidate.disputes}
                    canManage={canEditTracking && !isAgent}
                    onChanged={refresh}
                  />
                </TabsContent>

                <TabsContent value="placements" className="space-y-2">
                  {candidate.placements.length === 0 && (
                    <p className="text-sm text-muted-foreground">No placement history.</p>
                  )}
                  {candidate.placements.map((p) => (
                    <div key={p.id} className="rounded-md border p-2 text-sm">
                      <p className="font-medium">
                        {p.agent.companyName} ({p.agent.country}){" "}
                        {p.isCurrent && <span className="text-xs text-primary">(current)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.startDate).toLocaleDateString()} –{" "}
                        {p.endDate ? new Date(p.endDate).toLocaleDateString() : "present"}
                      </p>
                      {p.changeReason && <p className="text-xs text-muted-foreground">{p.changeReason}</p>}
                      {p.remarketingDate && (
                        <p className="text-xs text-primary">
                          Remarketing visibility granted {new Date(p.remarketingDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {user.role === "ADMIN" && (
                  <TabsContent value="audit">
                    <AuditLogView candidateId={candidate.id} />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 text-xs uppercase text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
