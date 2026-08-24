"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createDispute, resolveDispute } from "@/lib/actions/tracking";
import { createDisputeSchema, type CreateDisputeInput } from "@/lib/validation/tracking";
import { DISPUTE_TYPE_LABELS } from "@/lib/business/tracking";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import type { Dispute, DisputeType } from "@prisma/client";

export function DisputePanel({
  candidateId,
  disputes,
  canManage,
  onChanged,
}: {
  candidateId: string;
  disputes: Dispute[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDisputeInput>({
    resolver: zodResolver(createDisputeSchema),
    defaultValues: { candidateId, type: "OTHER", notes: "" },
  });

  const resolveMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      const res = await resolveDispute({ disputeId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Dispute resolved");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onSubmit(values: CreateDisputeInput) {
    const res = await createDispute(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Dispute logged");
    setOpen(false);
    reset();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  const active = disputes.filter((d) => !d.resolvedAt);
  const resolved = disputes.filter((d) => d.resolvedAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Disputes</h3>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                + Log Dispute
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <DialogHeader>
                  <DialogTitle>Log a dispute</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller
                    control={control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(DISPUTE_TYPE_LABELS) as DisputeType[])
                            .filter((t) => t !== "NONE")
                            .map((t) => (
                              <SelectItem key={t} value={t}>
                                {DISPUTE_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dispute-notes">Notes</Label>
                  <Textarea id="dispute-notes" rows={3} {...register("notes")} />
                  {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Log Dispute"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {disputes.length === 0 && <p className="text-sm text-muted-foreground">No disputes on record.</p>}

      {active.map((d) => (
        <div key={d.id} className="flex items-center justify-between rounded-md border border-critical/25 bg-critical/10 p-2">
          <div>
            <Badge className="border-0 bg-critical/15 text-critical">{DISPUTE_TYPE_LABELS[d.type]}</Badge>
            {d.notes && <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p>}
          </div>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate(d.id)}>
              Resolve
            </Button>
          )}
        </div>
      ))}

      {resolved.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Resolved</p>
          {resolved.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm opacity-70">
              <Badge variant="outline">{DISPUTE_TYPE_LABELS[d.type]}</Badge>
              <span className="text-xs text-muted-foreground">
                Resolved {d.resolvedAt && new Date(d.resolvedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
