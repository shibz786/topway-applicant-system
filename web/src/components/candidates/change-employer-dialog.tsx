"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { changeEmployer } from "@/lib/actions/agents";
import { listAgentsForInvoice } from "@/lib/actions/invoices";
import { changeEmployerSchema, type ChangeEmployerInput } from "@/lib/validation/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

// "Change of employer/house" — CLAUDE.md: a deliberate, reason-required
// event distinct from a quick reassignment. Closes the current Placement
// and opens a new one; optionally grants the former agent remarketing
// visibility (both agents then see the candidate).
export function ChangeEmployerDialog({
  candidateId,
  currentAgentId,
  onChanged,
}: {
  candidateId: string;
  currentAgentId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: ["invoice-agents"],
    queryFn: async () => {
      const res = await listAgentsForInvoice();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmployerInput>({
    resolver: zodResolver(changeEmployerSchema),
    defaultValues: {
      candidateId,
      newAgentId: "",
      changeReason: "",
      employerName: "",
      grantRemarketing: false,
    },
  });

  async function onSubmit(values: ChangeEmployerInput) {
    const res = await changeEmployer(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Employer changed");
    setOpen(false);
    reset();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  const otherAgents = agents?.filter((a) => a.id !== currentAgentId) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Change Employer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Change of Employer / House</DialogTitle>
            <DialogDescription>
              Closes the current placement and opens a new one with the selected agent. This is
              logged in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>New agent</Label>
            <Controller
              control={control}
              name="newAgentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.companyName} ({a.country})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.newAgentId && <p className="text-sm text-destructive">{errors.newAgentId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="employerName">New employer/house name (optional)</Label>
            <Input id="employerName" {...register("employerName")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="changeReason">Reason</Label>
            <Textarea id="changeReason" rows={3} {...register("changeReason")} />
            {errors.changeReason && <p className="text-sm text-destructive">{errors.changeReason.message}</p>}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="grantRemarketing" className="text-sm font-normal">
              Grant former agent remarketing visibility
            </Label>
            <Controller
              control={control}
              name="grantRemarketing"
              render={({ field }) => (
                <Switch id="grantRemarketing" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !currentAgentId}>
              {isSubmitting ? "Saving…" : "Confirm Change"}
            </Button>
          </DialogFooter>
          {!currentAgentId && (
            <p className="text-xs text-muted-foreground">
              This candidate has no current agent — use Assign instead of Change Employer.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
