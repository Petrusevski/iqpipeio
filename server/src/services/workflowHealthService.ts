/**
 * workflowHealthService.ts
 *
 * Shared query logic for the workflow-health / pipeline intelligence feature.
 * Called by both:
 *   - GET /api/workflow-health       (dashboard, requireAuth)
 *   - GET /api/mcp/workflow-health   (MCP API key, requireApiKey)
 *
 * All metrics read from the LeadActivitySummary materialized table.
 */

import { prisma } from "../db";

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "all": 9999 };

function hf(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export async function getWorkflowHealthData(workspaceId: string, period: string) {
  const days  = PERIOD_DAYS[period] ?? 30;
  const since = days < 9999 ? new Date(Date.now() - days * 86_400_000) : new Date(0);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SIGNAL-TO-ACTION LATENCY
  // ───────────────────────────────────────────────────────────────────────────
  const latencyGroups = await prisma.leadActivitySummary.groupBy({
    by: ["latencyBucket"],
    where: {
      workspaceId,
      latencyBucket: { not: null },
      importedAt: { gte: since },
    },
    _count: { iqLeadId: true },
  });

  const latencyRaw = await prisma.leadActivitySummary.findMany({
    where: {
      workspaceId,
      latencyHours: { not: null },
      importedAt: { gte: since },
    },
    select: { latencyHours: true },
    take: 2000,
  });

  const latencyHours = latencyRaw.map(r => r.latencyHours!);
  const sortedLat    = [...latencyHours].sort((a, b) => a - b);
  const avgLatency   = latencyHours.length
    ? latencyHours.reduce((a, b) => a + b, 0) / latencyHours.length
    : null;
  const medLatency   = sortedLat.length ? sortedLat[Math.floor(sortedLat.length / 2)] : null;

  const bucketMap: Record<string, number> = {};
  for (const g of latencyGroups) bucketMap[g.latencyBucket!] = g._count.iqLeadId;

  const latencyBuckets = [
    { label: "< 4 hours",  key: "sub4h",   count: bucketMap["sub4h"]   ?? 0, color: "emerald" },
    { label: "4–24 hours", key: "4to24h",  count: bucketMap["4to24h"]  ?? 0, color: "blue"    },
    { label: "1–3 days",   key: "1to3d",   count: bucketMap["1to3d"]   ?? 0, color: "amber"   },
    { label: "3–7 days",   key: "3to7d",   count: bucketMap["3to7d"]   ?? 0, color: "orange"  },
    { label: "> 7 days",   key: "over7d",  count: bucketMap["over7d"]  ?? 0, color: "rose"    },
  ];

  const fastCount     = bucketMap["sub4h"] ?? 0;
  const totalMeasured = latencyHours.length;
  const fastPct       = totalMeasured > 0 ? (fastCount / totalMeasured) * 100 : 0;

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CONTACT FREQUENCY (7-day window)
  // ───────────────────────────────────────────────────────────────────────────
  const freqGroups = await prisma.leadActivitySummary.groupBy({
    by: ["frequencyBucket"],
    where: { workspaceId },
    _count: { iqLeadId: true },
  });

  const freqMap: Record<string, number> = {};
  for (const g of freqGroups) freqMap[g.frequencyBucket ?? "0"] = g._count.iqLeadId;

  const freqBuckets = [
    { label: "No contact",   range: "0",   count: freqMap["0"]   ?? 0, color: "slate"   },
    { label: "Light",        range: "1-2", count: freqMap["1-2"] ?? 0, color: "blue"    },
    { label: "Healthy",      range: "3-5", count: freqMap["3-5"] ?? 0, color: "emerald" },
    { label: "High",         range: "6-9", count: freqMap["6-9"] ?? 0, color: "amber"   },
    { label: "Over-touched", range: "10+", count: freqMap["10+"] ?? 0, color: "rose"    },
  ];

  const overTouchedCount = freqMap["10+"] ?? 0;
  const totalLeads       = Object.values(freqMap).reduce((a, b) => a + b, 0);
  const overTouchedPct   = totalLeads > 0 ? overTouchedCount / totalLeads : 0;

  const overTouchedRows = await prisma.leadActivitySummary.findMany({
    where: { workspaceId, touchCount7d: { gte: 10 } },
    orderBy: { touchCount7d: "desc" },
    take: 5,
    select: {
      touchCount7d: true,
      iqLead: { select: { displayName: true, company: true, title: true } },
    },
  });

  const overTouchedLeads = overTouchedRows.map(r => ({
    displayName: r.iqLead?.displayName ?? "Unknown",
    company:     r.iqLead?.company     ?? "—",
    title:       r.iqLead?.title       ?? "",
    count:       r.touchCount7d,
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PIPELINE COVERAGE GAPS
  // ───────────────────────────────────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [totalImported, gapCount, withOutreachCount] = await Promise.all([
    prisma.leadActivitySummary.count({
      where: { workspaceId, importedAt: { not: null } },
    }),
    prisma.leadActivitySummary.count({
      where: {
        workspaceId,
        importedAt: { lt: sevenDaysAgo, not: null },
        firstOutreachAt: null,
      },
    }),
    prisma.leadActivitySummary.count({
      where: { workspaceId, firstOutreachAt: { not: null } },
    }),
  ]);

  const gapPct = totalImported > 0 ? gapCount / totalImported : 0;

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MULTI-STEP PIPELINE FUNNEL
  // ───────────────────────────────────────────────────────────────────────────
  const funnelGroups = await prisma.leadActivitySummary.groupBy({
    by: ["funnelStage"],
    where: { workspaceId },
    _count: { iqLeadId: true },
  });

  const stageCountMap: Record<string, number> = {};
  for (const g of funnelGroups) stageCountMap[g.funnelStage] = g._count.iqLeadId;

  const stageOrder = ["imported", "enriched", "contacted", "engaged", "replied", "meeting", "won"];
  const stageLabels: Record<string, string> = {
    imported: "Imported", enriched: "Enriched", contacted: "Contacted",
    engaged: "Engaged", replied: "Replied", meeting: "Meeting", won: "Won",
  };

  const funnelSteps = stageOrder.map((stage, i) => {
    const count = stageOrder.slice(i).reduce((sum, s) => sum + (stageCountMap[s] ?? 0), 0);
    const prev  = i === 0 ? count
      : stageOrder.slice(i - 1).reduce((sum, s) => sum + (stageCountMap[s] ?? 0), 0);
    const pct     = i === 0 || prev === 0 ? 100 : Math.round((count / prev) * 100);
    const dropPct = i === 0 ? null : 100 - pct;
    return { label: stageLabels[stage], count, pct, dropPct };
  });

  let biggestDrop = ""; let maxDrop = 0;
  for (const s of funnelSteps) {
    if (s.dropPct !== null && s.dropPct > maxDrop) { maxDrop = s.dropPct; biggestDrop = s.label; }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. TOP CONVERTING TOUCHPOINT PATHS
  // ───────────────────────────────────────────────────────────────────────────
  const OUTREACH_EVENTS = new Set([
    "email_sent", "sequence_started", "message_sent",
    "connection_sent", "connection_request_sent",
  ]);
  const POSITIVE_EVENTS = new Set([
    "reply_received", "meeting_booked", "deal_won", "deal_created",
  ]);

  const activeLeadIds = await prisma.leadActivitySummary.findMany({
    where: { workspaceId, lastOutreachAt: { gte: since } },
    select: { iqLeadId: true },
    orderBy: { lastOutreachAt: "desc" },
    take: 500,
  });

  const iqLeadIdSet = activeLeadIds.map(r => r.iqLeadId);

  const [periodTps, outcomes] = await Promise.all([
    iqLeadIdSet.length > 0
      ? prisma.touchpoint.findMany({
          where: {
            workspaceId,
            iqLeadId: { in: iqLeadIdSet },
            recordedAt: { gte: since },
          },
          select: { iqLeadId: true, eventType: true, recordedAt: true },
          orderBy: { recordedAt: "asc" },
        })
      : Promise.resolve([]),
    iqLeadIdSet.length > 0
      ? prisma.outcome.findMany({
          where: {
            workspaceId,
            iqLeadId: { in: iqLeadIdSet },
            recordedAt: { gte: since },
          },
          select: { iqLeadId: true },
        })
      : Promise.resolve([]),
  ]);

  const byLead = new Map<string, { eventType: string; recordedAt: Date }[]>();
  for (const tp of periodTps) {
    if (!byLead.has(tp.iqLeadId)) byLead.set(tp.iqLeadId, []);
    byLead.get(tp.iqLeadId)!.push(tp);
  }

  const outcomeLeads = new Set(outcomes.map(o => o.iqLeadId));
  const pathMap = new Map<string, { count: number; outcomes: number }>();

  for (const [leadId, events] of byLead) {
    const path: string[] = [];
    for (const e of events) {
      if (!OUTREACH_EVENTS.has(e.eventType) && !POSITIVE_EVENTS.has(e.eventType)) continue;
      if (path[path.length - 1] !== e.eventType) path.push(e.eventType);
      if (path.length >= 5) break;
    }
    if (path.length < 2) continue;
    const key = path.join(" → ");
    const ex  = pathMap.get(key) ?? { count: 0, outcomes: 0 };
    ex.count++;
    if (outcomeLeads.has(leadId)) ex.outcomes++;
    pathMap.set(key, ex);
  }

  const topPaths = [...pathMap.entries()]
    .map(([key, d]) => ({
      path:     key.split(" → "),
      count:    d.count,
      outcomes: d.outcomes,
      convRate: d.count > 0 ? Math.round((d.outcomes / d.count) * 100) : 0,
    }))
    .filter(p => p.count >= 2)
    .sort((a, b) => b.outcomes - a.outcomes || b.count - a.count)
    .slice(0, 6);

  // ───────────────────────────────────────────────────────────────────────────
  // 6. ENRICHMENT FRESHNESS
  // ───────────────────────────────────────────────────────────────────────────
  const last30 = new Date(Date.now() - 30 * 86_400_000);

  const enrichGroups = await prisma.leadActivitySummary.groupBy({
    by: ["enrichmentBucket"],
    where: { workspaceId, lastOutreachAt: { gte: last30 } },
    _count: { iqLeadId: true },
  });

  const enrichMap: Record<string, number> = {};
  for (const g of enrichGroups) enrichMap[g.enrichmentBucket ?? "never"] = g._count.iqLeadId;

  const enrichBuckets = [
    { label: "Fresh",      days: "< 30 days",   key: "fresh",      count: enrichMap["fresh"]      ?? 0, color: "emerald" },
    { label: "Aging",      days: "30–90 days",  key: "aging",      count: enrichMap["aging"]      ?? 0, color: "blue"    },
    { label: "Stale",      days: "90–180 days", key: "stale",      count: enrichMap["stale"]      ?? 0, color: "amber"   },
    { label: "Very Stale", days: "> 180 days",  key: "very_stale", count: enrichMap["very_stale"] ?? 0, color: "rose"    },
  ];

  const neverEnriched    = enrichMap["never"] ?? 0;
  const activeWithStale  = (enrichMap["stale"] ?? 0) + (enrichMap["very_stale"] ?? 0);
  const freshEnrichCount = enrichMap["fresh"] ?? 0;
  const activeTotal      = Object.values(enrichMap).reduce((a, b) => a + b, 0);
  const freshEnrichPct   = activeTotal > 0 ? (freshEnrichCount / activeTotal) * 100 : 100;

  // ───────────────────────────────────────────────────────────────────────────
  // COMPOSITE HEALTH SCORE (0–100)
  // ───────────────────────────────────────────────────────────────────────────
  const scores = [
    Math.min(25, fastPct * 0.25),
    Math.min(25, (1 - overTouchedPct) * 25),
    Math.min(25, (1 - gapPct) * 25),
    Math.min(25, freshEnrichPct * 0.25),
  ];
  const healthScore = Math.round(scores.reduce((a, b) => a + b, 0));

  return {
    period,
    healthScore,
    latency: {
      buckets:         latencyBuckets,
      avgHours:        avgLatency !== null ? +avgLatency.toFixed(1)  : null,
      medianHours:     medLatency !== null ? +medLatency.toFixed(1)  : null,
      avgFormatted:    avgLatency !== null ? hf(avgLatency)          : null,
      medianFormatted: medLatency !== null ? hf(medLatency)          : null,
      fastPct:         Math.round(fastPct),
      totalMeasured,
      insight: totalMeasured === 0
        ? "No latency data — connect a tool and start importing leads"
        : fastPct >= 50
        ? `${Math.round(fastPct)}% of leads contacted within 4 hours of import`
        : `Only ${Math.round(fastPct)}% contacted within 4 hours — slow response is costing conversions`,
    },
    frequency: {
      buckets:          freqBuckets,
      overTouchedCount,
      overTouchedLeads,
      insight: overTouchedCount === 0
        ? "No over-touched leads detected this week"
        : `${overTouchedCount} lead${overTouchedCount !== 1 ? "s" : ""} hit 10+ touches/week — high unsubscribe risk`,
    },
    coverage: {
      totalImported,
      withOutreach: withOutreachCount,
      gaps:         gapCount,
      gapPct:       Math.round(gapPct * 100),
      insight: gapCount === 0
        ? "All imported leads have received outreach"
        : `${gapCount} imported lead${gapCount !== 1 ? "s" : ""} (${Math.round(gapPct * 100)}%) never received any outreach`,
    },
    funnel: { steps: funnelSteps, biggestDrop },
    paths:  { top: topPaths, totalWithOutcome: outcomeLeads.size },
    enrichment: {
      buckets:        enrichBuckets,
      activeWithStale,
      neverEnriched,
      freshEnrichPct: Math.round(freshEnrichPct),
      activeTotal,
      insight: neverEnriched > 0
        ? `${neverEnriched} active lead${neverEnriched !== 1 ? "s" : ""} were never enriched — sequences running on incomplete data`
        : activeWithStale > 0
        ? `${activeWithStale} active lead${activeWithStale !== 1 ? "s" : ""} with enrichment older than 90 days`
        : "Enrichment data is current across all active leads",
    },
  };
}
