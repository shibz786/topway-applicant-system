-- First-time user guidance: a persisted per-user flag, not localStorage,
-- so dismissing the onboarding tour on one device actually sticks on
-- another. Column default is false (every NEW user sees it once); every
-- EXISTING user is explicitly backfilled to true here so real/already-
-- seeded accounts don't suddenly get a tour on their next login.
ALTER TABLE "User" ADD COLUMN "hasSeenOnboarding" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "hasSeenOnboarding" = true;
