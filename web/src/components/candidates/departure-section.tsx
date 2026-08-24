"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setDeparture } from "@/lib/actions/tracking";
import { setDepartureSchema, type SetDepartureInput } from "@/lib/validation/tracking";
import { DEST_COUNTRY_LABELS, deriveProbationStatus } from "@/lib/business/tracking";
import { ProbationCompleteChip, ProbationInProgressChip } from "./status-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import type { DestCountry } from "@prisma/client";

export function DepartureSection({
  candidateId,
  departureDate,
  destinationCountry,
  probationEndDate,
  contractMidDate,
  contractEndDate,
  canEdit,
  onChanged,
}: {
  candidateId: string;
  departureDate: Date | null;
  destinationCountry: DestCountry | null;
  probationEndDate: Date | null;
  contractMidDate: Date | null;
  contractEndDate: Date | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SetDepartureInput>({
    resolver: zodResolver(setDepartureSchema),
    defaultValues: {
      candidateId,
      departureDate: departureDate ? new Date(departureDate).toISOString().slice(0, 10) : "",
      destinationCountry: destinationCountry ?? "SAUDI_ARABIA",
    },
  });

  async function onSubmit(values: SetDepartureInput) {
    const res = await setDeparture(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Departure recorded — probation and contract dates computed automatically");
    setOpen(false);
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  const probationStatus = deriveProbationStatus({ departureDate, probationEndDate });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Departure & Destination</h3>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                {departureDate ? "Edit" : "Set Departure"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <DialogHeader>
                  <DialogTitle>Set departure & destination</DialogTitle>
                  <DialogDescription>
                    Both must be set together. Probation, mid-contract, and contract-end dates are
                    computed automatically from these — never entered manually.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="departureDate">Departure date</Label>
                  <Input id="departureDate" type="date" {...register("departureDate")} />
                  {errors.departureDate && (
                    <p className="text-sm text-destructive">{errors.departureDate.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Destination country</Label>
                  <Controller
                    control={control}
                    name="destinationCountry"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(DEST_COUNTRY_LABELS) as DestCountry[]).map((c) => (
                            <SelectItem key={c} value={c}>
                              {DEST_COUNTRY_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!departureDate ? (
        <p className="text-sm text-muted-foreground">Not yet departed.</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            Departed {new Date(departureDate).toLocaleDateString()} →{" "}
            {destinationCountry && DEST_COUNTRY_LABELS[destinationCountry]}
          </p>
          <div className="flex items-center gap-2">
            {probationStatus.kind === "complete" && <ProbationCompleteChip />}
            {probationStatus.kind === "in_progress" && (
              <ProbationInProgressChip daysRemaining={probationStatus.daysRemaining} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Mid-contract: {contractMidDate ? new Date(contractMidDate).toLocaleDateString() : "—"} · Contract
            end: {contractEndDate ? new Date(contractEndDate).toLocaleDateString() : "—"}
          </p>
        </div>
      )}
    </div>
  );
}
