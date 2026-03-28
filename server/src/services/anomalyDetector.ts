/**
 * anomalyDetector.ts
 *
 * Phase 1 — GTM Diagnostic Detection
 *
 * Runs on a schedule and checks every workspace for:
 *   1. Tool status transitions:  live → slow, slow → silent, live → silent
 *   2. Workflow health drops:    successRate falling below 90% (warning) or 70% (critical)
 *   3. Event-type disappearances: an event type that was seen in the prior window has
 *      completely vanished in the current window
 *
 * When an anomaly is detected it creates a Notification record (via notificationService)
 * so the Topbar bell icon lights up automatically — no user action required.
 *
 * De-duplication: we track the last-known state per workspace in an in-memory map so
 * we don't spam repeated notifications for a state that hasn't changed.
 */

import { prisma } from "../db";
import { createNotification } from "./notificationService";

// ─── Silence thresholds per tool (hours) — must mirror mcpApi.ts ─────────────
const SILENCE_THRESHOLD: Record<string, number> = {
  clay: 4, apollo: 6, heyreach: 6, lemlist: 6, instantly: 6,
  smartlead: 6, phantombuster: 12, replyio: 6, outreach: 12,
  clearbit: 24, zoominfo: 24, pdl: 24, hunter: 24, lusha: 24,
  cognism: 24, snovio: 24, rocketreach: 24,
  hubspot: 48, pipedrive: 48,
};

// ─── Workflow health thresholds ───────────────────────────────────────────────
const WORKFLOW_WARNING_THRESHOLD  = 90; // below this → warning notification
const WORKFLOW_CRITICAL_THRESHOLD = 70; // below this → critical notification

// ─── How far back to look when computing workflow health ──────────────────────
const WORKFLOW_WINDOW_DAYS = 7;

// ─── In-memory state per workspace ───────────────────────────────────────────
interface ToolState {
  status: "live" | "slow" | "silent" | "never";
}

interface WorkflowState {
  level: "healthy" | "warning" | "critical" | "no_data";
}

interface WorkspaceState {
  tools:     Record<string, ToolState>;
  workflows: Record<string, WorkflowState>;
  /** event types seen in the last detection window */
  eventTypes: Set<string>;
}

const workspaceStates = new Map<string, WorkspaceState>();

function getState(workspaceId: string): WorkspaceState {
  if (!workspaceStates.has(workspaceId)) {
    workspaceStates.set(workspaceId, { tools: {}, workflows: {}, eventTypes: new Set() });
  }
  return workspaceStates.get(workspaceId)!;
}

// ─── Classify tool status ─────────────────────────────────────────────────────
function classifyTool(lastAt: Date | null, tool: string): ToolState["status"] {
  if (!lastAt) return "never";
  const threshold  = SILENCE_THRESHOLD[tool] ?? 24;
  const hoursSince = (Date.now() - lastAt.getTime()) / 3_600_000;
  if (hoursSince <= threshold * 0.5) return "live";
  if (hoursSince <= threshold)       return "slow";
  return "silent";
}

// ─── Classify workflow health ─────────────────────────────────────────────────
function classifyWorkflow(successRate: number | null): WorkflowState["level"] {
  if (successRate === null)                     return "no_data";
  if (successRate >= WORKFLOW_WARNING_THRESHOLD)  return "healthy";
  if (successRate >= WORKFLOW_CRITICAL_THRESHOLD) return "warning";
  return "critical";
}

// ─── Severity mapping ─────────────────────────────────────────────────────────
function toolSeverity(status: ToolState["status"]): "warning" | "error" {
  return status === "silent" ? "error" : "warning";
}

function workflowSeverity(level: WorkflowState["level"]): "warning" | "error" {
  return level === "critical" ? "error" : "warning";
}

