/**
 * /api/mcp/*
 *
 * Endpoints for the IQPipe MCP server.
 * Authentication: Authorization: Bearer <publicApiKey>  (rvn_pk_…)
 *
 * Read:
 *   GET /api/mcp/live-feed           — tool-level signal health cards
 *   GET /api/mcp/funnel              — GTM funnel stages with conversion rates
 *   GET /api/mcp/workflows           — n8n workflows + Make scenarios
 *   GET /api/mcp/workflow-health     — GTM Alpha Scores for all workflows
 *   GET /api/mcp/contacts            — contact/lead list (up to 200)
 *   GET /api/mcp/workflow-mirror     — mirror config for a workflow (?workflowId=)
 *   GET /api/mcp/mirror-app-catalog  — available apps + events for mirroring
 *
 * Write:
 *   POST /api/mcp/connect-integration    — connect a third-party integration
 *   POST /api/mcp/disconnect-integration — disconnect an integration
 *   POST /api/mcp/connect-n8n            — connect n8n instance
 *   POST /api/mcp/connect-make           — connect Make.com account
 *   POST /api/mcp/workflow-mirror        — create/update workflow mirror + app connections
 *
 * CRM (Phase 3):
 *   GET    /api/mcp/contact              — get contact by ?id= or ?email=
 *   POST   /api/mcp/contacts             — create contact/lead
 *   PATCH  /api/mcp/contacts/:id         — update contact fields
 *   GET    /api/mcp/deals                — list deals (?stage= &pipeline= &limit=)
 *   POST   /api/mcp/deals                — create deal
 *   PATCH  /api/mcp/deals/:id            — update deal fields
 *   GET    /api/mcp/accounts             — list accounts (?q= &limit=)
 *   POST   /api/mcp/accounts             — create account
 *   PATCH  /api/mcp/accounts/:id         — update account fields
 */

import { Router, Response } from "express";
import { prisma } from "../db";
import { requireApiKey, ApiKeyRequest } from "../middleware/requireApiKey";
import { encrypt } from "../utils/encryption";
import { testN8nConnection, syncN8nConnection } from "../services/n8nClient";
import { testMakeConnection, syncMakeConnection } from "../services/makeClient";
import {
  providerCheckers, sanitizeSecrets,
} from "./integrations";
import { APP_CATALOG } from "./workflowMirror";
import { getWorkflowHealthData } from "../services/workflowHealthService";

const router = Router();

// ─── Silence thresholds per tool (hours) ─────────────────────────────────────
const SILENCE_THRESHOLD: Record<string, number> = {
  clay: 4, apollo: 6, heyreach: 6, lemlist: 6, instantly: 6,
  smartlead: 6, phantombuster: 12, replyio: 6, outreach: 12,
  clearbit: 24, zoominfo: 24, pdl: 24, hunter: 24, lusha: 24,
  cognism: 24, snovio: 24, rocketreach: 24,
  hubspot: 48, pipedrive: 48,
};

// ─── GET /api/mcp/live-feed ───────────────────────────────────────────────────
router.get("/live-feed", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3_600_000);
  const d7  = new Date(now.getTime() - 7 * 24 * 3_600_000);

  try {
    const [connections, allTime, cnt24h, cnt7d, lastEvt, byType] = await Promise.all([
      prisma.integrationConnection.findMany({
        where:  { workspaceId, status: "connected" },
        select: { provider: true },
      }),
      prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId }, _count: { id: true } }),
      prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId, recordedAt: { gte: h24 } }, _count: { id: true } }),
      prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId, recordedAt: { gte: d7  } }, _count: { id: true } }),
      prisma.touchpoint.findMany({
        where: { workspaceId }, orderBy: { recordedAt: "desc" },
        distinct: ["tool"], select: { tool: true, recordedAt: true },
      }),
      prisma.touchpoint.groupBy({
        by: ["tool", "eventType"], where: { workspaceId },
        _count: { id: true }, orderBy: { _count: { id: "desc" } },
      }),
    ]);

    const mapAll  = Object.fromEntries(allTime.map(r => [r.tool, r._count.id]));
    const map24h  = Object.fromEntries(cnt24h.map(r => [r.tool, r._count.id]));
    const map7d   = Object.fromEntries(cnt7d.map(r => [r.tool, r._count.id]));
    const mapLast = Object.fromEntries(lastEvt.map(r => [r.tool, r.recordedAt]));

    const toolTypes: Record<string, { eventType: string; count: number }[]> = {};
    for (const row of byType) {
      if (!toolTypes[row.tool]) toolTypes[row.tool] = [];
      toolTypes[row.tool].push({ eventType: row.eventType, count: row._count.id });
    }

    const cards = connections.map(({ provider: tool }) => {
      const lastAt     = mapLast[tool] ?? null;
      const threshold  = SILENCE_THRESHOLD[tool] ?? 24;
      const hoursSince = lastAt ? (now.getTime() - new Date(lastAt).getTime()) / 3_600_000 : null;
      let status = "never";
      if (hoursSince !== null) {
        if (hoursSince <= threshold * 0.5)  status = "live";
        else if (hoursSince <= threshold)   status = "slow";
        else                                status = "silent";
      }
      return {
        tool,
        status,
        totalEvents: mapAll[tool] ?? 0,
        events24h:   map24h[tool] ?? 0,
        events7d:    map7d[tool]  ?? 0,
        lastEventAt: lastAt,
        topEvents: (toolTypes[tool] ?? []).slice(0, 4).map(e => ({
          eventType: e.eventType,
          count: e.count,
        })),
      };
    });

    res.json(cards);
  } catch (err) {
    console.error("[mcp/live-feed]", err);
    res.status(500).json({ error: "Failed to fetch live feed" });
  }
});

