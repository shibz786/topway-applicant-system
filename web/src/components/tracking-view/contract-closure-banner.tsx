"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUnseenContractClosureNotifications,
  markNotificationSeen,
} from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";

// Staff/admin version of the contract-closure notification — CLAUDE.md is
// explicit these read differently: agents get a one-time popup (see
// ContractClosureModal in the Agent Portal), staff get "a banner, then
// dismiss. Never repeat." Same underlying Notification rows (userId-scoped,
// not role-scoped), same seenAt-based one-time semantics — just a
// dismissible strip instead of a blocking dialog, since staff review many
// candidates per session and shouldn't be interrupted per-candidate.
export function ContractClosureBanner() {
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

  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      {data.map((n) => (
        <div
          key={n.id}
          className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <span>
            <strong>{n.candidate.fullName}</strong>&apos;s contract has reached its end date.
          </span>
          <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(n.id)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}
