-- Add externalId to Touchpoint for natural-key idempotency dedup.
-- Stored as "tool:source-id" (e.g. "stripe:evt_xxx123", "heyreach:12345").
-- NULL is allowed; the unique constraint only enforces uniqueness for non-null values
-- (Postgres UNIQUE indexes treat NULL != NULL, so multiple NULL rows are permitted).

ALTER TABLE "Touchpoint" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Touchpoint_workspaceId_externalId_key"
  ON "Touchpoint"("workspaceId", "externalId");
