/**
 * makeConnect.ts
 *
 * Routes for connecting/disconnecting a user's Make.com account.
 *
 * POST   /api/make-connect/connect      — save API key + region, test, store
 * DELETE /api/make-connect              — disconnect and remove all scenario metadata
 * GET    /api/make-connect/status       — connection status + last sync info
 * POST   /api/make-connect/sync         — trigger manual sync on-demand
 * GET    /api/make-connect/scenarios    — list MakeScenarioMeta for this workspace
 * GET    /api/make-connect/event-filter — get per-scenario event filter config
 * POST   /api/make-connect/event-filter — save per-scenario event filter config
 * GET    /api/make-connect/webhook-url  — get the pre-built webhook URL for a scenario
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { encrypt } from "../utils/encryption";
import { testMakeConnection, syncMakeConnection } from "../services/makeClient";

const router = Router();

function getWorkspaceId(req: Request): string {
  return (req.body?.workspaceId as string) || (req.query.workspaceId as string) || "";
}

// ── POST /api/make-connect/connect ────────────────────────────────────────────

router.post("/connect", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const { apiKey, region } = req.body as { apiKey?: string; region?: string };

  if (!workspaceId)  return res.status(400).json({ error: "workspaceId required" }) as any;
  if (!apiKey)       return res.status(400).json({ error: "apiKey required" }) as any;

  const cleanRegion = (region ?? "us1").trim().toLowerCase();
  const cleanKey    = apiKey.trim();

  const test = await testMakeConnection(cleanKey, cleanRegion);
  if (!test.ok) {
    return res.status(400).json({ error: `Cannot reach Make.com: ${test.error}` }) as any;
  }

  const apiKeyEnc = encrypt(cleanKey);

  await prisma.makeConnection.upsert({
    where:  { workspaceId },
    create: {
      workspaceId,
      apiKeyEnc,
      region:         cleanRegion,
      teamId:         test.teamId         || null,
      organizationId: test.organizationId || null,
      status:         "connected",
    },
    update: {
      apiKeyEnc,
      region:         cleanRegion,
      teamId:         test.teamId         || null,
      organizationId: test.organizationId || null,
      status:         "connected",
      lastError:      null,
    },
  });

  // Kick off initial sync in background
  syncMakeConnection(workspaceId).catch(console.error);

  return res.json({ ok: true, message: "Connected — syncing scenarios in background" });
});

// ── DELETE /api/make-connect ──────────────────────────────────────────────────

router.delete("/", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  await prisma.makeScenarioMeta.deleteMany({ where: { workspaceId } });
  await prisma.makeConnection.deleteMany({ where: { workspaceId } });

  return res.json({ ok: true });
});

// ── GET /api/make-connect/status ──────────────────────────────────────────────

router.get("/status", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const conn = await prisma.makeConnection.findUnique({
    where:  { workspaceId },
    select: {
      region: true, status: true, lastSyncAt: true,
      lastError: true, scenarioCount: true, createdAt: true,
    },
  });

  if (!conn) return res.json({ connected: false });

  return res.json({
    connected:      conn.status !== "disconnected",
    status:         conn.status,
    region:         conn.region,
    lastSyncAt:     conn.lastSyncAt?.toISOString() ?? null,
    lastError:      conn.lastError,
    scenarioCount:  conn.scenarioCount,
    connectedSince: conn.createdAt.toISOString(),
  });
});

// ── POST /api/make-connect/sync ───────────────────────────────────────────────

router.post("/sync", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const conn = await prisma.makeConnection.findUnique({ where: { workspaceId } });
  if (!conn) return res.status(404).json({ error: "No Make.com connection found" }) as any;

  try {
    const result = await syncMakeConnection(workspaceId);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/make-connect/scenarios ──────────────────────────────────────────

router.get("/scenarios", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const scenarios = await prisma.makeScenarioMeta.findMany({
    where:   { workspaceId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, makeId: true, name: true, active: true,
      appsUsed: true, moduleCount: true, triggerType: true,
      lastUpdatedAt: true, syncedAt: true,
      execSyncEnabled: true, eventFilter: true,
    },
  });

  return res.json(
    scenarios.map(s => ({
      ...s,
      appsUsed:      JSON.parse(s.appsUsed),
      eventFilter:   s.eventFilter ? JSON.parse(s.eventFilter) : null,
      lastUpdatedAt: s.lastUpdatedAt?.toISOString() ?? null,
      syncedAt:      s.syncedAt.toISOString(),
    }))
  );
});

// ── GET /api/make-connect/event-filter ───────────────────────────────────────

router.get("/event-filter", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const makeId = req.query.makeId as string;
  if (!workspaceId || !makeId) return res.status(400).json({ error: "workspaceId and makeId required" }) as any;

  const sc = await prisma.makeScenarioMeta.findUnique({
    where:  { workspaceId_makeId: { workspaceId, makeId } },
    select: { execSyncEnabled: true, eventFilter: true, appsUsed: true },
  });
  if (!sc) return res.status(404).json({ error: "Scenario not found" }) as any;

  return res.json({
    execSyncEnabled: sc.execSyncEnabled,
    eventFilter:     sc.eventFilter ? JSON.parse(sc.eventFilter) : null,
    appsUsed:        JSON.parse(sc.appsUsed),
  });
});

// ── POST /api/make-connect/event-filter ──────────────────────────────────────

router.post("/event-filter", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const { makeId, execSyncEnabled, filter } = req.body as {
    makeId?: string;
    execSyncEnabled?: boolean;
    filter?: { enabled: boolean; apps: string[]; eventTypes: string[]; defaultEventType?: string };
  };
  if (!workspaceId || !makeId) return res.status(400).json({ error: "workspaceId and makeId required" }) as any;

  await prisma.makeScenarioMeta.updateMany({
    where: { workspaceId, makeId },
    data: {
      execSyncEnabled: execSyncEnabled ?? true,
      eventFilter:     filter ? JSON.stringify(filter) : null,
    },
  });

  return res.json({ ok: true });
});

// ── GET /api/make-connect/webhook-url ────────────────────────────────────────
// Returns the pre-built webhook URL the user should paste into Make.

router.get("/webhook-url", async (req: Request, res: Response) => {
  const workspaceId = getWorkspaceId(req);
  const makeId = req.query.makeId as string;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const baseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "https://your-api.vercel.app";
  const url = makeId
    ? `${baseUrl}/api/webhooks/make?workspaceId=${workspaceId}&scenarioId=${makeId}`
    : `${baseUrl}/api/webhooks/make?workspaceId=${workspaceId}`;

  return res.json({ url });
});

export default router;
