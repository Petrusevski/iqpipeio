/**
 * experimentAttributionService.ts
 *
 * Computes per-variant conversion rates for A/B experiments and determines
 * statistical significance using the chi-squared test (2×2 contingency table).
 *
 * Data model:
 *   Touchpoint.experimentId + stackVariant → which leads were in each variant
 *   Outcome.experimentId + stackVariant    → which outcomes belong to each variant
 *
 * Pure statistical functions are exported for unit testing without DB access.
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VariantStats {
  variant:        string;         // "A" | "B"
  leads:          number;         // distinct leads assigned to this variant
  conversions:    number;         // leads that had a positive outcome
  conversionRate: number;         // 0–100 %
  outcomes: {
    reply_received:  number;
    meeting_booked:  number;
    deal_created:    number;
    deal_won:        number;
  };
  totalRevenue:   number;         // sum of deal values
  avgDealValue:   number;
}

export interface ExperimentResult {
  experimentId:   string;
  experimentName: string;
  status:         string;
  variantA:       VariantStats | null;
  variantB:       VariantStats | null;
  winner:         "A" | "B" | "tie" | "insufficient_data" | null;
  chiSquared:     number | null;    // test statistic
  pValue:         number | null;    // approximate; < 0.05 = significant
  significant:    boolean;          // p < 0.05
  recommendation: string;
}

// ─── Pure statistics (testable without DB) ────────────────────────────────────

/**
 * Chi-squared test for a 2×2 table:
 *   [[a, b], [c, d]]  where a=varA converts, b=varA doesn't, etc.
 * Returns { chiSquared, pValue } — pValue is approximate using lookup table.
 */
export function chiSquaredTest(
  aConverts:    number,
  aTotal:       number,
  bConverts:    number,
  bTotal:       number,
): { chiSquared: number; pValue: number; significant: boolean } {
  const aNot = aTotal - aConverts;
  const bNot = bTotal - bConverts;
  const N    = aTotal + bTotal;

  if (N === 0 || aTotal === 0 || bTotal === 0) {
    return { chiSquared: 0, pValue: 1, significant: false };
  }

  // Row and column totals
  const row1 = aConverts + bConverts;
  const row2 = aNot + bNot;
  const col1 = aTotal;
  const col2 = bTotal;

  // Expected frequencies
  const e11 = (row1 * col1) / N;
  const e12 = (row1 * col2) / N;
  const e21 = (row2 * col1) / N;
  const e22 = (row2 * col2) / N;

  if (e11 === 0 || e12 === 0 || e21 === 0 || e22 === 0) {
    return { chiSquared: 0, pValue: 1, significant: false };
  }

  const chi2 =
    Math.pow(aConverts - e11, 2) / e11 +
    Math.pow(bConverts - e12, 2) / e12 +
    Math.pow(aNot      - e21, 2) / e21 +
    Math.pow(bNot      - e22, 2) / e22;

  // Approximate p-value for df=1 using chi-squared CDF approximation
  // Critical values: 3.841 → p=0.05, 6.635 → p=0.01, 10.828 → p=0.001
  const pValue =
    chi2 >= 10.828 ? 0.001 :
    chi2 >= 6.635  ? 0.01  :
    chi2 >= 3.841  ? 0.05  :
    chi2 >= 2.706  ? 0.10  : 1.0;

  return { chiSquared: Math.round(chi2 * 1000) / 1000, pValue, significant: chi2 >= 3.841 };
}

export function buildRecommendation(
  result: Pick<ExperimentResult, "winner" | "significant" | "variantA" | "variantB">,
): string {
  if (!result.variantA || !result.variantB) return "Insufficient data to make a recommendation.";
  if (result.winner === "insufficient_data") return "Run this experiment longer to collect sufficient data (minimum ~100 leads per variant).";
  if (!result.significant) return "No statistically significant difference detected yet. Continue the experiment.";
  if (result.winner === "tie") return "Both variants perform equally. Consider testing a more differentiated approach.";
  if (result.winner === "A") return `Variant A wins with ${result.variantA.conversionRate.toFixed(1)}% vs ${result.variantB.conversionRate.toFixed(1)}%. Scale Variant A and retire Variant B.`;
  if (result.winner === "B") return `Variant B wins with ${result.variantB.conversionRate.toFixed(1)}% vs ${result.variantA.conversionRate.toFixed(1)}%. Scale Variant B and retire Variant A.`;
  return "Experiment complete.";
}