// ─── GET /api/mcp/funnel ─────────────────────────────────────────────────────
router.get("/funnel", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const workflowId  = req.query.workflowId as string | undefined;

  try {
    // Touchpoint is the canonical event store for ALL sources (webhooks, n8n, Make, direct API).
    // N8nQueuedEvent only contains events routed through the n8n queue processor and is often
    // sparse, so we always query Touchpoint for funnel data.
    const where: any = { workspaceId };

    if (workflowId) {
      // Touchpoint.workflowId stores the platform-native ID (n8nId or makeId),
      // not the IQPipe meta ID. Resolve across both platforms.
      const [n8nMeta, makeMeta] = await Promise.all([
        prisma.n8nWorkflowMeta.findFirst({
          where:  { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] },
          select: { n8nId: true },
        }),
        prisma.makeScenarioMeta.findFirst({
          where:  { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] },
          select: { makeId: true },
        }),
      ]);
      where.workflowId = n8nMeta?.n8nId ?? makeMeta?.makeId ?? workflowId;
    }

    const rows = await prisma.touchpoint.groupBy({
      by:    ["eventType"],
      where,
      _count: { id: true },
    });

    const FUNNEL_ORDER: Record<string, number> = {
      contact_created: 1, email_sent: 2, email_opened: 3, email_clicked: 4,
      reply_received: 5, meeting_booked: 6, deal_created: 7,
      deal_won: 8, deal_lost: 8,
    };

    const stages = rows
      .map(r => ({
        eventType: r.eventType,
        count:     r._count.id,
        funnelPos: FUNNEL_ORDER[r.eventType] ?? 99,
      }))
      .sort((a, b) => a.funnelPos - b.funnelPos);

    const withRates = stages.map((stage, i) => {
      const prev = stages[i - 1];
      const rate = prev && prev.count > 0
        ? Math.round((stage.count / prev.count) * 1000) / 10
        : null;
      return { ...stage, conversionFromPrev: rate };
    });

    res.json(withRates);
  } catch (err) {
    console.error("[mcp/funnel]", err);
    res.status(500).json({ error: "Failed to fetch funnel" });
  }
});

