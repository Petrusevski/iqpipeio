-- Add per-minute rate limit counter to Workspace.
-- Mirrors the existing eventCountMonth / eventCountResetAt pattern.
-- Both columns default to 0 / NULL on existing rows — safe to apply without backfill.

ALTER TABLE "Workspace" ADD COLUMN "eventCountMinute" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Workspace" ADD COLUMN "rateLimitResetAt" TIMESTAMP(3);
