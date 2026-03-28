/**
 * recoveryWatcher.ts
 *
 * Phase 4 — Verification
 *
 * Called by Claude after apply_fix to check whether recovery has occurred.
 * This is a point-in-time snapshot tool — Claude calls it periodically
 * (every ~5 minutes) rather than running as a persistent background process.
 *
 * Recovery criteria:
 *   Tool       — at least one new touchpoint from that tool recorded after fixAppliedAt
 *   Workflow   — success rate in the post-fix window ≥ 90%, or ≥ 15pt improvement
 *   Event type — at least one new touchpoint of that eventType after fixAppliedAt
 *
 * If the timeoutMinutes window expires with no recovery, the engine re-runs
 * diagnosticEngine.diagnose() to produce a second-level escalation report.
 */

import { prisma } from "../db";
import { diagnose, DiagnosticReport } from "./diagnosticEngine";

// ─── Default timeouts by subject type (minutes) ───────────────────────────────
const DEFAULT_TIMEOUT: Record<string, number> = {
  tool:      30,
  workflow:  20,
  eventType: 30,
};

// Expected first-event latency per tool after reconnect (minutes)
// Based on typical webhook propagation + first activity cycle
const TOOL_FIRST_EVENT_LATENCY: Record<string, number> = {
  hubspot: 5, pipedrive: 5, salesforce: 5,
  apollo: 10, heyreach: 10, instantly: 10, lemlist: 10, smartlead: 10,
  outreach: 15, replyio: 15, phantombuster: 20,
  clay: 10, clearbit: 30, zoominfo: 30,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecoveryStatus = "recovered" | "waiting" | "timeout" | "partial";

export interface FirstEventSummary {
  eventType:   string;
  tool:        string;
  recordedAt:  string;
  contactName: string | null;
  company:     string | null;
  /** Deal amount if event is deal-related (from meta JSON) */
  dealAmount:  number | null;
  currency:    string | null;
}

export interface FunnelSnapshot {
  status:          "healthy" | "recovering" | "degraded";
  activeStages:    number;
  totalStages:     number;
  eventsLast4h:    number;
}

export interface WatchRecoveryResult {
  status:             RecoveryStatus;
  subject:            string;
  subjectType:        "tool" | "workflow" | "eventType";
  fixAppliedAt:       string;
  checkedAt:          string;
  minutesElapsed:     number;
  timeoutMinutes:     number;
  expectedLatencyMin: number | null;
  // Recovered fields
  firstEventAt?:      string;
  minutesAfterFix?:   number;
  firstEvent?:        FirstEventSummary;
  eventsAfterFix?:    number;
  funnelSnapshot?:    FunnelSnapshot;
  // Workflow-specific recovery
  successRateBefore?: number | null;
  successRateAfter?:  number | null;
  successRateDelta?:  number | null;
  // Timeout escalation
  escalation?:        DiagnosticReport;
  // Human-readable outcome
  message:            string;
  nextAction:         string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesSince(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / 60_000);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseDealAmount(metaJson: string | null | undefined): { amount: number | null; currency: string | null } {
  if (!metaJson) return { amount: null, currency: null };
  try {
    const m = JSON.parse(metaJson);
    const amount   = typeof m.amount === "number" ? m.amount
      : typeof m.deal_amount === "number" ? m.deal_amount
      : typeof m.value === "number" ? m.value
      : null;
    const currency = typeof m.currency === "string" ? m.currency
      : typeof m.deal_currency === "string" ? m.deal_currency
      : null;
    return { amount, currency };
  } catch {
    return { amount: null, currency: null };
  }
}

async function funnelSnapshot(workspaceId: string): Promise<FunnelSnapshot> {
  const since4h = new Date(Date.now() - 4 * 3_600_000);
  const FUNNEL_STAGES = [
    "contact_created", "email_sent", "email_opened", "email_clicked",
    "reply_received", "meeting_booked", "deal_created",
  ];

  const rows = await prisma.touchpoint.groupBy({
    by:    ["eventType"],
    where: { workspaceId, recordedAt: { gte: since4h } },
    _count: { id: true },
  });

  const activeSet  = new Set(rows.map(r => r.eventType));
  const active     = FUNNEL_STAGES.filter(s => activeSet.has(s)).length;
  const totalEvts  = rows.reduce((s, r) => s + r._count.id, 0);

  const status: FunnelSnapshot["status"] =
    active >= 4 ? "healthy" :
    active >= 2 ? "recovering" :
    "degraded";

  return {
    status,
    activeStages:  active,
    totalStages:   FUNNEL_STAGES.length,
    eventsLast4h:  totalEvts,
  };
}

// ─── Tool recovery check ──────────────────────────────────────────────────────

async function checkToolRecovery(
  workspaceId: string,
  tool: string,
  fixAppliedAt: Date,
  timeoutMinutes: number,
): Promise<WatchRecoveryResult> {
  const elapsed     = minutesSince(fixAppliedAt);
  const checkedAt   = new Date().toISOString();
  const expectedLat = TOOL_FIRST_EVENT_LATENCY[tool] ?? 15;
  const timedOut    = elapsed > timeoutMinutes;

  const firstNew = await prisma.touchpoint.findFirst({
    where:   { workspaceId, tool, recordedAt: { gt: fixAppliedAt } },
    orderBy: { recordedAt: "asc" },
    include: { iqLead: { select: { displayName: true, company: true } } },
  });

  if (firstNew) {
    // Recovered — count all new events and fetch funnel
    const [eventsAfterFix, funnel] = await Promise.all([
      prisma.touchpoint.count({ where: { workspaceId, tool, recordedAt: { gt: fixAppliedAt } } }),
      funnelSnapshot(workspaceId),
    ]);

    const minsAfterFix = round1(
      (firstNew.recordedAt.getTime() - fixAppliedAt.getTime()) / 60_000
    );

    const { amount, currency } = parseDealAmount(firstNew.meta);

    const firstEvent: FirstEventSummary = {
      eventType:   firstNew.eventType,
      tool:        firstNew.tool,
      recordedAt:  firstNew.recordedAt.toISOString(),
      contactName: (firstNew.iqLead as any)?.displayName ?? null,
      company:     (firstNew.iqLead as any)?.company ?? null,
      dealAmount:  amount,
      currency,
    };

    const dealLine = amount ? ` — $${amount.toLocaleString()}` : "";
    const contactLine = firstEvent.contactName || firstEvent.company
      ? ` (${[firstEvent.contactName, firstEvent.company].filter(Boolean).join(" · ")})`
      : "";

    return {
      status:           "recovered",
      subject:          tool,
      subjectType:      "tool",
      fixAppliedAt:     fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:   elapsed,
      timeoutMinutes,
      expectedLatencyMin: expectedLat,
      firstEventAt:     firstEvent.recordedAt,
      minutesAfterFix:  minsAfterFix,
      firstEvent,
      eventsAfterFix,
      funnelSnapshot:   funnel,
      message:          `✓ ${tool} recovered. First event received ${minsAfterFix}m after fix.\n  ${firstEvent.eventType}${contactLine}${dealLine}\n  Funnel is ${funnel.status} (${funnel.activeStages}/${funnel.totalStages} stages active in last 4h).`,
      nextAction:       `Inform the user that ${tool} is healthy again with ${eventsAfterFix} new event(s). No further action needed unless the funnel is degraded.`,
    };
  }

  // Not recovered yet
  if (!timedOut) {
    const remaining = timeoutMinutes - elapsed;
    return {
      status:             "waiting",
      subject:            tool,
      subjectType:        "tool",
      fixAppliedAt:       fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:     elapsed,
      timeoutMinutes,
      expectedLatencyMin: expectedLat,
      message:            `⏳ Waiting for first event from ${tool}. ${elapsed}m elapsed, ${remaining}m until timeout. Expected first event within ${expectedLat}m of fix.`,
      nextAction:         elapsed < expectedLat
        ? `Too early to conclude anything — re-call watch_recovery in ${Math.max(2, expectedLat - elapsed)}m.`
        : `Getting close to expected window. Re-call watch_recovery in 5m. If still waiting at timeout, escalate.`,
    };
  }

  // Timed out — run second-level diagnosis
  const escalation = await diagnose(workspaceId, { tool });
  return {
    status:           "timeout",
    subject:          tool,
    subjectType:      "tool",
    fixAppliedAt:     fixAppliedAt.toISOString(),
    checkedAt,
    minutesElapsed:   elapsed,
    timeoutMinutes,
    expectedLatencyMin: expectedLat,
    escalation,
    message:          `✗ ${tool} has not recovered after ${elapsed}m (timeout: ${timeoutMinutes}m). Second-level diagnosis attached. The original fix may not have addressed the root cause.`,
    nextAction:       `Present the escalation report to the user. The top cause is now "${escalation.probableCauses[0]?.cause ?? "unknown"}". Call apply_fix with the new cause.`,
  };
}

// ─── Workflow recovery check ──────────────────────────────────────────────────

async function checkWorkflowRecovery(
  workspaceId: string,
  workflowId: string,
  fixAppliedAt: Date,
  timeoutMinutes: number,
): Promise<WatchRecoveryResult> {
  const elapsed   = minutesSince(fixAppliedAt);
  const checkedAt = new Date().toISOString();
  const timedOut  = elapsed > timeoutMinutes;

  // Resolve workflow name
  const meta = await prisma.n8nWorkflowMeta.findFirst({
    where:  { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] },
    select: { name: true },
  }) ?? await prisma.makeScenarioMeta.findFirst({
    where:  { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] },
    select: { name: true },
  });
  const name = meta?.name ?? workflowId;

  // Compare success rates: before vs. after fix
  const windowBefore = new Date(fixAppliedAt.getTime() - 2 * 3_600_000); // 2h before fix

  const [beforeCounts, afterCounts] = await Promise.all([
    prisma.n8nQueuedEvent.groupBy({
      by:    ["status"],
      where: { workspaceId, workflowId, processedAt: { gte: windowBefore, lt: fixAppliedAt } },
      _count: { id: true },
    }),
    prisma.n8nQueuedEvent.groupBy({
      by:    ["status"],
      where: { workspaceId, workflowId, processedAt: { gte: fixAppliedAt } },
      _count: { id: true },
    }),
  ]);

  const totalBefore  = beforeCounts.reduce((s, r) => s + r._count.id, 0);
  const doneBefore   = beforeCounts.find(r => r.status === "done")?._count.id ?? 0;
  const rateBefore   = totalBefore > 0 ? Math.round((doneBefore / totalBefore) * 100) : null;

  const totalAfter   = afterCounts.reduce((s, r) => s + r._count.id, 0);
  const doneAfter    = afterCounts.find(r => r.status === "done")?._count.id ?? 0;
  const rateAfter    = totalAfter > 0 ? Math.round((doneAfter / totalAfter) * 100) : null;

  const delta        = rateAfter !== null && rateBefore !== null ? rateAfter - rateBefore : null;
  const recovered    = rateAfter !== null && (rateAfter >= 90 || (delta !== null && delta >= 15));

  if (recovered) {
    const funnel = await funnelSnapshot(workspaceId);
    return {
      status:             "recovered",
      subject:            name,
      subjectType:        "workflow",
      fixAppliedAt:       fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:     elapsed,
      timeoutMinutes,
      expectedLatencyMin: 5,
      eventsAfterFix:     totalAfter,
      successRateBefore:  rateBefore,
      successRateAfter:   rateAfter,
      successRateDelta:   delta,
      funnelSnapshot:     funnel,
      message:            `✓ Workflow "${name}" recovered. Success rate: ${rateBefore ?? "?"}% → ${rateAfter}% (+${delta ?? "?"}pt). ${totalAfter} event(s) processed since fix.`,
      nextAction:         `Inform the user the workflow is healthy. No further action needed.`,
    };
  }

  if (!timedOut) {
    const noDataYet = totalAfter === 0;
    return {
      status:             noDataYet ? "waiting" : "partial",
      subject:            name,
      subjectType:        "workflow",
      fixAppliedAt:       fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:     elapsed,
      timeoutMinutes,
      expectedLatencyMin: 5,
      eventsAfterFix:     totalAfter,
      successRateBefore:  rateBefore,
      successRateAfter:   rateAfter,
      successRateDelta:   delta,
      message:            noDataYet
        ? `⏳ Waiting for workflow "${name}" to process events after fix. ${elapsed}m elapsed.`
        : `⚠ Workflow "${name}" is processing events but success rate is ${rateAfter}% (was ${rateBefore ?? "?"}%). Not fully recovered yet.`,
      nextAction:         `Re-call watch_recovery in 5m to check again. If rate doesn't improve after ${timeoutMinutes}m, escalate.`,
    };
  }

  const escalation = await diagnose(workspaceId, { workflowId });
  return {
    status:             "timeout",
    subject:            name,
    subjectType:        "workflow",
    fixAppliedAt:       fixAppliedAt.toISOString(),
    checkedAt,
    minutesElapsed:     elapsed,
    timeoutMinutes,
    expectedLatencyMin: 5,
    eventsAfterFix:     totalAfter,
    successRateBefore:  rateBefore,
    successRateAfter:   rateAfter,
    successRateDelta:   delta,
    escalation,
    message:            `✗ Workflow "${name}" has not recovered after ${elapsed}m. Success rate still at ${rateAfter ?? "?"}%. Second-level diagnosis attached.`,
    nextAction:         `Present the escalation report. New top cause: "${escalation.probableCauses[0]?.cause ?? "unknown"}". Call apply_fix with the updated cause.`,
  };
}

