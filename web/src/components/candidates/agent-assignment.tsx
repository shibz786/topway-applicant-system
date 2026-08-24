"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignCandidateToAgent, unassignCandidate } from "@/lib/actions/agents";
import { listAgentsForInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AgentAssignment({
  candidateId,
  currentAgentName,
  onChanged,
}: {
  candidateId: string;
  currentAgentName: string | null;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: ["invoice-agents"],
    queryFn: async () => {
      const res = await listAgentsForInvoice();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await assignCandidateToAgent({ candidateId, agentId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Agent assignment updated");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const res = await unassignCandidate({ candidateId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Candidate unassigned");
      onChanged();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <h3 className="text-sm font-semibold">Agent</h3>
      <p className="text-sm text-muted-foreground">
        {currentAgentName ? `Currently assigned to ${currentAgentName}.` : "Not assigned to an agent."}
      </p>
      <div className="flex gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select agent…" />
          </SelectTrigger>
          <SelectContent>
            {agents?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.companyName} ({a.country})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!selected || assignMutation.isPending}
          onClick={() => assignMutation.mutate(selected)}
        >
          {currentAgentName ? "Reassign" : "Assign"}
        </Button>
        {currentAgentName && (
          <Button
            size="sm"
            variant="outline"
            disabled={unassignMutation.isPending}
            onClick={() => unassignMutation.mutate()}
          >
            Unassign
          </Button>
        )}
      </div>
    </div>
  );
}
