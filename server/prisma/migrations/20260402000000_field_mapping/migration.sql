-- CreateTable: FieldMapping
-- Stores learned and manual field mappings for schema-resilient event normalization.

CREATE TABLE "FieldMapping" (
    "id"              TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "source"          TEXT NOT NULL,
    "rawPath"         TEXT NOT NULL,
    "canonicalField"  TEXT NOT NULL,
    "confidence"      DOUBLE PRECISION NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "isOverride"      BOOLEAN NOT NULL DEFAULT false,
    "isRejected"      BOOLEAN NOT NULL DEFAULT false,
    "overriddenBy"    TEXT,
    "useCount"        INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldMapping_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one mapping per workspace+source+rawPath
CREATE UNIQUE INDEX "FieldMapping_workspaceId_source_rawPath_key"
    ON "FieldMapping"("workspaceId", "source", "rawPath");

-- Indexes for common query patterns
CREATE INDEX "FieldMapping_workspaceId_source_idx"
    ON "FieldMapping"("workspaceId", "source");

CREATE INDEX "FieldMapping_workspaceId_canonicalField_idx"
    ON "FieldMapping"("workspaceId", "canonicalField");

-- Foreign key: cascade delete when workspace is removed
ALTER TABLE "FieldMapping"
    ADD CONSTRAINT "FieldMapping_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
