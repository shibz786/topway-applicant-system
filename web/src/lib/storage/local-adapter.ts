import "server-only";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StorageAdapter } from "./adapter";

// Deliberately OUTSIDE `public/` — Next.js never serves this directory
// directly, same as R2's private bucket. The only path to a file is
// through /api/files/raw/[key], and only with a valid signed token.
const STORAGE_DIR = join(process.cwd(), ".local-storage");

async function ensureDir() {
  await mkdir(STORAGE_DIR, { recursive: true });
}

function objectPath(key: string): string {
  // Keys are opaque UUIDs minted by the caller (documents.ts) — reject
  // anything that isn't, so this can never be used for path traversal.
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error("Invalid storage key");
  return join(STORAGE_DIR, key);
}

function signingSecret(): string {
  const secret = process.env.FILE_SIGNING_SECRET;
  if (!secret) {
    // Local dev stand-in only — real deployments must set this in .env.
    // Falling back to a fixed string would make every signed URL forgeable
    // across restarts if someone copied this pattern into production, so
    // fail loudly instead in a non-dev environment.
    if (process.env.NODE_ENV === "production") {
      throw new Error("FILE_SIGNING_SECRET must be set in production");
    }
    return "dev-only-insecure-signing-secret-do-not-use-in-production";
  }
  return secret;
}

function sign(key: string, expiresAt: number): string {
  return createHmac("sha256", signingSecret()).update(`${key}.${expiresAt}`).digest("hex");
}

export function verifySignedToken(key: string, expiresAt: number, token: string): boolean {
  if (Date.now() > expiresAt) return false;
  const expected = sign(key, expiresAt);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const localDiskAdapter: StorageAdapter = {
  // contentType is unused by the local stand-in (the raw-serving route
  // re-sniffs magic bytes instead) but kept in the signature since the R2
  // implementation that replaces this will need it for the PUT request.
  async putObject(key, body) {
    await ensureDir();
    await writeFile(objectPath(key), body);
  },

  async getObject(key) {
    return readFile(objectPath(key));
  },

  async deleteObject(key) {
    try {
      await unlink(objectPath(key));
    } catch {
      // already gone — fine
    }
  },

  async createSignedDownloadUrl(key, ttlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const token = sign(key, expiresAt);
    return `/api/files/raw/${encodeURIComponent(key)}?exp=${expiresAt}&sig=${token}`;
  },
};

export function localObjectPath(key: string): string {
  return objectPath(key);
}
