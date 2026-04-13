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
 *  - LeadActivitySummary rows (backfilled immediately after seed)
 *  - N8nConnection + 4 N8nWorkflowMeta (91.8 / 87.3 / 70.3 / 93.2 % success)
 *  - MakeConnection + 2 MakeScenarioMeta (89.6 / 97.4 % success)
 *  - N8nQueuedEvents for all 4 n8n workflows
 *  - WebhookErrors for the worst-performing workflow
 *  - Outcome records for deal_won events
 *  - WorkflowMirror for all 6 automations with app connections + observed events
 *  - Sample AppEvents + CorrelationResults (verified / mismatch / matched)
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../utils/encryption";
import { backfillWorkspace } from "../services/activitySummarizer";
import { backfillChurnProbabilities } from "../services/churnProbabilityService";
import { scoreWorkspaceLeads } from "../services/icpScoringService";

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
  { first: "Sarah",    last: "Mitchell",  email: "sarah.e787a3@demo.iq",    company: "Notion",       title: "Head of RevOps" },
  { first: "James",    last: "Chen",      email: "james.f5aef5@demo.iq",           company: "Linear",       title: "VP of Growth" },
  { first: "Priya",    last: "Sharma",    email: "priya.3faf3c@demo.iq",            company: "Vercel",       title: "Director of Sales" },
  { first: "Tom",      last: "Erikson",   email: "tom.717076@demo.iq",      company: "Stripe",       title: "Enterprise AE" },
  { first: "Laura",    last: "Becker",    email: "laura.2f5c4f@demo.iq",          company: "Figma",        title: "RevOps Manager" },
  { first: "Alex",     last: "Johnson",   email: "alex.702b25@demo.iq",               company: "Loom",         title: "GTM Engineer" },
  { first: "Maria",    last: "Garcia",    email: "maria.c02767@demo.iq",        company: "HubSpot",      title: "Sales Ops Lead" },
  { first: "Daniel",   last: "Park",      email: "daniel.1b01ce@demo.iq",          company: "Intercom",     title: "Head of Sales Dev" },
  { first: "Emma",     last: "Wilson",    email: "emma.0a05d4@demo.iq",     company: "Segment",      title: "Growth Engineer" },
  { first: "Lucas",    last: "Rossi",     email: "lucas.65a3ec@demo.iq",           company: "Braze",        title: "Sales Engineer" },
  { first: "Ava",      last: "Thompson",  email: "ava.98c838@demo.iq",             company: "Drift",        title: "RevOps Analyst" },
  { first: "Noah",     last: "White",     email: "noah.c7af2a@demo.iq",            company: "ClickUp",      title: "VP Sales" },
  { first: "Olivia",   last: "Brown",     email: "olivia.27d60a@demo.iq",          company: "Notion",       title: "Sales Manager" },
  { first: "Ethan",    last: "Davis",     email: "ethan.c4e4a8@demo.iq",    company: "Rippling",     title: "Director of RevOps" },
  { first: "Sophia",   last: "Martinez",  email: "sophia.5ac471@demo.iq",        company: "Apollo",       title: "GTM Lead" },
  { first: "Mason",    last: "Anderson",  email: "mason.8aac72@demo.iq",        company: "Mixpanel",     title: "Growth Ops" },
  { first: "Isabella", last: "Taylor",    email: "isabella.e20841@demo.iq",      company: "Amplitude",    title: "VP Sales Engineering" },
  { first: "Logan",    last: "Moore",     email: "logan.f0ba31@demo.iq",         company: "Planhat",      title: "Head of Customer Success" },
  { first: "Mia",      last: "Jackson",   email: "mia.07010a@demo.iq",              company: "Gong",         title: "RevOps Director" },
  { first: "Liam",     last: "Harris",    email: "liam.15a293@demo.iq",          company: "Outreach",     title: "Sales Dev Manager" },
  { first: "Charlotte",last: "Clark",     email: "charlotte.e06465@demo.iq",       company: "Salesloft",    title: "Enterprise Sales" },
  { first: "Oliver",   last: "Lewis",     email: "oliver.6384fd@demo.iq",        company: "ZoomInfo",     title: "GTM Ops Lead" },
  { first: "Amelia",   last: "Robinson",  email: "amelia.d024ec@demo.iq",           company: "Clay",         title: "Partner Engineer" },
  { first: "Elijah",   last: "Walker",    email: "elijah.0b5d29@demo.iq",        company: "Lemlist",      title: "Head of Growth" },
  { first: "Harper",   last: "Hall",      email: "harper.c640b0@demo.iq",    company: "Instantly",    title: "Sales Ops" },
  { first: "Aiden",    last: "Young",     email: "aiden.d7169b@demo.iq",        company: "Smartlead",    title: "GTM Analyst" },
  { first: "Evelyn",   last: "Allen",     email: "evelyn.53fe68@demo.iq",      company: "Pipedrive",    title: "Sales Director" },
  { first: "Carter",   last: "Scott",     email: "carter.405fd3@demo.iq",           company: "Attio",        title: "Head of Sales" },
  { first: "Abigail",  last: "Green",     email: "abigail.0ce8c1@demo.iq",         company: "Close",        title: "RevOps Lead" },
  { first: "Jackson",  last: "Adams",     email: "jackson.b2f098@demo.iq",       company: "Chargebee",    title: "VP Revenue" },
  { first: "Emily",    last: "Nelson",    email: "emily.92c38b@demo.iq",          company: "Paddle",       title: "Sales Engineer" },
  { first: "Sebastian",last: "Baker",     email: "sebastian.3f9d1a@demo.iq",       company: "ChurnZero",    title: "CS Operations" },
  { first: "Ella",     last: "Carter",    email: "ella.77bae2@demo.iq",        company: "Gainsight",    title: "Director of CS" },
  { first: "Jack",     last: "Mitchell",  email: "jack.6c72b9@demo.iq",          company: "Totango",      title: "GTM Engineer" },
  { first: "Grace",    last: "Perez",     email: "grace.0fe826@demo.iq",          company: "Klenty",       title: "Sales Ops Manager" },
  { first: "Owen",     last: "Roberts",   email: "owen.fe10ae@demo.iq",        company: "Woodpecker",   title: "Growth Lead" },
  { first: "Zoey",     last: "Turner",    email: "zoey.ad554a@demo.iq",          company: "Reply.io",     title: "Partner Manager" },
  { first: "Wyatt",    last: "Phillips",  email: "wyatt.275950@demo.iq",   company: "Salesforce",   title: "Enterprise Sales" },
  { first: "Lily",     last: "Campbell",  email: "lily.cc8bf5@demo.iq",          company: "HubSpot",      title: "Account Executive" },
  { first: "Henry",    last: "Parker",    email: "henry.a8b81e@demo.iq",        company: "Marketo",      title: "Marketing Ops" },
  { first: "Aria",     last: "Evans",     email: "aria.207db1@demo.iq",         company: "Clearbit",     title: "Head of Data" },
  { first: "Grayson",  last: "Edwards",   email: "grayson.0d851e@demo.iq",         company: "Lusha",        title: "Sales Director" },
  { first: "Scarlett", last: "Collins",   email: "scarlett.67b018@demo.iq",      company: "ZoomInfo",     title: "RevOps Analyst" },
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
// Four n8n automations covering the full GTM funnel with varied success rates.
//
//  #1 Full-Funnel Cold Outbound          91.8%  ← best n8n performer
//  #2 Email Enrichment Pipeline          87.6%
//  #3 Deal Closed → Revenue Activation   70.2%  ← worst (billing rate-limits)
//  #4 Inbound Lead Score & Route         93.5%
//
// appsUsed values must match NODE_APP_MAP friendly-name values (e.g. "HubSpot")
// because WorkflowMirrorDetailPage fuzzy-maps them against APP_CATALOG labels.

