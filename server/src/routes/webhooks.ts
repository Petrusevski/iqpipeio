/**
 * webhooks.ts  —  USER DATA SOURCES (NOT IQPIPE BILLING)
 *
 * Inbound webhook endpoints for user-connected GTM tools.
 * Endpoint pattern: POST /api/webhooks/:provider?workspaceId=xxx
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  THE STRIPE HANDLER IN THIS FILE IS THE "USER STRIPE DATA SOURCE".          ║
 * ║  It ingests revenue events from users' OWN Stripe accounts into IQPipe's   ║
 * ║  Live Feed / pipeline attribution.                                          ║
 * ║                                                                             ║
 * ║  It is completely separate from IQPipe Billing (Stripe Checkout):           ║
 * ║    - Uses the user's Stripe key from IntegrationConnection (encrypted DB)   ║
 * ║    - Uses the user's Stripe webhook secret (stored in encrypted DB)         ║
 * ║    - Endpoint: /api/webhooks/stripe?workspaceId=xxx  (workspaceId required) ║
 * ║                                                                             ║
 * ║  IQPipe Billing lives at:                                                   ║
 * ║    server/src/routes/checkout.ts   (POST /api/checkout/webhook)             ║
 * ║    server/src/services/stripeClient.ts  (billingStripe singleton)           ║
 * ║                                                                             ║
 * ║  NEVER import billingStripe or read STRIPE_SECRET_KEY here.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Each handler:
 *  1. Identifies the workspace via workspaceId query param
 *  2. Validates the payload (and signature if configured)
 *  3. Upserts Contact + Lead + Activity so the event appears
 *     immediately in the Live Event Feed / Signal Center
 *
 * LinkedIn outreach:   heyreach, expandi, dripify, waalaxy, meetalfred
 * Cold email:         lemlist, instantly, smartlead, mailshake
 * Phone / calling:    aircall, dialpad, kixie, orum
 * SMS / WhatsApp:     twilio, sakari, wati
 * Multichannel:       outreach, salesloft, replyio, klenty
 * Revenue (user):     stripe  (user's own Stripe account — NOT iqpipe billing)
 */

import { Router, Request, Response } from "express";
import Stripe from "stripe";
import axios from "axios";
import { createHash } from "crypto";
import { prisma } from "../db";
import { decrypt } from "../utils/encryption";
import { resolveIqLead, recordTouchpoint } from "../utils/identity";
import { assertNotBillingKey } from "../utils/stripeKeyGuard";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

type AuthData = { apiKey?: string; accessToken?: string; webhookSecret?: string; [k: string]: any };

function parseAuth(raw?: string | null): AuthData | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)); } catch { return null; }
}

// ─── Shared: upsert contact → lead → deduplicated activity ───────────────────

async function recordEvent(
  workspaceId: string,
  eventType: string,
  contact: {
    firstName: string;
    lastName: string;
    email?: string | null;
    linkedin?: string | null;
    phone?: string | null;
    company?: string | null;
    title?: string | null;
  },
  source: string,
  externalId: string,
  meta: Record<string, any> = {},
  opts: { experimentId?: string | null; stackVariant?: string | null; sourceType?: string } = {},
): Promise<boolean> {
  const { firstName, lastName, email, linkedin, phone, company, title } = contact;

  // ── 1. Privacy-first identity resolution ─────────────────────────────────
  const iqLeadId = await resolveIqLead(
    workspaceId,
    { email, linkedin, phone },
    { firstName, lastName, company, title },
  );

  // ── 2. Record touchpoint (triggers attribution if outcome event) ──────────
  await recordTouchpoint(
    workspaceId,
    iqLeadId,
    source,
    eventType,
    { ...meta, externalId },
    opts.experimentId,
    opts.stackVariant,
    opts.sourceType,
  );

  // ── 3. Backward-compat: maintain Contact + Lead + Activity for existing UI ─
  const contactId = `${source.toLowerCase()}-${externalId}`;

  await prisma.contact.upsert({
    where: { id: contactId },
    update: { firstName, lastName },
    create: {
      id: contactId, workspaceId, firstName, lastName,
      email: null,       // PII not stored in plain text
      linkedinUrl: null, // PII not stored in plain text
      status: "active",
    },
  });

  let dbLead = await prisma.lead.findFirst({ where: { contactId } });
  if (!dbLead) {
    dbLead = await prisma.lead.create({
      data: {
        workspaceId, contactId,
        email: "",  // intentionally empty — PII lives in IqLead only
        fullName: `${firstName} ${lastName}`.trim(),
        firstName, lastName,
        company: company || null, title: title || null,
        source, status: "new",
      },
    });
  }

  // Dedup Activity by lead + eventType per day
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.activity.findFirst({
    where: {
      workspaceId, leadId: dbLead.id, type: eventType,
      createdAt: { gte: dayStart },
    },
  });
  if (existing) return false;

  await prisma.activity.create({
    data: {
      workspaceId, type: eventType,
      subject: `${firstName} ${lastName}`.trim() || "Unknown",
      body: JSON.stringify({ ...meta, source, iqLeadId }),
      status: "completed", leadId: dbLead.id,
    },
  });

  return true;
}

// ─── HeyReach ────────────────────────────────────────────────────────────────
// Configure in HeyReach → Settings → Integrations → Webhooks (12 event types, one per entry)
//
// All 12 event types (display name → internal key HeyReach sends in payload.event):
//   Connection Request Sent       → CONNECTION_REQUEST_SENT
//   Connection Request Accepted   → CONNECTION_REQUEST_ACCEPTED
//   Message Sent                  → MESSAGE_SENT
//   First Message Reply Received  → FIRST_MESSAGE_REPLY_RECEIVED
//   First Inmail Reply Received   → FIRST_INMAIL_REPLY_RECEIVED
//   Every Message/InMail Reply    → MESSAGE_REPLY_RECEIVED  (or REPLY_RECEIVED)
//   Inmail Sent                   → INMAIL_SENT
//   Follow Sent                   → FOLLOW_SENT
//   Liked Post                    → LIKED_POST
//   Viewed Profile                → VIEWED_PROFILE
//   Campaign Completed            → CAMPAIGN_COMPLETED
//   Lead Tag Updated              → LEAD_TAG_UPDATED

router.post("/heyreach", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const lead    = payload?.data?.lead ?? payload?.lead ?? payload;
    // Normalise: HeyReach may send camelCase or UPPER_SNAKE event names
    const raw     = (payload?.event || payload?.eventType || lead?.status || "").toUpperCase().replace(/\s+/g, "_");

    // ── Event → iqpipe activity type mapping (exact values from HeyReach API docs) ──
    let eventType: string | null = null;

    if      (raw === "CONNECTION_REQUEST_SENT")      eventType = "connection_request_sent";
    else if (raw === "CONNECTION_REQUEST_ACCEPTED")  eventType = "connection_accepted";
    else if (raw === "MESSAGE_SENT")                 eventType = "message_sent";
    else if (raw === "MESSAGE_REPLY_RECEIVED")       eventType = "reply_received";
    else if (raw === "INMAIL_SENT")                  eventType = "inmail_sent";
    else if (raw === "INMAIL_REPLY_RECEIVED")        eventType = "reply_received";
    else if (raw === "EVERY_MESSAGE_REPLY_RECEIVED") eventType = "reply_received";
    else if (raw === "FOLLOW_SENT")                  eventType = "follow_sent";
    else if (raw === "LIKED_POST")                   eventType = "liked_post";
    else if (raw === "VIEWED_PROFILE")               eventType = "profile_viewed";
    else if (raw === "CAMPAIGN_COMPLETED")           eventType = "campaign_completed";
    else if (raw === "LEAD_TAG_UPDATED")             eventType = "lead_tag_updated";

    if (eventType && lead?.id) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.firstName || lead.first_name || "Unknown",
          lastName:  lead.lastName  || lead.last_name  || "",
          email:     lead.email     || null,
          linkedin:  lead.linkedInUrl || null,
          company:   lead.company   || null,
          title:     lead.position  || null,
        },
        "HeyReach", String(lead.id),
        { campaign: lead.campaignName || payload?.data?.campaignName, heyreachEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/heyreach]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Lemlist ─────────────────────────────────────────────────────────────────
// Configure in Lemlist → Settings → Webhooks
// Payload: { type: "emailReplied"|"emailSent"|..., campaignId, leadInfo: { email, firstName, ... } }

router.post("/lemlist", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const type    = (payload.type || "").toLowerCase();
    const lead    = payload.leadInfo || payload.lead || {};

    let eventType: string | null = null;
    if (type.includes("reply") || type.includes("interested")) eventType = "reply_received";
    else if (type.includes("meeting")) eventType = "meeting_booked";
    else if (type.includes("sent") || type.includes("start")) eventType = "sequence_started";

    if (eventType && (lead.email || lead._id)) {
      const externalId = lead._id || lead.email;
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.firstName || "Unknown",
          lastName:  lead.lastName  || "",
          email:     lead.email     || null,
          company:   lead.companyName || null,
        },
        "Lemlist", String(externalId),
        { campaign: payload.campaignId, eventType: payload.type },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/lemlist]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Instantly ───────────────────────────────────────────────────────────────
// Configure in Instantly → Settings → Webhooks
// Payload: { event_type: "reply_received"|"email_sent"|..., lead: { email, firstName, ... } }

router.post("/instantly", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload    = req.body;
    const eventRaw   = (payload.event_type || payload.type || "").toLowerCase();
    const lead       = payload.lead || payload;

    let eventType: string | null = null;
    if (eventRaw.includes("reply"))                            eventType = "reply_received";
    else if (eventRaw.includes("meeting"))                     eventType = "meeting_booked";
    else if (eventRaw.includes("sent") || eventRaw.includes("start")) eventType = "sequence_started";
    else if (eventRaw.includes("complete"))                    eventType = "sequence_ended";

    if (eventType && lead.email) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.firstName || lead.first_name || "Unknown",
          lastName:  lead.lastName  || lead.last_name  || "",
          email:     lead.email     || null,
          company:   lead.company_name || lead.companyName || null,
        },
        "Instantly", String(lead.id || lead.email),
        { campaign: payload.campaign_id, event: payload.event_type },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/instantly]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Smartlead ───────────────────────────────────────────────────────────────
