/**
 * reportStudio.ts
 *
 * Report Studio — aggregate workspace performance data, generate AI insights,
 * and publish shareable public report snapshots.
 *
 * Routes:
 *   GET  /api/report-studio/data?workspaceId=&period=   — aggregate report data
 *   POST /api/report-studio/insights                    — AI-generated narrative
 *   POST /api/report-studio/share                       — publish snapshot, return token
 *   GET  /api/report-studio/public/:token               — public snapshot (no auth)
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { openai } from "../services/openaiClient";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PerFlowStat {
  id:          string;   // DB cuid (N8nWorkflowMeta.id or MakeScenarioMeta.id)
  nativeId:    string;   // n8nId / makeId
  name:        string;
  platform:    "n8n" | "make";
  active:      boolean;
  appsUsed:    string[]; // friendly names e.g. ["HubSpot","Clay"]
  appKeys:     string[]; // normalised keys e.g. ["hubspot","clay"]
  eventCount:  number;
  successCount: number;
  successRate: number;
  lastActivity: string | null;
}

export interface ReportData {
  period:    string;
  workspace: { name: string };
  workflows: {
    total: number; n8n: number; make: number;
    list: { name: string; platform: string; appsUsed: string[]; healthScore: number }[];
  };
  perFlow: PerFlowStat[];
  events: {
    total: number; successful: number; failed: number; successRate: number;
    byDay: { date: string; count: number }[];
  };
  correlations: {
    total: number; verified: number; mismatched: number; verifiedRate: number;
  };
  topApps:  { appKey: string; count: number }[];
  kpis: {
    contactsEngaged: number; dealsTracked: number;
    meetingsBooked:  number; emailsSent:   number; repliesReceived: number;
  };
  funnelSteps: { label: string; count: number }[];
  avgHealthScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson<T>(val: string, fallback: T): T {
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

// "HubSpot" → "hubspot", "Make.com" → "makecom" (no favicon, graceful)
function appNameToKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function periodToDate(period: string): Date | null {
  const map: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const days = map[period];
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildByDayBuckets(dates: Date[], days: number) {
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  dates.forEach(dt => {
    const key = new Date(dt).toISOString().slice(0, 10);
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

// ── GET /api/report-studio/data ───────────────────────────────────────────────

router.get("/data", async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const period      = (req.query.period as string) ?? "30d";

  if (!workspaceId) {
    return res.status(400).json({ error: "workspaceId required" }) as any;
  }

  const since = periodToDate(period);
  const dateFilter = since ? { gte: since } : undefined;

  // ── Workspace name ────────────────────────────────────────────────────────
  const workspace = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { name: true },
  });

  // ── Workflows ─────────────────────────────────────────────────────────────
  const [n8nWorkflows, makeScenarios] = await Promise.all([
    prisma.n8nWorkflowMeta.findMany({ where: { workspaceId } }),
    prisma.makeScenarioMeta.findMany({ where: { workspaceId } }),
  ]);

  // Neither model has a healthScore column — derive a simple proxy from active status
  const activeCount = n8nWorkflows.filter(w => w.active).length + makeScenarios.filter(s => s.active).length;
  const totalWf     = n8nWorkflows.length + makeScenarios.length;
  const avgHealthScore = totalWf > 0 ? Math.round((activeCount / totalWf) * 100) : 0;

  // ── Events (n8n queue) ────────────────────────────────────────────────────
  const eventsRaw = await prisma.n8nQueuedEvent.findMany({
    where:  { workspaceId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    select: { id: true, status: true, createdAt: true, contact: true, workflowId: true },
  });

  const successful = eventsRaw.filter(e => e.status === "done").length;
  const failed     = eventsRaw.filter(e => e.status === "failed").length;
  const byDay      = buildByDayBuckets(eventsRaw.map(e => e.createdAt), 14);

  // KPI: unique contact emails
  const contactEmails = new Set<string>();
  eventsRaw.forEach(e => {
    const c = e.contact as any;
    if (c?.email) contactEmails.add(c.email.toLowerCase());
  });

  // ── Per-flow event stats ──────────────────────────────────────────────────
  // Group n8n events by native workflowId → match to N8nWorkflowMeta.n8nId
  const flowEventMap: Record<string, { total: number; success: number; lastAt: Date | null }> = {};
  eventsRaw.forEach(e => {
    const key = e.workflowId;
    if (!flowEventMap[key]) flowEventMap[key] = { total: 0, success: 0, lastAt: null };
    flowEventMap[key].total++;
    if (e.status === "done") flowEventMap[key].success++;
    if (!flowEventMap[key].lastAt || e.createdAt > flowEventMap[key].lastAt!) {
      flowEventMap[key].lastAt = e.createdAt;
    }
  });

  // ── App events ────────────────────────────────────────────────────────────
  const appEvents = await prisma.appEvent.findMany({
    where:  { workspaceId, ...(dateFilter ? { receivedAt: dateFilter } : {}) },
    select: { appKey: true, eventKey: true },
  });

  // Top apps by event count
  const appCounts: Record<string, number> = {};
  appEvents.forEach(e => { appCounts[e.appKey] = (appCounts[e.appKey] ?? 0) + 1; });
  const topApps = Object.entries(appCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([appKey, count]) => ({ appKey, count }));

  // KPI: granular from event keys
  const CRM_APPS       = new Set(["hubspot", "salesforce", "pipedrive", "attio"]);
  const OUTREACH_APPS  = new Set(["instantly", "lemlist", "smartlead", "heyreach"]);
  const ENRICH_APPS    = new Set(["clay", "apollo", "zoominfo", "pdl"]);
  const REPLY_KEYS     = new Set(["reply_received", "replyReceived"]);
  const EMAIL_SENT     = new Set(["email_sent", "emailSent"]);

  const dealsTracked     = appEvents.filter(e => CRM_APPS.has(e.appKey)).length;
  const emailsSent       = appEvents.filter(e => OUTREACH_APPS.has(e.appKey) && EMAIL_SENT.has(e.eventKey)).length;
  const repliesReceived  = appEvents.filter(e => REPLY_KEYS.has(e.eventKey)).length;
  const meetingsBooked   = appEvents.filter(e =>
    e.appKey === "calendly" || e.eventKey === "meeting_booked" || e.eventKey === "invitee.created"
  ).length;

  // Funnel steps (inferred)
  const sourced   = eventsRaw.length;
  const enriched  = appEvents.filter(e => ENRICH_APPS.has(e.appKey)).length;
  const outreached = emailsSent;
  const replied   = repliesReceived;
  const booked    = meetingsBooked;
  const funnelSteps = [
    { label: "Sourced",    count: sourced    },
    { label: "Enriched",   count: enriched   },
    { label: "Outreached", count: outreached },
    { label: "Replied",    count: replied    },
    { label: "Booked",     count: booked     },
  ];

  // ── Correlations ──────────────────────────────────────────────────────────
  const correlations = await prisma.correlationResult.findMany({
    where:  { workspaceId, ...(dateFilter ? { matchedAt: dateFilter } : {}) },
    select: { verified: true, discrepancy: true },
  });

  const verifiedCount  = correlations.filter(c => c.verified).length;
  const mismatchedCount = correlations.filter(c => !c.verified && c.discrepancy).length;

  // ── Build perFlow stat list ───────────────────────────────────────────────
  const perFlow: PerFlowStat[] = [
    ...n8nWorkflows.map(w => {
      const stat = flowEventMap[w.n8nId] ?? { total: 0, success: 0, lastAt: null };
      const apps = safeParseJson<string[]>(w.appsUsed, []);
      return {
        id: w.id, nativeId: w.n8nId, name: w.name, platform: "n8n" as const,
        active: w.active, appsUsed: apps, appKeys: apps.map(appNameToKey),
        eventCount: stat.total, successCount: stat.success,
        successRate: stat.total > 0 ? Math.round(stat.success / stat.total * 100) : 0,
        lastActivity: stat.lastAt ? stat.lastAt.toISOString() : null,
      };
    }),
    ...makeScenarios.map(s => {
      const apps = safeParseJson<string[]>(s.appsUsed, []);
      return {
        id: s.id, nativeId: s.makeId, name: s.name, platform: "make" as const,
        active: s.active, appsUsed: apps, appKeys: apps.map(appNameToKey),
        // Make events not tracked via N8nQueuedEvent — show 0 until Make execution sync added
        eventCount: 0, successCount: 0, successRate: 0, lastActivity: null,
      };
    }),
  ].sort((a, b) => b.eventCount - a.eventCount);  // most active flows first

  const data: ReportData = {
    period,
    workspace: { name: workspace?.name ?? "My Workspace" },
    workflows: {
      total: n8nWorkflows.length + makeScenarios.length,
      n8n:   n8nWorkflows.length,
      make:  makeScenarios.length,
      list: [
        ...n8nWorkflows.map(w => ({
          name: w.name, platform: "n8n",
          appsUsed: safeParseJson<string[]>(w.appsUsed, []),
          healthScore: w.active ? 100 : 0,
        })),
        ...makeScenarios.map(s => ({
          name: s.name, platform: "make",
          appsUsed: safeParseJson<string[]>(s.appsUsed, []),
          healthScore: s.active ? 100 : 0,
        })),
      ],
    },
    perFlow,
    events: {
      total: eventsRaw.length,
      successful,
      failed,
      successRate: eventsRaw.length
        ? Math.round(successful / eventsRaw.length * 100)
        : 0,
      byDay,
    },
    correlations: {
      total:       correlations.length,
      verified:    verifiedCount,
      mismatched:  mismatchedCount,
      verifiedRate: correlations.length
        ? Math.round(verifiedCount / correlations.length * 100)
        : 0,
    },
    topApps,
    kpis: {
      contactsEngaged: contactEmails.size,
      dealsTracked,
      meetingsBooked,
      emailsSent,
      repliesReceived,
    },
    funnelSteps,
    avgHealthScore,
  };

  return res.json(data);
});

// ── POST /api/report-studio/insights ─────────────────────────────────────────

router.post("/insights", async (req: Request, res: Response) => {
  const { data, reportType } = req.body as { data: ReportData; reportType: string };

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ insight: buildDefaultInsight(data, reportType) });
  }

  const systemPrompt =
    "You write concise, punchy performance summaries for GTM engineers to share on LinkedIn. " +
    "Format: one strong opening sentence, then 3 bullet points with specific numbers. " +
    "Tone: confident, data-first, no fluff. Max 100 words total.";

  const userPrompt = buildAIPrompt(data, reportType);

  try {
    const completion = await openai.chat.completions.create({
      model:      "gpt-4o-mini",
      max_tokens: 140,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? buildDefaultInsight(data, reportType);
    return res.json({ insight: text });
  } catch {
    return res.json({ insight: buildDefaultInsight(data, reportType) });
  }
});

// ── POST /api/report-studio/share ─────────────────────────────────────────────

router.post("/share", async (req: Request, res: Response) => {
  const { workspaceId, reportType, cardFormat, period, insight, data } =
    req.body as {
      workspaceId: string; reportType: string; cardFormat: string;
      period: string; insight?: string; data: ReportData;
    };

  if (!workspaceId || !reportType || !data) {
    return res.status(400).json({ error: "workspaceId, reportType and data required" }) as any;
  }

  const report = await (prisma as any).publicReport.create({
    data: {
      workspaceId,
      reportType,
      cardFormat: cardFormat ?? "linkedin",
      period:     period    ?? "30d",
      insight:    insight   ?? null,
      data:       JSON.stringify(data),
    },
  });

  return res.json({ token: report.token });
});

// ── GET /api/report-studio/public/:token ─────────────────────────────────────
// No auth — accessible by anyone with the link.

router.get("/public/:token", async (req: Request, res: Response) => {
  const report = await (prisma as any).publicReport.findUnique({
    where: { token: req.params.token },
  });
  if (!report) {
    return res.status(404).json({ error: "Report not found or expired" }) as any;
  }
  return res.json({
    reportType: report.reportType,
    cardFormat: report.cardFormat,
    period:     report.period,
    insight:    report.insight,
    data:       JSON.parse(report.data) as ReportData,
    createdAt:  report.createdAt,
  });
});

// ── AI prompt builders ────────────────────────────────────────────────────────

function buildAIPrompt(d: ReportData, type: string): string {
  const typeLabel: Record<string, string> = {
    snapshot: "overall GTM performance snapshot",
    funnel:   "outbound campaign funnel performance",
    digest:   "weekly GTM digest",
    revenue:  "revenue signal and deal attribution",
  };
  return [
    `Write a LinkedIn post for a ${typeLabel[type] ?? type} report.`,
    `Workspace: ${d.workspace.name}.`,
    `Workflows active: ${d.workflows.total} (${d.workflows.n8n} n8n + ${d.workflows.make} Make.com).`,
    `Events tracked: ${d.events.total} · Success rate: ${d.events.successRate}%.`,
    `Contacts engaged: ${d.kpis.contactsEngaged} · Emails sent: ${d.kpis.emailsSent} · Replies: ${d.kpis.repliesReceived}.`,
    `Meetings booked: ${d.kpis.meetingsBooked} · Deals tracked: ${d.kpis.dealsTracked}.`,
    `Correlation verified: ${d.correlations.verified} events · Avg workflow health: ${d.avgHealthScore}%.`,
    `Period: ${d.period}. Source: iqpipe GTM observability platform.`,
  ].join(" ");
}

function buildDefaultInsight(d: ReportData, _type: string): string {
  const parts: string[] = [];
  if (d.events.total > 0)          parts.push(`${d.events.total.toLocaleString()} GTM events tracked`);
  if (d.events.successRate > 0)    parts.push(`${d.events.successRate}% execution success`);
  if (d.kpis.contactsEngaged > 0)  parts.push(`${d.kpis.contactsEngaged.toLocaleString()} unique contacts engaged`);
  if (d.kpis.meetingsBooked > 0)   parts.push(`${d.kpis.meetingsBooked} meetings booked`);
  if (d.correlations.verified > 0) parts.push(`${d.correlations.verified} events cross-verified`);
  return parts.length
    ? `📊 ${parts.join(" · ")} — all verified by iqpipe.`
    : "Connect your automations to start generating verified GTM insights with iqpipe.";
}

export default router;
