/**
 * benchmarkService.ts
 *
 * Computes anonymized industry-level conversion rate benchmarks.
 *
 * Groups workspaces by Workspace.industry, computes per-event conversion rates
 * for each workspace, then returns p25/median/p75 percentiles for comparison.
 *
 * Privacy: only aggregate statistics are returned — no workspace IDs or names.
 * Benchmarks are only meaningful with ≥ 5 workspaces per industry bucket.
 *
 * Pure functions (percentile computation) exported for unit testing.
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkBand {
  p25:    number;
  median: number;
  p75:    number;
  sample: number;   // number of workspaces in this bucket
}

export interface EventBenchmark {
  eventType:   string;
  label:       string;
  yourRate:    number | null;   // current workspace's rate (null if no data)
  percentile:  number | null;   // 0–100: where current workspace sits in distribution
  industry:    BenchmarkBand;
  global:      BenchmarkBand;
}

export interface BenchmarkResult {
  industry:     string;
  generatedAt:  string;
  metrics:      EventBenchmark[];
}

// ─── Pure statistics ──────────────────────────────────────────────────────────

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function computePercentileRank(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 50;
  const below = sortedAsc.filter(v => v < value).length;
  return Math.round((below / sortedAsc.length) * 100);
}

export function buildBand(rates: number[]): BenchmarkBand {
  const sorted = [...rates].sort((a, b) => a - b);
  return {
    p25:    Math.round(percentile(sorted, 25) * 10) / 10,
    median: Math.round(percentile(sorted, 50) * 10) / 10,
    p75:    Math.round(percentile(sorted, 75) * 10) / 10,
    sample: sorted.length,
  };
}

// ─── DB query ─────────────────────────────────────────────────────────────────

const TRACKED_EVENTS = [
  { eventType: "email_sent",         label: "Emails sent per lead" },
  { eventType: "reply_received",     label: "Reply rate" },
  { eventType: "meeting_booked",     label: "Meeting rate" },
  { eventType: "deal_created",       label: "Deal creation rate" },
  { eventType: "deal_won",           label: "Win rate" },
  { eventType: "connection_accepted",label: "LinkedIn acceptance rate" },
];

const MIN_WORKSPACES = 3;  // minimum workspaces per industry for benchmarks

export async function getBenchmarks(workspaceId: string): Promise<BenchmarkResult> {
  // Get current workspace industry
  const ws = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { industry: true },
  });
  const industry = ws?.industry ?? "SaaS";

  // Get all workspaces for industry + global comparison
  const allWorkspaces = await prisma.workspace.findMany({
    where:  { isDemo: false },
    select: { id: true, industry: true },
  });

  const industryWsIds = allWorkspaces.filter(w => w.industry === industry).map(w => w.id);
  const allWsIds      = allWorkspaces.map(w => w.id);

  // Per-workspace per-event counts (using LeadActivitySummary + Touchpoint grouping)
  // Use Touchpoint counts grouped by workspaceId+eventType as proxy for rates
  const touchRows = await prisma.touchpoint.groupBy({
    by:    ["workspaceId", "eventType"],
    where: { eventType: { in: TRACKED_EVENTS.map(e => e.eventType) } },
    _count: { id: true },
  });

  // Lead counts per workspace for denominator
  const leadCounts = await prisma.leadActivitySummary.groupBy({
    by:    ["workspaceId"],
    _count: { iqLeadId: true },
  });

  const leadCountMap: Record<string, number> = {};
  for (const r of leadCounts) leadCountMap[r.workspaceId] = r._count.iqLeadId;

  // Build rates: eventType → workspaceId → rate (events / leads * 100)
  const ratesByEvent: Record<string, Record<string, number>> = {};
  for (const row of touchRows) {
    const leads = leadCountMap[row.workspaceId];
    if (!leads || leads < 5) continue;  // skip workspaces with too few leads
    const rate = Math.round((row._count.id / leads) * 1000) / 10;
    if (!ratesByEvent[row.eventType]) ratesByEvent[row.eventType] = {};
    ratesByEvent[row.eventType][row.workspaceId] = rate;
  }

  const metrics: EventBenchmark[] = TRACKED_EVENTS.map(({ eventType, label }) => {
    const byWs      = ratesByEvent[eventType] ?? {};
    const yourRate  = byWs[workspaceId] ?? null;

    const industryRates = industryWsIds.map(id => byWs[id]).filter(v => v !== undefined) as number[];
    const globalRates   = allWsIds.map(id => byWs[id]).filter(v => v !== undefined) as number[];

    const industryBand = industryRates.length >= MIN_WORKSPACES
      ? buildBand(industryRates)
      : buildBand(globalRates);   // fall back to global if not enough industry peers

    const globalBand  = buildBand(globalRates);

    const pctRank = yourRate !== null && globalRates.length > 0
      ? computePercentileRank(yourRate, [...globalRates].sort((a, b) => a - b))
      : null;

    return {
      eventType,
      label,
      yourRate,
      percentile:  pctRank,
      industry:    industryBand,
      global:      globalBand,
    };
  });

  return {
    industry,
    generatedAt: new Date().toISOString(),
    metrics,
  };
}
