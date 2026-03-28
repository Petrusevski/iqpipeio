/**
 * diagnosticEngine.ts
 *
 * Phase 2 — Root Cause Diagnosis
 *
 * Given a workspace + an issue descriptor (tool name, workflow id, or event type),
 * this engine cross-references stored data to produce a ranked list of probable
 * causes with confidence scores and evidence strings.
 *
 * Evidence sources:
 *   1. Touchpoint event timestamps  — detect sudden vs gradual drop-off
 *   2. IntegrationConnection.updatedAt — credential/config rotation timing
 *   3. N8nQueuedEvent failure ratios — workflow-side errors
 *   4. Funnel stage gaps             — identify which conversion step broke
 *   5. WorkflowMirror app connections — detect missing/misconfigured app hooks
 *   6. IqLead / Deal counts          — estimate blast radius (contacts + revenue)
 */

import { prisma } from "../db";

// ─── Silence thresholds (hours) — must mirror mcpApi.ts ──────────────────────
const SILENCE_THRESHOLD: Record<string, number> = {
  clay: 4, apollo: 6, heyreach: 6, lemlist: 6, instantly: 6,
  smartlead: 6, phantombuster: 12, replyio: 6, outreach: 12,
  clearbit: 24, zoominfo: 24, pdl: 24, hunter: 24, lusha: 24,
  cognism: 24, snovio: 24, rocketreach: 24,
  hubspot: 48, pipedrive: 48,
};

// Average deal value fallback when no deals are found
const DEFAULT_DEAL_VALUE = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProbableCause {
  cause: string;
  confidence: number;       // 0.0 – 1.0
  evidence: string;
}

