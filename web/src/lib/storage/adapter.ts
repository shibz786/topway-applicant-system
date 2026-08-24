import "server-only";

// Storage abstraction so the app never talks to a specific backend
// directly. Today this resolves to the local-disk stand-in (see
// local-adapter.ts); set R2_ACCOUNT_ID etc. in .env and swap in an R2
// implementation behind this same interface with zero changes anywhere
// else in the app — every caller (documents.ts, agent logos, the file
// route handlers) only ever imports `storage` from here.
export interface StorageAdapter {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  // Server-side only reads (e.g. embedding a headshot in a generated PDF)
  // — never exposed to the browser. Anything the browser needs goes
  // through createSignedDownloadUrl instead.
  getObject(key: string): Promise<Buffer>;
  // Mirrors R2/S3 presigned URLs: a bearer-token URL valid for ttlSeconds,
  // no further auth needed to fetch it. The caller (the /api/files route)
  // is responsible for checking session + candidate-access BEFORE calling
  // this — this function itself does no authorization.
  createSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
}

import { localDiskAdapter } from "./local-adapter";
import { supabaseStorageAdapter } from "./supabase-adapter";

// Supabase Storage is the real backend once SUPABASE_URL is set; the
// local-disk stand-in (Phase 3, pre-Supabase) stays as the fallback for
// running the app locally without cloud credentials. This is the only
// place that needs to change to swap backends again later (e.g. to R2).
export const storage: StorageAdapter = process.env.SUPABASE_URL ? supabaseStorageAdapter : localDiskAdapter;
