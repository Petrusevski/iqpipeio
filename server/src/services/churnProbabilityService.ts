/**
 * churnProbabilityService.ts
 *
 * Estimates the probability that a lead at a given funnel stage will NOT convert
 * (i.e. churn) based on the workspace's own historical conversion data.
 *
 * Method:
 *   For each funnel stage, compute: P(churn | stage) = 1 - P(advance | stage)
 *
 *   P(advance | stage) = leads that reached stage+1 / leads that reached stage
 *
 *   When workspace data is insufficient (< MIN_SAMPLE), falls back to
 *   industry-average priors derived from CONVERSION_PROBABILITIES in
 *   workflowScoreService.ts.
 *
 * Pure functions exported for unit testing.
 */

import { prisma } from "../db";

// ─── Industry-average fallback priors (source: workflowScoreService) ─────────

// P(eventually winning) given current stage — based on observed B2B SaaS rates
const PRIOR_WIN_PROBABILITY: Record<string, number> = {
  imported:  0.005,
  enriched:  0.008,
  contacted: 0.015,
  engaged:   0.06,
  replied:   0.15,
  meeting:   0.35,
  won:       1.00,
};

export const MIN_SAMPLE = 20;

// ─── Pure functions ───────────────────────────────────────────────────────────

export function churnFromWinProbability(winProb: number): number {
  return Math.round((1 - winProb) * 1000) / 1000;
}

/**
 * Given stage counts, compute per-stage advance rates.
 * stageCounts: ordered array of { stage, count } from most to least advanced.
 */
export function computeAdvanceRates(
  stageCounts: Record<string, number>,
): Record<string, number> {
  const STAGES = ["imported", "enriched", "contacted", "engaged", "replied", "meeting", "won"];
  const rates: Record<string, number> = {};

  for (let i = 0; i < STAGES.length - 1; i++) {
    const current = stageCounts[STAGES[i]] ?? 0;
    const next    = stageCounts[STAGES[i + 1]] ?? 0;
    rates[STAGES[i]] = current > MIN_SAMPLE
      ? Math.min(1, next / current)
      : PRIOR_WIN_PROBABILITY[STAGES[i + 1]] ?? 0.01;
  }
  rates["won"] = 1;
  return rates;
}

/**
 * Convert advance rates to win probabilities (compound forward).
 * P(win | stage) = product of advance rates from stage to won.
 */
export function computeWinProbabilities(
  advanceRates: Record<string, number>,
): Record<string, number> {
  const STAGES = ["imported", "enriched", "contacted", "engaged", "replied", "meeting", "won"];
  const winProb: Record<string, number> = { won: 1 };

  for (let i = STAGES.length - 2; i >= 0; i--) {
    const stage = STAGES[i];
    const next  = STAGES[i + 1];
    winProb[stage] = (advanceRates[stage] ?? 0) * (winProb[next] ?? 0);
  }

  return winProb;
}

// ─── DB query ─────────────────────────────────────────────────────────────────

export interface WorkspaceChurnRates {
  source:      "workspace_data" | "industry_prior";
  sampleSize:  number;
  churnByStage: Record<string, number>;   // stage → P(churn)
  winByStage:   Record<string, number>;   // stage → P(win)
}

export async function getWorkspaceChurnRates(
  workspaceId: string,
): Promise<WorkspaceChurnRates> {
  // Count leads per funnel stage
  const rows = await prisma.leadActivitySummary.groupBy({
    by:    ["funnelStage"],
    where: { workspaceId },
    _count: { iqLeadId: true },
  });

  const stageCounts: Record<string, number> = {};
  let totalSample = 0;
  for (const r of rows) {
    stageCounts[r.funnelStage] = r._count.iqLeadId;
    totalSample += r._count.iqLeadId;
  }

  const hasSufficientData = totalSample >= MIN_SAMPLE * 3;
  const advanceRates = computeAdvanceRates(stageCounts);
  const winByStage   = computeWinProbabilities(advanceRates);

  const churnByStage: Record<string, number> = {};
  for (const [stage, prob] of Object.entries(winByStage)) {
    churnByStage[stage] = churnFromWinProbability(prob);
  }

  return {
    source:      hasSufficientData ? "workspace_data" : "industry_prior",
    sampleSize:  totalSample,
    churnByStage,
    winByStage: Object.fromEntries(
      Object.entries(winByStage).map(([k, v]) => [k, Math.round(v * 1000) / 1000])
    ),
  };
}

/**
 * Write churnProbability back to LeadActivitySummary for a batch of leads.
 * Called by the activitySummarizer full backfill.
 */
export async function backfillChurnProbabilities(workspaceId: string): Promise<number> {
  const rates = await getWorkspaceChurnRates(workspaceId);
  let updated = 0;

  const leads = await prisma.leadActivitySummary.findMany({
    where:  { workspaceId },
    select: { iqLeadId: true, funnelStage: true },
  });

  for (const lead of leads) {
    const prob = rates.churnByStage[lead.funnelStage] ?? null;
    await prisma.leadActivitySummary.update({
      where: { iqLeadId: lead.iqLeadId },
      data:  { churnProbability: prob } as any,
    });
    updated++;
  }

  return updated;
}
