/**
 * GTM Alpha Score Engine — /api/workflow-score
 *
 * Evaluates n8n workflows across four GTM pillars and produces:
 *   1. GTM Alpha Score (0–100) — weighted composite
 *   2. Leakage Value — estimated revenue lost from failed events
 *   3. Winner — highest Alpha Score in the comparison set
 *
 * Scoring Model v1.0
 * ─────────────────────────────────────────────────────────────────
 *  Pillar                  Weight   Signal
 *  Reliability             30%      done/total events (success rate)
 *  Throughput              25%      outcome events ratio + relative volume
 *  Connectivity Depth      20%      app diversity (count + high-value bonus)
 *  Business Criticality    25%      event-type weighted importance sum
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import ExcelJS from "exceljs";

const router = Router();

// ─── Scoring constants ────────────────────────────────────────────────────────

/**
 * Business criticality weights per GTM event type.
 * Values are 0–1. A workflow that processes many "deal_won" events
 * is far more GTM-critical than one that only enriches contacts.
 */
const CRITICALITY_WEIGHTS: Record<string, number> = {
  deal_won:               1.00,   // highest — directly equals closed revenue
  deal_created:           0.85,   // strong buying signal
  meeting_booked:         0.75,   // pipeline creation
  reply_received:         0.60,   // engagement confirmed
  crm_updated:            0.50,   // data hygiene keeping pipeline accurate
  contacted:              0.45,   // outreach executed
  email_sent:             0.35,   // top-of-funnel action
  linkedin_message_sent:  0.35,   // top-of-funnel action
  enriched:               0.25,   // pre-funnel data quality
  unknown:                0.10,   // unclassified / passthrough events
};

/**
 * Conversion probabilities: probability that a SINGLE event of this type
 * eventually contributes to a closed deal.  Used to price leakage.
 * e.g., 1 failed meeting_booked at ACV=$5,000 → $5,000 × 0.20 = $1,000 lost.
 */
const CONVERSION_PROBABILITIES: Record<string, number> = {
  deal_won:               1.00,
  deal_created:           0.35,
  meeting_booked:         0.20,
  reply_received:         0.08,
  crm_updated:            0.03,
  contacted:              0.025,
  email_sent:             0.015,
  linkedin_message_sent:  0.015,
  enriched:               0.005,
  unknown:                0.005,
};

/**
 * High-value app categories. Apps matching these slugs get a
 * +0.15 connectivity depth bonus (capped at 1.0).
 */
const HIGH_VALUE_APP_PATTERNS = [
  "hubspot", "salesforce", "pipedrive", "close", "attio",    // CRM
  "clay", "clearbit", "apollo", "hunter", "lusha",           // enrichment
  "outreach", "salesloft", "lemlist", "reply",               // sequencing
  "linkedin", "heyreach", "expandi",                         // linkedin
  "stripe", "chargebee", "recurly",                          // billing
];

