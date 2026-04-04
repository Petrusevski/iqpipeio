/**
 * identity.ts
 *
 * Privacy-first lead identity resolution for iqpipe.
 *
 * Every incoming webhook contact is resolved to an IqLead record.
 * PII (email, LinkedIn URL, phone) is:
 *   - HASHED with SHA-256 HMAC for cross-tool identity matching
 *   - ENCRYPTED with AES-256 for owner retrieval
 *   - NEVER stored in plain text
 *
 * The public-facing ID is "iq_" + 12 random alphanumeric chars.
 */

import crypto from "crypto";
import { encrypt } from "./encryption";
import { prisma } from "../db";
import { computeSummaryForLead } from "../services/activitySummarizer";

// ── Hashing ──────────────────────────────────────────────────────────────────

const HASH_KEY = process.env.LEAD_HASH_KEY || "iqpipe-identity-hmac-v1-change-in-prod";

function hmac(value: string): string {
  return crypto.createHmac("sha256", HASH_KEY).update(value).digest("hex");
}

export function hashEmail(raw: string): string {
  return hmac(raw.toLowerCase().trim());
}

export function hashLinkedin(raw: string): string {
  // Strip protocol, www., and trailing slashes before extracting the handle
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

export function hashPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return hmac(digits);
}

// ── ID minting ────────────────────────────────────────────────────────────────

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function mintId(): string {
  let id = "iq_";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) id += CHARS[bytes[i] % CHARS.length];
  return id;
}

// ── Display name (non-PII) ────────────────────────────────────────────────────

function toDisplayName(firstName: string, lastName: string): string {
  const f = (firstName || "").trim();
  const l = (lastName  || "").trim();
  if (!f || f.toLowerCase() === "unknown") return "Unknown Lead";
  const initial = l ? ` ${l[0].toUpperCase()}.` : "";
  return `${f}${initial}`;
}

// ── Channel mapping ───────────────────────────────────────────────────────────

const CHANNEL_MAP: Record<string, string> = {
  heyreach: "linkedin", expandi: "linkedin", dripify: "linkedin",
  waalaxy: "linkedin", meetalfred: "linkedin",
  lemlist: "email", instantly: "email", smartlead: "email",
  mailshake: "email", apollo: "email", hunter: "email", snovio: "email",
  aircall: "phone", dialpad: "phone", kixie: "phone", orum: "phone",
  twilio: "sms", sakari: "sms",
  wati: "whatsapp",
  outreach: "multichannel", salesloft: "multichannel",
  replyio: "multichannel", klenty: "multichannel",
  hubspot: "crm", pipedrive: "crm", salesforce: "crm",
  clearbit: "enrichment", zoominfo: "enrichment", pdl: "enrichment",
  lusha: "enrichment", cognism: "enrichment", rocketreach: "enrichment",
  phantombuster: "enrichment", clay: "enrichment",
  stripe: "billing", chargebee: "billing",
};

export function channelForTool(tool: string): string {
  return CHANNEL_MAP[tool.toLowerCase()] || "unknown";
}

// ── Outcome + attribution event types ────────────────────────────────────────

export const OUTCOME_EVENT_TYPES = new Set([
  "reply_received", "positive_reply", "negative_reply", "neutral_reply",
  "ooo_reply", "interested_reply",
  "meeting_booked", "demo_completed",
  "deal_created", "deal_won", "deal_lost",
  "proposal_sent", "contract_signed",
  "payment_received", "payment_failed",
  "subscription_created", "subscription_renewed", "subscription_cancelled",
  "trial_started", "trial_converted", "trial_expired",
  "churn_detected",
]);

// Touchpoints that signal real human engagement (used for attribution)
const MEANINGFUL = new Set([
  "connection_accepted", "message_sent", "reply_received",
  "email_opened", "sequence_started", "call_completed",
  "sms_received", "whatsapp_received", "meeting_booked",
]);

// ── Core: resolve or mint IqLead ──────────────────────────────────────────────

export interface ConsentInfo {
  basis?:     string;   // "legitimate_interest" | "consent" | "contract" | ...
  timestamp?: Date;
  version?:   string;
  source?:    string;
}