// Configure in Smartlead → Settings → Webhooks
// Payload: { event_type: "lead_replied"|"email_sent"|..., lead: { email, first_name, ... } }

router.post("/smartlead", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event_type || "").toLowerCase();
    const lead     = payload.lead || payload;

    let eventType: string | null = null;
    if (eventRaw.includes("reply"))           eventType = "reply_received";
    else if (eventRaw.includes("meeting"))    eventType = "meeting_booked";
    else if (eventRaw.includes("sent"))       eventType = "sequence_started";
    else if (eventRaw.includes("complete"))   eventType = "sequence_ended";

    if (eventType && lead.email) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.first_name || "Unknown",
          lastName:  lead.last_name  || "",
          email:     lead.email      || null,
          company:   lead.company_name || null,
        },
        "Smartlead", String(lead.id || lead.email),
        { campaign: payload.campaign_id, event: payload.event_type },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/smartlead]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── User Stripe Data Source ──────────────────────────────────────────────────
//
// PURPOSE: Ingest revenue events from a USER's own Stripe account.
//          This is NOT IQPipe Billing. It does not touch STRIPE_SECRET_KEY.
//
// SETUP (per workspace):
//   1. User connects their Stripe account in IQPipe → Integrations → Stripe
//      and provides their own sk_live_* / sk_test_* key + webhook secret.
//   2. In their Stripe Dashboard → Webhooks, user adds:
//        https://iqpipe.vercel.app/api/webhooks/stripe?workspaceId=<their-workspace-id>
//   3. Recommended events: charge.succeeded, payment_intent.succeeded,
//                          customer.subscription.created, customer.subscription.updated
//
// KEY ISOLATION: assertNotBillingKey() is called before any Stripe SDK usage.
//   If a user accidentally pastes IQPipe's billing key, the request is rejected.
//
// NOTE: app.ts registers express.raw() for this path BEFORE express.json()
//       so req.body arrives as a Buffer, enabling Stripe signature verification.
//
// SIGNATURE POLICY: If the user has configured a webhook secret, verification
//   is enforced and events that fail are rejected. If no secret is configured,
//   events are accepted with a warning (backwards-compatible for existing users).
//   We recommend all users configure a webhook secret.

router.post("/stripe", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const conn   = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "stripe", status: "connected" },
    });
    const auth   = parseAuth(conn?.authData);
    const sig    = req.headers["stripe-signature"] as string | undefined;
    const secret = auth?.webhookSecret;
    const apiKey = auth?.apiKey;

    // ── Key isolation guard ───────────────────────────────────────────────────
    // Reject immediately if the user's stored key matches IQPipe's billing key.
    // This prevents cross-contamination even if keys were misconfigured in DB.
    if (apiKey) {
      assertNotBillingKey(apiKey, "webhook/user-stripe-data-source");
    }

    let event: any;
    const rawBody: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    if (secret && sig) {
      // User has configured a webhook secret — enforce signature verification.
      if (!apiKey) {
        return res.status(400).json({ error: "Stripe integration is not fully connected for this workspace." });
      }
      try {
        const userStripe = new Stripe(apiKey.trim(), { apiVersion: "2024-06-20" as any });
        event = userStripe.webhooks.constructEvent(rawBody, sig, secret);
      } catch (sigErr: any) {
        // Signature failed — reject. Do not fall through to unverified processing
        // when the user explicitly configured a secret (that would defeat the purpose).
        console.warn("[webhook/user-stripe] Signature verification failed — rejecting:", sigErr.message);
        return res.status(400).json({ error: "Stripe signature verification failed." });
      }
    } else {
      // No webhook secret configured — accept without verification but log a warning.
      // This is backwards-compatible with existing workspaces that haven't set a secret yet.
      console.warn(
        `[webhook/user-stripe] workspaceId=${workspaceId}: No webhook secret configured. ` +
        "Processing without signature verification. Configure a webhook secret in IQPipe → Integrations → Stripe for improved security."
      );
      try { event = JSON.parse(rawBody.toString()); }
      catch { return res.status(400).json({ error: "Invalid JSON payload." }); }
    }

    const type = event.type || "";
    const obj  = event.data?.object || {};

    if (["charge.succeeded", "payment_intent.succeeded"].includes(type)) {
      const email    = obj.billing_details?.email || obj.receipt_email || null;
      const name     = obj.billing_details?.name  || email || "Unknown Customer";
      const parts    = (name || "").split(" ");
      const amount   = ((obj.amount ?? 0) / 100).toFixed(2);
      const currency = (obj.currency || "usd").toUpperCase();

      await recordEvent(
        workspaceId, "deal_won",
        { firstName: parts[0] || "Unknown", lastName: parts.slice(1).join(" "), email },
        "Stripe", String(obj.id),
        { amount, currency, description: obj.description },
      );

    } else if (["customer.subscription.created", "customer.subscription.updated"].includes(type)) {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (customerId && apiKey) {
        try {
          // Use a fresh client scoped to the user's own key — never billingStripe.
          const userStripe = new Stripe(apiKey.trim(), { apiVersion: "2024-06-20" as any });
          const customer: any = await userStripe.customers.retrieve(customerId);
          const email    = customer.email || null;
          const name     = customer.name || email || "Unknown Customer";
          const parts    = (name || "").split(" ");

          await recordEvent(
            workspaceId, "deal_won",
            { firstName: parts[0] || "Unknown", lastName: parts.slice(1).join(" "), email },
            "Stripe", String(obj.id),
            { plan: obj.items?.data?.[0]?.price?.nickname, status: obj.status },
          );
        } catch { /* skip if customer lookup fails */ }
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/user-stripe]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Expandi ─────────────────────────────────────────────────────────────────
// Configure in Expandi → Settings → Webhooks → Add Webhook
// Events: connection_request_sent, connection_accepted, message_sent, reply_received, profile_visited
// Payload: { event, lead: { firstName, lastName, email, linkedInUrl, company, position }, campaign: { id, name } }

router.post("/expandi", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const raw      = (payload.event || payload.eventType || "").toLowerCase().replace(/\s+/g, "_");
    const lead     = payload.lead || payload.prospect || payload;

    let eventType: string | null = null;
    if (raw.includes("connection_request_sent") || raw === "connection_sent")   eventType = "connection_request_sent";
    else if (raw.includes("connection_accepted") || raw === "accepted")         eventType = "connection_accepted";
    else if (raw.includes("message_sent"))                                      eventType = "message_sent";
    else if (raw.includes("reply") || raw.includes("replied"))                  eventType = "reply_received";
    else if (raw.includes("profile") || raw.includes("visit"))                  eventType = "profile_viewed";

    const externalId = lead.id || lead.linkedInUrl || lead.email;
    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.firstName || lead.first_name || "Unknown",
          lastName:  lead.lastName  || lead.last_name  || "",
          email:     lead.email     || null,
          linkedin:  lead.linkedInUrl || lead.linkedin_url || null,
          company:   lead.company   || lead.companyName || null,
          title:     lead.position  || lead.title || null,
        },
        "Expandi", String(externalId),
        { campaign: payload.campaign?.name || payload.campaignName, expandiEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/expandi]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Dripify ──────────────────────────────────────────────────────────────────
// Configure in Dripify → Settings → Webhooks → Create Webhook
// Events: connection_request_sent, connection_accepted, message_sent, reply_received
// Payload: { event, prospect: { firstName, lastName, email, linkedInUrl, companyName, position }, drip: { id, name } }

router.post("/dripify", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const raw      = (payload.event || payload.action || "").toLowerCase().replace(/\s+/g, "_");
    const prospect = payload.prospect || payload.lead || payload;

    let eventType: string | null = null;
    if (raw.includes("connection_request") || raw.includes("connect_sent"))  eventType = "connection_request_sent";
    else if (raw.includes("accepted"))                                        eventType = "connection_accepted";
    else if (raw.includes("message_sent") || raw.includes("messaged"))       eventType = "message_sent";
    else if (raw.includes("reply") || raw.includes("responded"))             eventType = "reply_received";
    else if (raw.includes("profile") || raw.includes("visit"))               eventType = "profile_viewed";
    else if (raw.includes("inmail"))                                         eventType = "inmail_sent";

    const externalId = prospect.id || prospect.linkedInUrl || prospect.email;
    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: prospect.firstName || prospect.first_name || "Unknown",
          lastName:  prospect.lastName  || prospect.last_name  || "",
          email:     prospect.email     || null,
          linkedin:  prospect.linkedInUrl || prospect.linkedin_url || null,
          company:   prospect.companyName || prospect.company || null,
          title:     prospect.position  || prospect.title || null,
        },
        "Dripify", String(externalId),
        { campaign: payload.drip?.name || payload.campaignName, dripifyEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/dripify]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Waalaxy ──────────────────────────────────────────────────────────────────
// Configure in Waalaxy → Settings → Webhooks → New Webhook
// Events: action.connection_request, action.message, action.visit, action.follow, reply.received
// Payload: { event, contact: { firstName, lastName, linkedinUrl, email }, campaign: { id, name } }

router.post("/waalaxy", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event || payload.type || "").toLowerCase().replace(/[.\s]+/g, "_");
    const contact = payload.contact || payload.lead || payload.prospect || payload;

    let eventType: string | null = null;
    if (raw.includes("connection_request") || raw === "action_connection") eventType = "connection_request_sent";
    else if (raw.includes("accept"))                                        eventType = "connection_accepted";
    else if (raw.includes("message") && !raw.includes("reply"))            eventType = "message_sent";
    else if (raw.includes("reply") || raw.includes("replied"))             eventType = "reply_received";
    else if (raw.includes("visit"))                                         eventType = "profile_viewed";
    else if (raw.includes("follow"))                                        eventType = "follow_sent";

    const externalId = contact.id || contact.linkedinUrl || contact.linkedin_url || contact.email;
    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.firstName || contact.first_name || "Unknown",
          lastName:  contact.lastName  || contact.last_name  || "",
          email:     contact.email     || null,
          linkedin:  contact.linkedinUrl || contact.linkedin_url || null,
          company:   contact.companyName || contact.company || null,
          title:     contact.position  || contact.title || null,
        },
        "Waalaxy", String(externalId),
        { campaign: payload.campaign?.name || payload.campaignName, waalaxyEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/waalaxy]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Meet Alfred ─────────────────────────────────────────────────────────────
