/**
 * revenueAttributionService.ts
 *
 * Computes revenue attribution per n8n workflow (and Make scenario).
 *
 * Two attribution models returned side-by-side:
 *
 *   last_touch  — 100% credit to the workflow whose ID is on Outcome.workflowId
 *                 (the last workflow that touched the lead before the outcome).
 *
 *   linear      — value split equally across all distinct workflows that had at
 *                 least one Touchpoint for that lead before the Outcome.recordedAt.
 *                 When no prior touchpoints exist, falls back to last-touch.
 *
 * Only Outcomes of type "deal_won" or "deal_created" with a non-null value
 * are counted toward revenue. Meetings and replies are counted separately
 * for context (as activity metrics, not revenue).
 *
 * Workflows with touchpoints but zero attributed revenue are included so
 * Claude can see the full picture ("this workflow touched 40 leads but
 * none converted to pipeline yet").
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowAttribution {
  workflowId:   string;     // n8nId / makeId as stored on Touchpoint/Outcome
  workflowName: string;     // resolved from N8nWorkflowMeta / MakeScenarioMeta
  platform:     "n8n" | "make" | "direct" | "unknown";
  currency:     string;

  // Last-touch model
  lastTouch: {
    wonRevenue:  number;
    pipeline:    number;    // sum of all deal_created + deal_won values
    wonCount:    number;
    dealCount:   number;    // deal_created + deal_won
  };

  // Linear multi-touch model
  linear: {
    wonRevenue:  number;
    pipeline:    number;
    wonCount:    number;    // fractional — sum of 1/n shares
    dealCount:   number;
  };

  // Activity (not revenue)
  touchCount:   number;     // total Touchpoints from this workflow
  uniqueLeads:  number;     // distinct iqLeadIds touched
  meetings:     number;     // Outcome.type = "meeting_booked" attributed here
  replies:      number;     // Outcome.type = "reply_received" attributed here
  avgDealValue: number;     // last-touch won deals only, 0 if none
}

export interface RevenueAttributionResult {
  windowDays:       number;
  totalWonRevenue:  number;    // sum across all workflows, last-touch model
  totalPipeline:    number;
  totalWonDeals:    number;
  currency:         string;
  workflows:        WorkflowAttribution[];
  generatedAt:      string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getRevenueAttribution(
  workspaceId: string,
  windowDays   = 90,
): Promise<RevenueAttributionResult> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // ── 1. Fetch all revenue-bearing outcomes ──────────────────────────────────
  const outcomes = await prisma.outcome.findMany({
    where: {
      workspaceId,
      type:       { in: ["deal_won", "deal_created"] },
      value:      { not: null },
      recordedAt: { gte: since },
    },
    select: {
      id:         true,
      iqLeadId:   true,
      type:       true,
      value:      true,
      currency:   true,
      workflowId: true,
      recordedAt: true,
    },
  });

  // ── 2. Fetch activity outcomes (meetings, replies) for context ─────────────
  const activityOutcomes = await prisma.outcome.findMany({
    where: {
      workspaceId,
      type:       { in: ["meeting_booked", "reply_received"] },
      workflowId: { not: null },
      recordedAt: { gte: since },
    },
    select: { type: true, workflowId: true },
  });

  // ── 3. For each revenue outcome, collect all prior workflow touchpoints ─────
  // This powers the linear model.
  // Batched: one query per outcome would be too slow at scale.
  // Instead: fetch all touchpoints in window for the involved iqLeadIds,
  // then join in-memory.
  const iqLeadIds = [...new Set(outcomes.map(o => o.iqLeadId))];

  const touchpoints = iqLeadIds.length > 0
    ? await prisma.touchpoint.findMany({
        where: {
          workspaceId,
          iqLeadId:   { in: iqLeadIds },
          workflowId: { not: null },
          recordedAt: { gte: since },
        },
        select: {
          iqLeadId:   true,
          workflowId: true,
          recordedAt: true,
        },
      })
    : [];

  // Index touchpoints by iqLeadId for fast lookup
  const tpByLead = new Map<string, Array<{ workflowId: string; recordedAt: Date }>>();
  for (const tp of touchpoints) {
    if (!tp.workflowId) continue;
    if (!tpByLead.has(tp.iqLeadId)) tpByLead.set(tp.iqLeadId, []);
    tpByLead.get(tp.iqLeadId)!.push({ workflowId: tp.workflowId, recordedAt: tp.recordedAt });
  }

  // ── 4. Fetch all touchpoints (all leads) for activity metrics ─────────────
  const allTouchpoints = await prisma.touchpoint.findMany({
    where: {
      workspaceId,
      workflowId: { not: null },
      recordedAt: { gte: since },
    },
    select: { iqLeadId: true, workflowId: true },
  });

  // ── 5. Resolve workflow names ──────────────────────────────────────────────
  // Collect all workflowIds that appear in outcomes or touchpoints
  const allWorkflowIds = new Set<string>();
  for (const o of outcomes)        if (o.workflowId)  allWorkflowIds.add(o.workflowId);
  for (const tp of allTouchpoints) if (tp.workflowId) allWorkflowIds.add(tp.workflowId);

  const [n8nMeta, makeMeta] = await Promise.all([
    prisma.n8nWorkflowMeta.findMany({
      where:  { workspaceId, n8nId: { in: [...allWorkflowIds] } },
      select: { n8nId: true, name: true },
    }),
    prisma.makeScenarioMeta.findMany({
      where:  { workspaceId, makeId: { in: [...allWorkflowIds] } },
      select: { makeId: true, name: true },
    }),
  ]);

  const nameMap  = new Map<string, string>();
  const platMap  = new Map<string, "n8n" | "make">();
  for (const w of n8nMeta)  { nameMap.set(w.n8nId,  w.name); platMap.set(w.n8nId,  "n8n"); }
  for (const w of makeMeta) { nameMap.set(w.makeId, w.name); platMap.set(w.makeId, "make"); }

  // ── 6. Build per-workflow accumulators ─────────────────────────────────────
  interface Acc {
    lt_wonRevenue:  number;
    lt_pipeline:    number;
    lt_wonCount:    number;
    lt_dealCount:   number;
    li_wonRevenue:  number;
    li_pipeline:    number;
    li_wonCount:    number;
    li_dealCount:   number;
    touchCount:     number;
    uniqueLeads:    Set<string>;
    meetings:       number;
    replies:        number;
    wonValues:      number[];   // for avgDealValue
    currency:       string;
  }

  const accs = new Map<string, Acc>();

  function getAcc(wfId: string): Acc {
    if (!accs.has(wfId)) {
      accs.set(wfId, {
        lt_wonRevenue: 0, lt_pipeline: 0, lt_wonCount: 0, lt_dealCount: 0,
        li_wonRevenue: 0, li_pipeline: 0, li_wonCount: 0, li_dealCount: 0,
        touchCount: 0, uniqueLeads: new Set(), meetings: 0, replies: 0,
        wonValues: [], currency: "EUR",
      });
    }
    return accs.get(wfId)!;
  }

  // ── 6a. Last-touch model ───────────────────────────────────────────────────
  for (const o of outcomes) {
    if (!o.workflowId || o.value == null) continue;
    const acc      = getAcc(o.workflowId);
    const isWon    = o.type === "deal_won";
    acc.currency   = o.currency ?? "EUR";
    acc.lt_pipeline += o.value;
    acc.lt_dealCount++;
    if (isWon) {
      acc.lt_wonRevenue += o.value;
      acc.lt_wonCount++;
      acc.wonValues.push(o.value);
    }
  }

  // ── 6b. Linear multi-touch model ──────────────────────────────────────────
  for (const o of outcomes) {
    if (o.value == null) continue;

    // Find all distinct workflows that touched this lead before this outcome
    const priorTps = (tpByLead.get(o.iqLeadId) ?? [])
      .filter(tp => tp.recordedAt <= o.recordedAt);

    const distinctWorkflows = [...new Set(priorTps.map(tp => tp.workflowId))];

    // If no prior workflow touchpoints, fall back to last-touch workflow
    const workflows = distinctWorkflows.length > 0
      ? distinctWorkflows
      : (o.workflowId ? [o.workflowId] : []);

    if (workflows.length === 0) continue;

    const share  = o.value / workflows.length;
    const isWon  = o.type === "deal_won";

    for (const wfId of workflows) {
      const acc = getAcc(wfId);
      acc.currency   = o.currency ?? acc.currency;
      acc.li_pipeline  += share;
      acc.li_dealCount += 1 / workflows.length;
      if (isWon) {
        acc.li_wonRevenue += share;
        acc.li_wonCount   += 1 / workflows.length;
      }
    }
  }

  // ── 6c. Touch counts and unique leads ─────────────────────────────────────
  for (const tp of allTouchpoints) {
    if (!tp.workflowId) continue;
    const acc = getAcc(tp.workflowId);
    acc.touchCount++;
    acc.uniqueLeads.add(tp.iqLeadId);
  }

  // ── 6d. Activity outcomes ─────────────────────────────────────────────────
  for (const o of activityOutcomes) {
    if (!o.workflowId) continue;
    const acc = getAcc(o.workflowId);
    if (o.type === "meeting_booked")  acc.meetings++;
    if (o.type === "reply_received")  acc.replies++;
  }

  // ── 7. Assemble result ────────────────────────────────────────────────────
  const workflows: WorkflowAttribution[] = [...accs.entries()].map(([wfId, acc]) => ({
    workflowId:   wfId,
    workflowName: nameMap.get(wfId) ?? `Workflow ${wfId}`,
    platform:     platMap.get(wfId) ?? "unknown",
    currency:     acc.currency,

    lastTouch: {
      wonRevenue: round2(acc.lt_wonRevenue),
      pipeline:   round2(acc.lt_pipeline),
      wonCount:   acc.lt_wonCount,
      dealCount:  acc.lt_dealCount,
    },

    linear: {
      wonRevenue: round2(acc.li_wonRevenue),
      pipeline:   round2(acc.li_pipeline),
      wonCount:   round2(acc.li_wonCount),
      dealCount:  round2(acc.li_dealCount),
    },

    touchCount:   acc.touchCount,
    uniqueLeads:  acc.uniqueLeads.size,
    meetings:     acc.meetings,
    replies:      acc.replies,
    avgDealValue: acc.wonValues.length > 0
      ? round2(acc.wonValues.reduce((s, v) => s + v, 0) / acc.wonValues.length)
      : 0,
  }));

  // Sort by last-touch won revenue descending, then pipeline descending
  workflows.sort((a, b) =>
    b.lastTouch.wonRevenue - a.lastTouch.wonRevenue ||
    b.lastTouch.pipeline   - a.lastTouch.pipeline
  );

  // Totals from last-touch model (avoids double-counting)
  const totalWonRevenue = round2(workflows.reduce((s, w) => s + w.lastTouch.wonRevenue, 0));
  const totalPipeline   = round2(workflows.reduce((s, w) => s + w.lastTouch.pipeline, 0));
  const totalWonDeals   = workflows.reduce((s, w) => s + w.lastTouch.wonCount, 0);
  const currency        = workflows[0]?.currency ?? "EUR";

  return {
    windowDays,
    totalWonRevenue,
    totalPipeline,
    totalWonDeals,
    currency,
    workflows,
    generatedAt: new Date().toISOString(),
  };
}
