/**
 * devSeed.ts
 *
 * POST /api/dev/seed
 *
 * Seeds comprehensive GTM pipeline mock data into the authenticated user's
 * primary workspace so all pages render with convincing demo visuals.
 *
 * Idempotent — won't double-seed if called twice (checks IqLead count first).
 * Safe in production — protected by requireAuth, user can only seed their own workspace.
 *
 * What is seeded:
 *  - 15 IntegrationConnections (6 Live · 5 Slow · 4 Silent)
 *  - 43 IqLeads with full cross-tool touchpoint history
 *  - Extra touchpoints for 8 additional tools (beyond original 7)
 *  - N8nConnection + 3 N8nWorkflowMeta records
 *  - N8nQueuedEvents for 3 workflows (varied success rates: 94.2 / 87.6 / 70.2 %)
 *  - WebhookErrors for the worst-performing workflow
 *  - Outcome records for deal_won events
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../utils/encryption";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function mintId(): string {
  let id = "iq_";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) id += CHARS[bytes[i] % CHARS.length];
  return id;
}

const HASH_KEY = process.env.LEAD_HASH_KEY || "iqpipe-identity-hmac-v1-change-in-prod";
function hmac(v: string) {
  return crypto.createHmac("sha256", HASH_KEY).update(v).digest("hex");
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

function daysAgo(d: number, jitterHours = 0): Date {
  return new Date(Date.now() - d * 86_400_000 - jitterHours * 3_600_000);
}

function randId(prefix = "evt") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

// ── Contacts ──────────────────────────────────────────────────────────────────

const CONTACTS = [
  { first: "Sarah",    last: "Mitchell",  email: "sarah.mitchell@notion.so",    company: "Notion",       title: "Head of RevOps" },
  { first: "James",    last: "Chen",      email: "j.chen@linear.app",           company: "Linear",       title: "VP of Growth" },
  { first: "Priya",    last: "Sharma",    email: "priya@vercel.com",            company: "Vercel",       title: "Director of Sales" },
  { first: "Tom",      last: "Erikson",   email: "tom.erikson@stripe.com",      company: "Stripe",       title: "Enterprise AE" },
  { first: "Laura",    last: "Becker",    email: "l.becker@figma.com",          company: "Figma",        title: "RevOps Manager" },
  { first: "Alex",     last: "Johnson",   email: "alex@loom.com",               company: "Loom",         title: "GTM Engineer" },
  { first: "Maria",    last: "Garcia",    email: "m.garcia@hubspot.com",        company: "HubSpot",      title: "Sales Ops Lead" },
  { first: "Daniel",   last: "Park",      email: "d.park@intercom.io",          company: "Intercom",     title: "Head of Sales Dev" },
  { first: "Emma",     last: "Wilson",    email: "emma.wilson@segment.com",     company: "Segment",      title: "Growth Engineer" },
  { first: "Lucas",    last: "Rossi",     email: "l.rossi@braze.com",           company: "Braze",        title: "Sales Engineer" },
  { first: "Ava",      last: "Thompson",  email: "ava.t@drift.com",             company: "Drift",        title: "RevOps Analyst" },
  { first: "Noah",     last: "White",     email: "noah@clickup.com",            company: "ClickUp",      title: "VP Sales" },
  { first: "Olivia",   last: "Brown",     email: "olivia.b@notion.so",          company: "Notion",       title: "Sales Manager" },
  { first: "Ethan",    last: "Davis",     email: "ethan.davis@rippling.com",    company: "Rippling",     title: "Director of RevOps" },
  { first: "Sophia",   last: "Martinez",  email: "s.martinez@apollo.io",        company: "Apollo",       title: "GTM Lead" },
  { first: "Mason",    last: "Anderson",  email: "mason.a@mixpanel.com",        company: "Mixpanel",     title: "Growth Ops" },
  { first: "Isabella", last: "Taylor",    email: "i.taylor@amplitude.com",      company: "Amplitude",    title: "VP Sales Engineering" },
  { first: "Logan",    last: "Moore",     email: "l.moore@planhat.com",         company: "Planhat",      title: "Head of Customer Success" },
  { first: "Mia",      last: "Jackson",   email: "mia.j@gong.io",              company: "Gong",         title: "RevOps Director" },
  { first: "Liam",     last: "Harris",    email: "liam.h@outreach.io",          company: "Outreach",     title: "Sales Dev Manager" },
  { first: "Charlotte",last: "Clark",     email: "c.clark@salesloft.com",       company: "Salesloft",    title: "Enterprise Sales" },
  { first: "Oliver",   last: "Lewis",     email: "o.lewis@zoominfo.com",        company: "ZoomInfo",     title: "GTM Ops Lead" },
  { first: "Amelia",   last: "Robinson",  email: "amelia.r@clay.com",           company: "Clay",         title: "Partner Engineer" },
  { first: "Elijah",   last: "Walker",    email: "e.walker@lemlist.com",        company: "Lemlist",      title: "Head of Growth" },
  { first: "Harper",   last: "Hall",      email: "harper.hall@instantly.ai",    company: "Instantly",    title: "Sales Ops" },
  { first: "Aiden",    last: "Young",     email: "aiden.y@smartlead.ai",        company: "Smartlead",    title: "GTM Analyst" },
  { first: "Evelyn",   last: "Allen",     email: "evelyn.a@pipedrive.com",      company: "Pipedrive",    title: "Sales Director" },
  { first: "Carter",   last: "Scott",     email: "c.scott@attio.com",           company: "Attio",        title: "Head of Sales" },
  { first: "Abigail",  last: "Green",     email: "abigail.g@close.com",         company: "Close",        title: "RevOps Lead" },
  { first: "Jackson",  last: "Adams",     email: "j.adams@chargebee.com",       company: "Chargebee",    title: "VP Revenue" },
  { first: "Emily",    last: "Nelson",    email: "emily.n@paddle.com",          company: "Paddle",       title: "Sales Engineer" },
  { first: "Sebastian",last: "Baker",     email: "s.baker@churnzero.com",       company: "ChurnZero",    title: "CS Operations" },
  { first: "Ella",     last: "Carter",    email: "ella.c@gainsight.com",        company: "Gainsight",    title: "Director of CS" },
  { first: "Jack",     last: "Mitchell",  email: "jack.m@totango.com",          company: "Totango",      title: "GTM Engineer" },
  { first: "Grace",    last: "Perez",     email: "grace.p@klenty.com",          company: "Klenty",       title: "Sales Ops Manager" },
  { first: "Owen",     last: "Roberts",   email: "owen.r@woodpecker.co",        company: "Woodpecker",   title: "Growth Lead" },
  { first: "Zoey",     last: "Turner",    email: "zoey.t@replyio.com",          company: "Reply.io",     title: "Partner Manager" },
  { first: "Wyatt",    last: "Phillips",  email: "w.phillips@salesforce.com",   company: "Salesforce",   title: "Enterprise Sales" },
  { first: "Lily",     last: "Campbell",  email: "lily.c@hubspot.com",          company: "HubSpot",      title: "Account Executive" },
  { first: "Henry",    last: "Parker",    email: "h.parker@marketo.com",        company: "Marketo",      title: "Marketing Ops" },
  { first: "Aria",     last: "Evans",     email: "aria.e@clearbit.com",         company: "Clearbit",     title: "Head of Data" },
  { first: "Grayson",  last: "Edwards",   email: "g.edwards@lusha.com",         company: "Lusha",        title: "Sales Director" },
  { first: "Scarlett", last: "Collins",   email: "s.collins@zoominfo.com",      company: "ZoomInfo",     title: "RevOps Analyst" },
];

// ── 15 Integrations: 6 Live · 5 Slow · 4 Silent ──────────────────────────────
//
// Signal health is computed from how long ago the last touchpoint arrived.
// Thresholds are defined in signalHealth.ts (see SILENCE_THRESHOLD map).
//
//  Live  = last event within threshold
//  Slow  = last event between threshold and threshold×2
//  Silent = last event beyond threshold×2
//
// Tools & their thresholds (hours):
//   clay 4 · apollo 6 · heyreach 6 · instantly 6 · smartlead 6
//   hubspot 48 · stripe 48 · pipedrive 48 · chargebee 48 · attio 48
//   phantombuster 12 · lemlist 6 · clearbit 24 · outreach 12 · hunter 24

const INTEGRATIONS: {
  provider: string;
  signalStatus: "live" | "slow" | "silent";
  lastEventHoursAgo: number;   // drives the touchpoint timestamp
  threshold: number;
}[] = [
  // ── Live (6) ──────────────────────────────────────────────────────────────
  { provider: "clay",          signalStatus: "live",   lastEventHoursAgo: 1,   threshold: 4  },
  { provider: "apollo",        signalStatus: "live",   lastEventHoursAgo: 2,   threshold: 6  },
  { provider: "heyreach",      signalStatus: "live",   lastEventHoursAgo: 3,   threshold: 6  },
  { provider: "hubspot",       signalStatus: "live",   lastEventHoursAgo: 10,  threshold: 48 },
  { provider: "stripe",        signalStatus: "live",   lastEventHoursAgo: 8,   threshold: 48 },
  { provider: "pipedrive",     signalStatus: "live",   lastEventHoursAgo: 15,  threshold: 48 },

  // ── Slow (5) ──────────────────────────────────────────────────────────────
  { provider: "instantly",     signalStatus: "slow",   lastEventHoursAgo: 9,   threshold: 6  },
  { provider: "smartlead",     signalStatus: "slow",   lastEventHoursAgo: 10,  threshold: 6  },
  { provider: "chargebee",     signalStatus: "slow",   lastEventHoursAgo: 72,  threshold: 48 },
  { provider: "phantombuster", signalStatus: "slow",   lastEventHoursAgo: 18,  threshold: 12 },
  { provider: "attio",         signalStatus: "slow",   lastEventHoursAgo: 60,  threshold: 48 },

  // ── Silent (4) ────────────────────────────────────────────────────────────
  { provider: "lemlist",       signalStatus: "silent", lastEventHoursAgo: 20,  threshold: 6  },
  { provider: "clearbit",      signalStatus: "silent", lastEventHoursAgo: 72,  threshold: 24 },
  { provider: "outreach",      signalStatus: "silent", lastEventHoursAgo: 30,  threshold: 12 },
  { provider: "hunter",        signalStatus: "silent", lastEventHoursAgo: 72,  threshold: 24 },
];

// ── Tool → channel/event for extra touchpoints ────────────────────────────────
const TOOL_META: Record<string, { channel: string; events: string[] }> = {
  clay:          { channel: "enrichment",  events: ["lead_enriched", "lead_imported"] },
  apollo:        { channel: "prospecting", events: ["lead_imported", "email_sent"] },
  heyreach:      { channel: "linkedin",    events: ["connection_sent", "connection_accepted", "reply_received"] },
  hubspot:       { channel: "crm",         events: ["deal_created", "meeting_booked"] },
  stripe:        { channel: "billing",     events: ["deal_won"] },
  pipedrive:     { channel: "crm",         events: ["deal_created", "deal_updated"] },
  instantly:     { channel: "email",       events: ["sequence_started", "email_opened"] },
  smartlead:     { channel: "email",       events: ["sequence_started", "email_clicked"] },
  chargebee:     { channel: "billing",     events: ["subscription_created", "invoice_paid"] },
  phantombuster: { channel: "linkedin",    events: ["connection_request_sent", "message_sent"] },
  attio:         { channel: "crm",         events: ["contact_created", "deal_updated"] },
  lemlist:       { channel: "email",       events: ["sequence_started", "email_sent"] },
  clearbit:      { channel: "enrichment",  events: ["lead_enriched"] },
  outreach:      { channel: "email",       events: ["sequence_started", "email_sent"] },
  hunter:        { channel: "enrichment",  events: ["lead_enriched"] },
};

// ── N8n workflow definitions ──────────────────────────────────────────────────
//
// Three automations with deliberately varied success rates so the page can
// call out the best and worst performer.
//
//  #1 LinkedIn → CRM Sync      94.2%  ← best performer
//  #2 Email Enrichment Pipeline 87.6%
//  #3 Deal Closed → Billing     70.2%  ← worst (Chargebee rate-limiting errors)

const N8N_WORKFLOWS = [
  {
    n8nId:       "wf_001_linkedin_crm",
    name:        "LinkedIn → CRM Sync",
    description: "Syncs LinkedIn connection events from HeyReach into HubSpot and Pipedrive in real-time. Creates contacts, updates deal stages, and triggers follow-up sequences automatically.",
    active:      true,
    tags:        ["outreach", "crm", "linkedin"],
    appsUsed:    ["heyreach", "hubspot", "pipedrive", "clay"],
    nodeCount:   8,
    triggerType: "webhook",
    totalEvents: 120,
    doneEvents:  113,
    failedEvents: 4,
    pendingEvents: 3,
    // successRate: 94.2%
    errors: [
      { code: "CONTACT_MISSING", detail: "HubSpot contact not found for linkedin_url https://linkedin.com/in/deleted-profile. Skipping CRM update." },
      { code: "RATE_LIMIT",      detail: "HubSpot API rate limit hit (100 req/10s). Event queued for retry." },
      { code: "SCHEMA_INVALID",  detail: "Missing required field 'company' in HeyReach payload. Contact enrichment skipped." },
    ],
  },
  {
    n8nId:       "wf_002_email_enrich",
    name:        "Email Enrichment Pipeline",
    description: "Runs daily at 06:00 UTC. Pulls new leads from Apollo, enriches with Clay, segments by ICP score, then distributes to Instantly and Smartlead sequences based on company size.",
    active:      true,
    tags:        ["enrichment", "email", "outreach", "icp"],
    appsUsed:    ["instantly", "clay", "apollo", "smartlead"],
    nodeCount:   12,
    triggerType: "schedule",
    totalEvents: 89,
    doneEvents:  78,
    failedEvents: 10,
    pendingEvents: 1,
    // successRate: 87.6%
    errors: [
      { code: "SCHEMA_INVALID",  detail: "Apollo returned null email for 3 contacts. Enrichment skipped — no valid address to sequence." },
      { code: "RATE_LIMIT",      detail: "Clay enrichment API: 429 Too Many Requests. Batch of 7 contacts re-queued for next run." },
      { code: "CONTACT_MISSING", detail: "Smartlead campaign 'Q2-ICP-Mid' not found. Check campaign ID in workflow config." },
    ],
  },
  {
    n8nId:       "wf_003_deal_billing",
    name:        "Deal Closed → Billing Activation",
    description: "Triggered when a deal moves to 'Closed Won' in HubSpot or Pipedrive. Activates subscription in Stripe, creates customer record in Chargebee, and sends onboarding email via Intercom.",
    active:      true,
    tags:        ["billing", "crm", "revenue", "onboarding"],
    appsUsed:    ["hubspot", "stripe", "chargebee", "pipedrive"],
    nodeCount:   6,
    triggerType: "webhook",
    totalEvents: 47,
    doneEvents:  33,
    failedEvents: 12,
    pendingEvents: 2,
    // successRate: 70.2%
    errors: [
      { code: "RATE_LIMIT",     detail: "Chargebee API 429: subscription creation rate limit exceeded (5 req/s). 6 events failed after 3 retries." },
      { code: "AUTH_FAILED",    detail: "Chargebee API key expired or rotated. 4 subscription activations failed. Rotate key in Integration Settings." },
      { code: "INTERNAL_ERROR", detail: "Stripe webhook timeout (>30s) for deal ch_demo_009. Manual verification required." },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/seed
// ─────────────────────────────────────────────────────────────────────────────

router.post("/seed", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;

  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return res.status(404).json({ error: "No workspace found." });

  const workspaceId = membership.workspace.id;

  // Idempotency
  const existing = await prisma.iqLead.count({ where: { workspaceId } });
  if (existing > 0) {
    return res.json({
      skipped: true,
      message: `Already seeded (${existing} IqLeads exist). Delete them first to re-seed.`,
    });
  }

  // ── 1. IntegrationConnections (15 tools) ─────────────────────────────────

  for (const intg of INTEGRATIONS) {
    const exists = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: intg.provider },
    });
    if (!exists) {
      await prisma.integrationConnection.create({
        data: {
          workspaceId,
          provider: intg.provider,
          status:   "connected",
          authData: encrypt(JSON.stringify({
            apiKey:       "demo-key",
            seeded:       true,
            signalStatus: intg.signalStatus,
          })),
        },
      });
    }
  }

  // ── 2. IqLeads + main funnel touchpoints ─────────────────────────────────

  const touchpointsBatch: any[] = [];
  const iqLeadIds: string[] = [];

  for (let i = 0; i < CONTACTS.length; i++) {
    const c       = CONTACTS[i];
    const iqId    = mintId();
    const eHash   = hmac(c.email.toLowerCase().trim());
    const eEnc    = encrypt(c.email.toLowerCase().trim());

    const sourcedAt  = daysAgo(28 - i * 0.5, Math.random() * 8);
    const enrichedAt = new Date(sourcedAt.getTime() + 3_600_000 * 2);
    const contactAt  = new Date(sourcedAt.getTime() + 86_400_000 * (1 + Math.random()));
    const engageAt   = new Date(contactAt.getTime()  + 86_400_000 * (2 + Math.random() * 2));
    const replyAt    = new Date(engageAt.getTime()   + 86_400_000 * (1 + Math.random() * 3));
    const meetingAt  = new Date(replyAt.getTime()    + 86_400_000 * Math.random() * 2);
    const dealAt     = new Date(meetingAt.getTime()  + 86_400_000 * (2 + Math.random() * 3));
    const wonAt      = new Date(dealAt.getTime()     + 86_400_000 * (1 + Math.random() * 5));

    await prisma.iqLead.create({
      data: {
        id: iqId, workspaceId,
        emailHash: eHash, emailEnc: eEnc,
        displayName: `${c.first} ${c.last[0]}.`,
        company: c.company,
        title:   c.title,
      },
    });
    iqLeadIds.push(iqId);

    // Sourced (apollo or clay)
    const sourceTool = i % 3 === 0 ? "apollo" : "clay";
    touchpointsBatch.push({
      workspaceId, iqLeadId: iqId,
      tool: sourceTool, channel: "prospecting",
      eventType: "lead_imported",
      meta: JSON.stringify({ company: c.company, title: c.title }),
      recordedAt: sourcedAt,
    });

    // Enriched (86%)
    if (i < 43) {
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "clay", channel: "enrichment",
        eventType: "lead_enriched",
        meta: JSON.stringify({ company: c.company, title: c.title }),
        recordedAt: enrichedAt,
      });
    }

    // Contacted (68%)
    if (i < 34) {
      const outTool  = i < 20 ? "heyreach" : "instantly";
      const outCh    = i < 20 ? "linkedin" : "email";
      const startEvt = i < 20 ? "connection_sent" : "sequence_started";
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: outTool, channel: outCh, eventType: startEvt,
        meta: JSON.stringify({ campaign: i < 20 ? "Q1 LinkedIn Outreach" : "Q1 Email Blast" }),
        recordedAt: contactAt,
      });
      // Overlap: leads 10-13 also in smartlead
      if (i >= 10 && i < 14) {
        touchpointsBatch.push({
          workspaceId, iqLeadId: iqId,
          tool: "smartlead", channel: "email", eventType: "sequence_started",
          meta: JSON.stringify({ campaign: "Q1 Smartlead Sequence" }),
          recordedAt: new Date(contactAt.getTime() + 3_600_000 * 4),
        });
      }
    }

    // Engaged (34%)
    if (i < 17) {
      const engTool = i < 10 ? "heyreach" : "instantly";
      const engCh   = i < 10 ? "linkedin" : "email";
      const engEvt  = i < 10 ? "connection_accepted" : "email_opened";
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: engTool, channel: engCh, eventType: engEvt,
        meta: JSON.stringify({}),
        recordedAt: engageAt,
      });
    }

    // Replied (16%)
    if (i < 8) {
      const repTool = i < 5 ? "heyreach" : "instantly";
      const repCh   = i < 5 ? "linkedin" : "email";
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: repTool, channel: repCh, eventType: "reply_received",
        meta: JSON.stringify({ message: "Sounds interesting, let's chat." }),
        recordedAt: replyAt,
      });
    }

    // Meeting booked (6%)
    if (i < 3) {
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "hubspot", channel: "crm", eventType: "meeting_booked",
        meta: JSON.stringify({ duration: "30min" }),
        recordedAt: meetingAt,
      });
    }

    // Deal created (4%)
    if (i < 2) {
      // HubSpot deal
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "hubspot", channel: "crm", eventType: "deal_created",
        meta: JSON.stringify({ amount: i === 0 ? 12400 : 8900, currency: "USD" }),
        recordedAt: dealAt,
      });
      // Also mirror to Pipedrive
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "pipedrive", channel: "crm", eventType: "deal_created",
        meta: JSON.stringify({ amount: i === 0 ? 12400 : 8900, currency: "USD", source: "hubspot_sync" }),
        recordedAt: new Date(dealAt.getTime() + 60_000 * 5),
      });
    }

    // Deal won (2%)
    if (i === 0) {
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "stripe", channel: "billing", eventType: "deal_won",
        meta: JSON.stringify({ amount: 12400, currency: "USD", chargeId: "ch_demo_001" }),
        recordedAt: wonAt,
      });
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqId,
        tool: "chargebee", channel: "billing", eventType: "subscription_created",
        meta: JSON.stringify({ amount: 12400, currency: "USD", plan: "growth_annual" }),
        recordedAt: new Date(wonAt.getTime() + 60_000 * 2),
      });
    }
  }

  // ── 3. Extra "recent health" touchpoints per tool ─────────────────────────
  //
  // Each integration gets at least one recent touchpoint at exactly
  // lastEventHoursAgo so the signal health view shows the right status.
  // We use the first ~10 iqLeadIds as anchors (any lead is fine for health).

  for (let t = 0; t < INTEGRATIONS.length; t++) {
    const intg       = INTEGRATIONS[t];
    const meta       = TOOL_META[intg.provider];
    if (!meta) continue;
    const leadIdx    = t % Math.min(iqLeadIds.length, 10);
    const leadId     = iqLeadIds[leadIdx];
    const eventType  = meta.events[0];
    const recordedAt = hoursAgo(intg.lastEventHoursAgo);

    // Health anchor touchpoint
    touchpointsBatch.push({
      workspaceId, iqLeadId: leadId,
      tool: intg.provider, channel: meta.channel, eventType,
      meta: JSON.stringify({ seeded: true, signalStatus: intg.signalStatus }),
      recordedAt,
    });

    // Extra historical touchpoints to fill event counts
    for (let k = 1; k <= 4; k++) {
      touchpointsBatch.push({
        workspaceId, iqLeadId: iqLeadIds[(leadIdx + k) % iqLeadIds.length],
        tool: intg.provider, channel: meta.channel,
        eventType: meta.events[k % meta.events.length],
        meta: JSON.stringify({ seeded: true }),
        recordedAt: daysAgo(k * 2, Math.random() * 12),
      });
    }
  }

  // Bulk-insert all touchpoints
  await prisma.touchpoint.createMany({ data: touchpointsBatch });

  // ── 4. Outcome records for deal_won ──────────────────────────────────────

  if (iqLeadIds.length > 0) {
    await prisma.outcome.create({
      data: {
        workspaceId,
        iqLeadId:         iqLeadIds[0],
        type:             "deal_won",
        value:            12400,
        currency:         "USD",
        reportingTool:    "stripe",
        firstTouchTool:   "apollo",
        lastTouchTool:    "hubspot",
        attributedTools:  JSON.stringify(["apollo", "clay", "heyreach", "hubspot", "stripe"]),
        attributedChannels: JSON.stringify(["prospecting", "enrichment", "linkedin", "crm", "billing"]),
        recordedAt:       daysAgo(3),
      },
    });
  }

  // ── 5. N8n Connection ─────────────────────────────────────────────────────

  const existingN8n = await prisma.n8nConnection.findUnique({ where: { workspaceId } });
  if (!existingN8n) {
    await prisma.n8nConnection.create({
      data: {
        workspaceId,
        baseUrl:      "https://n8n.demo.iqpipe.io",
        apiKeyEnc:    encrypt("demo-n8n-api-key"),
        authType:     "apikey",
        status:       "connected",
        workflowCount: N8N_WORKFLOWS.length,
        lastSyncAt:   daysAgo(0, 2),
      },
    });
  }

  // ── 6. N8nWorkflowMeta ───────────────────────────────────────────────────

  for (const wf of N8N_WORKFLOWS) {
    const exists = await prisma.n8nWorkflowMeta.findUnique({
      where: { workspaceId_n8nId: { workspaceId, n8nId: wf.n8nId } },
    });
    if (!exists) {
      await prisma.n8nWorkflowMeta.create({
        data: {
          workspaceId,
          n8nId:        wf.n8nId,
          name:         wf.name,
          active:       wf.active,
          tags:         JSON.stringify(wf.tags),
          appsUsed:     JSON.stringify(wf.appsUsed),
          nodeTypes:    JSON.stringify(wf.appsUsed.map(a => `n8n-nodes-base.${a}Action`)),
          nodeCount:    wf.nodeCount,
          triggerType:  wf.triggerType,
          description:  wf.description,
          lastUpdatedAt: daysAgo(1),
          syncedAt:     new Date(),
        },
      });
    }
  }

  // ── 7. N8nQueuedEvents (done + failed + pending) ─────────────────────────

  const queuedBatch: any[] = [];

  for (const wf of N8N_WORKFLOWS) {
    const baseTime = daysAgo(30);

    // Done events
    for (let i = 0; i < wf.doneEvents; i++) {
      const app = wf.appsUsed[i % wf.appsUsed.length];
      const key = hmac(`${wf.n8nId}-done-${i}`).slice(0, 32);
      queuedBatch.push({
        workspaceId,
        workflowId:    wf.n8nId,
        stepId:        `step_${i % wf.nodeCount + 1}`,
        sourceApp:     app,
        externalId:    `ext_${randId()}`,
        eventType:     TOOL_META[app]?.events[0] ?? "event_processed",
        contact:       JSON.stringify({ email: `contact${i}@example.com`, first_name: `Demo`, last_name: `User${i}` }),
        meta:          JSON.stringify({ workflow: wf.name, seeded: true }),
        idempotencyKey: key,
        sourceType:    "n8n_workflow",
        sourcePriority: 3,
        eventClass:    i % 5 === 0 ? "outcome" : "process",
        status:        "done",
        attempts:      1,
        createdAt:     new Date(baseTime.getTime() + i * 3_600_000 * (30 / wf.totalEvents) * 24),
        processedAt:   new Date(baseTime.getTime() + i * 3_600_000 * (30 / wf.totalEvents) * 24 + 5_000),
      });
    }

    // Failed events
    for (let i = 0; i < wf.failedEvents; i++) {
      const app = wf.appsUsed[i % wf.appsUsed.length];
      const key = hmac(`${wf.n8nId}-failed-${i}`).slice(0, 32);
      queuedBatch.push({
        workspaceId,
        workflowId:    wf.n8nId,
        stepId:        `step_${i % wf.nodeCount + 1}`,
        sourceApp:     app,
        externalId:    `ext_failed_${randId()}`,
        eventType:     TOOL_META[app]?.events[0] ?? "event_processed",
        contact:       JSON.stringify({ email: `failed${i}@example.com`, first_name: `Demo`, last_name: `Failed${i}` }),
        meta:          JSON.stringify({ workflow: wf.name, seeded: true }),
        idempotencyKey: key,
        sourceType:    "n8n_workflow",
        sourcePriority: 3,
        eventClass:    "process",
        status:        "failed",
        attempts:      3,
        lastError:     wf.errors[i % wf.errors.length].detail,
        createdAt:     daysAgo(7 - i, Math.random() * 12),
      });
    }

    // Pending events
    for (let i = 0; i < wf.pendingEvents; i++) {
      const app = wf.appsUsed[0];
      const key = hmac(`${wf.n8nId}-pending-${i}`).slice(0, 32);
      queuedBatch.push({
        workspaceId,
        workflowId:    wf.n8nId,
        stepId:        "step_1",
        sourceApp:     app,
        externalId:    `ext_pending_${randId()}`,
        eventType:     "event_queued",
        contact:       JSON.stringify({ email: `pending${i}@example.com`, first_name: `Demo`, last_name: `Pending${i}` }),
        meta:          JSON.stringify({ workflow: wf.name, seeded: true }),
        idempotencyKey: key,
        sourceType:    "n8n_workflow",
        sourcePriority: 3,
        eventClass:    "process",
        status:        "pending",
        attempts:      0,
        createdAt:     hoursAgo(i + 1),
      });
    }
  }

  // Insert in batches of 50 to avoid Prisma limits
  for (let i = 0; i < queuedBatch.length; i += 50) {
    await prisma.n8nQueuedEvent.createMany({
      data:            queuedBatch.slice(i, i + 50),
      skipDuplicates:  true,
    });
  }

  // ── 8. WebhookErrors for the worst-performing workflow (#3) ───────────────

  const wf3 = N8N_WORKFLOWS[2];
  for (const err of wf3.errors) {
    await prisma.webhookError.create({
      data: {
        workspaceId,
        source:      wf3.n8nId,
        payload:     JSON.stringify({ workflow: wf3.name, seeded: true }),
        errorCode:   err.code,
        errorDetail: err.detail,
        retryCount:  3,
        createdAt:   daysAgo(2, Math.random() * 24),
      },
    });
  }

  // Also add one error for workflow #2
  const wf2 = N8N_WORKFLOWS[1];
  await prisma.webhookError.create({
    data: {
      workspaceId,
      source:      wf2.n8nId,
      payload:     JSON.stringify({ workflow: wf2.name, seeded: true }),
      errorCode:   wf2.errors[0].code,
      errorDetail: wf2.errors[0].detail,
      retryCount:  2,
      createdAt:   daysAgo(3),
    },
  });

  // ── Done ─────────────────────────────────────────────────────────────────

  const successRates = N8N_WORKFLOWS.map((wf) => ({
    name:        wf.name,
    successRate: Math.round((wf.doneEvents / wf.totalEvents) * 1000) / 10,
    total:       wf.totalEvents,
  }));

  const best = successRates.reduce((a, b) => a.successRate > b.successRate ? a : b);

  res.json({
    seeded: true,
    workspace:   membership.workspace.name,
    iqLeads:     CONTACTS.length,
    touchpoints: touchpointsBatch.length,
    integrations: {
      total:  INTEGRATIONS.length,
      live:   INTEGRATIONS.filter(i => i.signalStatus === "live").length,
      slow:   INTEGRATIONS.filter(i => i.signalStatus === "slow").length,
      silent: INTEGRATIONS.filter(i => i.signalStatus === "silent").length,
      tools:  INTEGRATIONS.map(i => `${i.provider} (${i.signalStatus})`),
    },
    automations: {
      workflows: successRates,
      bestPerformer: `${best.name} — ${best.successRate}% success rate`,
      queuedEvents: queuedBatch.length,
    },
    message: "Refresh any page to see the demo data.",
  });
});

export default router;
