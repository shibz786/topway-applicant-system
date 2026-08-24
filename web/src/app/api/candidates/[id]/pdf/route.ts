import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { assertCanViewCandidate } from "@/lib/auth/candidate-access";
import { storage } from "@/lib/storage/adapter";
import { detectMimeFromBytes } from "@/lib/storage/validate-upload";
import { renderCandidatePdf } from "@/lib/pdf/candidate-pdf";
import { toErrorResponse } from "@/lib/api-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;

    const candidate = await db.candidate.findUnique({
      where: { id },
      include: {
        documents: { where: { type: { in: ["headshot", "fullphoto"] } } },
        placements: { where: { isCurrent: true }, include: { agent: true }, take: 1 },
      },
    });
    if (!candidate) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await assertCanViewCandidate(user, id);

    async function toDataUri(r2Key: string, mimeType: string): Promise<string> {
      const bytes = await storage.getObject(r2Key);
      return `data:${mimeType};base64,${bytes.toString("base64")}`;
    }

    // Agent.logoR2Key has no companion mimeType column (unlike Document,
    // which records the real one at upload time) — sniff it from the bytes
    // instead of guessing. A previous version hardcoded "image/png" here,
    // which silently broke every non-PNG logo (react-pdf/pdfkit fails to
    // decode JPEG bytes labeled image/png and just renders nothing, no
    // error) — only surfaced once real agent logos existed to test against.
    async function agentLogoDataUriFor(r2Key: string): Promise<string | null> {
      const bytes = await storage.getObject(r2Key);
      const mime = detectMimeFromBytes(bytes);
      if (!mime) return null;
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }

    const headshot = candidate.documents.find((d) => d.type === "headshot");
    const fullphoto = candidate.documents.find((d) => d.type === "fullphoto");
    const agentLogoKey = candidate.placements[0]?.agent.logoR2Key;

    const [headshotDataUri, fullPhotoDataUri, agentLogoDataUri] = await Promise.all([
      headshot ? toDataUri(headshot.r2Key, headshot.mimeType) : Promise.resolve(null),
      fullphoto ? toDataUri(fullphoto.r2Key, fullphoto.mimeType) : Promise.resolve(null),
      agentLogoKey ? agentLogoDataUriFor(agentLogoKey).catch(() => null) : Promise.resolve(null),
    ]);

    const pdfBuffer = await renderCandidatePdf({ candidate, headshotDataUri, fullPhotoDataUri, agentLogoDataUri });

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${candidate.fullName.replace(/[^a-z0-9]/gi, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
