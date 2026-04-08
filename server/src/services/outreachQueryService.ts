/**
 * outreachQueryService.ts
 *
 * Shared query layer for the outreach observability MCP tools.
 * All functions read from OutreachLead, OutreachMetric, WebhookDeliveryLog,
 * and Touchpoint. No writes happen here.
 *
 * Tools served:
 *   get_outreach_overview      — health snapshot of all active sequences
 *   get_stuck_leads            — leads with no progression in N days
 *   get_sequence_funnel        — step-by-step conversion for one sequence
 *   get_lead_journey           — full timeline for a lead (by email)
 *   get_webhook_reliability    — event volume + drop rates per tool
 *   get_outcome_attribution    — which sequences drove meetings / deals
 */

import crypto from "crypto";
import { prisma } from "../db";
import { decrypt } from "../utils/encryption";

// ─── Constants ────────────────────────────────────────────────────────────────

const HASH_KEY = process.env.LEAD_HASH_KEY || "iqpipe-identity-hmac-v1-change-in-prod";

const POSITIVE_OUTCOMES = new Set([
  "reply_received", "positive_reply", "interested_reply",
  "meeting_booked", "demo_completed", "connection_accepted",
  "inmail_replied",
]);

const ENTRY_EVENTS = new Set([
  "sequence_started", "email_sent", "message_sent",
  "connection_sent", "connection_request_sent", "inmail_sent",
]);

