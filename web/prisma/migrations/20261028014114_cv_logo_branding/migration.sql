-- B2: foreign agency CV logo branding (settings, shared logo library,
-- per-agent default, per-candidate sticky override).

-- CreateTable
CREATE TABLE "AgentLogo" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentLogo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentLogo_agentId_idx" ON "AgentLogo"("agentId");

ALTER TABLE "AgentLogo" ADD CONSTRAINT "AgentLogo_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Agent's own default CV branding choice
ALTER TABLE "Agent" ADD COLUMN     "defaultLogoMode" TEXT NOT NULL DEFAULT 'EMPTY';
ALTER TABLE "Agent" ADD COLUMN     "defaultLogoId" TEXT;

-- Preserve current behavior for every agent that already has a logo set
-- (printed it on every CV before this migration existed) - default them to
-- "LOGO" rather than silently switching their CVs to empty.
UPDATE "Agent" SET "defaultLogoMode" = 'LOGO' WHERE "logoR2Key" IS NOT NULL;

-- AlterTable: Candidate's per-CV sticky branding choice
ALTER TABLE "Candidate" ADD COLUMN     "cvLogoMode" TEXT;
ALTER TABLE "Candidate" ADD COLUMN     "cvLogoR2Key" TEXT;