export interface DiagnosticReport {
  issueId:             string;
  issueType:           "tool_silent" | "tool_slow" | "workflow_degraded" | "event_gap" | "unknown";
  subject:             string;      // tool name / workflow name / event type
  lastEventAt:         string | null;
  hoursSinceLast:      number | null;
  expectedThreshold:   number | null;
  probableCauses:      ProbableCause[];
  affectedContacts:    number;
  estimatedRevenueAtRisk: number;
  currency:            string;
  summary:             string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fetch per-hour event counts for a tool over the last N hours */
async function hourlyEventCounts(workspaceId: string, tool: string, hours: number): Promise<number[]> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows  = await prisma.touchpoint.findMany({
    where:   { workspaceId, tool, recordedAt: { gte: since } },
    select:  { recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  const buckets = new Array<number>(hours).fill(0);
  const now     = Date.now();
  for (const r of rows) {
    const idx = Math.floor((now - r.recordedAt.getTime()) / 3_600_000);
    if (idx >= 0 && idx < hours) buckets[hours - 1 - idx]++;
  }
  return buckets; // index 0 = oldest, last = most recent
}

/** Return average deal value for the workspace */
async function avgDealValue(workspaceId: string): Promise<number> {
  const result = await prisma.deal.aggregate({
    where:  { workspaceId, amount: { not: null } },
    _avg:   { amount: true },
    _count: { id: true },
  });
  return result._avg.amount ?? DEFAULT_DEAL_VALUE;
}

/** Detect whether a drop was sudden (cliff) or gradual (decay) */
function dropPattern(buckets: number[]): "sudden" | "gradual" | "none" {
  if (buckets.length < 4) return "none";
  const half = Math.floor(buckets.length / 2);
  const older = buckets.slice(0, half).reduce((a, b) => a + b, 0);
  const newer = buckets.slice(half).reduce((a, b) => a + b, 0);
  if (older === 0) return "none";
  const dropRatio = (older - newer) / older;
  if (dropRatio < 0.2) return "none";

  // Sudden: most recent bucket has 0 but prior half had activity
  const recentZero = buckets.slice(-3).every(v => v === 0);
  return recentZero && dropRatio > 0.7 ? "sudden" : "gradual";
}

// ─── Tool-level diagnosis ─────────────────────────────────────────────────────

async function diagnoseTool(workspaceId: string, tool: string): Promise<DiagnosticReport> {
  const threshold  = SILENCE_THRESHOLD[tool] ?? 24;
  const windowHrs  = Math.max(threshold * 3, 72); // look back 3× the threshold, min 72h

  const [lastEvt, connection, buckets, affectedCount, dealAvg] = await Promise.all([
    prisma.touchpoint.findFirst({
      where:   { workspaceId, tool },
      orderBy: { recordedAt: "desc" },
      select:  { recordedAt: true },
    }),
    prisma.integrationConnection.findFirst({
      where:  { workspaceId, provider: tool },
      select: { status: true, updatedAt: true, createdAt: true },
    }),
    hourlyEventCounts(workspaceId, tool, Math.min(windowHrs, 168)),
    prisma.iqLead.count({
      where: { workspaceId, touchpoints: { some: { tool } } },
    }),
    avgDealValue(workspaceId),
  ]);

  const lastAt       = lastEvt?.recordedAt ?? null;
  const hoursSince   = lastAt ? round2(hoursAgo(lastAt)) : null;
  const issueType: DiagnosticReport["issueType"] = hoursSince !== null && hoursSince > threshold ? "tool_silent" : "tool_slow";

  const causes: ProbableCause[] = [];
  const pattern = dropPattern(buckets);

  // ── Cause 1: Credential / API key rotation ────────────────────────────────
  if (connection && lastAt) {
    const credUpdatedAt = connection.updatedAt;
    const credHoursAgo  = hoursAgo(credUpdatedAt);
    const gapToEvent    = (credUpdatedAt.getTime() - lastAt.getTime()) / 3_600_000;

    if (gapToEvent > 0 && gapToEvent < 6 && pattern === "sudden") {
      causes.push({
        cause:      "api_key_rotated_or_revoked",
        confidence: 0.88,
        evidence:   `Integration config last updated ${round2(credHoursAgo)}h ago — ${round2(gapToEvent)}h after the last event, matching the silence start.`,
      });
    } else if (credHoursAgo < threshold && pattern !== "none") {
      causes.push({
        cause:      "api_key_rotated_or_revoked",
        confidence: 0.60,
        evidence:   `Integration config changed ${round2(credHoursAgo)}h ago. Events stopped ${round2(hoursSince ?? 0)}h ago. Timing is correlated.`,
      });
    }
  }

  // ── Cause 2: Webhook delivery failure (sudden cliff) ─────────────────────
  if (pattern === "sudden") {
    causes.push({
      cause:      "webhook_delivery_failed",
      confidence: 0.75,
      evidence:   `Event count dropped to zero abruptly (cliff pattern). This is consistent with a broken webhook endpoint, a firewall rule, or an IP block.`,
    });
  }

  // ── Cause 3: Rate-limiting / quota exhaustion ─────────────────────────────
  if (pattern === "gradual") {
    causes.push({
      cause:      "rate_limit_or_quota_exhausted",
      confidence: 0.65,
      evidence:   `Event count declined gradually over the last ${Math.min(windowHrs, 168)}h window rather than stopping abruptly. Gradual decay matches rate-limiting or plan quota exhaustion.`,
    });
  }

  // ── Cause 4: Integration disconnected / paused ───────────────────────────
  if (connection?.status !== "connected") {
    causes.push({
      cause:      "integration_disconnected",
      confidence: 0.92,
      evidence:   `Integration status in IQPipe is "${connection?.status ?? "unknown"}". Re-connect the integration in Settings → Connected Apps.`,
    });
  }

  // ── Cause 5: No events ever / misconfigured from the start ───────────────
  if (!lastAt) {
    causes.push({
      cause:      "never_received_events",
      confidence: 0.90,
      evidence:   `IQPipe has never recorded a touchpoint from ${tool}. The integration may not be forwarding events yet — check the webhook URL or automation trigger.`,
    });
  }

  // ── Cause 6: Downstream workflow stopped feeding events ───────────────────
  const workflowFailures = await prisma.n8nQueuedEvent.groupBy({
    by:    ["status"],
    where: { workspaceId, sourceApp: tool, processedAt: { gte: new Date(Date.now() - 48 * 3_600_000) } },
    _count: { id: true },
  });
  const totalWfEvents = workflowFailures.reduce((s, r) => s + r._count.id, 0);
  const failedWfEvents = workflowFailures.find(r => r.status === "failed")?._count.id ?? 0;
  if (totalWfEvents > 0 && failedWfEvents / totalWfEvents > 0.3) {
    causes.push({
      cause:      "workflow_processing_errors",
      confidence: round2(0.5 + (failedWfEvents / totalWfEvents) * 0.4),
      evidence:   `${failedWfEvents}/${totalWfEvents} events from ${tool} failed processing in the last 48h (${Math.round(failedWfEvents / totalWfEvents * 100)}% failure rate). Check Workflow Health for error details.`,
    });
  }

  // Sort by confidence descending
  causes.sort((a, b) => b.confidence - a.confidence);

  // Revenue at risk: contacts × avg deal value × 10% funnel-to-close rate
  const estimatedRevenueAtRisk = Math.round(affectedCount * dealAvg * 0.1);

  const topCause = causes[0];
  const summary  = topCause
    ? `Most likely cause: ${topCause.cause.replace(/_/g, " ")} (${Math.round(topCause.confidence * 100)}% confidence). ${topCause.evidence}`
    : `${tool} has been silent for ${round2(hoursSince ?? 0)}h (threshold: ${threshold}h). No specific cause could be determined from available data — verify the integration manually.`;

  return {
    issueId:             `${tool}_${issueType}`,
    issueType,
    subject:             tool,
    lastEventAt:         lastAt?.toISOString() ?? null,
    hoursSinceLast:      hoursSince,
    expectedThreshold:   threshold,
    probableCauses:      causes,
    affectedContacts:    affectedCount,
    estimatedRevenueAtRisk,
    currency:            "USD",
    summary,
  };
}

// ─── Workflow-level diagnosis ─────────────────────────────────────────────────

async function diagnoseWorkflow(workspaceId: string, workflowId: string): Promise<DiagnosticReport> {
  const since7d = new Date(Date.now() - 7 * 24 * 3_600_000);
  const since1d = new Date(Date.now() - 24 * 3_600_000);

  const [meta, counts7d, counts1d, dealAvg] = await Promise.all([
    // Resolve from both n8n and make — cast to any to avoid conflicting select shapes
    (async () => {
      const n8n = await prisma.n8nWorkflowMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] }, select: { id: true, name: true } });
      if (n8n) return n8n as { id: string; name: string };
      const make = await prisma.makeScenarioMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] }, select: { id: true, name: true } });
      return make as { id: string; name: string } | null;
    })(),
    prisma.n8nQueuedEvent.groupBy({
      by:    ["status"],
      where: { workspaceId, workflowId, processedAt: { gte: since7d } },
      _count: { id: true },
    }),
    prisma.n8nQueuedEvent.groupBy({
      by:    ["status"],
      where: { workspaceId, workflowId, processedAt: { gte: since1d } },
      _count: { id: true },
    }),
    avgDealValue(workspaceId),
  ]);

  const name = (meta as any)?.name ?? workflowId;

  const total7d  = counts7d.reduce((s, r) => s + r._count.id, 0);
  const failed7d = counts7d.find(r => r.status === "failed")?._count.id ?? 0;
  const total1d  = counts1d.reduce((s, r) => s + r._count.id, 0);
  const failed1d = counts1d.find(r => r.status === "failed")?._count.id ?? 0;

  const rate7d = total7d > 0 ? Math.round((1 - failed7d / total7d) * 100) : null;
  const rate1d = total1d > 0 ? Math.round((1 - failed1d / total1d) * 100) : null;

  const causes: ProbableCause[] = [];

  // ── Cause 1: Sudden spike in failures in last 24h ────────────────────────
  if (rate1d !== null && rate7d !== null && rate1d < rate7d - 20) {
    causes.push({
      cause:      "recent_failure_spike",
      confidence: round2(0.7 + Math.min((rate7d - rate1d) / 100, 0.25)),
      evidence:   `Success rate dropped from ${rate7d}% (7d avg) to ${rate1d}% in the last 24h — a ${rate7d - rate1d}pt degradation. Something changed recently.`,
    });
  }

  // ── Cause 2: Consistently high failure rate ───────────────────────────────
  if (rate7d !== null && rate7d < 70) {
    causes.push({
      cause:      "persistent_processing_errors",
      confidence: round2(0.55 + (70 - rate7d) / 100),
      evidence:   `7-day success rate is ${rate7d}% (${failed7d} failures out of ${total7d} events). The workflow has been unreliable for an extended period.`,
    });
  }

  // ── Cause 3: No events processed at all ──────────────────────────────────
  if (total7d === 0) {
    causes.push({
      cause:      "workflow_not_triggering",
      confidence: 0.85,
      evidence:   `No events processed by this workflow in the last 7 days. The trigger may be disabled, the source app disconnected, or the schedule changed.`,
    });
  }

  // ── Cause 4: App connection missing for workflow ──────────────────────────
  const mirror = await prisma.workflowMirror.findFirst({
    where:   { workspaceId, workflowId },
    include: { appConnections: { select: { appKey: true, status: true } } },
  });
  if (mirror) {
    const brokenApps = (mirror.appConnections as any[]).filter(c => c.status !== "connected");
    if (brokenApps.length > 0) {
      causes.push({
        cause:      "app_connection_broken",
        confidence: 0.80,
        evidence:   `${brokenApps.length} app connection(s) in the workflow mirror are not "connected": ${brokenApps.map((a: any) => a.appKey).join(", ")}. Re-connect them in Workflow Settings.`,
      });
    }
  }

  causes.sort((a, b) => b.confidence - a.confidence);

  // Affected contacts: leads that have a touchpoint from this workflow
  const affectedContacts = await prisma.iqLead.count({
    where: { workspaceId, touchpoints: { some: { workspaceId, workflowId } } },
  });

  const estimatedRevenueAtRisk = Math.round(affectedContacts * dealAvg * 0.1);

  const topCause = causes[0];
  const summary  = topCause
    ? `Most likely cause: ${topCause.cause.replace(/_/g, " ")} (${Math.round(topCause.confidence * 100)}% confidence). ${topCause.evidence}`
    : `Workflow "${name}" is degraded (${rate7d ?? "?"}% success rate) but no specific root cause was identified from available data.`;

  return {
    issueId:             `workflow_${workflowId}_degraded`,
    issueType:           "workflow_degraded",
    subject:             name,
    lastEventAt:         null,
    hoursSinceLast:      null,
    expectedThreshold:   null,
    probableCauses:      causes,
    affectedContacts,
    estimatedRevenueAtRisk,
    currency:            "USD",
    summary,
  };
}

