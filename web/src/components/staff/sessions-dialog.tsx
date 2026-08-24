"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listSessionsForUser, revokeSession, revokeAllSessionsForUser } from "@/lib/actions/sessions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function SessionsDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["sessions", userId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listSessionsForUser(userId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: open,
  });

  const revokeOne = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await revokeSession(sessionId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const res = await revokeAllSessionsForUser(userId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("All sessions revoked");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Active sessions: {userName}</DialogTitle>
          <DialogDescription>
            Revoking a session deletes it immediately; any request replaying that token gets 401
            right away.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No active sessions.</p>}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <p>{s.ipAddress ?? "Unknown IP"}</p>
                <p className="text-xs text-muted-foreground">
                  Created {formatDistanceToNow(s.createdAt, { addSuffix: true })} · expires{" "}
                  {formatDistanceToNow(s.expiresAt, { addSuffix: true })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => revokeOne.mutate(s.id)}
                disabled={revokeOne.isPending}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>

        {data && data.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            Revoke all sessions
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
