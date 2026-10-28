import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { assertCanViewCandidate } from "@/lib/auth/candidate-access";
import { storage } from "@/lib/storage/adapter";
import { detectMimeFromBytes } from "@/lib/storage/validate-upload";
import { renderCandidatePdf } from "@/lib/pdf/candidate-pdf";
import { toErrorResponse } from "@/lib/api-error";

// A4 bug fix: the downloaded CV never included the uploaded passport copy.
// Appends it as extra pages in the SAME combined PDF — a real PDF passport
// scan has its pages copied in directly; a JPEG/PNG scan gets embedded as
// one new full-page image. WEBP/GIF (both accepted uploads per
// validate-upload.ts) aren't embeddable by pdf-lib; those are skipped with
// a console warning rather than failing the whole download, matching
// UAT-09's "no passport copy still downloads fine" extended to "a copy in
// an unmergeable format still downloads fine too."
async function appendPassportCopy(cvBytes: Buffer, passportBytes: Buffer, mimeType: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(cvBytes);

  if (mimeType === "application/pdf") {
    const passportPdf = await PDFDocument.load(passportBytes);
    const pages = await pdf.copyPages(passportPdf, passportPdf.getPageIndices());
    pages.forEach((p) => pdf.addPage(p));
  } else if (mimeType === "image/jpeg" || mimeType === "image/png") {
    const image = mimeType === "image/jpeg" ? await pdf.embedJpg(passportBytes) : await pdf.embedPng(passportBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  } else {
    console.warn(`Passport copy has unsupported mime type for PDF merge: ${mimeType} — CV downloaded without it.`);
    return cvBytes;
  }

  return Buffer.from(await pdf.save());
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;

    let candidate = await db.candidate.findUnique({
      where: { id },
      include: {
        documents: { where: { type: { in: ["headshot", "fullphoto", "passport"] } } },
        placements: { where: { isCurrent: true }, include: { agent: true }, take: 1 },
        workHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!candidate) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await assertCanViewCandidate(user, id);

    // C3/C4: "No generated CV" - those modules upload their own CV PDF
    // instead (served through /api/files/[fileId] like any other
    // Document, not this route). Generating the Domestic/General template
    // for a Skilled/Professional candidate would print a nonsensical CV
    // (housemaid skill checkboxes etc. on an engineer's record).
    if (candidate.workforceModule === "SKILLED" || candidate.workforceModule === "PROFESSIONAL") {
      return NextResponse.json(
        { ok: false, error: "This workforce module doesn't generate a CV - use the candidate's uploaded CV instead." },
        { status: 400 },
      );
    }

    // B2: resolve this CV's logo-slot choice on first generation and
    // freeze it (spec: "the choice is saved per CV, so re-downloading
    // gives the same result" / "existing CVs keep their saved choice"
    // even after the agent's default later changes). Already-resolved
    // candidates (cvLogoMode set) skip straight to using what's saved.
    if (candidate.cvLogoMode === null) {
      const agent = candidate.placements[0]?.agent;
      let mode: string = "EMPTY";
      let r2Key: string | null = null;
      if (agent) {
        mode = agent.defaultLogoMode;
        if (mode === "LOGO") {
          if (agent.defaultLogoId) {
            const logo = await db.agentLogo.findUnique({ where: { id: agent.defaultLogoId } });
            r2Key = logo?.r2Key ?? agent.logoR2Key;
          } else {
            r2Key = agent.logoR2Key;
          }
          if (!r2Key) mode = "EMPTY"; // default says LOGO but nothing's actually on file
        }
      }
      candidate = await runAsActor(user, () =>
        db.candidate.update({
          where: { id },
          data: { cvLogoMode: mode, cvLogoR2Key: r2Key },
          include: {
            documents: { where: { type: { in: ["headshot", "fullphoto", "passport"] } } },
            placements: { where: { isCurrent: true }, include: { agent: true }, take: 1 },
            workHistory: { orderBy: { createdAt: "asc" } },
          },
        }),
      );
    }

    async function toDataUri(r2Key: string, mimeType: string): Promise<string> {
      const bytes = await storage.getObject(r2Key);
      return `data:${mimeType};base64,${bytes.toString("base64")}`;
    }

    // Agent/AgentLogo-sourced keys have no companion mimeType column
    // (unlike Document, which records the real one at upload time) — sniff
    // it from the bytes instead of guessing. A previous version hardcoded
    // "image/png" here, which silently broke every non-PNG logo (react-
    // pdf/pdfkit fails to decode JPEG bytes labeled image/png and just
    // renders nothing, no error) — only surfaced once real agent logos
    // existed to test against.
    //
    // react-pdf's <Image> can't embed SVG at all (it rasterizes PNG/JPEG
    // data, not vector markup) — a logo saved as SVG renders as nothing
    // here, which CandidatePdfDocument already treats the same as "no
    // image resolved" (empty slot, not a crash). Logo library uploads
    // still accept SVG per spec (B2) since every OTHER place they're used
    // (the Settings page's own preview, browsers generally) renders SVG
    // natively — this is a real, deliberate limitation specific to the
    // server-side PDF embed, not a bug to silently "fix" with a guess.
    async function agentLogoDataUriFor(r2Key: string): Promise<string | null> {
      const bytes = await storage.getObject(r2Key);
      const mime = detectMimeFromBytes(bytes);
      if (!mime || mime === "image/svg+xml") return null;
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }

    const headshot = candidate.documents.find((d) => d.type === "headshot");
    const fullphoto = candidate.documents.find((d) => d.type === "fullphoto");
    const passport = candidate.documents.find((d) => d.type === "passport");
    const agentLogoKey = candidate.cvLogoMode === "LOGO" ? candidate.cvLogoR2Key : null;

    const [headshotDataUri, fullPhotoDataUri, agentLogoDataUri] = await Promise.all([
      headshot ? toDataUri(headshot.r2Key, headshot.mimeType) : Promise.resolve(null),
      fullphoto ? toDataUri(fullphoto.r2Key, fullphoto.mimeType) : Promise.resolve(null),
      agentLogoKey ? agentLogoDataUriFor(agentLogoKey).catch(() => null) : Promise.resolve(null),
    ]);

    let pdfBuffer = await renderCandidatePdf({
      candidate,
      headshotDataUri,
      fullPhotoDataUri,
      agentLogoDataUri,
      logoMode: candidate.cvLogoMode as "LOGO" | "COMPANY_NAME" | "EMPTY" | null,
    });

    // A4: append the passport copy as extra pages, same combined PDF. A
    // candidate with no passport copy on file still downloads fine — this
    // whole block is a no-op when `passport` is undefined.
    if (passport) {
      try {
        const passportBytes = await storage.getObject(passport.r2Key);
        pdfBuffer = await appendPassportCopy(pdfBuffer, passportBytes, passport.mimeType);
      } catch (err) {
        // Never let a passport-merge failure break the whole CV download —
        // log it and ship the CV without the extra pages instead.
        console.error(`Failed to merge passport copy for candidate ${id}:`, err);
      }
    }

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
