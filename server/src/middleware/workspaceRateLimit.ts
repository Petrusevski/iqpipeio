/**
 * workspaceRateLimit.ts — Sliding window rate limiter keyed by workspaceId
 *
 * Unlike IP-based rate limiting, this ensures one workspace with many
 * concurrent nodes/webhooks cannot flood the ingest pipeline and
 * affect other workspaces.
 *
 * Limits:
 *   POST /api/events          → 300 req/min per workspace
 *   POST /api/webhooks/*      → 200 req/min per workspace
 *   n8n queue processor uses checkAndIncrementQuota() instead (monthly limit)
 */

import { Request, Response, NextFunction } from "express";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

// Periodically clean up stale entries (workspaces with no recent traffic)
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, entry] of windows.entries()) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      windows.delete(key);
    }
  }
}, 60_000);

function slidingWindowLimit(
  getKey: (req: Request) => string | null,
  maxRequests: number,
  windowMs: number,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getKey(req);
    if (!key) return next(); // no workspace resolved yet — let auth handle it

    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      windows.set(key, entry);
    }

    // Drop timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= maxRequests) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: "Too many requests from this workspace. Slow down your automation triggers.",
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      });
    }

    entry.timestamps.push(now);
    next();
  };
}

/**
 * Extracts workspaceId from the publicApiKey or falls back to
 * a placeholder derived from the Authorization header.
 * Full workspace resolution happens later in the route handler.
 * We use the raw key as the rate-limit bucket — good enough.
 */
function keyFromRequest(req: Request): string | null {
  const apiKey = (req.headers["x-api-key"] as string) || (req.query.key as string);
  if (apiKey) return `apikey:${apiKey}`;

  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Bearer ")) return `jwt:${auth.slice(7, 40)}`; // truncated token prefix

  const wsId = req.query.workspaceId as string;
  if (wsId) return `ws:${wsId}`;

  return null;
}

/** 300 req/min — for POST /api/events */
export const eventsRateLimit = slidingWindowLimit(keyFromRequest, 300, 60_000);

/** 200 req/min — for POST /api/webhooks/* and /api/app-webhooks */
export const webhookRateLimit = slidingWindowLimit(keyFromRequest, 200, 60_000);
