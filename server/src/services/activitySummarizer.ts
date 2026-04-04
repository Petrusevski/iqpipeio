/**
 * activitySummarizer.ts
 *
 * Maintains the LeadActivitySummary materialized read model.
 * Called in two modes:
 *
 *   1. Incremental — triggered after every recordTouchpoint() write.
 *      Recomputes only the affected iqLeadId. Non-blocking (fire-and-forget).
 *
 *   2. Full backfill — called once on startup and then every 6 hours by the
 *      scheduler. Processes all iqLeads in batches, back-filling any rows that
 *      are missing or stale (> 6h since last computedAt).
 *
 * Output table: LeadActivitySummary (one row per IqLead)
 */

import { prisma } from "../db";

// ─── Event classification ─────────────────────────────────────────────────────

/**
 * Events that count as intentional outreach toward a lead.
 * Used for: latency (first outreach), frequency counts, coverage gap detection.
 * Excludes enrichment, CRM internal updates, and system events.
 */
const OUTREACH_EVENTS = new Set([
  "email_sent",
  "sequence_started",
  "message_sent",
  "connection_sent",
  "connection_request_sent",
  "linkedin_message_sent",
  "call_attempted",
  "sms_sent",
]);

/**
 * Funnel stages in strict sequential order.
 * A lead only advances when evidence exists AND all prior stages are satisfied.
 */
const FUNNEL_STAGES = [
  "imported",
  "enriched",
  "contacted",
  "engaged",
  "replied",
  "meeting",
  "won",
] as const;

type FunnelStage = typeof FUNNEL_STAGES[number];

/**
 * Events that constitute evidence for each funnel stage.
 * "engaged" uses click signals only — email_opened is excluded because
 * Apple MPP renders it unreliable as an intent signal.
 */
