import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { assertCanViewCandidate } from "@/lib/auth/candidate-access";
import { storage } from "@/lib/storage/adapter";
import { toErrorResponse } from "@/lib/api-error";

// CLAUDE.md rule #3: the only path to a document is through this endpoint.
// Validates the session, checks the requester has permission to that
// candidate's record, then returns a signed URL with a 15-minute TTL —
// fileId here is the Document row's own id, never the storage key
// (r2Key/local-disk key) itself, which stays opaque and is never exposed
// to the browser directly.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const user = await requireSession();
    const { fileId } = await params;

    const doc = await db.document.findUnique({ where: { id: fileId } });
    if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await assertCanViewCandidate(user, doc.candidateId);

    const url = await storage.createSignedDownloadUrl(doc.r2Key, 15 * 60);
    return NextResponse.json({ ok: true, url, mimeType: doc.mimeType });
  } catch (err) {
    return toErrorResponse(err);
  }
}