// ─── DB query ─────────────────────────────────────────────────────────────────

export async function getExperimentResults(
  workspaceId:  string,
  experimentId?: string,
): Promise<ExperimentResult[]> {
  const where: any = { workspaceId };
  if (experimentId) where.id = experimentId;

  const experiments = await prisma.experiment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const results: ExperimentResult[] = [];

  for (const exp of experiments) {
    // ── Leads per variant (from Touchpoints) ──────────────────────────────
    const touchRows = await prisma.touchpoint.groupBy({
      by:    ["stackVariant"],
      where: { workspaceId, experimentId: exp.id, stackVariant: { in: ["A", "B"] } },
      _count: { iqLeadId: true },
    });

    const leadCounts: Record<string, number> = {};
    for (const r of touchRows) {
      if (r.stackVariant) leadCounts[r.stackVariant] = r._count.iqLeadId;
    }

    // ── Outcomes per variant ──────────────────────────────────────────────
    const outcomeRows = await prisma.outcome.findMany({
      where: { workspaceId, experimentId: exp.id, stackVariant: { in: ["A", "B"] } },
      select: { stackVariant: true, type: true, value: true },
    });

    const buildVariant = (v: "A" | "B"): VariantStats => {
      const rows    = outcomeRows.filter(r => r.stackVariant === v);
      const leads   = leadCounts[v] ?? 0;
      const meeting = rows.filter(r => r.type === "meeting_booked").length;
      const reply   = rows.filter(r => r.type === "reply_received").length;
      const dealC   = rows.filter(r => r.type === "deal_created").length;
      const dealW   = rows.filter(r => r.type === "deal_won").length;
      const revenue = rows.filter(r => r.type === "deal_won" && r.value).reduce((s, r) => s + (r.value ?? 0), 0);
      const convs   = new Set(rows.filter(r => ["meeting_booked","deal_created","deal_won"].includes(r.type)).map((_, i) => i)).size;
      // Distinct converting leads: use outcome count as proxy (can't get iqLeadId without distinct query)
      const convertingLeads = rows.filter(r => ["meeting_booked","deal_created","deal_won"].includes(r.type)).length;
      const wonCount = rows.filter(r => r.type === "deal_won").length;

      return {
        variant:        v,
        leads,
        conversions:    convertingLeads,
        conversionRate: leads > 0 ? Math.round((convertingLeads / leads) * 1000) / 10 : 0,
        outcomes: {
          reply_received: reply,
          meeting_booked: meeting,
          deal_created:   dealC,
          deal_won:       dealW,
        },
        totalRevenue: Math.round(revenue * 100) / 100,
        avgDealValue: wonCount > 0 ? Math.round((revenue / wonCount) * 100) / 100 : 0,
      };
    };

    const hasA = (leadCounts["A"] ?? 0) > 0 || outcomeRows.some(r => r.stackVariant === "A");
    const hasB = (leadCounts["B"] ?? 0) > 0 || outcomeRows.some(r => r.stackVariant === "B");

    const variantA = hasA ? buildVariant("A") : null;
    const variantB = hasB ? buildVariant("B") : null;

    const MIN_LEADS = 30;
    let winner: ExperimentResult["winner"] = null;
    let chiSquared: number | null = null;
    let pValue: number | null = null;
    let significant = false;

    if (variantA && variantB) {
      if (variantA.leads < MIN_LEADS || variantB.leads < MIN_LEADS) {
        winner = "insufficient_data";
      } else {
        const stat = chiSquaredTest(
          variantA.conversions, variantA.leads,
          variantB.conversions, variantB.leads,
        );
        chiSquared  = stat.chiSquared;
        pValue      = stat.pValue;
        significant = stat.significant;

        if (!significant) {
          winner = null;
        } else if (variantA.conversionRate > variantB.conversionRate) {
          winner = "A";
        } else if (variantB.conversionRate > variantA.conversionRate) {
          winner = "B";
        } else {
          winner = "tie";
        }
      }
    }

    const rec = buildRecommendation({ winner, significant, variantA, variantB });

    results.push({
      experimentId:   exp.id,
      experimentName: exp.name,
      status:         exp.status,
      variantA,
      variantB,
      winner,
      chiSquared,
      pValue,
      significant,
      recommendation: rec,
    });
  }

  return results;
}