// Configure in Meet Alfred → Settings → API & Webhooks → Create Webhook
// Events: connection_request_sent, connection_accepted, message_sent, reply_received
// Payload: { event_type, lead: { first_name, last_name, email, linkedin_url, company } }

router.post("/meetalfred", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event_type || payload.event || payload.type || "").toLowerCase().replace(/\s+/g, "_");
    const lead    = payload.lead || payload.contact || payload;

    let eventType: string | null = null;
    if (raw.includes("connection_request"))   eventType = "connection_request_sent";
    else if (raw.includes("accepted"))        eventType = "connection_accepted";
    else if (raw.includes("message_sent") || raw.includes("message_delivered")) eventType = "message_sent";
    else if (raw.includes("reply") || raw.includes("replied"))                  eventType = "reply_received";
    else if (raw.includes("profile") || raw.includes("visit"))                  eventType = "profile_viewed";
    else if (raw.includes("email_sent"))      eventType = "sequence_started";
    else if (raw.includes("email_replied"))   eventType = "reply_received";

    const externalId = lead.id || lead.linkedin_url || lead.email;
    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.first_name || lead.firstName || "Unknown",
          lastName:  lead.last_name  || lead.lastName  || "",
          email:     lead.email     || null,
          linkedin:  lead.linkedin_url || lead.linkedInUrl || null,
          company:   lead.company   || null,
          title:     lead.title     || lead.position || null,
        },
        "MeetAlfred", String(externalId),
        { campaign: payload.campaign_name || payload.campaignName, alfredEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/meetalfred]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Mailshake ───────────────────────────────────────────────────────────────
// Configure in Mailshake → Extensions → Notifications → Webhooks
// Events: Sent, Opened, Clicked, Replied, LeadCaught, Unsubscribed
// Payload: { type, data: { recipient: { emailAddress, fullName }, campaign: { title }, message: { subject } } }

router.post("/mailshake", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload   = req.body;
    const type      = (payload.type || payload.event || "").toLowerCase();
    const recipient = payload.data?.recipient || payload.recipient || {};
    const campaign  = payload.data?.campaign  || payload.campaign  || {};

    let eventType: string | null = null;
    if (type === "replied" || type === "reply")                       eventType = "reply_received";
    else if (type === "leadcaught" || type.includes("lead"))          eventType = "reply_received";
    else if (type.includes("meeting"))                                eventType = "meeting_booked";
    else if (type === "sent" || type === "start" || type === "send")  eventType = "sequence_started";
    else if (type === "opened" || type === "open")                    eventType = "email_opened";
    else if (type === "clicked" || type === "click")                  eventType = "email_clicked";

    const email      = recipient.emailAddress || recipient.email;
    const fullName   = recipient.fullName || recipient.name || "";
    const nameParts  = fullName.split(" ");
    const externalId = recipient.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: nameParts[0] || "Unknown",
          lastName:  nameParts.slice(1).join(" "),
          email:     email || null,
          company:   recipient.company || null,
        },
        "Mailshake", String(externalId),
        { campaign: campaign.title || campaign.name, mailshakeEvent: payload.type },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/mailshake]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Aircall ─────────────────────────────────────────────────────────────────
// Configure in Aircall → Integrations → Webhooks → New Webhook
// Events: call.ended, call.answered, call.voicemail_left, contact.created
// Payload: { event, data: { id, direction, duration, contact: { id, first_name, last_name, emails } } }

router.post("/aircall", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const event   = (payload.event || payload.type || "").toLowerCase();
    const data    = payload.data || {};
    const contact = data.contact || data.user || {};

    let eventType: string | null = null;
    if (event.includes("call.ended") || event.includes("call_ended"))         eventType = "call_completed";
    else if (event.includes("call.answered") || event.includes("call_answered")) eventType = "call_completed";
    else if (event.includes("voicemail"))                                      eventType = "voicemail_left";
    else if (event.includes("call.created") || event.includes("call_created")) eventType = "call_initiated";
    else if (event.includes("contact.created"))                               eventType = "lead_imported";

    const email      = contact.emails?.[0]?.value || contact.email || null;
    const externalId = data.id || contact.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.first_name || contact.firstName || "Unknown",
          lastName:  contact.last_name  || contact.lastName  || "",
          email,
          company:   contact.company_name || contact.company || null,
          title:     contact.job_title   || contact.title   || null,
        },
        "Aircall", String(externalId),
        { direction: data.direction, duration: data.duration, aircallEvent: event },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/aircall]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Dialpad ─────────────────────────────────────────────────────────────────
// Configure in Dialpad → Admin → Webhooks → Add Webhook
// Events: call_ended, call_connected, sms_received, sms_sent, voicemail
// Payload: { event_type, call_id, contact: { name, email, phone }, duration, direction }

router.post("/dialpad", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event_type || payload.type || payload.event || "").toLowerCase();
    const contact = payload.contact || {};

    let eventType: string | null = null;
    if (raw === "call_ended" || raw === "hangup")         eventType = "call_completed";
    else if (raw === "call_connected" || raw === "answered") eventType = "call_completed";
    else if (raw === "voicemail")                          eventType = "voicemail_left";
    else if (raw.includes("sms") && raw.includes("sent")) eventType = "sms_sent";
    else if (raw.includes("sms") && raw.includes("received")) eventType = "sms_received";

    const fullName  = contact.name || "";
    const nameParts = fullName.split(" ");
    const email     = contact.email || null;
    const externalId = payload.call_id || payload.id || contact.phone || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: nameParts[0] || "Unknown",
          lastName:  nameParts.slice(1).join(" "),
          email,
          company:   contact.company || null,
        },
        "Dialpad", String(externalId),
        { direction: payload.direction, duration: payload.duration, dialpadEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/dialpad]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Kixie ───────────────────────────────────────────────────────────────────
// Configure in Kixie → Settings → Integrations → Webhooks
// Events: Outbound Call, Inbound Call, SMS Sent, SMS Received, Voicemail
// Payload: { EventType, UniqueCallID, ContactName, ContactEmail, ContactPhone, Duration, Disposition }

router.post("/kixie", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.EventType || payload.event_type || payload.event || "").toLowerCase();

    let eventType: string | null = null;
    if (raw.includes("outbound call") || raw === "outbound_call" || raw === "outbound") eventType = "call_completed";
    else if (raw.includes("inbound call") || raw === "inbound_call")                    eventType = "call_completed";
    else if (raw.includes("voicemail"))                                                  eventType = "voicemail_left";
    else if (raw.includes("sms") && raw.includes("sent"))                               eventType = "sms_sent";
    else if (raw.includes("sms") && raw.includes("received"))                           eventType = "sms_received";

    const fullName  = payload.ContactName || payload.contact_name || "";
    const nameParts = fullName.split(" ");
    const email     = payload.ContactEmail || payload.contact_email || null;
    const externalId = payload.UniqueCallID || payload.call_id || payload.ContactPhone || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: nameParts[0] || "Unknown",
          lastName:  nameParts.slice(1).join(" "),
          email,
          company:   payload.ContactCompany || null,
          title:     payload.ContactTitle   || null,
        },
        "Kixie", String(externalId),
        { duration: payload.Duration, disposition: payload.Disposition, kixieEvent: payload.EventType },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/kixie]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Orum ────────────────────────────────────────────────────────────────────
// Configure in Orum → Settings → Webhooks → New Webhook
// Events: call_completed, call_connected, voicemail_left, meeting_booked
// Payload: { event, call_id, contact: { first_name, last_name, email, company, title }, outcome, duration }

router.post("/orum", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event || payload.event_type || "").toLowerCase();
    const contact = payload.contact || payload.prospect || {};

    let eventType: string | null = null;
    if (raw === "call_completed" || raw === "call_ended")          eventType = "call_completed";
    else if (raw === "call_connected" || raw === "call_answered")  eventType = "call_completed";
    else if (raw.includes("voicemail"))                            eventType = "voicemail_left";
    else if (raw.includes("meeting"))                              eventType = "meeting_booked";

    const email      = contact.email || null;
    const externalId = payload.call_id || contact.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.first_name || contact.firstName || "Unknown",
          lastName:  contact.last_name  || contact.lastName  || "",
          email,
          company:   contact.company || null,
          title:     contact.title   || null,
        },
        "Orum", String(externalId),
        { outcome: payload.outcome, duration: payload.duration, orumEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/orum]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Twilio ──────────────────────────────────────────────────────────────────
// Configure in Twilio → Phone Numbers → Messaging → Webhook URL (for SMS)
// Or in Twilio → Messaging → Services → Webhooks (for WhatsApp / Conversations)
// Twilio sends form-encoded (application/x-www-form-urlencoded) data
// Key fields: MessageSid, From, To, Body, MessageStatus, WaId (WhatsApp)

router.post("/twilio", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    // Twilio sends form-encoded — express.urlencoded() middleware handles this
    const payload = req.body;
    const status  = (payload.MessageStatus || payload.SmsStatus || "").toLowerCase();
    const isWA    = !!(payload.WaId || String(payload.From || "").includes("whatsapp"));

    // We only record inbound messages and delivered outbound messages
    let eventType: string | null = null;
    if (status === "received" || status === "delivered" || status === "read") {
      eventType = isWA ? "whatsapp_received" : "sms_received";
    } else if (status === "sent" || status === "") {
      // Inbound with no status field (e.g. incoming SMS webhook)
      eventType = isWA ? "whatsapp_received" : "sms_received";
    }

    const from       = payload.From || payload.WaId || "";
    const externalId = payload.MessageSid || from;

    if (eventType && externalId) {
      const name = payload.ProfileName || payload.FromCity || from;
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: name || "Unknown",
          lastName:  "",
          email:     null,
        },
        "Twilio", String(externalId),
        { from, to: payload.To, body: (payload.Body || "").slice(0, 200), isWhatsApp: isWA },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/twilio]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Sakari ──────────────────────────────────────────────────────────────────
