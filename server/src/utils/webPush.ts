/**
 * webPush.ts  —  IQPipe Web Push notification service
 *
 * Uses the Web Push protocol (RFC 8030) with VAPID authentication.
 * Server-side only: private key never leaves this module.
 *
 * VAPID keys are generated once and stored in environment variables:
 *   VAPID_PUBLIC_KEY   — shared with the client (safe to expose)
 *   VAPID_PRIVATE_KEY  — server-only, never sent to browser
 *   VAPID_SUBJECT      — mailto: or https: contact URI required by VAPID spec
 *
 * Rate limiting: max 10 pushes per subscription per hour to avoid fatigue.
 */

import webpush from "web-push";
import { prisma } from "../db";

// ── VAPID configuration ────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || "mailto:support@iqpipe.io";

export const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    "[iqpipe/push] VAPID keys not configured — push notifications disabled.\n" +
    "              Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in server/.env"
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PushPayload {
  title:   string;
  body:    string;
  icon?:   string;
  url?:    string;   // URL to open on click
  eventType: string; // e.g. "deal_won", "payment_failed", "signal_critical"
}

// ── Rate limiting constants ────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX       = 10;              // max pushes per subscription per hour

// ── Core send function ─────────────────────────────────────────────────────

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false on failure (stale subscription removed).
 */
async function sendToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<boolean> {
  if (!vapidConfigured) return false;

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title:     payload.title,
        body:      payload.body,
        icon:      payload.icon ?? "/favicon.svg",
        badge:     "/favicon.svg",
        url:       payload.url ?? "/",
        eventType: payload.eventType,
        timestamp: Date.now(),
      }),
      { TTL: 60 * 60 * 24 }, // 24-hour Time-To-Live
    );

    // Update rate-limit counters
    await prisma.pushSubscription.update({
      where: { id: sub.id },
      data:  { lastSentAt: new Date(), sentCount: { increment: 1 } },
    });

    return true;
  } catch (err: any) {
    // 410 Gone or 404 Not Found = subscription expired; remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      console.log(`[push] Removed stale subscription ${sub.id} (${err.statusCode})`);
    } else {
      console.error(`[push] Failed to send to ${sub.id}:`, err.message);
    }
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a push notification to all subscriptions in a workspace that have
 * opted in to the given eventType (or have no preference filter set).
 *
 * Rate-limited per subscription: max RATE_LIMIT_MAX pushes per hour.
 */
export async function notifyWorkspace(
  workspaceId: string,
  payload: PushPayload,
): Promise<{ sent: number; skipped: number }> {
  if (!vapidConfigured) return { sent: 0, skipped: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { workspaceId },
  });

  let sent = 0;
  let skipped = 0;
  const now = Date.now();

  for (const sub of subs) {
    // Event type filter: if eventTypes is set, only send for matching types
    if (sub.eventTypes) {
      const allowed: string[] = JSON.parse(sub.eventTypes);
      if (!allowed.includes(payload.eventType)) {
        skipped++;
        continue;
      }
    }

    // Rate limiting: reset count if outside window
    const inWindow =
      sub.lastSentAt &&
      now - sub.lastSentAt.getTime() < RATE_LIMIT_WINDOW_MS;

    if (inWindow && sub.sentCount >= RATE_LIMIT_MAX) {
      skipped++;
      continue;
    }

    // Reset counter when window has passed
    if (!inWindow && sub.sentCount > 0) {
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data:  { sentCount: 0 },
      });
    }

    const ok = await sendToSubscription(sub, payload);
    ok ? sent++ : skipped++;
  }

  return { sent, skipped };
}

/**
 * Send a push to a single user across all their devices.
 */
export async function notifyUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; skipped: number }> {
  if (!vapidConfigured) return { sent: 0, skipped: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    const ok = await sendToSubscription(sub, payload);
    ok ? sent++ : skipped++;
  }

  return { sent, skipped };
}

/** The public VAPID key — safe to send to the browser for subscription. */
export const getVapidPublicKey = () => VAPID_PUBLIC_KEY;
