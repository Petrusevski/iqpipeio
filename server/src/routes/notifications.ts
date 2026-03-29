// server/src/routes/notifications.ts
import { Router } from "express";
import { prisma } from "../db";
import { encrypt } from "../utils/encryption";
import { requireAuth } from "../middleware/auth"; // adjust path if needed

const router = Router();

/**
 * GET /api/notifications
 * Returns latest notifications for the current user's workspace.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth || (req as any).user;
    const workspaceId: string | undefined = auth?.workspaceId;
    const userId: string | undefined = auth?.userId;

    if (!workspaceId) {
      return res.status(400).json({ error: "Missing workspaceId in auth payload" });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        workspaceId,
        OR: [
          { userId: null },        // workspace-wide notifications
          { userId: userId || "" } // personal notifications
        ]
      },
      orderBy: { createdAt: "desc" },
      take:    30,
      select: {
        id:        true,
        type:      true,
        title:     true,
        body:      true,
        severity:  true,
        metadata:  true,
        isRead:    true,
        createdAt: true,
      },
    });

    res.json({ notifications });
  } catch (err: any) {
    console.error("Error fetching notifications", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

/**
 * POST /api/notifications/mark-read
 * Body: { ids: string[] } – marks these notifications as read.
 * If ids is empty/omitted, marks all for this user/workspace as read.
 */
router.post("/mark-read", requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth || (req as any).user;
    const workspaceId: string | undefined = auth?.workspaceId;
    const userId: string | undefined = auth?.userId;
    const { ids } = req.body as { ids?: string[] };

    if (!workspaceId) {
      return res.status(400).json({ error: "Missing workspaceId in auth payload" });
    }

    await prisma.notification.updateMany({
      where: {
        workspaceId,
        ...(ids && ids.length
          ? { id: { in: ids } }
          : {}), // if no ids, mark all for this user/workspace
        OR: [
          { userId: null },
          { userId: userId || "" }
        ]
      },
      data: {
        isRead: true,
        readAt: new Date()
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error marking notifications as read", err);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

/**
 * POST /api/notifications/retain-app
 *
 * Called when the user clicks "Keep Connected" on an app_removed notification.
 * Creates (or updates) an IntegrationConnection for the removed app using the
 * credentials the user provides, and optionally stores a webhook secret for
 * direct event ingestion independent of any n8n/Make workflow.
 *
 * Body:
 *   notificationId  string    — the app_removed notification
 *   apiKey?         string    — API key for the app (if API-auth type)
 *   webhookSecret?  string    — HMAC secret for webhook verification
 *   selectedEvents  string[]  — event keys the user wants to track
 */
router.post("/retain-app", requireAuth, async (req, res) => {
  try {
    const auth        = (req as any).auth || (req as any).user;
    const workspaceId = auth?.workspaceId as string | undefined;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspaceId" });

    const { notificationId, apiKey, webhookSecret, selectedEvents } = req.body as {
      notificationId: string;
      apiKey?:        string;
      webhookSecret?: string;
      selectedEvents?: string[];
    };

    if (!notificationId) return res.status(400).json({ error: "notificationId required" });

    // Load the notification and parse its metadata
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, workspaceId, type: "app_removed" },
    });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    let meta: { appKey?: string; workflowName?: string; platform?: string } = {};
    try { meta = JSON.parse(notification.metadata ?? "{}"); } catch { /* ignore */ }

    const appKey = meta.appKey;
    if (!appKey) return res.status(400).json({ error: "No appKey in notification metadata" });

    // Build authData JSON for IntegrationConnection
    const authData: Record<string, string> = {};
    if (apiKey)        authData.apiKey        = apiKey;
    if (webhookSecret) authData.webhookSecret  = webhookSecret;

    // Upsert a direct IntegrationConnection for this provider
    const existing = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: appKey },
    });

    let connection;
    if (existing) {
      connection = await prisma.integrationConnection.update({
        where: { id: existing.id },
        data: {
          status:   "connected",
          authData: Object.keys(authData).length > 0
            ? encrypt(JSON.stringify(authData))
            : existing.authData,
        },
      });
    } else {
      connection = await prisma.integrationConnection.create({
        data: {
          workspaceId,
          provider: appKey,
          status:   "connected",
          authData: Object.keys(authData).length > 0
            ? encrypt(JSON.stringify(authData))
            : null,
        },
      });
    }

    // Persist selected events on the notification metadata for UI reference
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead:   true,
        readAt:   new Date(),
        metadata: JSON.stringify({
          ...meta,
          retained:       true,
          selectedEvents: selectedEvents ?? [],
          connectionId:   connection.id,
        }),
      },
    });

    // Build webhook URL the user should register in the tool's dashboard
    const baseUrl    = `${req.protocol}://${req.get("host")}`;
    const webhookUrl = `${baseUrl}/api/app-webhooks/${appKey}?workspaceId=${workspaceId}`;

    return res.json({
      ok: true,
      connectionId: connection.id,
      provider:     appKey,
      webhookUrl,
      selectedEvents: selectedEvents ?? [],
      note: webhookSecret
        ? `Register the webhook URL in your ${appKey} dashboard. Use the secret you provided for HMAC signature verification.`
        : `Integration connected. Register the webhook URL in your ${appKey} dashboard to start receiving events.`,
    });
  } catch (err: any) {
    console.error("Error retaining app connection", err);
    res.status(500).json({ error: "Failed to retain app connection" });
  }
});

export default router;
