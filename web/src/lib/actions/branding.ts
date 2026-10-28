"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireSession, runAsActor, ForbiddenError } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { storage } from "@/lib/storage/adapter";
import { detectMimeFromBytes, MAX_UPLOAD_BYTES, EXT_FOR_MIME } from "@/lib/storage/validate-upload";
import { runAction, ActionError, type ActionResult } from "./result";

// B1/B2: CV branding settings. Every signed-in user (ADMIN, STAFF, AGENT)
// can reach this - the choice of what prints on a CV's left-hand logo slot
// isn't gated behind the `agents` permission the way agent-company CRUD is,
// since it's a per-CV editorial choice staff make while building a
// candidate's profile, not agent-account management.

const LOGO_MODES = ["LOGO", "COMPANY_NAME", "EMPTY"] as const;
export type LogoMode = (typeof LOGO_MODES)[number];

export type LogoLibraryEntry = Awaited<ReturnType<typeof listLogoLibraryInternal>>[number];

async function listLogoLibraryInternal() {
  const rows = await db.agentLogo.findMany({
    orderBy: { createdAt: "desc" },
    include: { agent: { select: { companyName: true } } },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      label: r.label ?? r.agent?.companyName ?? "Untitled logo",
      agentCompanyName: r.agent?.companyName ?? null,
      uploadedByUserId: r.uploadedByUserId,
      previewUrl: await storage.createSignedDownloadUrl(r.r2Key, 900),
    })),
  );
}

// The full shared library - every role can see every logo (picking a
// logo for a CV isn't limited to "your own"), but only the uploader or an
// admin can delete a given entry (enforced in deleteAgentLogo below).
export async function listLogoLibrary(): Promise<ActionResult<LogoLibraryEntry[]>> {
  return runAction(async () => {
    await requireSession();
    return listLogoLibraryInternal();
  });
}

export async function uploadAgentLogo(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();

    const file = formData.get("file");
    const label = String(formData.get("label") ?? "").trim();
    // AGENT uploads attach to their own Agent record automatically; staff/
    // admin can optionally tag a logo to a specific foreign Agent via
    // agentId, or leave it untagged (a general-purpose logo).
    const agentId = user.role === "AGENT" ? user.agentId : String(formData.get("agentId") ?? "") || null;

    if (!(file instanceof File)) throw new ActionError("No file uploaded");
    if (file.size > MAX_UPLOAD_BYTES) throw new ActionError("File too large (max 10MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = detectMimeFromBytes(buffer);
    if (!mime || !EXT_FOR_MIME[mime]) throw new ActionError("Unsupported or unrecognized file type");
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mime)) {
      throw new ActionError("Logo must be a PNG, JPG, or SVG image");
    }

    const key = randomUUID();
    await storage.putObject(key, buffer, mime);

    const logo = await db.agentLogo.create({
      data: { agentId, uploadedByUserId: user.id, r2Key: key, mimeType: mime, label: label || null },
    });
    return { id: logo.id };
  });
}

export async function deleteAgentLogo(logoId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    const logo = await db.agentLogo.findUnique({ where: { id: logoId } });
    if (!logo) return null;
    if (user.role !== "ADMIN" && logo.uploadedByUserId !== user.id) throw new ForbiddenError();

    await storage.deleteObject(logo.r2Key);
    await db.agentLogo.delete({ where: { id: logoId } });
    return null;
  });
}

// An agent's own default for their CVs. Staff/admin can set it on behalf of
// any agent from the agent-management panel; an agent can only set their
// own.
export async function setAgentDefaultBranding(
  agentId: string,
  mode: LogoMode,
  logoId: string | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    if (user.agentId !== agentId) requirePermission(user, "agents");
    if (!LOGO_MODES.includes(mode)) throw new ActionError("Invalid logo mode");

    await db.agent.update({
      where: { id: agentId },
      data: { defaultLogoMode: mode, defaultLogoId: mode === "LOGO" ? logoId : null },
    });
    return null;
  });
}

export async function getAgentBrandingSettings(agentId: string): Promise<
  ActionResult<{ defaultLogoMode: string; defaultLogoId: string | null; ownLogoR2Key: string | null }>
> {
  return runAction(async () => {
    const user = await requireSession();
    if (user.agentId !== agentId) requirePermission(user, "agents");
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new ActionError("Agent not found");
    return { defaultLogoMode: agent.defaultLogoMode, defaultLogoId: agent.defaultLogoId, ownLogoR2Key: agent.logoR2Key };
  });
}

// Per-CV override (sticky once set - see the Candidate.cvLogoMode comment
// in schema.prisma). `logoId` picks a saved library entry; `adHocFormData`
// lets staff upload a one-off image for just this CV without saving it to
// the shared library, per spec option (a) "from saved logos, or uploaded
// on the spot."
export async function setCandidateCvLogo(
  candidateId: string,
  mode: LogoMode,
  logoId: string | null,
  adHocFile: File | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "applications");
    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new ActionError("Candidate not found");
    if (!LOGO_MODES.includes(mode)) throw new ActionError("Invalid logo mode");

    let r2Key: string | null = null;
    if (mode === "LOGO") {
      if (adHocFile) {
        if (adHocFile.size > MAX_UPLOAD_BYTES) throw new ActionError("File too large (max 10MB)");
        const buffer = Buffer.from(await adHocFile.arrayBuffer());
        const mime = detectMimeFromBytes(buffer);
        if (!mime || !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mime)) {
          throw new ActionError("Logo must be a PNG, JPG, or SVG image");
        }
        r2Key = randomUUID();
        await storage.putObject(r2Key, buffer, mime);
      } else if (logoId) {
        const logo = await db.agentLogo.findUnique({ where: { id: logoId } });
        if (!logo) throw new ActionError("Logo not found");
        r2Key = logo.r2Key;
      } else {
        throw new ActionError("Choose a saved logo or upload one");
      }
    }

    await runAsActor(user, () =>
      db.candidate.update({ where: { id: candidateId }, data: { cvLogoMode: mode, cvLogoR2Key: r2Key } }),
    );
    return null;
  });
}
