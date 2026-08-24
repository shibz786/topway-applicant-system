"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { putOnHold, cancelApplication, resumeApplication } from "@/lib/actions/tracking";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ApplicationStatus } from "@prisma/client";

// Every action here is explicit and modal-confirmed, never a bare dropdown
// change (CLAUDE.md UI rule) — and "Put on Hold" blocks submission until a
// reason is typed.
export function StatusActions({
  candidateId,
  status,
  onChanged,
}: {
  candidateId: string;
  status: ApplicationStatus;
  onChanged: () => void;
}) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const holdMutation = useMutation({
    mutationFn: async () => {
      const res = await putOnHold({ candidateId, reason });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Application put on hold");
      setHoldOpen(false);
      setReason("");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await cancelApplication({ candidateId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Application cancelled");
      setCancelOpen(false);
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await resumeApplication({ candidateId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Application resumed");
      setResumeOpen(false);
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "ON_HOLD" && status !== "CANCELLED" && (
        <Button variant="outline" size="sm" onClick={() => setHoldOpen(true)}>
          Put on Hold
        </Button>
      )}
      {status !== "CANCELLED" && (
        <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
          Cancel
        </Button>
      )}
      {(status === "ON_HOLD" || status === "CANCELLED") && (
        <Button variant="outline" size="sm" onClick={() => setResumeOpen(true)}>
          Resume
        </Button>
      )}

      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put application on hold</DialogTitle>
            <DialogDescription>
              This candidate&apos;s status will change to On Hold. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hold-reason">Reason</Label>
            <Textarea
              id="hold-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this application being put on hold?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => holdMutation.mutate()}
              disabled={!reason.trim() || holdMutation.isPending}
            >
              {holdMutation.isPending ? "Saving…" : "Put on Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this application?</AlertDialogTitle>
            <AlertDialogDescription>
              Status will change to Cancelled. This is logged in the audit trail and can be
              reversed with Resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelMutation.mutate()}>Confirm Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume this application?</AlertDialogTitle>
            <AlertDialogDescription>
              Status will be restored to Active and any hold reason will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => resumeMutation.mutate()}>Confirm Resume</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
