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

// ── POST /api/report-studio/export ───────────────────────────────────────────
// Returns a native SVG file — no screenshot, pure vector output.

router.post("/export", (req: Request, res: Response) => {
  const { data, reportType, cardFormat, insight, flows } =
    req.body as {
      data: ReportData; reportType: string; cardFormat: string;
      insight?: string; flows?: PerFlowStat[];
    };

  if (!data) {
    return res.status(400).json({ error: "data required" }) as any;
  }

  const svg      = generateSVG(data, reportType, cardFormat ?? "linkedin", insight ?? "", flows ?? []);
  const filename = `iqpipe-${reportType}-${data.period}.svg`;

  res.setHeader("Content-Type",        "image/svg+xml");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(svg);
});

// ── SVG generator ─────────────────────────────────────────────────────────────

type CardFormat = "linkedin" | "square" | "story";

const CARD_SIZES: Record<CardFormat, { w: number; h: number }> = {
  linkedin: { w: 1200, h: 627  },
  square:   { w: 1080, h: 1080 },
  story:    { w: 1080, h: 1920 },
};

const PERIOD_LABEL: Record<string, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "all": "All time",
};

const APP_DOMAIN_MAP: Record<string, string> = {
  hubspot: "hubspot.com", salesforce: "salesforce.com", pipedrive: "pipedrive.com",
  attio: "attio.com", instantly: "instantly.ai", lemlist: "lemlist.com",
  smartlead: "smartlead.ai", heyreach: "heyreach.io", apollo: "apollo.io",
  clay: "clay.com", stripe: "stripe.com", calendly: "calendly.com", slack: "slack.com",
};

// Pastel accent colours for app chips when no favicon is shown
const APP_COLORS = [
  "#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b",
  "#ef4444","#ec4899","#84cc16","#f97316","#14b8a6",
];

function xmlEscape(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

// Rounded rectangle helper
function rrect(x: number, y: number, w: number, h: number, r: number, fill: string, opacity = 1): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" opacity="${opacity}"/>`;
}

function svgText(
  text: string, x: number, y: number,
  opts: { size?: number; weight?: string; fill?: string; anchor?: string; opacity?: number } = {},
): string {
  const { size = 14, weight = "400", fill = "#ffffff", anchor = "start", opacity = 1 } = opts;
  return `<text x="${x}" y="${y}" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${xmlEscape(text)}</text>`;
}

