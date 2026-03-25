import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { hashEmail } from "../utils/identity";
import { decrypt } from "../utils/encryption";

const router = Router();

// ── Silence thresholds per tool (hours) ──────────────────────────────────────
const SILENCE_THRESHOLD: Record<string, number> = {
  clay: 4,
  apollo: 6,
  heyreach: 6,
  lemlist: 6,
  instantly: 6,
  smartlead: 6,
  phantombuster: 12,
  replyio: 6,
  outreach: 12,
  clearbit: 24,
  clearbit_p: 24,
  zoominfo: 24,
  pdl: 24,
  hunter: 24,
  lusha: 24,
  cognism: 24,
  snovio: 24,
  rocketreach: 24,
  hubspot: 48,
  pipedrive: 48,
  salesforce: 48,
  airtable: 24,
  attio: 48,
  stripe: 48,
  chargebee: 48,
  paddle: 48,
  lemonsqueezy: 48,
  n8n: 12,
  make: 12,
};

const TOOL_LABELS: Record<string, string> = {
  clay: "Clay",
  apollo: "Apollo",
  heyreach: "HeyReach",
  lemlist: "Lemlist",
  instantly: "Instantly",
  smartlead: "Smartlead",
  phantombuster: "PhantomBuster",
  replyio: "Reply.io",
  outreach: "Outreach",
  clearbit: "Clearbit (Enrichment)",
  clearbit_p: "Clearbit (Prospector)",
  zoominfo: "ZoomInfo",
  pdl: "People Data Labs",
  hunter: "Hunter.io",
  lusha: "Lusha",
  cognism: "Cognism",
  snovio: "Snov.io",
  rocketreach: "RocketReach",
  hubspot: "HubSpot",
  pipedrive: "Pipedrive",
  salesforce: "Salesforce",
  airtable: "Airtable",
  attio: "Attio",
  stripe: "Stripe",
  chargebee: "Chargebee",
  paddle: "Paddle",
  lemonsqueezy: "LemonSqueezy",
  n8n: "n8n",
  make: "Make.com",
};

