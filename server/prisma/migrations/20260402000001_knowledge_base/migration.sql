-- CreateTable: KbArticle
CREATE TABLE "KbArticle" (
    "id"              TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "summary"         TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "category"        TEXT NOT NULL,
    "tags"            TEXT NOT NULL,
    "useCase"         TEXT NOT NULL,
    "platform"        TEXT NOT NULL,
    "difficulty"      TEXT NOT NULL DEFAULT 'beginner',
    "viewCount"       INTEGER NOT NULL DEFAULT 0,
    "helpfulCount"    INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "featured"        BOOLEAN NOT NULL DEFAULT false,
    "published"       BOOLEAN NOT NULL DEFAULT true,
    "relatedSlugs"    TEXT NOT NULL DEFAULT '[]',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KbArticle_slug_key" ON "KbArticle"("slug");
CREATE INDEX "KbArticle_category_idx" ON "KbArticle"("category");
CREATE INDEX "KbArticle_featured_idx" ON "KbArticle"("featured");

-- GIN index for full-text search over title + summary + body + tags
-- Supports fast @@ queries with to_tsvector('english', ...)
CREATE INDEX "KbArticle_fts_idx" ON "KbArticle"
  USING gin(to_tsvector('english',
    "title" || ' ' || "summary" || ' ' || "body" || ' ' || "tags"
  ));

-- CreateTable: KbSearchEvent
CREATE TABLE "KbSearchEvent" (
    "id"               TEXT NOT NULL,
    "workspaceId"      TEXT,
    "query"            TEXT NOT NULL,
    "resultsCount"     INTEGER NOT NULL,
    "clickedArticleId" TEXT,
    "resolved"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbSearchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KbSearchEvent_workspaceId_idx" ON "KbSearchEvent"("workspaceId");
CREATE INDEX "KbSearchEvent_query_idx"       ON "KbSearchEvent"("query");
CREATE INDEX "KbSearchEvent_createdAt_idx"   ON "KbSearchEvent"("createdAt");

-- CreateTable: KbArticleFeedback
CREATE TABLE "KbArticleFeedback" (
    "id"          TEXT NOT NULL,
    "articleId"   TEXT NOT NULL,
    "workspaceId" TEXT,
    "helpful"     BOOLEAN NOT NULL,
    "comment"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbArticleFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KbArticleFeedback_articleId_idx"   ON "KbArticleFeedback"("articleId");
CREATE INDEX "KbArticleFeedback_workspaceId_idx" ON "KbArticleFeedback"("workspaceId");

ALTER TABLE "KbArticleFeedback"
    ADD CONSTRAINT "KbArticleFeedback_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "KbArticle"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
