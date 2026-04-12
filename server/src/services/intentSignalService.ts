/**
 * intentSignalService.ts
 *
 * Queries intent_signal Touchpoints for a workspace or a specific lead.
 *
 * Intent signals are already ingested via existing webhook handlers:
 *   /webhooks/clearbit  → eventType = "intent_signal" (Clearbit Reveal)
 *   /webhooks/zoominfo  → eventType = "intent_signal" (ZoomInfo Intent)
 *   /webhooks/generic   → eventType = "intent_signal" (Bombora, G2, 6sense via n8n)
 *
 * This service surfaces those signals for Claude via the MCP tool.
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntentSignal {
  iqLeadId:    string;
  displayName: string | null;
  company:     string | null;
  tool:        string;
  meta:        Record<string, any>;
  recordedAt:  string;
}

export interface IntentSignalSummary {
  windowDays:     number;
  totalSignals:   number;
  byTool:         Record<string, number>;
  topLeads:       IntentSignal[];   // leads with most signals, de-duped
  recentSignals:  IntentSignal[];   // chronological, most recent first
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getIntentSignals(
  workspaceId: string,
  opts: {
    windowDays?: number;
    iqLeadId?:   string;
    tool?:       string;
    limit?:      number;
  } = {},
): Promise<IntentSignalSummary> {
  const windowDays = opts.windowDays ?? 30;
  const limit      = opts.limit      ?? 50;
  const since      = new Date(Date.now() - windowDays * 86_400_000);

  const where: any = {
    workspaceId,
    eventType: "intent_signal",
    recordedAt: { gte: since },
  };
  if (opts.iqLeadId) where.iqLeadId = opts.iqLeadId;
  if (opts.tool)     where.tool     = { equals: opts.tool, mode: "insensitive" };

  const rows = await prisma.touchpoint.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    take:    limit,
    select: {
      iqLeadId:   true,
      tool:       true,
      meta:       true,
      recordedAt: true,
      iqLead: {
        select: { displayName: true, company: true },
      },
    },
  });

  // Count by tool
  const byTool: Record<string, number> = {};
  for (const r of rows) {
    byTool[r.tool] = (byTool[r.tool] ?? 0) + 1;
  }

  const toSignal = (r: typeof rows[0]): IntentSignal => ({
    iqLeadId:    r.iqLeadId,
    displayName: r.iqLead.displayName,
    company:     r.iqLead.company,
    tool:        r.tool,
    meta:        r.meta ? (() => { try { return JSON.parse(r.meta!); } catch { return {}; } })() : {},
    recordedAt:  r.recordedAt.toISOString(),
  });

  // Top leads: de-dupe by iqLeadId, sort by signal count
  const leadSignalCount: Record<string, number> = {};
  const leadLatestSignal: Record<string, typeof rows[0]> = {};
  for (const r of rows) {
    leadSignalCount[r.iqLeadId] = (leadSignalCount[r.iqLeadId] ?? 0) + 1;
    if (!leadLatestSignal[r.iqLeadId]) leadLatestSignal[r.iqLeadId] = r;
  }

  const topLeads = Object.entries(leadSignalCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => toSignal(leadLatestSignal[id]));

  return {
    windowDays,
    totalSignals:  rows.length,
    byTool,
    topLeads,
    recentSignals: rows.slice(0, 20).map(toSignal),
  };
}
