"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCanViewCandidate } from "@/lib/auth/candidate-access";
import { storage } from "@/lib/storage/adapter";
import { detectMimeFromBytes, MAX_UPLOAD_BYTES, EXT_FOR_MIME, DOCUMENT_TYPES } from "@/lib/storage/validate-upload";
import { runAction, ActionError, type ActionResult } from "./result";

// Upload is a Server Action taking FormData directly (Next.js supports File
// objects inside FormData passed to a "use server" function) — CLAUDE.md
// rule #7: validate magic bytes + size before writing to storage, R2 keys
// (here: local-disk keys, same shape) are opaque UUIDs, never the original
// filename.
export async function uploadDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const candidateId = String(formData.get("candidateId") ?? "");
    const type = String(formData.get("type") ?? "");
    const file = formData.get("file");

    if (!candidateId) throw new ActionError("Missing candidate");
    if (!DOCUMENT_TYPES.includes(type as (typeof DOCUMENT_TYPES)[number])) {
      throw new ActionError("Invalid document type");
    }
    if (!(file instanceof File)) throw new ActionError("No file uploaded");
    if (file.size > MAX_UPLOAD_BYTES) throw new ActionError("File too large (max 10MB)");

    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new ActionError("Candidate not found");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = detectMimeFromBytes(buffer);
    if (!mime || !EXT_FOR_MIME[mime]) {
      throw new ActionError("Unsupported or unrecognized file type");
    }

    const key = randomUUID();
    await storage.putObject(key, buffer, mime);

    const doc = await runAsActor(user, () =>
      db.document.create({
        data: { candidateId, type, r2Key: key, mimeType: mime, sizeBytes: buffer.length },
      }),
    );
    return { id: doc.id };
  });
}

export async function deleteDocument(documentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");

    const doc = await db.document.findUnique({ where: { id: documentId } });
    if (!doc) return null;

    await storage.deleteObject(doc.r2Key);
    // Document isn't an audited model (not in the 5 listed tables) — no
    // actor context needed for this write.
    await db.document.delete({ where: { id: documentId } });
    return null;
  });
}

export async function listCandidateDocuments(candidateId: string): Promise<
  ActionResult<{ id: string; type: string; mimeType: string; sizeBytes: number; uploadedAt: Date }[]>
> {
  return runAction(async () => {
    const user = await requireSession();
    await assertCanViewCandidate(user, candidateId);
    return db.document.findMany({
      where: { candidateId },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, type: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });
  });
}
