import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { localObjectPath, verifySignedToken } from "@/lib/storage/local-adapter";
import { detectMimeFromBytes } from "@/lib/storage/validate-upload";

// Local-disk storage stand-in ONLY (see lib/storage/adapter.ts) — this is
// the equivalent of R2 actually serving a presigned URL. Deliberately NOT
// gated by requireSession(): a presigned URL's possession IS the
// authorization (exactly like a real R2/S3 signed URL), time-limited via
// the signature's embedded expiry. The session + candidate-access check
// already happened one step earlier, in /api/files/[fileId], which is the
// only place that hands out these URLs. Once a real R2 adapter replaces
// the local one, this route stops being used entirely (createSignedDownloadUrl
// returns a real R2 URL instead) — it isn't a permanent part of the
// architecture, just this phase's stand-in for it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig");

  if (!key || !exp || !sig || !verifySignedToken(key, exp, sig)) {
    return NextResponse.json({ ok: false, error: "Invalid or expired link" }, { status: 403 });
  }

  try {
    const buffer = await readFile(localObjectPath(key));
    const mime = detectMimeFromBytes(buffer) ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}
