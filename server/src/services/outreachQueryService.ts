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

// ─── check_lead_status ────────────────────────────────────────────────────────

const OPT_OUT_EVENTS = new Set([
  "unsubscribed", "opt_out", "do_not_contact", "bounced", "hard_bounce",
  "spam_reported", "blacklisted",
]);

// A lead contacted more recently than this is considered "in cooldown"
const COOLDOWN_DAYS = 3;

export interface LeadStatusResult {
  email:            string;
  found:            boolean;
  safeToContact:    boolean;
  reason:           string;
  optedOut:         boolean;
  activeSequence:   string | null;  // sequenceId if currently active
  lastContactedAt:  string | null;
  daysSinceContact: number | null;
  touchpointCount:  number;
  hasReplied:       boolean;
  hasMeeting:       boolean;
}

export async function checkLeadStatus(
  workspaceId: string,
  emails: string[],
): Promise<LeadStatusResult[]> {
  // Hash all emails in one pass
  const emailMap = new Map<string, string>(); // hash → original email
  for (const e of emails) {
    const clean = e.toLowerCase().trim();
    if (clean) emailMap.set(hashEmail(clean), e);
  }

  // Single batch query for all leads
  const leads = await prisma.outreachLead.findMany({
    where: {
      workspaceId,
      emailHash: { in: [...emailMap.keys()] },
    },
    select: {
      id: true, emailHash: true, displayName: true,
      firstSequenceAt: true, lastEventAt: true,
      metrics: {
        select: { eventType: true, count: true, sequenceId: true, lastAt: true },
      },
    },
  });

  // Index by hash
  const leadByHash = new Map(leads.map(l => [l.emailHash, l]));
  const now = Date.now();

  return emails.map(email => {
    const hash = hashEmail(email.toLowerCase().trim());
    const lead = leadByHash.get(hash);

    if (!lead) {
      return {
        email, found: false, safeToContact: true,
        reason: "No prior contact found in IQPipe — lead has never been outreached.",
        optedOut: false, activeSequence: null,
        lastContactedAt: null, daysSinceContact: null,
        touchpointCount: 0, hasReplied: false, hasMeeting: false,
      };
    }

    const metrics = lead.metrics;

    const optedOut   = metrics.some(m => OPT_OUT_EVENTS.has(m.eventType) && m.count > 0);
    const hasReplied = metrics.some(m => POSITIVE_OUTCOMES.has(m.eventType) && m.count > 0);
    const hasMeeting = metrics.some(m =>
      ["meeting_booked", "demo_completed"].includes(m.eventType) && m.count > 0
    );

    const lastAt      = lead.lastEventAt;
    const daysSince   = Math.floor((now - lastAt.getTime()) / 86_400_000);
    const inCooldown  = daysSince < COOLDOWN_DAYS;

    // Find most recent active sequence (last entry event sequence)
    let activeSequence: string | null = null;
    let latestSeqAt: Date | null = null;
    for (const m of metrics) {
      if (ENTRY_EVENTS.has(m.eventType) && m.sequenceId && m.lastAt) {
        if (!latestSeqAt || m.lastAt > latestSeqAt) {
          latestSeqAt   = m.lastAt;
          activeSequence = m.sequenceId;
        }
      }
    }
    // Only flag active if the last entry was within 30 days
    if (latestSeqAt && (now - latestSeqAt.getTime()) > 30 * 86_400_000) {
      activeSequence = null;
    }

    // Determine safety and reason
    let safeToContact = true;
    let reason = "Lead can be contacted.";

    if (optedOut) {
      safeToContact = false;
      reason = "Lead has opted out or hard-bounced. Do not contact.";
    } else if (hasMeeting) {
      safeToContact = false;
      reason = "Lead has already booked a meeting. Escalate to sales rather than re-outreaching.";
    } else if (inCooldown) {
      safeToContact = false;
      reason = `Lead was contacted ${daysSince} day(s) ago — within the ${COOLDOWN_DAYS}-day cooldown window.`;
    } else if (activeSequence) {
      safeToContact = false;
      reason = `Lead is currently active in sequence ${activeSequence}. Do not enroll in another sequence.`;
    }

    return {
      email,
      found:           true,
      safeToContact,
      reason,
      optedOut,
      activeSequence,
      lastContactedAt:  lastAt.toISOString(),
      daysSinceContact: daysSince,
      touchpointCount:  metrics.reduce((s, m) => s + m.count, 0),
      hasReplied,
      hasMeeting,
    };
  });
}

// ─── get_sequence_recommendation ──────────────────────────────────────────────