function generateBarChart(byDay: { date: string; count: number }[], x: number, y: number, w: number, h: number): string {
  const bars  = byDay.slice(-14);
  const max   = Math.max(...bars.map(b => b.count), 1);
  const bw    = Math.floor(w / bars.length);
  const gap   = Math.max(2, Math.floor(bw * 0.15));
  const barW  = bw - gap;
  let out = "";
  bars.forEach((b, i) => {
    const bh = Math.max(2, Math.round((b.count / max) * h));
    const bx = x + i * bw + gap / 2;
    const by = y + h - bh;
    const op = 0.5 + (b.count / max) * 0.5;
    out += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="#6366f1" opacity="${op.toFixed(2)}"/>`;
  });
  return out;
}

function generateKPITile(label: string, value: string, x: number, y: number, w: number, h: number): string {
  return [
    rrect(x, y, w, h, 12, "#1e293b"),
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#334155" opacity="0.3"/>`,
    svgText(value, x + 20, y + h * 0.52 + 8, { size: Math.min(36, Math.floor(w * 0.22)), weight: "900" }),
    svgText(label, x + 20, y + h * 0.52 + 28, { size: 13, fill: "#64748b" }),
  ].join("\n");
}

function generateFlowRows(flows: PerFlowStat[], x: number, y: number, W: number, maxRows: number): string {
  const visible  = flows.slice(0, maxRows);
  const rowH     = 36;
  const labelMap: Record<string, string> = { n8n: "n8n", make: "Make" };
  const colorMap: Record<string, string> = { n8n: "#f97316", make: "#8b5cf6" };
  let out = svgText("INCLUDED FLOWS", x, y - 8, { size: 10, fill: "#475569", weight: "700" });

  visible.forEach((f, i) => {
    const ry = y + i * (rowH + 4);
    // Row background
    out += rrect(x, ry, W - x * 2, rowH, 8, "#1e293b");

    // Platform badge
    const badgeColor = colorMap[f.platform] ?? "#6366f1";
    out += rrect(x + 8, ry + 9, 32, 18, 4, badgeColor, 0.2);
    out += svgText(labelMap[f.platform] ?? f.platform, x + 24, ry + 22, { size: 9, weight: "700", fill: badgeColor, anchor: "middle" });

    // Name
    out += svgText(truncate(f.name, 40), x + 50, ry + 22, { size: 11, weight: "600", fill: "#cbd5e1" });

    // App dots (coloured circles with initial, no external img fetch needed)
    const dotStart = W - x * 2 - 120;
    f.appKeys.slice(0, 6).forEach((key, ki) => {
      const dx = x + dotStart + ki * 18;
      const dy = ry + rowH / 2;
      const col = APP_COLORS[ki % APP_COLORS.length];
      out += `<circle cx="${dx}" cy="${dy}" r="7" fill="${col}" opacity="0.7"/>`;
      out += svgText((key[0] ?? "?").toUpperCase(), dx, dy + 4, { size: 7, weight: "700", fill: "#fff", anchor: "middle" });
    });

    // Event count + rate
    const rateColor = f.successRate >= 80 ? "#34d399" : f.successRate >= 50 ? "#fbbf24" : "#f87171";
    out += svgText(f.eventCount.toLocaleString(), W - x - 64, ry + 22, { size: 11, fill: "#94a3b8", anchor: "end" });
    out += svgText(`${f.successRate}%`, W - x - 8, ry + 22, { size: 11, weight: "700", fill: rateColor, anchor: "end" });
  });

  const extra = flows.length - maxRows;
  if (extra > 0) {
    const ry = y + visible.length * (rowH + 4);
    out += svgText(`+${extra} more flow${extra > 1 ? "s" : ""}`, x + 8, ry + 14, { size: 11, fill: "#475569" });
  }

  return out;
}

function generateSVG(
  data: ReportData, reportType: string, cardFormat: string,
  insight: string, flows: PerFlowStat[],
): string {
  const fmt = (["linkedin","square","story"].includes(cardFormat) ? cardFormat : "linkedin") as CardFormat;
  const { w: W, h: H } = CARD_SIZES[fmt];
  const PAD = 48;

  // ── Background ──────────────────────────────────────────────────────────────
  let body = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#020617"/>
      <stop offset="60%"  stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.7"/>
    </linearGradient>
    <radialGradient id="glow1" cx="90%" cy="5%" r="35%">
      <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="5%" cy="95%" r="30%">
      <stop offset="0%"   stop-color="#7c3aed" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>`;

  // ── iqpipe logo (top right) ─────────────────────────────────────────────────
  body += rrect(W - PAD - 88, 28, 36, 36, 8, "#6366f1", 0.2);
  body += `<rect x="${W - PAD - 88}" y="28" width="36" height="36" rx="8" fill="#818cf8" opacity="0.1"/>`;
  body += svgText("iq", W - PAD - 70, 52, { size: 14, weight: "800", fill: "#818cf8", anchor: "middle" });
  body += svgText("iqpipe", W - PAD - 44, 52, { size: 16, weight: "800", fill: "#ffffff" });

  // ── Header ──────────────────────────────────────────────────────────────────
  const typeLabels: Record<string, string> = {
    snapshot: "GTM PERFORMANCE REPORT", funnel: "OUTBOUND CAMPAIGN FUNNEL",
    digest:   "WEEKLY GTM DIGEST",       revenue: "REVENUE SIGNAL",
  };
  const accentColors: Record<string, string> = {
    snapshot: "#818cf8", funnel: "#a78bfa", digest: "#38bdf8", revenue: "#34d399",
  };
  const accent = accentColors[reportType] ?? "#818cf8";
  body += svgText(typeLabels[reportType] ?? "GTM REPORT", PAD, 52, { size: 11, weight: "700", fill: accent });
  body += svgText(truncate(data.workspace.name, 38), PAD, 96, { size: fmt === "story" ? 48 : 38, weight: "900" });
  body += svgText(PERIOD_LABEL[data.period] ?? data.period, PAD, 124, { size: 15, fill: "#64748b" });

  // ── KPI tiles ───────────────────────────────────────────────────────────────
  const tileY   = 148;
  const tileH   = 88;
  const cols    = fmt === "story" ? 2 : 4;
  const tileW   = Math.floor((W - PAD * 2 - (cols - 1) * 12) / cols);
  const kpis    = [
    { label: "Workflows",    value: String(data.workflows.total)          },
    { label: "Events",       value: data.events.total.toLocaleString()    },
    { label: "Success Rate", value: `${data.events.successRate}%`         },
    { label: "Verified",     value: String(data.correlations.verified)    },
  ];
  if (fmt === "story") {
    // 2×2 grid for story
    kpis.forEach((k, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      body += generateKPITile(k.label, k.value, PAD + col * (tileW + 12), tileY + row * (tileH + 12), tileW, tileH);
    });
  } else {
    kpis.forEach((k, i) => {
      body += generateKPITile(k.label, k.value, PAD + i * (tileW + 12), tileY, tileW, tileH);
    });
  }

  // ── Bar chart ───────────────────────────────────────────────────────────────
  const chartTopY = fmt === "story" ? tileY + tileH * 2 + 36 : tileY + tileH + 24;
  const chartH    = fmt === "story" ? 160 : 72;
  body += rrect(PAD, chartTopY, W - PAD * 2, chartH + 32, 12, "#1e293b");
  body += `<rect x="${PAD}" y="${chartTopY}" width="${W - PAD * 2}" height="${chartH + 32}" rx="12" fill="#334155" opacity="0.2"/>`;
  body += svgText("Events · last 14 days", PAD + 16, chartTopY + 20, { size: 11, fill: "#475569" });
  body += generateBarChart(data.events.byDay, PAD + 16, chartTopY + 28, W - PAD * 2 - 32, chartH);

  // ── App chips ───────────────────────────────────────────────────────────────
  const appsY = chartTopY + chartH + 56;
  body += svgText("Active integrations", PAD, appsY - 8, { size: 10, fill: "#475569", weight: "700" });
  data.topApps.slice(0, 8).forEach((a, i) => {
    const chipW = 80, chipH = 26, chipX = PAD + i * (chipW + 8), chipY = appsY;
    if (chipX + chipW > W - PAD) return;
    const col = APP_COLORS[i % APP_COLORS.length];
    body += rrect(chipX, chipY, chipW, chipH, 6, col, 0.12);
    body += `<rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="6" fill="${col}" opacity="0.08"/>`;
    body += `<circle cx="${chipX + 14}" cy="${chipY + 13}" r="6" fill="${col}" opacity="0.6"/>`;
    body += svgText((a.appKey[0] ?? "?").toUpperCase(), chipX + 14, chipY + 17, { size: 7, weight: "700", anchor: "middle", fill: "#fff" });
    body += svgText(truncate(a.appKey, 8), chipX + 25, chipY + 17, { size: 10, fill: "#cbd5e1" });
    body += svgText(String(a.count), chipX + chipW - 8, chipY + 17, { size: 9, fill: "#64748b", anchor: "end" });
  });

  // ── Flow strip ──────────────────────────────────────────────────────────────
  const flowsY = appsY + 42;
  const maxRows = fmt === "story" ? 6 : fmt === "square" ? 4 : 2;
  if (flows.length > 0) {
    body += generateFlowRows(flows, PAD, flowsY, W, maxRows);
  }

  // ── AI insight ──────────────────────────────────────────────────────────────
  if (insight) {
    const insightY = flows.length > 0
      ? flowsY + Math.min(flows.length, maxRows) * 40 + 20
      : flowsY;
    const insH = 48;
    body += rrect(PAD, insightY, W - PAD * 2, insH, 10, accent, 0.08);
    // Word-wrap rough split at ~100 chars
    const words  = insight.split(" ");
    let   line   = "";
    const lines: string[] = [];
    words.forEach(w => {
      if ((line + " " + w).length > 100) { lines.push(line); line = w; }
      else line = line ? line + " " + w : w;
    });
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, li) => {
      body += svgText(l, PAD + 16, insightY + 18 + li * 18, { size: 12, fill: "#cbd5e1" });
    });
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerParts = [];
  if (data.kpis.contactsEngaged)  footerParts.push(`${data.kpis.contactsEngaged.toLocaleString()} contacts`);
  if (data.kpis.meetingsBooked)   footerParts.push(`${data.kpis.meetingsBooked} meetings`);
  if (data.kpis.dealsTracked)     footerParts.push(`${data.kpis.dealsTracked} deals`);
  body += svgText(footerParts.join(" · "), PAD, H - 22, { size: 12, fill: "#334155" });
  body += svgText("Verified by iqpipe.com", W - PAD, H - 22, { size: 11, fill: "#1e293b", anchor: "end" });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

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
