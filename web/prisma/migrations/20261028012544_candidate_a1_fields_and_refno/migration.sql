-- A1 bug fix: Height, Weight, Marital Status, Children (No.), Passport
-- Date/Place of Issue, Educational Qualification Grade/Year have always
-- been printed on the CV template as hardcoded blank rows (candidate-
-- pdf.tsx) with nothing in the schema or form ever backing them. All
-- nullable since no existing candidate has a value for any of them yet.
ALTER TABLE "Candidate" ADD COLUMN     "heightCm" INTEGER;
ALTER TABLE "Candidate" ADD COLUMN     "weightKg" INTEGER;
ALTER TABLE "Candidate" ADD COLUMN     "maritalStatus" TEXT;
ALTER TABLE "Candidate" ADD COLUMN     "childrenCount" INTEGER;
ALTER TABLE "Candidate" ADD COLUMN     "passportIssueDate" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN     "passportIssuePlace" TEXT;
ALTER TABLE "Candidate" ADD COLUMN     "educationGrade" TEXT;
ALTER TABLE "Candidate" ADD COLUMN     "educationYear" INTEGER;

-- A5 bug fix: the CV's "REF NO." block printed candidate.fullName instead
-- of a real reference number. Backed by a sequence, same pattern as
-- Invoice.number (see 20260824030000_invoice_number_sequence) - nextval()
-- is a single atomic statement, safe under transaction-mode pooling, no
-- interactive transaction needed.
ALTER TABLE "Candidate" ADD COLUMN     "refNo" TEXT;
CREATE UNIQUE INDEX "Candidate_refNo_key" ON "Candidate"("refNo");

CREATE SEQUENCE IF NOT EXISTS "candidate_ref_no_seq" START 1;

-- Backfill every existing candidate with a real ref no, oldest first (a
-- plain UPDATE ... WHERE doesn't guarantee row processing order, hence the
-- explicit ROW_NUMBER() over createdAt) - refNo is nullable at the type
-- level (existing code doesn't need every candidate to have one to keep
-- working), but every real row should actually have one from the moment
-- this migration lands. Sequence is then advanced past however many rows
-- were just backfilled so the next real nextval() call continues cleanly.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Candidate"
  WHERE "refNo" IS NULL
)
UPDATE "Candidate" c
SET "refNo" = 'TW-' || LPAD(ordered.rn::text, 5, '0')
FROM ordered
WHERE c."id" = ordered."id";

SELECT setval('candidate_ref_no_seq', GREATEST((SELECT COUNT(*) FROM "Candidate"), 1));
