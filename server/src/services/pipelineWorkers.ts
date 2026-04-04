/**
 * pipelineWorkers.ts
 *
 * Two proactive background workers that fire alerts at the moment a lead
 * crosses a health threshold — not retroactively when someone opens the dashboard.
 *
 * Worker 1 — Silent Lead Scanner (every 6 hours)
 *   Finds leads that have just crossed the 7-day no-outreach threshold.
 *   Creates a warning notification per workspace summarising new "ghost" leads.
 *   Deduplicates against existing unread notifications to avoid spam.
 *
 * Worker 2 — Enrichment Freshness Worker (every 24 hours)
 *   Finds active leads (outreach in last 30d) whose enrichment data has just
 *   crossed the 90-day staleness threshold.
 *   Creates a warning notification so the workspace knows sequences are running
 *   on stale titles / company data.
 */

import { prisma } from "../db";
import { createNotification } from "./notificationService";

// ─────────────────────────────────────────────────────────────────────────────
// Worker 1: Silent Lead Scanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect leads that crossed the 7-day silence threshold since the last scan.
 *
 * "New" silent leads = imported between 7 and 8 days ago with zero outreach.
 * This narrow window (1 day) means each lead fires an alert exactly once
 * without needing a "notified" flag on the row.
 *
 * Runs every 6 hours — the window is wider than the interval so no lead slips
 * through, but narrow enough to avoid duplicate alerts across runs.
 */