// Configure in Sakari → Account → API & Webhooks → Webhook URL
// Events: message.received, message.sent, message.delivered, optout
// Payload: { event, data: { id, from, to, body, contact: { firstName, lastName, email } } }

router.post("/sakari", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const event   = (payload.event || payload.type || "").toLowerCase().replace(/\./g, "_");
    const data    = payload.data || payload;
    const contact = data.contact || {};

    let eventType: string | null = null;
    if (event.includes("received"))         eventType = "sms_received";
    else if (event.includes("sent"))        eventType = "sms_sent";
    else if (event.includes("delivered"))   eventType = "sms_sent";
    else if (event.includes("optout") || event.includes("unsubscribe")) eventType = "unsubscribed";

    const email      = contact.email || null;
    const externalId = data.id || contact.id || data.from || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.firstName || contact.first_name || "Unknown",
          lastName:  contact.lastName  || contact.last_name  || "",
          email,
          company:   contact.company || null,
        },
        "Sakari", String(externalId),
        { from: data.from, to: data.to, body: (data.body || "").slice(0, 200), sakariEvent: event },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/sakari]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── WATI ────────────────────────────────────────────────────────────────────
// Configure in WATI → Settings → Configure Webhook
// Events: message (inbound WhatsApp), template_sent, read, session_message
// Payload: { waId, eventType, contact: { wa_id, name, phone }, message: { body } }

router.post("/wati", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.eventType || payload.event || payload.type || "").toLowerCase();
    const contact = payload.contact || {};
    const message = payload.message || {};

    let eventType: string | null = null;
    if (raw === "message" || raw === "session_message" || raw.includes("received")) eventType = "whatsapp_received";
    else if (raw.includes("template_sent") || raw.includes("sent"))                 eventType = "whatsapp_sent";
    else if (raw === "read")                                                         eventType = "whatsapp_received";

    const phone      = contact.phone || payload.waId || payload.wa_id || "";
    const externalId = payload.waId || message.id || phone;

    if (eventType && externalId) {
      const nameParts = (contact.name || "").split(" ");
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: nameParts[0] || "Unknown",
          lastName:  nameParts.slice(1).join(" "),
          email:     null,
        },
        "WATI", String(externalId),
        { phone, body: (message.body || message.text || "").slice(0, 200), watiEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/wati]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Outreach ────────────────────────────────────────────────────────────────
// Configure in Outreach → Settings → Webhooks → Create Webhook
// Events: prospect.created, sequence_state.created, call.created, email.opened, email.replied
// Payload: { action, type, data: { type, id, attributes: { firstName, lastName, emails, jobTitle } } }

router.post("/outreach", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload    = req.body;
    const objectType = (payload.type || payload.data?.type || "").toLowerCase();
    const action     = (payload.action || "").toLowerCase();
    const attrs      = payload.data?.attributes || payload.attributes || {};

    let eventType: string | null = null;
    if (objectType.includes("email") && action.includes("replied"))    eventType = "reply_received";
    else if (objectType.includes("email") && action.includes("opened")) eventType = "email_opened";
    else if (objectType.includes("call"))                               eventType = "call_completed";
    else if (objectType.includes("sequence") || objectType.includes("mailingstate")) eventType = "sequence_started";
    else if (objectType.includes("prospect") && action === "created")  eventType = "lead_imported";
    else if (objectType.includes("meeting") || objectType.includes("booking")) eventType = "meeting_booked";

    const emails     = Array.isArray(attrs.emails) ? attrs.emails : (attrs.email ? [attrs.email] : []);
    const email      = emails[0] || null;
    const externalId = payload.data?.id || attrs.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: attrs.firstName || attrs.first_name || "Unknown",
          lastName:  attrs.lastName  || attrs.last_name  || "",
          email,
          company:   attrs.accountName || attrs.company || null,
          title:     attrs.jobTitle    || attrs.title   || null,
        },
        "Outreach", String(externalId),
        { sequence: attrs.sequenceName, outreachEvent: `${objectType}.${action}` },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/outreach]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Salesloft ───────────────────────────────────────────────────────────────
// Configure in Salesloft → Settings → Webhooks → Add Webhook
// Events: email_opened, email_replied, call_completed, step_completed, person_stage_changed
// Payload: { event_type, data: { person: { first_name, last_name, email_address, title }, cadence: { name } } }

router.post("/salesloft", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event_type || payload.type || payload.event || "").toLowerCase();
    const data    = payload.data || {};
    const person  = data.person || data.lead || data.contact || {};
    const cadence = data.cadence || {};

    let eventType: string | null = null;
    if (raw.includes("replied") || raw.includes("reply"))    eventType = "reply_received";
    else if (raw.includes("opened") || raw.includes("open")) eventType = "email_opened";
    else if (raw.includes("call"))                           eventType = "call_completed";
    else if (raw.includes("meeting") || raw.includes("book")) eventType = "meeting_booked";
    else if (raw.includes("step") || raw.includes("start"))  eventType = "sequence_started";
    else if (raw.includes("stage"))                          eventType = "lead_imported";

    const email      = person.email_address || person.email || null;
    const externalId = person.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: person.first_name || person.firstName || "Unknown",
          lastName:  person.last_name  || person.lastName  || "",
          email,
          company:   person.account?.name || person.company || null,
          title:     person.title         || null,
        },
        "Salesloft", String(externalId),
        { cadence: cadence.name, salesloftEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/salesloft]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Reply.io ────────────────────────────────────────────────────────────────
// Configure in Reply.io → Settings → Integrations → Webhooks → Add Webhook
// Events: emailReplied, emailOpened, callCompleted, linkedinReplied, stepCompleted, meeting_booked
// Payload: { event, contact: { firstName, lastName, email }, campaign: { id, name } }

router.post("/replyio", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.event || payload.type || payload.action || "").toLowerCase();
    const contact = payload.contact || payload.lead || payload.person || {};

    let eventType: string | null = null;
    if (raw.includes("replied") || raw.includes("reply"))              eventType = "reply_received";
    else if (raw.includes("opened") || raw.includes("open"))           eventType = "email_opened";
    else if (raw.includes("call"))                                      eventType = "call_completed";
    else if (raw.includes("meeting") || raw.includes("book"))          eventType = "meeting_booked";
    else if (raw.includes("step") || raw.includes("start") || raw.includes("sent")) eventType = "sequence_started";
    else if (raw.includes("linkedin"))                                  eventType = "reply_received";

    const email      = contact.email || null;
    const externalId = contact.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.firstName || contact.first_name || "Unknown",
          lastName:  contact.lastName  || contact.last_name  || "",
          email,
          company:   contact.company || null,
          title:     contact.title   || null,
        },
        "ReplyIo", String(externalId),
        { campaign: payload.campaign?.name || payload.campaignName, replyioEvent: raw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/replyio]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Klenty ──────────────────────────────────────────────────────────────────
// Configure in Klenty → Settings → Integrations → Webhooks → Create Webhook
// Events: Email Replied, Email Opened, Email Clicked, Call Completed, Task Completed
// Payload: { EventName, ProspectEmail, ProspectFirstName, ProspectLastName, ProspectCompany, Cadence }

router.post("/klenty", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const raw     = (payload.EventName || payload.event_name || payload.event || "").toLowerCase();

    let eventType: string | null = null;
    if (raw.includes("replied") || raw.includes("reply"))    eventType = "reply_received";
    else if (raw.includes("opened") || raw.includes("open")) eventType = "email_opened";
    else if (raw.includes("clicked") || raw.includes("click")) eventType = "email_clicked";
    else if (raw.includes("call"))                            eventType = "call_completed";
    else if (raw.includes("meeting") || raw.includes("book")) eventType = "meeting_booked";
    else if (raw.includes("task") || raw.includes("step") || raw.includes("sent")) eventType = "sequence_started";

    const email      = payload.ProspectEmail || payload.email || null;
    const externalId = email || payload.ProspectId || payload.id;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: payload.ProspectFirstName || payload.first_name || "Unknown",
          lastName:  payload.ProspectLastName  || payload.last_name  || "",
          email,
          company:   payload.ProspectCompany  || payload.company || null,
          title:     payload.ProspectJobTitle || payload.title   || null,
        },
        "Klenty", String(externalId),
        { cadence: payload.Cadence || payload.cadence, klentyEvent: payload.EventName },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/klenty]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Apollo ──────────────────────────────────────────────────────────────────
// Configure in Apollo → Settings → Integrations → Webhooks
// Events: contact.emailed, contact.replied, sequence.finished
// Payload: { event_type, contact: { id, first_name, last_name, email, account: { name } }, sequence: { name } }

router.post("/apollo", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event_type || payload.event || payload.type || "").toLowerCase();
    const contact  = payload.contact || payload.lead || payload.prospect || {};

    let eventType: string | null = null;
    if (eventRaw.includes("replied") || eventRaw.includes("reply"))          eventType = "reply_received";
    else if (eventRaw.includes("meeting") || eventRaw.includes("booking"))   eventType = "meeting_booked";
    else if (eventRaw.includes("emailed") || eventRaw.includes("sent"))      eventType = "sequence_started";
    else if (eventRaw.includes("bounced") || eventRaw.includes("bounce"))    eventType = "bounced";
    else if (eventRaw.includes("unsubscribed") || eventRaw.includes("optout")) eventType = "unsubscribed";
    else if (eventRaw.includes("exported") || eventRaw.includes("created"))  eventType = "lead_imported";
    else if (eventRaw.includes("sequence") && eventRaw.includes("finish"))   eventType = "sequence_ended";

    const email      = contact.email || null;
    const externalId = contact.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.first_name || contact.firstName || "Unknown",
          lastName:  contact.last_name  || contact.lastName  || "",
          email,
          company:   contact.account?.name || contact.company_name || contact.company || null,
          title:     contact.title || null,
        },
        "Apollo", String(externalId),
        { sequence: payload.sequence?.name || payload.sequence_name, apolloEvent: eventRaw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/apollo]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PhantomBuster ────────────────────────────────────────────────────────────