// ─── GET /api/mcp/workflows ───────────────────────────────────────────────────
router.get("/workflows", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;

  try {
    const [n8nWorkflows, makeScenarios] = await Promise.all([
      prisma.n8nWorkflowMeta.findMany({
        where:   { workspaceId },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true, n8nId: true, name: true, active: true,
          appsUsed: true, nodeCount: true, triggerType: true,
          lastUpdatedAt: true, syncedAt: true, execSyncEnabled: true,
        },
      }),
      prisma.makeScenarioMeta.findMany({
        where:   { workspaceId },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true, makeId: true, name: true, active: true,
          appsUsed: true, moduleCount: true, triggerType: true,
          lastUpdatedAt: true, syncedAt: true, execSyncEnabled: true,
        },
      }),
    ]);

    res.json({
      n8n: n8nWorkflows.map(w => ({
        ...w,
        platform: "n8n",
        appsUsed: JSON.parse(w.appsUsed),
        lastUpdatedAt: w.lastUpdatedAt?.toISOString() ?? null,
        syncedAt: w.syncedAt.toISOString(),
      })),
      make: makeScenarios.map(s => ({
        ...s,
        platform: "make",
        nodeCount: s.moduleCount,
        appsUsed: JSON.parse(s.appsUsed),
        lastUpdatedAt: s.lastUpdatedAt?.toISOString() ?? null,
        syncedAt: s.syncedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[mcp/workflows]", err);
    res.status(500).json({ error: "Failed to fetch workflows" });
  }
});

// ─── GET /api/mcp/workflow-health ─────────────────────────────────────────────
// Returns the full pipeline intelligence payload (latency, frequency, coverage,
// funnel, paths, enrichment) from the LeadActivitySummary materialized table.
// Same data shape as GET /api/workflow-health (dashboard route).
router.get("/workflow-health", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const period      = (req.query.period as string) || "30d";

  try {
    const data = await getWorkflowHealthData(workspaceId, period);
    res.json(data);
  } catch (err) {
    console.error("[mcp/workflow-health]", err);
    res.status(500).json({ error: "Failed to fetch workflow health" });
  }
});

// ─── GET /api/mcp/contacts ────────────────────────────────────────────────────
router.get("/contacts", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const search    = (req.query.q         as string) || "";
  const eventType = (req.query.eventType as string) || "";
  const limit     = Math.min(parseInt((req.query.limit as string) || "50"), 200);

  try {
    const where: any = { workspaceId };
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { company:     { contains: search, mode: "insensitive" } },
      ];
    }
    if (eventType) {
      where.touchpoints = { some: { workspaceId, eventType } };
    }

    const leads = await prisma.iqLead.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      select: {
        id: true, displayName: true, company: true,
        title: true, firstSeenAt: true, lastSeenAt: true,
      },
    });

    res.json(leads.map(l => ({
      id:          l.id,
      name:        l.displayName || "Unknown",
      company:     l.company,
      title:       l.title,
      firstSeenAt: l.firstSeenAt.toISOString(),
      lastSeenAt:  l.lastSeenAt.toISOString(),
    })));
  } catch (err) {
    console.error("[mcp/contacts]", err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// ─── GET /api/mcp/mirror-app-catalog ─────────────────────────────────────────
// Returns the full catalog of apps that can be connected to a workflow mirror.
// Each entry lists the appKey, label, connectionType, and available event keys.
router.get("/mirror-app-catalog", requireApiKey, (_req: ApiKeyRequest, res: Response) => {
  const catalog = Object.entries(APP_CATALOG).map(([appKey, meta]) => ({
    appKey,
    label:          meta.label,
    connectionType: meta.connectionType,
    events: meta.events.map(e => ({ key: e.key, label: e.label, category: e.category })),
  }));
  res.json(catalog);
});

// ─── GET /api/mcp/workflow-mirror ─────────────────────────────────────────────
// Returns the full mirror config for one workflow: correlation key, connected
// apps, and observed events per app.
// Query: ?workflowId=<id>
router.get("/workflow-mirror", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const workflowId  = req.query.workflowId as string;
  if (!workflowId) return res.status(400).json({ error: "workflowId is required" });

  try {
    const mirror = await prisma.workflowMirror.findUnique({
      where:   { workspaceId_workflowId: { workspaceId, workflowId } },
      include: {
        appConnections: {
          include: { observedEvents: true },
          orderBy: { appKey: "asc" },
        },
      },
    });

    if (!mirror) {
      return res.json({
        configured: false,
        workflowId,
        message: "No mirror configured yet. Use setup_workflow_mirror to create one.",
      });
    }

    return res.json({
      configured:     true,
      mirrorId:       mirror.id,
      workflowId:     mirror.workflowId,
      platform:       mirror.platform,
      correlationKey: mirror.correlationKey,
      apps: mirror.appConnections.map(c => ({
        appKey:         c.appKey,
        connectionType: c.connectionType,
        status:         c.status,
        hasCredential:  !!c.credentialEnc,
        hasWebhook:     !!c.webhookSecret,
        observedEvents: c.observedEvents.map(e => ({ key: e.eventKey, label: e.label })),
      })),
    });
  } catch (err) {
    console.error("[mcp/workflow-mirror GET]", err);
    res.status(500).json({ error: "Failed to fetch mirror config" });
  }
});

// ─── POST /api/mcp/workflow-mirror ────────────────────────────────────────────
// Atomic mirror setup: upserts the mirror, upserts each app connection, and
// replaces the observed events per connection — all in one call.
//
// Body:
//   workflowId:     string
//   platform:       "n8n" | "make"
//   correlationKey: string          — field used to link events (e.g. "email")
//   apps: Array<{
//     appKey:         string        — e.g. "hubspot", "apollo"
//     connectionType: "webhook" | "polling"
//     credential?:    string        — API key or access token
//     webhookSecret?: string        — for HMAC signature verification
//     events?:        string[]      — event keys to observe (from mirror-app-catalog)
//   }>
router.post("/workflow-mirror", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const {
    workflowId, platform, correlationKey, apps = [],
  } = req.body as {
    workflowId:      string;
    platform:        string;
    correlationKey?: string;
    apps?: Array<{
      appKey:          string;
      connectionType:  "webhook" | "polling";
      credential?:     string;
      webhookSecret?:  string;
      events?:         string[];
    }>;
  };

  if (!workflowId || !platform) {
    return res.status(400).json({ error: "workflowId and platform are required" });
  }

  try {
    // 1 — Upsert mirror
    const mirror = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId } },
      create: { workspaceId, workflowId, platform, correlationKey: correlationKey ?? null, unknownMappings: "{}" },
      update: { correlationKey: correlationKey ?? null },
    });

    // 2 — Upsert each app connection + events
    const connectedApps: string[] = [];
    const errors: string[] = [];

    for (const app of apps) {
      const { appKey, connectionType, credential, webhookSecret, events = [] } = app;
      if (!appKey || !connectionType) {
        errors.push(`Skipped entry with missing appKey or connectionType`);
        continue;
      }

      const catalogEntry = APP_CATALOG[appKey];
      if (!catalogEntry) {
        errors.push(`Unknown appKey "${appKey}" — check mirror-app-catalog for valid keys`);
        continue;
      }

      const credentialEnc = credential ? encrypt(credential) : undefined;

      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror.id, appKey } },
        create: {
          workspaceId, mirrorId: mirror.id, appKey, connectionType,
          credentialEnc: credentialEnc ?? null,
          webhookSecret: webhookSecret ?? null,
          status: "connected",
        },
        update: {
          connectionType,
          ...(credentialEnc ? { credentialEnc } : {}),
          ...(webhookSecret ? { webhookSecret } : {}),
          status: "connected",
          errorMessage: null,
        },
      });

      // Replace observed events if provided
      if (events.length > 0) {
        await prisma.observedEvent.deleteMany({ where: { connectionId: conn.id } });

        const validEvents = events
          .map(key => {
            const meta = catalogEntry.events.find(e => e.key === key);
            return meta ? { connectionId: conn.id, appKey, eventKey: key, label: meta.label } : null;
          })
          .filter(Boolean) as { connectionId: string; appKey: string; eventKey: string; label: string }[];

        if (validEvents.length > 0) {
          await prisma.observedEvent.createMany({ data: validEvents });
        }
        if (validEvents.length < events.length) {
          errors.push(`Some events for "${appKey}" were skipped — use mirror-app-catalog to get valid event keys`);
        }
      }

      connectedApps.push(appKey);
    }

    return res.json({
      ok:             true,
      mirrorId:       mirror.id,
      workflowId:     mirror.workflowId,
      correlationKey: mirror.correlationKey,
      connectedApps,
      ...(errors.length ? { warnings: errors } : {}),
      message: `Mirror configured. ${connectedApps.length} app(s) connected.`,
    });
  } catch (err) {
    console.error("[mcp/workflow-mirror POST]", err);
    res.status(500).json({ error: "Failed to set up workflow mirror" });
  }
});