// ─── Event-type recovery check ────────────────────────────────────────────────

async function checkEventTypeRecovery(
  workspaceId: string,
  eventType: string,
  fixAppliedAt: Date,
  timeoutMinutes: number,
): Promise<WatchRecoveryResult> {
  const elapsed   = minutesSince(fixAppliedAt);
  const checkedAt = new Date().toISOString();
  const timedOut  = elapsed > timeoutMinutes;

  const firstNew = await prisma.touchpoint.findFirst({
    where:   { workspaceId, eventType, recordedAt: { gt: fixAppliedAt } },
    orderBy: { recordedAt: "asc" },
    include: { iqLead: { select: { displayName: true, company: true } } },
  });

  if (firstNew) {
    const [eventsAfterFix, funnel] = await Promise.all([
      prisma.touchpoint.count({ where: { workspaceId, eventType, recordedAt: { gt: fixAppliedAt } } }),
      funnelSnapshot(workspaceId),
    ]);

    const minsAfterFix = round1(
      (firstNew.recordedAt.getTime() - fixAppliedAt.getTime()) / 60_000
    );

    const { amount, currency } = parseDealAmount(firstNew.meta);

    const firstEvent: FirstEventSummary = {
      eventType,
      tool:        firstNew.tool,
      recordedAt:  firstNew.recordedAt.toISOString(),
      contactName: (firstNew.iqLead as any)?.displayName ?? null,
      company:     (firstNew.iqLead as any)?.company ?? null,
      dealAmount:  amount,
      currency,
    };

    const contactLine = firstEvent.contactName || firstEvent.company
      ? ` (${[firstEvent.contactName, firstEvent.company].filter(Boolean).join(" · ")})`
      : "";
    const dealLine = amount ? ` — $${amount.toLocaleString()}` : "";

    return {
      status:           "recovered",
      subject:          eventType,
      subjectType:      "eventType",
      fixAppliedAt:     fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:   elapsed,
      timeoutMinutes,
      expectedLatencyMin: 15,
      firstEventAt:     firstEvent.recordedAt,
      minutesAfterFix:  minsAfterFix,
      firstEvent,
      eventsAfterFix,
      funnelSnapshot:   funnel,
      message:          `✓ "${eventType}" recovered. First event ${minsAfterFix}m after fix via ${firstNew.tool}${contactLine}${dealLine}. ${eventsAfterFix} total event(s) since fix.\n  Funnel: ${funnel.status} (${funnel.activeStages}/${funnel.totalStages} active stages).`,
      nextAction:       `Inform the user the event type is flowing again. If the funnel is degraded, suggest running diagnose_issue on the missing funnel stages.`,
    };
  }

  if (!timedOut) {
    return {
      status:             "waiting",
      subject:            eventType,
      subjectType:        "eventType",
      fixAppliedAt:       fixAppliedAt.toISOString(),
      checkedAt,
      minutesElapsed:     elapsed,
      timeoutMinutes,
      expectedLatencyMin: 15,
      message:            `⏳ Waiting for "${eventType}" to reappear in the feed. ${elapsed}m elapsed of ${timeoutMinutes}m window.`,
      nextAction:         `Re-call watch_recovery in 5m. If still absent at timeout, escalate with second-level diagnosis.`,
    };
  }

  const escalation = await diagnose(workspaceId, { eventType });
  return {
    status:         "timeout",
    subject:        eventType,
    subjectType:    "eventType",
    fixAppliedAt:   fixAppliedAt.toISOString(),
    checkedAt,
    minutesElapsed: elapsed,
    timeoutMinutes,
    expectedLatencyMin: 15,
    escalation,
    message:        `✗ "${eventType}" has not reappeared after ${elapsed}m. Second-level diagnosis attached.`,
    nextAction:     `Present the escalation report. New top cause: "${escalation.probableCauses[0]?.cause ?? "unknown"}". Call apply_fix with the updated cause.`,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function watchRecovery(
  workspaceId: string,
  params: {
    tool?:           string;
    workflowId?:     string;
    eventType?:      string;
    fixAppliedAt:    string;  // ISO timestamp
    timeoutMinutes?: number;
  }
): Promise<WatchRecoveryResult> {
  const { tool, workflowId, eventType, fixAppliedAt: fixTs, timeoutMinutes } = params;

  let fixDate: Date;
  try {
    fixDate = new Date(fixTs);
    if (isNaN(fixDate.getTime())) throw new Error("invalid");
  } catch {
    fixDate = new Date(Date.now() - 5 * 60_000); // fallback: 5 minutes ago
  }

  if (tool) {
    return checkToolRecovery(workspaceId, tool, fixDate, timeoutMinutes ?? DEFAULT_TIMEOUT.tool);
  }
  if (workflowId) {
    return checkWorkflowRecovery(workspaceId, workflowId, fixDate, timeoutMinutes ?? DEFAULT_TIMEOUT.workflow);
  }
  if (eventType) {
    return checkEventTypeRecovery(workspaceId, eventType, fixDate, timeoutMinutes ?? DEFAULT_TIMEOUT.eventType);
  }

  return {
    status:             "waiting",
    subject:            "unknown",
    subjectType:        "tool",
    fixAppliedAt:       fixDate.toISOString(),
    checkedAt:          new Date().toISOString(),
    minutesElapsed:     minutesSince(fixDate),
    timeoutMinutes:     timeoutMinutes ?? 30,
    expectedLatencyMin: null,
    message:            "No subject provided. Pass tool, workflowId, or eventType.",
    nextAction:         "Re-call with at least one of: tool, workflowId, eventType.",
  };
}
