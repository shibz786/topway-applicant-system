import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "./adapter";

// Replaces local-adapter.ts (the pre-Supabase local-disk stand-in) —
// same StorageAdapter interface, so nothing outside this file changed.
// Uses the SERVICE ROLE key specifically: this client only ever runs
// server-side (never imported by a Client Component — "server-only"
// above enforces that at build time) and the bucket is private, so the
// service role bypassing RLS is the correct model here, matching CLAUDE.md
// rule #3's "R2 bucket is private, all downloads go through a signed URL"
// — Supabase Storage's own createSignedUrl() plays the same role R2's
// presigned URLs would.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "candidate-files";

export const supabaseStorageAdapter: StorageAdapter = {
  async putObject(key, body, contentType) {
    const { error } = await supabase.storage.from(BUCKET).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  },

  async getObject(key) {
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error) throw new Error(`Supabase storage download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  },

  async deleteObject(key) {
    // Best-effort, matching local-adapter.ts's swallow-if-already-gone
    // semantics — deleteDocument() etc. don't want a missing file to be a
    // hard failure.
    await supabase.storage.from(BUCKET).remove([key]);
  },

  async createSignedDownloadUrl(key, ttlSeconds) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, ttlSeconds);
    if (error) throw new Error(`Supabase storage signed URL failed: ${error.message}`);
    return data.signedUrl;
  },
};
