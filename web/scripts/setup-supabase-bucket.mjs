import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "candidate-files";

const { data: existing, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error("Failed to list buckets:", listErr.message);
  process.exit(1);
}

if (existing.some((b) => b.name === BUCKET)) {
  console.log(`Bucket "${BUCKET}" already exists.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false, // private — signed URLs only, matches CLAUDE.md rule #3
    fileSizeLimit: "10MB", // matches MAX_UPLOAD_BYTES in validate-upload.ts
  });
  if (error) {
    console.error("Failed to create bucket:", error.message);
    process.exit(1);
  }
  console.log(`Created private bucket "${BUCKET}".`);
}

// Confirm it's actually private
const { data: bucket, error: getErr } = await supabase.storage.getBucket(BUCKET);
if (getErr) {
  console.error("Failed to verify bucket:", getErr.message);
  process.exit(1);
}
console.log(`Bucket "${BUCKET}" public flag:`, bucket.public, "(should be false)");