const N8N_WORKFLOWS = [
  {
    n8nId:       "wf_001_cold_outbound",
    name:        "Full-Funnel Cold Outbound",
    description: "End-to-end outbound motion: sources ICP leads from Apollo, enriches firmographics and contact data via Clay, runs LinkedIn connection sequence on HeyReach, follows up with Instantly email, and creates a HubSpot deal when a reply is received. Stripe monitors subscription activation on close.",
    active:      true,
    tags:        ["outbound", "prospecting", "enrichment", "linkedin", "email", "crm", "billing"],
    appsUsed:    ["Apollo", "Clay", "HeyReach", "Instantly", "HubSpot", "Stripe"],
    nodeCount:   14,
    triggerType: "schedule",
    totalEvents: 246,
    doneEvents:  226,
    failedEvents: 12,
    pendingEvents: 8,
    // successRate: 91.8%
    errors: [
      { code: "RATE_LIMIT",      detail: "Clay enrichment API 429 — batch of 9 contacts re-queued. Consider upgrading plan or spreading enrichment window." },
      { code: "CONTACT_MISSING", detail: "HeyReach: LinkedIn profile removed or private for 3 contacts. Connection request skipped." },
      { code: "SCHEMA_INVALID",  detail: "Instantly sequence payload missing 'from_email' for 2 contacts. Check domain configuration." },
    ],
  },
  {
    n8nId:       "wf_002_email_enrich",
    name:        "Email Enrichment Pipeline",
    description: "Runs daily at 06:00 UTC. Pulls new leads from ZoomInfo, cross-enriches with People Data Labs for email + mobile, scores by ICP fit, then distributes to Smartlead (mid-market) or Lemlist (enterprise) sequences based on company size and tech stack.",
    active:      true,
    tags:        ["enrichment", "email", "icp", "segmentation"],
    appsUsed:    ["ZoomInfo", "People Data Labs", "Clay", "Smartlead", "Lemlist"],
    nodeCount:   11,
    triggerType: "schedule",
    totalEvents: 189,
    doneEvents:  165,
    failedEvents: 20,
    pendingEvents: 4,
    // successRate: 87.3%
    errors: [
      { code: "SCHEMA_INVALID",  detail: "ZoomInfo returned null email for 8 contacts. PDL fallback also empty — contacts skipped from sequencing." },
      { code: "RATE_LIMIT",      detail: "People Data Labs: 429 Too Many Requests. Batch of 12 enrichments re-queued for next daily run." },
      { code: "CONTACT_MISSING", detail: "Lemlist campaign 'Enterprise-Q2' paused by user. 3 contacts not enrolled. Resume campaign to continue." },
    ],
  },
  {
    n8nId:       "wf_003_deal_billing",
    name:        "Deal Closed → Revenue Activation",
    description: "Triggered on 'Closed Won' stage in HubSpot. Activates subscription in Stripe, creates billing record in Chargebee with correct plan tier based on deal amount, fires Slack notification to #revenue channel, and sends onboarding sequence via Outreach.",
    active:      true,
    tags:        ["billing", "crm", "revenue", "onboarding", "slack"],
    appsUsed:    ["HubSpot", "Stripe", "Chargebee", "Slack", "Outreach"],
    nodeCount:   9,
    triggerType: "webhook",
    totalEvents: 74,
    doneEvents:  52,
    failedEvents: 18,
    pendingEvents: 4,
    // successRate: 70.3%
    errors: [
      { code: "RATE_LIMIT",     detail: "Chargebee API 429: subscription creation rate-limited (5 req/s). 8 events failed after 3 retries — upgrade to Business plan." },
      { code: "AUTH_FAILED",    detail: "Chargebee API key expired. 6 subscription activations failed. Rotate key in Integrations → Chargebee." },
      { code: "INTERNAL_ERROR", detail: "Stripe subscription creation timeout (>30s) for deals ch_demo_009, ch_demo_011. Manual verification required." },
    ],
  },
  {
    n8nId:       "wf_004_inbound_route",
    name:        "Inbound Lead Score & Route",
    description: "Triggered when a form is submitted or a contact enters HubSpot. Enriches with Clearbit, calculates ICP score, books Calendly slot if score ≥ 75, routes to Salesforce opportunity if enterprise, or creates Pipedrive deal for SMB. Sends Slack summary to rep channel.",
    active:      true,
    tags:        ["inbound", "routing", "crm", "scoring", "calendly"],
    appsUsed:    ["HubSpot", "Clearbit", "Calendly", "Salesforce", "Pipedrive", "Slack"],
    nodeCount:   10,
    triggerType: "webhook",
    totalEvents: 133,
    doneEvents:  124,
    failedEvents: 6,
    pendingEvents: 3,
    // successRate: 93.2%
    errors: [
      { code: "SCHEMA_INVALID",  detail: "Clearbit returned partial data (no domain) for 4 contacts. ICP scoring skipped — contact routed to manual review queue." },
      { code: "CONTACT_MISSING", detail: "Salesforce opportunity owner not found for territory 'EMEA-South'. Defaulting to round-robin assignment." },
      { code: "RATE_LIMIT",      detail: "Calendly scheduling API 429 — peak booking hours. 2 meeting requests queued for retry." },
    ],
  },
];

