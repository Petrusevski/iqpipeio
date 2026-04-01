/**
 * quota.ts — Per-workspace event quota + per-minute rate limit management
 *
 * Monthly quota limits:
 *   trial   →    500 events/month
 *   free    →    500 events/month
 *   starter →  10,000 events/month
 *   growth  →  50,000 events/month
 *   agency  → 500,000 events/month
 *
 * Per-minute rate limits (workspace-wide, all ingestion routes):
 *   trial / free →  60 events/min
 *   starter      → 120 events/min
 *   growth       → 300 events/min
 *   agency       → 600 events/min
 *
 * Both counters live in the Workspace table alongside the existing
 * eventCountMonth / eventCountResetAt columns, using the same reset pattern.
 * checkAndIncrementQuota() reads and writes both in a single DB round-trip.
 */

import { prisma } from "../db";
import { createNotification } from "../services/notificationService";

export const PLAN_LIMITS: Record<string, number> = {
  trial:   500,
  free:    500,
  starter: 10_000,
  growth:  50_000,
  agency:  500_000,
};

export const MINUTE_LIMITS: Record<string, number> = {
  trial:   60,
  free:    60,
  starter: 120,
  growth:  300,
  agency:  600,
};

export function getEventLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? 500;
}

export function getMinuteLimit(plan: string): number {
  return MINUTE_LIMITS[plan] ?? 60;
}

/** Shape returned by resolveWorkspaceFromRequest — pass as `prefetched` to skip a second DB read. */
export interface WorkspaceQuotaFields {
  id:                 string;
  plan:               string;
  eventCountMonth:    number;
  eventCountResetAt:  Date | null;
  eventCountMinute:   number;
  rateLimitResetAt:   Date | null;
}

/**
 * Check both the per-minute rate limit and the monthly quota for a workspace.
 * Increments both counters in a single UPDATE if the request is allowed.
 *
 * @param workspaceId  The workspace to check.
 * @param opts.prefetched   Pre-fetched workspace row — avoids a second DB read when the
 *                          route handler has already loaded the workspace for auth.
 * @param opts.skipMinuteLimit  Pass true for background processors (e.g. n8n queue)
 *                              that have their own concurrency controls.
 */
export async function checkAndIncrementQuota(
  workspaceId: string,
  opts?: { prefetched?: WorkspaceQuotaFields; skipMinuteLimit?: boolean },
): Promise<{
  allowed:     boolean;
  rateLimited: boolean; // true when the minute window is exceeded (not the monthly quota)
  count:       number;
  limit:       number;
  pct:         number;
}> {
  const ws: WorkspaceQuotaFields | null = opts?.prefetched ?? await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: {
      id: true, plan: true,
      eventCountMonth: true, eventCountResetAt: true,
      eventCountMinute: true, rateLimitResetAt: true,
    },
  });

  if (!ws) return { allowed: false, rateLimited: false, count: 0, limit: 0, pct: 100 };

  const monthLimit  = getEventLimit(ws.plan);
  const minuteLimit = getMinuteLimit(ws.plan);
  const now         = new Date();
  const nowMs       = now.getTime();

  // ── Monthly reset: first event of a new calendar month resets the counter ─
  const needsMonthReset =
    !ws.eventCountResetAt ||
    ws.eventCountResetAt.getUTCMonth()    !== now.getUTCMonth() ||
    ws.eventCountResetAt.getUTCFullYear() !== now.getUTCFullYear();

  // ── Minute window: reset when > 60 s has elapsed since the window opened ──
  const windowExpired =
    !ws.rateLimitResetAt ||
    nowMs - ws.rateLimitResetAt.getTime() >= 60_000;

  // ── Gate checks (no DB write if blocked) ─────────────────────────────────
  if (!needsMonthReset && ws.eventCountMonth >= monthLimit) {
    return { allowed: false, rateLimited: false, count: ws.eventCountMonth, limit: monthLimit, pct: 100 };
  }
  if (!opts?.skipMinuteLimit && !windowExpired && ws.eventCountMinute >= minuteLimit) {
    return {
      allowed:     false,
      rateLimited: true,
      count:       ws.eventCountMonth,
      limit:       monthLimit,
      pct:         Math.round((ws.eventCountMonth / monthLimit) * 100),
    };
  }

  // ── Compute new counter values ────────────────────────────────────────────
  const newMonthCount  = needsMonthReset ? 1 : ws.eventCountMonth  + 1;
  const newMinuteCount = windowExpired   ? 1 : ws.eventCountMinute + 1;

  // ── Single UPDATE for both counters ──────────────────────────────────────
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      eventCountMonth:  newMonthCount,
      ...(needsMonthReset ? { eventCountResetAt: now } : {}),
      ...(opts?.skipMinuteLimit ? {} : {
        eventCountMinute: newMinuteCount,
        ...(windowExpired ? { rateLimitResetAt: now } : {}),
      }),
    },
  });

  const pct  = Math.round((newMonthCount / monthLimit) * 100);
  const prev = needsMonthReset ? 0 : ws.eventCountMonth;

  // 80% warning — fired once per calendar month (only when threshold is crossed)
  const threshold80 = Math.floor(monthLimit * 0.8);
  if (prev < threshold80 && newMonthCount >= threshold80) {
    createNotification({
      workspaceId,
      type:     "quota_warning",
      title:    "You've used 80% of your monthly event quota",
      body:     `Your workspace has processed ${newMonthCount.toLocaleString()} of ${monthLimit.toLocaleString()} events this month. ` +
                `Upgrade your plan to avoid disruption when you hit 100%.`,
      severity: "warning",
      metadata: JSON.stringify({ count: newMonthCount, limit: monthLimit, pct: 80 }),
    }).catch(() => {});
  }

  return { allowed: true, rateLimited: false, count: newMonthCount, limit: monthLimit, pct };
}

/** Soft-block response payload — returned when the monthly quota is exceeded. */
export function quotaExceededResponse() {
  return {
    error:   "Monthly event quota exceeded.",
    code:    "QUOTA_EXCEEDED",
    message: "Upgrade your plan to continue processing events. Existing data is safe.",
  };
}

/** Rate-limit response payload — returned when the per-minute window is full. */
export function rateLimitExceededResponse() {
  return {
    error:            "Too many events from this workspace. Slow down your automation triggers.",
    code:             "RATE_LIMITED",
    retryAfterSeconds: 60,
  };
}
