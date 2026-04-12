/**
 * /mcp  —  IQPipe HTTP MCP Server (Streamable HTTP transport)
 *
 * Mounts the MCP server directly on the Express app, making it accessible
 * to any MCP client (Claude.ai, Claude Desktop, Claude API) without a
 * local install.
 *
 * Auth:    Authorization: Bearer <publicApiKey>   (rvn_pk_…)
 *          OR ?key=<publicApiKey> query param
 *
 * Usage in Claude Desktop / Claude API:
 *   {
 *     "mcpServers": {
 *       "iqpipe": {
 *         "url": "https://api.iqpipe.io/mcp",
 *         "headers": { "Authorization": "Bearer rvn_pk_YOUR_KEY" }
 *       }
 *     }
 *   }
 *
 * All 27 tools are available:
 *   Read:  get_live_feed, get_funnel, list_workflows, get_workflow_health,
 *          search_contacts, get_workflow_mirror, get_mirror_app_catalog
 *   Write: connect_integration, disconnect_integration, connect_n8n,
 *          connect_make, setup_workflow_mirror, get_webhook_url
 *   CRM:   get_contact, create_contact, update_contact,
 *          list_deals, create_deal, update_deal,
 *          list_accounts, create_account, update_account
 *   Diagnostics: get_anomalies, diagnose_issue, apply_fix, watch_recovery
 *   Revenue:     get_revenue_attribution
 */

import { Router, Request, Response } from "express";
import { z } from "zod";

// Use require() for MCP SDK to avoid TypeScript traversing its complex Zod v4
// generic types, which exhausts the tsc heap. The CJS build works fine at runtime.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { McpServer }                     = require("@modelcontextprotocol/sdk/server/mcp.js")                     as { McpServer: any };
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js") as { StreamableHTTPServerTransport: any };
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

import { prisma } from "../db";
import { encrypt } from "../utils/encryption";
import { testN8nConnection, syncN8nConnection } from "../services/n8nClient";
import { testMakeConnection, syncMakeConnection } from "../services/makeClient";
import { providerCheckers, sanitizeSecrets } from "./integrations";
import { APP_CATALOG } from "./workflowMirror";
import { diagnose } from "../services/diagnosticEngine";
import { applyFix } from "../services/remediationEngine";
import { watchRecovery } from "../services/recoveryWatcher";
import {
  getOutreachOverview,
  getStuckLeads,
  getSequenceFunnel,
  getLeadJourney,
  getWebhookReliability,
  getOutcomeAttribution,
  checkLeadStatus,
  getSequenceRecommendation,
  confirmEventReceived,
} from "../services/outreachQueryService";
import {
  fetchAllWorkflowMetrics,
  scoreWorkflows,
  enrichWithBranches,
  periodStart,
} from "../services/workflowScoreService";
import { getRevenueAttribution } from "../services/revenueAttributionService";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

// MCP is available on all plans — no plan gate

async function resolveWorkspace(req: Request): Promise<{ id: string; plan: string } | null> {
  const authHeader = req.headers.authorization ?? "";
  const keyFromHeader = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const keyFromQuery = typeof req.query.key === "string" ? req.query.key : null;
  const token = keyFromHeader ?? keyFromQuery ?? "";

  if (!token.startsWith("rvn_pk_")) return null;

  const workspace = await prisma.workspace.findFirst({
    where:  { publicApiKey: token },
    select: { id: true, plan: true },
  });
  if (!workspace) return null;
  return { id: workspace.id, plan: workspace.plan };
}

// ─── Silence thresholds (mirrors signalHealth + mcpApi) ───────────────────────

const SILENCE_THRESHOLD: Record<string, number> = {
  clay: 4, apollo: 6, heyreach: 6, lemlist: 6, instantly: 6,
  smartlead: 6, phantombuster: 12, replyio: 6, outreach: 12,
  clearbit: 24, zoominfo: 24, pdl: 24, hunter: 24, lusha: 24,
  cognism: 24, snovio: 24, rocketreach: 24, hubspot: 48, pipedrive: 48,
};

// ─── MCP server factory ───────────────────────────────────────────────────────
// Creates a fresh McpServer for each request with the workspace ID baked in.
// Stateless — no sessions, no shared state between requests.