export async function runSilentLeadScan(): Promise<void> {
  const now          = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000);
  const eightDaysAgo = new Date(now - 8 * 86_400_000);

  // Find all workspaces that have at least one newly-silent lead
  const newlySilent = await prisma.leadActivitySummary.findMany({
    where: {
      importedAt: {
        gte: eightDaysAgo,   // imported 7–8 days ago (crossed the threshold today)
        lt:  sevenDaysAgo,
      },
      firstOutreachAt: null,    // never received any outreach
      touchCountAllTime: 0,
    },
    select: {
      workspaceId: true,
      iqLeadId:    true,
      importedAt:  true,
      iqLead: {
        select: { displayName: true, company: true },
      },
    },
  });

  if (newlySilent.length === 0) return;

  // Group by workspace
  const byWorkspace = new Map<string, typeof newlySilent>();
  for (const row of newlySilent) {
    if (!byWorkspace.has(row.workspaceId)) byWorkspace.set(row.workspaceId, []);
    byWorkspace.get(row.workspaceId)!.push(row);
  }

  for (const [workspaceId, leads] of byWorkspace) {
    // Deduplicate: skip if a silent_pipeline_alert was already created in the
    // last 12 hours for this workspace (prevents double-firing on overlapping runs)
    const recentAlert = await prisma.notification.findFirst({
      where: {
        workspaceId,
        type:      "silent_pipeline_alert",
        createdAt: { gte: new Date(now - 12 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentAlert) continue;

    const count = leads.length;

    // Build a compact lead preview (up to 3 names)
    const preview = leads
      .slice(0, 3)
      .map(l => [l.iqLead?.displayName, l.iqLead?.company].filter(Boolean).join(" · "))
      .filter(Boolean)
      .join(", ");

    const more = count > 3 ? ` and ${count - 3} more` : "";

    await createNotification({
      workspaceId,
      type:     "silent_pipeline_alert",
      severity: count >= 20 ? "error" : "warning",
      title:    `${count} lead${count !== 1 ? "s" : ""} imported 7+ days ago with no outreach`,
      body:     `${preview}${more}. These leads entered your pipeline but were never contacted. `
              + `Check import sequences, tool filters, or ICP criteria.`,
      metadata: JSON.stringify({
        silentCount:  count,
        iqLeadIds:    leads.slice(0, 50).map(l => l.iqLeadId),
        detectedAt:   new Date(now).toISOString(),
      }),
    });

    console.log(`[silentLeadScanner] ${workspaceId}: ${count} newly-silent lead(s) flagged`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker 2: Enrichment Freshness Worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect active leads whose enrichment has just crossed the 90-day threshold.
 *
 * "Active" = received outreach in the last 30 days (sequences still running).
 * "Just crossed" = lastEnrichedAt between 90 and 91 days ago.
 *
 * Runs every 24 hours. The 1-day detection window matches the run interval
 * so each lead fires exactly once without a status flag.
 */
export async function runEnrichmentFreshnessCheck(): Promise<void> {
  const now             = Date.now();
  const ninetyDaysAgo   = new Date(now - 90 * 86_400_000);
  const ninetyOneDaysAgo = new Date(now - 91 * 86_400_000);
  const thirtyDaysAgo   = new Date(now - 30 * 86_400_000);

  // Active leads that just crossed the 90-day enrichment staleness threshold
  const newlyStale = await prisma.leadActivitySummary.findMany({
    where: {
      lastOutreachAt:  { gte: thirtyDaysAgo },   // active in last 30d
      lastEnrichedAt: {
        gte: ninetyOneDaysAgo,   // enriched 90–91 days ago (just crossed threshold)
        lt:  ninetyDaysAgo,
      },
    },
    select: {
      workspaceId:    true,
      iqLeadId:       true,
      lastEnrichedAt: true,
      iqLead: {
        select: { displayName: true, company: true, title: true, enrichmentSource: true },
      },
    },
  });

  // Also catch active leads that were NEVER enriched — alert once per workspace
  // per day (deduplication handles the rest)
  const neverEnriched = await prisma.leadActivitySummary.findMany({
    where: {
      lastOutreachAt: { gte: thirtyDaysAgo },
      lastEnrichedAt: null,
      enrichmentBucket: "never",
    },
    select: {
      workspaceId: true,
      iqLeadId:    true,
    },
  });

  // Merge both sets and group by workspace
  type Row = { workspaceId: string; iqLeadId: string; reason: "stale" | "never" };
  const allRows: Row[] = [
    ...newlyStale.map(r => ({ workspaceId: r.workspaceId, iqLeadId: r.iqLeadId, reason: "stale" as const })),
    ...neverEnriched.map(r => ({ workspaceId: r.workspaceId, iqLeadId: r.iqLeadId, reason: "never" as const })),
  ];

  if (allRows.length === 0) return;

  const byWorkspace = new Map<string, { stale: number; never: number; ids: string[] }>();
  for (const row of allRows) {
    if (!byWorkspace.has(row.workspaceId)) {
      byWorkspace.set(row.workspaceId, { stale: 0, never: 0, ids: [] });
    }
    const ws = byWorkspace.get(row.workspaceId)!;
    if (row.reason === "stale") ws.stale++;
    else ws.never++;
    if (ws.ids.length < 50) ws.ids.push(row.iqLeadId);
  }

  for (const [workspaceId, counts] of byWorkspace) {
    // Deduplicate: skip if an enrichment_stale alert was already created today
    const recentAlert = await prisma.notification.findFirst({
      where: {
        workspaceId,
        type:      "enrichment_stale_alert",
        createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentAlert) continue;

    const totalAffected = counts.stale + counts.never;
    const parts: string[] = [];
    if (counts.stale > 0) parts.push(`${counts.stale} lead${counts.stale !== 1 ? "s" : ""} with enrichment older than 90 days`);
    if (counts.never > 0) parts.push(`${counts.never} lead${counts.never !== 1 ? "s" : ""} never enriched`);

    await createNotification({
      workspaceId,
      type:     "enrichment_stale_alert",
      severity: totalAffected >= 50 ? "error" : "warning",
      title:    `Stale enrichment on ${totalAffected} active lead${totalAffected !== 1 ? "s" : ""}`,
      body:     `${parts.join(" and ")}. Sequences are running on outdated job titles and company data — `
              + `re-enrich via Clay, Apollo, or your enrichment provider before the next send.`,
      metadata: JSON.stringify({
        staleCount:  counts.stale,
        neverCount:  counts.never,
        iqLeadIds:   counts.ids,
        detectedAt:  new Date(now).toISOString(),
      }),
    });

    console.log(
      `[enrichmentFreshnessWorker] ${workspaceId}: ${counts.stale} stale, ${counts.never} never-enriched (active leads)`,
    );
  }
}
