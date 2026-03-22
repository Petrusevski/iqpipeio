/**
 * push.ts  —  Web Push notification endpoints
 *
 * Endpoints:
 *   GET  /api/push/config      — returns VAPID public key (unauthenticated OK)
 *   POST /api/push/subscribe   — save/update a push subscription (auth required)
 *   DELETE /api/push/subscribe — remove a push subscription (auth required)
 *   POST /api/push/test        — send a test notification (auth required, dev helper)
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import {
  getVapidPublicKey,
  vapidConfigured,
  notifyUser,
} from "../utils/webPush";

const router = Router();

// ─── GET /api/push/config ──────────────────────────────────────────────────
// Returns the VAPID public key so the client can create a PushSubscription.
// Public — no auth required (the public key is safe to expose).

router.get("/config", (_req: Request, res: Response) => {
  if (!vapidConfigured) {
    return res.status(503).json({
      error: "Push notifications are not configured on this server.",
      detail: "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY in server/.env",
    });
  }
  return res.json({ vapidPublicKey: getVapidPublicKey() });
});

// ─── POST /api/push/subscribe ─────────────────────────────────────────────
// Register or update a push subscription for the authenticated user.
// Body: { endpoint, keys: { p256dh, auth }, eventTypes?: string[] | null }
//
// eventTypes: null or omitted → all events
//             string[]        → only these event types

router.post("/subscribe", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!vapidConfigured) {
    return res.status(503).json({ error: "Push not configured." });
  }

  const { endpoint, keys, eventTypes } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    eventTypes?: string[] | null;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({
      error: "Missing required fields: endpoint, keys.p256dh, keys.auth",
    });
  }

  // Resolve the user's primary workspace
  const membership = await prisma.workspaceUser.findFirst({
    where:   { userId: req.user!.id },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return res.status(404).json({ error: "No workspace found." });
  }

  const eventTypesJson = eventTypes ? JSON.stringify(eventTypes) : null;

  // Upsert by endpoint (one device = one endpoint)
  const sub = await prisma.pushSubscription.upsert({
    where:  { endpoint },
    update: {
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      userId:     req.user!.id,
      workspaceId: membership.workspaceId,
      eventTypes: eventTypesJson,
    },
    create: {
      endpoint,
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      userId:     req.user!.id,
      workspaceId: membership.workspaceId,
      eventTypes: eventTypesJson,
    },
  });

  return res.json({ ok: true, id: sub.id });
});

// ─── DELETE /api/push/subscribe ───────────────────────────────────────────
// Unsubscribe a device. Body: { endpoint }

router.delete("/subscribe", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint is required." });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: req.user!.id },
  });

  return res.json({ ok: true });
});

// ─── GET /api/push/preferences ────────────────────────────────────────────
// Returns the current user's push preferences (which event types are enabled).
// Body: { endpoint } as query param

router.get("/preferences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const endpoint = req.query.endpoint as string | undefined;

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint query param required." });
  }

  const sub = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { eventTypes: true, id: true },
  });

  if (!sub || sub.id === undefined) {
    return res.json({ subscribed: false, eventTypes: null });
  }

  return res.json({
    subscribed: true,
    eventTypes: sub.eventTypes ? JSON.parse(sub.eventTypes) : null,
  });
});

// ─── PATCH /api/push/preferences ──────────────────────────────────────────
// Update event type preferences for an existing subscription.
// Body: { endpoint, eventTypes: string[] | null }

router.patch("/preferences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { endpoint, eventTypes } = req.body as {
    endpoint?: string;
    eventTypes?: string[] | null;
  };

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint is required." });
  }

  await prisma.pushSubscription.updateMany({
    where: { endpoint, userId: req.user!.id },
    data:  { eventTypes: eventTypes ? JSON.stringify(eventTypes) : null },
  });

  return res.json({ ok: true });
});

// ─── POST /api/push/test ──────────────────────────────────────────────────
// Send a test notification to the current user's devices.
// Useful for verifying the setup from Settings page.

router.post("/test", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!vapidConfigured) {
    return res.status(503).json({ error: "Push not configured." });
  }

  const result = await notifyUser(req.user!.id, {
    title:     "iqpipe — test notification",
    body:      "Push notifications are working correctly.",
    url:       "/settings",
    eventType: "test",
  });

  return res.json(result);
});

export default router;
