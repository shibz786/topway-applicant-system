"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listSessionsForUser, revokeSession, revokeAllSessionsForUser } from "@/lib/actions/sessions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

// Self-service session management — CLAUDE.md: "Revoke sessions: Admin any
// user, Staff/Agent own only." listSessionsForUser/revokeSession already
// allow "your own" regardless of role, so this works unchanged for every
// signed-in user; admins additionally get the full per-user view from the
// Staff/Agent management pages.
export function MySessionsCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["sessions", userId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listSessionsForUser(userId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
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

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await revokeAllSessionsForUser(userId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Signed out everywhere — you'll need to sign in again here too");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Sessions</CardTitle>
        <CardDescription>Devices currently signed in as you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data?.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <div>
              <p>{s.ipAddress ?? "Unknown IP"}</p>
              <p className="text-xs text-muted-foreground">
                Signed in {formatDistanceToNow(s.createdAt, { addSuffix: true })} · expires{" "}
                {formatDistanceToNow(s.expiresAt, { addSuffix: true })}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => revokeOne.mutate(s.id)} disabled={revokeOne.isPending}>
              Revoke
            </Button>
          </div>
        ))}
        {data && data.length > 1 && (
          <Button size="sm" variant="destructive" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
            Sign out everywhere
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