const TOOL_CHANNEL: Record<string, string> = {
  clay: "prospecting",
  apollo: "email",
  heyreach: "linkedin",
  lemlist: "email",
  instantly: "email",
  smartlead: "email",
  phantombuster: "linkedin",
  replyio: "email",
  outreach: "email",
  clearbit: "enrichment",
  clearbit_p: "enrichment",
  zoominfo: "enrichment",
  pdl: "enrichment",
  hunter: "enrichment",
  lusha: "enrichment",
  cognism: "enrichment",
  snovio: "enrichment",
  rocketreach: "enrichment",
  hubspot: "crm",
  pipedrive: "crm",
  salesforce: "crm",
  airtable: "crm",
  attio: "crm",
  stripe: "billing",
  chargebee: "billing",
  paddle: "billing",
  lemonsqueezy: "billing",
  n8n: "automation",
  make: "automation",
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/overview
// Returns per-tool health stats + alarms + discrepancies
// ─────────────────────────────────────────────────────────────────────────────
router.get("/overview", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

  try {
    // Fetch connected integrations
    const connections = await prisma.integrationConnection.findMany({
      where: { workspaceId, status: "connected" },
      select: { provider: true, updatedAt: true },
    });

    const connectedTools = new Set(connections.map((c) => c.provider));

    // Aggregate touchpoints per tool
    const [counts24h, counts7d, lastEvents] = await Promise.all([
      prisma.touchpoint.groupBy({
        by: ["tool"],
        where: { workspaceId, recordedAt: { gte: h24 } },
        _count: { id: true },
      }),
      prisma.touchpoint.groupBy({
        by: ["tool"],
        where: { workspaceId, recordedAt: { gte: d7 } },
        _count: { id: true },
      }),
      prisma.touchpoint.findMany({
        where: { workspaceId },
        orderBy: { recordedAt: "desc" },
        distinct: ["tool"],
        select: { tool: true, recordedAt: true, eventType: true },
      }),
    ]);

    const map24h = Object.fromEntries(counts24h.map((r) => [r.tool, r._count.id]));
    const map7d  = Object.fromEntries(counts7d.map((r) => [r.tool, r._count.id]));
    const mapLast = Object.fromEntries(lastEvents.map((r) => [r.tool, { recordedAt: r.recordedAt, eventType: r.eventType }]));

    // Build per-tool stats
    const tools = Array.from(connectedTools).map((tool) => {
      const last = mapLast[tool];
      const threshold = SILENCE_THRESHOLD[tool] ?? 24;
      const hoursSinceLast = last
        ? (now.getTime() - new Date(last.recordedAt).getTime()) / (1000 * 60 * 60)
        : Infinity;

      let status: "healthy" | "warning" | "silent" | "never";
      if (!last) {
        status = "never";
      } else if (hoursSinceLast > threshold * 2) {
        status = "silent";
      } else if (hoursSinceLast > threshold) {
        status = "warning";
      } else {
        status = "healthy";
      }

      return {
        tool,
        label: TOOL_LABELS[tool] ?? tool,
        channel: TOOL_CHANNEL[tool] ?? "other",
        status,
        lastEventAt: last?.recordedAt ?? null,
        lastEventType: last?.eventType ?? null,
        hoursSinceLast: last ? Math.round(hoursSinceLast * 10) / 10 : null,
        silenceThresholdHours: threshold,
        events24h: map24h[tool] ?? 0,
        events7d:  map7d[tool]  ?? 0,
      };
    });

    // Alarms — tools with events never seen or silent past threshold
    const alarms = tools
      .filter((t) => t.status === "silent" || t.status === "never")
      .map((t) => ({
        tool: t.tool,
        label: t.label,
        severity: t.status === "never" ? "error" : "warning",
        message:
          t.status === "never"
            ? `${t.label} is connected but has never sent an event. Check webhook setup.`
            : `${t.label} has been silent for ${t.hoursSinceLast}h (threshold: ${t.silenceThresholdHours}h).`,
      }));

    // Discrepancy detection
    const discrepancies: { tool: string; label: string; message: string; severity: string }[] = [];

    // Per-tool event type breakdown for discrepancy logic
    const eventTypeBreakdown = await prisma.touchpoint.groupBy({
      by: ["tool", "eventType"],
      where: { workspaceId, recordedAt: { gte: d7 } },
      _count: { id: true },
    });

    const toolEventMap: Record<string, Record<string, number>> = {};
    for (const row of eventTypeBreakdown) {
      if (!toolEventMap[row.tool]) toolEventMap[row.tool] = {};
      toolEventMap[row.tool][row.eventType] = row._count.id;
    }

    // Check: high sequence_started but zero reply_received per email tool
    const emailTools = tools.filter((t) => t.channel === "email");
    for (const t of emailTools) {
      const evts = toolEventMap[t.tool] ?? {};
      const started = evts["sequence_started"] ?? 0;
      const replied = evts["reply_received"] ?? 0;
      if (started > 20 && replied === 0) {
        discrepancies.push({
          tool: t.tool,
          label: t.label,
          severity: "warning",
          message: `${t.label}: ${started} sequences started (7d) but 0 replies. Possible deliverability issue.`,
        });
      }
    }

    // Check: LinkedIn tools sending but no connection_accepted
    const linkedinTools = tools.filter((t) => t.channel === "linkedin");
    for (const t of linkedinTools) {
      const evts = toolEventMap[t.tool] ?? {};
      const sent = (evts["connection_request_sent"] ?? 0) + (evts["message_sent"] ?? 0);
      const accepted = evts["connection_accepted"] ?? 0;
      if (sent > 20 && accepted === 0) {
        discrepancies.push({
          tool: t.tool,
          label: t.label,
          severity: "warning",
          message: `${t.label}: ${sent} LinkedIn touches (7d) but 0 accepted connections. Check acceptance rate.`,
        });
      }
    }

    // Check: CRM receiving deal events but no attribution (no prior touchpoints)
    const crmTools = tools.filter((t) => t.channel === "crm");
    for (const t of crmTools) {
      const evts = toolEventMap[t.tool] ?? {};
      const deals = (evts["deal_won"] ?? 0) + (evts["deal_created"] ?? 0);
      if (deals > 0 && (map7d[t.tool] ?? 0) > 0) {
        // Check outcomes with no first-touch attribution
        const unattributed = await prisma.outcome.count({
          where: {
            workspaceId,
            reportingTool: t.tool,
            firstTouchTool: null,
            recordedAt: { gte: d7 },
          },
        });
        if (unattributed > 0) {
          discrepancies.push({
            tool: t.tool,
            label: t.label,
            severity: "info",
            message: `${t.label}: ${unattributed} deal outcome(s) with no attributed outreach tool. Connect more tools for full pipeline attribution.`,
          });
        }
      }
    }

    // Summary counts
    const totalEvents24h = counts24h.reduce((s, r) => s + r._count.id, 0);
    const totalEvents7d  = counts7d.reduce((s, r) => s + r._count.id, 0);
    const healthyCount   = tools.filter((t) => t.status === "healthy").length;
    const alarmCount     = tools.filter((t) => t.status === "silent" || t.status === "never" || t.status === "warning").length;

    res.json({
      summary: {
        connectedTools: connectedTools.size,
        healthyTools: healthyCount,
        alarmTools: alarmCount,
        totalEvents24h,
        totalEvents7d,
      },
      tools,
      alarms: [...alarms, ...discrepancies],
      eventTypeBreakdown: toolEventMap,
    });
  } catch (err) {
    console.error("[signal-health/overview]", err);
    res.status(500).json({ error: "Failed to compute signal health" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/tool-cards
// Per-tool aggregate stats for Live Feed KPI cards
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_PRIMARY_LABEL: Record<string, string> = {
  lead_imported:           "leads sourced",
  lead_enriched:           "leads enriched",
  email_sent:              "emails sent",
  sequence_started:        "sequences started",
  message_sent:            "messages sent",
  connection_sent:         "connections sent",
  connection_request_sent: "requests sent",
  deal_created:            "deals created",
  deal_won:                "deals won",
  reply_received:          "replies received",
  meeting_booked:          "meetings booked",
  email_opened:            "emails opened",
  email_clicked:           "link clicks",
  connection_accepted:     "connections accepted",
};

router.get("/tool-cards", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3_600_000);
  const d7  = new Date(now.getTime() - 7  * 24 * 3_600_000);

  try {
    const [connections, allTime, cnt24h, cnt7d, lastEvt, byType] = await Promise.all([
      prisma.integrationConnection.findMany({
        where: { workspaceId, status: "connected" },
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
        if (hoursSince <= threshold * 0.5) status = "healthy";
        else if (hoursSince <= threshold)  status = "warning";
        else                               status = "silent";
      }
      const topEvt = (toolTypes[tool] ?? [])[0];
      return {
        tool,
        label:       TOOL_LABELS[tool] ?? tool,
        channel:     TOOL_CHANNEL[tool] ?? "other",
        status,
        totalEvents: mapAll[tool] ?? 0,
        events24h:   map24h[tool] ?? 0,
        events7d:    map7d[tool]  ?? 0,
        lastEventAt: lastAt,
        primaryMetric: topEvt
          ? { count: topEvt.count, label: TOOL_PRIMARY_LABEL[topEvt.eventType] ?? topEvt.eventType.replace(/_/g, " ") }
          : null,
        topEvents: (toolTypes[tool] ?? []).slice(0, 4).map(e => ({
          eventType: e.eventType,
          label: TOOL_PRIMARY_LABEL[e.eventType] ?? e.eventType.replace(/_/g, " "),
          count: e.count,
        })),
      };
    });

    res.json(cards);
  } catch (err) {
    console.error("[signal-health/tool-cards]", err);
    res.status(500).json({ error: "Failed to fetch tool cards" });
  }
});

const SIGNAL_EVENTS = [
  "reply_received", "meeting_booked", "deal_won", "deal_created", "deal_lost",
  "email_clicked",  "link_clicked",   "connection_accepted",
  "email_bounced",  "unsubscribed",
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/feed
// Returns recent touchpoints as live event feed
// Add ?signalOnly=true to return only high-signal events (replies, meetings, etc.)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/feed", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const tool        = req.query.tool as string | undefined;
  const eventType   = req.query.eventType as string | undefined;
  const signalOnly  = req.query.signalOnly === "true";
  const limit       = Math.min(parseInt(req.query.limit as string) || 50, 200);

  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const where: any = { workspaceId };
    if (tool)        where.tool      = tool;
    if (eventType)   where.eventType = eventType;
    if (signalOnly)  where.eventType = { in: SIGNAL_EVENTS };

    const events = await prisma.touchpoint.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      take: limit,
      select: {
        id: true,
        tool: true,
        channel: true,
        eventType: true,
        recordedAt: true,
        iqLeadId: true,
        meta: true,
        sourceType: true,
        workflowId: true,
      },
    });

    const labeled = events.map((e) => ({
      ...e,
      toolLabel: TOOL_LABELS[e.tool] ?? e.tool,
      meta: e.meta ? JSON.parse(e.meta) : null,
    }));

    res.json(labeled);
  } catch (err) {
    console.error("[signal-health/feed]", err);
    res.status(500).json({ error: "Failed to fetch event feed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/funnel
// Cross-tool pipeline funnel: unique lead counts at each conversion stage
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: "sourced",   label: "Sourced",          events: ["lead_imported", "lead_enriched"] },
  { key: "enriched",  label: "Enriched",          events: ["lead_enriched"] },
  { key: "contacted", label: "Contacted",         events: ["sequence_started", "connection_sent", "email_sent", "message_sent", "connection_request_sent"] },
  { key: "engaged",   label: "Engaged",           events: ["email_opened", "connection_accepted", "email_clicked", "link_clicked"] },
  { key: "replied",   label: "Replied",           events: ["reply_received"] },
  { key: "meeting",   label: "Meeting Booked",    events: ["meeting_booked"] },
  { key: "deal",      label: "Deal Created",      events: ["deal_created", "deal_won"] },
  { key: "won",       label: "Deal Won",          events: ["deal_won"] },
];

router.get("/funnel", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const period      = (req.query.period as string) || "30d";

  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const now = new Date();
  let since: Date | undefined;
  if (period === "7d")  since = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  if (period === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90d") since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const dateFilter = since ? { recordedAt: { gte: since } } : {};

  try {
    // Unique lead count at each stage
    const stageCounts = await Promise.all(
      FUNNEL_STAGES.map(async (stage) => {
        const rows = await prisma.touchpoint.findMany({
          where: { workspaceId, eventType: { in: stage.events }, ...dateFilter },
          distinct: ["iqLeadId"],
          select: { iqLeadId: true },
        });
        return { key: stage.key, count: rows.length };
      })
    );

    // Per-tool event breakdown for attribution
    const toolBreakdown = await prisma.touchpoint.groupBy({
      by: ["tool", "eventType"],
      where: { workspaceId, ...dateFilter },
      _count: { id: true },
    });

    const baseline = stageCounts[0].count || 1;

    const stages = FUNNEL_STAGES.map((stage, i) => {
      const count    = stageCounts[i].count;
      const prev     = i > 0 ? stageCounts[i - 1].count : count;
      const convRate = prev > 0 ? Math.round((count / prev) * 100) : 0;
      const dropOff  = Math.max(0, prev - count);
      const pctOfTop = Math.round((count / baseline) * 100);

      // Which tools drove this stage (by event type membership)
      const contrib: Record<string, number> = {};
      for (const row of toolBreakdown) {
        if (stage.events.includes(row.eventType)) {
          contrib[row.tool] = (contrib[row.tool] ?? 0) + row._count.id;
        }
      }
      const tools = Object.entries(contrib)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tool, cnt]) => ({ tool, label: TOOL_LABELS[tool] ?? tool, count: cnt }));

      return {
        key: stage.key,
        label: stage.label,
        count,
        convRate: i === 0 ? 100 : convRate,
        dropOff:  i === 0 ? 0   : dropOff,
        pctOfTop,
        tools,
      };
    });

    res.json({ period, stages });
  } catch (err) {
    console.error("[signal-health/funnel]", err);
    res.status(500).json({ error: "Failed to compute funnel" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/contacts
// Recent IqLeads for browse list in Contact Inspector
// ─────────────────────────────────────────────────────────────────────────────
router.get("/contacts", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    // Get leads with their most recent touchpoint
    const leads = await prisma.iqLead.findMany({
      where: { workspaceId },
      orderBy: { firstSeenAt: "desc" },
      take: limit,
    });

    // Get last touchpoint per lead
    const ids = leads.map((l) => l.id);
    const lastTouchpoints = await prisma.touchpoint.findMany({
      where: { workspaceId, iqLeadId: { in: ids } },
      orderBy: { recordedAt: "desc" },
      distinct: ["iqLeadId"],
      select: { iqLeadId: true, tool: true, eventType: true, recordedAt: true },
    });
    const tpMap = Object.fromEntries(lastTouchpoints.map((t) => [t.iqLeadId, t]));

    // Count touchpoints per lead
    const counts = await prisma.touchpoint.groupBy({
      by: ["iqLeadId"],
      where: { workspaceId, iqLeadId: { in: ids } },
      _count: { id: true },
    });
    const countMap = Object.fromEntries(counts.map((c) => [c.iqLeadId, c._count.id]));

    const result = leads.map((l) => {
      const tp = tpMap[l.id];
      return {
        id:          l.id,
        displayName: l.displayName,
        company:     l.company,
        title:       l.title,
        email:       l.emailEnc ? (() => { try { return decrypt(l.emailEnc!); } catch { return null; } })() : null,
        eventCount:  countMap[l.id] ?? 0,
        lastTool:    tp ? (TOOL_LABELS[tp.tool] ?? tp.tool) : null,
        lastEvent:   tp?.eventType ?? null,
        lastAt:      tp?.recordedAt ?? null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[signal-health/contacts]", err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signal-health/timeline
// Returns full cross-tool event history for a contact looked up by email
// ─────────────────────────────────────────────────────────────────────────────
router.get("/timeline", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const email       = req.query.email       as string;

  if (!workspaceId || !email) {
    return res.status(400).json({ error: "workspaceId and email required" });
  }

  try {
    const emailHash = hashEmail(email);
    const lead = await prisma.iqLead.findFirst({
      where: { workspaceId, emailHash },
    });

    if (!lead) return res.json({ found: false, contact: null, events: [], activeSequences: [] });

    const touchpoints = await prisma.touchpoint.findMany({
      where: { workspaceId, iqLeadId: lead.id },
      orderBy: { recordedAt: "desc" },
      take: 300,
    });

    // Detect tools actively touching this contact:
    // tool is "active" if it has sequence_started with no terminal event following
    const toolEvents: Record<string, Set<string>> = {};
    for (const tp of touchpoints) {
      if (!toolEvents[tp.tool]) toolEvents[tp.tool] = new Set();
      toolEvents[tp.tool].add(tp.eventType);
    }
    const TERMINAL = new Set(["reply_received", "meeting_booked", "sequence_ended", "deal_won", "deal_lost", "unsubscribed"]);
    const activeSequences: string[] = [];
    for (const [tool, evts] of Object.entries(toolEvents)) {
      const hasStart   = evts.has("sequence_started") || evts.has("connection_sent") || evts.has("email_sent");
      const hasTerminal = [...evts].some((e) => TERMINAL.has(e));
      if (hasStart && !hasTerminal) activeSequences.push(TOOL_LABELS[tool] ?? tool);
    }

    res.json({
      found: true,
      contact: {
        id:          lead.id,
        displayName: lead.displayName,
        company:     lead.company,
        title:       lead.title,
        email:       lead.emailEnc ? (() => { try { return decrypt(lead.emailEnc!); } catch { return null; } })() : null,
      },
      activeSequences,
      events: touchpoints.map((tp) => ({
        id:          tp.id,
        tool:        tp.tool,
        toolLabel:   TOOL_LABELS[tp.tool] ?? tp.tool,
        channel:     TOOL_CHANNEL[tp.tool] ?? "other",
        eventType:   tp.eventType,
        recordedAt:  tp.recordedAt,
        meta:        tp.meta ? JSON.parse(tp.meta) : null,
      })),
    });
  } catch (err) {
    console.error("[signal-health/timeline]", err);
    res.status(500).json({ error: "Failed to fetch contact timeline" });
  }
});

export default router;
