-- C: restructure into 4 workforce modules (Domestic, General, Skilled,
-- Professional). Every existing candidate is real Domestic Workforce data
-- (confirmed against the actual rows, not assumed) - default DOMESTIC
-- backfills them all correctly with no separate UPDATE needed.
CREATE TYPE "WorkforceModule" AS ENUM ('DOMESTIC', 'GENERAL', 'SKILLED', 'PROFESSIONAL');

ALTER TABLE "Candidate" ADD COLUMN "workforceModule" "WorkforceModule" NOT NULL DEFAULT 'DOMESTIC';

CREATE INDEX "Candidate_workforceModule_idx" ON "Candidate"("workforceModule");