function createServer(workspaceId: string, baseUrl: string): any {
  const server = new McpServer({ name: "iqpipe", version: "0.1.0" });

  // ── get_live_feed ──────────────────────────────────────────────────────────
  server.tool(
    "get_live_feed",
    "Returns already-ingested signal health for all connected tools: event counts (24h / 7d / all-time), " +
    "status (live / slow / silent / never), and top event types per tool. " +
    "No credentials needed — reads from IQPipe's stored event database.",
    {},
    async () => {
      const now = new Date();
      const h24 = new Date(now.getTime() - 24 * 3_600_000);
      const d7  = new Date(now.getTime() - 7 * 24 * 3_600_000);

      const [connections, allTime, cnt24h, cnt7d, lastEvt, byType] = await Promise.all([
        prisma.integrationConnection.findMany({ where: { workspaceId, status: "connected" }, select: { provider: true } }),
        prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId }, _count: { id: true } }),
        prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId, recordedAt: { gte: h24 } }, _count: { id: true } }),
        prisma.touchpoint.groupBy({ by: ["tool"], where: { workspaceId, recordedAt: { gte: d7  } }, _count: { id: true } }),
        prisma.touchpoint.findMany({ where: { workspaceId }, orderBy: { recordedAt: "desc" }, distinct: ["tool"], select: { tool: true, recordedAt: true } }),
        prisma.touchpoint.groupBy({ by: ["tool", "eventType"], where: { workspaceId }, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
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
          tool, status,
          totalEvents: mapAll[tool] ?? 0,
          events24h:   map24h[tool] ?? 0,
          events7d:    map7d[tool]  ?? 0,
          lastEventAt: lastAt,
          topEvents:   (toolTypes[tool] ?? []).slice(0, 4).map(e => ({ eventType: e.eventType, count: e.count })),
        };
      });

      return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
    }
  );

  // ── get_funnel ─────────────────────────────────────────────────────────────
  server.tool(
    "get_funnel",
    "GTM funnel stages with event counts and conversion rates between adjacent stages. " +
    "Reads from IQPipe's full event database (all sources: webhooks, n8n, Make, direct API). " +
    "When workflowId is provided, filters to events that passed through that specific workflow.",
    { workflowId: z.string().optional().describe("IQPipe workflow ID or n8n native ID from list_workflows. Leave empty for workspace-wide funnel.") },
    async ({ workflowId }: any) => {
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

      const rows = await prisma.touchpoint.groupBy({ by: ["eventType"], where, _count: { id: true } });
      const ORDER: Record<string, number> = {
        contact_created: 1, email_sent: 2, email_opened: 3, email_clicked: 4,
        reply_received: 5, meeting_booked: 6, deal_created: 7, deal_won: 8, deal_lost: 8,
      };
      const stages = rows
        .map(r => ({ eventType: r.eventType, count: r._count.id, funnelPos: ORDER[r.eventType] ?? 99 }))
        .sort((a, b) => a.funnelPos - b.funnelPos);
      const result = stages.map((s, i) => {
        const prev = stages[i - 1];
        return { ...s, conversionFromPrev: prev && prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : null };
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── list_workflows ─────────────────────────────────────────────────────────
  server.tool(
    "list_workflows",
    "Returns ALL saved automation workflows across every connected platform (n8n AND Make.com). " +
    "Each workflow has a 'platform' field ('n8n' or 'make') — always read the full list before " +
    "drawing conclusions. Never assume a workflow is n8n-only. " +
    "Fields: id, name, platform, active, appsUsed, nodeCount, triggerType, lastUpdatedAt.",
    {},
    async () => {
      const [n8nRows, makeRows] = await Promise.all([
        prisma.n8nWorkflowMeta.findMany({
          where:   { workspaceId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select:  { id: true, n8nId: true, name: true, active: true, appsUsed: true, nodeCount: true, triggerType: true, lastUpdatedAt: true, syncedAt: true },
        }),
        prisma.makeScenarioMeta.findMany({
          where:   { workspaceId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select:  { id: true, makeId: true, name: true, active: true, appsUsed: true, moduleCount: true, triggerType: true, lastUpdatedAt: true, syncedAt: true },
        }),
      ]);

      // Flat unified array — platform-neutral, sorted active-first then name
      const all = [
        ...n8nRows.map(w => ({
          id:            w.id,
          nativeId:      w.n8nId,
          platform:      "n8n",
          name:          w.name,
          active:        w.active,
          appsUsed:      JSON.parse(w.appsUsed),
          nodeCount:     w.nodeCount,
          triggerType:   w.triggerType,
          lastUpdatedAt: w.lastUpdatedAt?.toISOString() ?? null,
          syncedAt:      w.syncedAt.toISOString(),
        })),
        ...makeRows.map(s => ({
          id:            s.id,
          nativeId:      s.makeId,
          platform:      "make",
          name:          s.name,
          active:        s.active,
          appsUsed:      JSON.parse(s.appsUsed),
          nodeCount:     s.moduleCount,
          triggerType:   s.triggerType,
          lastUpdatedAt: s.lastUpdatedAt?.toISOString() ?? null,
          syncedAt:      s.syncedAt.toISOString(),
        })),
      ].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ total: all.length, workflows: all }, null, 2),
        }],
      };
    }
  );

  // ── get_workflow_health ────────────────────────────────────────────────────
  server.tool(
    "get_workflow_health",
    "Success rates and health labels for ALL workflows across every platform (n8n AND Make.com). " +
    "Returns a flat list — every item has a 'platform' field. Always evaluate all items, not just n8n ones. " +
    "Health: healthy ≥90%, warning ≥70%, critical <70%, no_data = no events in period.",
    { period: z.enum(["7d", "14d", "30d", "90d"]).optional().default("30d") },
    async ({ period }: any) => {
      const days  = parseInt((period ?? "30d").replace("d", "")) || 30;
      const since = new Date(Date.now() - days * 24 * 3_600_000);

      const [n8nMetas, makeMetas, eventCounts] = await Promise.all([
        prisma.n8nWorkflowMeta.findMany({ where: { workspaceId }, select: { id: true, n8nId: true, name: true, active: true } }),
        prisma.makeScenarioMeta.findMany({ where: { workspaceId }, select: { id: true, makeId: true, name: true, active: true } }),
        prisma.n8nQueuedEvent.groupBy({ by: ["workflowId", "status"], where: { workspaceId, processedAt: { gte: since } }, _count: { id: true } }),
      ]);

      const byWf: Record<string, { done: number; failed: number; total: number }> = {};
      for (const r of eventCounts) {
        if (!byWf[r.workflowId]) byWf[r.workflowId] = { done: 0, failed: 0, total: 0 };
        byWf[r.workflowId].total += r._count.id;
        if (r.status === "done")   byWf[r.workflowId].done   += r._count.id;
        if (r.status === "failed") byWf[r.workflowId].failed += r._count.id;
      }

      const summarise = (id: string, nativeId: string, name: string, platform: string, active: boolean) => {
        const m = byWf[nativeId] ?? { done: 0, failed: 0, total: 0 };
        const successRate = m.total > 0 ? Math.round((m.done / m.total) * 100) : null;
        return {
          id, name, platform, active, period: period ?? "30d",
          eventsTotal: m.total, eventsDone: m.done, eventsFailed: m.failed, successRate,
          health: successRate === null ? "no_data" : successRate >= 90 ? "healthy" : successRate >= 70 ? "warning" : "critical",
        };
      };

      const result = [
        ...n8nMetas.map(w => summarise(w.id, w.n8nId, w.name, "n8n", w.active)),
        ...makeMetas.map(s => summarise(s.id, s.makeId, s.name, "make", s.active)),
      ];
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── search_contacts ────────────────────────────────────────────────────────
  server.tool(
    "search_contacts",
    "Search contacts from IQPipe's already-stored event database — no credentials or integrations needed. " +
    "Use eventType to filter contacts who have a specific event in their history — e.g. 'deal_won', 'meeting_booked', 'payment_received', 'reply_received'. " +
    "Do NOT use setup_workflow_mirror to answer questions about existing contact data — use this tool instead. " +
    "Combine with q to also filter by name or company.",
    {
      q:         z.string().optional().describe("Search query — displayName or company."),
      eventType: z.string().optional().describe("Filter to contacts who have this event type in their history. e.g. 'deal_won', 'meeting_booked', 'payment_received'."),
      limit:     z.number().int().min(1).max(200).optional().default(50),
    },
    async ({ q, eventType, limit }: any) => {
      const where: any = { workspaceId };
      if (q) where.OR = [
        { displayName: { contains: q, mode: "insensitive" } },
        { company:     { contains: q, mode: "insensitive" } },
      ];
      if (eventType) where.touchpoints = { some: { workspaceId, eventType } };
      const leads = await prisma.iqLead.findMany({
        where, orderBy: { lastSeenAt: "desc" }, take: limit ?? 50,
        select: { id: true, displayName: true, company: true, title: true, firstSeenAt: true, lastSeenAt: true },
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(leads.map(l => ({ ...l, firstSeenAt: l.firstSeenAt.toISOString(), lastSeenAt: l.lastSeenAt.toISOString() })), null, 2),
        }],
      };
    }
  );

  // ── get_mirror_app_catalog ─────────────────────────────────────────────────
  server.tool(
    "get_mirror_app_catalog",
    "All apps that can be connected to a workflow mirror: appKey, connectionType, and available event keys. " +
    "Call this before setup_workflow_mirror to get valid values.",
    {},
    async () => {
      const catalog = Object.entries(APP_CATALOG).map(([appKey, meta]) => ({
        appKey, label: meta.label, connectionType: meta.connectionType,
        events: meta.events.map(e => ({ key: e.key, label: e.label, category: e.category })),
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(catalog, null, 2) }] };
    }
  );

  // ── get_workflow_mirror ────────────────────────────────────────────────────
  server.tool(
    "get_workflow_mirror",
    "Current mirror config for a workflow: connected apps, credential/webhook presence, observed events.",
    { workflowId: z.string().describe("IQPipe workflow ID from list_workflows.") },
    async ({ workflowId }: any) => {
      const mirror = await prisma.workflowMirror.findUnique({
        where:   { workspaceId_workflowId: { workspaceId, workflowId } },
        include: { appConnections: { include: { observedEvents: true }, orderBy: { appKey: "asc" } } },
      });
      if (!mirror) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ configured: false, workflowId, message: "No mirror configured yet." }) }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            configured: true, mirrorId: mirror.id, workflowId: mirror.workflowId,
            platform: mirror.platform, correlationKey: mirror.correlationKey,
            apps: mirror.appConnections.map(c => ({
              appKey: c.appKey, connectionType: c.connectionType, status: c.status,
              hasCredential: !!c.credentialEnc, hasWebhook: !!c.webhookSecret,
              observedEvents: c.observedEvents.map(e => ({ key: e.eventKey, label: e.label })),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── connect_integration ────────────────────────────────────────────────────
  server.tool(
    "connect_integration",
    "Connect a third-party tool (Apollo, HubSpot, Clay, Stripe, etc.) to the workspace. " +
    "Credentials are validated live against the provider API before storage.\n" +
    "Supported: apollo, hubspot, pipedrive, clay, stripe, heyreach, lemlist, instantly, " +
    "smartlead, outreach, phantombuster, clearbit, lusha, pdl, snovio, rocketreach, attio, chargebee.\n" +
    "credentials format: { apiKey } for most. Clay also needs { tableId }.",
    {
      provider:    z.string().describe("Provider key, e.g. 'apollo', 'hubspot', 'clay'."),
      credentials: z.record(z.string()).describe("Credential fields, e.g. { apiKey: 'sk_...' }."),
    },
    async ({ provider, credentials }: any) => {
      const authData = sanitizeSecrets(credentials as Record<string, unknown>);
      if (Object.keys(authData).length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No valid credentials (each value must be ≥8 chars)." }) }] };
      }
      const checker = providerCheckers[provider];
      const result  = checker ? await checker(authData) : { success: true };
      const status  = result.success ? "connected" : "not_connected";

      const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
      if (!result.success) {
        if (existing) await prisma.integrationConnection.update({ where: { id: existing.id }, data: { status: "not_connected" } });
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: result.message ?? "Credential validation failed", provider, status }) }] };
      }

      const encryptedAuth = encrypt(JSON.stringify(authData));
      if (existing) {
        await prisma.integrationConnection.update({ where: { id: existing.id }, data: { status, authData: encryptedAuth } });
      } else {
        await prisma.integrationConnection.create({ data: { workspaceId, provider, status, authData: encryptedAuth } });
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, provider, status, message: `${provider} connected.` }) }] };
    }
  );

  // ── disconnect_integration ─────────────────────────────────────────────────
  server.tool(
    "disconnect_integration",
    "Disconnect a third-party integration, clearing stored credentials. Historical data is kept.",
    { provider: z.string().describe("Provider to disconnect, e.g. 'hubspot'.") },
    async ({ provider }: any) => {
      const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
      if (conn) await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: "not_connected", authData: null } });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, provider, status: "not_connected" }) }] };
    }
  );

  // ── connect_n8n ────────────────────────────────────────────────────────────
  server.tool(
    "connect_n8n",
    "Connect an n8n instance. Validates the connection then syncs workflows in the background.",
    {
      baseUrl: z.string().describe("n8n base URL, e.g. 'https://my-n8n.example.com'."),
      apiKey:  z.string().describe("n8n API key from Settings → API."),
    },
    async ({ baseUrl, apiKey }: any) => {
      const cleanBase = baseUrl.trim().replace(/\/+$/, "");
      if (!cleanBase.startsWith("http")) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "baseUrl must start with http:// or https://" }) }] };
      }
      const test = await testN8nConnection(cleanBase, apiKey.trim());
      if (!test.ok) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot reach n8n: ${test.error}` }) }] };
      }
      await prisma.n8nConnection.upsert({
        where:  { workspaceId },
        create: { workspaceId, baseUrl: cleanBase, apiKeyEnc: encrypt(apiKey.trim()), status: "connected" },
        update: { baseUrl: cleanBase, apiKeyEnc: encrypt(apiKey.trim()), status: "connected", lastError: null },
      });
      syncN8nConnection(workspaceId).catch(console.error);
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, message: "n8n connected — syncing workflows.", baseUrl: cleanBase }) }] };
    }
  );

  // ── connect_make ───────────────────────────────────────────────────────────
  server.tool(
    "connect_make",
    "Connect a Make.com account. Validates the API key then syncs scenarios in the background.",
    {
      apiKey: z.string().describe("Make.com API token from Profile → API access."),
      region: z.enum(["us1", "us2", "eu1", "eu2"]).optional().default("us1"),
    },
    async ({ apiKey, region }: any) => {
      const cleanRegion = (region ?? "us1").trim().toLowerCase();
      const test = await testMakeConnection(apiKey.trim(), cleanRegion);
      if (!test.ok) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot reach Make.com: ${test.error}` }) }] };
      }
      await prisma.makeConnection.upsert({
        where:  { workspaceId },
        create: { workspaceId, apiKeyEnc: encrypt(apiKey.trim()), region: cleanRegion, teamId: test.teamId || null, organizationId: test.organizationId || null, status: "connected" },
        update: { apiKeyEnc: encrypt(apiKey.trim()), region: cleanRegion, teamId: test.teamId || null, organizationId: test.organizationId || null, status: "connected", lastError: null },
      });
      syncMakeConnection(workspaceId).catch(console.error);
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, message: "Make.com connected — syncing scenarios.", region: cleanRegion }) }] };
    }
  );

  // ── setup_workflow_mirror ──────────────────────────────────────────────────
  server.tool(
    "setup_workflow_mirror",
    "Set up LIVE webhook/polling connections for a workflow mirror going forward — only use this when the user explicitly wants to connect new app integrations. " +
    "Do NOT call this to query existing contact data or events already in IQPipe — use search_contacts with eventType instead.\n" +
    "Call get_mirror_app_catalog first for valid appKeys and event keys.\n" +
    "correlationKey: shared field that links events across apps (e.g. 'email').\n" +
    "Supported appKeys: hubspot, salesforce, pipedrive, attio, instantly, lemlist, smartlead, " +
    "heyreach, apollo, clay, stripe, calendly, slack.",
    {
      workflowId:     z.string().describe("IQPipe workflow ID from list_workflows."),
      platform:       z.enum(["n8n", "make"]),
      correlationKey: z.string().optional().describe("Shared field to correlate events, e.g. 'email'."),
      apps: z.array(z.object({
        appKey:         z.string(),
        connectionType: z.enum(["webhook", "polling"]),
        credential:     z.string().optional().describe("API key or access token."),
        webhookSecret:  z.string().optional().describe("Webhook signing secret."),
        events:         z.array(z.string()).optional().describe("Event keys to observe."),
      })),
    },
    async ({ workflowId, platform, correlationKey, apps }: any) => {
      const mirror = await prisma.workflowMirror.upsert({
        where:  { workspaceId_workflowId: { workspaceId, workflowId } },
        create: { workspaceId, workflowId, platform, correlationKey: correlationKey ?? null, unknownMappings: "{}" },
        update: { correlationKey: correlationKey ?? null },
      });

      const connectedApps: string[] = [];
      const warnings: string[] = [];

      for (const app of apps) {
        const { appKey, connectionType, credential, webhookSecret, events = [] } = app;
        const catalogEntry = APP_CATALOG[appKey];
        if (!catalogEntry) { warnings.push(`Unknown appKey "${appKey}"`); continue; }

        const credentialEnc = credential ? encrypt(credential) : undefined;
        const conn = await prisma.workflowAppConnection.upsert({
          where:  { mirrorId_appKey: { mirrorId: mirror.id, appKey } },
          create: { workspaceId, mirrorId: mirror.id, appKey, connectionType, credentialEnc: credentialEnc ?? null, webhookSecret: webhookSecret ?? null, status: "connected" },
          update: { connectionType, ...(credentialEnc ? { credentialEnc } : {}), ...(webhookSecret ? { webhookSecret } : {}), status: "connected", errorMessage: null },
        });

        if (events.length > 0) {
          await prisma.observedEvent.deleteMany({ where: { connectionId: conn.id } });
          const validEvents = events
            .map((key: string) => { const meta = catalogEntry.events.find(e => e.key === key); return meta ? { connectionId: conn.id, appKey, eventKey: key, label: meta.label } : null; })
            .filter(Boolean) as { connectionId: string; appKey: string; eventKey: string; label: string }[];
          if (validEvents.length > 0) await prisma.observedEvent.createMany({ data: validEvents });
          if (validEvents.length < events.length) warnings.push(`Some events for "${appKey}" were invalid — check get_mirror_app_catalog`);
        }
        connectedApps.push(appKey);
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ok: true, mirrorId: mirror.id, workflowId, correlationKey: mirror.correlationKey,
            connectedApps, message: `Mirror configured. ${connectedApps.length} app(s) connected.`,
            ...(warnings.length ? { warnings } : {}),
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool: get_webhook_url ────────────────────────────────────────────────────

  server.tool(
    "get_webhook_url",
    "Returns the IQPipe webhook URL for a specific app in a workflow mirror. " +
    "Register this URL in the app's dashboard (HubSpot, Instantly, Lemlist, etc.) so IQPipe " +
    "can receive real-time events and correlate them back to the automation that triggered them. " +
    "Call this after setup_workflow_mirror for every webhook-type app you connected.",
    {
      workflowId: z.string().describe("IQPipe workflow ID from list_workflows."),
      appKey:     z.string().describe("App key, e.g. 'hubspot', 'instantly', 'lemlist'. Must be connected to the mirror via setup_workflow_mirror."),
    },
    async ({ workflowId, appKey }: any) => {
      const mirror = await prisma.workflowMirror.findUnique({
        where:   { workspaceId_workflowId: { workspaceId, workflowId } },
        include: { appConnections: { where: { appKey } } },
      });

      if (!mirror) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No mirror found for this workflow. Run setup_workflow_mirror first." }) }] };
      }

      const conn = mirror.appConnections[0];
      if (!conn) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `App "${appKey}" is not connected to this mirror. Run setup_workflow_mirror to add it.` }) }] };
      }

      if (conn.connectionType === "polling") {
        const catalogEntry = APP_CATALOG[appKey];
        return { content: [{ type: "text" as const, text: JSON.stringify({
          appKey, connectionType: "polling", webhookUrl: null,
          note: `${catalogEntry?.label ?? appKey} uses polling — no webhook URL needed. IQPipe fetches events automatically.`,
        }, null, 2) }] };
      }

      const webhookUrl = `${baseUrl}/api/app-webhooks/${appKey}?workspaceId=${workspaceId}&mirrorId=${mirror.id}`;
      const catalogEntry = APP_CATALOG[appKey];

      return { content: [{ type: "text" as const, text: JSON.stringify({
        appKey,
        connectionType: "webhook",
        webhookUrl,
        mirrorId: mirror.id,
        instructions: `Register this URL as a webhook endpoint in your ${catalogEntry?.label ?? appKey} dashboard. ` +
          `Use the webhook secret you provided in setup_workflow_mirror for HMAC signature verification.`,
      }, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — CRM MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Tool: get_contact ──────────────────────────────────────────────────────

  server.tool(
    "get_contact",
    "Get full details for a contact/lead by id or email address. " +
    "Returns name, email, company, title, status, scores, and the 10 most recent activity events.",
    {
      id:    z.string().optional().describe("Contact id (from search_contacts)."),
      email: z.string().optional().describe("Email address. Used if id is not provided."),
    },
    async ({ id, email }: any) => {
      if (!id && !email) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "id or email is required" }) }] };

      const lead = await prisma.lead.findFirst({
        where: id
          ? { id, workspaceId }
          : { email: { equals: email, mode: "insensitive" }, workspaceId },
        include: { activities: { orderBy: { createdAt: "desc" }, take: 10 } },
      });

      if (!lead) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Contact not found" }) }] };

      return { content: [{ type: "text" as const, text: JSON.stringify({
        id:        lead.id,
        name:      lead.fullName || `${(lead as any).firstName ?? ""} ${(lead as any).lastName ?? ""}`.trim() || lead.email || "Unknown",
        email:     lead.email,
        company:   lead.company,
        title:     lead.title,
        status:    lead.status,
        source:    lead.source,
        fitScore:  (lead as any).fitScore,
        leadScore: (lead as any).leadScore,
        createdAt: lead.createdAt.toISOString(),
        recentActivity: (lead.activities as any[]).map((a: any) => ({
          type: a.type, note: a.body ?? a.subject ?? null, createdAt: a.createdAt.toISOString(),
        })),
      }, null, 2) }] };
    }
  );

  // ── Tool: create_contact ───────────────────────────────────────────────────

  server.tool(
    "create_contact",
    "Create a new contact/lead in the workspace. Email is required and must be unique. " +
    "Status defaults to 'new'; source defaults to 'manual'.",
    {
      email:     z.string().describe("Contact email address (required, must be unique)."),
      firstName: z.string().optional().describe("First name."),
      lastName:  z.string().optional().describe("Last name."),
      company:   z.string().optional().describe("Company name."),
      title:     z.string().optional().describe("Job title."),
      status:    z.string().optional().describe("Status, e.g. 'new', 'active', 'qualified'. Defaults to 'new'."),
      source:    z.string().optional().describe("Lead source, e.g. 'manual', 'apollo', 'linkedin'. Defaults to 'manual'."),
    },
    async ({ email, firstName, lastName, company, title, status, source }: any) => {
      if (!email) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "email is required" }) }] };

      const existing = await prisma.lead.findFirst({ where: { workspaceId, email: { equals: email, mode: "insensitive" } } });
      if (existing) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "A contact with this email already exists", id: existing.id }) }] };

      const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
      const lead = await prisma.lead.create({
        data: {
          workspaceId, email, fullName,
          firstName: firstName ?? null, lastName: lastName ?? null,
          company: company ?? null, title: title ?? null,
          status: status ?? "new", source: source ?? "manual",
        },
      });

      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: lead.id, email: lead.email, name: lead.fullName }, null, 2) }] };
    }
  );

  // ── Tool: update_contact ───────────────────────────────────────────────────

  server.tool(
    "update_contact",
    "Update a contact/lead's fields. Only the fields you provide will be changed. " +
    "Common use: change status to 'qualified' or 'disqualified', update title or company after enrichment.",
    {
      id:        z.string().describe("Contact id from search_contacts or get_contact."),
      firstName: z.string().optional(),
      lastName:  z.string().optional(),
      company:   z.string().optional(),
      title:     z.string().optional(),
      status:    z.string().optional().describe("e.g. 'new', 'active', 'qualified', 'disqualified'"),
      source:    z.string().optional(),
      fitScore:  z.number().optional().describe("Fit score 0–100."),
      leadScore: z.number().optional().describe("Lead score 0–100."),
    },
    async ({ id, firstName, lastName, company, title, status, source, fitScore, leadScore }: any) => {
      const existing = await prisma.lead.findFirst({ where: { id, workspaceId } });
      if (!existing) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Contact not found" }) }] };

      const data: Record<string, unknown> = {};
      if (firstName  !== undefined) { data.firstName = firstName; data.fullName = [firstName, (existing as any).lastName ?? lastName].filter(Boolean).join(" ") || null; }
      if (lastName   !== undefined) { data.lastName  = lastName;  data.fullName = [(existing as any).firstName ?? firstName, lastName].filter(Boolean).join(" ") || null; }
      if (company    !== undefined) data.company    = company;
      if (title      !== undefined) data.title      = title;
      if (status     !== undefined) data.status     = status;
      if (source     !== undefined) data.source     = source;
      if (fitScore   !== undefined) data.fitScore   = fitScore;
      if (leadScore  !== undefined) data.leadScore  = leadScore;

      const updated = await prisma.lead.update({ where: { id }, data });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: updated.id, email: updated.email, status: updated.status }, null, 2) }] };
    }
  );

  // ── Tool: list_deals ──────────────────────────────────────────────────────

  server.tool(
    "list_deals",
    "List deals in the workspace. Filter by stage and/or pipeline. " +
    "Common stages: qualification, proposal, negotiation, closed_won, closed_lost. " +
    "Returns deal name, stage, amount, account, and contact.",
    {
      stage:    z.string().optional().describe("Filter by stage, e.g. 'qualification', 'proposal', 'closed_won'."),
      pipeline: z.string().optional().describe("Filter by pipeline, e.g. 'new_business'."),
      limit:    z.number().int().min(1).max(200).optional().default(50),
    },
    async ({ stage, pipeline, limit }: any) => {
      const where: any = { workspaceId };
      if (stage)    where.stage    = stage;
      if (pipeline) where.pipeline = pipeline;

      const deals = await prisma.deal.findMany({
        where, orderBy: { createdAt: "desc" }, take: limit ?? 50,
        include: {
          account:        { select: { id: true, name: true } },
          primaryContact: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      return { content: [{ type: "text" as const, text: JSON.stringify(
        deals.map((d: any) => ({
          id: d.id, name: d.name, stage: d.stage, pipeline: d.pipeline,
          amount: d.amount, currency: d.currency, probability: d.probability,
          expectedCloseDate: (d.expectedCloseDate as Date | null)?.toISOString()?.split("T")[0] ?? null,
          account: d.account ? { id: d.account.id, name: d.account.name } : null,
          contact: d.primaryContact ? { id: d.primaryContact.id, name: `${d.primaryContact.firstName ?? ""} ${d.primaryContact.lastName ?? ""}`.trim(), email: d.primaryContact.email } : null,
          createdAt: (d.createdAt as Date).toISOString(),
        }))
      , null, 2) }] };
    }
  );

  // ── Tool: create_deal ─────────────────────────────────────────────────────

  server.tool(
    "create_deal",
    "Create a new deal. Name and accountId are required — use list_accounts or create_account first to get an accountId. " +
    "Stage defaults to 'qualification'; pipeline defaults to 'new_business'; currency defaults to 'USD'.",
    {
      name:             z.string().describe("Deal name (required)."),
      accountId:        z.string().describe("Account id (required). Get from list_accounts or create_account."),
      primaryContactId: z.string().optional().describe("Contact id for the primary contact (from search_contacts)."),
      stage:            z.string().optional().describe("Pipeline stage. Defaults to 'qualification'."),
      pipeline:         z.string().optional().describe("Pipeline name. Defaults to 'new_business'."),
      amount:           z.number().optional().describe("Deal value."),
      currency:         z.string().optional().describe("Currency code, e.g. 'USD', 'EUR'. Defaults to 'USD'."),
      probability:      z.number().optional().describe("Win probability 0–100."),
      expectedCloseDate: z.string().optional().describe("Expected close date in YYYY-MM-DD format."),
    },
    async ({ name, accountId, primaryContactId, stage, pipeline, amount, currency, probability, expectedCloseDate }: any) => {
      if (!name)      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "name is required" }) }] };
      if (!accountId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "accountId is required — call list_accounts or create_account first" }) }] };

      const deal = await prisma.deal.create({
        data: {
          workspaceId, name,
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

      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: deal.id, name: deal.name, stage: deal.stage }, null, 2) }] };
    }
  );

  // ── Tool: update_deal ─────────────────────────────────────────────────────

  server.tool(
    "update_deal",
    "Update a deal's fields. Only the fields you provide will be changed. " +
    "Common use: advance stage to 'closed_won' or 'closed_lost', update amount after negotiation.",
    {
      id:               z.string().describe("Deal id from list_deals."),
      name:             z.string().optional(),
      stage:            z.string().optional().describe("e.g. 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'."),
      pipeline:         z.string().optional(),
      amount:           z.number().optional(),
      currency:         z.string().optional(),
      probability:      z.number().optional().describe("Win probability 0–100."),
      expectedCloseDate: z.string().optional().describe("YYYY-MM-DD format."),
      primaryContactId: z.string().optional(),
      accountId:        z.string().optional(),
    },
    async ({ id, name, stage, pipeline, amount, currency, probability, expectedCloseDate, primaryContactId, accountId }: any) => {
      const existing = await prisma.deal.findFirst({ where: { id, workspaceId } });
      if (!existing) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Deal not found" }) }] };

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
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: updated.id, name: updated.name, stage: updated.stage }, null, 2) }] };
    }
  );

  // ── Tool: list_accounts ───────────────────────────────────────────────────

  server.tool(
    "list_accounts",
    "List accounts/companies in the workspace. Optionally search by name or domain. " +
    "Returns account id, name, domain, industry, employee count, lifecycle stage, and counts of linked contacts and deals.",
    {
      q:     z.string().optional().describe("Search query — matches name or domain. Leave empty to list all."),
      limit: z.number().int().min(1).max(200).optional().default(50),
    },
    async ({ q, limit }: any) => {
      const where: any = { workspaceId };
      if (q) { where.OR = [{ name: { contains: q, mode: "insensitive" } }, { domain: { contains: q, mode: "insensitive" } }]; }

      const accounts = await prisma.account.findMany({
        where, orderBy: { name: "asc" }, take: limit ?? 50,
        select: {
          id: true, name: true, domain: true, industry: true,
          employeeCount: true, country: true, lifecycleStage: true,
          _count: { select: { leads: true, deals: true } },
        },
      });

      return { content: [{ type: "text" as const, text: JSON.stringify(
        accounts.map((a: any) => ({
          id: a.id, name: a.name, domain: a.domain, industry: a.industry,
          employeeCount: a.employeeCount, country: a.country,
          lifecycleStage: a.lifecycleStage,
          contactCount: a._count.leads, dealCount: a._count.deals,
        }))
      , null, 2) }] };
    }
  );

  // ── Tool: create_account ──────────────────────────────────────────────────

  server.tool(
    "create_account",
    "Create a new account/company record. Name is required. " +
    "lifecycleStage defaults to 'prospect'. Common stages: prospect, lead, customer, churned.",
    {
      name:           z.string().describe("Company name (required)."),
      domain:         z.string().optional().describe("Domain, e.g. 'acme.com'."),
      industry:       z.string().optional().describe("Industry, e.g. 'SaaS', 'FinTech'."),
      employeeCount:  z.number().int().optional().describe("Number of employees."),
      country:        z.string().optional(),
      city:           z.string().optional(),
      websiteUrl:     z.string().optional(),
      lifecycleStage: z.string().optional().describe("e.g. 'prospect', 'lead', 'customer'. Defaults to 'prospect'."),
    },
    async ({ name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage }: any) => {
      if (!name) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "name is required" }) }] };

      const account = await prisma.account.create({
        data: {
          workspaceId, name,
          domain: domain ?? null, industry: industry ?? null,
          employeeCount: employeeCount ?? null,
          country: country ?? null, city: city ?? null,
          websiteUrl: websiteUrl ?? null,
          lifecycleStage: lifecycleStage ?? "prospect",
        },
      });

      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: account.id, name: account.name }, null, 2) }] };
    }
  );

  // ── Tool: update_account ──────────────────────────────────────────────────

  server.tool(
    "update_account",
    "Update an account/company's fields. Only the fields you provide will be changed. " +
    "Common use: advance lifecycleStage to 'customer' after a deal is won.",
    {
      id:             z.string().describe("Account id from list_accounts."),
      name:           z.string().optional(),
      domain:         z.string().optional(),
      industry:       z.string().optional(),
      employeeCount:  z.number().int().optional(),
      country:        z.string().optional(),
      city:           z.string().optional(),
      websiteUrl:     z.string().optional(),
      lifecycleStage: z.string().optional().describe("e.g. 'prospect', 'lead', 'customer', 'churned'."),
    },
    async ({ id, name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage }: any) => {
      const existing = await prisma.account.findFirst({ where: { id, workspaceId } });
      if (!existing) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Account not found" }) }] };

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
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id: updated.id, name: updated.name, lifecycleStage: updated.lifecycleStage }, null, 2) }] };
    }
  );

  // ── Tool: get_anomalies ───────────────────────────────────────────────────

  server.tool(
    "get_anomalies",
    "Returns all active anomaly notifications for this workspace — tool status changes " +
    "(live→slow, slow→silent), workflow health degradations, and event-type disappearances. " +
    "These are detected automatically every 30 minutes by IQPipe's background scanner. " +
    "Use this as your starting point for diagnosing GTM issues without needing any external API keys.",
    {
      unreadOnly: z.boolean().optional().default(true).describe("If true (default), return only unread anomaly notifications."),
      limit:      z.number().int().min(1).max(100).optional().default(20),
    },
    async ({ unreadOnly, limit }: any) => {
      const where: any = {
        workspaceId,
        type: { in: ["tool_status", "workflow_health", "event_gap"] },
      };
      if (unreadOnly !== false) where.isRead = false;

      const rows = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    limit ?? 20,
        select:  { id: true, type: true, title: true, body: true, severity: true, isRead: true, createdAt: true },
      });

      const result = {
        count:     rows.length,
        anomalies: rows.map((n: any) => ({
          id:        n.id,
          type:      n.type,
          severity:  n.severity,
          title:     n.title,
          details:   n.body,
          detected:  (n.createdAt as Date).toISOString(),
          read:      n.isRead,
        })),
        hint: rows.length === 0
          ? "No active anomalies detected. All tools and workflows appear healthy."
          : `Found ${rows.length} anomaly/anomalies. Investigate the most severe ones first (severity=error before warning).`,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: diagnose_issue ─────────────────────────────────────────────────

  server.tool(
    "diagnose_issue",
    "Performs a root-cause diagnosis for a detected GTM anomaly. " +
    "Pass EXACTLY ONE of: tool (integration slug, e.g. 'hubspot'), workflowId (n8n/Make workflow id), " +
    "or eventType (iqpipe event type, e.g. 'email_sent'). " +
    "The engine cross-references event timestamps, credential update history, workflow failure ratios, " +
    "funnel gaps, and app connection status to rank probable causes by confidence. " +
    "Also returns affected contact count and estimated revenue at risk. " +
    "Call get_anomalies first to identify what to diagnose — then call this tool for each anomaly.",
    {
      tool:       z.string().optional().describe("Integration tool slug, e.g. 'hubspot', 'apollo', 'heyreach'. Use this when a tool is slow or silent."),
      workflowId: z.string().optional().describe("Workflow ID from list_workflows or get_anomalies. Use this when a workflow's health degraded."),
      eventType:  z.string().optional().describe("IQPipe event type, e.g. 'email_sent', 'meeting_booked'. Use this when an event type disappeared from the feed."),
    },
    async ({ tool: toolArg, workflowId, eventType }: any) => {
      if (!toolArg && !workflowId && !eventType) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide exactly one of: tool, workflowId, or eventType." }) }] };
      }

      const report = await diagnose(workspaceId, { tool: toolArg, workflowId, eventType });
      return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
    }
  );

  // ── Tool: apply_fix ──────────────────────────────────────────────────────

  server.tool(
    "apply_fix",
    "Applies a remediation for a diagnosed GTM anomaly. " +
    "Call diagnose_issue first to get the probable cause, then call this tool with that cause. " +
    "Fixes are classified as: " +
    "(1) auto-executed — IQPipe applies the fix immediately (e.g. return fresh webhook URL, re-activate paused workflow); " +
    "(2) needs_confirmation — IQPipe can execute but requires user approval first (e.g. activating a workflow); " +
    "(3) manual_required — IQPipe generates precise step-by-step instructions tailored to the specific tool. " +
    "For confirmation-required fixes: present the description to the user, get their approval, then re-call with confirmed:true. " +
    "IMPORTANT: Never pass confirmed:true without explicit user approval.",
    {
      cause:      z.string().describe(
        "The diagnosed cause key from diagnose_issue. E.g. 'webhook_delivery_failed', 'api_key_rotated_or_revoked', " +
        "'workflow_not_triggering', 'rate_limit_or_quota_exhausted', 'integration_disconnected', 'never_received_events', " +
        "'app_connection_broken', 'workflow_processing_errors', 'upstream_funnel_step_broken', " +
        "'event_type_filter_removed_or_trigger_changed', 'all_source_tools_silent'."
      ),
      tool:       z.string().optional().describe("Tool slug from diagnose_issue, e.g. 'hubspot', 'heyreach'."),
      workflowId: z.string().optional().describe("Workflow ID from diagnose_issue."),
      eventType:  z.string().optional().describe("Event type from diagnose_issue, e.g. 'email_sent'."),
      confirmed:  z.boolean().optional().default(false).describe(
        "Set to true ONLY after the user has explicitly approved an action that modifies external state. Default false."
      ),
    },
    async ({ cause, tool: toolArg, workflowId, eventType, confirmed }: any) => {
      const result = await applyFix(workspaceId, {
        cause,
        tool:       toolArg,
        workflowId,
        eventType,
        confirmed:  confirmed ?? false,
        baseUrl,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: watch_recovery ─────────────────────────────────────────────────

  server.tool(
    "watch_recovery",
    "Checks whether a tool, workflow, or event type has recovered after a fix was applied. " +
    "Call this after apply_fix to verify the fix worked. This is a point-in-time snapshot — " +
    "call it periodically (every 5 minutes) until status is 'recovered' or 'timeout'. " +
    "Recovery signals: tool → first new touchpoint after fix; workflow → success rate ≥ 90% or +15pt; event type → reappears in live feed. " +
    "On recovery: reports first event details (contact, company, deal amount), minutes after fix, and funnel health. " +
    "On timeout: automatically runs a second-level diagnosis and returns the updated probable cause for re-diagnosis. " +
    "Pass EXACTLY ONE of: tool, workflowId, or eventType — the same subject passed to apply_fix.",
    {
      tool:            z.string().optional().describe("Tool slug to watch, e.g. 'hubspot'. Use if fix was for a silent/slow tool."),
      workflowId:      z.string().optional().describe("Workflow ID to watch. Use if fix was for a degraded workflow."),
      eventType:       z.string().optional().describe("Event type to watch, e.g. 'email_sent'. Use if fix was for a disappeared event type."),
      fixAppliedAt:    z.string().describe("ISO 8601 timestamp of when the fix was applied. Use the current time if unknown. Example: '2024-03-21T14:32:00Z'."),
      timeoutMinutes:  z.number().int().min(5).max(120).optional().describe(
        "How many minutes to wait before declaring a timeout and escalating. Default: 30 for tools/events, 20 for workflows."
      ),
    },
    async ({ tool: toolArg, workflowId, eventType, fixAppliedAt, timeoutMinutes }: any) => {
      const result = await watchRecovery(workspaceId, {
        tool:          toolArg,
        workflowId,
        eventType,
        fixAppliedAt:  fixAppliedAt ?? new Date().toISOString(),
        timeoutMinutes,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GTM OBSERVABILITY TOOLS  — powered by OutreachLead + OutreachMetric
  // ═══════════════════════════════════════════════════════════════════════════

  // ── get_outreach_overview ─────────────────────────────────────────────────
  server.tool(
    "get_outreach_overview",
    "High-level health snapshot of all active outreach sequences across all connected tools. " +
    "Returns per-sequence stats: total leads, sends, replies, meetings, and reply/meeting rates. " +
    "Use this to identify which sequences are performing, which are stalling, and which tool " +
    "is driving the most activity. Start here before drilling into specific sequences.",
    {},
    async () => {
      const data = await getOutreachOverview(workspaceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── get_stuck_leads ───────────────────────────────────────────────────────
  server.tool(
    "get_stuck_leads",
    "Returns leads that entered an outreach sequence (email_sent, message_sent, connection_sent, etc.) " +
    "but have had NO activity for at least N days. Sorted by: no reply yet first, then most days silent. " +
    "A lead is 'stuck' if they received outreach but never replied, accepted, or progressed. " +
    "Use this to identify follow-up opportunities or broken sequences.",
    {
      days_silent: z.number().int().min(1).max(90).optional()
        .describe("Minimum days without any event to classify as stuck. Default: 5."),
      sequence_id: z.string().optional()
        .describe("Filter to one specific sequence/campaign ID. Leave empty for all sequences."),
      limit: z.number().int().min(1).max(200).optional()
        .describe("Max leads to return. Default: 50."),
    },
    async ({ days_silent, sequence_id, limit }: any) => {
      const data = await getStuckLeads(workspaceId, {
        daysSilent: days_silent,
        sequenceId: sequence_id,
        limit,
      });
      const summary = {
        count: data.length,
        neverReplied: data.filter(l => !l.hasReplied).length,
        leads: data,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  // ── get_sequence_funnel ───────────────────────────────────────────────────
  server.tool(
    "get_sequence_funnel",
    "Step-by-step conversion funnel for a specific outreach sequence. " +
    "Shows how many distinct leads reached each event stage (connection_sent → accepted → " +
    "reply_received → meeting_booked) with conversion rates from the entry stage and from " +
    "the previous stage. Use get_outreach_overview first to get sequence IDs.",
    {
      sequence_id: z.string()
        .describe("The sequence/campaign ID to analyze. Get IDs from get_outreach_overview."),
    },
    async ({ sequence_id }: any) => {
      const data = await getSequenceFunnel(workspaceId, sequence_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── get_lead_journey ──────────────────────────────────────────────────────
  server.tool(
    "get_lead_journey",
    "Full outreach history for a single lead: every event type, tool, sequence, step, " +
    "cumulative count, and timestamps. Identifies whether the lead replied, booked a meeting, " +
    "or is still silent. Use this to debug a specific prospect's journey or answer " +
    "'what happened to john@acme.com?'.",
    {
      email: z.string().optional()
        .describe("Lead's email address. Used to look up their hashed identity record."),
      lead_id: z.string().optional()
        .describe("IQPipe lead ID (orl_…) from get_stuck_leads or get_sequence_funnel."),
    },
    async ({ email, lead_id }: any) => {
      if (!email && !lead_id) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide email or lead_id." }) }] };
      }
      const data = await getLeadJourney(workspaceId, { email, leadId: lead_id });
      if (!data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Lead not found." }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── get_webhook_reliability ───────────────────────────────────────────────
  server.tool(
    "get_webhook_reliability",
    "Webhook delivery health report per connected tool. Shows how many events arrived, " +
    "how many were processed vs dropped (quota, ignored event types, missing identity, errors). " +
    "Use this to answer 'did HeyReach webhooks arrive last night?' or 'why are leads not appearing?' " +
    "Data is available for events received after this feature was enabled.",
    {
      tool: z.string().optional()
        .describe("Filter to a specific tool, e.g. 'HeyReach', 'Lemlist'. Leave empty for all tools."),
      hours: z.number().int().min(1).max(168).optional()
        .describe("Look-back window in hours. Default: 24. Max: 168 (7 days)."),
    },
    async ({ tool, hours }: any) => {
      const data = await getWebhookReliability(workspaceId, { tool, hours });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── get_outcome_attribution ───────────────────────────────────────────────
  server.tool(
    "get_outcome_attribution",
    "Attribution report: which outreach sequences and steps generated meetings and deals. " +
    "Shows meeting count, deal count, meeting rate per sequence, and the top-converting step. " +
    "Use this to answer 'which sequence drove the most demos?' or 'which LinkedIn campaign converts best?'",
    {},
    async () => {
      const data = await getOutcomeAttribution(workspaceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── check_lead_status ─────────────────────────────────────────────────────
  server.tool(
    "check_lead_status",
    "Before enrolling any lead in an outreach sequence, call this tool to check whether it is safe to contact them. " +
    "Accepts one email or a batch of up to 200 emails. Returns per-lead: safeToContact (bool), reason, " +
    "optedOut, activeSequence, lastContactedAt, hasReplied, hasMeeting, touchpointCount. " +
    "A lead is NOT safe to contact if: opted out, has a meeting booked, contacted within 3 days, " +
    "or currently enrolled in another active sequence. " +
    "Always call this before passing emails to an n8n or Make.com enrollment node.",
    {
      emails: z.union([
        z.string().describe("Single email address."),
        z.array(z.string()).describe("Batch of email addresses (up to 200)."),
      ]).describe("Email address(es) to check."),
    },
    async ({ emails }: any) => {
      const emailList: string[] = Array.isArray(emails) ? emails : [emails];
      if (emailList.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide at least one email." }) }] };
      }
      if (emailList.length > 200) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Batch limit is 200 emails per call." }) }] };
      }
      const results = await checkLeadStatus(workspaceId, emailList);
      const safeCount    = results.filter(r => r.safeToContact).length;
      const blockedCount = results.length - safeCount;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            total:         results.length,
            safeToContact: safeCount,
            blocked:       blockedCount,
            leads:         results,
          }, null, 2),
        }],
      };
    }
  );

  // ── get_sequence_recommendation ───────────────────────────────────────────
  server.tool(
    "get_sequence_recommendation",
    "Given a lead's ICP profile, returns the outreach sequences most likely to convert them — " +
    "ranked by historical reply rate, meeting rate, and ICP signal match. " +
    "Use this before enrolling a lead to choose the best sequence rather than guessing. " +
    "Signals used for ranking: job title match against leads that converted, source tool match, " +
    "channel preference, and statistical performance. All signals are optional — omit what you don't know.",
    {
      title:       z.string().optional().describe("Lead's job title, e.g. 'VP of Sales', 'Head of Marketing'."),
      company:     z.string().optional().describe("Lead's company name (used for context, not matching)."),
      source_tool: z.string().optional().describe("Tool the lead was sourced from, e.g. 'apollo', 'clay', 'linkedin'. Used to find sequences where similar-source leads converted."),
      channel:     z.enum(["email", "linkedin", "phone", "any"]).optional().describe("Preferred outreach channel. Filters sequences to tools that operate on that channel."),
    },
    async ({ title, company, source_tool, channel }: any) => {
      const data = await getSequenceRecommendation(workspaceId, {
        title,
        company,
        sourceTool: source_tool,
        channel,
      });
      if (data.recommendations.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ message: "No sequence performance data yet. IQPipe needs to observe at least one completed sequence before it can make recommendations.", recommendations: [] }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── confirm_event_received ────────────────────────────────────────────────
  server.tool(
    "confirm_event_received",
    "After triggering an n8n or Make.com workflow that sends an outreach event (email sent, " +
    "LinkedIn message, connection request), call this to verify IQPipe actually received and " +
    "processed the webhook within the expected window. " +
    "Returns: arrived (bool), processed count, drop reason if dropped, and a plain-English verdict. " +
    "Use this to close the execution loop: if arrived=false after 5 minutes, the webhook is misconfigured " +
    "or the n8n/Make node did not execute. If dropped, the payload is missing identity fields.",
    {
      tool:          z.string().describe("The tool that should have sent the event, e.g. 'HeyReach', 'Lemlist', 'Instantly'."),
      since_minutes: z.number().int().min(1).max(120).optional().describe("How many minutes back to check. Default: 10."),
      event_type:    z.string().optional().describe("Optional event type to filter by, e.g. 'email_sent', 'connection_sent'. Leave empty to check any event from this tool."),
    },
    async ({ tool, since_minutes, event_type }: any) => {
      const data = await confirmEventReceived(workspaceId, {
        tool,
        sinceMinutes: since_minutes,
        eventType:    event_type,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── compare_workflows ─────────────────────────────────────────────────────
  server.tool(
    "compare_workflows",
    "Run the GTM Alpha Score engine across all (or selected) workflows and return a ranked comparison. " +
    "Each workflow receives an alphaScore (0–100) and grade (A–F) across four pillars: " +
    "Reliability (event success rate), Throughput (outcome ratio), Connectivity (app diversity), " +
    "and Business Criticality (event type importance). Also returns estimated revenue leakage per workflow " +
    "and branch structure with per-channel conversion rates. " +
    "Use this to answer: 'which workflow performs best?', 'where is revenue leaking?', " +
    "'which channel branch converts better?', 'should we pause this workflow?'",
    {
      workflow_ids: z.array(z.string()).optional()
        .describe("Specific workflow IDs to compare. Leave empty to compare ALL workflows."),
      period: z.enum(["7d", "30d", "90d", "all"]).optional()
        .describe("Look-back period for event metrics. Default: 30d."),
      platform: z.enum(["n8n", "make", "all"]).optional()
        .describe("Filter by platform. Default: all."),
      acv: z.number().optional()
        .describe("Average contract value in USD used to price leakage. Default: 5000."),
    },
    async ({ workflow_ids, period, platform, acv: acvParam }: any) => {
      const since    = periodStart(period ?? "30d");
      const acv      = Math.max(1, acvParam ?? 5000);

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }, select: { defaultCurrency: true },
      });
      const currency = workspace?.defaultCurrency ?? "USD";

      const allMetrics = await fetchAllWorkflowMetrics(workspaceId, {
        ids:      workflow_ids ?? [],
        platform: platform ?? "all",
        since,
      });

      if (allMetrics.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ workflows: [], winner: null, message: "No workflows found. Connect n8n or Make.com first." }) }] };
      }

      const scored   = scoreWorkflows(allMetrics, acv, currency);
      const enriched = await enrichWithBranches(workspaceId, scored);

      // Sort by alphaScore desc, ties broken by reliability
      const ranked = [...enriched].sort((a, b) =>
        b.alphaScore !== a.alphaScore
          ? b.alphaScore - a.alphaScore
          : b.pillars.reliability - a.pillars.reliability,
      );

      const winner = ranked[0];

      // Pillar bests
      const bestBy = (pillar: keyof typeof winner.pillars) =>
        enriched.reduce((best, w) => w.pillars[pillar] > best.pillars[pillar] ? w : best);

      // Per-workflow action hints for agent consumption
      const workflowSummaries = ranked.map((w, rank) => ({
        rank:        rank + 1,
        id:          w.id,
        name:        w.name,
        platform:    w.platform,
        active:      w.active,
        alphaScore:  w.alphaScore,
        grade:       w.grade,
        pillars:     w.pillars,
        leakage: {
          totalLoss: w.leakage.totalLoss,
          currency:  w.leakage.currency,
          topLeaks:  w.leakage.breakdown.slice(0, 3),
        },
        branches:    w.branches,
        nodeCount:   w.nodeCount,
        appsUsed:    w.appsUsed,
        triggerType: w.triggerType,
        lastEventAt: w.lastEventAt,
        // Agent-readable signal
        healthSignal: w.alphaScore >= 85 ? "performing" :
                      w.alphaScore >= 70 ? "acceptable" :
                      w.alphaScore >= 55 ? "needs_attention" : "critical",
        leakageSignal: w.leakage.totalLoss > 10000 ? "high" :
                       w.leakage.totalLoss > 2000  ? "medium" : "low",
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            period:    period ?? "30d",
            acv,
            currency,
            total:     enriched.length,
            winner: winner ? {
              id:         winner.id,
              name:       winner.name,
              platform:   winner.platform,
              alphaScore: winner.alphaScore,
              grade:      winner.grade,
            } : null,
            pillar_leaders: {
              best_reliability:  bestBy("reliability").name,
              best_throughput:   bestBy("throughput").name,
              best_connectivity: bestBy("connectivity").name,
              best_criticality:  bestBy("criticality").name,
            },
            workflows: workflowSummaries,
          }, null, 2),
        }],
      };
    }
  );

  // ── get_improvement_report ────────────────────────────────────────────────
  server.tool(
    "get_improvement_report",
    "Synthesizes all IQPipe observability data into a structured list of issues and actionable " +
    "improvement suggestions. This is the primary output to pass back to n8n or Make.com for workflow " +
    "improvement. Combines: webhook reliability gaps, stuck leads, funnel drop-offs, branch channel " +
    "gaps, leakage hotspots, and sequence performance. " +
    "Use this to answer: 'what should I fix in my GTM stack?', " +
    "'what changes should I make to my n8n workflow?', 'what is the highest-impact improvement?'",
    {
      workflow_id: z.string().optional()
        .describe("Focus report on a specific workflow ID. Leave empty for workspace-wide report."),
      sequence_id: z.string().optional()
        .describe("Focus funnel analysis on a specific sequence/campaign ID."),
      days: z.number().int().min(1).max(90).optional()
        .describe("Look-back window in days. Default: 30."),
    },
    async ({ workflow_id, sequence_id, days }: any) => {
      const lookback = days ?? 30;
      const since    = new Date(Date.now() - lookback * 86_400_000);
      const period   = `${lookback}d`;

      // Gather all data sources in parallel
      const [overview, stuckLeads, webhookHealth, outreachOverview, attribution] = await Promise.all([
        // Workflow health
        (async () => {
          const allMetrics = await fetchAllWorkflowMetrics(workspaceId, {
            ids: workflow_id ? [workflow_id] : [],
            platform: "all",
            since,
          });
          if (allMetrics.length === 0) return null;
          const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultCurrency: true } });
          const scored   = scoreWorkflows(allMetrics, 5000, workspace?.defaultCurrency ?? "USD");
          const enriched = await enrichWithBranches(workspaceId, scored);
          return enriched;
        })(),
        // Stuck leads
        getStuckLeads(workspaceId, { sequenceId: sequence_id, daysSilent: 5, limit: 20 }),
        // Webhook reliability
        getWebhookReliability(workspaceId, { hours: lookback * 24 }),
        // Sequence overview
        getOutreachOverview(workspaceId),
        // Attribution
        getOutcomeAttribution(workspaceId),
      ]);

      // Optionally fetch funnel for specific sequence
      const funnelData = sequence_id
        ? await getSequenceFunnel(workspaceId, sequence_id)
        : null;

      // ── Issue detection ──────────────────────────────────────────────────
      const issues: {
        severity:    "critical" | "warning" | "info";
        category:    string;
        title:       string;
        detail:      string;
        workflowId?: string;
        metric?:     Record<string, unknown>;
      }[] = [];

      // 1. Critical workflow failures
      if (overview) {
        for (const w of overview) {
          if (w.pillars.reliability < 70 && w.metrics.reliability.total > 0) {
            issues.push({
              severity:   "critical",
              category:   "workflow_reliability",
              title:      `${w.name} has low reliability (${w.pillars.reliability}%)`,
              detail:     `${w.metrics.reliability.failed} failed events out of ${w.metrics.reliability.total} in the last ${period}. Fix failing nodes or check for API auth errors.`,
              workflowId: w.id,
              metric:     { successRate: w.pillars.reliability, failedEvents: w.metrics.reliability.failed },
            });
          }
          if (w.leakage.totalLoss > 5000) {
            issues.push({
              severity:   w.leakage.totalLoss > 20000 ? "critical" : "warning",
              category:   "revenue_leakage",
              title:      `${w.name} leaking ~$${w.leakage.totalLoss.toLocaleString()}`,
              detail:     `Top leak: ${w.leakage.breakdown[0]?.eventType ?? "unknown"} (${w.leakage.breakdown[0]?.failedCount ?? 0} failed events). Fix these event failures to recover pipeline value.`,
              workflowId: w.id,
              metric:     { totalLoss: w.leakage.totalLoss, topLeaks: w.leakage.breakdown.slice(0, 2) },
            });
          }
          // Branch with zero conversion
          for (const b of w.branches) {
            if (b.leadsEntered > 20 && b.conversionRate === 0) {
              issues.push({
                severity:   "warning",
                category:   "branch_dead",
                title:      `Branch "${b.label}" in ${w.name} has 0% conversion (${b.channel})`,
                detail:     `${b.leadsEntered} leads entered this branch with no positive outcome. Check if the ${b.channel} sequence is active and messages are being sent.`,
                workflowId: w.id,
                metric:     { branch: b.label, channel: b.channel, leadsEntered: b.leadsEntered },
              });
            }
          }
        }
      }

      // 2. Webhook delivery issues
      for (const t of webhookHealth.tools) {
        if (t.processRate < 70 && t.total > 10) {
          issues.push({
            severity: t.processRate < 40 ? "critical" : "warning",
            category: "webhook_reliability",
            title:    `${t.tool} webhooks: only ${t.processRate}% processed`,
            detail:   `${t.droppedQuota} dropped (quota), ${t.droppedNoId} dropped (no identity), ${t.errors} errors out of ${t.total} total in last ${lookback}d. Check webhook secret and lead identity fields.`,
            metric:   { tool: t.tool, processRate: t.processRate, droppedNoId: t.droppedNoId, droppedQuota: t.droppedQuota },
          });
        }
      }

      // 3. Stuck leads
      const neverReplied = stuckLeads.filter(l => !l.hasReplied);
      if (neverReplied.length > 10) {
        issues.push({
          severity: "warning",
          category: "stuck_leads",
          title:    `${neverReplied.length} leads stuck with no reply (5+ days silent)`,
          detail:   `Top stuck: ${neverReplied.slice(0, 3).map(l => `${l.displayName} @ ${l.company ?? "unknown"} (${l.daysSilent}d silent)`).join(", ")}. Consider a follow-up step or sequence rotation.`,
          metric:   { stuckCount: neverReplied.length, sampleLeads: neverReplied.slice(0, 5).map(l => ({ name: l.displayName, company: l.company, daysSilent: l.daysSilent })) },
        });
      }

      // 4. Funnel drop-off (specific sequence)
      if (funnelData) {
        const biggestDrop = funnelData.steps
          .filter(s => s.conversionFromPrev !== null && s.conversionFromPrev! < 30)
          .sort((a, b) => (a.conversionFromPrev ?? 100) - (b.conversionFromPrev ?? 100))[0];
        if (biggestDrop) {
          issues.push({
            severity: biggestDrop.conversionFromPrev! < 10 ? "critical" : "warning",
            category: "funnel_bottleneck",
            title:    `Sequence ${sequence_id}: ${biggestDrop.conversionFromPrev}% conversion at ${biggestDrop.eventType}`,
            detail:   `Only ${biggestDrop.leadCount} of ${funnelData.entryLeads} leads reached ${biggestDrop.eventType}. This is your biggest funnel drop. Investigate messaging, timing, or targeting at this stage.`,
            metric:   { stage: biggestDrop.eventType, leadCount: biggestDrop.leadCount, entryLeads: funnelData.entryLeads, conversionFromPrev: biggestDrop.conversionFromPrev },
          });
        }
      }

      // 5. Low-performing sequences
      for (const seq of outreachOverview.sequences) {
        if (seq.totalLeads > 50 && seq.replyRate < 2) {
          issues.push({
            severity: "warning",
            category: "sequence_performance",
            title:    `Sequence ${seq.sequenceId} has ${seq.replyRate}% reply rate`,
            detail:   `${seq.totalLeads} leads contacted via ${seq.tool}, only ${seq.replies} replied. A/B test subject lines, improve personalization, or review send timing.`,
            metric:   { sequenceId: seq.sequenceId, tool: seq.tool, totalLeads: seq.totalLeads, replyRate: seq.replyRate },
          });
        }
      }

      // ── Improvement suggestions ──────────────────────────────────────────
      // Ranked by estimated impact — structured for agent → n8n/Make handoff
      const suggestions: {
        priority:  number;
        impact:    "high" | "medium" | "low";
        action:    string;
        reason:    string;
        n8n_hint?: string;
        make_hint?: string;
      }[] = [];

      // Critical workflow fixes
      const criticalWorkflows = issues.filter(i => i.category === "workflow_reliability" && i.severity === "critical");
      if (criticalWorkflows.length > 0) {
        suggestions.push({
          priority: 1,
          impact:   "high",
          action:   "Fix failing workflow nodes",
          reason:   `${criticalWorkflows.length} workflow(s) have <70% reliability. Failed events mean lost pipeline signals.`,
          n8n_hint: "Check 'Error' nodes in the n8n execution log. Add an Error Trigger node to catch and alert on failures. Re-authenticate any expired credentials.",
          make_hint: "Open scenario history and filter by 'Error'. Review failed module inputs. Re-authorize connections under Connections tab.",
        });
      }

      // Leakage recovery
      const leakageIssues = issues.filter(i => i.category === "revenue_leakage");
      if (leakageIssues.length > 0) {
        const topLoss = leakageIssues.reduce((sum, i) => sum + ((i.metric?.totalLoss as number) ?? 0), 0);
        suggestions.push({
          priority: 2,
          impact:   "high",
          action:   `Recover ~$${topLoss.toLocaleString()} in pipeline leakage`,
          reason:   `Failed events for high-value types (meeting_booked, deal_created) are losing estimated pipeline value.`,
          n8n_hint: "Add a Retry node after HTTP Request nodes that call your CRM or sequencer. Use IF node to branch on error and trigger a Slack alert.",
          make_hint: "Enable 'Incomplete execution' handling on router modules. Add error handlers on modules that write to your CRM.",
        });
      }

      // Webhook identity fix
      const noIdDrops = webhookHealth.tools.filter(t => t.droppedNoId > 20);
      if (noIdDrops.length > 0) {
        suggestions.push({
          priority: 3,
          impact:   "high",
          action:   `Fix missing identity fields in ${noIdDrops.map(t => t.tool).join(", ")} webhooks`,
          reason:   `${noIdDrops.reduce((s, t) => s + t.droppedNoId, 0)} events dropped because IQPipe could not identify the lead (no email, LinkedIn URL, or phone).`,
          n8n_hint: "In your IQPipe webhook node, ensure the 'email' or 'linkedin_url' field is mapped from the source payload. Use a Set node before the IQPipe HTTP Request to normalize field names.",
          make_hint: "In the HTTP module sending to IQPipe, check that the Body includes an 'email' key mapped from the trigger data. Use a Text Parser module to extract email from raw text if needed.",
        });
      }

      // Stuck leads follow-up
      if (neverReplied.length > 10) {
        suggestions.push({
          priority: 4,
          impact:   "medium",
          action:   `Add a follow-up step for ${neverReplied.length} silent leads`,
          reason:   `${neverReplied.length} leads received outreach but never replied and have been silent 5+ days. A timed follow-up can recover 10–20% of these.`,
          n8n_hint: "Add a Wait node (5 days) → IF node checking for reply_received event from IQPipe → conditional follow-up email via Lemlist/Instantly node.",
          make_hint: "Add a delay module (5 days) after the initial send, then use an IQPipe HTTP lookup to check if the lead replied before sending a follow-up via your sequencer.",
        });
      }

      // Dead branch fix
      const deadBranches = issues.filter(i => i.category === "branch_dead");
      if (deadBranches.length > 0) {
        suggestions.push({
          priority: 5,
          impact:   "medium",
          action:   `Investigate dead branch(es): ${deadBranches.map(i => i.title).join("; ")}`,
          reason:   "Branches with 0% conversion despite traffic indicate a configuration error or inactive sequence.",
          n8n_hint: "Check that the IF branch actually routes to an active node. Enable execution in n8n and inspect the branch path manually with a test lead.",
          make_hint: "In Make, run the scenario with a test webhook and trace which route the Router takes. Verify the downstream modules are active and not in 'paused' state.",
        });
      }

      // Sort issues by severity
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            generatedAt:  new Date().toISOString(),
            period:       `${lookback}d`,
            workflowId:   workflow_id ?? null,
            sequenceId:   sequence_id ?? null,
            summary: {
              issueCount:       issues.length,
              criticalIssues:   issues.filter(i => i.severity === "critical").length,
              warningIssues:    issues.filter(i => i.severity === "warning").length,
              stuckLeadCount:   neverReplied.length,
              totalWorkflows:   overview?.length ?? 0,
            },
            issues,
            suggestions: suggestions.sort((a, b) => a.priority - b.priority),
          }, null, 2),
        }],
      };
    }
  );

  // ── generate_tracking_node ────────────────────────────────────────────────
  //
  // Returns ready-to-paste n8n node JSON + Make.com HTTP module config so
  // Claude can instrument any automation step with IQPipe tracking without
  // the user touching raw HTTP configuration.
  //
  // Field map: for each GTM tool, which output field holds the lead identity
  // (email, linkedin_url, phone). Claude uses this to wire the correct
  // expression into the IQPipe payload without asking the user.

  // Field map: 100 GTM tools → exact n8n/Make.com field expressions derived from
  // each tool's documented webhook payload shape. Used by generate_tracking_node
  // to pre-wire the correct identity fields without asking the user.
  const TOOL_FIELD_MAP: Record<string, {
    emailExpr:    string;   // n8n expression to pull email from previous node
    linkedinExpr: string;
    nameExpr:     string;
    companyExpr:  string;
    makeEmail:    string;   // Make.com field path notation
    makeLinkedin: string;
  }> = {
    // ── Email sequencers ─────────────────────────────────────────────────────
    apollo:          { emailExpr: "{{ $json.email }}",                           linkedinExpr: "{{ $json.linkedin_url }}",              nameExpr: "{{ $json.name }}",                                          companyExpr: "{{ $json.organization_name }}",        makeEmail: "{{email}}",                    makeLinkedin: "{{linkedin_url}}" },
    lemlist:         { emailExpr: "{{ $json.leadInfo.email }}",                  linkedinExpr: "{{ $json.leadInfo.linkedinUrl }}",       nameExpr: "{{ $json.leadInfo.firstName }} {{ $json.leadInfo.lastName }}", companyExpr: "{{ $json.leadInfo.companyName }}",   makeEmail: "{{leadInfo.email}}",           makeLinkedin: "{{leadInfo.linkedinUrl}}" },
    instantly:       { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedin_url }}",          nameExpr: "{{ $json.lead.first_name }} {{ $json.lead.last_name }}",    companyExpr: "{{ $json.lead.company_name }}",        makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedin_url}}" },
    smartlead:       { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedin_url }}",          nameExpr: "{{ $json.lead.first_name }} {{ $json.lead.last_name }}",    companyExpr: "{{ $json.lead.company_name }}",        makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedin_url}}" },
    replyio:         { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "",                                      nameExpr: "{{ $json.contact.firstName }} {{ $json.contact.lastName }}", companyExpr: "{{ $json.contact.company }}",         makeEmail: "{{contact.email}}",            makeLinkedin: "" },
    klenty:          { emailExpr: "{{ $json.ProspectEmail }}",                   linkedinExpr: "",                                      nameExpr: "{{ $json.ProspectFirstName }} {{ $json.ProspectLastName }}", companyExpr: "{{ $json.ProspectCompany }}",         makeEmail: "{{ProspectEmail}}",            makeLinkedin: "" },
    outreach:        { emailExpr: "{{ $json.data.attributes.emails[0] }}",       linkedinExpr: "",                                      nameExpr: "{{ $json.data.attributes.firstName }} {{ $json.data.attributes.lastName }}", companyExpr: "{{ $json.data.attributes.accountName }}", makeEmail: "{{data.attributes.emails[]}}", makeLinkedin: "" },
    salesloft:       { emailExpr: "{{ $json.data.person.email_address }}",       linkedinExpr: "",                                      nameExpr: "{{ $json.data.person.first_name }} {{ $json.data.person.last_name }}", companyExpr: "{{ $json.data.cadence.name }}",    makeEmail: "{{data.person.email_address}}", makeLinkedin: "" },
    mailshake:       { emailExpr: "{{ $json.data.recipient.emailAddress }}",     linkedinExpr: "",                                      nameExpr: "{{ $json.data.recipient.fullName }}",                       companyExpr: "{{ $json.data.campaign.title }}",      makeEmail: "{{data.recipient.emailAddress}}", makeLinkedin: "" },
    woodpecker:      { emailExpr: "{{ $json.email }}",                           linkedinExpr: "{{ $json.linkedinprofileurl }}",         nameExpr: "{{ $json.firstName }} {{ $json.lastName }}",                companyExpr: "{{ $json.company }}",                 makeEmail: "{{email}}",                    makeLinkedin: "{{linkedinprofileurl}}" },
    saleshandy:      { emailExpr: "{{ $json.prospect.email }}",                  linkedinExpr: "",                                      nameExpr: "{{ $json.prospect.first_name }} {{ $json.prospect.last_name }}", companyExpr: "{{ $json.prospect.company }}",     makeEmail: "{{prospect.email}}",           makeLinkedin: "" },
    overloop:        { emailExpr: "{{ $json.prospect.email }}",                  linkedinExpr: "{{ $json.prospect.linkedin_url }}",      nameExpr: "{{ $json.prospect.first_name }} {{ $json.prospect.last_name }}", companyExpr: "{{ $json.prospect.company }}",    makeEmail: "{{prospect.email}}",           makeLinkedin: "{{prospect.linkedin_url}}" },
    quickmail:       { emailExpr: "{{ $json.prospect.email }}",                  linkedinExpr: "",                                      nameExpr: "{{ $json.prospect.first_name }} {{ $json.prospect.last_name }}", companyExpr: "{{ $json.prospect.company }}",     makeEmail: "{{prospect.email}}",           makeLinkedin: "" },
    outplayhq:       { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedin_url }}",       nameExpr: "{{ $json.contact.firstName }} {{ $json.contact.lastName }}", companyExpr: "{{ $json.contact.company }}",        makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedin_url}}" },
    hunter:          { emailExpr: "{{ $json.data.lead.email }}",                 linkedinExpr: "",                                      nameExpr: "{{ $json.data.lead.first_name }} {{ $json.data.lead.last_name }}", companyExpr: "{{ $json.data.lead.company }}",   makeEmail: "{{data.lead.email}}",          makeLinkedin: "" },
    snovio:          { emailExpr: "{{ $json.data.prospect.email }}",             linkedinExpr: "",                                      nameExpr: "{{ $json.data.prospect.firstName }} {{ $json.data.prospect.lastName }}", companyExpr: "{{ $json.data.prospect.company }}", makeEmail: "{{data.prospect.email}}",   makeLinkedin: "" },
    yesware:         { emailExpr: "{{ $json.recipient.email }}",                 linkedinExpr: "",                                      nameExpr: "{{ $json.recipient.name }}",                                companyExpr: "",                                     makeEmail: "{{recipient.email}}",          makeLinkedin: "" },
    mixmax:          { emailExpr: "{{ $json.recipient.address }}",               linkedinExpr: "",                                      nameExpr: "{{ $json.recipient.name }}",                                companyExpr: "",                                     makeEmail: "{{recipient.address}}",        makeLinkedin: "" },
    growbots:        { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedin_url }}",       nameExpr: "{{ $json.contact.first_name }} {{ $json.contact.last_name }}", companyExpr: "{{ $json.contact.company }}",        makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedin_url}}" },

    // ── LinkedIn automation ───────────────────────────────────────────────────
    heyreach:        { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedInUrl }}",           nameExpr: "{{ $json.lead.firstName }} {{ $json.lead.lastName }}",      companyExpr: "{{ $json.lead.companyName }}",         makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedInUrl}}" },
    expandi:         { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedInUrl }}",           nameExpr: "{{ $json.lead.firstName }} {{ $json.lead.lastName }}",      companyExpr: "{{ $json.lead.company }}",             makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedInUrl}}" },
    dripify:         { emailExpr: "{{ $json.prospect.email }}",                  linkedinExpr: "{{ $json.prospect.linkedInUrl }}",       nameExpr: "{{ $json.prospect.firstName }} {{ $json.prospect.lastName }}", companyExpr: "{{ $json.prospect.companyName }}",  makeEmail: "{{prospect.email}}",           makeLinkedin: "{{prospect.linkedInUrl}}" },
    waalaxy:         { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedinUrl }}",        nameExpr: "{{ $json.contact.firstName }} {{ $json.contact.lastName }}", companyExpr: "{{ $json.contact.company }}",         makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedinUrl}}" },
    meetalfred:      { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedin_url }}",          nameExpr: "{{ $json.lead.first_name }} {{ $json.lead.last_name }}",    companyExpr: "{{ $json.lead.company }}",             makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedin_url}}" },
    linkedhelper:    { emailExpr: "{{ $json.data[0].email }}",                   linkedinExpr: "{{ $json.data[0].linkedinUrl }}",        nameExpr: "{{ $json.data[0].firstName }} {{ $json.data[0].lastName }}", companyExpr: "{{ $json.data[0].company }}",         makeEmail: "{{data[].email}}",             makeLinkedin: "{{data[].linkedinUrl}}" },
    zopto:           { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "{{ $json.lead.linkedinUrl }}",           nameExpr: "{{ $json.lead.firstName }} {{ $json.lead.lastName }}",      companyExpr: "{{ $json.lead.company }}",             makeEmail: "{{lead.email}}",               makeLinkedin: "{{lead.linkedinUrl}}" },
    weconnect:       { emailExpr: "{{ $json.prospect.email }}",                  linkedinExpr: "{{ $json.prospect.linkedinUrl }}",       nameExpr: "{{ $json.prospect.firstName }} {{ $json.prospect.lastName }}", companyExpr: "{{ $json.prospect.company }}",      makeEmail: "{{prospect.email}}",           makeLinkedin: "{{prospect.linkedinUrl}}" },
    phantombuster:   { emailExpr: "{{ $json.data[0].email }}",                   linkedinExpr: "{{ $json.data[0].linkedInUrl }}",        nameExpr: "{{ $json.data[0].firstName }} {{ $json.data[0].lastName }}", companyExpr: "{{ $json.data[0].company }}",         makeEmail: "{{data[].email}}",             makeLinkedin: "{{data[].linkedInUrl}}" },

    // ── Data enrichment ───────────────────────────────────────────────────────
    clay:            { emailExpr: "{{ $json.email }}",                           linkedinExpr: "{{ $json.linkedin_url }}",               nameExpr: "{{ $json.full_name }}",                                     companyExpr: "{{ $json.company_name }}",             makeEmail: "{{email}}",                    makeLinkedin: "{{linkedin_url}}" },
    clearbit:        { emailExpr: "{{ $json.person.email }}",                    linkedinExpr: "{{ $json.person.linkedin.handle }}",     nameExpr: "{{ $json.person.name.fullName }}",                          companyExpr: "{{ $json.company.name }}",             makeEmail: "{{person.email}}",             makeLinkedin: "{{person.linkedin.handle}}" },
    zoominfo:        { emailExpr: "{{ $json.data.contact.email }}",              linkedinExpr: "{{ $json.data.contact.linkedInUrl }}",   nameExpr: "{{ $json.data.contact.firstName }} {{ $json.data.contact.lastName }}", companyExpr: "{{ $json.data.contact.companyName }}", makeEmail: "{{data.contact.email}}", makeLinkedin: "{{data.contact.linkedInUrl}}" },
    lusha:           { emailExpr: "{{ $json.data.contact.email }}",              linkedinExpr: "{{ $json.data.contact.linkedinUrl }}",   nameExpr: "{{ $json.data.contact.firstName }} {{ $json.data.contact.lastName }}", companyExpr: "{{ $json.data.contact.companyName }}", makeEmail: "{{data.contact.email}}", makeLinkedin: "{{data.contact.linkedinUrl}}" },
    cognism:         { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedInUrl }}",        nameExpr: "{{ $json.contact.firstName }} {{ $json.contact.lastName }}", companyExpr: "{{ $json.contact.companyName }}",     makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedInUrl}}" },
    pdl:             { emailExpr: "{{ $json.data.person.work_email }}",          linkedinExpr: "{{ $json.data.person.linkedin_url }}",   nameExpr: "{{ $json.data.person.first_name }} {{ $json.data.person.last_name }}", companyExpr: "{{ $json.data.person.job_company_name }}", makeEmail: "{{data.person.work_email}}", makeLinkedin: "{{data.person.linkedin_url}}" },
    rocketreach:     { emailExpr: "{{ $json.data.lookup.emails[0].email }}",     linkedinExpr: "{{ $json.data.lookup.linkedin_url }}",   nameExpr: "{{ $json.data.lookup.name }}",                              companyExpr: "{{ $json.data.lookup.current_employer }}", makeEmail: "{{data.lookup.emails[].email}}", makeLinkedin: "{{data.lookup.linkedin_url}}" },
    kaspr:           { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "{{ $json.data.linkedin_url }}",          nameExpr: "{{ $json.data.first_name }} {{ $json.data.last_name }}",    companyExpr: "{{ $json.data.company }}",             makeEmail: "{{data.email}}",               makeLinkedin: "{{data.linkedin_url}}" },
    datagma:         { emailExpr: "{{ $json.email }}",                           linkedinExpr: "{{ $json.linkedin_url }}",               nameExpr: "{{ $json.first_name }} {{ $json.last_name }}",              companyExpr: "{{ $json.company }}",                  makeEmail: "{{email}}",                    makeLinkedin: "{{linkedin_url}}" },
    dropcontact:     { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "{{ $json.data.linkedin }}",              nameExpr: "{{ $json.data.first_name }} {{ $json.data.last_name }}",    companyExpr: "{{ $json.data.company }}",             makeEmail: "{{data.email}}",               makeLinkedin: "{{data.linkedin}}" },
    icypeas:         { emailExpr: "{{ $json.data.emails[0] }}",                  linkedinExpr: "{{ $json.data.linkedin_url }}",          nameExpr: "{{ $json.data.firstname }} {{ $json.data.lastname }}",      companyExpr: "{{ $json.data.company }}",             makeEmail: "{{data.emails[]}}",            makeLinkedin: "{{data.linkedin_url}}" },
    leadiq:          { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedInUrl }}",        nameExpr: "{{ $json.contact.name }}",                                  companyExpr: "{{ $json.contact.company }}",          makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedInUrl}}" },
    uplead:          { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "{{ $json.data.linkedin_url }}",          nameExpr: "{{ $json.data.first_name }} {{ $json.data.last_name }}",    companyExpr: "{{ $json.data.company_name }}",        makeEmail: "{{data.email}}",               makeLinkedin: "{{data.linkedin_url}}" },
    seamless:        { emailExpr: "{{ $json.result.email }}",                    linkedinExpr: "{{ $json.result.linkedin_url }}",        nameExpr: "{{ $json.result.first_name }} {{ $json.result.last_name }}", companyExpr: "{{ $json.result.company }}",          makeEmail: "{{result.email}}",             makeLinkedin: "{{result.linkedin_url}}" },

    // ── CRM ───────────────────────────────────────────────────────────────────
    hubspot:         { emailExpr: "{{ $json.properties.email }}",                linkedinExpr: "{{ $json.properties.hs_linkedinid }}",   nameExpr: "{{ $json.properties.firstname }} {{ $json.properties.lastname }}", companyExpr: "{{ $json.properties.company }}", makeEmail: "{{properties.email}}",       makeLinkedin: "{{properties.hs_linkedinid}}" },
    pipedrive:       { emailExpr: "{{ $json.data.person_id.email[0].value }}",   linkedinExpr: "",                                      nameExpr: "{{ $json.data.person_id.name }}",                           companyExpr: "{{ $json.data.org_id.name }}",         makeEmail: "{{data.person_id.email[].value}}", makeLinkedin: "" },
    salesforce:      { emailExpr: "{{ $json.Email }}",                           linkedinExpr: "",                                      nameExpr: "{{ $json.FirstName }} {{ $json.LastName }}",                companyExpr: "{{ $json.Company }}",                  makeEmail: "{{Email}}",                    makeLinkedin: "" },
    attio:           { emailExpr: "{{ $json.data.record.fields.email_addresses[0].email_address }}", linkedinExpr: "{{ $json.data.record.fields.linkedin_url }}", nameExpr: "{{ $json.data.record.fields.name.first_name }} {{ $json.data.record.fields.name.last_name }}", companyExpr: "{{ $json.data.record.fields.company_name }}", makeEmail: "{{data.record.fields.email_addresses[].email_address}}", makeLinkedin: "{{data.record.fields.linkedin_url}}" },
    close:           { emailExpr: "{{ $json.data.emails[0].email }}",            linkedinExpr: "",                                      nameExpr: "{{ $json.data.first_name }} {{ $json.data.last_name }}",    companyExpr: "{{ $json.data.company_name }}",        makeEmail: "{{data.emails[].email}}",      makeLinkedin: "" },
    copper:          { emailExpr: "{{ $json.data.primary_email }}",              linkedinExpr: "",                                      nameExpr: "{{ $json.data.name }}",                                     companyExpr: "{{ $json.data.company_name }}",        makeEmail: "{{data.primary_email}}",       makeLinkedin: "" },
    zoho:            { emailExpr: "{{ $json.data[0].Email }}",                   linkedinExpr: "",                                      nameExpr: "{{ $json.data[0].First_Name }} {{ $json.data[0].Last_Name }}", companyExpr: "{{ $json.data[0].Account_Name }}",  makeEmail: "{{data[].Email}}",             makeLinkedin: "" },
    freshsales:      { emailExpr: "{{ $json.data.contact.email }}",              linkedinExpr: "{{ $json.data.contact.linkedin_url }}", nameExpr: "{{ $json.data.contact.first_name }} {{ $json.data.contact.last_name }}", companyExpr: "{{ $json.data.contact.company }}", makeEmail: "{{data.contact.email}}", makeLinkedin: "{{data.contact.linkedin_url}}" },
    groove:          { emailExpr: "{{ $json.customer.email }}",                  linkedinExpr: "",                                      nameExpr: "{{ $json.customer.first_name }} {{ $json.customer.last_name }}", companyExpr: "{{ $json.customer.company_name }}", makeEmail: "{{customer.email}}",          makeLinkedin: "" },
    airtable:        { emailExpr: "{{ $json.fields.Email }}",                    linkedinExpr: "{{ $json.fields.LinkedIn }}",            nameExpr: "{{ $json.fields.Name }}",                                   companyExpr: "{{ $json.fields.Company }}",           makeEmail: "{{fields.Email}}",             makeLinkedin: "{{fields.LinkedIn}}" },
    monday:          { emailExpr: "{{ $json.event.columnValues.email.email }}",  linkedinExpr: "",                                      nameExpr: "{{ $json.event.pulseName }}",                               companyExpr: "{{ $json.event.boardName }}",          makeEmail: "{{event.columnValues.email.email}}", makeLinkedin: "" },

    // ── Email marketing ───────────────────────────────────────────────────────
    activecampaign:  { emailExpr: "{{ $json['contact[email]'] }}",               linkedinExpr: "",                                      nameExpr: "{{ $json['contact[first_name]'] }} {{ $json['contact[last_name]'] }}", companyExpr: "{{ $json['contact[orgname]'] }}", makeEmail: "{{contact[email]}}",          makeLinkedin: "" },
    klaviyo:         { emailExpr: "{{ $json.data.attributes.email }}",           linkedinExpr: "",                                      nameExpr: "{{ $json.data.attributes.first_name }} {{ $json.data.attributes.last_name }}", companyExpr: "{{ $json.data.attributes.organization }}", makeEmail: "{{data.attributes.email}}", makeLinkedin: "" },
    mailchimp:       { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "",                                      nameExpr: "{{ $json.data.merges.FNAME }} {{ $json.data.merges.LNAME }}", companyExpr: "{{ $json.data.merges.COMPANY }}",     makeEmail: "{{data.email}}",               makeLinkedin: "" },
    customerio:      { emailExpr: "{{ $json.data.identifiers.email }}",          linkedinExpr: "",                                      nameExpr: "{{ $json.data.custom_properties.first_name }} {{ $json.data.custom_properties.last_name }}", companyExpr: "{{ $json.data.custom_properties.company }}", makeEmail: "{{data.identifiers.email}}", makeLinkedin: "" },
    brevo:           { emailExpr: "{{ $json.email }}",                           linkedinExpr: "",                                      nameExpr: "{{ $json.contact.first_name }} {{ $json.contact.last_name }}", companyExpr: "{{ $json.contact.company }}",         makeEmail: "{{email}}",                    makeLinkedin: "" },
    drip:            { emailExpr: "{{ $json.subscriber.email }}",                linkedinExpr: "",                                      nameExpr: "{{ $json.subscriber.first_name }} {{ $json.subscriber.last_name }}", companyExpr: "{{ $json.subscriber.custom_fields.company }}", makeEmail: "{{subscriber.email}}", makeLinkedin: "" },
    convertkit:      { emailExpr: "{{ $json.subscriber.email_address }}",        linkedinExpr: "",                                      nameExpr: "{{ $json.subscriber.first_name }}",                         companyExpr: "{{ $json.subscriber.custom_fields.company }}", makeEmail: "{{subscriber.email_address}}", makeLinkedin: "" },

    // ── Calling ───────────────────────────────────────────────────────────────
    aircall:         { emailExpr: "{{ $json.data.contact.emails[0].value }}",    linkedinExpr: "",                                      nameExpr: "{{ $json.data.contact.first_name }} {{ $json.data.contact.last_name }}", companyExpr: "{{ $json.data.contact.company_name }}", makeEmail: "{{data.contact.emails[].value}}", makeLinkedin: "" },
    dialpad:         { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "",                                      nameExpr: "{{ $json.contact.name }}",                                  companyExpr: "{{ $json.contact.company }}",          makeEmail: "{{contact.email}}",            makeLinkedin: "" },
    kixie:           { emailExpr: "{{ $json.ContactEmail }}",                    linkedinExpr: "",                                      nameExpr: "{{ $json.ContactName }}",                                   companyExpr: "{{ $json.ContactCompany }}",           makeEmail: "{{ContactEmail}}",             makeLinkedin: "" },
    orum:            { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "",                                      nameExpr: "{{ $json.contact.first_name }} {{ $json.contact.last_name }}", companyExpr: "{{ $json.contact.company }}",         makeEmail: "{{contact.email}}",            makeLinkedin: "" },
    ringcentral:     { emailExpr: "{{ $json.body.creator.email }}",              linkedinExpr: "",                                      nameExpr: "{{ $json.body.creator.firstName }} {{ $json.body.creator.lastName }}", companyExpr: "",                              makeEmail: "{{body.creator.email}}",       makeLinkedin: "" },
    justcall:        { emailExpr: "{{ $json.data.contact_email }}",              linkedinExpr: "",                                      nameExpr: "{{ $json.data.contact_name }}",                             companyExpr: "{{ $json.data.customer_company }}",    makeEmail: "{{data.contact_email}}",       makeLinkedin: "" },
    gong:            { emailExpr: "{{ $json.callData.parties[0].emailAddress }}", linkedinExpr: "",                                     nameExpr: "{{ $json.callData.parties[0].name }}",                      companyExpr: "{{ $json.callData.parties[0].affiliation }}", makeEmail: "{{callData.parties[].emailAddress}}", makeLinkedin: "" },
    avoma:           { emailExpr: "{{ $json.data.attendees[0].email }}",         linkedinExpr: "",                                      nameExpr: "{{ $json.data.attendees[0].name }}",                        companyExpr: "{{ $json.data.company }}",             makeEmail: "{{data.attendees[].email}}",   makeLinkedin: "" },
    fireflies:       { emailExpr: "{{ $json.data.meeting.participants[0].email }}", linkedinExpr: "",                                   nameExpr: "{{ $json.data.meeting.participants[0].displayName }}",      companyExpr: "",                                     makeEmail: "{{data.meeting.participants[].email}}", makeLinkedin: "" },
    nooks:           { emailExpr: "{{ $json.contact.email }}",                   linkedinExpr: "{{ $json.contact.linkedin_url }}",       nameExpr: "{{ $json.contact.name }}",                                  companyExpr: "{{ $json.contact.company }}",          makeEmail: "{{contact.email}}",            makeLinkedin: "{{contact.linkedin_url}}" },

    // ── Messaging / SMS / WhatsApp ────────────────────────────────────────────
    twilio:          { emailExpr: "",                                             linkedinExpr: "",                                      nameExpr: "{{ $json.ProfileName }}",                                   companyExpr: "",                                     makeEmail: "",                             makeLinkedin: "" },
    sakari:          { emailExpr: "{{ $json.data.contact.email }}",              linkedinExpr: "",                                      nameExpr: "{{ $json.data.contact.firstName }} {{ $json.data.contact.lastName }}", companyExpr: "{{ $json.data.contact.company }}", makeEmail: "{{data.contact.email}}",      makeLinkedin: "" },
    wati:            { emailExpr: "",                                             linkedinExpr: "",                                      nameExpr: "{{ $json.contact.name }}",                                  companyExpr: "",                                     makeEmail: "",                             makeLinkedin: "" },
    messagebird:     { emailExpr: "{{ $json.message.contact.email }}",           linkedinExpr: "",                                      nameExpr: "{{ $json.message.contact.firstName }} {{ $json.message.contact.lastName }}", companyExpr: "",                   makeEmail: "{{message.contact.email}}",    makeLinkedin: "" },
    vonage:          { emailExpr: "",                                             linkedinExpr: "",                                      nameExpr: "{{ $json.from }}",                                          companyExpr: "",                                     makeEmail: "",                             makeLinkedin: "" },
    dialog360:       { emailExpr: "",                                             linkedinExpr: "",                                      nameExpr: "{{ $json.entry[0].changes[0].value.contacts[0].profile.name }}", companyExpr: "",                              makeEmail: "",                             makeLinkedin: "" },
    intercom:        { emailExpr: "{{ $json.data.item.email }}",                 linkedinExpr: "",                                      nameExpr: "{{ $json.data.item.name }}",                                companyExpr: "{{ $json.data.item.company.name }}",   makeEmail: "{{data.item.email}}",          makeLinkedin: "" },

    // ── Scheduling ────────────────────────────────────────────────────────────
    calendly:        { emailExpr: "{{ $json.payload.invitee.email }}",           linkedinExpr: "",                                      nameExpr: "{{ $json.payload.invitee.name }}",                          companyExpr: "",                                     makeEmail: "{{payload.invitee.email}}",    makeLinkedin: "" },
    chilipiper:      { emailExpr: "{{ $json.primaryGuest.email }}",              linkedinExpr: "",                                      nameExpr: "{{ $json.primaryGuest.firstName }} {{ $json.primaryGuest.lastName }}", companyExpr: "{{ $json.primaryGuest.company }}", makeEmail: "{{primaryGuest.email}}",     makeLinkedin: "" },
    calcom:          { emailExpr: "{{ $json.payload.attendees[0].email }}",      linkedinExpr: "",                                      nameExpr: "{{ $json.payload.attendees[0].name }}",                     companyExpr: "",                                     makeEmail: "{{payload.attendees[].email}}", makeLinkedin: "" },

    // ── Billing ───────────────────────────────────────────────────────────────
    stripe:          { emailExpr: "{{ $json.data.object.customer_details.email }}", linkedinExpr: "",                                   nameExpr: "{{ $json.data.object.customer_details.name }}",             companyExpr: "",                                     makeEmail: "{{data.object.customer_details.email}}", makeLinkedin: "" },
    chargebee:       { emailExpr: "{{ $json.content.customer.email }}",          linkedinExpr: "",                                      nameExpr: "{{ $json.content.customer.first_name }} {{ $json.content.customer.last_name }}", companyExpr: "{{ $json.content.customer.company }}", makeEmail: "{{content.customer.email}}", makeLinkedin: "" },
    recurly:         { emailExpr: "{{ $json.data.subscriber.email }}",           linkedinExpr: "",                                      nameExpr: "{{ $json.data.subscriber.firstName }} {{ $json.data.subscriber.lastName }}", companyExpr: "{{ $json.data.subscriber.company }}", makeEmail: "{{data.subscriber.email}}", makeLinkedin: "" },
    paddle:          { emailExpr: "{{ $json.data.customer.email }}",             linkedinExpr: "",                                      nameExpr: "{{ $json.data.customer.name }}",                            companyExpr: "",                                     makeEmail: "{{data.customer.email}}",      makeLinkedin: "" },

    // ── Sales / intent / chat ─────────────────────────────────────────────────
    drift:           { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "",                                      nameExpr: "{{ $json.data.attributes.name }}",                          companyExpr: "{{ $json.data.attributes.company }}",  makeEmail: "{{data.email}}",               makeLinkedin: "" },
    qualified:       { emailExpr: "{{ $json.visitor.email }}",                   linkedinExpr: "{{ $json.visitor.linkedinUrl }}",        nameExpr: "{{ $json.visitor.name }}",                                  companyExpr: "{{ $json.company.name }}",             makeEmail: "{{visitor.email}}",            makeLinkedin: "{{visitor.linkedinUrl}}" },
    warmly:          { emailExpr: "{{ $json.visitor.email }}",                   linkedinExpr: "{{ $json.visitor.linkedinUrl }}",        nameExpr: "{{ $json.visitor.name }}",                                  companyExpr: "{{ $json.company.name }}",             makeEmail: "{{visitor.email}}",            makeLinkedin: "{{visitor.linkedinUrl}}" },
    typeform:        { emailExpr: "{{ $json.form_response.hidden.email }}",       linkedinExpr: "",                                      nameExpr: "{{ $json.form_response.hidden.name }}",                     companyExpr: "{{ $json.form_response.hidden.company }}", makeEmail: "{{form_response.hidden.email}}", makeLinkedin: "" },
    webflow:         { emailExpr: "{{ $json.data.email }}",                      linkedinExpr: "",                                      nameExpr: "{{ $json.data.name }}",                                     companyExpr: "{{ $json.data.company }}",             makeEmail: "{{data.email}}",               makeLinkedin: "" },

    // ── Support / CS ──────────────────────────────────────────────────────────
    zendesk:         { emailExpr: "{{ $json.detail.email }}",                    linkedinExpr: "",                                      nameExpr: "{{ $json.detail.name }}",                                   companyExpr: "",                                     makeEmail: "{{detail.email}}",             makeLinkedin: "" },
    freshdesk:       { emailExpr: "{{ $json.data.requester.email }}",            linkedinExpr: "",                                      nameExpr: "{{ $json.data.requester.name }}",                           companyExpr: "",                                     makeEmail: "{{data.requester.email}}",     makeLinkedin: "" },

    // ── Analytics / data ──────────────────────────────────────────────────────
    segment:         { emailExpr: "{{ $json.traits.email }}",                    linkedinExpr: "",                                      nameExpr: "{{ $json.traits.name }}",                                   companyExpr: "{{ $json.traits.company.name }}",      makeEmail: "{{traits.email}}",             makeLinkedin: "" },
    marketo:         { emailExpr: "{{ $json.lead.email }}",                      linkedinExpr: "",                                      nameExpr: "{{ $json.lead.firstName }} {{ $json.lead.lastName }}",      companyExpr: "{{ $json.lead.company }}",             makeEmail: "{{lead.email}}",               makeLinkedin: "" },

    // ── Intent / signals ──────────────────────────────────────────────────────
    g2:              { emailExpr: "{{ $json.buyer.email }}",                     linkedinExpr: "",                                      nameExpr: "{{ $json.buyer.name }}",                                    companyExpr: "{{ $json.buyer.company }}",            makeEmail: "{{buyer.email}}",              makeLinkedin: "" },
    linkedin:        { emailExpr: "{{ $json.leadGenFormResponse.email }}",       linkedinExpr: "{{ $json.leadGenFormResponse.profileUrl }}", nameExpr: "{{ $json.leadGenFormResponse.firstName }} {{ $json.leadGenFormResponse.lastName }}", companyExpr: "{{ $json.leadGenFormResponse.company }}", makeEmail: "{{leadGenFormResponse.email}}", makeLinkedin: "{{leadGenFormResponse.profileUrl}}" },
  };

  server.tool(
    "generate_tracking_node",
    "Generates a ready-to-paste n8n HTTP Request node (JSON) and Make.com HTTP module config " +
    "that sends an IQPipe tracking event after any workflow step. " +
    "Use this whenever a user wants to add IQPipe tracking to an n8n or Make.com workflow — " +
    "especially when they don't have an n8n API key and are instrumenting steps manually. " +
    "Always call this instead of writing raw HTTP node config by hand. " +
    "The output includes field expressions pre-mapped to the previous tool's output shape, " +
    "so the user only needs to paste the node — no manual field mapping required.",
    {
      tool:         z.string().describe("The GTM tool whose output this node comes after. E.g. 'clay', 'heyreach', 'apollo', 'hubspot', 'lemlist', 'instantly', 'phantombuster', 'pipedrive', 'salesforce'. Use 'generic' if unknown."),
      event_type:   z.string().describe("The canonical IQPipe event type to record. E.g. 'contact_enriched', 'connection_request_sent', 'connection_accepted', 'email_sent', 'reply_received', 'meeting_booked', 'deal_created', 'deal_won', 'contact_sourced', 'payment_received'."),
      platform:     z.enum(["n8n", "make", "both"]).default("both").describe("Which platform config to generate. Default: both."),
      node_name:    z.string().optional().describe("Optional display name for the node. Defaults to 'IQPipe — <event_type>'."),
    },
    async ({ tool, event_type, platform, node_name }: any) => {
      const workspace = await prisma.workspace.findUnique({
        where:  { id: workspaceId },
        select: { publicApiKey: true },
      });
      const apiKey = workspace?.publicApiKey ?? "rvn_pk_YOUR_KEY";

      const webhookUrl = `${baseUrl}/api/webhooks/generic?workspaceId=${workspaceId}&app=${tool}`;
      const displayName = node_name ?? `IQPipe — ${event_type}`;
      const fields = TOOL_FIELD_MAP[tool.toLowerCase()] ?? {
        emailExpr:    "{{ $json.email }}",
        linkedinExpr: "{{ $json.linkedin_url }}",
        nameExpr:     "{{ $json.name }}",
        companyExpr:  "{{ $json.company }}",
        makeEmail:    "{{email}}",
        makeLinkedin: "{{linkedin_url}}",
      };

      // ── n8n node JSON ──────────────────────────────────────────────────────
      const n8nNode = {
        name:       displayName,
        type:       "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position:   [0, 0],
        parameters: {
          method:          "POST",
          url:             webhookUrl,
          authentication:  "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders:     true,
          headerParameters: {
            parameters: [
              { name: "Authorization", value: `Bearer ${apiKey}` },
              { name: "Content-Type",  value: "application/json"  },
            ],
          },
          sendBody:    true,
          bodyContentType: "json",
          jsonBody: JSON.stringify({
            event_type,
            email:        fields.emailExpr,
            linkedin_url: fields.linkedinExpr || undefined,
            name:         fields.nameExpr,
            company:      fields.companyExpr,
          }, null, 2),
          options: {},
        },
        notes: `IQPipe tracking — records "${event_type}" from ${tool} into your workspace. Paste this node after your ${tool} node and connect the output.`,
      };

      // ── Make.com HTTP module config ────────────────────────────────────────
      const makeModule = {
        label:   displayName,
        module:  "http:ActionSendData",
        version: 3,
        parameters: {
          method:          "POST",
          url:             webhookUrl,
          serializeUrl:    false,
          headers: [
            { name: "Authorization", value: `Bearer ${apiKey}` },
            { name: "Content-Type",  value: "application/json"  },
          ],
          bodyType:    "raw",
          contentType: "application/json",
          body: JSON.stringify({
            event_type,
            email:        fields.makeEmail,
            linkedin_url: fields.makeLinkedin || undefined,
          }, null, 2),
        },
        note: `Paste this module after your ${tool} module. The field expressions auto-map from ${tool}'s output.`,
      };

      const result: Record<string, any> = {
        tool,
        event_type,
        workspace_id: workspaceId,
        webhook_url:  webhookUrl,
        instructions: {
          n8n:  "In n8n: press Ctrl+Shift+V (or Cmd+Shift+V on Mac) anywhere on the canvas to paste a node from clipboard. Or use the top menu Import → Paste from clipboard.",
          make: "In Make.com: click the '+' between two modules → choose 'HTTP' → 'Make a request' → switch to JSON view and paste the parameters object.",
        },
      };

      if (platform === "n8n" || platform === "both") result.n8n_node  = n8nNode;
      if (platform === "make" || platform === "both") result.make_module = makeModule;

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── get_revenue_attribution ────────────────────────────────────────────────
  server.tool(
    "get_revenue_attribution",
    "Returns revenue and pipeline attributed to each n8n / Make workflow over a given window. " +
    "Two models are returned: last_touch (100% credit to the final workflow before outcome) and " +
    "linear (value split equally across all workflows that touched the lead before the outcome). " +
    "Use this to identify which workflows generate the most pipeline and closed revenue, and to " +
    "decide where to invest automation effort.",
    {
      window_days: z.number().int().min(1).max(365).default(90).describe(
        "How many days back to look. Default 90. Use 30 for recent performance, 365 for annual view."
      ),
    },
    async ({ window_days }: { window_days?: number }) => {
      const result = await getRevenueAttribution(workspaceId, window_days ?? 90);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

// ─── Express route handler ────────────────────────────────────────────────────
// Each request is fully stateless: auth → create server → handle → done.

async function handleMcp(req: Request, res: Response): Promise<void> {
  // Auth
  const workspace = await resolveWorkspace(req);
  if (!workspace) {
    res.status(401).json({ error: "Invalid or missing API key. Pass Authorization: Bearer rvn_pk_..." });
    return;
  }

  const { id: workspaceId } = workspace;
  const baseUrl  = `${req.protocol}://${req.get("host")}`;
  const mcpServer = createServer(workspaceId, baseUrl);

  // The MCP SDK unconditionally requires "Accept: application/json, text/event-stream"
  // on every POST. Claude.ai may send only "application/json". Normalise the header
  // before passing the request to the transport so the SDK never rejects it with 406.
  const accept = req.headers["accept"] ?? "";
  if (!accept.includes("text/event-stream")) {
    req.headers["accept"] = accept
      ? `${accept}, text/event-stream`
      : "application/json, text/event-stream";
  }

  // enableJsonResponse: true — respond with plain JSON instead of SSE streams.
  // Required for serverless (Vercel) where long-lived SSE connections are not supported.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse:  true,
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp-server]", err);
    if (!res.headersSent) res.status(500).json({ error: "MCP server error" });
  }
}

// Only POST is needed for stateless JSON-RPC.
// Returning 405 for GET tells clients that SSE streams are not supported
// (serverless environment) and they should use POST-only stateless mode.
router.post("/", handleMcp);
router.get("/",  (_req, res) => res.status(405).set("Allow", "POST").json({ error: "Method Not Allowed. Use POST for MCP requests." }));
router.delete("/", (_req, res) => res.status(200).end());

export default router;
