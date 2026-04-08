/**
 * outreachTracker.ts
 *
 * Compact outreach event pipeline. Replaces the raw-row-per-event model
 * with two lightweight tables:
 *
 *   OutreachLead   — one record per unique person (keyed by hashed email /
 *                    LinkedIn URL / phone), created only on first sequence entry.
 *
 *   OutreachMetric — cumulative counters per (lead × tool × sequence × step ×
 *                    eventType). Each event increments `count` and updates
 *                    `lastAt` rather than inserting a new row.
 *
 * What is ignored
 * ───────────────
 * Sourcing and enrichment events (lead_imported, lead_enriched, profile_viewed,
 * data_enriched, etc.) are dropped at the gate — they never touch the DB.
 *
 * What triggers lead creation
 * ───────────────────────────
 * Only SEQUENCE_ENTRY_EVENTS (email_sent, message_sent, connection_sent, …).
 * A reply_received or meeting_booked without a prior entry event is silently
 * dropped — there is no lead record to attach it to.
 *
 * Output shape (OutreachMetric row)
 * ──────────────────────────────────
 *   { leadId, tool, sequenceId, stepId, eventType,
 *     count, firstAt, lastAt }
 *
 * Example after 24 sends to the same lead in sequence "camp_123", step "step_1":
 *   { eventType: "message_sent", sequenceId: "camp_123", stepId: "step_1",
 *     count: 24, firstAt: "2025-03-01T…", lastAt: "2025-04-01T…" }
 */

import crypto from "crypto";
import { encrypt } from "../utils/encryption";
import { prisma } from "../db";

// ─── Event classification ─────────────────────────────────────────────────────

/**
 * Events from sourcing / enrichment tools. Dropped silently.
 * Enrichment tool webhooks (clearbit, zoominfo, clay, pdl …) always fire one
 * of these, so their entire payload is ignored at the source handler.
 */
const IGNORED_EVENT_TYPES = new Set([
  "lead_imported",
  "lead_enriched",
  "profile_viewed",
  "contact_scraped",
  "data_enriched",
  "email_verified",
  "phone_verified",
  "linkedin_scraped",
  "company_enriched",
]);

/**
 * Sequence-entry events. Receiving one of these creates an OutreachLead if
 * none exists yet. They represent "this person just entered an outreach motion."
 */
const SEQUENCE_ENTRY_EVENTS = new Set([
  "sequence_started",
  "email_sent",
  "message_sent",
  "connection_sent",
  "connection_request_sent",
  "inmail_sent",
]);

/**
 * All outreach events we aggregate. Anything not in this set is dropped.
 * Non-entry events (reply_received, meeting_booked …) only update metrics
 * if the lead already exists — they never create a new lead record.
 */
const OUTREACH_EVENTS = new Set([
  ...SEQUENCE_ENTRY_EVENTS,
  "connection_accepted",
  "email_opened",
  "email_clicked",
  "link_clicked",
  "reply_received",
  "positive_reply",
  "negative_reply",
  "neutral_reply",
  "ooo_reply",
  "interested_reply",
  "meeting_booked",
  "demo_completed",
  "call_initiated",
  "call_completed",
  "sms_sent",
  "sms_received",
  "whatsapp_sent",
  "whatsapp_received",
  "step_completed",
  "campaign_completed",
  "follow_sent",
  "liked_post",
  "inmail_replied",
]);

// ─── Hashing (mirrors identity.ts — same HMAC key so cross-table joins work) ──

const HASH_KEY = process.env.LEAD_HASH_KEY || "iqpipe-identity-hmac-v1-change-in-prod";

function hmac(value: string): string {
  return crypto.createHmac("sha256", HASH_KEY).update(value).digest("hex");
}

function hashEmail(raw: string): string {
  return hmac(raw.toLowerCase().trim());
}

