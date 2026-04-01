/**
 * n8nQueueProcessor.ts
 *
 * Background processor for the N8nQueuedEvent table.
 * Picks up pending events, calls recordEvent() for each one,
 * and handles retries with exponential backoff.
 *
 * Retry schedule:
 *   Attempt 1 → immediate
 *   Attempt 2 → 30 seconds
 *   Attempt 3 → 5 minutes
 *   Attempt 4 → 30 minutes
 *   Attempt 5+ → mark failed (dead-letter)
 *
 * Started from syncPoller.ts alongside the 2-hour API poll cycle.
 */

import { prisma } from "../db";
import { resolveIqLead, recordTouchpoint } from "../utils/identity";
import { checkAndIncrementQuota } from "../utils/quota";

const BATCH_SIZE     = 50;    // events claimed per tick
const CONCURRENCY    = 5;     // events processed in parallel within a batch
const POLL_MS        = 15_000; // check queue every 15 seconds
const MAX_ATTEMPTS   = 5;

const RETRY_DELAYS_MS = [
  0,           // attempt 1: immediate
  30_000,      // attempt 2: 30s
  5 * 60_000,  // attempt 3: 5 min
  30 * 60_000, // attempt 4: 30 min
];

function nextRetryAt(attempt: number): Date {
  const delayMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delayMs);
}

/**
 * Process a single queued event.
 * Mirrors what recordEvent() does in webhooks.ts but also injects
 * workflowId + stepId into the touchpoint meta for attribution.
 */
async function processQueuedEvent(event: any): Promise<void> {
  const contact = JSON.parse(event.contact);
  const meta    = event.meta ? JSON.parse(event.meta) : {};

  // Resolve identity (IqLead)
  const iqLeadId = await resolveIqLead(
    event.workspaceId,
    {
      email:    contact.email        || null,
      linkedin: contact.linkedin_url || null,
      phone:    contact.phone        || null,
    },
    {
      firstName: contact.first_name || "Unknown",
      lastName:  contact.last_name  || "",
      company:   contact.company    || null,
      title:     contact.title      || null,
    },
  );

  // Record touchpoint with n8n source tracking and workflow attribution
  await recordTouchpoint(
    event.workspaceId,
    iqLeadId,
    event.sourceApp,
    event.eventType,
    {
      ...meta,
      via:            "n8n",
      workflowId:     event.workflowId,
      stepId:         event.stepId ?? null,
      externalId:     event.externalId,
      queuedEventId:  event.id,
    },
    null,                    // experimentId
    null,                    // stackVariant
    "n8n_workflow",          // sourceType
    3,                       // sourcePriority (lowest)
    event.workflowId,        // workflowId for attribution
    event.stepId ?? null,    // stepId for attribution
    null,                    // consentBasis
    event.idempotencyKey,    // externalId — stable exec:ws:execId:node:item hash
  );

  // Backward-compat: write Activity record so the existing Live Feed + UI show this event
  const contactId = `${event.sourceApp.toLowerCase()}-${event.externalId}`;

  await prisma.contact.upsert({
    where:  { id: contactId },
    update: { firstName: contact.first_name || "Unknown", lastName: contact.last_name || "" },
    create: {
      id: contactId,
      workspaceId: event.workspaceId,
      firstName: contact.first_name || "Unknown",
      lastName:  contact.last_name  || "",
      email: null,       // PII lives in IqLead only
      linkedinUrl: null,
      status: "active",
    },
  });

  let dbLead = await prisma.lead.findFirst({ where: { contactId } });
  if (!dbLead) {
    dbLead = await prisma.lead.create({
      data: {
        workspaceId: event.workspaceId,
        contactId,
        email:    "",
        fullName: `${contact.first_name || "Unknown"} ${contact.last_name || ""}`.trim(),
        firstName: contact.first_name || "Unknown",
        lastName:  contact.last_name  || "",
        company:   contact.company    || null,
        title:     contact.title      || null,
        source:    event.sourceApp,
        status:    "new",
      },
    });
  }

  // Activity dedup: same lead + eventType within the same day
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.activity.findFirst({
    where: { workspaceId: event.workspaceId, leadId: dbLead.id, type: event.eventType, createdAt: { gte: dayStart } },
  });
  if (!existing) {
    await prisma.activity.create({
      data: {
        workspaceId: event.workspaceId,
        type:        event.eventType,
        subject:     `${contact.first_name || "Unknown"} ${contact.last_name || ""}`.trim() || "Unknown",
        body:        JSON.stringify({
          ...meta,
          source:     event.sourceApp,
          workflowId: event.workflowId,
          stepId:     event.stepId,
          via:        "n8n",
        }),
        status:  "completed",
        leadId:  dbLead.id,
      },
    });
  }
}