// ─── Event-type disappearance diagnosis ──────────────────────────────────────

async function diagnoseEventGap(workspaceId: string, eventType: string): Promise<DiagnosticReport> {
  const since48h = new Date(Date.now() - 48 * 3_600_000);
  const since24h = new Date(Date.now() - 24 * 3_600_000);

  const [lastEvt, countPrev, countRecent, toolsInvolved, dealAvg] = await Promise.all([
    prisma.touchpoint.findFirst({
      where:   { workspaceId, eventType },
      orderBy: { recordedAt: "desc" },
      select:  { recordedAt: true, tool: true },
    }),
    prisma.touchpoint.count({ where: { workspaceId, eventType, recordedAt: { gte: since48h, lt: since24h } } }),
    prisma.touchpoint.count({ where: { workspaceId, eventType, recordedAt: { gte: since24h } } }),
    prisma.touchpoint.groupBy({
      by:    ["tool"],
      where: { workspaceId, eventType, recordedAt: { gte: since48h } },
      _count: { id: true },
    }),
    avgDealValue(workspaceId),
  ]);

  const lastAt     = lastEvt?.recordedAt ?? null;
  const hoursSince = lastAt ? round2(hoursAgo(lastAt)) : null;

  const causes: ProbableCause[] = [];

  // ── Cause 1: All producing tools went silent ──────────────────────────────
  if (toolsInvolved.length > 0) {
    const toolNames = toolsInvolved.map(r => r.tool);
    const silentTools = await Promise.all(
      toolNames.map(t =>
        prisma.touchpoint.findFirst({
          where:   { workspaceId, tool: t },
          orderBy: { recordedAt: "desc" },
          select:  { recordedAt: true },
        }).then(r => ({ tool: t, silent: !r || hoursAgo(r.recordedAt) > (SILENCE_THRESHOLD[t] ?? 24) }))
      )
    );
    const nowSilent = silentTools.filter(t => t.silent).map(t => t.tool);
    if (nowSilent.length === toolNames.length) {
      causes.push({
        cause:      "all_source_tools_silent",
        confidence: 0.85,
        evidence:   `"${eventType}" was produced by ${toolNames.join(", ")} — all of which are now silent. Check each tool's integration status.`,
      });
    } else if (nowSilent.length > 0) {
      causes.push({
        cause:      "partial_source_tool_failure",
        confidence: 0.65,
        evidence:   `${nowSilent.length} of ${toolNames.length} tools that produce "${eventType}" are now silent: ${nowSilent.join(", ")}.`,
      });
    }
  }

  // ── Cause 2: Funnel step upstream broke ──────────────────────────────────
  const FUNNEL_ORDER: Record<string, number> = {
    contact_created: 1, email_sent: 2, email_opened: 3, email_clicked: 4,
    reply_received: 5, meeting_booked: 6, deal_created: 7,
    deal_won: 8, deal_lost: 8,
  };
  const pos = FUNNEL_ORDER[eventType];
  if (pos && pos > 1) {
    const upstreamType = Object.entries(FUNNEL_ORDER).find(([, p]) => p === pos - 1)?.[0];
    if (upstreamType) {
      const upstreamRecent = await prisma.touchpoint.count({
        where: { workspaceId, eventType: upstreamType, recordedAt: { gte: since24h } },
      });
      if (upstreamRecent === 0) {
        causes.push({
          cause:      "upstream_funnel_step_broken",
          confidence: 0.78,
          evidence:   `Upstream event "${upstreamType}" also has zero events in the last 24h. The pipeline is broken earlier in the funnel — "${eventType}" can't fire if "${upstreamType}" isn't happening.`,
        });
      }
    }
  }

  // ── Cause 3: Sharp volume drop (not total disappearance) ─────────────────
  if (countPrev > 0 && countRecent === 0) {
    causes.push({
      cause:      "event_type_filter_removed_or_trigger_changed",
      confidence: 0.60,
      evidence:   `${countPrev} "${eventType}" events in the 24–48h window but 0 in the last 24h. A workflow filter, trigger condition, or data mapping may have been edited.`,
    });
  }

  causes.sort((a, b) => b.confidence - a.confidence);

  // Affected contacts: those who had this event type in the last 7 days
  const affectedContacts = await prisma.iqLead.count({
    where: {
      workspaceId,
      touchpoints: {
        some: {
          workspaceId,
          eventType,
          recordedAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) },
        },
      },
    },
  });

  const estimatedRevenueAtRisk = Math.round(affectedContacts * dealAvg * 0.1);

  const topCause = causes[0];
  const summary  = topCause
    ? `Most likely cause: ${topCause.cause.replace(/_/g, " ")} (${Math.round(topCause.confidence * 100)}% confidence). ${topCause.evidence}`
    : `"${eventType}" disappeared from the feed ${round2(hoursSince ?? 0)}h ago. No specific root cause identified — check source tool connections.`;

  return {
    issueId:             `event_gap_${eventType}`,
    issueType:           "event_gap",
    subject:             eventType,
    lastEventAt:         lastAt?.toISOString() ?? null,
    hoursSinceLast:      hoursSince,
    expectedThreshold:   24,
    probableCauses:      causes,
    affectedContacts,
    estimatedRevenueAtRisk,
    currency:            "USD",
    summary,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * diagnose(workspaceId, { tool?, workflowId?, eventType? })
 *
 * Exactly one of tool / workflowId / eventType must be provided.
 */
export async function diagnose(
  workspaceId: string,
  params: { tool?: string; workflowId?: string; eventType?: string }
): Promise<DiagnosticReport> {
  const { tool, workflowId, eventType } = params;

  if (tool)        return diagnoseTool(workspaceId, tool);
  if (workflowId)  return diagnoseWorkflow(workspaceId, workflowId);
  if (eventType)   return diagnoseEventGap(workspaceId, eventType);

  return {
    issueId:             "unknown",
    issueType:           "unknown",
    subject:             "unknown",
    lastEventAt:         null,
    hoursSinceLast:      null,
    expectedThreshold:   null,
    probableCauses:      [],
    affectedContacts:    0,
    estimatedRevenueAtRisk: 0,
    currency:            "USD",
    summary:             "No issue descriptor provided. Pass tool, workflowId, or eventType.",
  };
}
