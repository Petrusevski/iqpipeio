CREATE TABLE "WorkspaceInvite" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "role"        TEXT NOT NULL DEFAULT 'analyst',
    "token"       TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt"  TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");
CREATE INDEX "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite"("workspaceId");
CREATE INDEX "WorkspaceInvite_token_idx" ON "WorkspaceInvite"("token");

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
