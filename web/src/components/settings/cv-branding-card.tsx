"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listLogoLibrary,
  uploadAgentLogo,
  deleteAgentLogo,
  getAgentBrandingSettings,
  setAgentDefaultBranding,
  type LogoMode,
} from "@/lib/actions/branding";
import { listAgents, type AgentRow } from "@/lib/actions/agents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const LOGO_LIBRARY_KEY = ["logo-library"];

// B1/B2: Settings → CV Branding. An AGENT manages their own default
// (agentId fixed to their own record); ADMIN/STAFF with the `agents`
// permission pick which foreign agency's default they're setting. Either
// way it's the same underlying setAgentDefaultBranding/getAgentBranding-
// Settings actions — the component just decides where agentId comes from.
export function CvBrandingCard({
  currentAgentId,
  canPickAgent,
}: {
  currentAgentId: string | null;
  canPickAgent: boolean;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(currentAgentId);

  const { data: agents } = useQuery({
    queryKey: ["agents-admin"],
    queryFn: async () => {
      const res = await listAgents();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: canPickAgent,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>CV Branding</CardTitle>
        <CardDescription>
          Manage the foreign-agency logos available for candidate CVs, and the default shown for
          this agency&apos;s placements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canPickAgent && (
          <div className="space-y-2">
            <Label>Agency</Label>
            <Select value={selectedAgentId ?? undefined} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Choose an agency" />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((a: AgentRow) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedAgentId ? (
          <AgentDefaultPicker agentId={selectedAgentId} />
        ) : (
          <p className="text-sm text-muted-foreground">Choose an agency above to set its CV default.</p>
        )}

        <LogoLibrary />
      </CardContent>
    </Card>
  );
}

function AgentDefaultPicker({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-branding", agentId],
    queryFn: async () => {
      const res = await getAgentBrandingSettings(agentId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });
  const { data: library } = useQuery({
    queryKey: LOGO_LIBRARY_KEY,
    queryFn: async () => {
      const res = await listLogoLibrary();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ mode, logoId }: { mode: LogoMode; logoId: string | null }) => {
      const res = await setAgentDefaultBranding(agentId, mode, logoId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Default branding updated");
      queryClient.invalidateQueries({ queryKey: ["agent-branding", agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-24 w-full max-w-sm" />;

  return (
    <div className="space-y-2 rounded-md border p-4">
      <Label>Default for new CVs placed with this agency</Label>
      <p className="text-xs text-muted-foreground">
        Applies to any candidate&apos;s CV the first time it&apos;s generated. Changing this later
        doesn&apos;t affect CVs that have already been generated once (each one keeps its own
        saved choice).
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Select
          value={data.defaultLogoMode}
          onValueChange={(mode) => update.mutate({ mode: mode as LogoMode, logoId: mode === "LOGO" ? data.defaultLogoId : null })}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOGO">Show a foreign agency logo</SelectItem>
            <SelectItem value="COMPANY_NAME">Show &quot;Topway Private Limited&quot;</SelectItem>
            <SelectItem value="EMPTY">Leave the slot empty</SelectItem>
          </SelectContent>
        </Select>
        {data.defaultLogoMode === "LOGO" && (
          <Select
            value={data.defaultLogoId ?? "__own__"}
            onValueChange={(logoId) => update.mutate({ mode: "LOGO", logoId: logoId === "__own__" ? null : logoId })}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a logo" />
            </SelectTrigger>
            <SelectContent>
              {data.ownLogoR2Key && <SelectItem value="__own__">This agency&apos;s own logo</SelectItem>}
              {library?.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function LogoLibrary() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: LOGO_LIBRARY_KEY,
    queryFn: async () => {
      const res = await listLogoLibrary();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("label", label);
      const res = await uploadAgentLogo(fd);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Logo uploaded");
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: LOGO_LIBRARY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteAgentLogo(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Logo removed");
      queryClient.invalidateQueries({ queryKey: LOGO_LIBRARY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Label>Saved logos</Label>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Label (optional)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Al Noor Horizon" className="w-48" />
        </div>
        <Input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="w-56"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
          disabled={upload.isPending}
        />
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPG, or SVG. Max 10MB.</p>

      {isLoading && <Skeleton className="h-20 w-full" />}
      <div className="flex flex-wrap gap-3">
        {data?.map((l) => (
          <div key={l.id} className="flex w-40 flex-col items-center gap-1.5 rounded-md border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset */}
            <img src={l.previewUrl ?? ""} alt={l.label} className="h-16 w-full object-contain" />
            <p className="truncate text-center text-xs" title={l.label}>
              {l.label}
            </p>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => remove.mutate(l.id)}>
              Remove
            </Button>
          </div>
        ))}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No logos saved yet.</p>}
      </div>
    </div>
  );
}
