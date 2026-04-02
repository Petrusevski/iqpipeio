/**
 * kb.ts — In-app Knowledge Base API
 *
 * GET  /api/kb/articles                  — browse/filter articles (list view, no body)
 * GET  /api/kb/articles/:slug            — single article with full body + related
 * GET  /api/kb/search?q=...              — full-text search (PostgreSQL FTS)
 * GET  /api/kb/recommendations           — context-aware recommendations
 * GET  /api/kb/trending                  — most-viewed this week
 * GET  /api/kb/gaps                      — unresolved search queries (admin insight)
 * POST /api/kb/search-event              — track a search (called by frontend)
 * POST /api/kb/search-event/:id/click    — mark a search event as clicked/resolved
 * POST /api/kb/feedback                  — helpful / not-helpful vote on an article
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ─── Context → tags map for recommendations ───────────────────────────────────
// Maps frontend page/feature context strings to relevant KB tags.
// This drives the "Suggested for this page" UI without any ML.

const CONTEXT_TAGS: Record<string, string[]> = {
  "live-feed":         ["live-feed", "debugging", "webhook"],
  "automations":       ["n8n", "make", "setup", "quickstart"],
  "n8n":               ["n8n", "setup", "quickstart", "webhook"],
  "make":              ["make", "make.com", "setup", "quickstart"],
  "field-mappings":    ["field-mapping", "schema-drift", "field-detection", "mapping"],
  "workflow-mirrors":  ["workflow-mirror", "attribution", "apps"],
  "attribution":       ["attribution", "multi-source", "gtm", "funnel"],
  "settings":          ["quota", "rate-limit", "billing", "gdpr", "consent"],
  "events":            ["events", "naming", "taxonomy", "canonical"],
  "identity":          ["identity", "deduplication", "duplicates", "email"],
  "billing":           ["quota", "rate-limit", "billing", "plans"],
  "reports":           ["attribution", "funnel", "gtm", "stack"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve workspaceId from request (auth optional — returns null if not authed). */
async function optionalWorkspaceId(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return null;
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(auth.slice(7), process.env.JWT_SECRET!) as { sub: string };
    const m = await prisma.workspaceUser.findFirst({ where: { userId: payload.sub } });
    return m?.workspaceId ?? null;
  } catch { return null; }
}

