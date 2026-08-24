"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { listDatabank, requestAssignment } from "@/lib/actions/agent-portal";
import { WORKER_CATEGORY_LABELS, DEST_COUNTRY_LABELS } from "@/lib/business/tracking";
import { SKILL_OPTIONS } from "@/lib/validation/candidate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkerCategory, DestCountry } from "@prisma/client";

export function DatabankBrowser() {
  const [category, setCategory] = useState<string>("all");
  const [skill, setSkill] = useState<string>("all");
  const [destination, setDestination] = useState<string>("all");
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["agent-databank", category, skill, destination],
    queryFn: async () => {
      const res = await listDatabank({
        category: category === "all" ? undefined : (category as WorkerCategory),
        skill: skill === "all" ? undefined : skill,
        destinationCountry: destination === "all" ? undefined : (destination as DestCountry),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await requestAssignment(candidateId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: (_data, candidateId) => {
      toast.success("Request sent to admin");
      setRequested((prev) => new Set(prev).add(candidateId));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(Object.keys(WORKER_CATEGORY_LABELS) as WorkerCategory[]).map((c) => (
              <SelectItem key={c} value={c}>
                {WORKER_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={skill} onValueChange={setSkill}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Skill" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skills</SelectItem>
            {SKILL_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Destination" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All destinations</SelectItem>
            {(Object.keys(DEST_COUNTRY_LABELS) as DestCountry[]).map((c) => (
              <SelectItem key={c} value={c}>
                {DEST_COUNTRY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No candidates in the databank match these filters.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((c) => (
          <Card key={c.candidateId}>
            <CardContent className="flex gap-3 p-4">
              <Avatar className="h-14 w-14 shrink-0">
                {c.headshotUrl && <AvatarImage src={c.headshotUrl} alt={c.fullName} />}
                <AvatarFallback>{c.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate font-medium">{c.fullName}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {WORKER_CATEGORY_LABELS[c.category]}
                  </Badge>
                  {c.destinationCountry && (
                    <Badge variant="outline" className="text-xs">
                      {DEST_COUNTRY_LABELS[c.destinationCountry]}
                    </Badge>
                  )}
                  {c.isRemarketingEligible && (
                    <Badge variant="outline" className="text-xs">
                      Remarketing
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.skills.join(", ") || "No skills listed"}</p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={requested.has(c.candidateId) || requestMutation.isPending}
                  onClick={() => requestMutation.mutate(c.candidateId)}
                >
                  {requested.has(c.candidateId) ? "Requested" : "Request Assignment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
