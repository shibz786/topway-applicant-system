"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { listLogoLibrary, setCandidateCvLogo, type LogoMode } from "@/lib/actions/branding";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MODE_LABEL: Record<string, string> = {
  LOGO: "Show a foreign agency logo",
  COMPANY_NAME: "Show company name",
  EMPTY: "Leave empty",
};

// B2: the per-CV override, available right where staff actually look at a
// CV (View/Download PDF). The choice is sticky server-side the moment it's
// saved (see Candidate.cvLogoMode's comment) - re-downloading keeps
// whatever was picked here even if the agency's own default changes later.
export function CvLogoPicker({
  candidateId,
  currentMode,
  onChanged,
}: {
  candidateId: string;
  currentMode: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LogoMode>((currentMode as LogoMode) ?? "EMPTY");
  const [logoId, setLogoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: library } = useQuery({
    queryKey: ["logo-library"],
    queryFn: async () => {
      const res = await listLogoLibrary();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0] ?? null;
      const res = await setCandidateCvLogo(candidateId, mode, logoId, file);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("CV logo updated");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Logo: {MODE_LABEL[currentMode ?? "EMPTY"]}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <Select value={mode} onValueChange={(v) => setMode(v as LogoMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOGO">Show a foreign agency logo</SelectItem>
            <SelectItem value="COMPANY_NAME">Show &quot;Topway Private Limited&quot;</SelectItem>
            <SelectItem value="EMPTY">Leave the slot empty</SelectItem>
          </SelectContent>
        </Select>
        {mode === "LOGO" && (
          <>
            <Select value={logoId ?? undefined} onValueChange={setLogoId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved logo…" />
              </SelectTrigger>
              <SelectContent>
                {library?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">…or upload one just for this CV:</p>
            <Input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
          </>
        )}
        <Button size="sm" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
