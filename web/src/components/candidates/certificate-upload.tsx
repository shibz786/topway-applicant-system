"use client";

import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadDocument, deleteDocument, listCandidateDocuments } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";

// C3/C4: "attached qualification/trade certificates (multiple files)" -
// genuinely many Document rows of type "certificate" per candidate, unlike
// every other document type in this app which is a single fixed slot
// (hence a separate component from DocumentUpload/DocumentSlot rather than
// forcing that one-per-type shape to also mean "one-or-more").
export function CertificateUpload({ candidateId, canEdit }: { candidateId: string; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ["candidate-documents", candidateId];

  const { data: documents } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listCandidateDocuments(candidateId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });
  const certificates = documents?.filter((d) => d.type === "certificate") ?? [];

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("candidateId", candidateId);
      fd.append("type", "certificate");
      fd.append("file", file);
      const res = await uploadDocument(fd);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Certificate uploaded");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteDocument(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function openDoc(documentId: string) {
    const res = await fetch(`/api/files/${documentId}`);
    const data = await res.json();
    if (data.ok) window.open(data.url, "_blank", "noreferrer");
    else toast.error("Couldn't open this file");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Certificates</p>
      <div className="space-y-1.5">
        {certificates.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
            <button type="button" className="text-left hover:underline" onClick={() => openDoc(doc.id)}>
              {doc.mimeType} · {(doc.sizeBytes / 1024).toFixed(0)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}
            </button>
            {canEdit && (
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => remove.mutate(doc.id)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        {certificates.length === 0 && <p className="text-xs text-muted-foreground">No certificates uploaded yet.</p>}
      </div>
      {canEdit && (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? "Uploading…" : "+ Add certificate"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