// ─── GET /api/mcp/webhook-url ─────────────────────────────────────────────────
// Returns the IQPipe webhook URL for a specific app in a workflow mirror.
// Query: ?workflowId=<id>&appKey=<key>
router.get("/webhook-url", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { workflowId, appKey } = req.query as { workflowId?: string; appKey?: string };

  if (!workflowId) return res.status(400).json({ error: "workflowId is required" });
  if (!appKey)     return res.status(400).json({ error: "appKey is required" });

  try {
    const mirror = await prisma.workflowMirror.findUnique({
      where:   { workspaceId_workflowId: { workspaceId, workflowId } },
      include: { appConnections: { where: { appKey } } },
    });

    if (!mirror) {
      return res.status(404).json({ error: "No mirror configured for this workflow. Run setup_workflow_mirror first." });
    }

    const conn = mirror.appConnections[0];
    if (!conn) {
      return res.status(404).json({ error: `App "${appKey}" is not connected to this mirror. Run setup_workflow_mirror to add it.` });
    }

    if (conn.connectionType === "polling") {
      const catalogEntry = APP_CATALOG[appKey];
      return res.json({
        appKey, connectionType: "polling", webhookUrl: null,
        note: `${catalogEntry?.label ?? appKey} uses polling — no webhook URL needed. IQPipe fetches events automatically.`,
      });
    }

    const baseUrl    = `${req.protocol}://${req.get("host")}`;
    const webhookUrl = `${baseUrl}/api/app-webhooks/${appKey}?workspaceId=${workspaceId}&mirrorId=${mirror.id}`;
    const catalogEntry = APP_CATALOG[appKey];

    return res.json({
      appKey,
      connectionType: "webhook",
      webhookUrl,
      mirrorId: mirror.id,
      instructions: `Register this URL as a webhook endpoint in your ${catalogEntry?.label ?? appKey} dashboard. ` +
        `Use the webhook secret you provided in setup_workflow_mirror for HMAC signature verification.`,
    });
  } catch (err) {
    console.error("[mcp/webhook-url]", err);
    res.status(500).json({ error: "Failed to build webhook URL" });
  }
});

