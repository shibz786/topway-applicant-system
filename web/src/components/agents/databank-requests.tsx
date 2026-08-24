"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listDatabankRequests,
  approveDatabankRequest,
  dismissDatabankRequest,
} from "@/lib/actions/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const QUERY_KEY = ["databank-requests"];

// "Request assignment submits a notification to admin — not
// self-service" (CLAUDE.md) — this is where that notification actually
// gets acted on.
export function DatabankRequests() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await listDatabankRequests();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const approve = useMutation({
    mutationFn: async (input: { candidateId: string; agentId: string }) => {
      const res = await approveDatabankRequest(input);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Candidate assigned");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismiss = useMutation({
    mutationFn: async (input: { candidateId: string; agentId: string }) => {
      const res = await dismissDatabankRequest(input);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Request dismissed");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Databank Requests</CardTitle>
        <CardDescription>Agents requested assignment to these candidates — not self-service.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((r) => (
          <div key={r.notificationId} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>
              <strong>{r.agentCompanyName}</strong> requested <strong>{r.candidateName}</strong>
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => dismiss.mutate({ candidateId: r.candidateId, agentId: r.agentId })}
              >
                Dismiss
              </Button>
              <Button size="sm" onClick={() => approve.mutate({ candidateId: r.candidateId, agentId: r.agentId })}>
                Approve
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
