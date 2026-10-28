// Plain constants shared by both server code (documents.ts) and client
// components (document-upload.tsx) — kept out of validate-upload.ts
// specifically because that file is "server-only" and Next.js refuses to
// let a client component import from it at all, even for an unrelated
// plain constant.
// "own_cv" / "certificate" added for C3/C4 (Skilled & Technical,
// Professional Workforce) - those modules don't generate a CV, they just
// store the candidate's own CV PDF plus however many qualification/trade
// certificate files are attached, so "certificate" is deliberately not a
// one-per-candidate slot the way headshot/fullphoto/passport are.
export const DOCUMENT_TYPES = ["headshot", "fullphoto", "passport", "alteration", "own_cv", "certificate"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