/** Strip markdown for safe preview snippets in search results. */
function stripMarkdown(md: string, maxLen = 200): string {
  return md
    .replace(/#+\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Article list shape (no body — keeps response lean). */
function toListItem(a: any) {
  return {
    id:          a.id,
    slug:        a.slug,
    title:       a.title,
    summary:     a.summary,
    category:    a.category,
    difficulty:  a.difficulty,
    featured:    a.featured,
    tags:        safeJson(a.tags, []),
    useCase:     safeJson(a.useCase, []),
    platform:    safeJson(a.platform, []),
    viewCount:   a.viewCount,
    helpfulCount: a.helpfulCount,
    notHelpfulCount: a.notHelpfulCount,
    updatedAt:   a.updatedAt,
  };
}

function safeJson(s: string, fallback: any = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ─── GET /api/kb/articles ─────────────────────────────────────────────────────
// Browse and filter. No body returned (list view only).
// Query params: ?category=&difficulty=&platform=&useCase=&featured=&limit=&offset=

router.get("/articles", async (req: Request, res: Response) => {
  try {
    const {
      category, difficulty, platform, useCase,
      featured, limit = "20", offset = "0",
    } = req.query;

    const where: any = { published: true };
    if (category)   where.category   = String(category);
    if (difficulty) where.difficulty = String(difficulty);
    if (featured === "true") where.featured = true;

    // Tag/platform/useCase filtering: JSON contains check via LIKE
    // Not perfect for partial arrays but reliable for exact slug matches
    const all = await prisma.kbArticle.findMany({
      where,
      orderBy: [{ featured: "desc" }, { viewCount: "desc" }, { updatedAt: "desc" }],
      take:    Math.min(parseInt(String(limit), 10) || 20, 50),
      skip:    parseInt(String(offset), 10) || 0,
    });

    // Client-side filter for platform/useCase (JSON fields)
    const filtered = all.filter(a => {
      if (platform) {
        const p = safeJson(a.platform, []) as string[];
        if (!p.includes(String(platform)) && !p.includes("any")) return false;
      }
      if (useCase) {
        const uc = safeJson(a.useCase, []) as string[];
        if (!uc.includes(String(useCase))) return false;
      }
      return true;
    });

    return res.json(filtered.map(toListItem));
  } catch (err: any) {
    console.error("[kb/articles]", err.message);
    return res.status(500).json({ error: "Failed to load articles." });
  }
});

// ─── GET /api/kb/articles/:slug ───────────────────────────────────────────────
// Full article with body. Increments viewCount (fire-and-forget).

router.get("/articles/:slug", async (req: Request, res: Response) => {
  try {
    const article = await prisma.kbArticle.findUnique({
      where: { slug: req.params.slug },
    });

    if (!article || !article.published) {
      return res.status(404).json({ error: "Article not found." });
    }

    // Increment view count (non-blocking)
    prisma.kbArticle.update({
      where: { id: article.id },
      data:  { viewCount: { increment: 1 } },
    }).catch(() => {});

    // Fetch related articles (summaries only)
    const relatedSlugs: string[] = safeJson(article.relatedSlugs, []);
    const related = relatedSlugs.length > 0
      ? await prisma.kbArticle.findMany({
          where: { slug: { in: relatedSlugs }, published: true },
        }).then(arr => arr.map(toListItem))
      : [];

    return res.json({
      ...toListItem(article),
      body:         article.body,
      relatedSlugs,
      related,
    });
  } catch (err: any) {
    console.error("[kb/articles/:slug]", err.message);
    return res.status(500).json({ error: "Failed to load article." });
  }
});

// ─── GET /api/kb/search?q=... ─────────────────────────────────────────────────
// Full-text search via PostgreSQL tsvector. Logs the search event.
// Query params: ?q=&limit=&category=&difficulty=

router.get("/search", async (req: Request, res: Response) => {
  try {
    const q         = String(req.query.q || "").trim();
    const limitVal  = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 20);
    const category  = req.query.category ? String(req.query.category) : null;
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : null;
    const workspaceId = await optionalWorkspaceId(req);

    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters." });
    }

    // Sanitise query for plainto_tsquery (strips special characters)
    const safeQ = q.replace(/[^\w\s]/g, " ").trim();

    type SearchRow = {
      id: string; slug: string; title: string; summary: string;
      category: string; difficulty: string; featured: boolean;
      tags: string; "useCase": string; platform: string;
      "viewCount": number; "helpfulCount": number; "notHelpfulCount": number;
      "updatedAt": Date; rank: number;
    };

    const rawResults = await prisma.$queryRaw<SearchRow[]>`
      SELECT
        id, slug, title, summary, category, difficulty, featured,
        tags, "useCase", platform, "viewCount", "helpfulCount", "notHelpfulCount", "updatedAt",
        ts_rank(
          to_tsvector('english', title || ' ' || summary || ' ' || body || ' ' || tags),
          plainto_tsquery('english', ${safeQ})
        ) AS rank
      FROM "KbArticle"
      WHERE
        published = true
        AND to_tsvector('english', title || ' ' || summary || ' ' || body || ' ' || tags)
            @@ plainto_tsquery('english', ${safeQ})
        ${category   ? prisma.$queryRaw`AND category = ${category}`    : prisma.$queryRaw``}
        ${difficulty ? prisma.$queryRaw`AND difficulty = ${difficulty}` : prisma.$queryRaw``}
      ORDER BY rank DESC, "viewCount" DESC
      LIMIT ${limitVal}
    `;

    // Build rich result: include a short snippet from the body
    const results = rawResults.map(r => ({
      ...toListItem(r),
      snippet:    stripMarkdown(r.summary, 200),
      rank:       Number(r.rank),
    }));

    // Log search event (fire-and-forget)
    prisma.kbSearchEvent.create({
      data: {
        workspaceId,
        query:        q,
        resultsCount: results.length,
      },
    }).catch(() => {});

    return res.json({
      query:       q,
      count:       results.length,
      results,
    });
  } catch (err: any) {
    console.error("[kb/search]", err.message);
    return res.status(500).json({ error: "Search failed." });
  }
});

// ─── GET /api/kb/recommendations ─────────────────────────────────────────────
// Context-aware recommendations. No query needed — driven by page context.
// Query params: ?context=live-feed&limit=5

router.get("/recommendations", async (req: Request, res: Response) => {
  try {
    const context  = String(req.query.context || "");
    const limitVal = Math.min(parseInt(String(req.query.limit || "5"), 10) || 5, 10);

    const contextTags = CONTEXT_TAGS[context] ?? [];

    let articles: any[];

    if (contextTags.length > 0) {
      // Score each article by how many context tags it contains
      const candidates = await prisma.kbArticle.findMany({
        where: { published: true },
        orderBy: [{ featured: "desc" }, { viewCount: "desc" }],
        take: 50, // narrow to top 50 by popularity, then score in memory
      });

      articles = candidates
        .map(a => {
          const aTags = safeJson(a.tags, []) as string[];
          const aUseCase = safeJson(a.useCase, []) as string[];
          const allTags = [...aTags, ...aUseCase];
          const score = contextTags.filter(t => allTags.includes(t)).length;
          return { ...a, _contextScore: score };
        })
        .filter(a => a._contextScore > 0)
        .sort((x, y) => y._contextScore - x._contextScore || y.viewCount - x.viewCount)
        .slice(0, limitVal);
    } else {
      // No context → return featured + most popular
      articles = await prisma.kbArticle.findMany({
        where:   { published: true },
        orderBy: [{ featured: "desc" }, { viewCount: "desc" }],
        take:    limitVal,
      });
    }

    return res.json(articles.map(a => ({
      ...toListItem(a),
      contextScore: (a as any)._contextScore ?? null,
    })));
  } catch (err: any) {
    console.error("[kb/recommendations]", err.message);
    return res.status(500).json({ error: "Failed to load recommendations." });
  }
});

// ─── GET /api/kb/trending ─────────────────────────────────────────────────────
// Most viewed in the last 7 days — uses all-time viewCount as proxy (no time series needed).

router.get("/trending", async (req: Request, res: Response) => {
  try {
    const limitVal = Math.min(parseInt(String(req.query.limit || "5"), 10) || 5, 10);

    const articles = await prisma.kbArticle.findMany({
      where:   { published: true },
      orderBy: [{ viewCount: "desc" }, { helpfulCount: "desc" }],
      take:    limitVal,
    });

    return res.json(articles.map(toListItem));
  } catch (err: any) {
    console.error("[kb/trending]", err.message);
    return res.status(500).json({ error: "Failed to load trending articles." });
  }
});

// ─── GET /api/kb/gaps ─────────────────────────────────────────────────────────
// Unresolved search queries — searches with no click or no results.
// Authenticated. Helps identify knowledge gaps to fill with new articles.

router.get("/gaps", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    type GapRow = { query: string; count: bigint; avgResults: number };

    const gaps = await prisma.$queryRaw<GapRow[]>`
      SELECT
        lower(trim(query)) AS query,
        COUNT(*)           AS count,
        AVG("resultsCount")::float AS "avgResults"
      FROM "KbSearchEvent"
      WHERE
        "createdAt" >= ${since}
        AND (
          "clickedArticleId" IS NULL
          OR "resultsCount" = 0
        )
      GROUP BY lower(trim(query))
      HAVING COUNT(*) >= 2
      ORDER BY count DESC, "avgResults" ASC
      LIMIT 30
    `;

    return res.json(gaps.map(g => ({
      query:      g.query,
      count:      Number(g.count),
      avgResults: Math.round(g.avgResults * 10) / 10,
    })));
  } catch (err: any) {
    console.error("[kb/gaps]", err.message);
    return res.status(500).json({ error: "Failed to load search gaps." });
  }
});

