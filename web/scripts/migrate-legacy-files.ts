/**
 * One-off migration: copies the legacy app's actual image/document files
 * (project-root `uploads/`) into the new storage adapter and creates the
 * matching Document rows / Agent.logoR2Key values.
 *
 * This is the deferred step migrate-legacy-data.ts's own header comment
 * pointed at: "Legacy image/document filenames are recorded in the
 * migration report instead, so Phase 3's file-migration step knows what to
 * upload and to which candidate." Phase 3 built the StorageAdapter/
 * Document infrastructure but never actually ran this backfill — every
 * migrated candidate has had an empty photo/document set (and every
 * migrated agent an empty logo) since Phase 1, which is why headshot/full
 * photo showed as placeholder boxes on the candidate PDF instead of the
 * real image.
 *
 * Usage: npm run db:migrate-legacy-files  (or: npx tsx scripts/migrate-legacy-files.ts)
 * Idempotent: skips a candidate/type or an agent that already has a
 * Document/logoR2Key, so reruns are safe.
 *
 * Deliberately reimplements (rather than imports) the magic-byte check
 * instead of pulling in src/lib/storage/validate-upload.ts — that file is
 * "server-only", which only resolves under Next's build; migrate-legacy-
 * data.ts set the same precedent of a fully standalone script.
 *
 * putObject() below picks Supabase Storage or the local-disk stand-in
 * using the exact same SUPABASE_URL check src/lib/storage/adapter.ts
 * uses — this MUST mirror that selection, or (as happened on the first
 * version of this script) it silently writes files to local disk while
 * the live app is actually reading from Supabase, leaving every Document
 * row pointing at a key that was never actually uploaded anywhere the app
 * can see. @supabase/supabase-js has no "server-only" restriction, so it's
 * safe to import directly in this standalone script.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient();
const REPO_ROOT = join(process.cwd(), ".."); // web/ -> repo root
const UPLOADS_DIR = join(REPO_ROOT, "uploads");
const STORAGE_DIR = join(process.cwd(), ".local-storage");

const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
  : null;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "candidate-files";

function detectMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  return null;
}

async function putObject(key: string, body: Buffer, contentType: string) {
  if (supabase) {
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed for ${key}: ${error.message}`);
    return;
  }
  mkdirSync(STORAGE_DIR, { recursive: true });
  writeFileSync(join(STORAGE_DIR, key), body);
}

const TYPE_INFIX: Record<string, "headshot" | "fullphoto" | "passport" | "alteration"> = {
  headshot: "headshot",
  fullPhoto: "fullphoto",
  "doc-passport": "passport",
  "doc-alteration": "alteration",
};

async function main() {
  const report = JSON.parse(readFileSync(join(process.cwd(), "scripts/migration-report.json"), "utf-8")) as {
    candidates: { legacyId: string; newId: string }[];
    agents: { legacyId: string; newUserId: string }[];
  };

  const allFiles = readdirSync(UPLOADS_DIR);

  let candidateDocsCreated = 0;
  let candidateDocsSkippedExisting = 0;
  let candidateDocsSkippedBadFile = 0;
  let candidateFilesNotFound = 0;

  for (const c of report.candidates) {
    for (const [infix, type] of Object.entries(TYPE_INFIX)) {
      const match = allFiles.find((f) => f.startsWith(`${c.legacyId}_${infix}_`));
      if (!match) {
        candidateFilesNotFound++;
        continue;
      }

      const existing = await db.document.findFirst({ where: { candidateId: c.newId, type } });
      if (existing) {
        candidateDocsSkippedExisting++;
        continue;
      }

      const buffer = readFileSync(join(UPLOADS_DIR, match));
      const mime = detectMimeFromBytes(buffer);
      if (!mime) {
        console.warn(`  SKIP (bad magic bytes): ${match}`);
        candidateDocsSkippedBadFile++;
        continue;
      }

      const key = randomUUID();
      await putObject(key, buffer, mime);
      await db.document.create({
        data: { candidateId: c.newId, type, r2Key: key, mimeType: mime, sizeBytes: buffer.length },
      });
      candidateDocsCreated++;
    }
  }

  let agentLogosSet = 0;
  let agentLogosSkippedExisting = 0;
  let agentLogosSkippedBadFile = 0;
  let agentFilesNotFound = 0;

  for (const a of report.agents) {
    const candidates = allFiles
      .filter((f) => f.startsWith(`agentlogo_${a.legacyId}_`))
      .sort()
      .reverse(); // filename ends in a unix-ms timestamp — sort desc = most recent first
    const match = candidates[0];
    if (!match) {
      agentFilesNotFound++;
      continue;
    }

    const agent = await db.agent.findUnique({ where: { userId: a.newUserId } });
    if (!agent) continue;
    if (agent.logoR2Key) {
      agentLogosSkippedExisting++;
      continue;
    }

    const buffer = readFileSync(join(UPLOADS_DIR, match));
    const mime = detectMimeFromBytes(buffer);
    if (!mime) {
      console.warn(`  SKIP (bad magic bytes): ${match}`);
      agentLogosSkippedBadFile++;
      continue;
    }

    const key = randomUUID();
    await putObject(key, buffer, mime);
    await db.agent.update({ where: { id: agent.id }, data: { logoR2Key: key } });
    agentLogosSet++;
  }

  console.log("\n--- Candidate documents ---");
  console.log(`Created: ${candidateDocsCreated}`);
  console.log(`Already existed (skipped): ${candidateDocsSkippedExisting}`);
  console.log(`Bad magic bytes (skipped): ${candidateDocsSkippedBadFile}`);
  console.log(`No matching legacy file: ${candidateFilesNotFound}`);
  console.log("\n--- Agent logos ---");
  console.log(`Set: ${agentLogosSet}`);
  console.log(`Already existed (skipped): ${agentLogosSkippedExisting}`);
  console.log(`Bad magic bytes (skipped): ${agentLogosSkippedBadFile}`);
  console.log(`No matching legacy file: ${agentFilesNotFound}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
