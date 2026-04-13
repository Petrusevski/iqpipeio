/**
 * nextActionsService.ts
 *
 * Converts IQPipe's accumulated lead intelligence into a ranked list of
 * concrete actions Claude (or a human) should take right now.
 *
 * Data sources — all available without additional computation:
 *   LeadActivitySummary  — funnel stage, days since touch, enrichment age, silent flag
 *   IqLead               — displayName, company, title (for readable output)
 *   Outcome              — recent wins / meetings for context
 *
 * Scoring model (higher = more urgent):
 *   Base score from funnel stage position (meeting > replied > engaged > contacted > enriched > imported)
 *   + staleness bonus (longer since last touch = more urgent)
 *   + enrichment penalty (stale enrichment reduces confidence in acting)
 *   + silence emergency bonus (isSilent = near-irreversible loss)
 *
 * Action types:
 *   "close"          — meeting booked, hasn't heard back yet, push to close
 *   "follow_up"      — replied or engaged, no touch in 3+ days
 *   "re_engage"      — contacted but stalled for 7+ days, no reply
 *   "sequence_start" — imported + enriched, never contacted
 *   "enrich"         — imported but never enriched, can't act without data
 *   "rescue"         — silent for 7+ days with zero outreach (emergency)
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType =
  | "close"
  | "follow_up"
  | "re_engage"
  | "sequence_start"
  | "enrich"
  | "rescue";

export type Urgency = "critical" | "high" | "medium" | "low";

export interface NextAction {
  rank:          number;
  iqLeadId:      string;
  displayName:   string;
  company:       string | null;
  title:         string | null;
  // NOTE: email/phone/linkedin are intentionally omitted — PII must not flow
  // through the MCP layer (Claude API) per GDPR Art. 5(1)(c) data minimisation.
  // Use iqLeadId to reference the lead in subsequent action tool calls.
  action:        ActionType;
  urgency:       Urgency;
  reason:        string;           // 1–2 sentences for Claude to relay/act on
  context: {
    funnelStage:        string;
    daysSinceTouch:     number | null;
    enrichmentAgeDays:  number | null;
    touchCount30d:      number;
    lastTool:           string | null;
    icpScore:           number | null;   // 0–100; null = no ICP profile
    icpGrade:           string | null;   // "hot" | "warm" | "cold"
    churnProbability:   number | null;   // 0.0–1.0; null = insufficient data
  };
  score: number;   // raw numeric score — for transparency
}

export interface NextActionsResult {
  generatedAt:  string;
  totalLeads:   number;    // total leads in workspace (for context)
  returnedCount: number;
  actions:      NextAction[];
}

// ─── Scoring constants ────────────────────────────────────────────────────────

// Base urgency by funnel stage — higher stage = more valuable to act on fast
const STAGE_BASE: Record<string, number> = {
  meeting:   100,
  replied:    80,
  engaged:    60,
  contacted:  40,
  enriched:   20,
  imported:   10,
  won:         0,   // won leads excluded from action list
};

// Staleness bonus: points added per day without a touch, capped per stage
function staleBonus(daysSince: number | null, stage: string): number {
  if (!daysSince) return 0;
  const caps: Record<string, number> = {
    meeting:   50,   // meeting leads: urgent after even 1 day
    replied:   40,
    engaged:   30,
    contacted: 25,
    enriched:  10,
    imported:  10,
  };
  const rate: Record<string, number> = {
    meeting:   20,
    replied:   10,
    engaged:    5,
    contacted:  3,
    enriched:   1,
    imported:   1,
  };
  const cap = caps[stage] ?? 10;
  const r   = rate[stage] ?? 1;
  return Math.min(daysSince * r, cap);
}

// Enrichment penalty: stale data reduces confidence; score bump if never enriched
// (signals we should enrich before outreach, not waste a send)
function enrichmentFactor(bucket: string | null, stage: string): number {
  if (stage === "imported" || stage === "enriched") {
    // For pre-contact leads, missing enrichment blocks action
    if (!bucket || bucket === "never") return -5;
  }
  return 0; // post-contact enrichment staleness doesn't block action
}

function silenceBonus(isSilent: boolean): number {
  return isSilent ? 30 : 0;
}

function scoreToUrgency(score: number): Urgency {
  if (score >= 120) return "critical";
  if (score >= 80)  return "high";
  if (score >= 40)  return "medium";
  return "low";
}

// ─── Action classification ────────────────────────────────────────────────────

function classifyAction(
  stage: string,
  daysSince: number | null,
  isSilent: boolean,
  enrichmentBucket: string | null,
  touchCount30d: number,
): ActionType {
  if (isSilent) return "rescue";

  switch (stage) {
    case "meeting":
      return "close";

    case "replied":
      return "follow_up";

    case "engaged":
      // Clicked but no reply — follow up if it's been a few days
      if (daysSince !== null && daysSince >= 3) return "follow_up";
      return "re_engage";

    case "contacted":
      // Touched but no engagement — re-engage if stalled
      if (daysSince !== null && daysSince >= 7) return "re_engage";
      return "re_engage";

    case "enriched":
      return "sequence_start";

    case "imported":
    default:
      if (!enrichmentBucket || enrichmentBucket === "never") return "enrich";
      return "sequence_start";
  }
}

// ─── Human-readable reason builder ───────────────────────────────────────────

function buildReason(
  action: ActionType,
  stage: string,
  daysSince: number | null,
  displayName: string,
  lastTool: string | null,
  touchCount30d: number,
  enrichmentBucket: string | null,
): string {
  const name = displayName || "This lead";
  const days = daysSince !== null ? `${daysSince}d` : "unknown";
  const tool = lastTool ? ` via ${lastTool}` : "";

  switch (action) {
    case "close":
      return `${name} has a meeting booked. Last touch was ${days} ago${tool}. Follow up now to confirm attendance and move to close.`;

    case "follow_up":
      if (stage === "replied")
        return `${name} replied${tool} but has not heard back in ${days}. Reply now while intent is fresh.`;
      return `${name} engaged (clicked/watched) ${days} ago but hasn't replied. A timely follow-up increases reply probability significantly.`;

    case "re_engage":
      if (touchCount30d === 0)
        return `${name} was contacted previously but has received zero outreach in 30 days. They are drifting — re-engage before they go cold.`;
      return `${name} has been in the contacted stage for ${days} with no reply. Consider a new angle or channel switch.`;

    case "sequence_start":
      return `${name} is enriched and ready but has never been contacted. Add to a sequence now.`;

    case "enrich":
      return `${name} was imported but has no enrichment data. Enrich first — contacting without title/company context reduces reply rates.`;

    case "rescue":
      return `${name} has been in the pipeline for 7+ days with zero outreach. They are at risk of going permanently cold. Act immediately or disqualify.`;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getNextActions(
  workspaceId: string,
  limit = 20,
  filterAction?: ActionType,
  filterUrgency?: Urgency,
): Promise<NextActionsResult> {

  // ── 1. Load LeadActivitySummary with IqLead join ──────────────────────────
  const summaries = await prisma.leadActivitySummary.findMany({
    where: {
      workspaceId,
      // Exclude won leads — nothing to do
      funnelStage: { not: "won" },
    },
    select: {
      iqLeadId:           true,
      funnelStage:        true,
      lastOutreachAt:     true,
      touchCount30d:      true,
      isSilent:           true,
      enrichmentAgeDays:  true,
      enrichmentBucket:   true,
      touchBreakdown7d:   true,
      icpScore:           true,
      icpGrade:           true,
      churnProbability:   true,
      iqLead: {
        select: {
          displayName: true,
          company:     true,
          title:       true,
        },
      },
    } as any,
  });

  const totalLeads = summaries.length;

  // ── 2. Resolve last tool from touchBreakdown7d ────────────────────────────
  function lastTool(breakdown7d: string | null): string | null {
    if (!breakdown7d) return null;
    try {
      const map: Record<string, number> = JSON.parse(breakdown7d);
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
      return sorted[0]?.[0] ?? null;
    } catch { return null; }
  }

  // ── 3. Score and classify every lead ──────────────────────────────────────
  const scored: (NextAction & { score: number })[] = [];

  for (const s of summaries as any[]) {
    const stage     = s.funnelStage;
    const base      = STAGE_BASE[stage];

    // Skip won and unknown stages
    if (base === undefined || base === 0) continue;

    const daysSince = s.lastOutreachAt
      ? Math.floor((Date.now() - s.lastOutreachAt.getTime()) / 86_400_000)
      : null;

    // ICP score bonus: hot=+20, warm=+10, cold=0, no profile=0
    const icpBonus = s.icpGrade === "hot" ? 20 : s.icpGrade === "warm" ? 10 : 0;

    // Churn probability bonus: high churn = more urgent to act (max +15)
    const churnBonus = s.churnProbability != null
      ? Math.round(s.churnProbability * 15)
      : 0;

    const score =
      base +
      staleBonus(daysSince, stage) +
      enrichmentFactor(s.enrichmentBucket, stage) +
      silenceBonus(s.isSilent) +
      icpBonus +
      churnBonus;

    const action = classifyAction(
      stage,
      daysSince,
      s.isSilent,
      s.enrichmentBucket,
      s.touchCount30d,
    );

    if (filterAction && action !== filterAction) continue;

    const urgency = scoreToUrgency(score);
    if (filterUrgency && urgency !== filterUrgency) continue;

    const tool    = lastTool(s.touchBreakdown7d);
    const reason  = buildReason(
      action, stage, daysSince,
      s.iqLead.displayName ?? "This lead",
      tool, s.touchCount30d, s.enrichmentBucket,
    );

    scored.push({
      rank:        0,   // assigned after sort
      iqLeadId:    s.iqLeadId,
      displayName: s.iqLead.displayName ?? "Unknown",
      company:     s.iqLead.company    ?? null,
      title:       s.iqLead.title      ?? null,
      action,
      urgency,
      reason,
      context: {
        funnelStage:       stage,
        daysSinceTouch:    daysSince,
        enrichmentAgeDays: s.enrichmentAgeDays ?? null,
        touchCount30d:     s.touchCount30d,
        lastTool:          tool,
        icpScore:          s.icpScore          ?? null,
        icpGrade:          s.icpGrade          ?? null,
        churnProbability:  s.churnProbability  ?? null,
      },
      score,
    });
  }

  // ── 4. Sort by score descending, assign ranks, trim to limit ──────────────
  scored.sort((a, b) => b.score - a.score);
  const actions = scored.slice(0, limit).map((item, i) => ({
    ...item,
    rank: i + 1,
  }));

  return {
    generatedAt:   new Date().toISOString(),
    totalLeads,
    returnedCount: actions.length,
    actions,
  };
}
