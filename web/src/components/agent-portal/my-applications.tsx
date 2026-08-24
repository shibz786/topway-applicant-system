"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyApplications, type MyApplicationCard } from "@/lib/actions/agent-portal";
import { WORKER_CATEGORY_LABELS, DISPUTE_TYPE_LABELS, deriveMilestoneLabel } from "@/lib/business/tracking";
import type { DisputeType } from "@prisma/client";

function disputeChipLabel(types: DisputeType[]): string {
  if (types.length === 0) return "Dispute";
  const label = DISPUTE_TYPE_LABELS[types[0]!];
  return types.length > 1 ? `${label} +${types.length - 1}` : label;
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationStatusChip, DisputeChip, MilestoneBadges } from "@/components/candidates/status-chip";
import { CandidateDetailDialog } from "@/components/candidates/candidate-detail-dialog";
import type { SessionUser } from "@/lib/auth/session";

export function MyApplications({ user }: { user: SessionUser }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-my-applications"],
    queryFn: async () => {
      const res = await listMyApplications();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  return (
    <div className="space-y-3">
      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No candidates assigned to you yet.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((c) => (
          <ApplicationCard key={c.candidateId} card={c} onClick={() => setSelectedId(c.candidateId)} />
        ))}
      </div>

      <CandidateDetailDialog
        candidateId={selectedId}
        user={user}
        open={!!selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}

function ApplicationCard({ card, onClick }: { card: MyApplicationCard; onClick: () => void }) {
  const milestone = deriveMilestoneLabel(card);

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onClick}>
      <CardContent className="flex gap-3 p-4">
        <Avatar className="h-14 w-14 shrink-0">
          {card.headshotUrl && <AvatarImage src={card.headshotUrl} alt={card.fullName} />}
          <AvatarFallback>{card.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{card.fullName}</p>
            {card.hasActiveDispute && <DisputeChip label={disputeChipLabel(card.activeDisputeTypes)} />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {WORKER_CATEGORY_LABELS[card.category]}
            </Badge>
            <ApplicationStatusChip status={card.applicationStatus} />
            {card.isRemarketing && (
              <Badge variant="outline" className="text-xs">
                Remarketing
              </Badge>
            )}
          </div>
          <div className="text-xs">
            {milestone.kind === "not_departed" ? (
              <span className="text-muted-foreground">
                {card.currentPipelineStep ? `Pipeline: ${card.currentPipelineStep}` : "Pipeline not started"}
              </span>
            ) : (
              <MilestoneBadges milestone={milestone} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