const OUTCOME_EVENTS = new Set([
  "deal_won", "deal_created", "meeting_booked", "demo_completed",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hmac(value: string): string {
  return crypto.createHmac("sha256", HASH_KEY).update(value).digest("hex");
}

function hashEmail(raw: string): string {
  return hmac(raw.toLowerCase().trim());
}

function safeDecrypt(enc: string | null): string | null {
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

// ─── get_outreach_overview ────────────────────────────────────────────────────

export interface SequenceSummary {
  sequenceId:    string;
  tool:          string;
  totalLeads:    number;
  totalSends:    number;
  replies:       number;
  meetings:      number;
  connections:   number;
  replyRate:     number;   // 0–100 %
  meetingRate:   number;   // 0–100 %
  lastActivityAt: string | null;
}

export async function getOutreachOverview(workspaceId: string): Promise<{
  totalLeads: number;
  activeSequences: number;
  sequences: SequenceSummary[];
  topConvertingSequence: string | null;
}> {
  // All metrics, grouped by sequenceId + tool so we can roll up per sequence
  const rows = await prisma.outreachMetric.findMany({
    where:   { workspaceId, sequenceId: { not: "" } },
    select:  { sequenceId: true, tool: true, leadId: true, eventType: true, count: true, lastAt: true },
  });

  // Distinct lead count across workspace
  const totalLeads = await prisma.outreachLead.count({ where: { workspaceId } });

  // Aggregate by sequenceId
  const bySeq: Record<string, {
    tool: string;
    leadIds: Set<string>;
    sends: number;
    replies: number;
    meetings: number;
    connections: number;
    lastAt: Date | null;
  }> = {};

  for (const row of rows) {
    if (!bySeq[row.sequenceId]) {
      bySeq[row.sequenceId] = {
        tool: row.tool, leadIds: new Set(), sends: 0,
        replies: 0, meetings: 0, connections: 0, lastAt: null,
      };
    }
    const s = bySeq[row.sequenceId];
    s.leadIds.add(row.leadId);
    if (row.lastAt && (!s.lastAt || row.lastAt > s.lastAt)) s.lastAt = row.lastAt;

    if (ENTRY_EVENTS.has(row.eventType))                           s.sends       += row.count;
    if (["reply_received","positive_reply","interested_reply","inmail_replied"].includes(row.eventType)) s.replies  += row.count;
    if (["meeting_booked","demo_completed"].includes(row.eventType)) s.meetings  += row.count;
    if (["connection_accepted"].includes(row.eventType))             s.connections += row.count;
  }

  const sequences: SequenceSummary[] = Object.entries(bySeq).map(([sequenceId, s]) => {
    const total      = s.leadIds.size;
    const replyRate  = total > 0 ? Math.round((s.replies  / total) * 1000) / 10 : 0;
    const meetRate   = total > 0 ? Math.round((s.meetings / total) * 1000) / 10 : 0;
    return {
      sequenceId,
      tool:           s.tool,
      totalLeads:     total,
      totalSends:     s.sends,
      replies:        s.replies,
      meetings:       s.meetings,
      connections:    s.connections,
      replyRate,
      meetingRate:    meetRate,
      lastActivityAt: s.lastAt?.toISOString() ?? null,
    };
  }).sort((a, b) => b.totalLeads - a.totalLeads);

  const top = sequences.reduce<SequenceSummary | null>((best, s) => {
    if (!best) return s;
    return s.replyRate > best.replyRate ? s : best;
  }, null);

  return {
    totalLeads,
    activeSequences: sequences.length,
    sequences,
    topConvertingSequence: top?.sequenceId ?? null,
  };
}

// ─── get_stuck_leads ──────────────────────────────────────────────────────────

export interface StuckLead {
  leadId:       string;
  displayName:  string;
  company:      string | null;
  email:        string | null;
  tool:         string;
  sequenceId:   string | null;
  firstEntryAt: string;
  lastActivityAt: string;
  daysSilent:   number;
  sendCount:    number;
  hasReplied:   boolean;
}

export async function getStuckLeads(
  workspaceId: string,
  opts: { sequenceId?: string; daysSilent?: number; limit?: number },
): Promise<StuckLead[]> {
  const days  = opts.daysSilent ?? 5;
  const limit = opts.limit      ?? 50;
  const cutoff = new Date(Date.now() - days * 86_400_000);

  // Find leads that entered a sequence and went silent
  const staleLeads = await prisma.outreachLead.findMany({
    where: {
      workspaceId,
      lastEventAt: { lt: cutoff },
    },
    orderBy: { lastEventAt: "asc" },
    take: limit * 2, // over-fetch; we filter below
    select: {
      id: true, displayName: true, company: true,
      emailEnc: true, firstTool: true, firstSequenceAt: true, lastEventAt: true,
      metrics: {
        select: { eventType: true, count: true, sequenceId: true, lastAt: true },
        where:  opts.sequenceId ? { sequenceId: opts.sequenceId } : undefined,
      },
    },
  });

  const result: StuckLead[] = [];

  for (const lead of staleLeads) {
    const metrics = lead.metrics;

    // Must have at least one entry event
    const hasSend = metrics.some(m => ENTRY_EVENTS.has(m.eventType) && m.count > 0);
    if (!hasSend) continue;

    const hasReplied = metrics.some(m => POSITIVE_OUTCOMES.has(m.eventType) && m.count > 0);
    const sendCount  = metrics
      .filter(m => ENTRY_EVENTS.has(m.eventType))
      .reduce((sum, m) => sum + m.count, 0);

    // Determine best sequenceId (most recent)
    const seqIds = [...new Set(metrics.filter(m => m.sequenceId).map(m => m.sequenceId))];
    const sequenceId = seqIds[0] || null;

    const daysSilentActual = Math.floor((Date.now() - lead.lastEventAt.getTime()) / 86_400_000);

    result.push({
      leadId:         lead.id,
      displayName:    lead.displayName,
      company:        lead.company,
      email:          safeDecrypt(lead.emailEnc),
      tool:           lead.firstTool,
      sequenceId,
      firstEntryAt:   lead.firstSequenceAt.toISOString(),
      lastActivityAt: lead.lastEventAt.toISOString(),
      daysSilent:     daysSilentActual,
      sendCount,
      hasReplied,
    });

    if (result.length >= limit) break;
  }

  // Sort: no reply first, then by most silent
  return result.sort((a, b) => {
    if (a.hasReplied !== b.hasReplied) return a.hasReplied ? 1 : -1;
    return b.daysSilent - a.daysSilent;
  });
}

// ─── get_sequence_funnel ──────────────────────────────────────────────────────

export interface FunnelStep {
  eventType:   string;
  leadCount:   number;   // distinct leads that had this event
  eventCount:  number;   // total cumulative events
  conversionFromEntry: number | null; // % of leads that entered who also had this event
  conversionFromPrev:  number | null; // % of prev stage who converted
}

export async function getSequenceFunnel(
  workspaceId: string,
  sequenceId:  string,
): Promise<{ sequenceId: string; entryLeads: number; steps: FunnelStep[] }> {
  const metrics = await prisma.outreachMetric.findMany({
    where:  { workspaceId, sequenceId },
    select: { eventType: true, leadId: true, count: true },
  });

  // Aggregate per eventType: distinct leads + total count
  const byEvent: Record<string, { leads: Set<string>; count: number }> = {};
  for (const m of metrics) {
    if (!byEvent[m.eventType]) byEvent[m.eventType] = { leads: new Set(), count: 0 };
    byEvent[m.eventType].leads.add(m.leadId);
    byEvent[m.eventType].count += m.count;
  }

  // Funnel order
  const ORDER: Record<string, number> = {
    sequence_started: 1,
    email_sent: 2, message_sent: 2, connection_sent: 2,
    connection_request_sent: 3, inmail_sent: 3,
    connection_accepted: 4,
    email_opened: 5, link_clicked: 6,
    reply_received: 7, inmail_replied: 7,
    positive_reply: 8, interested_reply: 8,
    meeting_booked: 9, demo_completed: 10,
  };

  const stages = Object.entries(byEvent)
    .map(([eventType, d]) => ({ eventType, leadCount: d.leads.size, eventCount: d.count, pos: ORDER[eventType] ?? 99 }))
    .sort((a, b) => a.pos - b.pos);

  // Entry lead count = distinct leads in any entry event
  const entryLeadIds = new Set<string>();
  for (const m of metrics) {
    if (ENTRY_EVENTS.has(m.eventType)) entryLeadIds.add(m.leadId);
  }
  const entryLeads = entryLeadIds.size;

  const steps: FunnelStep[] = stages.map((s, i) => {
    const prev = stages[i - 1];
    return {
      eventType:            s.eventType,
      leadCount:            s.leadCount,
      eventCount:           s.eventCount,
      conversionFromEntry:  entryLeads > 0 ? Math.round((s.leadCount / entryLeads) * 1000) / 10 : null,
      conversionFromPrev:   (prev && prev.leadCount > 0)
                              ? Math.round((s.leadCount / prev.leadCount) * 1000) / 10
                              : null,
    };
  });

  return { sequenceId, entryLeads, steps };
}

// ─── get_lead_journey ─────────────────────────────────────────────────────────

export interface LeadEvent {
  eventType:   string;
  tool:        string;
  sequenceId:  string | null;
  stepId:      string | null;
  count:       number;
  firstAt:     string;
  lastAt:      string;
}

export interface LeadJourney {
  leadId:         string;
  displayName:    string;
  email:          string | null;
  company:        string | null;
  title:          string | null;
  firstTool:      string;
  firstEntryAt:   string;
  lastActivityAt: string;
  hasReplied:     boolean;
  hasMeeting:     boolean;
  events:         LeadEvent[];
}

export async function getLeadJourney(
  workspaceId: string,
  opts: { email?: string; leadId?: string },
): Promise<LeadJourney | null> {
  let lead: Awaited<ReturnType<typeof prisma.outreachLead.findUnique>> | null = null;

  if (opts.leadId) {
    lead = await prisma.outreachLead.findUnique({ where: { id: opts.leadId } });
  } else if (opts.email) {
    const hash = hashEmail(opts.email);
    lead = await prisma.outreachLead.findUnique({
      where: { workspaceId_emailHash: { workspaceId, emailHash: hash } },
    });
  }

  if (!lead || lead.workspaceId !== workspaceId) return null;

  const metrics = await prisma.outreachMetric.findMany({
    where:   { workspaceId, leadId: lead.id },
    orderBy: { firstAt: "asc" },
  });

  const events: LeadEvent[] = metrics.map(m => ({
    eventType:  m.eventType,
    tool:       m.tool,
    sequenceId: m.sequenceId || null,
    stepId:     m.stepId     || null,
    count:      m.count,
    firstAt:    m.firstAt.toISOString(),
    lastAt:     m.lastAt.toISOString(),
  }));

  const hasReplied  = metrics.some(m => POSITIVE_OUTCOMES.has(m.eventType));
  const hasMeeting  = metrics.some(m => ["meeting_booked","demo_completed"].includes(m.eventType));

  return {
    leadId:         lead.id,
    displayName:    lead.displayName,
    email:          safeDecrypt(lead.emailEnc),
    company:        lead.company,
    title:          lead.title,
    firstTool:      lead.firstTool,
    firstEntryAt:   lead.firstSequenceAt.toISOString(),
    lastActivityAt: lead.lastEventAt.toISOString(),
    hasReplied,
    hasMeeting,
    events,
  };
}

// ─── get_webhook_reliability ──────────────────────────────────────────────────

export interface WebhookToolStats {
  tool:         string;
  total:        number;
  processed:    number;
  droppedQuota: number;
  droppedIgnored: number;
  droppedNoId:  number;
  errors:       number;
  processRate:  number;   // % of total that were processed
  lastReceivedAt: string | null;
}

export async function getWebhookReliability(
  workspaceId: string,
  opts: { tool?: string; hours?: number },
): Promise<{ windowHours: number; tools: WebhookToolStats[] }> {
  const hours   = opts.hours ?? 24;
  const since   = new Date(Date.now() - hours * 3_600_000);
  const where: any = { workspaceId, receivedAt: { gte: since } };
  if (opts.tool) where.tool = { equals: opts.tool, mode: "insensitive" };

  const rows = await prisma.webhookDeliveryLog.findMany({
    where,
    select: { tool: true, status: true, receivedAt: true },
  });

  // Aggregate per tool
  const byTool: Record<string, {
    total: number; processed: number; quota: number;
    ignored: number; noId: number; errors: number; lastAt: Date | null;
  }> = {};

  for (const row of rows) {
    if (!byTool[row.tool]) byTool[row.tool] = { total: 0, processed: 0, quota: 0, ignored: 0, noId: 0, errors: 0, lastAt: null };
    const t = byTool[row.tool];
    t.total++;
    if (!t.lastAt || row.receivedAt > t.lastAt) t.lastAt = row.receivedAt;
    if (row.status === "processed")             t.processed++;
    else if (row.status === "dropped_quota")    t.quota++;
    else if (row.status === "dropped_ignored")  t.ignored++;
    else if (row.status === "dropped_no_identity") t.noId++;
    else if (row.status === "error")            t.errors++;
  }

  const tools: WebhookToolStats[] = Object.entries(byTool).map(([tool, t]) => ({
    tool,
    total:          t.total,
    processed:      t.processed,
    droppedQuota:   t.quota,
    droppedIgnored: t.ignored,
    droppedNoId:    t.noId,
    errors:         t.errors,
    processRate:    t.total > 0 ? Math.round((t.processed / t.total) * 1000) / 10 : 0,
    lastReceivedAt: t.lastAt?.toISOString() ?? null,
  })).sort((a, b) => b.total - a.total);

  return { windowHours: hours, tools };
}

// ─── get_outcome_attribution ──────────────────────────────────────────────────

export interface OutcomeAttribution {
  sequenceId:      string;
  tool:            string;
  totalLeads:      number;
  meetings:        number;
  deals:           number;
  meetingRate:     number;
  topStep:         string | null;   // step with highest meeting conversion
}

export async function getOutcomeAttribution(workspaceId: string): Promise<{
  totalMeetings: number;
  totalDeals:    number;
  sequences:     OutcomeAttribution[];
}> {
  // Outcome events from OutreachMetric (meeting_booked, demo_completed)
  const outcomeRows = await prisma.outreachMetric.findMany({
    where: {
      workspaceId,
      eventType: { in: ["meeting_booked", "demo_completed", "deal_won", "deal_created"] },
      sequenceId: { not: "" },
    },
    select: { sequenceId: true, tool: true, leadId: true, eventType: true, count: true, stepId: true },
  });

  // Distinct leads per sequence (for denominator)
  const allSeqLeads = await prisma.outreachMetric.findMany({
    where:  { workspaceId, sequenceId: { not: "" } },
    select: { sequenceId: true, leadId: true },
    distinct: ["sequenceId", "leadId"],
  });

  const seqLeadCounts: Record<string, number> = {};
  const seqTool: Record<string, string> = {};
  for (const r of allSeqLeads) {
    seqLeadCounts[r.sequenceId] = (seqLeadCounts[r.sequenceId] ?? 0) + 1;
  }

  const bySeq: Record<string, {
    tool: string; meetings: number; deals: number;
    stepMeetings: Record<string, number>;
  }> = {};

  for (const row of outcomeRows) {
    if (!bySeq[row.sequenceId]) bySeq[row.sequenceId] = { tool: row.tool, meetings: 0, deals: 0, stepMeetings: {} };
    const s = bySeq[row.sequenceId];
    if (["meeting_booked","demo_completed"].includes(row.eventType)) {
      s.meetings += row.count;
      if (row.stepId) s.stepMeetings[row.stepId] = (s.stepMeetings[row.stepId] ?? 0) + row.count;
    }
    if (["deal_won","deal_created"].includes(row.eventType)) s.deals += row.count;
  }

  let totalMeetings = 0;
  let totalDeals    = 0;

  const sequences: OutcomeAttribution[] = Object.entries(bySeq).map(([sequenceId, s]) => {
    const totalLeads = seqLeadCounts[sequenceId] ?? 1;
    const topStep    = Object.entries(s.stepMeetings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    totalMeetings += s.meetings;
    totalDeals    += s.deals;
    return {
      sequenceId,
      tool:        s.tool,
      totalLeads,
      meetings:    s.meetings,
      deals:       s.deals,
      meetingRate: Math.round((s.meetings / totalLeads) * 1000) / 10,
      topStep:     topStep || null,
    };
  }).sort((a, b) => b.meetings - a.meetings);

  return { totalMeetings, totalDeals, sequences };
}
