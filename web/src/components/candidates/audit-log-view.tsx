"use client";

import { useQuery } from "@tanstack/react-query";
import { getCandidateAuditLog } from "@/lib/actions/candidates";

// Admin-only per the permissions matrix ("View audit log — Admin"). The
// caller (candidate-detail-sheet.tsx) only renders this for role === ADMIN,
// but the Server Action itself independently enforces the same rule — this
// component isn't the security boundary.
export function AuditLogView({ candidateId }: { candidateId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["candidate-audit-log", candidateId],
    queryFn: async () => {
      const res = await getCandidateAuditLog(candidateId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((entry) => (
        <div key={entry.id} className="rounded-md border p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {entry.action} {entry.entityType}
            </span>
            <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-muted-foreground">by {entry.actor.name} ({entry.actor.username})</p>
          <DiffView diff={entry.diff} />
        </div>
      ))}
    </div>
  );
}

function DiffView({ diff }: { diff: unknown }) {
  if (!diff || typeof diff !== "object") return null;
  const entries = Object.entries(diff as Record<string, { before: unknown; after: unknown }>);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 border-t pt-1">
      {entries.map(([field, { before, after }]) => (
        <li key={field}>
          <span className="font-mono">{field}</span>: {fmt(before)} → {fmt(after)}
        </li>
      ))}
    </ul>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string" && v.length > 40) return v.slice(0, 40) + "…";
  return String(v);
}