export async function resolveIqLead(
  workspaceId: string,
  identifiers: {
    email?:       string | null;
    linkedin?:    string | null;
    phone?:       string | null;
    anonymousId?: string | null;  // session_id / visitor ID for pre-identification
  },
  metadata: { firstName?: string; lastName?: string; company?: string | null; title?: string | null },
  consent?: ConsentInfo,
): Promise<string> {
  const { email, linkedin, phone, anonymousId } = identifiers;

  const emailHash    = email    ? hashEmail(email)       : null;
  const linkedinHash = linkedin ? hashLinkedin(linkedin) : null;
  const phoneHash    = phone    ? hashPhone(phone)       : null;

  const consentPatch = consent?.basis ? {
    consentBasis:     consent.basis,
    consentTimestamp: consent.timestamp ?? new Date(),
    consentVersion:   consent.version   ?? null,
    consentSource:    consent.source    ?? null,
  } : {};

  // ── Anonymous-only event (no PII identifiers) ─────────────────────────────
  if (!emailHash && !linkedinHash && !phoneHash) {
    // If anonymousId provided, look for an existing anonymous record first
    if (anonymousId) {
      const anonExisting = await prisma.iqLead.findFirst({
        where: { workspaceId, anonymousId },
      });
      if (anonExisting) {
        if (Object.keys(consentPatch).length) {
          await prisma.iqLead.update({ where: { id: anonExisting.id }, data: consentPatch });
        }
        return anonExisting.id;
      }
    }

    const id = mintId();
    await prisma.iqLead.create({
      data: {
        id, workspaceId,
        anonymousId: anonymousId ?? null,
        displayName: toDisplayName(metadata.firstName || "", metadata.lastName || ""),
        company: metadata.company || null,
        title:   metadata.title   || null,
        ...consentPatch,
      },
    });
    return id;
  }

  // ── Confidence-scored identity lookup ────────────────────────────────────
  // Run all three field lookups in parallel, weight each match, pick the
  // highest-confidence candidate above threshold 0.7.
  const CONFIDENCE = { email: 1.0, linkedin: 0.85, phone: 0.75 } as const;
  const THRESHOLD  = 0.7;

  const [emailMatch, linkedinMatch, phoneMatch] = await Promise.all([
    emailHash    ? prisma.iqLead.findFirst({ where: { workspaceId, emailHash } })    : null,
    linkedinHash ? prisma.iqLead.findFirst({ where: { workspaceId, linkedinHash } }) : null,
    phoneHash    ? prisma.iqLead.findFirst({ where: { workspaceId, phoneHash } })    : null,
  ]);

  // Accumulate scores per lead id so a lead matching on multiple fields wins
  const scores = new Map<string, { lead: typeof emailMatch; score: number }>();
  for (const [match, score] of [
    [emailMatch,    CONFIDENCE.email]    as const,
    [linkedinMatch, CONFIDENCE.linkedin] as const,
    [phoneMatch,    CONFIDENCE.phone]    as const,
  ]) {
    if (!match) continue;
    const current = scores.get(match.id);
    // Use max rather than sum — a second weaker field is confirmatory, not additive
    if (!current || score > current.score) {
      scores.set(match.id, { lead: match, score });
    }
  }

  // Pick the highest-scoring candidate above threshold
  let best: typeof emailMatch = null;
  let bestScore = 0;
  for (const { lead, score } of scores.values()) {
    if (score >= THRESHOLD && score > bestScore) {
      best = lead;
      bestScore = score;
    }
  }

  const existing = best;

  if (existing) {
    const patch: Record<string, any> = { ...consentPatch };
    if (emailHash    && !existing.emailHash)    { patch.emailHash = emailHash;       patch.emailEnc    = encrypt(email!.toLowerCase().trim()); }
    if (linkedinHash && !existing.linkedinHash) { patch.linkedinHash = linkedinHash; patch.linkedinEnc = encrypt(linkedin!); }
    if (phoneHash    && !existing.phoneHash)    { patch.phoneHash = phoneHash;       patch.phoneEnc    = encrypt(phone!.replace(/\D/g, "")); }
    if (metadata.company && !existing.company)  patch.company = metadata.company;
    if (metadata.title   && !existing.title)    patch.title   = metadata.title;

    // Stitch: if there's an anonymous record with the same anonymousId, merge it
    if (anonymousId && !existing.anonymousId) {
      const anonRecord = await prisma.iqLead.findFirst({
        where: { workspaceId, anonymousId },
      });
      if (anonRecord && anonRecord.id !== existing.id) {
        // Re-parent all touchpoints and outcomes from the anonymous record
        await prisma.touchpoint.updateMany({ where: { iqLeadId: anonRecord.id }, data: { iqLeadId: existing.id } });
        await prisma.outcome.updateMany({ where: { iqLeadId: anonRecord.id }, data: { iqLeadId: existing.id } });
        // Mark the anonymous record as stitched, then delete it
        await prisma.iqLead.delete({ where: { id: anonRecord.id } }).catch(() => {});
        patch.stitchedFromId = anonRecord.id;
      }
      patch.anonymousId = anonymousId;
    }

    if (Object.keys(patch).length) {
      await prisma.iqLead.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }

  // ── Mint new IqLead ───────────────────────────────────────────────────────
  // Before minting, check if there's an anonymous record we can promote instead
  let stitchedFromId: string | null = null;
  if (anonymousId) {
    const anonRecord = await prisma.iqLead.findFirst({ where: { workspaceId, anonymousId } });
    if (anonRecord) {
      // Promote: add hashes to the existing anonymous record
      await prisma.iqLead.update({
        where: { id: anonRecord.id },
        data: {
          emailHash,    emailEnc:    email    ? encrypt(email.toLowerCase().trim())   : null,
          linkedinHash, linkedinEnc: linkedin ? encrypt(linkedin)                     : null,
          phoneHash,    phoneEnc:    phone    ? encrypt(phone.replace(/\D/g, ""))     : null,
          displayName: toDisplayName(metadata.firstName || "", metadata.lastName || ""),
          company: metadata.company || anonRecord.company || null,
          title:   metadata.title   || anonRecord.title   || null,
          ...consentPatch,
        },
      });
      return anonRecord.id;
    }
  }

  const id = mintId();
  await prisma.iqLead.create({
    data: {
      id, workspaceId,
      emailHash,    emailEnc:    email    ? encrypt(email.toLowerCase().trim())   : null,
      linkedinHash, linkedinEnc: linkedin ? encrypt(linkedin)                     : null,
      phoneHash,    phoneEnc:    phone    ? encrypt(phone.replace(/\D/g, ""))     : null,
      anonymousId:  anonymousId ?? null,
      stitchedFromId,
      displayName: toDisplayName(metadata.firstName || "", metadata.lastName || ""),
      company: metadata.company || null,
      title:   metadata.title   || null,
      ...consentPatch,
    },
  });
  return id;
}

// ── Record touchpoint + trigger attribution ───────────────────────────────────

export async function recordTouchpoint(
  workspaceId: string,
  iqLeadId: string,
  tool: string,
  eventType: string,
  meta: Record<string, any> = {},
  experimentId?: string | null,
  stackVariant?: string | null,
  sourceType: string = "webhook",
  sourcePriority: number = 2,
  workflowId?: string | null,
  stepId?: string | null,
  consentBasis?: string | null,
  externalId?: string | null,
): Promise<string | null> {
  const channel = channelForTool(tool.toLowerCase());

  // Namespace the caller-supplied ID so "heyreach:12345" and "instantly:12345"
  // cannot collide in the workspace-scoped unique index.
  const scopedExternalId = externalId ? `${tool.toLowerCase()}:${externalId}` : null;

  // ── Dedup ────────────────────────────────────────────────────────────────
  // Fast path: exact match on the natural event ID (n8n execution key,
  // Stripe event ID, HubSpot event ID, etc.). No time window needed.
  if (scopedExternalId) {
    const byId = await prisma.touchpoint.findUnique({
      where: { workspaceId_externalId: { workspaceId, externalId: scopedExternalId } },
      select: { id: true, sourcePriority: true },
    });
    if (byId) {
      if (sourcePriority < byId.sourcePriority) {
        await prisma.touchpoint.update({
          where: { id: byId.id },
          data: {
            sourceType,
            sourcePriority,
            ...(workflowId !== undefined ? { workflowId: workflowId || null } : {}),
            ...(stepId     !== undefined ? { stepId:     stepId     || null } : {}),
          },
        });
      }
      return byId.id;
    }
  } else {
    // Fallback: timestamp-window dedup when no external ID is available.
    // Import/enrichment events: deduplicated all-time per (lead, tool, eventType)
    //   — a lead is imported once per tool regardless of how many syncs run.
    // All other events: deduplicated per calendar day
    //   — prevents duplicate webhook deliveries from recording twice.
    const isImportEvent = eventType === "lead_imported" || eventType === "lead_enriched";
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const existing = await prisma.touchpoint.findFirst({
      where: {
        workspaceId,
        iqLeadId,
        tool: tool.toLowerCase(),
        eventType,
        ...(isImportEvent ? {} : { recordedAt: { gte: dayStart } }),
      },
      select: { id: true, sourcePriority: true },
    });

    if (existing) {
      if (sourcePriority < existing.sourcePriority) {
        await prisma.touchpoint.update({
          where: { id: existing.id },
          data: {
            sourceType,
            sourcePriority,
            ...(workflowId !== undefined ? { workflowId: workflowId || null } : {}),
            ...(stepId     !== undefined ? { stepId:     stepId     || null } : {}),
          },
        });
      }
      return existing.id;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const tp = await prisma.touchpoint.create({
    data: {
      workspaceId, iqLeadId,
      tool: tool.toLowerCase(), channel, eventType,
      experimentId: experimentId || null,
      stackVariant: stackVariant || null,
      meta: JSON.stringify(meta),
      sourceType,
      sourcePriority,
      workflowId:   workflowId   || null,
      stepId:       stepId       || null,
      consentBasis: consentBasis || null,
      externalId:   scopedExternalId,
    },
  });

  if (OUTCOME_EVENT_TYPES.has(eventType)) {
    await runAttribution(workspaceId, iqLeadId, tool, eventType, meta, experimentId, stackVariant, workflowId, stepId);
  }

  // Incrementally refresh the LeadActivitySummary for this lead.
  // Fire-and-forget — never blocks the event ingestion path.
  computeSummaryForLead(workspaceId, iqLeadId).catch(err =>
    console.error("[activitySummarizer] incremental update failed:", err.message),
  );

  // If this is an enrichment event, update IqLead.lastEnrichedAt in-place
  // so the enrichment freshness worker has a O(1) field to query.
  if (eventType === "lead_enriched") {
    prisma.iqLead.update({
      where: { id: iqLeadId },
      data: {
        lastEnrichedAt:   new Date(),
        enrichmentSource: tool.toLowerCase(),
      },
    }).catch(err =>
      console.error("[activitySummarizer] lastEnrichedAt update failed:", err.message),
    );
  }

  return tp.id;
}

// ── Attribution engine ────────────────────────────────────────────────────────

async function runAttribution(
  workspaceId: string,
  iqLeadId: string,
  reportingTool: string,
  outcomeType: string,
  meta: Record<string, any>,
  experimentId?: string | null,
  stackVariant?: string | null,
  workflowId?: string | null,
  stepId?: string | null,
): Promise<void> {
  try {
    const allTouchpoints = await prisma.touchpoint.findMany({
      where: { workspaceId, iqLeadId },
      orderBy: { recordedAt: "asc" },
      take: 200, // cap: sufficient for attribution, prevents unbounded memory load
      select: { id: true, tool: true, channel: true, eventType: true,
                experimentId: true, stackVariant: true, workflowId: true,
                stepId: true, recordedAt: true, sourcePriority: true },
    });

    const meaningful = allTouchpoints.filter(t => MEANINGFUL.has(t.eventType));
    const sequence   = meaningful.length ? meaningful : allTouchpoints;

    const attributedTools    = [...new Set(allTouchpoints.map(t => t.tool))];
    const attributedChannels = [...new Set(allTouchpoints.map(t => t.channel))];
    const firstTouch = sequence[0];
    const lastTouch  = sequence[sequence.length - 1];

    // Resolve experiment stack variant if not explicitly provided
    let creditedVariant = stackVariant;
    if (!creditedVariant && experimentId) {
      const expTouch = allTouchpoints.find(t => t.experimentId === experimentId && t.stackVariant);
      creditedVariant = expTouch?.stackVariant || null;
    }

    // Resolve workflow attribution: use explicitly provided IDs,
    // or fall back to the most recent touchpoint that has a workflowId
    let resolvedWorkflowId = workflowId || null;
    let resolvedStepId = stepId || null;
    if (!resolvedWorkflowId) {
      const lastN8nTouch = [...allTouchpoints].reverse().find(t => t.workflowId);
      resolvedWorkflowId = lastN8nTouch?.workflowId || null;
      resolvedStepId = lastN8nTouch?.stepId || null;
    }

    const amount = meta.amount ? parseFloat(String(meta.amount)) : null;

    await prisma.outcome.create({
      data: {
        workspaceId, iqLeadId,
        type: outcomeType,
        value: isNaN(amount as number) ? null : amount,
        currency: meta.currency || null,
        reportingTool: reportingTool.toLowerCase(),
        firstTouchTool:  firstTouch?.tool || null,
        lastTouchTool:   lastTouch?.tool  || null,
        attributedTools:    JSON.stringify(attributedTools),
        attributedChannels: JSON.stringify(attributedChannels),
        experimentId: experimentId || null,
        stackVariant: creditedVariant || null,
        workflowId:   resolvedWorkflowId,
        stepId:       resolvedStepId,
        meta: JSON.stringify(meta),
      },
    });
  } catch (err: any) {
    console.error("[attribution]", err.message);
  }
}
