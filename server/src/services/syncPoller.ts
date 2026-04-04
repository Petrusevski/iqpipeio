/**
 * syncPoller.ts
 *
 * Background tasks started on server boot:
 *   1. syncAllWorkspaces() — API poll every 2 hours (catches missed webhook events)
 *   2. purgeStaleIdempotencyRecords() — runs alongside each poll cycle
 *   3. startN8nQueueProcessor() — processes N8nQueuedEvent every 15 seconds
 *
 * On Vercel (serverless) this file is not imported. For production without a
 * long-lived process, trigger POST /api/integrations/poll from an external cron.
 */

import { syncAllWorkspaces } from "./syncService";
import { startN8nQueueProcessor } from "./n8nQueueProcessor";
import { syncAllN8nConnections, pollAllN8nExecutions } from "./n8nClient";
import { syncAllMakeConnections } from "./makeClient";
import { startAnomalyDetector } from "./anomalyDetector";
import { runFullBackfill } from "./activitySummarizer";
import { runSilentLeadScan, runEnrichmentFreshnessCheck } from "./pipelineWorkers";
import { startDeferredJobRunner } from "./deferredJobRunner";
import { prisma } from "../db";
import { PLAN_LIMITS } from "../utils/quota";

const POLL_INTERVAL_MS        = 2 * 60 * 60 * 1000;  // 2 hours  — workflow metadata sync
const EXEC_POLL_INTERVAL_MS   = 5 * 60 * 1000;        // 5 minutes — execution event poll
const RETENTION_INTERVAL_MS   = 24 * 60 * 60 * 1000;  // 24 hours — nightly retention pruning
const SUMMARIZER_INTERVAL_MS  = 6 * 60 * 60 * 1000;   // 6 hours  — activity summary refresh
const SILENT_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 6 hours  — silent pipeline scan
const FRESHNESS_INTERVAL_MS   = 24 * 60 * 60 * 1000;  // 24 hours — enrichment freshness check

/**
 * Nightly data-retention pruning.
 * Deletes Touchpoint + Activity rows older than each workspace's retention window.
 *   trial / free  → 3 months  (90 days)
 *   starter       → 3 months  (schema default = 12 — overridden per plan)
 *   growth        → 12 months
 *   agency        → 36 months
 */
export async function runRetentionPruning(): Promise<void> {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, plan: true, dataRetentionMonths: true },
    });

    let totalTouchpoints = 0;
    let totalActivities  = 0;

    for (const ws of workspaces) {
      // Enforce plan-based minimums regardless of stored setting
      const planMonths: Record<string, number> = {
        trial: 3, free: 3, starter: 3, growth: 12, agency: 36,
      };
      const months  = Math.min(ws.dataRetentionMonths, planMonths[ws.plan] ?? ws.dataRetentionMonths);
      const cutoff  = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

      const [tp, ac] = await Promise.all([
        prisma.touchpoint.deleteMany({
          where: { workspaceId: ws.id, recordedAt: { lt: cutoff } },
        }),
        prisma.activity.deleteMany({
          where: { workspaceId: ws.id, createdAt: { lt: cutoff } },
        }),
      ]);

      totalTouchpoints += tp.count;
      totalActivities  += ac.count;
    }

    if (totalTouchpoints + totalActivities > 0) {
      console.log(
        `[syncPoller] Retention pruning: removed ${totalTouchpoints} touchpoints, ` +
        `${totalActivities} activities across ${workspaces.length} workspaces`
      );
    }
  } catch (err: any) {
    console.error("[syncPoller] retention pruning error:", err.message);
  }
}

async function purgeStaleIdempotencyRecords(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await prisma.idempotencyRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      console.log(`[syncPoller] Purged ${count} expired idempotency record(s)`);
    }
  } catch (err: any) {
    console.error("[syncPoller] idempotency purge error:", err.message);
  }
}

async function runCycle(): Promise<void> {
  await syncAllWorkspaces();
  await purgeStaleIdempotencyRecords();
  await syncAllN8nConnections();
  await syncAllMakeConnections();
}

export function startSyncPoller(): void {
  console.log(
    `[syncPoller] Started — metadata sync every ${POLL_INTERVAL_MS / 60_000}m, ` +
    `execution poll every ${EXEC_POLL_INTERVAL_MS / 60_000}m`
  );

  // Start n8n async queue processor (independent loop, every 15s)
  startN8nQueueProcessor();

  // Start GTM anomaly detector (Phase 1 — runs every 30 min)
  startAnomalyDetector();

  // Start deferred job runner (polls every 2 min for due jobs)
  startDeferredJobRunner();

  // Run full API poll immediately on startup
  runCycle().catch(console.error);

  // Repeat metadata sync on 2-hour interval
  setInterval(() => {
    runCycle().catch(console.error);
  }, POLL_INTERVAL_MS);

  // Poll n8n execution events every 5 minutes
  // Delay first run by 30s to let the server finish booting
  setTimeout(() => {
    pollAllN8nExecutions().catch(console.error);
    setInterval(() => {
      pollAllN8nExecutions().catch(console.error);
    }, EXEC_POLL_INTERVAL_MS);
  }, 30_000);

  // Nightly retention pruning — delay first run by 60s, then every 24h
  setTimeout(() => {
    runRetentionPruning().catch(console.error);
    setInterval(() => {
      runRetentionPruning().catch(console.error);
    }, RETENTION_INTERVAL_MS);
  }, 60_000);

  // Activity summary backfill — delay first run by 90s (let queue processor boot),
  // then refresh every 6 hours. Incremental updates from recordTouchpoint() keep
  // the table current between runs; this catches any gaps.
  setTimeout(() => {
    runFullBackfill().catch(console.error);
    setInterval(() => {
      runFullBackfill().catch(console.error);
    }, SUMMARIZER_INTERVAL_MS);
  }, 90_000);

  // Silent pipeline scanner — delay first run by 2 min (after backfill starts),
  // then every 6 hours. Alerts workspace when leads cross the 7-day no-outreach threshold.
  setTimeout(() => {
    runSilentLeadScan().catch(console.error);
    setInterval(() => {
      runSilentLeadScan().catch(console.error);
    }, SILENT_SCAN_INTERVAL_MS);
  }, 2 * 60_000);

  // Enrichment freshness worker — delay first run by 3 min, then every 24 hours.
  // Alerts workspace when active leads cross the 90-day enrichment staleness threshold.
  setTimeout(() => {
    runEnrichmentFreshnessCheck().catch(console.error);
    setInterval(() => {
      runEnrichmentFreshnessCheck().catch(console.error);
    }, FRESHNESS_INTERVAL_MS);
  }, 3 * 60_000);
}
