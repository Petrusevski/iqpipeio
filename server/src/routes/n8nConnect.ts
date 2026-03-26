/**
 * n8nConnect.ts
 *
 * Routes for connecting/disconnecting a user's n8n instance.
 *
 * Auth: JWT Bearer token. workspaceId comes from body or query param.
 *
 * POST   /api/n8n-connect/connect     — save API key + baseUrl, test, store
 * DELETE /api/n8n-connect             — disconnect and remove all workflow metadata
 * GET    /api/n8n-connect/status      — connection status + last sync info
 * POST   /api/n8n-connect/sync        — trigger manual sync on-demand
 * GET    /api/n8n-connect/workflows   — list N8nWorkflowMeta for this workspace
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { encrypt } from "../utils/encryption";
import { testN8nConnection, syncN8nConnection, pollN8nExecutions } from "../services/n8nClient";
import { CANONICAL_EVENTS, getCanonicalMeta } from "../utils/eventTaxonomy";

const router = Router();

// ── Resolve workspaceId from body or query param ──────────────────────────────
function getWorkspaceId(req: Request): string {
  return (req.body?.workspaceId as string) || (req.query.workspaceId as string) || "";
}

// ── POST /api/n8n-connect/connect ─────────────────────────────────────────────

router.post("/connect", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string };

  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;
  if (!baseUrl || !apiKey) return res.status(400).json({ error: "baseUrl and apiKey required" }) as any;

  // Normalise baseUrl
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  if (!cleanBase.startsWith("http")) {
    return res.status(400).json({ error: "baseUrl must start with http:// or https://" }) as any;
  }

  // Test connection before saving
  const test = await testN8nConnection(cleanBase, apiKey.trim());
  if (!test.ok) {
    return res.status(400).json({ error: `Cannot reach n8n instance: ${test.error}` }) as any;
  }

  const apiKeyEnc = encrypt(apiKey.trim());

  await prisma.n8nConnection.upsert({
    where:  { workspaceId },
    create: { workspaceId, baseUrl: cleanBase, apiKeyEnc, status: "connected" },
    update: { baseUrl: cleanBase, apiKeyEnc, status: "connected", lastError: null },
  });

  // Kick off initial sync in background (don't await)
  syncN8nConnection(workspaceId).catch(console.error);

  return res.json({ ok: true, message: "Connected — syncing workflows in background" });
});

// ── DELETE /api/n8n-connect ───────────────────────────────────────────────────

router.delete("/", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  await prisma.n8nWorkflowMeta.deleteMany({ where: { workspaceId } });
  await prisma.n8nConnection.deleteMany({ where: { workspaceId } });

  return res.json({ ok: true });
});

// ── GET /api/n8n-connect/status ───────────────────────────────────────────────

router.get("/status", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const conn = await prisma.n8nConnection.findUnique({
    where:  { workspaceId },
    select: {
      baseUrl: true, authType: true, status: true,
      lastSyncAt: true, lastError: true, workflowCount: true,
      lastExecPollAt: true, createdAt: true,
    },
  });

  if (!conn) return res.json({ connected: false });

  return res.json({
    connected:      conn.status !== "disconnected",
    status:         conn.status,
    baseUrl:        conn.baseUrl,
    authType:       conn.authType,
    lastSyncAt:     conn.lastSyncAt?.toISOString() ?? null,
    lastError:      conn.lastError,
    workflowCount:  conn.workflowCount,
    lastExecPollAt: conn.lastExecPollAt?.toISOString() ?? null,
    connectedSince: conn.createdAt.toISOString(),
  });
});

// ── POST /api/n8n-connect/sync ────────────────────────────────────────────────

router.post("/sync", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const conn = await prisma.n8nConnection.findUnique({ where: { workspaceId } });
  if (!conn) return res.status(404).json({ error: "No n8n connection found" }) as any;

  try {
    const result = await syncN8nConnection(workspaceId);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/n8n-connect/workflows ────────────────────────────────────────────

router.get("/workflows", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const workflows = await prisma.n8nWorkflowMeta.findMany({
    where:   { workspaceId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, n8nId: true, name: true, active: true,
      tags: true, appsUsed: true, nodeTypes: true, nodeCount: true,
      triggerType: true, description: true,
      lastUpdatedAt: true, syncedAt: true,
      lastExecCursor: true, eventFilter: true, execSyncEnabled: true,
    },
  });

  return res.json(
    workflows.map(w => ({
      ...w,
      tags:           JSON.parse(w.tags),
      appsUsed:       JSON.parse(w.appsUsed),
      nodeTypes:      JSON.parse(w.nodeTypes),
      eventFilter:    w.eventFilter ? JSON.parse(w.eventFilter) : null,
      lastUpdatedAt:  w.lastUpdatedAt?.toISOString() ?? null,
      syncedAt:       w.syncedAt.toISOString(),
    }))
  );
});

// ── GET /api/n8n-connect/event-filter ─────────────────────────────────────────
// Returns the current event filter config for a specific workflow.

router.get("/event-filter", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const n8nId = req.query.n8nId as string;
  if (!workspaceId || !n8nId) return res.status(400).json({ error: "workspaceId and n8nId required" }) as any;

  const wf = await prisma.n8nWorkflowMeta.findUnique({
    where:  { workspaceId_n8nId: { workspaceId, n8nId } },
    select: { execSyncEnabled: true, eventFilter: true, appsUsed: true },
  });
  if (!wf) return res.status(404).json({ error: "Workflow not found" }) as any;

  return res.json({
    execSyncEnabled: wf.execSyncEnabled,
    eventFilter:     wf.eventFilter ? JSON.parse(wf.eventFilter) : null,
    appsUsed:        JSON.parse(wf.appsUsed),
  });
});

// ── POST /api/n8n-connect/event-filter ────────────────────────────────────────
// Save event filter config for a workflow.
// Body: { workspaceId, n8nId, execSyncEnabled, filter: { enabled, apps, eventTypes } }

router.post("/event-filter", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const { n8nId, execSyncEnabled, filter } = req.body as {
    n8nId?: string;
    execSyncEnabled?: boolean;
    filter?: { enabled: boolean; apps: string[]; eventTypes: string[] };
  };
  if (!workspaceId || !n8nId) return res.status(400).json({ error: "workspaceId and n8nId required" }) as any;

  await prisma.n8nWorkflowMeta.updateMany({
    where: { workspaceId, n8nId },
    data: {
      execSyncEnabled: execSyncEnabled ?? true,
      eventFilter:     filter ? JSON.stringify(filter) : null,
    },
  });

  return res.json({ ok: true });
});

// ── GET /api/n8n-connect/app-event-counts ─────────────────────────────────────
// Returns N8nQueuedEvent counts grouped by sourceApp for a workspace.
// Used by the WorkflowMirrorDetailPage to show "X events via n8n" for non-catalog apps.

router.get("/app-event-counts", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const grouped = await prisma.n8nQueuedEvent.groupBy({
    by:    ["sourceApp"],
    where: { workspaceId },
    _count: { id: true },
    _max:   { createdAt: true },
  });

  const appNames = grouped.map(g => g.sourceApp);
  const typeRows = appNames.length
    ? await prisma.n8nQueuedEvent.findMany({
        where:    { workspaceId, sourceApp: { in: appNames } },
        select:   { sourceApp: true, eventType: true },
        distinct: ["sourceApp", "eventType"],
      })
    : [];

  const typesByApp: Record<string, string[]> = {};
  for (const r of typeRows) {
    (typesByApp[r.sourceApp] ??= []).push(r.eventType);
  }

  const result: Record<string, { count: number; lastAt: string | null; eventTypes: string[] }> = {};
  for (const g of grouped) {
    result[g.sourceApp] = {
      count:      g._count.id,
      lastAt:     g._max.createdAt?.toISOString() ?? null,
      eventTypes: typesByApp[g.sourceApp] ?? [],
    };
  }

  return res.json(result);
});

// ── GET /api/n8n-connect/batch-events ────────────────────────────────────────
// Returns sourcing + outreach events grouped by (sourceApp, eventType, hourBucket)
// for the live feed batch display. Max last 7 days.

router.get("/batch-events", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  // Only batch categories
  const BATCH_TYPES = Object.entries(CANONICAL_EVENTS)
    .filter(([, m]) => m.category === "sourcing" || m.category === "outreach")
    .map(([k]) => k);

  const raw = await prisma.n8nQueuedEvent.findMany({
    where: {
      workspaceId,
      eventType: { in: BATCH_TYPES },
      createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
    select: { sourceApp: true, eventType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10_000,
  });

  // Group by sourceApp + eventType + hourly bucket
  const map: Record<string, { sourceApp: string; eventType: string; count: number; latestAt: Date }> = {};
  for (const e of raw) {
    const bucket = Math.floor(e.createdAt.getTime() / 3_600_000);
    const key = `${e.sourceApp}:${e.eventType}:${bucket}`;
    if (!map[key]) map[key] = { sourceApp: e.sourceApp, eventType: e.eventType, count: 0, latestAt: e.createdAt };
    map[key].count++;
    if (e.createdAt > map[key].latestAt) map[key].latestAt = e.createdAt;
  }

  const result = Object.values(map)
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())
    .slice(0, 100)
    .map(g => ({
      sourceApp: g.sourceApp,
      eventType: g.eventType,
      label:     getCanonicalMeta(g.eventType).label,
      count:     g.count,
      latestAt:  g.latestAt.toISOString(),
    }));

  return res.json(result);
});

// ── GET /api/n8n-connect/funnel ───────────────────────────────────────────────
// Returns canonical event counts ordered by funnel position, with conversion
// rates between adjacent stages.
// Optional: ?workflowId= to scope to a single workflow.

router.get("/funnel", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const workflowId  = req.query.workflowId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const where: any = { workspaceId, status: { not: "failed" } };
  if (workflowId) where.workflowId = workflowId;

  // Count distinct contacts (by externalId) per canonical event type
  const rows = await prisma.n8nQueuedEvent.groupBy({
    by:    ["eventType"],
    where,
    _count: { id: true },
  });

  // Map each event type to canonical metadata + count
  const stages = rows
    .map(r => {
      const meta  = getCanonicalMeta(r.eventType);
      return {
        eventType:  r.eventType,
        label:      meta.label,
        category:   meta.category,
        funnelPos:  meta.funnelPos,
        count:      r._count.id,
      };
    })
    .sort((a, b) => a.funnelPos - b.funnelPos);

  // Compute conversion rates between adjacent stages
  const withRates = stages.map((stage, i) => {
    const prev = stages[i - 1];
    const rate = prev && prev.count > 0
      ? Math.round((stage.count / prev.count) * 1000) / 10  // 1 decimal %
      : null;
    return { ...stage, conversionFromPrev: rate };
  });

  return res.json(withRates);
});

// ── POST /api/n8n-connect/poll-now ────────────────────────────────────────────
// Trigger an immediate execution poll for a workspace (bypasses 5-min interval).

router.post("/poll-now", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const conn = await prisma.n8nConnection.findUnique({ where: { workspaceId } });
  if (!conn) return res.status(404).json({ error: "No n8n connection found" }) as any;

  // Run async — don't block the response
  pollN8nExecutions(workspaceId).catch(console.error);

  return res.json({ ok: true, message: "Execution poll started" });
});

export default router;