const STAGE_EVENTS: Record<FunnelStage, string[]> = {
  imported:  ["lead_imported"],
  enriched:  ["lead_enriched"],
  contacted: [
    "email_sent", "sequence_started", "message_sent",
    "connection_sent", "connection_request_sent", "linkedin_message_sent",
  ],
  engaged:   ["email_clicked", "link_clicked", "video_watched"],
  replied:   ["reply_received"],
  meeting:   ["meeting_booked"],
  won:       ["deal_won"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latencyBucket(hours: number): string {
  if (hours < 4)   return "sub4h";
  if (hours < 24)  return "4to24h";
  if (hours < 72)  return "1to3d";
  if (hours < 168) return "3to7d";
  return "over7d";
}

function frequencyBucket(count: number): string {
  if (count === 0)  return "0";
  if (count <= 2)   return "1-2";
  if (count <= 5)   return "3-5";
  if (count <= 9)   return "6-9";
  return "10+";
}

function enrichmentBucket(ageDays: number | null): string {
  if (ageDays === null) return "never";
  if (ageDays < 30)    return "fresh";
  if (ageDays < 90)    return "aging";
  if (ageDays < 180)   return "stale";
  return "very_stale";
}

/**
 * Derive the highest sequential funnel stage from a set of event types.
 * Walks the ordered stage list and stops at the first gap.
 */
function resolveFunnelStage(eventTypeSet: Set<string>): FunnelStage {
  let highest: FunnelStage = "imported";
  for (const stage of FUNNEL_STAGES) {
    const hasEvidence = STAGE_EVENTS[stage].some(e => eventTypeSet.has(e));
    if (hasEvidence) {
      highest = stage;
    } else {
      break; // Sequential — stop at first missing stage
    }
  }
  return highest;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute and upsert the LeadActivitySummary for a single iqLeadId.
 * Designed for incremental use — queries only the target lead's touchpoints.
 */
export async function computeSummaryForLead(
  workspaceId: string,
  iqLeadId: string,
): Promise<void> {
  // Fetch all touchpoints for this lead in one query
  const touchpoints = await prisma.touchpoint.findMany({
    where: { workspaceId, iqLeadId },
    select: { tool: true, eventType: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  const now          = Date.now();
  const last7Start   = new Date(now - 7  * 86_400_000);
  const last30Start  = new Date(now - 30 * 86_400_000);
  const sevenDaysAgo = new Date(now - 7  * 86_400_000);

  // ── Latency ────────────────────────────────────────────────────────────────
  const importTp    = touchpoints.find(t => t.eventType === "lead_imported");
  const outreachTp  = touchpoints.find(t => OUTREACH_EVENTS.has(t.eventType));

  const importedAt      = importTp?.recordedAt ?? null;
  const firstOutreachAt = outreachTp?.recordedAt ?? null;
  const latencyHours    = (importedAt && firstOutreachAt)
    ? (firstOutreachAt.getTime() - importedAt.getTime()) / 3_600_000
    : null;

  // ── Frequency ──────────────────────────────────────────────────────────────
  const outreachTps = touchpoints.filter(t => OUTREACH_EVENTS.has(t.eventType));
  const touchCount7d       = outreachTps.filter(t => t.recordedAt >= last7Start).length;
  const touchCount30d      = outreachTps.filter(t => t.recordedAt >= last30Start).length;
  const touchCountAllTime  = outreachTps.length;

  const lastOutreachAt = outreachTps.length
    ? outreachTps[outreachTps.length - 1].recordedAt
    : null;

  // Per-tool breakdown for the 7-day window
  const toolCounts: Record<string, number> = {};
  for (const tp of outreachTps.filter(t => t.recordedAt >= last7Start)) {
    toolCounts[tp.tool] = (toolCounts[tp.tool] ?? 0) + 1;
  }
  const touchBreakdown7d = JSON.stringify(toolCounts);

  // ── Funnel stage ───────────────────────────────────────────────────────────
  const eventTypeSet = new Set(touchpoints.map(t => t.eventType));
  const funnelStage  = resolveFunnelStage(eventTypeSet);

  // ── Enrichment freshness ──────────────────────────────────────────────────
  // Prefer IqLead.lastEnrichedAt (set directly by enrichment write paths).
  // Fall back to scanning touchpoints if the field hasn't been backfilled yet.
  const iqLead = await prisma.iqLead.findUnique({
    where: { id: iqLeadId },
    select: { lastEnrichedAt: true },
  });

  let lastEnrichedAt = iqLead?.lastEnrichedAt ?? null;
  if (!lastEnrichedAt) {
    // Fallback: find most recent lead_enriched touchpoint
    const enrichTp = touchpoints
      .filter(t => t.eventType === "lead_enriched")
      .at(-1);
    lastEnrichedAt = enrichTp?.recordedAt ?? null;
  }

  const enrichmentAgeDays = lastEnrichedAt
    ? (now - lastEnrichedAt.getTime()) / 86_400_000
    : null;

  // ── Silent pipeline flag ──────────────────────────────────────────────────
  const daysSinceImport = importedAt
    ? (now - importedAt.getTime()) / 86_400_000
    : null;
  const isSilent  = (daysSinceImport !== null && daysSinceImport >= 7)
    && touchCountAllTime === 0;

  // For silentSince: use importedAt + 7d (when the threshold was crossed)
  const silentSince = isSilent && importedAt
    ? new Date(importedAt.getTime() + 7 * 86_400_000)
    : null;

  // ── Upsert ────────────────────────────────────────────────────────────────
  const payload = {
    workspaceId,
    importedAt,
    firstOutreachAt,
    latencyHours,
    latencyBucket:       latencyHours !== null ? latencyBucket(latencyHours) : null,
    touchCount7d,
    touchCount30d,
    touchCountAllTime,
    lastOutreachAt,
    frequencyBucket:     frequencyBucket(touchCount7d),
    touchBreakdown7d,
    funnelStage,
    funnelStageUpdatedAt: new Date(),
    lastEnrichedAt,
    enrichmentAgeDays,
    enrichmentBucket:    enrichmentBucket(enrichmentAgeDays),
    isSilent,
    silentSince,
  };

  await prisma.leadActivitySummary.upsert({
    where:  { iqLeadId },
    create: { iqLeadId, ...payload },
    update: payload,
  });
}

// ─── Full backfill / refresh ──────────────────────────────────────────────────

const BATCH_SIZE = 200;
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Full-workspace backfill. Processes all IqLeads in batches.
 * Skips rows computed within the last 6 hours (unless force=true).
 *
 * Safe to run concurrently across workspaces — each workspace is independent.
 */
export async function backfillWorkspace(
  workspaceId: string,
  force = false,
): Promise<{ processed: number; skipped: number }> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  let processed = 0;
  let skipped   = 0;
  let cursor: string | undefined;

  while (true) {
    const leads = await prisma.iqLead.findMany({
      where: { workspaceId },
      select: { id: true },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
    });

    if (leads.length === 0) break;
    cursor = leads[leads.length - 1].id;

    for (const lead of leads) {
      if (!force) {
        // Skip if recently computed
        const existing = await prisma.leadActivitySummary.findUnique({
          where:  { iqLeadId: lead.id },
          select: { computedAt: true },
        });
        if (existing && existing.computedAt > staleThreshold) {
          skipped++;
          continue;
        }
      }

      try {
        await computeSummaryForLead(workspaceId, lead.id);
        processed++;
      } catch (err: any) {
        console.error(`[activitySummarizer] Failed for iqLeadId=${lead.id}:`, err.message);
      }
    }
  }

  return { processed, skipped };
}

/**
 * Run a full backfill across ALL workspaces.
 * Called by the 6-hour scheduler in workerScheduler.ts.
 */
export async function runFullBackfill(force = false): Promise<void> {
  console.log("[activitySummarizer] Starting full backfill...");

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
  });

  for (const ws of workspaces) {
    try {
      const { processed, skipped } = await backfillWorkspace(ws.id, force);
      if (processed > 0) {
        console.log(
          `[activitySummarizer] ${ws.name}: ${processed} computed, ${skipped} skipped`,
        );
      }
    } catch (err: any) {
      console.error(`[activitySummarizer] Workspace ${ws.id} failed:`, err.message);
    }
  }

  console.log("[activitySummarizer] Full backfill complete.");
}