const PILLAR_WEIGHTS = {
  reliability:          0.30,
  throughput:           0.25,
  connectivity:         0.20,
  criticality:          0.25,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodStart(period: string): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function scoreGrade(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/** Normalize a value 0→1 relative to the max in a set. Safe for zero-max. */
function norm(val: number, max: number): number {
  return max > 0 ? Math.min(1, val / max) : 0;
}

// ─── Per-workflow metric query ────────────────────────────────────────────────

interface WorkflowMetrics {
  workflowId:       string;
  name:             string;
  platform:         "n8n" | "make";
  active:           boolean;
  triggerType:      string;
  appsUsed:         string[];
  nodeCount:        number;
  // raw counts
  totalEvents:      number;
  done:             number;
  failed:           number;
  pending:          number;
  outcomeEvents:    number;
  processEvents:    number;
  // per-event-type failed counts  { eventType → failedCount }
  failedByType:     Record<string, number>;
  // per-event-type total counts   { eventType → totalCount }
  countByType:      Record<string, number>;
  lastEventAt:      string | null;
}

async function fetchN8nWorkflowMetrics(
  workspaceId: string,
  workflowN8nIds: string[],
  since: Date | null,
): Promise<WorkflowMetrics[]> {
  const dateFilter = since ? { createdAt: { gte: since } } : {};

  // Load metadata for name resolution
  const metas = await prisma.n8nWorkflowMeta.findMany({
    where: { workspaceId, n8nId: { in: workflowN8nIds } },
    select: { n8nId: true, name: true, active: true, triggerType: true,
              appsUsed: true, nodeCount: true },
  });
  const metaMap = Object.fromEntries(metas.map(m => [m.n8nId, m]));

  return Promise.all(workflowN8nIds.map(async (wfId) => {
    const wfFilter = { workspaceId, workflowId: wfId, ...dateFilter };
    const meta = metaMap[wfId];

    const [statusGroups, classGroups, typeGroups, failedTypeGroups, lastEvent] =
      await Promise.all([
        // overall status counts
        prisma.n8nQueuedEvent.groupBy({
          by: ["status"],
          where: wfFilter,
          _count: { id: true },
        }),
        // outcome vs process class
        prisma.n8nQueuedEvent.groupBy({
          by: ["eventClass"],
          where: wfFilter,
          _count: { id: true },
        }),
        // all events by type → criticality
        prisma.n8nQueuedEvent.groupBy({
          by: ["eventType"],
          where: wfFilter,
          _count: { id: true },
        }),
        // failed events by type → leakage
        prisma.n8nQueuedEvent.groupBy({
          by: ["eventType"],
          where: { ...wfFilter, status: "failed" },
          _count: { id: true },
        }),
        // last event timestamp
        prisma.n8nQueuedEvent.findFirst({
          where: wfFilter,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

    const statusMap   = Object.fromEntries(statusGroups.map(s => [s.status,              s._count.id]));
    const classMap    = Object.fromEntries(classGroups.map(c => [c.eventClass ?? "unknown", c._count.id]));
    const countByType = Object.fromEntries(typeGroups.map(t => [t.eventType,              t._count.id]));
    const failedByType = Object.fromEntries(failedTypeGroups.map(t => [t.eventType,       t._count.id]));

    const total  = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const done   = statusMap.done       ?? 0;
    const failed = statusMap.failed     ?? 0;
    const pending = statusMap.pending   ?? 0;

    let appsUsed: string[] = [];
    try { appsUsed = JSON.parse(meta?.appsUsed ?? "[]"); } catch { appsUsed = []; }

    return {
      workflowId:    wfId,
      name:          meta?.name        ?? wfId,
      platform:      "n8n",
      active:        meta?.active      ?? false,
      triggerType:   meta?.triggerType ?? "manual",
      appsUsed,
      nodeCount:     meta?.nodeCount   ?? 0,
      totalEvents:   total,
      done,
      failed,
      pending,
      outcomeEvents: classMap.outcome  ?? 0,
      processEvents: classMap.process  ?? 0,
      failedByType,
      countByType,
      lastEventAt:   lastEvent?.createdAt?.toISOString() ?? null,
    };
  }));
}

async function fetchMakeScenarioMetrics(
  workspaceId: string,
  scenarioMakeIds: string[],
  _since: Date | null,
): Promise<WorkflowMetrics[]> {
  // Make.com events enter via webhooks and aren't stored as N8nQueuedEvent.
  // We use scenario metadata and any webhook errors for scoring.
  const metas = await prisma.makeScenarioMeta.findMany({
    where: { workspaceId, makeId: { in: scenarioMakeIds } },
    select: { makeId: true, name: true, active: true, triggerType: true,
              appsUsed: true, moduleCount: true, eventFilter: true },
  });

  return metas.map((m) => {
    let appsUsed: string[] = [];
    try { appsUsed = JSON.parse(m.appsUsed ?? "[]"); } catch { appsUsed = []; }

    // Infer event types from eventFilter config as a proxy for business criticality
    let configuredEventTypes: string[] = [];
    try {
      const ef = m.eventFilter ? JSON.parse(m.eventFilter) : null;
      configuredEventTypes = ef?.eventTypes ?? [];
    } catch { configuredEventTypes = []; }

    const countByType: Record<string, number> =
      Object.fromEntries(configuredEventTypes.map(t => [t, 1]));

    return {
      workflowId:    m.makeId,
      name:          m.name,
      platform:      "make",
      active:        m.active,
      triggerType:   m.triggerType,
      appsUsed,
      nodeCount:     m.moduleCount,
      // Make has no event queue in our system yet — use zeros
      totalEvents:   0,
      done:          0,
      failed:        0,
      pending:       0,
      outcomeEvents: 0,
      processEvents: 0,
      failedByType:  {},
      countByType,
      lastEventAt:   null,
    };
  });
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

interface ScoredWorkflow {
  id:         string;
  name:       string;
  platform:   "n8n" | "make";
  active:     boolean;
  triggerType: string;
  appsUsed:   string[];
  nodeCount:  number;
  metrics: {
    reliability:  { done: number; failed: number; total: number; rawScore: number };
    throughput:   { outcomeEvents: number; processEvents: number; outcomeRate: number; rawScore: number };
    connectivity: { appCount: number; highValueApps: string[]; rawScore: number };
    criticality:  { eventBreakdown: Record<string, number>; rawScore: number };
  };
  pillars: {
    reliability:  number;   // 0–100, normalized within set
    throughput:   number;
    connectivity: number;
    criticality:  number;
  };
  alphaScore:  number;      // 0–100 final weighted score
  grade:       string;      // A / B / C / D / F
  leakage: {
    totalLoss:    number;
    currency:     string;
    breakdown:    { eventType: string; failedCount: number; conversionProb: number; estimatedLoss: number }[];
  };
  lastEventAt: string | null;
}

interface PillarWeights {
  reliability:  number;
  throughput:   number;
  connectivity: number;
  criticality:  number;
}

function scoreWorkflows(
  metrics: WorkflowMetrics[],
  acv: number,
  currency: string,
  weights: PillarWeights = PILLAR_WEIGHTS,
): ScoredWorkflow[] {
  if (metrics.length === 0) return [];

  // ── Pre-compute set-level maxima for normalisation ──────────────────────────
  const maxTotal       = Math.max(...metrics.map(m => m.totalEvents), 1);
  const maxOutcomeRate = Math.max(
    ...metrics.map(m => m.outcomeEvents / Math.max(1, m.totalEvents)), 0.001,
  );
  const maxApps        = Math.max(...metrics.map(m => m.appsUsed.length), 1);

  // Criticality raw score per workflow (sum of eventType weights × counts)
  // We normalise against the maximum in the set so the best workflow scores 100
  const critRaw = metrics.map(m => {
    const total = Math.max(1, m.totalEvents || Object.values(m.countByType).reduce((a,b)=>a+b,0));
    return Object.entries(m.countByType).reduce((sum, [type, count]) => {
      return sum + (CRITICALITY_WEIGHTS[type] ?? CRITICALITY_WEIGHTS.unknown) * (count / total);
    }, 0);
  });
  const maxCrit = Math.max(...critRaw, 0.001);

  return metrics.map((m, i) => {
    const total       = Math.max(1, m.totalEvents);
    const successRate = m.done / total;
    const outcomeRate = m.outcomeEvents / total;

    // ── Pillar raw scores (0–1) ──────────────────────────────────────────────

    // 1. Reliability: success rate, normalised within set
    const reliabilityRaw = successRate;

    // 2. Throughput: blend of outcome rate (60%) + relative volume (40%)
    const throughputRaw =
      norm(outcomeRate, maxOutcomeRate) * 0.60 +
      norm(m.totalEvents, maxTotal) * 0.40;

    // 3. Connectivity depth: app count + bonus for high-value apps
    const highValueApps = m.appsUsed.filter(a =>
      HIGH_VALUE_APP_PATTERNS.some(p => a.toLowerCase().includes(p)),
    );
    const appNorm     = norm(m.appsUsed.length, maxApps);
    const hvBonus     = Math.min(0.20, highValueApps.length * 0.05);
    const connectRaw  = Math.min(1, appNorm + hvBonus);

    // 4. Business Criticality
    const critNorm = critRaw[i] / maxCrit;

    // ── Weighted Alpha Score (0–100) ─────────────────────────────────────────
    const alpha = Math.round(
      reliabilityRaw  * weights.reliability   * 100 +
      throughputRaw   * weights.throughput    * 100 +
      connectRaw      * weights.connectivity  * 100 +
      critNorm        * weights.criticality   * 100,
    );

    // ── Leakage calculation ──────────────────────────────────────────────────
    const leakageBreakdown = Object.entries(m.failedByType).map(([type, failedCount]) => {
      const prob = CONVERSION_PROBABILITIES[type] ?? CONVERSION_PROBABILITIES.unknown;
      return {
        eventType:      type,
        failedCount,
        conversionProb: prob,
        estimatedLoss:  Math.round(failedCount * prob * acv),
      };
    });
    const totalLoss = leakageBreakdown.reduce((s, b) => s + b.estimatedLoss, 0);

    return {
      id:          m.workflowId,
      name:        m.name,
      platform:    m.platform,
      active:      m.active,
      triggerType: m.triggerType,
      appsUsed:    m.appsUsed,
      nodeCount:   m.nodeCount,
      metrics: {
        reliability: {
          done:      m.done,
          failed:    m.failed,
          total:     m.totalEvents,
          rawScore:  Math.round(reliabilityRaw * 100),
        },
        throughput: {
          outcomeEvents: m.outcomeEvents,
          processEvents: m.processEvents,
          outcomeRate:   parseFloat(outcomeRate.toFixed(4)),
          rawScore:      Math.round(throughputRaw * 100),
        },
        connectivity: {
          appCount:      m.appsUsed.length,
          highValueApps,
          rawScore:      Math.round(connectRaw * 100),
        },
        criticality: {
          eventBreakdown: m.countByType,
          rawScore:       Math.round(critNorm * 100),
        },
      },
      pillars: {
        reliability:  Math.round(reliabilityRaw * 100),
        throughput:   Math.round(throughputRaw  * 100),
        connectivity: Math.round(connectRaw     * 100),
        criticality:  Math.round(critNorm       * 100),
      },
      alphaScore:  Math.min(100, Math.max(0, alpha)),
      grade:       scoreGrade(alpha),
      leakage: {
        totalLoss,
        currency,
        breakdown: leakageBreakdown.sort((a, b) => b.estimatedLoss - a.estimatedLoss),
      },
      lastEventAt: m.lastEventAt,
    };
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/workflow-score
 *
 * Query params:
 *   workspaceId   required
 *   period        "7d" | "30d" | "90d" | "all"   default "30d"
 *   platform      "n8n" | "make" | "all"          default "all"
 *   ids[]         comma-separated or repeated param — specific workflow IDs
 *   acv           number (default 5000) — average contract value for leakage calc
 *   currency      "USD" | "EUR" | "GBP"  (default: workspace currency)
 */
router.get("/", async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) ?? "";
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const period   = (req.query.period   as string) || "30d";
  const platform = (req.query.platform as string) || "all";
  const acv      = Math.max(1, parseFloat((req.query.acv as string) || "5000") || 5000);

  // Optional custom pillar weights — normalized to sum to 1.0
  const wr = parseFloat((req.query.w_reliability  as string) || "0") || 0;
  const wt = parseFloat((req.query.w_throughput   as string) || "0") || 0;
  const wc = parseFloat((req.query.w_connectivity as string) || "0") || 0;
  const wk = parseFloat((req.query.w_criticality  as string) || "0") || 0;
  const wSum = wr + wt + wc + wk;
  const effectiveWeights: PillarWeights = wSum > 0 ? {
    reliability:  wr / wSum,
    throughput:   wt / wSum,
    connectivity: wc / wSum,
    criticality:  wk / wSum,
  } : { ...PILLAR_WEIGHTS };

  // ids can be passed as ?ids[]=a&ids[]=b or ?ids=a,b
  let ids: string[] = [];
  const rawIds = req.query.ids;
  if (Array.isArray(rawIds))      ids = rawIds as string[];
  else if (typeof rawIds === "string") ids = rawIds.split(",").map(s => s.trim()).filter(Boolean);

  const since = periodStart(period);

  try {
    // Resolve workspace currency
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultCurrency: true },
    });
    const currency = (req.query.currency as string) || workspace?.defaultCurrency || "USD";

    // Fetch metadata to discover all workflow IDs if none specified
    let n8nIds: string[]  = [];
    let makeIds: string[] = [];

    if (platform === "n8n" || platform === "all") {
      const n8nMetas = await prisma.n8nWorkflowMeta.findMany({
        where: { workspaceId, ...(ids.length ? { n8nId: { in: ids } } : {}) },
        select: { n8nId: true },
      });
      n8nIds = n8nMetas.map(m => m.n8nId);
    }

    if (platform === "make" || platform === "all") {
      const makeMetas = await prisma.makeScenarioMeta.findMany({
        where: { workspaceId, ...(ids.length ? { makeId: { in: ids } } : {}) },
        select: { makeId: true },
      });
      makeIds = makeMetas.map(m => m.makeId);
    }

    // Fetch metrics in parallel
    const [n8nMetrics, makeMetrics] = await Promise.all([
      n8nIds.length > 0
        ? fetchN8nWorkflowMetrics(workspaceId, n8nIds, since)
        : Promise.resolve([] as WorkflowMetrics[]),
      makeIds.length > 0
        ? fetchMakeScenarioMetrics(workspaceId, makeIds, since)
        : Promise.resolve([] as WorkflowMetrics[]),
    ]);

    const allMetrics = [...n8nMetrics, ...makeMetrics];
    if (allMetrics.length === 0) {
      return res.json({
        scoring_model: buildModelManifest(acv, currency, effectiveWeights),
        workflows: [],
        winner: null,
        comparison: null,
      });
    }

    const scored = scoreWorkflows(allMetrics, acv, currency, effectiveWeights);

    // Winner = highest Alpha Score (ties broken by reliability)
    const winner = [...scored].sort((a, b) =>
      b.alphaScore !== a.alphaScore
        ? b.alphaScore - a.alphaScore
        : b.pillars.reliability - a.pillars.reliability,
    )[0];

    // Per-pillar bests
    const bestBy = (pillar: keyof ScoredWorkflow["pillars"]) =>
      scored.reduce((best, w) => w.pillars[pillar] > best.pillars[pillar] ? w : best);

    return res.json({
      scoring_model: buildModelManifest(acv, currency, effectiveWeights),
      workflows: scored,
      winner: winner
        ? { id: winner.id, name: winner.name, platform: winner.platform, alphaScore: winner.alphaScore, grade: winner.grade }
        : null,
      comparison: {
        best_reliability:  bestBy("reliability").id,
        best_throughput:   bestBy("throughput").id,
        best_connectivity: bestBy("connectivity").id,
        best_criticality:  bestBy("criticality").id,
      },
    });
  } catch (err: any) {
    console.error("[workflow-score]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Model manifest (self-describing JSON) ────────────────────────────────────

function buildModelManifest(acv: number, currency: string, weights: PillarWeights = PILLAR_WEIGHTS) {
  return {
    version: "1.0",
    description: "GTM Alpha Score — weighted composite of 4 GTM performance pillars",
    weights,
    business_criticality_weights: CRITICALITY_WEIGHTS,
    leakage_config: {
      acv,
      currency,
      conversion_probabilities: CONVERSION_PROBABILITIES,
      formula: "leakage = Σ(failedCount[eventType] × ACV × conversionProbability[eventType])",
    },
    grade_thresholds: { A: 85, B: 70, C: 55, D: 40, F: 0 },
    normalization: "all pillar sub-scores are normalized within the comparison set (max=100)",
  };
}

// ── GET /api/workflow-score/export-xlsx ──────────────────────────────────────
// Same params as main route but no workflow limit — exports ALL selected/available
// workflows as a formatted Excel workbook.

router.get("/export-xlsx", async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) ?? "";
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const period   = (req.query.period   as string) || "30d";
  const platform = (req.query.platform as string) || "all";

  let ids: string[] = [];
  const rawIds = req.query["ids[]"] ?? req.query.ids;
  if (Array.isArray(rawIds))           ids = rawIds as string[];
  else if (typeof rawIds === "string") ids = rawIds.split(",").map(s => s.trim()).filter(Boolean);

  const since = periodStart(period);

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, defaultCurrency: true },
    });

    let n8nIds: string[]  = [];
    let makeIds: string[] = [];

    if (platform === "n8n" || platform === "all") {
      const metas = await prisma.n8nWorkflowMeta.findMany({
        where: { workspaceId, ...(ids.length ? { n8nId: { in: ids } } : {}) },
        select: { n8nId: true },
      });
      n8nIds = metas.map(m => m.n8nId);
    }
    if (platform === "make" || platform === "all") {
      const metas = await prisma.makeScenarioMeta.findMany({
        where: { workspaceId, ...(ids.length ? { makeId: { in: ids } } : {}) },
        select: { makeId: true },
      });
      makeIds = metas.map(m => m.makeId);
    }

    const [n8nMetrics, makeMetrics] = await Promise.all([
      n8nIds.length > 0  ? fetchN8nWorkflowMetrics(workspaceId, n8nIds, since)  : Promise.resolve([] as WorkflowMetrics[]),
      makeIds.length > 0 ? fetchMakeScenarioMetrics(workspaceId, makeIds, since) : Promise.resolve([] as WorkflowMetrics[]),
    ]);

    const allMetrics = [...n8nMetrics, ...makeMetrics];
    const scored     = allMetrics.length > 0 ? scoreWorkflows(allMetrics, 1, "USD") : [];

    // Compute leakage risk (0–100) relative to this exported set
    const maxFailed = Math.max(...scored.map(w => w.metrics.reliability.failed), 1);
    const riskScore = (w: ScoredWorkflow) =>
      Math.round((w.metrics.reliability.failed / maxFailed) * 100);

    // ── Build Excel ──────────────────────────────────────────────────────────
    const wb  = new ExcelJS.Workbook();
    wb.creator  = "iqpipe";
    wb.created  = new Date();

    const ws  = wb.addWorksheet("GTM Alpha Score", { views: [{ state: "frozen", ySplit: 2 }] });

    // Title row
    ws.mergeCells("A1:R1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `GTM Alpha Score — Workflow Comparison  ·  ${workspace?.name ?? ""}  ·  Period: ${period}  ·  Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    titleCell.font  = { bold: true, size: 11, name: "Calibri", color: { argb: "FFFFFFFF" } };
    titleCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 26;

    // Header row
    const headers = [
      "Workflow Name", "Platform", "Active", "Grade", "Alpha Score",
      "Reliability", "Throughput", "Connectivity", "Business Criticality",
      "Leakage Risk (0-100)", "Failed Executions",
      "Done", "Failed", "Total Events",
      "Outcome Events", "Process Events",
      "Apps Used", "High-Value Apps",
    ];
    const colWidths = [36, 10, 8, 8, 13, 13, 13, 14, 20, 20, 20, 8, 8, 13, 16, 16, 40, 40];

    headers.forEach((h, i) => {
      const cell = ws.getCell(2, i + 1);
      cell.value = h;
      cell.font  = { bold: true, size: 10, name: "Calibri", color: { argb: "FFFFFFFF" } };
      cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "medium", color: { argb: "FF818CF8" } } };
      ws.getColumn(i + 1).width = colWidths[i];
    });
    ws.getRow(2).height = 22;

    // Grade colors
    const GRADE_ARGB: Record<string, string> = {
      A: "FF052e16", B: "FF1e3a5f", C: "FF451a03", D: "FF431407", F: "FF450a0a",
    };
    const GRADE_FONT_ARGB: Record<string, string> = {
      A: "FF34d399", B: "FF818cf8", C: "FFfbbf24", D: "FFfb923c", F: "FFf87171",
    };

    scored.sort((a, b) => b.alphaScore - a.alphaScore).forEach((wf, ri) => {
      const alt  = ri % 2 === 0;
      const bgArgb = alt ? "FFF8FAFC" : "FFFFFFFF";
      const row  = ws.getRow(ri + 3);

      const vals = [
        wf.name,
        wf.platform === "n8n" ? "n8n" : "Make.com",
        wf.active ? "Yes" : "No",
        wf.grade,
        wf.alphaScore,
        wf.pillars.reliability,
        wf.pillars.throughput,
        wf.pillars.connectivity,
        wf.pillars.criticality,
        riskScore(wf),
        wf.metrics.reliability.failed,
        wf.metrics.reliability.done,
        wf.metrics.reliability.failed,
        wf.metrics.reliability.total,
        wf.metrics.throughput.outcomeEvents,
        wf.metrics.throughput.processEvents,
        wf.appsUsed.join(", "),
        wf.metrics.connectivity.highValueApps.join(", "),
      ];

      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.font  = { size: 10, name: "Calibri" };
        cell.alignment = { vertical: "middle" };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right:  { style: "thin", color: { argb: "FFE2E8F0" } },
        };

        // Grade cell — colour-coded
        if (ci === 3) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRADE_ARGB[wf.grade] ?? "FF450a0a" } };
          cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: GRADE_FONT_ARGB[wf.grade] ?? "FFf87171" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
        // Alpha Score — bold
        else if (ci === 4) {
          cell.font = { bold: true, size: 11, name: "Calibri",
            color: { argb: GRADE_FONT_ARGB[wf.grade] ?? "FFf87171" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: alt ? "FFF8FAFC" : "FFFFFFFF" } };
        }
        // Leakage risk — colour-coded
        else if (ci === 9) {
          const risk = riskScore(wf);
          const riskArgb = risk === 0 ? "FF1e293b" : risk <= 33 ? "FFd1fae5" : risk <= 66 ? "FFFEF3C7" : "FFFEE2E2";
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: riskArgb } };
          cell.font = { bold: risk > 0, size: 10, name: "Calibri" };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
        // Failed executions — red if > 0
        else if (ci === 10) {
          const failed = wf.metrics.reliability.failed;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: failed > 0 ? "FFFEE2E2" : (alt ? "FFF8FAFC" : "FFFFFFFF") } };
          if (failed > 0) cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FFdc2626" } };
        }
        else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
        }
      });

      row.height = 20;
    });

    // Auto-filter on header row
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };

    // Stream to response
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="gtm-compare-${date}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("[workflow-score/export-xlsx]", err);
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
});

export default router;
