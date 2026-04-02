/**
 * events.ts — Source-agnostic event ingestion (Priority 1)
 *
 * POST /api/events
 *   Accepts events from any source — website visitors, internal databases,
 *   custom APIs, or any n8n/Make node that isn't a known GTM tool.
 *   Full GDPR consent tracking + anonymous identity stitching built-in.
 *
 * DELETE /api/events/erase/:iqLeadId
 *   GDPR Right to Erasure (Art. 17) — clears all PII from an IqLead record
 *   and marks it as erased. Retains non-PII structural data for integrity.
 *
 * GET /api/events/subject/:iqLeadId
 *   GDPR Data Subject Access Request (Art. 15) — returns all data held
 *   about a specific lead, decrypted for workspace owner review.
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { resolveIqLead, recordTouchpoint, channelForTool } from "../utils/identity";
import { decrypt } from "../utils/encryption";
import { checkAndIncrementQuota, quotaExceededResponse, rateLimitExceededResponse, WorkspaceQuotaFields } from "../utils/quota";
import { detectAndLearn } from "../utils/fieldDetector";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Resolves workspace from either JWT Bearer token or public API key.
 *  Returns all fields needed for quota + rate-limit checking so the
 *  downstream checkAndIncrementQuota call can skip a second DB read. */
async function resolveWorkspaceFromRequest(req: Request): Promise<WorkspaceQuotaFields | null> {
  const auth = req.headers.authorization ?? "";

  const QUOTA_SELECT = {
    id: true, plan: true,
    eventCountMonth: true, eventCountResetAt: true,
    eventCountMinute: true, rateLimitResetAt: true,
  } as const;

  // Option A: JWT Bearer (user is authenticated via the app)
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      const membership = await prisma.workspaceUser.findFirst({
        where: { userId: payload.sub },
        include: { workspace: { select: QUOTA_SELECT } },
        orderBy: { createdAt: "asc" },
      });
      return membership ? membership.workspace : null;
    } catch { /* fall through to API key check */ }
  }

  // Option B: Public API key (n8n / external systems)
  const apiKey = (req.headers["x-api-key"] as string)
    || (req.query.key as string)
    || (auth.startsWith("Bearer ") ? auth.slice(7) : "");

  if (apiKey) {
    const ws = await prisma.workspace.findFirst({
      where: { publicApiKey: apiKey },
      select: QUOTA_SELECT,
    });
    return ws ?? null;
  }

  return null;
}

// ── GDPR consent basis validation ────────────────────────────────────────────

const VALID_CONSENT_BASES = new Set([
  "legitimate_interest",
  "consent",
  "contract",
  "vital_interests",
  "public_task",
  "legal_obligation",
]);

// ── POST /api/events — source-agnostic ingest ────────────────────────────────