// ─── POST /api/mcp/connect-integration ───────────────────────────────────────
// Connect (or re-key) a third-party integration for the workspace.
// Body: { provider: string, credentials: Record<string, string> }
//   credentials — object whose keys are the provider's auth fields.
//   For most providers: { apiKey: "sk_live_..." }
//   For Clay:           { apiKey: "...", tableId: "t_abc..." }
//   For HubSpot:        { accessToken: "pat-..." }
router.post("/connect-integration", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { provider, credentials } = req.body as {
    provider?: string;
    credentials?: Record<string, unknown>;
  };

  if (!provider) return res.status(400).json({ error: "provider is required" });
  if (!credentials || typeof credentials !== "object") {
    return res.status(400).json({ error: "credentials object is required" });
  }

  const authData = sanitizeSecrets(credentials);
  if (Object.keys(authData).length === 0) {
    return res.status(400).json({ error: "No valid credentials supplied (each value must be at least 8 characters)." });
  }

  // Validate credentials against the provider's live API
  let result: { success: boolean; message?: string };
  if (providerCheckers[provider]) {
    result = await providerCheckers[provider](authData);
  } else {
    // Unknown provider — accept any non-empty credentials
    result = { success: true };
  }

  const status = result.success ? "connected" : "not_connected";
  const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });

  if (!result.success) {
    if (existing) {
      await prisma.integrationConnection.update({
        where: { id: existing.id },
        data:  { status: "not_connected" },
      });
    }
    return res.status(400).json({ error: result.message ?? "Credential validation failed", provider, status });
  }

  const encryptedAuth = encrypt(JSON.stringify(authData));

  if (existing) {
    await prisma.integrationConnection.update({
      where: { id: existing.id },
      data:  { status, authData: encryptedAuth },
    });
  } else {
    await prisma.integrationConnection.create({
      data: { workspaceId, provider, status, authData: encryptedAuth },
    });
  }

  return res.json({ ok: true, provider, status, message: `${provider} connected successfully.` });
});

// ─── POST /api/mcp/disconnect-integration ────────────────────────────────────
// Disconnect an integration, clearing stored credentials.
// Body: { provider: string }
router.post("/disconnect-integration", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { provider } = req.body as { provider?: string };

  if (!provider) return res.status(400).json({ error: "provider is required" });

  const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
  if (!conn) {
    return res.json({ ok: true, provider, status: "not_connected", message: `${provider} was not connected.` });
  }

  await prisma.integrationConnection.update({
    where: { id: conn.id },
    data:  { status: "not_connected", authData: null },
  });

  return res.json({ ok: true, provider, status: "not_connected", message: `${provider} disconnected.` });
});

// ─── POST /api/mcp/connect-n8n ────────────────────────────────────────────────
// Connect an n8n instance to the workspace.
// Body: { baseUrl: string, apiKey: string }
router.post("/connect-n8n", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string };

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ error: "baseUrl and apiKey are required" });
  }

  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  if (!cleanBase.startsWith("http")) {
    return res.status(400).json({ error: "baseUrl must start with http:// or https://" });
  }

  const test = await testN8nConnection(cleanBase, apiKey.trim());
  if (!test.ok) {
    return res.status(400).json({ error: `Cannot reach n8n instance: ${test.error}` });
  }

  const apiKeyEnc = encrypt(apiKey.trim());

  await prisma.n8nConnection.upsert({
    where:  { workspaceId },
    create: { workspaceId, baseUrl: cleanBase, apiKeyEnc, status: "connected" },
    update: { baseUrl: cleanBase, apiKeyEnc, status: "connected", lastError: null },
  });

  // Kick off initial workflow sync in background
  syncN8nConnection(workspaceId).catch(console.error);

  return res.json({
    ok: true,
    message: "n8n connected — syncing workflows in background.",
    baseUrl: cleanBase,
  });
});