// Configure in each Phantom → Advanced Settings → Webhook URL
// Events: phantom output (run completed), error
// Payload: { agentId, status: "finished"|"error", data: [{ firstName, lastName, linkedInUrl, email, company, jobTitle }] }

router.post("/phantombuster", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const status  = (payload.status || "").toLowerCase();
    const output  = Array.isArray(payload.data) ? payload.data
                  : Array.isArray(payload.output) ? payload.output
                  : payload.result ? [payload.result] : [];

    if (status === "finished" || status === "success" || output.length) {
      let imported = 0;
      for (const row of output.slice(0, 100)) {
        const externalId = row.id || row.linkedInUrl || row.linkedin_url || row.email;
        if (!externalId) continue;
        await recordEvent(
          workspaceId, "lead_imported",
          {
            firstName: row.firstName || row.first_name || row.name?.split(" ")[0] || "Unknown",
            lastName:  row.lastName  || row.last_name  || row.name?.split(" ").slice(1).join(" ") || "",
            email:     row.email     || null,
            linkedin:  row.linkedInUrl || row.linkedin_url || null,
            company:   row.companyName || row.company || null,
            title:     row.jobTitle  || row.job_title || row.position || null,
          },
          "PhantomBuster", String(externalId),
          { agentId: payload.agentId, phantomStatus: status },
        );
        imported++;
      }
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/phantombuster]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Clearbit ────────────────────────────────────────────────────────────────
// Configure via Clearbit Enrichment API callbacks or Reveal webhook
// Person enrichment: { type: "person_found"|"person_not_found", body: { person: { id, email, name, employment } } }
// Reveal: { type: "reveal", body: { ip, company: { name, domain }, person: { email, name, title } } }

router.post("/clearbit", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const type     = (payload.type || payload.event || "").toLowerCase();
    const body     = payload.body || payload.data || payload;
    const person   = body.person || body.contact || {};
    const company  = body.company || person.employment || {};

    let eventType: string | null = null;
    if (type.includes("person_found") || type.includes("enrichment")) eventType = "lead_enriched";
    else if (type.includes("reveal"))                                   eventType = "lead_imported";
    else if (type.includes("bulk") && type.includes("complet"))        eventType = "lead_enriched";
    else if (type.includes("person_not_found"))                         return res.json({ received: true }); // skip

    const email      = person.email || null;
    const externalId = person.id || email || body.ip;

    if (eventType && externalId) {
      const givenName  = person.name?.givenName  || person.firstName  || "Unknown";
      const familyName = person.name?.familyName || person.lastName   || "";
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: givenName,
          lastName:  familyName,
          email,
          company:   company.name || person.company || null,
          title:     person.employment?.title || person.title || null,
        },
        "Clearbit", String(externalId),
        { clearbitType: type, ip: body.ip, domain: company.domain || person.employment?.domain },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/clearbit]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── ZoomInfo ────────────────────────────────────────────────────────────────
// Configure via ZoomInfo Webhooks in Admin → Integrations → Webhooks
// Events: contact.exported, intent.spike, company.exported
// Payload: { event: "contact.exported", timestamp, data: { contact: { firstName, lastName, email, jobTitle, companyName } } }

router.post("/zoominfo", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event || payload.type || "").toLowerCase();
    const data     = payload.data || payload;
    const contact  = data.contact || data.person || {};

    let eventType: string | null = null;
    if (eventRaw.includes("contact") && eventRaw.includes("export"))   eventType = "lead_imported";
    else if (eventRaw.includes("intent"))                               eventType = "intent_signal";
    else if (eventRaw.includes("company"))                              eventType = "lead_enriched";
    else if (eventRaw.includes("updated"))                             eventType = "lead_enriched";

    const email      = contact.email || null;
    const externalId = contact.id || contact.personId || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: contact.firstName || "Unknown",
          lastName:  contact.lastName  || "",
          email,
          company:   contact.companyName || contact.company || null,
          title:     contact.jobTitle  || contact.title || null,
        },
        "ZoomInfo", String(externalId),
        { ziEvent: eventRaw, companyId: data.companyId },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/zoominfo]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── People Data Labs (PDL) ────────────────────────────────────────────────────
// Configure bulk enrichment job webhook in PDL API call → webhook_url param
// Events: enrichment_completed, bulk_completed
// Payload: { webhook_type: "enrichment_completed", data: { person: { full_name, first_name, last_name, work_email, job_title, job_company_name } } }