// ── Make.com scenario definitions ─────────────────────────────────────────────
//
// Two Make scenarios covering ABM and payment recovery.
//
//  #5 Account-Based Outreach Pipeline  89.4%
//  #6 Payment Failure Recovery         97.1%

const MAKE_SCENARIOS = [
  {
    makeId:      "sc_005_abm_outreach",
    name:        "Account-Based Outreach Pipeline",
    description: "Pulls target account list from Apollo, enriches firmographics via Lusha, syncs contact and company data to Attio CRM, enrols contacts in Outreach sequences, and logs all activity back to HubSpot.",
    active:      true,
    appsUsed:    ["Apollo", "Lusha", "Attio", "Outreach", "HubSpot"],
    moduleCount: 12,
    triggerType: "schedule",
    totalEvents: 211,
    doneEvents:  189,
    failedEvents: 18,
    pendingEvents: 4,
    // successRate: 89.6%
  },
  {
    makeId:      "sc_006_payment_recovery",
    name:        "Payment Failure Recovery",
    description: "Triggered by Stripe failed payment webhook. Looks up the contact in HubSpot, waits 2 hours, sends personalised recovery email via Lemlist, posts alert to Slack #billing-ops, then flags dunning status in Chargebee for follow-up.",
    active:      true,
    appsUsed:    ["Stripe", "HubSpot", "Lemlist", "Slack", "Chargebee"],
    moduleCount: 8,
    triggerType: "webhook",
    totalEvents: 38,
    doneEvents:  37,
    failedEvents: 1,
    pendingEvents: 0,
    // successRate: 97.4%
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/seed
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dev/seed-status — check whether demo data is loaded
// ─────────────────────────────────────────────────────────────────────────────

router.get("/seed-status", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return res.status(404).json({ error: "No workspace found." });

  const workspaceId = membership.workspace.id;
  const [iqLeads, integrations] = await Promise.all([
    prisma.iqLead.count({ where: { workspaceId } }),
    prisma.integrationConnection.count({ where: { workspaceId } }),
  ]);

  return res.json({ seeded: iqLeads > 0, iqLeads, integrations });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/dev/seed — remove all demo data from the workspace
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/seed", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return res.status(404).json({ error: "No workspace found." });

  const workspaceId = membership.workspace.id;

  // New Workflow Mirror models (cascade deletes WorkflowAppConnection, ObservedEvent)
  await prisma.correlationResult.deleteMany({ where: { workspaceId } });
  await prisma.appEvent.deleteMany({ where: { workspaceId } });
  await prisma.workflowMirror.deleteMany({ where: { workspaceId } });
  // Make.com
  await prisma.makeScenarioMeta.deleteMany({ where: { workspaceId } });
  await prisma.makeConnection.deleteMany({ where: { workspaceId } });
  // n8n + core
  await prisma.touchpoint.deleteMany({ where: { workspaceId } });
  await prisma.outcome.deleteMany({ where: { workspaceId } });
  await prisma.iqLead.deleteMany({ where: { workspaceId } });
  await prisma.integrationConnection.deleteMany({ where: { workspaceId } });
  await prisma.n8nQueuedEvent.deleteMany({ where: { workspaceId } });
  await prisma.n8nWorkflowMeta.deleteMany({ where: { workspaceId } });
  await prisma.webhookError.deleteMany({ where: { workspaceId } });
  await prisma.n8nConnection.deleteMany({ where: { workspaceId } });
  await prisma.workflow.deleteMany({
    where: { workspaceId, name: "__gtm_flow_map__" },
  });
  // Outreach
  await prisma.outreachMetric.deleteMany({ where: { workspaceId } });
  await prisma.outreachLead.deleteMany({ where: { workspaceId } });
  await prisma.webhookDeliveryLog.deleteMany({ where: { workspaceId } });

  return res.json({ removed: true, workspace: membership.workspace.name });
});

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

  // Idempotency — allow ?force=true to wipe and re-seed
  const existing = await prisma.iqLead.count({ where: { workspaceId } });
  if (existing > 0) {
    if (req.query.force !== "true") {
      return res.json({
        skipped: true,
        message: `Already seeded (${existing} IqLeads exist). Delete them first to re-seed.`,
      });
    }
    // Force re-seed: wipe existing demo data
    await prisma.correlationResult.deleteMany({ where: { workspaceId } });
    await prisma.appEvent.deleteMany({ where: { workspaceId } });
    await prisma.workflowMirror.deleteMany({ where: { workspaceId } });
    await prisma.makeScenarioMeta.deleteMany({ where: { workspaceId } });
    await prisma.makeConnection.deleteMany({ where: { workspaceId } });
    await prisma.touchpoint.deleteMany({ where: { workspaceId } });
    await prisma.outcome.deleteMany({ where: { workspaceId } });
    await prisma.iqLead.deleteMany({ where: { workspaceId } });
    await prisma.integrationConnection.deleteMany({ where: { workspaceId } });
    await prisma.n8nQueuedEvent.deleteMany({ where: { workspaceId } });
    await prisma.n8nWorkflowMeta.deleteMany({ where: { workspaceId } });
    await prisma.webhookError.deleteMany({ where: { workspaceId } });
    await prisma.n8nConnection.deleteMany({ where: { workspaceId } });
    await prisma.outreachMetric.deleteMany({ where: { workspaceId } });
    await prisma.outreachLead.deleteMany({ where: { workspaceId } });
    await prisma.webhookDeliveryLog.deleteMany({ where: { workspaceId } });
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
        baseUrl:       "https://n8n.demo.iqpipe.io",
        apiKeyEnc:     encrypt("demo-n8n-api-key"),
        authType:      "apikey",
        status:        "connected",
        workflowCount: N8N_WORKFLOWS.length,
        lastSyncAt:    daysAgo(0, 2),
      },
    });
  }

  // ── 6. N8nWorkflowMeta (4 workflows) ─────────────────────────────────────

  const n8nMetaIds: Record<string, string> = {}; // n8nId → DB id

  for (const wf of N8N_WORKFLOWS) {
    let row = await prisma.n8nWorkflowMeta.findUnique({
      where: { workspaceId_n8nId: { workspaceId, n8nId: wf.n8nId } },
    });
    if (!row) {
      row = await prisma.n8nWorkflowMeta.create({
        data: {
          workspaceId,
          n8nId:         wf.n8nId,
          name:          wf.name,
          active:        wf.active,
          tags:          JSON.stringify(wf.tags),
          appsUsed:      JSON.stringify(wf.appsUsed),
          nodeTypes:     JSON.stringify(wf.appsUsed.map(a => `n8n-nodes-base.${a.toLowerCase().replace(/\s/g,"")}Action`)),
          nodeCount:     wf.nodeCount,
          triggerType:   wf.triggerType,
          description:   wf.description,
          lastUpdatedAt: daysAgo(1),
          syncedAt:      new Date(),
          execSyncEnabled: true,
        },
      });
    }
    n8nMetaIds[wf.n8nId] = row.id;
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

  // ── 9. Make.com Connection + 2 Scenarios ─────────────────────────────────

  const existingMake = await prisma.makeConnection.findUnique({ where: { workspaceId } });
  if (!existingMake) {
    await prisma.makeConnection.create({
      data: {
        workspaceId,
        apiKeyEnc:     encrypt("demo-make-api-key"),
        region:        "eu1",
        teamId:        "team_demo_001",
        organizationId:"org_demo_001",
        status:        "connected",
        scenarioCount: MAKE_SCENARIOS.length,
        lastSyncAt:    daysAgo(0, 3),
      },
    });
  }

  const makeMetaIds: Record<string, string> = {}; // makeId → DB id

  for (const sc of MAKE_SCENARIOS) {
    let row = await prisma.makeScenarioMeta.findUnique({
      where: { workspaceId_makeId: { workspaceId, makeId: sc.makeId } },
    });
    if (!row) {
      row = await prisma.makeScenarioMeta.create({
        data: {
          workspaceId,
          makeId:          sc.makeId,
          name:            sc.name,
          active:          sc.active,
          appsUsed:        JSON.stringify(sc.appsUsed),
          moduleCount:     sc.moduleCount,
          triggerType:     sc.triggerType,
          lastUpdatedAt:   daysAgo(2),
          syncedAt:        new Date(),
          execSyncEnabled: true,
        },
      });
    }
    makeMetaIds[sc.makeId] = row.id;
  }

  // ── 10. N8nQueuedEvents for Make scenarios (reuse event batch loop) ───────
  //
  // Make scenarios don't have N8nQueuedEvents (they use a different ingestion
  // path), but we seed AppEvents for them directly in step 11.

  // ── 11. Workflow Mirrors + App Connections + Observed Events ──────────────
  //
  // Mirror config for all 6 automations showing different states:
  //   WF1  Full-Funnel Cold Outbound  — fully mirrored (Apollo + HubSpot + Stripe)
  //   WF2  Email Enrichment Pipeline  — partially mirrored (Smartlead connected, no key)
  //   WF3  Deal Closed → Revenue      — fully mirrored (HubSpot + Stripe + Chargebee)
  //   WF4  Inbound Lead Score         — partially mirrored (HubSpot + Salesforce, key set)
  //   SC5  ABM Outreach               — fully mirrored (Attio + HubSpot)
  //   SC6  Payment Recovery           — fully mirrored (Stripe + Lemlist)

  // Helper: map app friendly-name to catalog key
  const APP_NAME_TO_KEY: Record<string, string> = {
    "HubSpot": "hubspot", "Pipedrive": "pipedrive", "Salesforce": "salesforce",
    "Attio": "attio", "Apollo": "apollo", "Clay": "clay",
    "ZoomInfo": "zoominfo", "People Data Labs": "pdl",
    "Stripe": "stripe", "Chargebee": "chargebee",
    "Instantly": "instantly", "Smartlead": "smartlead", "Lemlist": "lemlist",
    "HeyReach": "heyreach", "Outreach": "outreach", "Lusha": "lusha",
    "Clearbit": "clearbit", "Calendly": "calendly", "Slack": "slack",
  };

  // WF1 — Full-Funnel Cold Outbound — 3 apps mirrored, email key
  const wf1Id = n8nMetaIds["wf_001_cold_outbound"];
  if (wf1Id) {
    const mirror1 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: wf1Id } },
      create: { workspaceId, workflowId: wf1Id, platform: "n8n", correlationKey: "email", unknownMappings: "{}" },
      update: {},
    });
    const m1Apps: Array<{ appKey: string; events: Array<{ key: string; label: string }> }> = [
      { appKey: "apollo",  events: [{ key: "contact_created", label: "Contact added" }] },
      { appKey: "hubspot", events: [{ key: "deal.creation", label: "Deal created" }, { key: "deal.propertyChange", label: "Deal moved stage" }] },
      { appKey: "stripe",  events: [{ key: "customer.subscription.created", label: "Subscription created" }, { key: "invoice.paid", label: "Invoice paid" }] },
    ];
    for (const a of m1Apps) {
      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror1.id, appKey: a.appKey } },
        create: { workspaceId, mirrorId: mirror1.id, appKey: a.appKey, connectionType: a.appKey === "apollo" ? "polling" : "webhook", status: "connected", lastEventAt: hoursAgo(Math.random() * 6 + 1) },
        update: {},
      });
      for (const ev of a.events) {
        await prisma.observedEvent.upsert({
          where:  { connectionId_eventKey: { connectionId: conn.id, eventKey: ev.key } },
          create: { connectionId: conn.id, appKey: a.appKey, eventKey: ev.key, label: ev.label },
          update: {},
        });
      }
    }

    // Sample AppEvents + CorrelationResults for WF1
    const sampleContacts = [
      { email: "sarah.e787a3@demo.iq", value: "sarah.e787a3@demo.iq" },
      { email: "james.f5aef5@demo.iq",    value: "james.f5aef5@demo.iq"    },
      { email: "priya.3faf3c@demo.iq",          value: "priya.3faf3c@demo.iq"          },
    ];
    for (let ci = 0; ci < sampleContacts.length; ci++) {
      const ct = sampleContacts[ci];
      const appEvt = await prisma.appEvent.create({
        data: {
          workspaceId,
          appKey:           "hubspot",
          mirrorId:         mirror1.id,
          eventKey:         "deal.creation",
          correlationValue: ct.email,
          payload:          JSON.stringify({ email: ct.email, properties: { dealname: `Demo deal ${ci + 1}`, amount: (ci + 1) * 4200 } }),
          receivedAt:       hoursAgo(ci * 4 + 1),
          correlatedAt:     hoursAgo(ci * 4),
        },
      });
      // Find matching n8n queued event (best-effort — use any done event from wf_001)
      const n8nEvt = await prisma.n8nQueuedEvent.findFirst({
        where: { workspaceId, workflowId: "wf_001_cold_outbound", status: "done" },
        select: { id: true },
      });
      await prisma.correlationResult.create({
        data: {
          workspaceId,
          mirrorId:         mirror1.id,
          n8nEventId:       n8nEvt?.id ?? null,
          appEventId:       appEvt.id,
          appKey:           "hubspot",
          correlationKey:   "email",
          correlationValue: ct.email,
          verified:         ci < 2,
          discrepancy:      ci === 2 ? JSON.stringify({ n8nStatus: "done", appStatus: "pending" }) : null,
          matchedAt:        hoursAgo(ci * 4),
        },
      });
    }
  }

  // WF2 — Email Enrichment — 1 app connected, no correlation key
  const wf2Id = n8nMetaIds["wf_002_email_enrich"];
  if (wf2Id) {
    const mirror2 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: wf2Id } },
      create: { workspaceId, workflowId: wf2Id, platform: "n8n", correlationKey: null, unknownMappings: "{}" },
      update: {},
    });
    await prisma.workflowAppConnection.upsert({
      where:  { mirrorId_appKey: { mirrorId: mirror2.id, appKey: "smartlead" } },
      create: { workspaceId, mirrorId: mirror2.id, appKey: "smartlead", connectionType: "webhook", status: "connected", lastEventAt: hoursAgo(3) },
      update: {},
    });
  }

  // WF3 — Deal Closed → Revenue — 3 apps mirrored, email key
  const wf3Id = n8nMetaIds["wf_003_deal_billing"];
  if (wf3Id) {
    const mirror3 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: wf3Id } },
      create: { workspaceId, workflowId: wf3Id, platform: "n8n", correlationKey: "email", unknownMappings: "{}" },
      update: {},
    });
    const m3Apps: Array<{ appKey: string; type: string; events: Array<{ key: string; label: string }> }> = [
      { appKey: "hubspot",   type: "webhook", events: [{ key: "deal.propertyChange", label: "Deal moved stage" }, { key: "deal.creation", label: "Deal created" }] },
      { appKey: "stripe",    type: "webhook", events: [{ key: "customer.subscription.created", label: "Subscription created" }, { key: "invoice.paid", label: "Invoice paid" }] },
      { appKey: "chargebee", type: "webhook", events: [{ key: "customer.subscription.created", label: "Subscription created" }] },
    ];
    for (const a of m3Apps) {
      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror3.id, appKey: a.appKey } },
        create: { workspaceId, mirrorId: mirror3.id, appKey: a.appKey, connectionType: a.type, status: "connected", lastEventAt: hoursAgo(Math.random() * 24 + 2) },
        update: {},
      });
      for (const ev of a.events) {
        await prisma.observedEvent.upsert({
          where:  { connectionId_eventKey: { connectionId: conn.id, eventKey: ev.key } },
          create: { connectionId: conn.id, appKey: a.appKey, eventKey: ev.key, label: ev.label },
          update: {},
        });
      }
    }

    // Sample AppEvents showing a mismatch for the worst-performer
    const appEvt3 = await prisma.appEvent.create({
      data: {
        workspaceId, appKey: "stripe", mirrorId: mirror3.id,
        eventKey: "invoice.paid",
        correlationValue: "tom.717076@demo.iq",
        payload: JSON.stringify({ email: "tom.717076@demo.iq", type: "invoice.paid", amount: 12400 }),
        receivedAt: hoursAgo(8), correlatedAt: hoursAgo(7),
      },
    });
    const n8nEvt3 = await prisma.n8nQueuedEvent.findFirst({
      where: { workspaceId, workflowId: "wf_003_deal_billing", status: "failed" },
      select: { id: true },
    });
    await prisma.correlationResult.create({
      data: {
        workspaceId, mirrorId: mirror3.id,
        n8nEventId: n8nEvt3?.id ?? null, appEventId: appEvt3.id,
        appKey: "stripe", correlationKey: "email", correlationValue: "tom.717076@demo.iq",
        verified: false, discrepancy: JSON.stringify({ n8nStatus: "failed", reason: "Chargebee rate limit" }),
        matchedAt: hoursAgo(7),
      },
    });
  }

  // WF4 — Inbound Lead Score — 2 apps, email key set, partially connected
  const wf4Id = n8nMetaIds["wf_004_inbound_route"];
  if (wf4Id) {
    const mirror4 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: wf4Id } },
      create: { workspaceId, workflowId: wf4Id, platform: "n8n", correlationKey: "email", unknownMappings: "{}" },
      update: {},
    });
    const m4Apps = [
      { appKey: "hubspot",    type: "webhook", events: [{ key: "contact.creation", label: "Contact created" }, { key: "deal.creation", label: "Deal created" }] },
      { appKey: "salesforce", type: "webhook", events: [{ key: "opportunity.created", label: "Opportunity created" }] },
    ];
    for (const a of m4Apps) {
      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror4.id, appKey: a.appKey } },
        create: { workspaceId, mirrorId: mirror4.id, appKey: a.appKey, connectionType: a.type, status: "connected", lastEventAt: hoursAgo(Math.random() * 12 + 1) },
        update: {},
      });
      for (const ev of a.events) {
        await prisma.observedEvent.upsert({
          where:  { connectionId_eventKey: { connectionId: conn.id, eventKey: ev.key } },
          create: { connectionId: conn.id, appKey: a.appKey, eventKey: ev.key, label: ev.label },
          update: {},
        });
      }
    }
  }

  // SC5 — ABM Outreach (Make) — Attio + HubSpot connected, email key
  const sc5Id = makeMetaIds["sc_005_abm_outreach"];
  if (sc5Id) {
    const mirror5 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: sc5Id } },
      create: { workspaceId, workflowId: sc5Id, platform: "make", correlationKey: "email", unknownMappings: "{}" },
      update: {},
    });
    const m5Apps = [
      { appKey: "attio",   events: [{ key: "record.created", label: "Record created" }, { key: "record.updated", label: "Record updated" }] },
      { appKey: "hubspot", events: [{ key: "contact.creation", label: "Contact created" }, { key: "deal.creation", label: "Deal created" }] },
    ];
    for (const a of m5Apps) {
      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror5.id, appKey: a.appKey } },
        create: { workspaceId, mirrorId: mirror5.id, appKey: a.appKey, connectionType: "webhook", status: "connected", lastEventAt: hoursAgo(Math.random() * 10 + 1) },
        update: {},
      });
      for (const ev of a.events) {
        await prisma.observedEvent.upsert({
          where:  { connectionId_eventKey: { connectionId: conn.id, eventKey: ev.key } },
          create: { connectionId: conn.id, appKey: a.appKey, eventKey: ev.key, label: ev.label },
          update: {},
        });
      }
    }
    // Verified correlation — ABM is clean
    const appEvt5 = await prisma.appEvent.create({
      data: {
        workspaceId, appKey: "attio", mirrorId: mirror5.id,
        eventKey: "record.created", correlationValue: "carter.405fd3@demo.iq",
        payload: JSON.stringify({ email: "carter.405fd3@demo.iq", eventType: "record.created" }),
        receivedAt: hoursAgo(5), correlatedAt: hoursAgo(4),
      },
    });
    await prisma.correlationResult.create({
      data: {
        workspaceId, mirrorId: mirror5.id, appEventId: appEvt5.id,
        appKey: "attio", correlationKey: "email", correlationValue: "carter.405fd3@demo.iq",
        verified: true, matchedAt: hoursAgo(4),
      },
    });
  }

  // SC6 — Payment Recovery (Make) — Stripe + Lemlist connected, email key
  const sc6Id = makeMetaIds["sc_006_payment_recovery"];
  if (sc6Id) {
    const mirror6 = await prisma.workflowMirror.upsert({
      where:  { workspaceId_workflowId: { workspaceId, workflowId: sc6Id } },
      create: { workspaceId, workflowId: sc6Id, platform: "make", correlationKey: "email", unknownMappings: "{}" },
      update: {},
    });
    const m6Apps = [
      { appKey: "stripe", events: [{ key: "charge.failed", label: "Charge failed" }, { key: "customer.subscription.deleted", label: "Subscription cancelled" }] },
      { appKey: "lemlist", events: [{ key: "emailSent", label: "Email sent" }, { key: "replyReceived", label: "Reply received" }] },
    ];
    for (const a of m6Apps) {
      const conn = await prisma.workflowAppConnection.upsert({
        where:  { mirrorId_appKey: { mirrorId: mirror6.id, appKey: a.appKey } },
        create: { workspaceId, mirrorId: mirror6.id, appKey: a.appKey, connectionType: "webhook", status: "connected", lastEventAt: hoursAgo(Math.random() * 48 + 2) },
        update: {},
      });
      for (const ev of a.events) {
        await prisma.observedEvent.upsert({
          where:  { connectionId_eventKey: { connectionId: conn.id, eventKey: ev.key } },
          create: { connectionId: conn.id, appKey: a.appKey, eventKey: ev.key, label: ev.label },
          update: {},
        });
      }
    }
    // Two verified correlations — payment recovery flow works well
    const recoveryEmails = ["jackson.b2f098@demo.iq", "emily.92c38b@demo.iq"];
    for (let ri = 0; ri < recoveryEmails.length; ri++) {
      const appEvt6 = await prisma.appEvent.create({
        data: {
          workspaceId, appKey: "stripe", mirrorId: mirror6.id,
          eventKey: "charge.failed", correlationValue: recoveryEmails[ri],
          payload: JSON.stringify({ email: recoveryEmails[ri], type: "charge.failed", amount: 2400 }),
          receivedAt: hoursAgo(ri * 12 + 6), correlatedAt: hoursAgo(ri * 12 + 5),
        },
      });
      await prisma.correlationResult.create({
        data: {
          workspaceId, mirrorId: mirror6.id, appEventId: appEvt6.id,
          appKey: "stripe", correlationKey: "email", correlationValue: recoveryEmails[ri],
          verified: true, matchedAt: hoursAgo(ri * 12 + 5),
        },
      });
    }
  }

  // ── 12. My Workflow — GTM stack map ────────────────────────────────────────
  //
  // Stored as a single Workflow row with name "__gtm_flow_map__".
  // triggerConfig holds { version: 2, stacks: WorkflowStack[] }.
  //
  // Three real-world stacks demonstrating different GTM motions:
  //   A. Cold Outbound — LinkedIn + Email  (apollo → clay → heyreach → instantly → hubspot)
  //   B. Inbound Lead Nurture              (hubspot → clay → smartlead → pipedrive)
  //   C. Revenue Capture — CRM to Billing  (hubspot → stripe → chargebee)

  const MAP_NAME = "__gtm_flow_map__";
  const existingMap = await prisma.workflow.findFirst({ where: { workspaceId, name: MAP_NAME } });
  if (!existingMap) {
    const demoStacks = [
      {
        id:        "stack_cold_outbound",
        name:      "Cold Outbound — LinkedIn + Email",
        createdAt: daysAgo(14).toISOString(),
        steps: [
          { id: "co_s1", tool: "apollo",    eventType: "lead_imported",        label: "Source leads from Apollo",    condition: "always",                  note: "Filter: company 50–500, SaaS, US/EU" },
          { id: "co_s2", tool: "clay",      eventType: "lead_enriched",        label: "Enrich with Clay",             condition: "if enrichment successful", note: "Waterfall: Clearbit → PDL → manual" },
          { id: "co_s3", tool: "heyreach",  eventType: "connection_sent",      label: "LinkedIn connection request",  condition: "if ICP match",             note: "Persona A template, 40 req/day cap" },
          { id: "co_s4", tool: "instantly", eventType: "sequence_started",     label: "Cold email sequence",          condition: "if connection accepted",   note: "5-step sequence, 48h between steps" },
          { id: "co_s5", tool: "hubspot",   eventType: "deal_created",         label: "Create deal in HubSpot",       condition: "if reply received",        note: "Stage: Qualified Lead, auto-assign to AE" },
        ],
      },
      {
        id:        "stack_inbound_nurture",
        name:      "Inbound Lead Nurture",
        createdAt: daysAgo(7).toISOString(),
        steps: [
          { id: "in_s1", tool: "hubspot",   eventType: "deal_created",         label: "Inbound lead enters CRM",      condition: "always",                  note: "Triggered by form fill or demo request" },
          { id: "in_s2", tool: "clay",      eventType: "lead_enriched",        label: "Enrich + ICP score",           condition: "always",                  note: "Score = firmographics + tech stack fit" },
          { id: "in_s3", tool: "smartlead", eventType: "sequence_started",     label: "Nurture email sequence",       condition: "if ICP match",             note: "ICP threshold: score ≥ 70" },
          { id: "in_s4", tool: "pipedrive", eventType: "deal_created",         label: "Sync deal to Pipedrive",       condition: "if meeting booked",        note: "Stage: Demo Scheduled" },
        ],
      },
      {
        id:        "stack_revenue_capture",
        name:      "Revenue Capture — CRM to Billing",
        createdAt: daysAgo(3).toISOString(),
        steps: [
          { id: "rc_s1", tool: "hubspot",   eventType: "deal_won",             label: "Deal closes in HubSpot",       condition: "always",                  note: "Triggered by stage = Closed Won" },
          { id: "rc_s2", tool: "stripe",    eventType: "deal_won",             label: "Activate Stripe subscription", condition: "always",                  note: "Plan tier set by deal amount" },
          { id: "rc_s3", tool: "chargebee", eventType: "subscription_created", label: "Create Chargebee record",      condition: "always",                  note: "Sets up invoicing + dunning rules" },
        ],
      },
    ];

    await prisma.workflow.create({
      data: {
        workspaceId,
        name:          MAP_NAME,
        description:   "GTM workflow map — defined by user for iqpipe context",
        status:        "active",
        triggerType:   "map",
        triggerConfig: JSON.stringify({ version: 2, stacks: demoStacks }),
      },
    });
  }

  // ── 13. Outreach Intelligence & Improvement Report seed data ─────────────
  //
  // Seeds: OutreachLead × 26 unique contacts, OutreachMetric funnel events across
  // 4 sequences, and WebhookDeliveryLog entries for the 30-day reliability panel.

  const APOLLO_IDX    = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
  const HEYREACH_IDX  = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
  const LEMLIST_IDX   = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
  const INSTANTLY_IDX = [14,15,16,17,18,19,20,21,22,23,24,25];
  // Leads 17-24 entered a sequence but went silent — they will appear in Stuck Leads
  const STUCK_IDX     = new Set([17,18,19,20,21,22,23,24]);

  const allOrIdx  = [...new Set([...APOLLO_IDX, ...HEYREACH_IDX, ...LEMLIST_IDX, ...INSTANTLY_IDX])];
  const orlMap: Record<number, string> = {};

  for (const idx of allOrIdx) {
    const c        = CONTACTS[idx];
    const emailHash = hmac(c.email.toLowerCase().trim());
    const emailEnc  = encrypt(c.email);
    const isStuck   = STUCK_IDX.has(idx);
    const firstTool = APOLLO_IDX.includes(idx) ? "apollo" :
                      HEYREACH_IDX.includes(idx) ? "heyreach" :
                      LEMLIST_IDX.includes(idx) ? "lemlist" : "instantly";

    const lead = await prisma.outreachLead.upsert({
      where:  { workspaceId_emailHash: { workspaceId, emailHash } },
      create: {
        id:              `orl_${crypto.randomBytes(6).toString("hex")}`,
        workspaceId,
        emailHash,
        emailEnc,
        displayName:     `${c.first} ${c.last}`,
        company:         c.company ?? null,
        title:           c.title   ?? null,
        firstTool,
        firstSequenceAt: isStuck ? daysAgo(16, idx % 5) : daysAgo(22, idx % 7),
        lastEventAt:     isStuck ? daysAgo(10 + (idx % 4)) : daysAgo(1 + (idx % 3)),
      },
      update: {},
    });
    orlMap[idx] = lead.id;
  }

  const upsertOM = async (
    leadId: string, tool: string, seqId: string,
    eventType: string, count: number, firstAt: Date, lastAt: Date,
  ) => {
    await prisma.outreachMetric.upsert({
      where: {
        workspaceId_leadId_tool_sequenceId_stepId_eventType: {
          workspaceId, leadId, tool, sequenceId: seqId, stepId: "", eventType,
        },
      },
      create: { workspaceId, leadId, tool, sequenceId: seqId, stepId: "", eventType, count, firstAt, lastAt },
      update: {},
    });
  };

  // Apollo cold outbound — 22 leads
  // Funnel: 22 sent → 16 opened → 7 replied → 3 meetings  (reply rate 31.8%)
  for (let i = 0; i < APOLLO_IDX.length; i++) {
    const leadId = orlMap[APOLLO_IDX[i]];
    const base   = daysAgo(22, APOLLO_IDX[i] % 5);
    await upsertOM(leadId, "apollo", "seq_apollo_cold_q1", "sequence_started", 1, base, base);
    await upsertOM(leadId, "apollo", "seq_apollo_cold_q1", "email_sent",       1, base, daysAgo(20, i % 3));
    if (i < 16) await upsertOM(leadId, "apollo", "seq_apollo_cold_q1", "email_opened",   1, daysAgo(19), daysAgo(18));
    if (i <  7) await upsertOM(leadId, "apollo", "seq_apollo_cold_q1", "reply_received", 1, daysAgo(16), daysAgo(16));
    if (i <  3) await upsertOM(leadId, "apollo", "seq_apollo_cold_q1", "meeting_booked", 1, daysAgo(14), daysAgo(14));
  }

  // HeyReach LinkedIn — 18 leads
  // Funnel: 18 connection requests → 11 accepted → 6 replied → 2 meetings  (reply 33.3%)
  for (let i = 0; i < HEYREACH_IDX.length; i++) {
    const leadId = orlMap[HEYREACH_IDX[i]];
    const base   = daysAgo(25, HEYREACH_IDX[i] % 4);
    await upsertOM(leadId, "heyreach", "seq_heyreach_li_icp", "connection_request_sent", 1, base, base);
    if (i < 11) await upsertOM(leadId, "heyreach", "seq_heyreach_li_icp", "connection_accepted", 1, daysAgo(22), daysAgo(22));
    if (i <  6) await upsertOM(leadId, "heyreach", "seq_heyreach_li_icp", "reply_received",      1, daysAgo(20), daysAgo(20));
    if (i <  2) await upsertOM(leadId, "heyreach", "seq_heyreach_li_icp", "meeting_booked",      1, daysAgo(18), daysAgo(18));
  }

  // Lemlist inbound nurture — 15 leads
  // Funnel: 15 sent → 9 opened → 3 replied → 1 meeting  (reply 20%)
  for (let i = 0; i < LEMLIST_IDX.length; i++) {
    const leadId = orlMap[LEMLIST_IDX[i]];
    const base   = daysAgo(19, LEMLIST_IDX[i] % 6);
    await upsertOM(leadId, "lemlist", "seq_lemlist_nurture", "sequence_started", 1, base, base);
    await upsertOM(leadId, "lemlist", "seq_lemlist_nurture", "email_sent",       1, base, daysAgo(18));
    if (i < 9) await upsertOM(leadId, "lemlist", "seq_lemlist_nurture", "email_opened",   1, daysAgo(17), daysAgo(17));
    if (i < 3) await upsertOM(leadId, "lemlist", "seq_lemlist_nurture", "reply_received", 1, daysAgo(15), daysAgo(15));
    if (i < 1) await upsertOM(leadId, "lemlist", "seq_lemlist_nurture", "meeting_booked", 1, daysAgo(13), daysAgo(13));
  }

  // Instantly warm re-engagement — 12 leads
  // Funnel: 12 sent → 7 opened → 1 replied → 1 meeting  (reply 8.3%)
  for (let i = 0; i < INSTANTLY_IDX.length; i++) {
    const leadId = orlMap[INSTANTLY_IDX[i]];
    const base   = daysAgo(15, INSTANTLY_IDX[i] % 3);
    await upsertOM(leadId, "instantly", "seq_instantly_warmup", "sequence_started", 1, base, base);
    await upsertOM(leadId, "instantly", "seq_instantly_warmup", "email_sent",       1, base, daysAgo(14));
    if (i < 7) await upsertOM(leadId, "instantly", "seq_instantly_warmup", "email_opened",   1, daysAgo(13), daysAgo(13));
    if (i < 1) await upsertOM(leadId, "instantly", "seq_instantly_warmup", "reply_received", 1, daysAgo(11), daysAgo(11));
    if (i < 1) await upsertOM(leadId, "instantly", "seq_instantly_warmup", "meeting_booked", 1, daysAgo(10), daysAgo(10));
  }

  // WebhookDeliveryLog — 30 days of realistic data per tool
  const WH_TOOLS = [
    { tool: "apollo",    processed: 72, noId: 4, error: 4 },
    { tool: "heyreach",  processed: 57, noId: 5, error: 3 },
    { tool: "lemlist",   processed: 41, noId: 2, error: 2 },
    { tool: "instantly", processed: 34, noId: 2, error: 2 },
    { tool: "clay",      processed: 112, noId: 5, error: 3 },
  ];

  for (const wt of WH_TOOLS) {
    const statuses = [
      ...Array<string>(wt.processed).fill("processed"),
      ...Array<string>(wt.noId).fill("dropped_no_identity"),
      ...Array<string>(wt.error).fill("error"),
    ];
    const total = statuses.length;
    await prisma.webhookDeliveryLog.createMany({
      data: statuses.map((status, i) => ({
        workspaceId,
        tool:        wt.tool,
        rawEventKey: status === "processed" ? "contact.enriched" : "contact.created",
        eventType:   status === "processed" ? "contact_enriched" : "unknown",
        status,
        errorMsg:    status === "error" ? "Timeout after 30000ms" : null,
        receivedAt:  new Date(Date.now() - (i / total) * 30 * 86_400_000),
      })),
      skipDuplicates: true,
    });
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  const successRates = N8N_WORKFLOWS.map((wf) => ({
    name:        wf.name,
    successRate: Math.round((wf.doneEvents / wf.totalEvents) * 1000) / 10,
    total:       wf.totalEvents,
  }));

  const best = successRates.reduce((a, b) => a.successRate > b.successRate ? a : b);

  const makeRates = MAKE_SCENARIOS.map(sc => ({
    name:        sc.name,
    successRate: Math.round((sc.doneEvents / sc.totalEvents) * 1000) / 10,
    total:       sc.totalEvents,
    platform:    "make",
  }));

  // Mark workspace as demo so the frontend can lock down mutations
  await prisma.workspace.update({
    where: { id: workspaceId },
    data:  { isDemo: true },
  });

  // Populate LeadActivitySummary immediately so MCP tools (get_next_actions,
  // get_funnel, etc.) return data right after seeding without waiting for the
  // 6-hour background worker to run.
  await backfillWorkspace(workspaceId, true);
  // Fire-and-forget: churn probabilities + ICP scores (no ICP profile yet, so
  // these will be null, but the rows are created for subsequent scoring)
  backfillChurnProbabilities(workspaceId).catch(console.error);
  scoreWorkspaceLeads(workspaceId).catch(console.error);

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
      n8nWorkflows:  successRates,
      makeScenarios: makeRates,
      bestPerformer: `${best.name} — ${best.successRate}% success rate`,
      queuedEvents:  queuedBatch.length,
      mirrorsSeeded: 6,
    },
    message: "Refresh any page to see the demo data.",
  });
});

export default router;
