"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadDocument, deleteDocument, listCandidateDocuments } from "@/lib/actions/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/storage/document-types";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<DocumentType, string> = {
  headshot: "Headshot",
  fullphoto: "Full Photo",
  passport: "Passport Scan",
  alteration: "Alteration Docs",
};

export function DocumentUpload({ candidateId, canEdit }: { candidateId: string; canEdit: boolean }) {
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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {DOCUMENT_TYPES.map((type) => {
        const doc = documents?.find((d) => d.type === type);
        return (
          <DocumentSlot
            key={type}
            type={type}
            candidateId={candidateId}
            documentId={doc?.id ?? null}
            canEdit={canEdit}
            onChanged={() => queryClient.invalidateQueries({ queryKey })}
          />
        );
      })}
    </div>
  );
}

function DocumentSlot({
  type,
  candidateId,
  documentId,
  canEdit,
  onChanged,
}: {
  type: DocumentType;
  candidateId: string;
  documentId: string | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("candidateId", candidateId);
      fd.append("type", type);
      fd.append("file", file);
      const res = await uploadDocument(fd);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success(`${TYPE_LABELS[type]} uploaded`);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) return;
      const res = await deleteDocument(documentId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      setPreviewUrl(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function loadPreview() {
    if (!documentId || previewUrl) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/files/${documentId}`);
      const data = await res.json();
      if (data.ok) setPreviewUrl(data.url);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{TYPE_LABELS[type]}</p>
      <div
        className="flex h-24 items-center justify-center overflow-hidden rounded bg-muted"
        onMouseEnter={loadPreview}
      >
        {documentId ? (
          loadingPreview ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset Next can optimize
            <img src={previewUrl} alt={TYPE_LABELS[type]} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">Uploaded</span>
          )
        ) : (
          <span className="text-xs text-muted-foreground">No file</span>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "…" : documentId ? "Replace" : "Upload"}
          </Button>
          {documentId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => deleteMutation.mutate()}
            >
              ✕
            </Button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
