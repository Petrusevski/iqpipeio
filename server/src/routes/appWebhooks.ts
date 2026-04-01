/**
 * appWebhooks.ts
 *
 * Unified inbound webhook endpoint for direct app events.
 * Each app posts to:
 *   POST /api/app-webhooks/:appKey?workspaceId=<id>&mirrorId=<id>
 *
 * The raw body is verified against the app's stored webhook secret (if set),
 * then the event is persisted as an AppEvent and correlation is triggered
 * asynchronously.
 *
 * Supported signature schemes:
 *   HubSpot:   X-HubSpot-Signature-v3  (HMAC-SHA256, base64)
 *   Pipedrive: no signature (rely on secret token in query)
 *   Instantly: X-Instantly-Signature   (HMAC-SHA256, hex)
 *   Stripe:    Stripe-Signature        (handled separately in checkout.ts)
 *   Generic:   X-Webhook-Secret header or ?secret= query param
 */

import crypto from "crypto";
import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { correlateAppEvent } from "../services/correlationEngine";
import { APP_CATALOG } from "./workflowMirror";
import { checkAndIncrementQuota } from "../utils/quota";

const router = Router();

// ── Signature verification ────────────────────────────────────────────────────

function verifyHubSpot(rawBody: Buffer, secret: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function verifyHmacHex(rawBody: Buffer, secret: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

function verifySignature(
  appKey: string,
  rawBody: Buffer,
  secret: string,
  req: Request,
): boolean {
  if (!secret) return true; // no secret configured — accept all

  if (appKey === "hubspot") {
    const sig = req.headers["x-hubspot-signature-v3"] as string;
    return sig ? verifyHubSpot(rawBody, secret, sig) : false;
  }

  if (appKey === "instantly") {
    const sig = req.headers["x-instantly-signature"] as string;
    return sig ? verifyHmacHex(rawBody, secret, sig) : false;
  }

  if (appKey === "lemlist") {
    const sig = req.headers["x-lemlist-signature"] as string;
    return sig ? verifyHmacHex(rawBody, secret, sig) : false;
  }

  // Generic fallback: X-Webhook-Secret header or ?secret= query
  const headerSecret = req.headers["x-webhook-secret"] as string;
  const querySecret  = req.query.secret as string;
  const provided     = headerSecret || querySecret;
  if (!provided) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(provided));
}

// ── Event key extraction ──────────────────────────────────────────────────────
// Different apps encode the event type in different payload fields.

function extractEventKey(appKey: string, payload: Record<string, any>): string {
  if (appKey === "hubspot") {
    const ev = Array.isArray(payload) ? payload[0] : payload;
    return ev?.subscriptionType ?? ev?.eventType ?? "unknown";
  }
  if (appKey === "pipedrive") return payload?.event ?? "unknown";
  if (appKey === "attio")     return payload?.eventType ?? payload?.event_type ?? "unknown";
  if (appKey === "salesforce") return payload?.event ?? "unknown";
  if (appKey === "instantly") return payload?.event_type ?? payload?.type ?? "unknown";
  if (appKey === "lemlist")   return payload?.type ?? "unknown";
  if (appKey === "heyreach")  return payload?.event ?? payload?.type ?? "unknown";
  if (appKey === "smartlead") return payload?.event_type ?? payload?.event ?? "unknown";
  if (appKey === "stripe")    return payload?.type ?? "unknown";
  if (appKey === "calendly")  return payload?.event ?? "unknown";
  if (appKey === "slack")     return payload?.type ?? "unknown";
  return payload?.event ?? payload?.event_type ?? payload?.type ?? "unknown";
}

// ── POST /api/app-webhooks/:appKey ────────────────────────────────────────────

router.post("/:appKey", async (req: Request, res: Response) => {
  const appKey      = req.params.appKey.toLowerCase();
  const workspaceId = req.query.workspaceId as string;
  const mirrorId    = req.query.mirrorId    as string | undefined;

  if (!workspaceId) {
    return res.status(400).json({ error: "workspaceId required" }) as any;
  }

  // Validate appKey is in our catalog
  if (!APP_CATALOG[appKey]) {
    return res.status(400).json({ error: `Unknown app: ${appKey}` }) as any;
  }

  // Retrieve the workspace connection for this app to get webhook secret
  let webhookSecret: string | null = null;
  if (mirrorId) {
    const conn = await prisma.workflowAppConnection.findFirst({
      where:  { workspaceId, mirrorId, appKey, status: "connected" },
      select: { webhookSecret: true },
    });
    webhookSecret = conn?.webhookSecret ?? null;
  }

  // Verify signature if a secret is configured
  const rawBody = req.body as Buffer;
  if (webhookSecret && Buffer.isBuffer(rawBody)) {
    const valid = verifySignature(appKey, rawBody, webhookSecret, req);
    if (!valid) {
      return res.status(401).json({ error: "Invalid webhook signature" }) as any;
    }
  }

  // Parse payload
  let payload: Record<string, any> = {};
  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : JSON.stringify(rawBody);
    payload = JSON.parse(bodyStr);
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" }) as any;
  }

  const eventKey = extractEventKey(appKey, payload);

  // Quota + rate-limit guard — same drop-and-200 semantics as webhooks.ts
  const quota = await checkAndIncrementQuota(workspaceId);
  if (!quota.allowed) return res.status(200).json({ received: true }) as any;

  // Persist the AppEvent
  const appEvent = await prisma.appEvent.create({
    data: {
      workspaceId,
      appKey,
      mirrorId:   mirrorId ?? null,
      eventKey,
      payload:    JSON.stringify(payload),
      receivedAt: new Date(),
    },
  });

  // Mark the connection as active
  if (mirrorId) {
    await prisma.workflowAppConnection.updateMany({
      where: { workspaceId, mirrorId, appKey },
      data:  { lastEventAt: new Date() },
    });
  }

  // Trigger correlation asynchronously — do not block the webhook response
  correlateAppEvent(appEvent.id).catch(console.error);

  // Most webhook providers expect a fast 200
  return res.status(200).json({ received: true });
});

export default router;
