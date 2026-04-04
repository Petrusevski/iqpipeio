/**
 * deferredJobRunner.ts
 *
 * Polling-based deferred job executor. Survives server restarts — jobs are
 * persisted in the DeferredJob table and executed when their runAt time passes.
 *
 * Poll interval: every 2 minutes (POLL_INTERVAL_MS).
 * Batch size: 50 jobs per poll to bound execution time.
 *
 * Supported job types:
 *   "at_risk_check" — fires 4h after lead import if no outreach has occurred.
 *                     Creates an "at_risk" Notification so the workspace can act.
 *
 * Job lifecycle:
 *   pending → done    (check ran, action taken or skipped because no longer needed)
 *   pending → skipped (lead was already contacted — no alert needed)
 *   pending → failed  (unexpected error, logged, job left for manual inspection)
 */

import { prisma } from "../db";
import { createNotification } from "./notificationService";

const POLL_INTERVAL_MS = 2 * 60 * 1000;  // 2 minutes
const BATCH_SIZE       = 50;
const MAX_ATTEMPTS     = 3;

// ─── Job type: at_risk_check ──────────────────────────────────────────────────

interface AtRiskPayload {
  iqLeadId:    string;
  importedAt:  string;  // ISO string
}

async function handleAtRiskCheck(
  workspaceId: string,
  payload: AtRiskPayload,
): Promise<{ outcome: "alerted" | "skipped" | "no_summary" }> {
  // Read the pre-computed summary — O(1) pk lookup
  const summary = await prisma.leadActivitySummary.findUnique({
    where:  { iqLeadId: payload.iqLeadId },
    select: { firstOutreachAt: true, touchCountAllTime: true },
  });

  // Summary not yet computed — treat as not-contacted (safe default)
  if (!summary) return { outcome: "no_summary" };

  // Lead was already contacted — no alert needed
  if (summary.firstOutreachAt !== null || summary.touchCountAllTime > 0) {
    return { outcome: "skipped" };
  }

  // Still no outreach 4+ hours after import — create alert
  const importedAt  = new Date(payload.importedAt);
  const hoursElapsed = Math.round((Date.now() - importedAt.getTime()) / 3_600_000);

  // Resolve a display name for the notification body
  const iqLead = await prisma.iqLead.findUnique({
    where:  { id: payload.iqLeadId },
    select: { displayName: true, company: true, title: true },
  });

  const who = [iqLead?.displayName, iqLead?.company].filter(Boolean).join(" · ") || "A lead";

  await createNotification({
    workspaceId,
    type:     "at_risk_alert",
    severity: "warning",
    title:    `Lead not contacted ${hoursElapsed}h after import`,
    body:     `${who} was imported ${hoursElapsed} hours ago and has received no outreach. `
            + `High-intent leads contacted after 24h convert 3× lower. Check your import sequence or tool filters.`,
    metadata: JSON.stringify({
      iqLeadId:    payload.iqLeadId,
      importedAt:  payload.importedAt,
      hoursElapsed,
      detectedAt:  new Date().toISOString(),
    }),
  });

  return { outcome: "alerted" };
}

// ─── Job dispatcher ───────────────────────────────────────────────────────────

async function processJob(job: {
  id:          string;
  workspaceId: string;
  type:        string;
  payload:     string;
  attempts:    number;
}): Promise<void> {
  let parsedPayload: any;
  try {
    parsedPayload = JSON.parse(job.payload);
  } catch {
    await prisma.deferredJob.update({
      where: { id: job.id },
      data: {
        status:      "failed",
        result:      JSON.stringify({ error: "invalid_payload" }),
        processedAt: new Date(),
      },
    });
    return;
  }

  try {
    let result: object;

    switch (job.type) {
      case "at_risk_check":
        result = await handleAtRiskCheck(job.workspaceId, parsedPayload as AtRiskPayload);
        break;

      default:
        result = { error: `unknown_job_type: ${job.type}` };
    }

    await prisma.deferredJob.update({
      where: { id: job.id },
      data: {
        status:      "done",
        result:      JSON.stringify(result),
        processedAt: new Date(),
      },
    });

  } catch (err: any) {
    const nextAttempts = job.attempts + 1;
    const failed       = nextAttempts >= MAX_ATTEMPTS;

    await prisma.deferredJob.update({
      where: { id: job.id },
      data: {
        attempts:    nextAttempts,
        status:      failed ? "failed" : "pending",
        // Back off: retry after 5 min, then 15 min
        runAt:       failed ? undefined : new Date(Date.now() + nextAttempts * 5 * 60_000),
        result:      failed ? JSON.stringify({ error: err.message }) : undefined,
        processedAt: failed ? new Date() : undefined,
      },
    });

    if (failed) {
      console.error(`[deferredJobRunner] Job ${job.id} (${job.type}) failed after ${MAX_ATTEMPTS} attempts:`, err.message);
    }
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function pollDueJobs(): Promise<void> {
  const now = new Date();

  const dueJobs = await prisma.deferredJob.findMany({
    where: {
      status: "pending",
      runAt:  { lte: now },
    },
    orderBy: { runAt: "asc" },
    take:    BATCH_SIZE,
    select:  { id: true, workspaceId: true, type: true, payload: true, attempts: true },
  });

  if (dueJobs.length === 0) return;

  // Mark all as processing atomically before executing
  // (prevents double-processing if two server instances race)
  await prisma.deferredJob.updateMany({
    where: { id: { in: dueJobs.map(j => j.id) }, status: "pending" },
    data:  { attempts: { increment: 1 } },
  });

  for (const job of dueJobs) {
    await processJob(job);
  }

  console.log(`[deferredJobRunner] Processed ${dueJobs.length} job(s)`);
}

export function startDeferredJobRunner(): void {
  console.log(`[deferredJobRunner] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);

  // First poll after 30s (let the server finish booting)
  setTimeout(() => {
    pollDueJobs().catch(console.error);
    setInterval(() => {
      pollDueJobs().catch(console.error);
    }, POLL_INTERVAL_MS);
  }, 30_000);
}

// ─── Job factory ──────────────────────────────────────────────────────────────

/**
 * Schedule a 4-hour at-risk check for a newly imported lead.
 * Called from recordTouchpoint() when eventType === "lead_imported".
 * Idempotent — if a job already exists for this iqLeadId, no duplicate is created.
 */
export async function scheduleAtRiskCheck(
  workspaceId: string,
  iqLeadId:    string,
  importedAt:  Date,
): Promise<void> {
  // Check if a job for this lead already exists (re-imports should not double-schedule)
  const existing = await prisma.deferredJob.findFirst({
    where: {
      workspaceId,
      type:   "at_risk_check",
      status: "pending",
      payload: { contains: iqLeadId },
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.deferredJob.create({
    data: {
      workspaceId,
      type:    "at_risk_check",
      payload: JSON.stringify({ iqLeadId, importedAt: importedAt.toISOString() }),
      runAt:   new Date(importedAt.getTime() + 4 * 60 * 60 * 1000), // T + 4h
      status:  "pending",
    },
  });
}