/**
 * Minimal required schema:
 * {
 *   "contact": { "email"?: "...", "anonymousId"?: "session_abc", "name"?: "..." },
 *   "event":   "page_viewed",           // any string — known or custom
 *   "source":  "website",               // free-text name for the source
 *   "channel": "web",                   // "web" | "email" | "crm" | "custom" etc.
 *   "consent": {                        // GDPR — required
 *     "basis": "legitimate_interest",
 *     "version"?: "privacy-policy-v2",
 *     "source"?: "cookie-banner"
 *   },
 *   "timestamp"?: "2026-01-01T00:00:00Z",
 *   "workflowId"?: "...",               // n8n workflow ID if called from n8n
 *   "stepId"?:     "...",               // n8n step if called from n8n
 *   "meta"?:       { ... }             // any additional key-value pairs
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  const workspace = await resolveWorkspaceFromRequest(req);
  if (!workspace) return res.status(401).json({ error: "Invalid or missing API key / token." });

  const {
    contact = {},
    event,
    source,
    channel,
    consent,
    timestamp,
    workflowId,
    stepId,
    externalId,
    meta = {},
  } = req.body || {};

  // ── Validation ────────────────────────────────────────────────────────────
  if (!event || typeof event !== "string") {
    return res.status(400).json({ error: "event is required (string)" });
  }
  if (!source || typeof source !== "string") {
    return res.status(400).json({ error: "source is required (string)" });
  }
  if (!consent?.basis) {
    return res.status(400).json({
      error: "consent.basis is required for GDPR compliance.",
      validValues: Array.from(VALID_CONSENT_BASES),
    });
  }
  if (!VALID_CONSENT_BASES.has(consent.basis)) {
    return res.status(400).json({
      error: `consent.basis must be one of: ${Array.from(VALID_CONSENT_BASES).join(", ")}`,
    });
  }

  // At least one contact anchor required
  const hasIdentifier = contact.email || contact.anonymousId || contact.linkedin || contact.phone;
  if (!hasIdentifier) {
    return res.status(400).json({
      error: "contact must include at least one of: email, anonymousId, linkedin, phone",
    });
  }

  // ── Quota + rate-limit check (workspace data already fetched above — no second read) ──
  const quota = await checkAndIncrementQuota(workspace.id, { prefetched: workspace });
  if (!quota.allowed) {
    return res.status(429).json(
      quota.rateLimited ? rateLimitExceededResponse() : quotaExceededResponse(),
    );
  }

  // ── Parse contact name ────────────────────────────────────────────────────
  let firstName = contact.firstName || contact.first_name || "";
  let lastName  = contact.lastName  || contact.last_name  || "";
  if (!firstName && contact.name) {
    const parts = String(contact.name).trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName  = parts.slice(1).join(" ") || "";
  }

  // ── Fuzzy field detection: fill gaps if contact fields are sparse ─────────
  // Scans the full request body for fields that pattern-match canonical contact
  // fields (email, phone, LinkedIn URL, name, company, title). Only fills in
  // fields that are empty — existing values are never overwritten.
  {
    const enriched = await detectAndLearn(workspace.id, source, req.body, {
      email:       contact.email       || null,
      phone:       contact.phone       || null,
      linkedin:    contact.linkedin    || null,
      firstName:   firstName           || undefined,
      lastName:    lastName            || undefined,
      company:     contact.company     || null,
      title:       contact.title       || null,
      anonymousId: contact.anonymousId || null,
    });
    if (!contact.email    && enriched.email)       contact.email    = enriched.email;
    if (!contact.phone    && enriched.phone)       contact.phone    = enriched.phone;
    if (!contact.linkedin && enriched.linkedin)    contact.linkedin = enriched.linkedin;
    if (!firstName        && enriched.firstName)   firstName        = enriched.firstName;
    if (!lastName         && enriched.lastName)    lastName         = enriched.lastName;
    if (!contact.company  && enriched.company)     contact.company  = enriched.company;
    if (!contact.title    && enriched.title)       contact.title    = enriched.title;
    if (!contact.anonymousId && enriched.anonymousId) contact.anonymousId = enriched.anonymousId;
  }

  // ── Resolve or create IqLead (with GDPR consent + anonymous stitching) ────
  const iqLeadId = await resolveIqLead(
    workspace.id,
    {
      email:       contact.email       || null,
      linkedin:    contact.linkedin    || null,
      phone:       contact.phone       || null,
      anonymousId: contact.anonymousId || null,
    },
    {
      firstName,
      lastName,
      company: contact.company || null,
      title:   contact.title   || null,
    },
    {
      basis:     consent.basis,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      version:   consent.version  || null,
      source:    consent.source   || source,
    },
  );

  // ── Look up custom event label if available ───────────────────────────────
  const customType = await prisma.customEventType.findFirst({
    where: { workspaceId: workspace.id, key: event },
  }).catch(() => null);

  // ── Look up source mapping for the node type ──────────────────────────────
  const sourceMapping = source
    ? await prisma.sourceMapping.findFirst({
        where: { workspaceId: workspace.id, appKey: source },
      }).catch(() => null)
    : null;

  const resolvedChannel = channel
    || customType?.channel
    || sourceMapping?.channel
    || channelForTool(source)
    || "custom";

  // ── Record touchpoint ─────────────────────────────────────────────────────
  await recordTouchpoint(
    workspace.id,
    iqLeadId,
    source,
    event,
    {
      ...meta,
      source,
      channel:    resolvedChannel,
      via:        "generic_api",
      workflowId: workflowId ?? null,
      stepId:     stepId     ?? null,
    },
    null,              // experimentId
    null,              // stackVariant
    "generic_api",     // sourceType
    1,                 // sourcePriority — direct API calls are most authoritative
    workflowId ?? null,
    stepId     ?? null,
    consent.basis,
    externalId  ?? null,
  );

  // ── Backward-compat Activity record for Live Feed ─────────────────────────
  const sourceKey    = source.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const contactAnchor = contact.email || contact.anonymousId || contact.linkedin || contact.phone || "unknown";
  const contactId    = `${sourceKey}-${contactAnchor.replace(/[^a-z0-9@._-]/gi, "_").slice(0, 64)}`;

  await prisma.contact.upsert({
    where:  { id: contactId },
    update: { firstName: firstName || "Unknown", lastName },
    create: {
      id: contactId, workspaceId: workspace.id,
      firstName: firstName || "Unknown", lastName,
      email: null, linkedinUrl: null, status: "active",
    },
  });

  let dbLead = await prisma.lead.findFirst({ where: { contactId } });
  if (!dbLead) {
    dbLead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id, contactId,
        email: "", fullName: `${firstName} ${lastName}`.trim() || "Unknown",
        firstName: firstName || "Unknown", lastName,
        company: contact.company || null, title: contact.title || null,
        source, status: "new",
      },
    });
  }

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.activity.findFirst({
    where: { workspaceId: workspace.id, leadId: dbLead.id, type: event, createdAt: { gte: dayStart } },
  });
  if (!existing) {
    await prisma.activity.create({
      data: {
        workspaceId: workspace.id, type: event,
        subject: `${firstName} ${lastName}`.trim() || "Unknown",
        body: JSON.stringify({ ...meta, source, channel: resolvedChannel, iqLeadId, via: "generic_api" }),
        status: "completed", leadId: dbLead.id,
      },
    });
  }

  return res.status(202).json({
    ok: true,
    iqLeadId,
    event,
    source,
    channel: resolvedChannel,
    consentBasis: consent.basis,
  });
});

// ── DELETE /api/events/erase/:iqLeadId — GDPR Right to Erasure ───────────────

router.delete("/erase/:iqLeadId", async (req: Request, res: Response) => {
  const workspace = await resolveWorkspaceFromRequest(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const { iqLeadId } = req.params;

  const lead = await prisma.iqLead.findFirst({
    where: { id: iqLeadId, workspaceId: workspace.id },
  });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  if (lead.erasedAt) return res.status(200).json({ ok: true, message: "Already erased" });

  // Erase: null all PII fields and hashes — preserve structural records
  await prisma.iqLead.update({
    where: { id: iqLeadId },
    data: {
      emailHash: null, emailEnc: null,
      linkedinHash: null, linkedinEnc: null,
      phoneHash: null, phoneEnc: null,
      anonymousId: null,
      displayName: "[erased]",
      company: null, title: null,
      erasureRequestedAt: lead.erasureRequestedAt ?? new Date(),
      erasedAt: new Date(),
    },
  });

  return res.json({ ok: true, iqLeadId, erasedAt: new Date().toISOString() });
});

// ── GET /api/events/subject/:iqLeadId — GDPR Data Subject Access ─────────────

router.get("/subject/:iqLeadId", async (req: Request, res: Response) => {
  const workspace = await resolveWorkspaceFromRequest(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const { iqLeadId } = req.params;

  const lead = await prisma.iqLead.findFirst({
    where: { id: iqLeadId, workspaceId: workspace.id },
    include: {
      touchpoints: { orderBy: { recordedAt: "asc" } },
      outcomes:    { orderBy: { recordedAt: "asc" } },
    },
  });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  // Decrypt PII for data subject access response
  const email    = lead.emailEnc    ? (() => { try { return decrypt(lead.emailEnc!); } catch { return null; } })() : null;
  const linkedin = lead.linkedinEnc ? (() => { try { return decrypt(lead.linkedinEnc!); } catch { return null; } })() : null;
  const phone    = lead.phoneEnc    ? (() => { try { return decrypt(lead.phoneEnc!); } catch { return null; } })() : null;

  return res.json({
    iqLeadId:         lead.id,
    displayName:      lead.displayName,
    email,
    linkedin,
    phone,
    company:          lead.company,
    title:            lead.title,
    firstSeenAt:      lead.firstSeenAt,
    lastSeenAt:       lead.lastSeenAt,
    consentBasis:     lead.consentBasis,
    consentTimestamp: lead.consentTimestamp,
    consentVersion:   lead.consentVersion,
    consentSource:    lead.consentSource,
    erasedAt:         lead.erasedAt,
    touchpointCount:  lead.touchpoints.length,
    outcomeCount:     lead.outcomes.length,
    touchpoints: lead.touchpoints.map(t => ({
      id:           t.id,
      tool:         t.tool,
      channel:      t.channel,
      eventType:    t.eventType,
      recordedAt:   t.recordedAt,
      consentBasis: t.consentBasis,
    })),
    outcomes: lead.outcomes.map(o => ({
      id:         o.id,
      type:       o.type,
      value:      o.value,
      currency:   o.currency,
      recordedAt: o.recordedAt,
    })),
  });
});

export default router;
