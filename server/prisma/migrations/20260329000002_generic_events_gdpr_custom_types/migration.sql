-- IqLead: anonymous identity + GDPR fields
ALTER TABLE "IqLead"
  ADD COLUMN "anonymousId"         TEXT,
  ADD COLUMN "stitchedFromId"      TEXT,
  ADD COLUMN "consentBasis"        TEXT,
  ADD COLUMN "consentTimestamp"    TIMESTAMP(3),
  ADD COLUMN "consentVersion"      TEXT,
  ADD COLUMN "consentSource"       TEXT,
  ADD COLUMN "erasureRequestedAt"  TIMESTAMP(3),
  ADD COLUMN "erasedAt"            TIMESTAMP(3);

CREATE INDEX "IqLead_workspaceId_anonymousId_idx" ON "IqLead"("workspaceId", "anonymousId");

-- Touchpoint: per-event consent basis
ALTER TABLE "Touchpoint"
  ADD COLUMN "consentBasis" TEXT;

-- CustomEventType table
CREATE TABLE "CustomEventType" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "channel"     TEXT NOT NULL DEFAULT 'custom',
  "category"    TEXT NOT NULL DEFAULT 'signal',
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomEventType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomEventType_workspaceId_key_key" ON "CustomEventType"("workspaceId", "key");
CREATE INDEX "CustomEventType_workspaceId_idx" ON "CustomEventType"("workspaceId");

ALTER TABLE "CustomEventType"
  ADD CONSTRAINT "CustomEventType_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SourceMapping table
CREATE TABLE "SourceMapping" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "nodeType"    TEXT NOT NULL,
  "platform"    TEXT NOT NULL DEFAULT 'n8n',
  "appKey"      TEXT NOT NULL,
  "appLabel"    TEXT NOT NULL,
  "channel"     TEXT NOT NULL DEFAULT 'custom',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceMapping_workspaceId_platform_nodeType_key" ON "SourceMapping"("workspaceId", "platform", "nodeType");
CREATE INDEX "SourceMapping_workspaceId_idx" ON "SourceMapping"("workspaceId");

ALTER TABLE "SourceMapping"
  ADD CONSTRAINT "SourceMapping_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