router.post("/pdl", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const typeRaw  = (payload.webhook_type || payload.event || payload.type || "").toLowerCase();
    const data     = payload.data || payload;

    // Handle both single-person and bulk responses
    const people = Array.isArray(data)
      ? data.map((d: any) => d.person || d.data || d)
      : data.people ? data.people
      : data.person ? [data.person]
      : [];

    for (const person of (people.length ? people : [data.person || data]).filter(Boolean)) {
      const email      = person.work_email || person.email || null;
      const externalId = person.id || email;
      if (!externalId) continue;

      await recordEvent(
        workspaceId, "lead_enriched",
        {
          firstName: person.first_name  || person.full_name?.split(" ")[0] || "Unknown",
          lastName:  person.last_name   || person.full_name?.split(" ").slice(1).join(" ") || "",
          email,
          linkedin:  person.linkedin_url || null,
          company:   person.job_company_name || person.company || null,
          title:     person.job_title   || null,
        },
        "PDL", String(externalId),
        { pdlType: typeRaw, confidence: data.likelihood },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/pdl]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Hunter.io ────────────────────────────────────────────────────────────────
// Configure in Hunter → Campaigns → Webhook settings
// Events: campaign.email_sent, campaign.email_opened, campaign.email_replied, domain_search.completed
// Payload: { event: "campaign.email_replied", data: { campaign_id, lead: { email, first_name, last_name }, reply: { text } } }

router.post("/hunter", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event || payload.type || "").toLowerCase();
    const data     = payload.data || payload;
    const lead     = data.lead || data.contact || data.recipient || {};

    let eventType: string | null = null;
    if (eventRaw.includes("replied") || eventRaw.includes("reply"))        eventType = "reply_received";
    else if (eventRaw.includes("opened") || eventRaw.includes("open"))     eventType = "email_opened";
    else if (eventRaw.includes("sent") || eventRaw.includes("delivered"))  eventType = "sequence_started";
    else if (eventRaw.includes("domain_search") || eventRaw.includes("finder")) eventType = "lead_enriched";
    else if (eventRaw.includes("verified"))                                 eventType = "lead_enriched";

    const email      = lead.email || data.email || null;
    const externalId = lead.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: lead.first_name || lead.firstName || "Unknown",
          lastName:  lead.last_name  || lead.lastName  || "",
          email,
          company:   lead.company || data.domain || null,
        },
        "Hunter", String(externalId),
        { campaign: data.campaign_id, hunterEvent: eventRaw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/hunter]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Lusha ───────────────────────────────────────────────────────────────────
// Configure in Lusha → Settings → Webhooks → Add Webhook
// Events: contact.enriched, export.completed, intent.detected
// Payload: { type: "export.completed", data: { contacts: [{ firstName, lastName, email, jobTitle, companyName }] } }
// OR single: { type: "contact.enriched", data: { contact: { firstName, lastName, email, jobTitle, companyName } } }

router.post("/lusha", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const typeRaw  = (payload.type || payload.event || "").toLowerCase();
    const data     = payload.data || payload;

    const contacts = Array.isArray(data.contacts) ? data.contacts
                   : data.contact ? [data.contact] : [data];

    for (const c of contacts) {
      const email      = c.email || null;
      const externalId = c.id || email;
      if (!externalId) continue;

      let eventType = "lead_enriched";
      if (typeRaw.includes("intent")) eventType = "intent_signal";

      await recordEvent(
        workspaceId, eventType,
        {
          firstName: c.firstName || c.first_name || "Unknown",
          lastName:  c.lastName  || c.last_name  || "",
          email,
          company:   c.companyName || c.company || null,
          title:     c.jobTitle   || c.title || null,
        },
        "Lusha", String(externalId),
        { lushaEvent: typeRaw, phone: c.phone || null },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/lusha]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Cognism ─────────────────────────────────────────────────────────────────
// Configure in Cognism → Settings → Integrations → Webhooks
// Events: contact.exported, intent.signal, list.refreshed
// Payload: { event: "contact.exported", contact: { firstName, lastName, email, jobTitle, companyName } }

router.post("/cognism", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event || payload.type || payload.webhook_event || "").toLowerCase();
    const data     = payload.data || payload;

    const contacts = Array.isArray(data.contacts) ? data.contacts
                   : data.contact ? [data.contact]
                   : payload.contact ? [payload.contact] : [data];

    for (const c of contacts) {
      const email      = c.email || c.workEmail || null;
      const externalId = c.id || email;
      if (!externalId) continue;

      let eventType = "lead_imported";
      if (eventRaw.includes("intent")) eventType = "intent_signal";
      else if (eventRaw.includes("enrich") || eventRaw.includes("verified")) eventType = "lead_enriched";

      await recordEvent(
        workspaceId, eventType,
        {
          firstName: c.firstName || "Unknown",
          lastName:  c.lastName  || "",
          email,
          company:   c.companyName || c.company || null,
          title:     c.jobTitle   || c.title || null,
        },
        "Cognism", String(externalId),
        { cognismEvent: eventRaw, phone: c.phone || c.mobilePhone || null },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/cognism]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Snov.io ─────────────────────────────────────────────────────────────────
// Configure in Snov.io → Settings → Webhooks → Add Webhook
// Events: campaign.replied, campaign.opened, prospect.found, email.verified
// Payload: { event: "campaign.replied", data: { prospect: { firstName, lastName, email, company, position }, campaign: { id, name }, reply: { text } } }

router.post("/snovio", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event || payload.type || "").toLowerCase();
    const data     = payload.data || payload;
    const prospect = data.prospect || data.contact || data.lead || {};

    let eventType: string | null = null;
    if (eventRaw.includes("replied") || eventRaw.includes("reply"))       eventType = "reply_received";
    else if (eventRaw.includes("opened") || eventRaw.includes("open"))    eventType = "email_opened";
    else if (eventRaw.includes("sent") || eventRaw.includes("delivered")) eventType = "sequence_started";
    else if (eventRaw.includes("prospect") || eventRaw.includes("found")) eventType = "lead_imported";
    else if (eventRaw.includes("verified"))                               eventType = "lead_enriched";
    else if (eventRaw.includes("bounced") || eventRaw.includes("bounce")) eventType = "bounced";

    const email      = prospect.email || data.email || null;
    const externalId = prospect.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: prospect.firstName || prospect.first_name || "Unknown",
          lastName:  prospect.lastName  || prospect.last_name  || "",
          email,
          company:   prospect.company || null,
          title:     prospect.position || prospect.title || null,
        },
        "Snovio", String(externalId),
        { campaign: data.campaign?.name || data.campaign_name, snovioEvent: eventRaw },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/snovio]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── RocketReach ─────────────────────────────────────────────────────────────
// Configure in RocketReach → Account → Webhooks → Add Webhook
// Events: lookup.completed, bulk.completed, export.completed
// Payload: { event: "lookup.completed", data: { lookup: { name, current_employer, current_title, emails: [{ email }], phones: [{ number }] } } }

router.post("/rocketreach", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const eventRaw = (payload.event || payload.type || "").toLowerCase();
    const data     = payload.data || payload;

    const lookups = Array.isArray(data.lookups) ? data.lookups
                  : data.lookup ? [data.lookup]
                  : data.results ? data.results : [data];

    for (const lookup of lookups) {
      const email      = lookup.emails?.[0]?.email || lookup.email || null;
      const externalId = lookup.id || lookup.linkedin_url || email;
      if (!externalId) continue;

      const fullName = lookup.name || lookup.full_name || "";
      const parts    = fullName.split(" ");
      await recordEvent(
        workspaceId, "lead_enriched",
        {
          firstName: parts[0] || lookup.first_name || "Unknown",
          lastName:  parts.slice(1).join(" ") || lookup.last_name || "",
          email,
          linkedin:  lookup.linkedin_url || null,
          company:   lookup.current_employer || lookup.company || null,
          title:     lookup.current_title   || lookup.title || null,
        },
        "RocketReach", String(externalId),
        { rrEvent: eventRaw, phones: lookup.phones?.length },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/rocketreach]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── HubSpot ─────────────────────────────────────────────────────────────────
// Configure in HubSpot → Settings → Integrations → Private Apps → Webhooks
// HubSpot sends arrays of subscription events
// Events: contact.creation, contact.propertyChange, deal.creation, deal.propertyChange
// Payload: [{ eventId, subscriptionType, objectId, portalId, propertyName, propertyValue }]
// Needs auth to fetch full contact/deal details — falls back to objectId + property delta

router.post("/hubspot", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    // Optionally fetch full contact details if we have auth
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "hubspot", status: "connected" },
    });
    const auth = conn ? JSON.parse(require("../utils/encryption").decrypt(conn.authData)) : null;

    for (const event of events) {
      const sub     = (event.subscriptionType || "").toLowerCase();
      const objId   = String(event.objectId || "");
      if (!objId) continue;

      let eventType: string | null = null;
      if (sub.includes("contact") && sub.includes("creation"))           eventType = "lead_imported";
      else if (sub.includes("contact") && sub.includes("property"))      eventType = "lead_enriched";
      else if (sub.includes("deal") && sub.includes("creation"))         eventType = "deal_created";
      else if (sub.includes("deal") && sub.includes("property"))         eventType = "deal_updated";
      else if (sub.includes("deal") && sub.includes("deletion"))         continue; // skip deletes

      if (!eventType) continue;

      // Try to enrich from HubSpot API
      let firstName = "Unknown", lastName = "", email: string | null = null, company: string | null = null;
      if (auth?.accessToken && sub.includes("contact")) {
        try {
          const hs = await axios.get(
            `https://api.hubapi.com/crm/v3/objects/contacts/${objId}`,
            {
              headers: { Authorization: `Bearer ${auth.accessToken.trim()}` },
              params: { properties: "firstname,lastname,email,company" },
            }
          );
          const p   = hs.data?.properties || {};
          firstName = p.firstname || "Unknown";
          lastName  = p.lastname  || "";
          email     = p.email     || null;
          company   = p.company   || null;
        } catch { /* fall back to partial data */ }
      }

      await recordEvent(
        workspaceId, eventType,
        { firstName, lastName, email, company },
        "HubSpot", `hubspot-${objId}`,
        { hubspotEvent: sub, propertyName: event.propertyName, propertyValue: event.propertyValue, objectId: objId },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/hubspot]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Pipedrive ────────────────────────────────────────────────────────────────
// Configure in Pipedrive → Settings → Tools and integrations → Webhooks → + Add webhook
// Events: added.deal, updated.deal, added.person, updated.person, added.activity, added.note
// Payload: { v, meta: { action: "added"|"updated"|"deleted", object: "deal"|"person"|"organization" },
//            data: { id, title?, person_id?: { name, email: [{ value }] }, close_time?, ... } }

router.post("/pipedrive", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload = req.body;
    const action  = (payload.meta?.action || payload.action || "").toLowerCase();
    const obj     = (payload.meta?.object || payload.object || payload.event || "").toLowerCase();
    const data    = payload.data || {};

    let eventType: string | null = null;
    if (obj === "deal" && action === "added")                             eventType = "deal_created";
    else if (obj === "deal" && action === "updated") {
      const stage = data.stage_id || data.status;
      eventType = (data.status === "won" || stage === "won") ? "deal_won"
                : (data.status === "lost" || stage === "lost") ? "deal_lost"
                : "deal_updated";
    }
    else if ((obj === "person" || obj === "contact") && action === "added") eventType = "lead_imported";
    else if ((obj === "person" || obj === "contact") && action === "updated") eventType = "lead_enriched";
    else if (obj === "activity" && action === "added")                    eventType = "call_completed";

    if (!eventType) return res.json({ received: true });

    // Person info — may come from deal.person_id or top-level
    const person    = data.person_id || data.person || {};
    const emails    = Array.isArray(person.email) ? person.email : [];
    const email     = emails.find((e: any) => e.primary)?.value || emails[0]?.value || data.email || null;
    const personName = person.name || data.person_name || "";
    const nameParts  = personName.split(" ");
    const externalId = data.id || email;

    if (!externalId) return res.json({ received: true });

    await recordEvent(
      workspaceId, eventType,
      {
        firstName: nameParts[0] || "Unknown",
        lastName:  nameParts.slice(1).join(" "),
        email,
        company:   data.org_name || data.org_id?.name || null,
        title:     data.title   || null,
      },
      "Pipedrive", `pipedrive-${externalId}`,
      { pipedriveEvent: `${action}.${obj}`, dealTitle: data.title, value: data.value },
    );
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/pipedrive]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Salesforce ───────────────────────────────────────────────────────────────
// Salesforce Outbound Messaging sends SOAP XML — we accept a normalized JSON format
// from middleware (Apex callout, Flow, or n8n/Zapier bridge).
// Payload: { event: "lead.created"|"opportunity.created"|..., record: { FirstName, LastName, Email, Company, Title, StageName } }
// OR Salesforce Platform Events JSON format.

router.post("/salesforce", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    // Support both camelCase (Platform Events) and PascalCase (Outbound Messaging)
    const eventRaw = (payload.event || payload.type || payload.Event__c || "").toLowerCase();
    const rec      = payload.record || payload.data || payload.sobject || payload;

    let eventType: string | null = null;
    if (eventRaw.includes("lead.created") || eventRaw.includes("lead_created"))           eventType = "lead_imported";
    else if (eventRaw.includes("lead.updated") || eventRaw.includes("lead_updated"))      eventType = "lead_enriched";
    else if (eventRaw.includes("lead.converted") || eventRaw.includes("converted"))       eventType = "deal_created";
    else if (eventRaw.includes("opportunity.created") || eventRaw.includes("opp_created")) eventType = "deal_created";
    else if (eventRaw.includes("opportunity.updated") || eventRaw.includes("opp_updated")) eventType = "deal_updated";
    else if (eventRaw.includes("opportunity.won") || eventRaw.includes("closedwon"))       eventType = "deal_won";
    else if (eventRaw.includes("contact.created"))                                          eventType = "lead_imported";
    else if (eventRaw.includes("task.completed"))                                          eventType = "call_completed";

    const email      = rec.Email || rec.email || null;
    const externalId = rec.Id    || rec.id    || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: rec.FirstName || rec.firstName || "Unknown",
          lastName:  rec.LastName  || rec.lastName  || "",
          email,
          company:   rec.Company   || rec.AccountName || rec.company || null,
          title:     rec.Title     || rec.title || null,
        },
        "Salesforce", `salesforce-${externalId}`,
        { sfEvent: eventRaw, stage: rec.StageName || rec.Stage || null, amount: rec.Amount || null },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/salesforce]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Chargebee ────────────────────────────────────────────────────────────────
// Configure in Chargebee → Settings → Configure Chargebee → Webhooks → Add Webhook URL
// Events: subscription_created, subscription_changed, subscription_cancelled,
//         payment_succeeded, payment_failed, invoice_generated
// Payload: { event_type: "subscription_created", content: { subscription: { id, plan_id, status },
//            customer: { id, first_name, last_name, email } } }

router.post("/chargebee", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const payload  = req.body;
    const typeRaw  = (payload.event_type || payload.type || "").toLowerCase();
    const content  = payload.content || {};
    const customer = content.customer || payload.customer || {};
    const sub      = content.subscription || payload.subscription || {};
    const invoice  = content.invoice || payload.invoice || {};

    let eventType: string | null = null;
    if (typeRaw === "subscription_created" || typeRaw === "subscription_reactivated") eventType = "deal_won";
    else if (typeRaw === "subscription_cancelled" || typeRaw === "subscription_deleted") eventType = "deal_lost";
    else if (typeRaw === "subscription_changed")                                          eventType = "deal_updated";
    else if (typeRaw === "payment_succeeded" || typeRaw === "payment_collected")          eventType = "deal_won";
    else if (typeRaw === "payment_failed" || typeRaw === "payment_refunded")              eventType = "deal_updated";
    else if (typeRaw === "invoice_generated" || typeRaw === "invoice_created")            eventType = "deal_updated";

    const email      = customer.email || null;
    const externalId = customer.id || sub.id || invoice.id || email;

    if (eventType && externalId) {
      await recordEvent(
        workspaceId, eventType,
        {
          firstName: customer.first_name || "Unknown",
          lastName:  customer.last_name  || "",
          email,
          company:   customer.company   || null,
        },
        "Chargebee", String(externalId),
        { chargebeeEvent: typeRaw, plan: sub.plan_id || sub.subscription_items?.[0]?.item_price_id, status: sub.status, amount: invoice.total },
      );
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[webhook/chargebee]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── n8n ─────────────────────────────────────────────────────────────────────
// Users add an HTTP Request node at the end of any workflow, POST to this URL.
// Expected payload fields (all optional — we extract what's available):
//   email, linkedin_url, phone, first_name, last_name, full_name, company, title
//   event_type   — iqpipe standard type; auto-detected if missing
//   source_tool  — if set, credit this event to that tool instead of "n8n"
//                  (deduplicates against that tool's direct webhook automatically)
//   workflow_id, execution_id, workflow_name — for meta/tracing
router.post("/n8n", async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const body = req.body ?? {};

    const email      = body.email        || body.Email        || null;
    const linkedin   = body.linkedin_url || body.linkedinUrl  || body.linkedin || null;
    const phone      = body.phone        || body.Phone        || null;
    const firstName  = body.first_name   || body.firstName    || (body.full_name || "").split(" ")[0] || "Unknown";
    const lastName   = body.last_name    || body.lastName     || (body.full_name || "").split(" ").slice(1).join(" ") || "";
    const company    = body.company      || body.Company      || null;
    const title      = body.title        || body.job_title    || body.jobTitle  || null;

    const rawEvent  = body.event_type || body.eventType || body.event || "";
    const eventType = rawEvent || "workflow.completed";

    // source_tool relay: attribute to the underlying tool, not to n8n itself.
    // This deduplicates naturally — if that tool's direct webhook already recorded
    // the same (iqLeadId + tool + eventType) today, this relay is a no-op.
    const recordingTool = (body.source_tool || body.sourceTool || "n8n").toLowerCase().trim();

    const meta: Record<string, any> = {
      workflowId:    body.workflow_id   || body.workflowId   || null,
      executionId:   body.execution_id  || body.executionId  || null,
      workflowName:  body.workflow_name || body.workflowName || null,
      viaAutomation: recordingTool !== "n8n" ? "n8n" : undefined,
    };

    const externalId = meta.executionId || meta.workflowId || `n8n-${Date.now()}`;

    await recordEvent(
      workspaceId, eventType,
      { firstName, lastName, email, linkedin, phone, company, title },
      recordingTool, String(externalId), meta,
    );

    return res.json({ received: true, recordedAs: recordingTool });
  } catch (err: any) {
    console.error("[webhook/n8n]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Make.com ─────────────────────────────────────────────────────────────────
// Users add an HTTP module at the end of any scenario, POST JSON to this URL.
//
// Webhook URL: POST /api/webhooks/make?workspaceId={id}&scenarioId={makeId}
//
// Required in JSON body (at least one contact identifier):
//   email, linkedin_url, phone
//
// Optional body fields:
//   first_name, last_name, full_name, company, title
//   event_type   — iqpipe standard type (email_sent, reply_received, etc.)
//                  falls back to scenario's configured defaultEventType, then "contacted"
//   source_tool  — attribute event to underlying tool instead of "make"
//   scenario_id, execution_id, scenario_name — for tracing/meta
//
// Idempotency: deduplicates on execution_id when present, otherwise on
// hash(scenarioId:contact:eventType:1h-bucket) — safe to retry.
router.post("/make", async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const scenarioIdParam = req.query.scenarioId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const body = req.body ?? {};

    const email      = body.email        || body.Email        || null;
    const linkedin   = body.linkedin_url || body.linkedinUrl  || body.linkedin || null;
    const phone      = body.phone        || body.Phone        || null;
    const firstName  = body.first_name   || body.firstName    || (body.full_name || "").split(" ")[0] || "Unknown";
    const lastName   = body.last_name    || body.lastName     || (body.full_name || "").split(" ").slice(1).join(" ") || "";
    const company    = body.company      || body.Company      || null;
    const title      = body.title        || body.job_title    || body.jobTitle  || null;

    const scenarioId  = body.scenario_id  || body.scenarioId  || scenarioIdParam || null;
    const executionId = body.execution_id || body.executionId || null;

    // Resolve event type: body → scenario default → fallback
    let rawEvent = body.event_type || body.eventType || body.event || "";
    if (!rawEvent && scenarioId) {
      const meta = await (prisma as any).makeScenarioMeta.findUnique({
        where:  { workspaceId_makeId: { workspaceId, makeId: String(scenarioId) } },
        select: { eventFilter: true, execSyncEnabled: true },
      }).catch(() => null);

      if (meta?.execSyncEnabled === false) {
        return res.json({ received: false, reason: "Scenario event capture disabled" });
      }
      if (meta?.eventFilter) {
        try {
          const ef = JSON.parse(meta.eventFilter);
          if (ef.defaultEventType) rawEvent = ef.defaultEventType;
        } catch {}
      }
    }
    const eventType = rawEvent || "contacted";

    // source_tool relay: attribute to the underlying tool, not to make itself
    const recordingTool = (body.source_tool || body.sourceTool || "make").toLowerCase().trim();

    // ── Idempotency dedup ─────────────────────────────────────────────────────
    const contactKey = email || linkedin || phone || "unknown";
    const timeBucket = Math.floor(Date.now() / (60 * 60 * 1000)); // 1-hour buckets
    const rawKey     = executionId
      ? `make:exec:${executionId}`
      : `make:${workspaceId}:${scenarioId ?? "ns"}:${contactKey}:${eventType}:${timeBucket}`;

    const iKey = require("crypto").createHash("sha256").update(rawKey).digest("hex").slice(0, 48);

    const existing = await prisma.idempotencyRecord.findUnique({
      where: { workspaceId_key: { workspaceId, key: iKey } },
      select: { id: true },
    });
    if (existing) {
      return res.json({ received: true, duplicate: true });
    }

    // Store idempotency record
    await prisma.idempotencyRecord.create({
      data: { workspaceId, key: iKey },
    }).catch(() => {});  // ignore race-condition duplicates
    // ─────────────────────────────────────────────────────────────────────────

    const eventMeta: Record<string, any> = {
      scenarioId,
      executionId,
      scenarioName:  body.scenario_name || body.scenarioName || null,
      viaAutomation: recordingTool !== "make" ? "make" : undefined,
    };

    const externalId = executionId || scenarioId || `make-${Date.now()}`;

    await recordEvent(
      workspaceId, eventType,
      { firstName, lastName, email, linkedin, phone, company, title },
      recordingTool, String(externalId), eventMeta,
      { sourceType: "make_scenario" },
    );

    return res.json({ received: true, recordedAs: recordingTool });
  } catch (err: any) {
    console.error("[webhook/make]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── n8n Integration Layer ────────────────────────────────────────────────────
//
// Endpoint:  POST /api/webhooks/n8n
// Auth:      Authorization: Bearer {workspace.publicApiKey}
//
// Accepts events from n8n workflows acting as an event proxy for any tool
// not natively integrated into iqpipe. The endpoint returns 202 Accepted
// immediately and processes the event asynchronously via N8nQueuedEvent.
//
// Payload fields:
//   workspaceId  — optional; if provided must match the auth token's workspace
//   workflowId   — n8n workflow ID or user-defined name (required)
//   stepId       — n8n node/step name (optional, for step-level attribution)
//   sourceApp    — iqpipe tool slug, e.g. "salesflare" (also accepts source_tool)
//   externalId   — tool-native contact or record ID (required)
//   eventType    — iqpipe standard event type (also accepts event_type)
//   contact      — { email?, linkedin_url?, phone?, first_name?, last_name?, company?, title? }
//   meta         — arbitrary key-value pairs (optional)
//   timestamp    — ISO 8601 (optional; used for time-bucketed idempotency)
//
// Idempotency key: sha256(sourceApp:externalId:eventType:timeBucket)
//   timeBucket = floor(timestamp / 5min) — prevents duplicate retries within
//   a 5-minute window while allowing the same event type to re-fire legitimately.
//
// Error codes returned to n8n:
//   202  queued (or duplicate)          → treat as success
//   400  validation failure             → do NOT retry (permanent)
//   401  invalid API key               → do NOT retry until key is fixed
//   500  queue write failure            → RETRY with backoff

import crypto from "crypto";

const N8N_STANDARD_EVENT_TYPES = new Set([
  "lead_imported", "lead_enriched", "sequence_started", "sequence_ended",
  "email_sent", "email_opened", "email_clicked", "email_bounced",
  "reply_received", "connection_request_sent", "connection_accepted",
  "message_sent", "call_initiated", "call_completed", "voicemail_left",
  "sms_sent", "sms_received", "meeting_booked", "deal_created",
  "deal_updated", "deal_won", "deal_lost", "subscription_created",
  "subscription_updated", "payment_succeeded", "contact_updated",
  "intent_signal", "custom_event", "profile_viewed", "inmail_sent",
  "follow_sent", "liked_post", "campaign_completed",
]);

const TIME_BUCKET_MS = 5 * 60 * 1000; // 5-minute idempotency window

function computeIdempotencyKey(
  sourceApp: string,
  externalId: string,
  eventType: string,
  timestamp?: string,
): string {
  const ts          = timestamp ? new Date(timestamp).getTime() : Date.now();
  const timeBucket  = Math.floor(ts / TIME_BUCKET_MS);
  const raw         = `${sourceApp.toLowerCase()}:${externalId}:${eventType}:${timeBucket}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// Write a failed delivery to the dead-letter queue without throwing
async function logWebhookError(
  workspaceId: string,
  source: string,
  payload: unknown,
  errorCode: string,
  errorDetail: string,
): Promise<void> {
  try {
    await prisma.webhookError.create({
      data: {
        workspaceId,
        source,
        payload:     JSON.stringify(payload).slice(0, 10_000),
        errorCode,
        errorDetail: errorDetail.slice(0, 1_000),
      },
    });
  } catch { /* never let error logging block the response */ }
}

router.post("/n8n", async (req: Request, res: Response) => {
  // ── 1. Authentication ────────────────────────────────────────────────────
  const authHeader = (req.headers.authorization || "").trim();
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({
      error: "Authorization: Bearer <workspace_api_key> header required",
    });
  }

  const workspace = await prisma.workspace.findFirst({
    where:  { publicApiKey: token },
    select: { id: true },
  });

  if (!workspace) {
    await logWebhookError("unknown", "n8n", req.body, "AUTH_FAILED", "Invalid API key");
    return res.status(401).json({ error: "Invalid API key" });
  }

  const workspaceId = workspace.id;
  const body        = req.body ?? {};

  // Optional cross-check: if workspaceId is in body it must match token's workspace
  if (body.workspaceId && body.workspaceId !== workspaceId) {
    const error = "workspaceId in body does not match the authenticated workspace";
    await logWebhookError(workspaceId, "n8n", body, "SCHEMA_INVALID", error);
    return res.status(400).json({ error });
  }

  // ── 2. Field normalisation (accept both naming conventions) ─────────────
  const workflowId = body.workflowId || body.workflow_id || null;
  const stepId     = body.stepId     || body.step_id     || null;
  const sourceApp  = (body.sourceApp || body.source_app || body.source_tool || "").trim();
  const externalId = (body.externalId || body.external_id || "").trim();
  const eventType  = (body.eventType  || body.event_type  || "").trim();
  const contact    = body.contact     || {};
  const meta       = body.meta        || {};
  const timestamp  = body.timestamp   || body.occurred_at || null;

  // ── 3. Validation ────────────────────────────────────────────────────────
  if (!workflowId) {
    const error = "workflowId is required (the n8n workflow ID or a user-defined name)";
    await logWebhookError(workspaceId, "n8n", body, "SCHEMA_INVALID", error);
    return res.status(400).json({ error });
  }

  if (!sourceApp) {
    const error = "sourceApp is required (the iqpipe tool slug, e.g. \"salesflare\")";
    await logWebhookError(workspaceId, "n8n", body, "SCHEMA_INVALID", error);
    return res.status(400).json({ error });
  }

  if (!externalId) {
    const error = "externalId is required (the tool-native contact or record ID)";
    await logWebhookError(workspaceId, "n8n", body, "SCHEMA_INVALID", error);
    return res.status(400).json({ error });
  }

  if (!eventType || !N8N_STANDARD_EVENT_TYPES.has(eventType)) {
    const error = `Unknown eventType: "${eventType}". Must be a standard iqpipe event type or "custom_event".`;
    await logWebhookError(workspaceId, "n8n", body, "SCHEMA_INVALID", error);
    return res.status(400).json({ error });
  }

  if (!contact || typeof contact !== "object") {
    const error = "contact object is required";
    await logWebhookError(workspaceId, "n8n", body, "CONTACT_MISSING", error);
    return res.status(400).json({ error });
  }

  if (!contact.email && !contact.linkedin_url && !contact.phone) {
    const error = "contact must include at least one of: email, linkedin_url, phone";
    await logWebhookError(workspaceId, "n8n", body, "CONTACT_MISSING", error);
    return res.status(400).json({ error });
  }

  // ── 3b. Classify event at ingestion time ─────────────────────────────────
  const OUTCOME_TYPES = new Set([
    "reply_received", "positive_reply", "negative_reply", "neutral_reply",
    "ooo_reply", "interested_reply", "meeting_booked", "demo_completed",
    "deal_created", "deal_won", "deal_lost", "proposal_sent", "contract_signed",
    "payment_received", "payment_failed", "subscription_created", "subscription_renewed",
    "subscription_cancelled", "trial_started", "trial_converted", "trial_expired",
    "churn_detected",
  ]);
  const cleanEventType = eventType;
  const eventClass = OUTCOME_TYPES.has(cleanEventType) ? "outcome" : "process";

  // ── 4. Idempotency key ───────────────────────────────────────────────────
  const idempotencyKey = computeIdempotencyKey(sourceApp, externalId, eventType, timestamp ?? undefined);

  // ── 5. Enqueue (upsert so concurrent deliveries of the same event are safe) ─
  try {
    const existing = await prisma.n8nQueuedEvent.findUnique({
      where:  { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
      select: { id: true, status: true },
    });

    if (existing) {
      // Already queued or processed — acknowledge immediately
      return res.status(202).json({
        status:          existing.status === "done" ? "duplicate" : "queued",
        skipped:         true,
        idempotencyKey,
      });
    }

    await prisma.n8nQueuedEvent.create({
      data: {
        workspaceId,
        workflowId,
        stepId:        stepId || null,
        sourceApp:     sourceApp.toLowerCase(),
        externalId,
        eventType,
        contact:       JSON.stringify(contact),
        meta:          Object.keys(meta).length ? JSON.stringify(meta) : null,
        idempotencyKey,
        eventClass,
        sourceType:    "n8n_workflow",
        sourcePriority: 3,
      },
    });

    return res.status(202).json({
      status:          "queued",
      idempotencyKey,
      workflowId,
      stepId:          stepId || null,
      sourceApp:       sourceApp.toLowerCase(),
      eventType,
      message:         "Event queued for async processing",
    });
  } catch (err: any) {
    // Unique constraint = concurrent duplicate
    if (err.code === "P2002") {
      return res.status(202).json({ status: "duplicate", skipped: true, idempotencyKey });
    }
    console.error("[webhook/n8n] queue write error:", err.message);
    await logWebhookError(workspaceId, "n8n", body, "INTERNAL_ERROR", err.message);
    return res.status(500).json({ error: "Queue write failed — will retry" });
  }
});

// ── GET /api/webhooks/n8n/errors ──────────────────────────────────────────────

router.get("/n8n/errors", async (req: Request, res: Response) => {
  const header = (req.headers.authorization || "").trim();
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Authorization header required" });

  const workspace = await prisma.workspace.findFirst({
    where:  { publicApiKey: token },
    select: { id: true },
  });
  if (!workspace) return res.status(401).json({ error: "Invalid API key" });

  const errors = await prisma.webhookError.findMany({
    where:   { workspaceId: workspace.id, resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take:    100,
    select: {
      id: true, source: true, errorCode: true, errorDetail: true,
      retryCount: true, createdAt: true, payload: true,
    },
  });

  return res.json(errors);
});

// ── POST /api/webhooks/n8n/errors/:id/retry ───────────────────────────────────

router.post("/n8n/errors/:id/retry", async (req: Request, res: Response) => {
  const header = (req.headers.authorization || "").trim();
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Authorization header required" });

  const workspace = await prisma.workspace.findFirst({
    where:  { publicApiKey: token },
    select: { id: true },
  });
  if (!workspace) return res.status(401).json({ error: "Invalid API key" });

  const record = await prisma.webhookError.findFirst({
    where: { id: req.params.id, workspaceId: workspace.id },
  });
  if (!record) return res.status(404).json({ error: "Error record not found" });

  // Find the corresponding queued event and reset it to pending
  let payload: Record<string, any>;
  try { payload = JSON.parse(record.payload); } catch {
    return res.status(400).json({ error: "Stored payload is not valid JSON" });
  }

  // Reset failed queue event if it exists
  const queueEvent = await prisma.n8nQueuedEvent.findFirst({
    where: { workspaceId: workspace.id, workflowId: payload.workflowId ?? "" },
  });
  if (queueEvent && queueEvent.status === "failed") {
    await prisma.n8nQueuedEvent.update({
      where: { id: queueEvent.id },
      data:  { status: "pending", attempts: 0, lastError: null, nextRetryAt: null },
    });
  }

  await prisma.webhookError.update({
    where: { id: record.id },
    data:  { retryCount: { increment: 1 } },
  });

  return res.json({ status: "requeued", queueEventId: queueEvent?.id ?? null });
});

// ── POST /api/webhooks/generic ────────────────────────────────────────────────
// Generic inbound webhook for apps not in the catalog.
// Query params: workspaceId (required), app (app slug), eventType (optional)
// Payload: any JSON object containing email / linkedin_url / phone

router.post("/generic", async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || "";
  const rawApp      = (req.query.app      as string) || "unknown";
  const eventType   = (req.query.eventType as string) || "event";

  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" }) as any;

  const appSlug = rawApp.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");

  const body    = req.body ?? {};
  const email    = (body.email ?? body.emailAddress ?? body.customer?.email ?? null) as string | null;
  const linkedin = (body.linkedin_url ?? body.linkedin ?? null) as string | null;
  const phone    = (body.phone ?? body.phone_number ?? null) as string | null;

  // Need at least one contact anchor
  if (!email && !linkedin && !phone) {
    return res.json({ ok: true, skipped: "no contact identifier found" });
  }

  const externalId = (email ?? linkedin ?? phone ?? `${Date.now()}`).slice(0, 200);
  const timeBucket = Math.floor(Date.now() / 300_000);
  const iKey = createHash("sha256")
    .update(`${appSlug}:${externalId}:${eventType}:${timeBucket}`)
    .digest("hex");

  await prisma.n8nQueuedEvent.upsert({
    where:  { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: iKey } },
    create: {
      workspaceId,
      workflowId:     "generic_webhook",
      sourceApp:      appSlug,
      externalId,
      eventType,
      contact: JSON.stringify({
        email:        email,
        linkedin_url: linkedin,
        phone:        phone,
        first_name:   (body.first_name ?? body.firstName ?? null) as string | null,
        last_name:    (body.last_name  ?? body.lastName  ?? null) as string | null,
        company:      (body.company    ?? null) as string | null,
        title:        (body.title      ?? body.job_title ?? null) as string | null,
      }),
      idempotencyKey: iKey,
      sourceType:     "webhook",
      sourcePriority: 2,
    },
    update: {},
  });

  return res.json({ ok: true });
});

export default router;
