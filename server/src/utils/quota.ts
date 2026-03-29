/**
 * quota.ts — Per-workspace event quota management
 *
 * Plans and limits:
 *   trial   →    500 events/month
 *   free    →    500 events/month
 *   starter →  10,000 events/month
 *   growth  →  50,000 events/month
 *   agency  → 500,000 events/month
 *
 * At 80%: warning notification (sent once per calendar month)
 * At 100%: events are soft-blocked and flagged as quota_exceeded
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

export function getEventLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? 500;
}

/** Returns true if the workspace is over quota this month. Increments the counter. */
export async function checkAndIncrementQuota(workspaceId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
  pct: number;
}> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, eventCountMonth: true, eventCountResetAt: true },
  });
  if (!ws) return { allowed: false, count: 0, limit: 0, pct: 100 };

  const limit = getEventLimit(ws.plan);
  const now   = new Date();

  // Reset counter on 1st of month
  const needsReset =
    !ws.eventCountResetAt ||
    ws.eventCountResetAt.getUTCMonth() !== now.getUTCMonth() ||
    ws.eventCountResetAt.getUTCFullYear() !== now.getUTCFullYear();

  if (needsReset) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { eventCountMonth: 1, eventCountResetAt: now },
    });
    return { allowed: true, count: 1, limit, pct: Math.round((1 / limit) * 100) };
  }

  const prev  = ws.eventCountMonth;
  const count = prev + 1;

  if (prev >= limit) {
    // Already at cap — don't increment further, return denied
    return { allowed: false, count: prev, limit, pct: 100 };
  }

  // Increment
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { eventCountMonth: count },
  });

  const pct = Math.round((count / limit) * 100);

  // Send 80% warning — but only once per month
  // We detect "just crossed 80%" by checking prev was below and now is at/above
  const threshold80 = Math.floor(limit * 0.8);
  if (prev < threshold80 && count >= threshold80) {
    createNotification({
      workspaceId,
      type:     "quota_warning",
      title:    "You've used 80% of your monthly event quota",
      body:     `Your workspace has processed ${count.toLocaleString()} of ${limit.toLocaleString()} events this month. ` +
                `Upgrade your plan to avoid disruption when you hit 100%.`,
      severity: "warning",
      metadata: JSON.stringify({ count, limit, pct: 80 }),
    }).catch(() => {});
  }

  return { allowed: true, count, limit, pct };
}

/** Soft-block response payload — returned when quota is exceeded. */
export function quotaExceededResponse() {
  return {
    error:   "Monthly event quota exceeded.",
    code:    "QUOTA_EXCEEDED",
    message: "Upgrade your plan to continue processing events. Existing data is safe.",
  };
}
