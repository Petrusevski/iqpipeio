/**
 * workflowScoreService.ts
 *
 * Shared scoring engine for GTM Alpha Score.
 * Used by:
 *   - /api/workflow-score route (HTTP Compare UI)
 *   - MCP compare_workflows tool (agent queries)
 *
 * Exports:
 *   scoreWorkflows()       — pure scoring function (no DB)
 *   fetchAllWorkflowMetrics() — Prisma-backed metric fetch
 *   enrichWithBranches()   — attach branch defs + channel conversion
 *   Types: ScoredWorkflow, BranchSummary, WorkflowMetrics, PillarWeights
 */

import { prisma } from "../db";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CRITICALITY_WEIGHTS: Record<string, number> = {
  deal_won:               1.00,
  deal_created:           0.85,
  meeting_booked:         0.75,
  reply_received:         0.60,
  crm_updated:            0.50,
  contacted:              0.45,
  email_sent:             0.35,
  linkedin_message_sent:  0.35,
  enriched:               0.25,
  unknown:                0.10,
};

export const CONVERSION_PROBABILITIES: Record<string, number> = {
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

export const HIGH_VALUE_APP_PATTERNS = [
  "hubspot", "salesforce", "pipedrive", "close", "attio",
  "clay", "clearbit", "apollo", "hunter", "lusha",
  "outreach", "salesloft", "lemlist", "reply",
  "linkedin", "heyreach", "expandi",
  "stripe", "chargebee", "recurly",
];

export const PILLAR_WEIGHTS: PillarWeights = {
  reliability:  0.30,
  throughput:   0.25,
  connectivity: 0.20,
  criticality:  0.25,
};

const CHANNEL_ENTRY_EVENTS = new Set([
  "email_sent", "sequence_started", "message_sent",
  "connection_sent", "connection_request_sent", "inmail_sent",
  "sms_sent", "whatsapp_sent", "call_initiated",
]);

const CHANNEL_POSITIVE_EVENTS = new Set([
  "reply_received", "positive_reply", "interested_reply", "inmail_replied",
  "connection_accepted", "meeting_booked", "demo_completed",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PillarWeights {
  reliability:  number;
  throughput:   number;
  connectivity: number;
  criticality:  number;
}

export interface WorkflowMetrics {
  workflowId:      string;
  name:            string;
  platform:        "n8n" | "make";
  active:          boolean;
  triggerType:     string;
  appsUsed:        string[];
  nodeCount:       number;
  totalEvents:     number;
  done:            number;
  failed:          number;
  pending:         number;
  outcomeEvents:   number;
  processEvents:   number;
  failedByType:    Record<string, number>;
  countByType:     Record<string, number>;
  lastEventAt:     string | null;
}

export interface BranchSummary {
  port:             number;
  label:            string;
  channel:          string;
  conditionSummary: string | null;
  downstreamApps:   string[];
  leadsEntered:     number;
  leadsWithOutcome: number;
  conversionRate:   number;
}

export interface ScoredWorkflow {
  id:          string;
  name:        string;
  platform:    "n8n" | "make";
  active:      boolean;
  triggerType: string;
  appsUsed:    string[];
  nodeCount:   number;
  metrics: {
    reliability:  { done: number; failed: number; total: number; rawScore: number };
    throughput:   { outcomeEvents: number; processEvents: number; outcomeRate: number; rawScore: number };
    connectivity: { appCount: number; highValueApps: string[]; rawScore: number };
    criticality:  { eventBreakdown: Record<string, number>; rawScore: number };
  };
  pillars: {
    reliability:  number;
    throughput:   number;
    connectivity: number;
    criticality:  number;
  };
  alphaScore:  number;
  grade:       string;
  leakage: {
    totalLoss: number;
    currency:  string;
    breakdown: { eventType: string; failedCount: number; conversionProb: number; estimatedLoss: number }[];
  };
  lastEventAt: string | null;
  branches:    BranchSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function periodStart(period: string): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function scoreGrade(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function norm(val: number, max: number): number {
  return max > 0 ? Math.min(1, val / max) : 0;
}

// ─── DB fetchers ──────────────────────────────────────────────────────────────

async function fetchN8nWorkflowMetrics(
  workspaceId: string,
  workflowN8nIds: string[],
  since: Date | null,
): Promise<WorkflowMetrics[]> {
  const dateFilter = since ? { createdAt: { gte: since } } : {};

  const metas = await prisma.n8nWorkflowMeta.findMany({
    where:  { workspaceId, n8nId: { in: workflowN8nIds } },
    select: { n8nId: true, name: true, active: true, triggerType: true, appsUsed: true, nodeCount: true },
  });
  const metaMap = Object.fromEntries(metas.map(m => [m.n8nId, m]));

  return Promise.all(workflowN8nIds.map(async (wfId) => {
    const wfFilter = { workspaceId, workflowId: wfId, ...dateFilter };
    const meta = metaMap[wfId];

    const [statusGroups, classGroups, typeGroups, failedTypeGroups, lastEvent] = await Promise.all([
      prisma.n8nQueuedEvent.groupBy({ by: ["status"],     where: wfFilter, _count: { id: true } }),
      prisma.n8nQueuedEvent.groupBy({ by: ["eventClass"], where: wfFilter, _count: { id: true } }),
      prisma.n8nQueuedEvent.groupBy({ by: ["eventType"],  where: wfFilter, _count: { id: true } }),
      prisma.n8nQueuedEvent.groupBy({ by: ["eventType"],  where: { ...wfFilter, status: "failed" }, _count: { id: true } }),
      prisma.n8nQueuedEvent.findFirst({ where: wfFilter, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    const statusMap    = Object.fromEntries(statusGroups.map(s => [s.status,                   s._count.id]));
    const classMap     = Object.fromEntries(classGroups.map(c => [c.eventClass ?? "unknown",   c._count.id]));
    const countByType  = Object.fromEntries(typeGroups.map(t => [t.eventType,                  t._count.id]));
    const failedByType = Object.fromEntries(failedTypeGroups.map(t => [t.eventType,            t._count.id]));

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
      totalEvents:   Object.values(statusMap).reduce((a, b) => a + b, 0),
      done:          statusMap.done    ?? 0,
      failed:        statusMap.failed  ?? 0,
      pending:       statusMap.pending ?? 0,
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
): Promise<WorkflowMetrics[]> {
  const metas = await prisma.makeScenarioMeta.findMany({
    where:  { workspaceId, makeId: { in: scenarioMakeIds } },
    select: { makeId: true, name: true, active: true, triggerType: true, appsUsed: true, moduleCount: true, eventFilter: true },
  });

  return metas.map((m) => {
    let appsUsed: string[] = [];
    try { appsUsed = JSON.parse(m.appsUsed ?? "[]"); } catch { appsUsed = []; }

    let configuredEventTypes: string[] = [];
    try {
      const ef = m.eventFilter ? JSON.parse(m.eventFilter) : null;
      configuredEventTypes = ef?.eventTypes ?? [];
    } catch { configuredEventTypes = []; }

    const countByType = Object.fromEntries(configuredEventTypes.map(t => [t, 1]));

    return {
      workflowId:    m.makeId,
      name:          m.name,
      platform:      "make" as const,
      active:        m.active,
      triggerType:   m.triggerType,
      appsUsed,
      nodeCount:     m.moduleCount,
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

/**
 * Fetch workflow metrics for ALL workflows in the workspace (or a filtered subset).
 */
export async function fetchAllWorkflowMetrics(
  workspaceId: string,
  opts: { ids?: string[]; platform?: "n8n" | "make" | "all"; since?: Date | null },
): Promise<WorkflowMetrics[]> {
  const platform = opts.platform ?? "all";
  const since    = opts.since ?? null;
  const ids      = opts.ids ?? [];

  let n8nIds: string[]  = [];
  let makeIds: string[] = [];

  if (platform === "n8n" || platform === "all") {
    const metas = await prisma.n8nWorkflowMeta.findMany({
      where:  { workspaceId, ...(ids.length ? { n8nId: { in: ids } } : {}) },
      select: { n8nId: true },
    });
    n8nIds = metas.map(m => m.n8nId);
  }

  if (platform === "make" || platform === "all") {
    const metas = await prisma.makeScenarioMeta.findMany({
      where:  { workspaceId, ...(ids.length ? { makeId: { in: ids } } : {}) },
      select: { makeId: true },
    });
    makeIds = metas.map(m => m.makeId);
  }

  const [n8nMetrics, makeMetrics] = await Promise.all([
    n8nIds.length  > 0 ? fetchN8nWorkflowMetrics(workspaceId, n8nIds, since)  : Promise.resolve([] as WorkflowMetrics[]),
    makeIds.length > 0 ? fetchMakeScenarioMetrics(workspaceId, makeIds)        : Promise.resolve([] as WorkflowMetrics[]),
  ]);

  return [...n8nMetrics, ...makeMetrics];
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

export function scoreWorkflows(
  metrics: WorkflowMetrics[],
  acv: number,
  currency: string,
  weights: PillarWeights = PILLAR_WEIGHTS,
): ScoredWorkflow[] {
  if (metrics.length === 0) return [];

  const maxTotal       = Math.max(...metrics.map(m => m.totalEvents), 1);
  const maxOutcomeRate = Math.max(
    ...metrics.map(m => m.outcomeEvents / Math.max(1, m.totalEvents)), 0.001,
  );
  const maxApps = Math.max(...metrics.map(m => m.appsUsed.length), 1);

  const critRaw = metrics.map(m => {
    const total = Math.max(1, m.totalEvents || Object.values(m.countByType).reduce((a, b) => a + b, 0));
    return Object.entries(m.countByType).reduce((sum, [type, count]) => {
      return sum + (CRITICALITY_WEIGHTS[type] ?? CRITICALITY_WEIGHTS.unknown) * (count / total);
    }, 0);
  });
  const maxCrit = Math.max(...critRaw, 0.001);

  return metrics.map((m, i) => {
    const total       = Math.max(1, m.totalEvents);
    const successRate = m.done / total;
    const outcomeRate = m.outcomeEvents / total;

    const reliabilityRaw = successRate;
    const throughputRaw  =
      norm(outcomeRate, maxOutcomeRate) * 0.60 +
      norm(m.totalEvents, maxTotal) * 0.40;

    const highValueApps = m.appsUsed.filter(a =>
      HIGH_VALUE_APP_PATTERNS.some(p => a.toLowerCase().includes(p)),
    );
    const connectRaw = Math.min(1, norm(m.appsUsed.length, maxApps) + Math.min(0.20, highValueApps.length * 0.05));
    const critNorm   = critRaw[i] / maxCrit;

    const alpha = Math.round(
      reliabilityRaw * weights.reliability   * 100 +
      throughputRaw  * weights.throughput    * 100 +
      connectRaw     * weights.connectivity  * 100 +
      critNorm       * weights.criticality   * 100,
    );

    const leakageBreakdown = Object.entries(m.failedByType).map(([type, failedCount]) => {
      const prob = CONVERSION_PROBABILITIES[type] ?? CONVERSION_PROBABILITIES.unknown;
      return { eventType: type, failedCount, conversionProb: prob, estimatedLoss: Math.round(failedCount * prob * acv) };
    });

    return {
      id:          m.workflowId,
      name:        m.name,
      platform:    m.platform,
      active:      m.active,
      triggerType: m.triggerType,
      appsUsed:    m.appsUsed,
      nodeCount:   m.nodeCount,
      metrics: {
        reliability:  { done: m.done, failed: m.failed, total: m.totalEvents, rawScore: Math.round(reliabilityRaw * 100) },
        throughput:   { outcomeEvents: m.outcomeEvents, processEvents: m.processEvents, outcomeRate: parseFloat(outcomeRate.toFixed(4)), rawScore: Math.round(throughputRaw * 100) },
        connectivity: { appCount: m.appsUsed.length, highValueApps, rawScore: Math.round(connectRaw * 100) },
        criticality:  { eventBreakdown: m.countByType, rawScore: Math.round(critNorm * 100) },
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
        totalLoss: leakageBreakdown.reduce((s, b) => s + b.estimatedLoss, 0),
        currency,
        breakdown: leakageBreakdown.sort((a, b) => b.estimatedLoss - a.estimatedLoss),
      },
      lastEventAt: m.lastEventAt,
      branches:    [],
    };
  });
}

// ─── Branch enrichment ────────────────────────────────────────────────────────

export async function enrichWithBranches(
  workspaceId: string,
  scored: ScoredWorkflow[],
): Promise<ScoredWorkflow[]> {
  if (scored.length === 0) return scored;

  const nativeIds = scored.map(w => w.id);
  const allBranchDefs = await prisma.workflowBranchDef.findMany({
    where:   { workspaceId, nativeWorkflowId: { in: nativeIds } },
    orderBy: [{ nativeWorkflowId: "asc" }, { branchPort: "asc" }],
  });

  if (allBranchDefs.length === 0) return scored.map(w => ({ ...w, branches: [] }));

  const allToolSlugs = new Set<string>();
  for (const b of allBranchDefs) {
    const apps: string[] = JSON.parse(b.downstreamApps ?? "[]");
    for (const a of apps) allToolSlugs.add(a.toLowerCase());
  }

  const metrics = await prisma.outreachMetric.findMany({
    where:  { workspaceId, tool: { in: [...allToolSlugs], mode: "insensitive" } },
    select: { leadId: true, tool: true, eventType: true },
  });

  const toolStats = new Map<string, { entered: Set<string>; outcome: Set<string> }>();
  for (const m of metrics) {
    const slug = m.tool.toLowerCase();
    if (!toolStats.has(slug)) toolStats.set(slug, { entered: new Set(), outcome: new Set() });
    const s = toolStats.get(slug)!;
    if (CHANNEL_ENTRY_EVENTS.has(m.eventType))    s.entered.add(m.leadId);
    if (CHANNEL_POSITIVE_EVENTS.has(m.eventType)) s.outcome.add(m.leadId);
  }

  const branchMap = new Map<string, BranchSummary[]>();
  for (const b of allBranchDefs) {
    if (!branchMap.has(b.nativeWorkflowId)) branchMap.set(b.nativeWorkflowId, []);

    const apps: string[] = JSON.parse(b.downstreamApps ?? "[]");
    let entered = 0, outcome = 0;
    for (const app of apps) {
      const s = toolStats.get(app.toLowerCase());
      if (s) { entered += s.entered.size; outcome += s.outcome.size; }
    }
    outcome = Math.min(outcome, entered);

    branchMap.get(b.nativeWorkflowId)!.push({
      port:             b.branchPort,
      label:            b.branchLabel,
      channel:          b.primaryChannel,
      conditionSummary: b.conditionSummary,
      downstreamApps:   apps,
      leadsEntered:     entered,
      leadsWithOutcome: outcome,
      conversionRate:   entered > 0 ? Math.round((outcome / entered) * 1000) / 10 : 0,
    });
  }

  return scored.map(w => ({ ...w, branches: branchMap.get(w.id) ?? [] }));
}