// ─── POST /api/mcp/connect-make ───────────────────────────────────────────────
// Connect a Make.com account to the workspace.
// Body: { apiKey: string, region?: string }  region defaults to "us1"
router.post("/connect-make", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { apiKey, region } = req.body as { apiKey?: string; region?: string };

  if (!apiKey) return res.status(400).json({ error: "apiKey is required" });

  const cleanRegion = (region ?? "us1").trim().toLowerCase();
  const cleanKey    = apiKey.trim();

  const test = await testMakeConnection(cleanKey, cleanRegion);
  if (!test.ok) {
    return res.status(400).json({ error: `Cannot reach Make.com: ${test.error}` });
  }

  const apiKeyEnc = encrypt(cleanKey);

  await prisma.makeConnection.upsert({
    where:  { workspaceId },
    create: {
      workspaceId, apiKeyEnc, region: cleanRegion,
      teamId: test.teamId || null, organizationId: test.organizationId || null,
      status: "connected",
    },
    update: {
      apiKeyEnc, region: cleanRegion,
      teamId: test.teamId || null, organizationId: test.organizationId || null,
      status: "connected", lastError: null,
    },
  });

  // Kick off initial scenario sync in background
  syncMakeConnection(workspaceId).catch(console.error);

  return res.json({
    ok: true,
    message: "Make.com connected — syncing scenarios in background.",
    region: cleanRegion,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — CRM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/mcp/contact ─────────────────────────────────────────────────────
// Get a single contact/lead by id or email.
// Query: ?id=<id>  OR  ?email=<email>
router.get("/contact", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { id, email } = req.query as { id?: string; email?: string };

  if (!id && !email) return res.status(400).json({ error: "id or email is required" });

  try {
    const lead = await prisma.lead.findFirst({
      where: id
        ? { id, workspaceId }
        : { email: { equals: email, mode: "insensitive" }, workspaceId },
      include: {
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!lead) return res.status(404).json({ error: "Contact not found" });

    return res.json({
      id:        lead.id,
      name:      lead.fullName || `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.email || "Unknown",
      email:     lead.email,
      firstName: lead.firstName,
      lastName:  lead.lastName,
      company:   lead.company,
      title:     lead.title,
      status:    lead.status,
      source:    lead.source,
      fitScore:  lead.fitScore,
      leadScore: lead.leadScore,
      createdAt: lead.createdAt.toISOString(),
      recentActivity: (lead.activities as any[]).map((a: any) => ({
        type:      a.type,
        note:      a.body ?? a.subject ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[mcp/contact GET]", err);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

// ─── POST /api/mcp/contacts ───────────────────────────────────────────────────
// Create a new contact/lead.
// Body: { email, firstName?, lastName?, company?, title?, status?, source? }
router.post("/contacts", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { email, firstName, lastName, company, title, status, source } = req.body as {
    email?: string; firstName?: string; lastName?: string;
    company?: string; title?: string; status?: string; source?: string;
  };

  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const existing = await prisma.lead.findFirst({ where: { workspaceId, email: { equals: email, mode: "insensitive" } } });
    if (existing) return res.status(409).json({ error: "A contact with this email already exists", id: existing.id });

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const lead = await prisma.lead.create({
      data: {
        workspaceId, email, fullName,
        firstName: firstName ?? null,
        lastName:  lastName  ?? null,
        company:   company   ?? null,
        title:     title     ?? null,
        status:    status    ?? "new",
        source:    source    ?? "manual",
      },
    });

    return res.status(201).json({ ok: true, id: lead.id, email: lead.email, name: lead.fullName });
  } catch (err) {
    console.error("[mcp/contacts POST]", err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

// ─── PATCH /api/mcp/contacts/:id ─────────────────────────────────────────────
// Update a contact/lead's fields.
// Body: any subset of { firstName, lastName, company, title, status, source, fitScore, leadScore }
router.patch("/contacts/:id", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { id } = req.params;
  const { firstName, lastName, company, title, status, source, fitScore, leadScore } = req.body as {
    firstName?: string; lastName?: string; company?: string; title?: string;
    status?: string; source?: string; fitScore?: number; leadScore?: number;
  };

  try {
    const existing = await prisma.lead.findFirst({ where: { id, workspaceId } });
    if (!existing) return res.status(404).json({ error: "Contact not found" });

    const data: Record<string, unknown> = {};
    if (firstName  !== undefined) { data.firstName = firstName;  data.fullName = [firstName, existing.lastName ?? lastName].filter(Boolean).join(" ") || null; }
    if (lastName   !== undefined) { data.lastName  = lastName;   data.fullName = [(existing.firstName ?? firstName), lastName].filter(Boolean).join(" ") || null; }
    if (company    !== undefined) data.company    = company;
    if (title      !== undefined) data.title      = title;
    if (status     !== undefined) data.status     = status;
    if (source     !== undefined) data.source     = source;
    if (fitScore   !== undefined) data.fitScore   = fitScore;
    if (leadScore  !== undefined) data.leadScore  = leadScore;

    const updated = await prisma.lead.update({ where: { id }, data });

    return res.json({ ok: true, id: updated.id, email: updated.email, status: updated.status });
  } catch (err) {
    console.error("[mcp/contacts PATCH]", err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// ─── GET /api/mcp/deals ───────────────────────────────────────────────────────
// List deals for the workspace, with optional filters.
// Query: ?stage=<stage> &pipeline=<pipeline> &limit=<n>
router.get("/deals", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { stage, pipeline } = req.query as { stage?: string; pipeline?: string };
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);

  try {
    const where: any = { workspaceId };
    if (stage)    where.stage    = stage;
    if (pipeline) where.pipeline = pipeline;

    const deals = await prisma.deal.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit,
      include: {
        account:        { select: { id: true, name: true } },
        primaryContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return res.json(deals.map((d: any) => ({
      id:               d.id,
      name:             d.name,
      stage:            d.stage,
      pipeline:         d.pipeline,
      amount:           d.amount,
      currency:         d.currency,
      probability:      d.probability,
      expectedCloseDate: d.expectedCloseDate?.toISOString()?.split("T")[0] ?? null,
      account:          d.account ? { id: d.account.id, name: d.account.name } : null,
      contact:          d.primaryContact ? { id: d.primaryContact.id, name: `${d.primaryContact.firstName ?? ""} ${d.primaryContact.lastName ?? ""}`.trim(), email: d.primaryContact.email } : null,
      createdAt:        d.createdAt.toISOString(),
    })));
  } catch (err) {
    console.error("[mcp/deals GET]", err);
    res.status(500).json({ error: "Failed to fetch deals" });
  }
});

// ─── POST /api/mcp/deals ──────────────────────────────────────────────────────
// Create a new deal.
// Body: { name, accountId?, primaryContactId?, stage?, pipeline?, amount?, currency?, expectedCloseDate?, probability? }
router.post("/deals", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { name, accountId, primaryContactId, stage, pipeline, amount, currency, expectedCloseDate, probability } = req.body as {
    name?: string; accountId?: string; primaryContactId?: string;
    stage?: string; pipeline?: string; amount?: number; currency?: string;
    expectedCloseDate?: string; probability?: number;
  };

  if (!name)      return res.status(400).json({ error: "name is required" });
  if (!accountId) return res.status(400).json({ error: "accountId is required — use list_accounts or create_account first" });

  try {
    const deal = await prisma.deal.create({
      data: {
        workspaceId,
        name,
        accountId,
        primaryContactId: primaryContactId || undefined,
        stage:            stage            ?? "qualification",
        pipeline:         pipeline         ?? "new_business",
        amount:           amount           ?? null,
        currency:         currency         ?? "USD",
        probability:      probability      ?? null,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      },
    });

    return res.status(201).json({ ok: true, id: deal.id, name: deal.name, stage: deal.stage });
  } catch (err) {
    console.error("[mcp/deals POST]", err);
    res.status(500).json({ error: "Failed to create deal" });
  }
});

// ─── PATCH /api/mcp/deals/:id ─────────────────────────────────────────────────
// Update a deal's fields.
// Body: any subset of { name, stage, pipeline, amount, currency, probability, expectedCloseDate, primaryContactId, accountId }
router.patch("/deals/:id", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { id } = req.params;
  const { name, stage, pipeline, amount, currency, probability, expectedCloseDate, primaryContactId, accountId } = req.body as {
    name?: string; stage?: string; pipeline?: string; amount?: number;
    currency?: string; probability?: number; expectedCloseDate?: string;
    primaryContactId?: string; accountId?: string;
  };

  try {
    const existing = await prisma.deal.findFirst({ where: { id, workspaceId } });
    if (!existing) return res.status(404).json({ error: "Deal not found" });

    const data: Record<string, unknown> = {};
    if (name             !== undefined) data.name             = name;
    if (stage            !== undefined) data.stage            = stage;
    if (pipeline         !== undefined) data.pipeline         = pipeline;
    if (amount           !== undefined) data.amount           = amount;
    if (currency         !== undefined) data.currency         = currency;
    if (probability      !== undefined) data.probability      = probability;
    if (primaryContactId !== undefined) data.primaryContactId = primaryContactId;
    if (accountId        !== undefined) data.accountId        = accountId;
    if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;

    const updated = await prisma.deal.update({ where: { id }, data });

    return res.json({ ok: true, id: updated.id, name: updated.name, stage: updated.stage });
  } catch (err) {
    console.error("[mcp/deals PATCH]", err);
    res.status(500).json({ error: "Failed to update deal" });
  }
});

// ─── GET /api/mcp/accounts ────────────────────────────────────────────────────
// List accounts, optionally filtering by name/domain search.
// Query: ?q=<search> &limit=<n>
router.get("/accounts", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const search = (req.query.q as string) || "";
  const limit  = Math.min(parseInt((req.query.limit as string) || "50"), 200);

  try {
    const where: any = { workspaceId };
    if (search) {
      where.OR = [
        { name:   { contains: search, mode: "insensitive" } },
        { domain: { contains: search, mode: "insensitive" } },
      ];
    }

    const accounts = await prisma.account.findMany({
      where, orderBy: { name: "asc" }, take: limit,
      select: {
        id: true, name: true, domain: true, industry: true,
        employeeCount: true, country: true, lifecycleStage: true,
        _count: { select: { leads: true, deals: true } },
      },
    });

    return res.json(accounts.map((a: any) => ({
      id:             a.id,
      name:           a.name,
      domain:         a.domain,
      industry:       a.industry,
      employeeCount:  a.employeeCount,
      country:        a.country,
      lifecycleStage: a.lifecycleStage,
      contactCount:   a._count.leads,
      dealCount:      a._count.deals,
    })));
  } catch (err) {
    console.error("[mcp/accounts GET]", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// ─── POST /api/mcp/accounts ───────────────────────────────────────────────────
// Create a new account/company.
// Body: { name, domain?, industry?, employeeCount?, country?, city?, websiteUrl?, lifecycleStage? }
router.post("/accounts", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage } = req.body as {
    name?: string; domain?: string; industry?: string; employeeCount?: number;
    country?: string; city?: string; websiteUrl?: string; lifecycleStage?: string;
  };

  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const account = await prisma.account.create({
      data: {
        workspaceId, name,
        domain:         domain         ?? null,
        industry:       industry       ?? null,
        employeeCount:  employeeCount  ?? null,
        country:        country        ?? null,
        city:           city           ?? null,
        websiteUrl:     websiteUrl     ?? null,
        lifecycleStage: lifecycleStage ?? "prospect",
      },
    });

    return res.status(201).json({ ok: true, id: account.id, name: account.name });
  } catch (err) {
    console.error("[mcp/accounts POST]", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// ─── PATCH /api/mcp/accounts/:id ─────────────────────────────────────────────
// Update an account's fields.
// Body: any subset of { name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage }
router.patch("/accounts/:id", requireApiKey, async (req: ApiKeyRequest, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { id } = req.params;
  const { name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage } = req.body as {
    name?: string; domain?: string; industry?: string; employeeCount?: number;
    country?: string; city?: string; websiteUrl?: string; lifecycleStage?: string;
  };

  try {
    const existing = await prisma.account.findFirst({ where: { id, workspaceId } });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const data: Record<string, unknown> = {};
    if (name           !== undefined) data.name           = name;
    if (domain         !== undefined) data.domain         = domain;
    if (industry       !== undefined) data.industry       = industry;
    if (employeeCount  !== undefined) data.employeeCount  = employeeCount;
    if (country        !== undefined) data.country        = country;
    if (city           !== undefined) data.city           = city;
    if (websiteUrl     !== undefined) data.websiteUrl     = websiteUrl;
    if (lifecycleStage !== undefined) data.lifecycleStage = lifecycleStage;

    const updated = await prisma.account.update({ where: { id }, data });

    return res.json({ ok: true, id: updated.id, name: updated.name, lifecycleStage: updated.lifecycleStage });
  } catch (err) {
    console.error("[mcp/accounts PATCH]", err);
    res.status(500).json({ error: "Failed to update account" });
  }
});

// ─── GET /api/mcp/setup-script ───────────────────────────────────────────────
// Returns a shell script (PowerShell or bash) that auto-configures Claude
// Desktop to connect to IQPipe's remote MCP server using the workspace's
// public API key. No JSON editing required — one command, then restart Desktop.
//
// Auth: standard JWT Bearer (dashboard user, not API key)
// Query: ?platform=windows|mac (defaults to windows)

import { requireAuth } from "../middleware/auth";

router.get("/setup-script", requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.auth?.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized" });

    const platform = (req.query.platform as string) || "windows";

    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { publicApiKey: true },
    });

    if (!workspace?.publicApiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    const key    = workspace.publicApiKey;
    const mcpUrl = `${req.protocol}://${req.get("host")}/mcp?key=${key}`;

    if (platform === "mac") {
      const script = `#!/bin/bash
# IQPipe × Claude Desktop — one-command setup (macOS / Linux)
CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
mkdir -p "$(dirname "$CONFIG")"

if [ -f "$CONFIG" ]; then
  python3 - <<'PYEOF'
import json, os
path = os.path.expanduser("~/Library/Application Support/Claude/claude_desktop_config.json")
with open(path) as f:
    c = json.load(f)
c.setdefault("mcpServers", {})["iqpipe"] = {"url": "${mcpUrl}"}
with open(path, "w") as f:
    json.dump(c, f, indent=2)
PYEOF
else
  echo '{"mcpServers":{"iqpipe":{"url":"${mcpUrl}"}}}' > "$CONFIG"
fi

echo ""
echo "✓ IQPipe connected to Claude Desktop."
echo "  Restart Claude Desktop and ask: 'Show my live feed'"
echo ""
`;
      res.set("Content-Type", "text/plain");
      return res.send(script);
    }

    // Windows PowerShell (default)
    const script = `# IQPipe x Claude Desktop -- one-command setup (Windows)
$ConfigPath = "$env:APPDATA\\Claude\\claude_desktop_config.json"
$McpUrl     = "${mcpUrl}"

if (Test-Path $ConfigPath) {
    $Json = Get-Content $ConfigPath -Raw | ConvertFrom-Json
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path $ConfigPath) | Out-Null
    $Json = [PSCustomObject]@{}
}

if (-not $Json.PSObject.Properties["mcpServers"]) {
    $Json | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{}) -Force
}
$Json.mcpServers | Add-Member -NotePropertyName iqpipe -NotePropertyValue ([PSCustomObject]@{ url = $McpUrl }) -Force

$Json | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

Write-Host ""
Write-Host "IQPipe connected to Claude Desktop." -ForegroundColor Green
Write-Host "  Restart Claude Desktop and ask: 'Show my live feed'"
Write-Host ""
`;

    res.set("Content-Type", "text/plain");
    return res.send(script);
  } catch (err) {
    console.error("[mcp/setup-script]", err);
    res.status(500).json({ error: "Failed to generate setup script" });
  }
});

export default router;
