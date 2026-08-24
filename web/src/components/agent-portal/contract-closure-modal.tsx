"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUnseenContractClosureNotifications,
  markNotificationSeen,
} from "@/lib/actions/notifications";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// One-time popup on next login after contractEndDate passes — fires only
// once per candidate per agent, tracked via Notification.seenAt
// (CLAUDE.md). Dismissing marks it seen; it never reappears after that.
export function ContractClosureModal() {
  const queryClient = useQueryClient();
  const queryKey = ["contract-closure-notifications"];

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getUnseenContractClosureNotifications();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const dismiss = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await markNotificationSeen(notificationId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const current = data?.[0];
  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss.mutate(current.id)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contract Closed</DialogTitle>
          <DialogDescription>
            {current.candidate.fullName}&apos;s 2-year contract has reached its end date.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => dismiss.mutate(current.id)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