/**
 * Process a single queued event with full retry/dead-letter handling.
 */
async function processOne(event: any): Promise<void> {
  try {
    // Quota guard — monthly limit only; skip per-minute window because the
    // queue processor has its own concurrency controls and processes asynchronously.
    const quota = await checkAndIncrementQuota(event.workspaceId, { skipMinuteLimit: true });
    if (!quota.allowed) {
      await prisma.n8nQueuedEvent.update({
        where: { id: event.id },
        data:  { status: "failed", lastError: "QUOTA_EXCEEDED", processedAt: new Date() },
      });
      return;
    }

    await processQueuedEvent(event);

    await prisma.n8nQueuedEvent.update({
      where: { id: event.id },
      data:  { status: "done", processedAt: new Date(), lastError: null },
    });
  } catch (err: any) {
    const attempts = event.attempts + 1;
    const failed   = attempts >= MAX_ATTEMPTS;

    console.error(
      `[n8nQueue] Failed event ${event.id} (attempt ${attempts}/${MAX_ATTEMPTS}):`,
      err.message,
    );

    await prisma.n8nQueuedEvent.update({
      where: { id: event.id },
      data: {
        status:      failed ? "failed" : "pending",
        attempts,
        lastError:   err.message?.slice(0, 500),
        nextRetryAt: failed ? null : nextRetryAt(attempts),
      },
    });

    if (failed) {
      // Mirror to dead-letter table for visibility in Settings panel
      await prisma.webhookError.create({
        data: {
          workspaceId: event.workspaceId,
          source:      `n8n:${event.workflowId}`,
          payload:     JSON.stringify({
            workflowId: event.workflowId,
            stepId:     event.stepId,
            sourceApp:  event.sourceApp,
            externalId: event.externalId,
            eventType:  event.eventType,
            contact:    event.contact,
            meta:       event.meta,
          }).slice(0, 10_000),
          errorCode:   "QUEUE_MAX_RETRIES",
          errorDetail: err.message?.slice(0, 1_000),
          retryCount:  attempts,
        },
      }).catch(() => {});
    }
  }
}

/**
 * Process one batch of pending events from the queue.
 * Events within the batch are processed with limited concurrency.
 */
async function processBatch(): Promise<void> {
  const now = new Date();

  const pending = await prisma.n8nQueuedEvent.findMany({
    where: {
      status: "pending",
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return;

  // Mark batch as "processing" before starting work
  await prisma.n8nQueuedEvent.updateMany({
    where: { id: { in: pending.map(e => e.id) } },
    data:  { status: "processing" },
  });

  // Process with bounded concurrency: CONCURRENCY workers drain the queue
  const queue = [...pending];
  await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (queue.length > 0) {
        const event = queue.shift();
        if (!event) break;
        await processOne(event);
      }
    })
  );
}

export function startN8nQueueProcessor(): void {
  console.log(`[n8nQueue] Processor started — polling every ${POLL_MS / 1000}s`);

  // Run immediately on startup to drain any events left from a previous run
  processBatch().catch(console.error);

  setInterval(() => {
    processBatch().catch(console.error);
  }, POLL_MS);
}