function hashLinkedin(raw: string): string {
  const cleaned = raw.toLowerCase().trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  const m = cleaned.match(/linkedin\.com\/(in|company)\/([^/?#\s]+)/i);
  const normalized = m
    ? `linkedin.com/${m[1].toLowerCase()}/${m[2].toLowerCase()}`
    : cleaned;
  return hmac(normalized);
}

function hashPhone(raw: string): string {
  return hmac(raw.replace(/\D/g, ""));
}

function mintId(): string {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "orl_";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) id += CHARS[bytes[i] % CHARS.length];
  return id;
}

function toDisplayName(first: string | null, last: string | null): string {
  const f = (first || "").trim();
  const l = (last  || "").trim();
  if (!f || f.toLowerCase() === "unknown") return "Unknown Lead";
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface OutreachEventInput {
  workspaceId: string;
  tool:        string;
  eventType:   string;
  contact: {
    firstName?: string | null;
    lastName?:  string | null;
    email?:     string | null;
    linkedin?:  string | null;
    phone?:     string | null;
    company?:   string | null;
    title?:     string | null;
  };
  sequenceId?: string | null;  // external campaign / sequence ID
  stepId?:     string | null;  // external step ID
  eventAt?:    Date;
}

export interface OutreachEventResult {
  leadId:    string;
  isNew:     boolean;  // true = first time this person entered an outreach sequence
  metricId:  string;
  count:     number;   // cumulative count after this event
}

/**
 * Main entry point. Call this from every outreach webhook handler.
 * Returns null when the event is ignored (sourcing / enrichment / unknown).
 */
export async function processOutreachEvent(
  input: OutreachEventInput,
): Promise<OutreachEventResult | null> {
  const { workspaceId, tool, eventType, contact, sequenceId, stepId } = input;
  const eventAt = input.eventAt ?? new Date();
  const toolKey = tool.toLowerCase();

  // ── Gate 1: drop sourcing / enrichment ────────────────────────────────────
  if (IGNORED_EVENT_TYPES.has(eventType)) return null;

  // ── Gate 2: must be a known outreach event ────────────────────────────────
  if (!OUTREACH_EVENTS.has(eventType)) return null;

  // ── Gate 3: require at least one identity signal ──────────────────────────
  const { email, linkedin, phone, firstName, lastName, company, title } = contact;
  const emailHash    = email    ? hashEmail(email)       : null;
  const linkedinHash = linkedin ? hashLinkedin(linkedin) : null;
  const phoneHash    = phone    ? hashPhone(phone)       : null;
  if (!emailHash && !linkedinHash && !phoneHash) return null;

  // ── Resolve or create OutreachLead ────────────────────────────────────────
  const isEntryEvent = SEQUENCE_ENTRY_EVENTS.has(eventType);
  const { lead, isNew } = await resolveOutreachLead({
    workspaceId,
    emailHash, linkedinHash, phoneHash,
    email:    email    ?? null,
    linkedin: linkedin ?? null,
    phone:    phone    ?? null,
    firstName: firstName ?? null,
    lastName:  lastName  ?? null,
    company:   company   ?? null,
    title:     title     ?? null,
    tool:      toolKey,
    eventAt,
    createIfMissing: isEntryEvent,
  });

  // No lead and this isn't an entry event — nothing to attach to
  if (!lead) return null;

  // ── Upsert cumulative metric ──────────────────────────────────────────────
  const { id: metricId, count } = await upsertMetric({
    workspaceId,
    leadId:    lead.id,
    tool:      toolKey,
    eventType,
    sequenceId: sequenceId || "",
    stepId:     stepId     || "",
    eventAt,
  });

  // Keep lastEventAt current on the lead record (fire-and-forget)
  if (!isNew) {
    prisma.outreachLead.update({
      where: { id: lead.id },
      data:  { lastEventAt: eventAt },
    }).catch(err => console.error("[outreachTracker] lastEventAt update:", err.message));
  }

  return { leadId: lead.id, isNew, metricId, count };
}

// ─── Lead resolution ──────────────────────────────────────────────────────────

interface ResolveArgs {
  workspaceId:     string;
  emailHash:       string | null;
  linkedinHash:    string | null;
  phoneHash:       string | null;
  email:           string | null;
  linkedin:        string | null;
  phone:           string | null;
  firstName:       string | null;
  lastName:        string | null;
  company:         string | null;
  title:           string | null;
  tool:            string;
  eventAt:         Date;
  createIfMissing: boolean;
}

async function resolveOutreachLead(args: ResolveArgs) {
  const { workspaceId, emailHash, linkedinHash, phoneHash,
          email, linkedin, phone, firstName, lastName,
          company, title, tool, eventAt, createIfMissing } = args;

  // Lookup by all available hashes in parallel
  const [byEmail, byLinkedin, byPhone] = await Promise.all([
    emailHash
      ? prisma.outreachLead.findUnique({ where: { workspaceId_emailHash: { workspaceId, emailHash } } })
      : null,
    linkedinHash
      ? prisma.outreachLead.findUnique({ where: { workspaceId_linkedinHash: { workspaceId, linkedinHash } } })
      : null,
    phoneHash
      ? prisma.outreachLead.findUnique({ where: { workspaceId_phoneHash: { workspaceId, phoneHash } } })
      : null,
  ]);

  const existing = byEmail ?? byLinkedin ?? byPhone;

  if (existing) {
    // Backfill any newly-available hashes onto the existing record
    const patch: Record<string, unknown> = { lastEventAt: eventAt };
    if (emailHash    && !existing.emailHash)    { patch.emailHash    = emailHash;    patch.emailEnc    = encrypt(email!.toLowerCase().trim()); }
    if (linkedinHash && !existing.linkedinHash) { patch.linkedinHash = linkedinHash; patch.linkedinEnc = encrypt(linkedin!); }
    if (phoneHash    && !existing.phoneHash)    { patch.phoneHash    = phoneHash;    patch.phoneEnc    = encrypt(phone!.replace(/\D/g, "")); }
    if (company && !existing.company) patch.company = company;
    if (title   && !existing.title)   patch.title   = title;

    if (Object.keys(patch).length > 1) { // >1 because lastEventAt is always there
      await prisma.outreachLead.update({ where: { id: existing.id }, data: patch });
    }
    return { lead: existing, isNew: false };
  }

  if (!createIfMissing) return { lead: null, isNew: false };

  // Mint a new OutreachLead
  const id = mintId();
  const lead = await prisma.outreachLead.create({
    data: {
      id,
      workspaceId,
      emailHash,    emailEnc:    email    ? encrypt(email.toLowerCase().trim())  : null,
      linkedinHash, linkedinEnc: linkedin ? encrypt(linkedin)                    : null,
      phoneHash,    phoneEnc:    phone    ? encrypt(phone.replace(/\D/g, ""))    : null,
      displayName:     toDisplayName(firstName, lastName),
      company:         company || null,
      title:           title   || null,
      firstTool:       tool,
      firstSequenceAt: eventAt,
      lastEventAt:     eventAt,
    },
  });

  return { lead, isNew: true };
}

// ─── Metric upsert ────────────────────────────────────────────────────────────

interface MetricArgs {
  workspaceId: string;
  leadId:      string;
  tool:        string;
  eventType:   string;
  sequenceId:  string;  // "" when no sequence context
  stepId:      string;  // "" when no step context
  eventAt:     Date;
}

async function upsertMetric(args: MetricArgs) {
  const { workspaceId, leadId, tool, eventType, sequenceId, stepId, eventAt } = args;

  const existing = await prisma.outreachMetric.findUnique({
    where: {
      workspaceId_leadId_tool_sequenceId_stepId_eventType: {
        workspaceId, leadId, tool, sequenceId, stepId, eventType,
      },
    },
  });

  if (existing) {
    const updated = await prisma.outreachMetric.update({
      where: { id: existing.id },
      data:  { count: { increment: 1 }, lastAt: eventAt },
    });
    return { id: updated.id, count: updated.count };
  }

  const created = await prisma.outreachMetric.create({
    data: {
      workspaceId, leadId, tool, sequenceId, stepId, eventType,
      count: 1, firstAt: eventAt, lastAt: eventAt,
    },
  });
  return { id: created.id, count: 1 };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Returns all cumulative metrics for a lead, shaped as a flat object.
 * e.g. { message_sent: { count: 24, firstAt, lastAt, bySequence: [...] } }
 */
export async function getLeadMetricsSummary(workspaceId: string, leadId: string) {
  const rows = await prisma.outreachMetric.findMany({
    where: { workspaceId, leadId },
    orderBy: { firstAt: "asc" },
  });

  const byType: Record<string, {
    count: number;
    firstAt: Date;
    lastAt:  Date;
    bySequence: { sequenceId: string; stepId: string; count: number; firstAt: Date; lastAt: Date }[];
  }> = {};

  for (const row of rows) {
    if (!byType[row.eventType]) {
      byType[row.eventType] = { count: 0, firstAt: row.firstAt, lastAt: row.lastAt, bySequence: [] };
    }
    byType[row.eventType].count   += row.count;
    byType[row.eventType].lastAt   = row.lastAt > byType[row.eventType].lastAt ? row.lastAt : byType[row.eventType].lastAt;
    byType[row.eventType].firstAt  = row.firstAt < byType[row.eventType].firstAt ? row.firstAt : byType[row.eventType].firstAt;
    if (row.sequenceId) {
      byType[row.eventType].bySequence.push({
        sequenceId: row.sequenceId,
        stepId:     row.stepId,
        count:      row.count,
        firstAt:    row.firstAt,
        lastAt:     row.lastAt,
      });
    }
  }

  return byType;
}
