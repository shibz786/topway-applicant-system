// Plain constants shared by both server code (documents.ts) and client
// components (document-upload.tsx) — kept out of validate-upload.ts
// specifically because that file is "server-only" and Next.js refuses to
// let a client component import from it at all, even for an unrelated
// plain constant.
export const DOCUMENT_TYPES = ["headshot", "fullphoto", "passport", "alteration"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