// ─── POST /api/kb/search-event ────────────────────────────────────────────────
// Called by the frontend after a search to record the query + result count.
// Body: { query, resultsCount }
// Returns the created searchEvent id (used later to record a click).

router.post("/search-event", async (req: Request, res: Response) => {
  try {
    const { query, resultsCount } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const workspaceId = await optionalWorkspaceId(req);

    const event = await prisma.kbSearchEvent.create({
      data: {
        workspaceId,
        query:        String(query).slice(0, 300),
        resultsCount: Number(resultsCount) || 0,
      },
    });

    return res.json({ id: event.id });
  } catch (err: any) {
    console.error("[kb/search-event]", err.message);
    return res.status(500).json({ error: "Failed to record search event." });
  }
});

// ─── POST /api/kb/search-event/:id/click ─────────────────────────────────────
// Records which article was clicked from a search result.
// Body: { articleSlug }

router.post("/search-event/:id/click", async (req: Request, res: Response) => {
  try {
    const { articleSlug } = req.body || {};
    if (!articleSlug) return res.status(400).json({ error: "articleSlug is required" });

    const article = await prisma.kbArticle.findUnique({
      where:  { slug: String(articleSlug) },
      select: { id: true },
    });
    if (!article) return res.status(404).json({ error: "Article not found." });

    const event = await prisma.kbSearchEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!event) return res.status(404).json({ error: "Search event not found." });

    await prisma.kbSearchEvent.update({
      where: { id: req.params.id },
      data: {
        clickedArticleId: article.id,
        resolved:         true,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[kb/search-event/click]", err.message);
    return res.status(500).json({ error: "Failed to record click." });
  }
});

// ─── POST /api/kb/feedback ────────────────────────────────────────────────────
// Submit helpful / not-helpful vote on an article.
// Body: { articleSlug, helpful: boolean, comment?: string }

router.post("/feedback", async (req: Request, res: Response) => {
  try {
    const { articleSlug, helpful, comment } = req.body || {};
    if (!articleSlug) return res.status(400).json({ error: "articleSlug is required" });
    if (typeof helpful !== "boolean") return res.status(400).json({ error: "helpful must be boolean" });

    const article = await prisma.kbArticle.findUnique({
      where:  { slug: String(articleSlug) },
      select: { id: true },
    });
    if (!article) return res.status(404).json({ error: "Article not found." });

    const workspaceId = await optionalWorkspaceId(req);

    await prisma.$transaction([
      prisma.kbArticleFeedback.create({
        data: {
          articleId:   article.id,
          workspaceId,
          helpful,
          comment:     comment ? String(comment).slice(0, 1000) : null,
        },
      }),
      // Update article counters
      prisma.kbArticle.update({
        where: { id: article.id },
        data: helpful
          ? { helpfulCount:    { increment: 1 } }
          : { notHelpfulCount: { increment: 1 } },
      }),
    ]);

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[kb/feedback]", err.message);
    return res.status(500).json({ error: "Failed to record feedback." });
  }
});

export default router;