export interface SequenceRecommendation {
  sequenceId:        string;
  tool:              string;
  replyRate:         number;
  meetingRate:       number;
  totalLeads:        number;
  relevanceScore:    number;   // 0–100; higher = better match for the provided ICP signals
  relevanceReasons:  string[];
  topConvertingStep: string | null;
}

export async function getSequenceRecommendation(
  workspaceId: string,
  profile: {
    title?:      string;   // e.g. "VP of Sales"
    company?:    string;   // e.g. "Acme Corp"
    sourceTool?: string;   // tool the lead was sourced from, e.g. "apollo"
    channel?:    "email" | "linkedin" | "phone" | "any";
  },
): Promise<{ recommendations: SequenceRecommendation[]; profileMatched: Record<string, string> }> {
  // Pull all metrics grouped by sequence
  const rows = await prisma.outreachMetric.findMany({
    where:  { workspaceId, sequenceId: { not: "" } },
    select: { sequenceId: true, tool: true, leadId: true, eventType: true, count: true, stepId: true },
  });

  // For title matching: find leads in positive-outcome sequences
  // and check if their stored title matches the requested profile
  const positiveLeadIds = new Set(
    rows.filter(r => POSITIVE_OUTCOMES.has(r.eventType)).map(r => r.leadId)
  );

  let titleMatchLeads: Set<string> = new Set();
  let toolMatchLeads:  Set<string> = new Set();

  if ((profile.title || profile.sourceTool) && positiveLeadIds.size > 0) {
    const conditions: any[] = [{ id: { in: [...positiveLeadIds] }, workspaceId }];

    const matchedLeads = await prisma.outreachLead.findMany({
      where: {
        workspaceId,
        id: { in: [...positiveLeadIds] },
      },
      select: { id: true, title: true, firstTool: true },
    });

    for (const l of matchedLeads) {
      if (profile.title && l.title) {
        // Fuzzy match: any word overlap between requested title and stored title
        const reqWords  = profile.title.toLowerCase().split(/\W+/).filter(w => w.length > 2);
        const leadWords = l.title.toLowerCase().split(/\W+/);
        if (reqWords.some(w => leadWords.includes(w))) titleMatchLeads.add(l.id);
      }
      if (profile.sourceTool && l.firstTool.toLowerCase() === profile.sourceTool.toLowerCase()) {
        toolMatchLeads.add(l.id);
      }
    }
  }

  // Channel → expected tool slugs
  const CHANNEL_TOOLS: Record<string, string[]> = {
    email:    ["lemlist", "instantly", "smartlead", "mailshake", "woodpecker", "gmail", "outlook"],
    linkedin: ["heyreach", "expandi", "dripify", "waalaxy", "phantombuster"],
    phone:    ["aircall", "dialpad", "close"],
  };
  const channelTools = profile.channel && profile.channel !== "any"
    ? new Set(CHANNEL_TOOLS[profile.channel] ?? [])
    : null;

  // Aggregate per sequence
  const bySeq: Record<string, {
    tool: string;
    leadIds: Set<string>;
    replies: number;
    meetings: number;
    stepMeetings: Record<string, number>;
  }> = {};

  for (const r of rows) {
    if (!bySeq[r.sequenceId]) {
      bySeq[r.sequenceId] = { tool: r.tool, leadIds: new Set(), replies: 0, meetings: 0, stepMeetings: {} };
    }
    const s = bySeq[r.sequenceId];
    s.leadIds.add(r.leadId);
    if (["reply_received","positive_reply","interested_reply","inmail_replied"].includes(r.eventType)) s.replies  += r.count;
    if (["meeting_booked","demo_completed"].includes(r.eventType)) {
      s.meetings += r.count;
      if (r.stepId) s.stepMeetings[r.stepId] = (s.stepMeetings[r.stepId] ?? 0) + r.count;
    }
  }

  const recommendations: SequenceRecommendation[] = Object.entries(bySeq).map(([sequenceId, s]) => {
    const total       = s.leadIds.size || 1;
    const replyRate   = Math.round((s.replies  / total) * 1000) / 10;
    const meetingRate = Math.round((s.meetings / total) * 1000) / 10;
    const topStep     = Object.entries(s.stepMeetings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Relevance scoring — additive signals
    let relevance = 0;
    const reasons: string[] = [];

    // Base performance
    if (replyRate >= 10) { relevance += 30; reasons.push(`High reply rate (${replyRate}%)`); }
    else if (replyRate >= 5) { relevance += 15; }
    if (meetingRate >= 3)  { relevance += 25; reasons.push(`Strong meeting rate (${meetingRate}%)`); }
    else if (meetingRate >= 1) { relevance += 10; }

    // Channel match
    if (channelTools && channelTools.has(s.tool.toLowerCase())) {
      relevance += 20;
      reasons.push(`Matches requested channel (${profile.channel})`);
    }

    // Source tool match — leads from same source converted here
    const seqLeadIds = [...s.leadIds];
    const toolMatchInSeq = seqLeadIds.filter(id => toolMatchLeads.has(id)).length;
    if (toolMatchInSeq > 0) {
      relevance += 15;
      reasons.push(`${toolMatchInSeq} leads from ${profile.sourceTool} converted in this sequence`);
    }

    // Title match — leads with similar title converted here
    const titleMatchInSeq = seqLeadIds.filter(id => titleMatchLeads.has(id)).length;
    if (titleMatchInSeq > 0) {
      relevance += 10;
      reasons.push(`${titleMatchInSeq} leads with similar title (${profile.title}) had positive outcomes`);
    }

    // Volume signal — prefer sequences with enough data to trust
    if (total < 10) relevance = Math.round(relevance * 0.7); // discount thin sequences

    return {
      sequenceId,
      tool:              s.tool,
      replyRate,
      meetingRate,
      totalLeads:        total,
      relevanceScore:    Math.min(100, relevance),
      relevanceReasons:  reasons,
      topConvertingStep: topStep,
    };
  }).sort((a, b) => b.relevanceScore !== a.relevanceScore
    ? b.relevanceScore - a.relevanceScore
    : b.replyRate - a.replyRate
  );

  const profileMatched: Record<string, string> = {};
  if (profile.title)      profileMatched.title      = profile.title;
  if (profile.company)    profileMatched.company     = profile.company;
  if (profile.sourceTool) profileMatched.sourceTool  = profile.sourceTool;
  if (profile.channel)    profileMatched.channel     = profile.channel;

  return { recommendations: recommendations.slice(0, 10), profileMatched };
}

// ─── confirm_event_received ───────────────────────────────────────────────────

export interface EventConfirmationResult {
  arrived:       boolean;
  processed:     number;
  dropped:       number;
  errors:        number;
  total:         number;
  windowMinutes: number;
  tool:          string;
  eventType:     string | null;
  lastEvent:     { status: string; receivedAt: string; eventType: string | null } | null;
  verdict:       string;   // human-readable conclusion for Claude
}

export async function confirmEventReceived(
  workspaceId: string,
  opts: {
    tool:          string;
    sinceMinutes?: number;
    eventType?:    string;
  },
): Promise<EventConfirmationResult> {
  const minutes = opts.sinceMinutes ?? 10;
  const since   = new Date(Date.now() - minutes * 60_000);

  const where: any = {
    workspaceId,
    tool:       { equals: opts.tool, mode: "insensitive" },
    receivedAt: { gte: since },
  };
  if (opts.eventType) where.rawEventKey = { contains: opts.eventType, mode: "insensitive" };

  const logs = await prisma.webhookDeliveryLog.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    select:  { status: true, receivedAt: true, eventType: true, rawEventKey: true },
  });

  const total     = logs.length;
  const processed = logs.filter(l => l.status === "processed").length;
  const dropped   = logs.filter(l => l.status.startsWith("dropped")).length;
  const errors    = logs.filter(l => l.status === "error").length;
  const arrived   = total > 0;

  const last = logs[0] ?? null;

  // Compose verdict
  let verdict: string;
  if (!arrived) {
    verdict = `No events from ${opts.tool} received in the last ${minutes} minutes${opts.eventType ? ` matching "${opts.eventType}"` : ""}. The webhook may not have fired, the payload may be missing identity fields, or the n8n/Make trigger hasn't executed yet.`;
  } else if (processed > 0) {
    verdict = `${processed} of ${total} event(s) from ${opts.tool} were successfully processed by IQPipe in the last ${minutes} minutes. The pipeline is working.`;
  } else if (dropped > 0) {
    verdict = `${total} event(s) from ${opts.tool} arrived but all were dropped (${logs[0]?.status}). Check that the webhook payload includes a recognizable email, LinkedIn URL, or phone number for identity resolution.`;
  } else {
    verdict = `${total} event(s) from ${opts.tool} arrived but resulted in errors. Check webhook signature or payload format.`;
  }

  return {
    arrived,
    processed,
    dropped,
    errors,
    total,
    windowMinutes: minutes,
    tool:      opts.tool,
    eventType: opts.eventType ?? null,
    lastEvent: last ? {
      status:     last.status,
      receivedAt: last.receivedAt.toISOString(),
      eventType:  last.eventType,
    } : null,
    verdict,
  };
}
