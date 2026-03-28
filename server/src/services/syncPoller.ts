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
import { prisma } from "../db";

const POLL_INTERVAL_MS     = 2 * 60 * 60 * 1000; // 2 hours  — workflow metadata sync
const EXEC_POLL_INTERVAL_MS = 5 * 60 * 1000;      // 5 minutes — execution event poll

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
}
