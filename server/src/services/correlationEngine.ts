/**
 * correlationEngine.ts
 *
 * Links incoming direct app events (AppEvent) with automation execution
 * events (N8nQueuedEvent) stored in iqpipe, using a shared correlation
 * value (email / domain / phone) within a ±10-minute time window.
 *
 * Called after every inbound AppEvent is persisted.
 */

import { prisma } from "../db";

// ── Time window ────────────────────────────────────────────────────────────────
const WINDOW_MS = 10 * 60 * 1000; // ±10 minutes

// ── Email extraction paths ─────────────────────────────────────────────────────
// Different apps nest the contact email in different payload locations.
// We try each path in order and return the first non-empty string found.

const EMAIL_PATHS: Array<(p: Record<string, any>) => string | undefined> = [
  p => p?.email,
  p => p?.contact?.email,
  p => p?.properties?.email,
  p => p?.properties?.hs_email_address,
  p => p?.person?.email,
  p => p?.lead?.email,
  p => p?.record?.values?.email?.[0]?.email,         // Attio
  p => p?.data?.email,
  p => p?.subscriber?.email,
  p => p?.recipient?.email,
  p => p?.payload?.email,
  p => p?.metadata?.email,
];

const DOMAIN_PATHS: Array<(p: Record<string, any>) => string | undefined> = [
  p => p?.domain,
  p => p?.company_domain,
  p => p?.properties?.domain,
  p => p?.properties?.website,
  p => extractDomain(p?.email),
  p => extractDomain(p?.contact?.email),
  p => extractDomain(p?.properties?.email),
];

const PHONE_PATHS: Array<(p: Record<string, any>) => string | undefined> = [
  p => p?.phone,
  p => p?.properties?.phone,
  p => p?.contact?.phone,
  p => p?.person?.phone,
];

function extractDomain(email: string | undefined): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1].toLowerCase();
}

function normalise(v: string | undefined): string | undefined {
  return v?.trim().toLowerCase() || undefined;
}

export function extractCorrelationValue(
  payload: Record<string, any>,
  key: "email" | "domain" | "phone",
): string | undefined {
  const paths =
    key === "email"  ? EMAIL_PATHS  :
    key === "domain" ? DOMAIN_PATHS :
    PHONE_PATHS;

  for (const fn of paths) {
    const v = normalise(fn(payload));
    if (v) return v;
  }
  return undefined;
}

// ── Contact field extractor from N8nQueuedEvent.contact JSON ──────────────────

function extractFromContact(
  contactJson: string,
  key: "email" | "domain" | "phone",
): string | undefined {
  try {
    const c = JSON.parse(contactJson);
    if (key === "email")  return normalise(c.email);
    if (key === "phone")  return normalise(c.phone);
    if (key === "domain") {
      if (c.company_domain) return normalise(c.company_domain);
      return extractDomain(c.email);
    }
  } catch { /* ignore */ }
  return undefined;
}

// ── Main correlation function ──────────────────────────────────────────────────

export async function correlateAppEvent(appEventId: string): Promise<void> {
  const appEvent = await prisma.appEvent.findUnique({
    where: { id: appEventId },
    include: { correlations: true },
  });
  if (!appEvent || appEvent.correlatedAt) return; // already processed

  // Find all mirrors for this workspace that have this app connected
  const connections = await prisma.workflowAppConnection.findMany({
    where:   { workspaceId: appEvent.workspaceId, appKey: appEvent.appKey, status: "connected" },
    include: { mirror: true },
  });
  if (connections.length === 0) return;

  let payload: Record<string, any> = {};
  try { payload = JSON.parse(appEvent.payload); } catch { /* ignore */ }

  const results: Array<{
    mirrorId: string;
    correlationKey: string;
    correlationValue: string;
    n8nEventId: string | null;
    verified: boolean;
    discrepancy: string | null;
  }> = [];

  for (const conn of connections) {
    const mirror = conn.mirror;
    const corrKey = mirror.correlationKey as "email" | "domain" | "phone" | null;
    if (!corrKey) continue;

    const corrValue = appEvent.correlationValue
      ?? extractCorrelationValue(payload, corrKey);
    if (!corrValue) continue;

    // Update AppEvent with extracted correlation value if not yet set
    if (!appEvent.correlationValue) {
      await prisma.appEvent.update({
        where: { id: appEventId },
        data:  { correlationValue: corrValue, mirrorId: mirror.id },
      });
    }

    // Find matching N8nQueuedEvent within the time window
    const windowStart = new Date(appEvent.receivedAt.getTime() - WINDOW_MS);
    const windowEnd   = new Date(appEvent.receivedAt.getTime() + WINDOW_MS);

    // We need to find the n8n workflow ID (n8nId string, not the DB id)
    // The mirror.workflowId is the DB id of N8nWorkflowMeta
    let n8nWorkflowNativeId: string | null = null;
    if (mirror.platform === "n8n") {
      const wfMeta = await prisma.n8nWorkflowMeta.findUnique({
        where:  { id: mirror.workflowId },
        select: { n8nId: true },
      });
      n8nWorkflowNativeId = wfMeta?.n8nId ?? null;
    }

    let matchedN8nEventId: string | null = null;
    let verified = false;
    let discrepancy: Record<string, any> | null = null;

    if (n8nWorkflowNativeId) {
      // Find N8nQueuedEvents from this workflow in the time window
      // that share the same correlation value
      const candidates = await prisma.n8nQueuedEvent.findMany({
        where: {
          workspaceId: appEvent.workspaceId,
          workflowId:  n8nWorkflowNativeId,
          createdAt:   { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, contact: true, status: true, eventType: true },
      });

      for (const cand of candidates) {
        const candValue = extractFromContact(cand.contact, corrKey);
        if (candValue === corrValue) {
          matchedN8nEventId = cand.id;
          verified = cand.status === "done";

          // Check for discrepancies: n8n said done but we want to surface
          // any mismatch between automation claim and real app event
          if (cand.status !== "done") {
            discrepancy = { n8nStatus: cand.status, n8nEventType: cand.eventType };
          }
          break;
        }
      }
    }

    results.push({
      mirrorId:         mirror.id,
      correlationKey:   corrKey,
      correlationValue: corrValue,
      n8nEventId:       matchedN8nEventId,
      verified,
      discrepancy:      discrepancy ? JSON.stringify(discrepancy) : null,
    });
  }

  if (results.length === 0) return;

  // Persist all correlation results
  await prisma.correlationResult.createMany({
    data: results.map(r => ({
      workspaceId:      appEvent.workspaceId,
      mirrorId:         r.mirrorId,
      n8nEventId:       r.n8nEventId,
      appEventId:       appEventId,
      appKey:           appEvent.appKey,
      correlationKey:   r.correlationKey,
      correlationValue: r.correlationValue,
      verified:         r.verified,
      discrepancy:      r.discrepancy,
    })),
    skipDuplicates: true,
  });

  await prisma.appEvent.update({
    where: { id: appEventId },
    data:  { correlatedAt: new Date() },
  });
}
