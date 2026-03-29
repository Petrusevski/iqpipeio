-- Add event quota tracking fields to Workspace
ALTER TABLE "Workspace" ADD COLUMN "eventCountMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Workspace" ADD COLUMN "eventCountResetAt" TIMESTAMP(3);