// ─── Core detection for one workspace ────────────────────────────────────────
async function detectAnomaliesForWorkspace(workspaceId: string): Promise<void> {
  const now   = new Date();
  const d7    = new Date(now.getTime() - WORKFLOW_WINDOW_DAYS * 24 * 3_600_000);
  const state = getState(workspaceId);

  // ── 1. Tool status ──────────────────────────────────────────────────────────
  const [connections, lastEvts] = await Promise.all([
    prisma.integrationConnection.findMany({
      where:  { workspaceId, status: "connected" },
      select: { provider: true },
    }),
    prisma.touchpoint.findMany({
      where:    { workspaceId },
      orderBy:  { recordedAt: "desc" },
      distinct: ["tool"],
      select:   { tool: true, recordedAt: true },
    }),
  ]);

  const mapLast = Object.fromEntries(lastEvts.map(r => [r.tool, r.recordedAt]));

  for (const { provider: tool } of connections) {
    const currentStatus = classifyTool(mapLast[tool] ?? null, tool);
    const prevStatus    = state.tools[tool]?.status ?? null;

    // Transitions that warrant a notification
    const shouldNotify =
      prevStatus !== null &&
      prevStatus !== currentStatus &&
      (currentStatus === "slow" || currentStatus === "silent");

    if (shouldNotify) {
      const label    = tool.charAt(0).toUpperCase() + tool.slice(1);
      const severity = toolSeverity(currentStatus);
      const title    = `${label} went ${currentStatus}`;
      const body     = currentStatus === "silent"
        ? `No events received from ${label} in the last ${SILENCE_THRESHOLD[tool] ?? 24}h. Check your integration or workflow.`
        : `${label} is receiving events slower than usual (${SILENCE_THRESHOLD[tool] ?? 24}h threshold).`;

      await createNotification({ workspaceId, type: "tool_status", title, body, severity }).catch(console.error);
      console.log(`[anomaly] ${workspaceId} — ${title}`);
    }

    // Update state
    state.tools[tool] = { status: currentStatus };
  }

  // ── 2. Workflow health ──────────────────────────────────────────────────────
  const [n8nMetas, makeMetas] = await Promise.all([
    prisma.n8nWorkflowMeta.findMany({
      where:  { workspaceId },
      select: { id: true, n8nId: true, name: true },
    }),
    prisma.makeScenarioMeta.findMany({
      where:  { workspaceId },
      select: { id: true, makeId: true, name: true },
    }),
  ]);

  const eventCounts = await prisma.n8nQueuedEvent.groupBy({
    by:    ["workflowId", "status"],
    where: { workspaceId, processedAt: { gte: d7 } },
    _count: { id: true },
  });

  const byWf: Record<string, { done: number; total: number }> = {};
  for (const r of eventCounts) {
    if (!byWf[r.workflowId]) byWf[r.workflowId] = { done: 0, total: 0 };
    byWf[r.workflowId].total += r._count.id;
    if (r.status === "done") byWf[r.workflowId].done += r._count.id;
  }

  const allWorkflows = [
    ...n8nMetas.map(w => ({ id: w.id, key: w.n8nId ?? w.id, name: w.name })),
    ...makeMetas.map(s => ({ id: s.id, key: s.makeId ?? s.id, name: s.name })),
  ];

  for (const wf of allWorkflows) {
    const m = byWf[wf.key] ?? byWf[wf.id] ?? null;
    if (!m || m.total === 0) continue; // no data — skip

    const successRate    = Math.round((m.done / m.total) * 100);
    const currentLevel   = classifyWorkflow(successRate);
    const prevLevel      = state.workflows[wf.id]?.level ?? null;

    const degraded =
      prevLevel !== null &&
      prevLevel !== currentLevel &&
      (currentLevel === "warning" || currentLevel === "critical");

    if (degraded) {
      const severity = workflowSeverity(currentLevel);
      const title    = `Workflow "${wf.name}" ${currentLevel}`;
      const body     = `Success rate dropped to ${successRate}% over the last ${WORKFLOW_WINDOW_DAYS} days. Review failed events in Workflow Health.`;

      await createNotification({ workspaceId, type: "workflow_health", title, body, severity }).catch(console.error);
      console.log(`[anomaly] ${workspaceId} — ${title} (${successRate}%)`);
    }

    state.workflows[wf.id] = { level: currentLevel };
  }

  // ── 3. Event-type disappearances ────────────────────────────────────────────
  // Compare event types seen in the last 24 h vs. the previous 24–48 h window.
  const [recentTypes, prevTypes] = await Promise.all([
    prisma.touchpoint.findMany({
      where:   { workspaceId, recordedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
      select:  { eventType: true },
      distinct: ["eventType"],
    }),
    prisma.touchpoint.findMany({
      where:   {
        workspaceId,
        recordedAt: {
          gte: new Date(now.getTime() - 48 * 3_600_000),
          lt:  new Date(now.getTime() - 24 * 3_600_000),
        },
      },
      select:  { eventType: true },
      distinct: ["eventType"],
    }),
  ]);

  const recentSet = new Set(recentTypes.map(r => r.eventType));
  const prevSet   = new Set(prevTypes.map(r => r.eventType));

  for (const evtType of prevSet) {
    if (!recentSet.has(evtType) && !state.eventTypes.has(evtType)) {
      // This event type existed yesterday but has vanished today — first time we detect it
      const title = `Event type "${evtType}" disappeared`;
      const body  = `"${evtType}" was seen in the 24–48h window but has not appeared in the last 24h. A step in your pipeline may be broken.`;

      await createNotification({ workspaceId, type: "event_gap", title, body, severity: "warning" }).catch(console.error);
      console.log(`[anomaly] ${workspaceId} — ${title}`);

      state.eventTypes.add(evtType); // mark so we don't fire again until it recovers
    }
  }

  // Clear the "disappeared" memory once the event type comes back
  for (const evtType of state.eventTypes) {
    if (recentSet.has(evtType)) {
      state.eventTypes.delete(evtType);
    }
  }
}

// ─── Run detection across all workspaces ─────────────────────────────────────
export async function runAnomalyDetection(): Promise<void> {
  try {
    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    await Promise.allSettled(workspaces.map(ws => detectAnomaliesForWorkspace(ws.id)));
    console.log(`[anomaly] Scan complete — ${workspaces.length} workspace(s) checked`);
  } catch (err: any) {
    console.error("[anomaly] Detection cycle failed:", err.message);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
const DETECTION_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes

export function startAnomalyDetector(): void {
  console.log(`[anomaly] Started — scanning every ${DETECTION_INTERVAL_MS / 60_000}m`);

  // Delay the first run by 60s so DB is warm after boot
  setTimeout(() => {
    runAnomalyDetection().catch(console.error);
    setInterval(() => {
      runAnomalyDetection().catch(console.error);
    }, DETECTION_INTERVAL_MS);
  }, 60_000);
}
