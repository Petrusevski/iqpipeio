/**
 * workflowMirror.ts
 *
 * Workflow Mirror — per-automation app connection and event observation config.
 *
 * Routes:
 *   GET  /api/workflow-mirror/app-catalog                                  — full app catalog
 *   GET  /api/workflow-mirror?workspaceId=&workflowId=&platform=           — get mirror config
 *   POST /api/workflow-mirror                                              — upsert mirror
 *   POST /api/workflow-mirror/:mirrorId/connections                        — add app connection
 *   DELETE /api/workflow-mirror/:mirrorId/connections/:connectionId        — remove app connection
 *   PUT  /api/workflow-mirror/:mirrorId/connections/:connectionId/events   — set observed events
 *   GET  /api/workflow-mirror/:mirrorId/correlation                        — recent correlation results
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { encrypt } from "../utils/encryption";
import { CANONICAL_EVENTS, normalizeEventType } from "../utils/eventTaxonomy";

const router = Router();

// ── App catalog ───────────────────────────────────────────────────────────────
// Single source of truth for app metadata, connection types, and available events.
// "connectionType" determines what credential the UI will ask for.

export const APP_CATALOG: Record<string, {
  label:          string;
  domain:         string;
  connectionType: "webhook" | "polling" | "both";
  // Simplified, outcome-oriented event labels mapped to the technical event key
  events: { key: string; label: string; category: string }[];
}> = {
  hubspot: {
    label: "HubSpot", domain: "hubspot.com", connectionType: "webhook",
    events: [
      { key: "contact.creation",       label: "Contact created",         category: "contact" },
      { key: "contact.propertyChange", label: "Contact property changed",category: "contact" },
      { key: "deal.creation",          label: "Deal created",            category: "deal"    },
      { key: "deal.propertyChange",    label: "Deal moved stage",        category: "deal"    },
      { key: "deal.deletion",          label: "Deal deleted",            category: "deal"    },
      { key: "company.creation",       label: "Company created",         category: "company" },
    ],
  },
  salesforce: {
    label: "Salesforce", domain: "salesforce.com", connectionType: "webhook",
    events: [
      { key: "lead.created",               label: "Lead created",             category: "lead"        },
      { key: "opportunity.created",        label: "Opportunity created",      category: "deal"        },
      { key: "opportunity.stageChanged",   label: "Opportunity stage changed",category: "deal"        },
      { key: "opportunity.closed",         label: "Opportunity closed",       category: "deal"        },
      { key: "contact.created",            label: "Contact created",          category: "contact"     },
    ],
  },
  pipedrive: {
    label: "Pipedrive", domain: "pipedrive.com", connectionType: "webhook",
    events: [
      { key: "deal.added",       label: "Deal created",     category: "deal"     },
      { key: "deal.updated",     label: "Deal updated",     category: "deal"     },
      { key: "deal.won",         label: "Deal won",         category: "deal"     },
      { key: "deal.lost",        label: "Deal lost",        category: "deal"     },
      { key: "person.added",     label: "Contact created",  category: "contact"  },
      { key: "activity.added",   label: "Activity logged",  category: "activity" },
    ],
  },
  attio: {
    label: "Attio", domain: "attio.com", connectionType: "webhook",
    events: [
      { key: "record.created",  label: "Record created",  category: "contact" },
      { key: "record.updated",  label: "Record updated",  category: "contact" },
      { key: "note.created",    label: "Note added",      category: "activity"},
    ],
  },
  instantly: {
    label: "Instantly", domain: "instantly.ai", connectionType: "webhook",
    events: [
      { key: "email_sent",       label: "Email sent",       category: "email" },
      { key: "email_opened",     label: "Email opened",     category: "email" },
      { key: "reply_received",   label: "Reply received",   category: "email" },
      { key: "meeting_booked",   label: "Meeting booked",   category: "email" },
      { key: "email_bounced",    label: "Email bounced",    category: "email" },
      { key: "unsubscribed",     label: "Unsubscribed",     category: "email" },
    ],
  },
  lemlist: {
    label: "Lemlist", domain: "lemlist.com", connectionType: "webhook",
    events: [
      { key: "emailSent",       label: "Email sent",      category: "email" },
      { key: "emailOpened",     label: "Email opened",    category: "email" },
      { key: "replyReceived",   label: "Reply received",  category: "email" },
      { key: "emailBounced",    label: "Email bounced",   category: "email" },
      { key: "unsubscribed",    label: "Unsubscribed",    category: "email" },
    ],
  },
  smartlead: {
    label: "Smartlead", domain: "smartlead.ai", connectionType: "webhook",
    events: [
      { key: "email_sent",     label: "Email sent",     category: "email" },
      { key: "reply_received", label: "Reply received", category: "email" },
      { key: "email_opened",   label: "Email opened",   category: "email" },
    ],
  },
  heyreach: {
    label: "HeyReach", domain: "heyreach.io", connectionType: "webhook",
    events: [
      { key: "connection_request_sent", label: "Connection request sent", category: "linkedin" },
      { key: "connection_accepted",     label: "Connection accepted",     category: "linkedin" },
      { key: "message_sent",            label: "Message sent",            category: "linkedin" },
      { key: "reply_received",          label: "Reply received",          category: "linkedin" },
    ],
  },
  apollo: {
    label: "Apollo", domain: "apollo.io", connectionType: "polling",
    events: [
      { key: "contact_created", label: "Contact added",  category: "contact" },
      { key: "email_sent",      label: "Email sent",     category: "email"   },
      { key: "reply_received",  label: "Reply received", category: "email"   },
    ],
  },
  clay: {
    label: "Clay", domain: "clay.com", connectionType: "polling",
    events: [
      { key: "enrichment_complete", label: "Enrichment complete", category: "enrichment" },
      { key: "row_added",           label: "Row added to table",  category: "data"       },
    ],
  },
  stripe: {
    label: "Stripe", domain: "stripe.com", connectionType: "webhook",
    events: [
      { key: "customer.created",              label: "Customer created",       category: "billing" },
      { key: "invoice.paid",                  label: "Invoice paid",           category: "billing" },
      { key: "customer.subscription.created", label: "Subscription created",   category: "billing" },
      { key: "customer.subscription.deleted", label: "Subscription cancelled", category: "billing" },
      { key: "charge.failed",                 label: "Charge failed",          category: "billing" },
    ],
  },
  calendly: {
    label: "Calendly", domain: "calendly.com", connectionType: "webhook",
    events: [
      { key: "invitee.created",  label: "Meeting booked",    category: "scheduling" },
      { key: "invitee.canceled", label: "Meeting cancelled", category: "scheduling" },
    ],
  },
  slack: {
    label: "Slack", domain: "slack.com", connectionType: "webhook",
    events: [
      { key: "message",         label: "Message sent",    category: "comms" },
      { key: "channel_created", label: "Channel created", category: "comms" },
    ],
  },
};

// ── GET /api/workflow-mirror/app-catalog ──────────────────────────────────────

router.get("/app-catalog", (_req: Request, res: Response) => {
  return res.json(APP_CATALOG);
});

// ── GET /api/workflow-mirror/event-taxonomy ───────────────────────────────────
// Returns the full canonical event schema (key → label, category, funnelPos).
// Frontend uses this to display human-readable labels and to order funnel stages.

router.get("/event-taxonomy", (_req: Request, res: Response) => {
  return res.json(CANONICAL_EVENTS);
});

// ── GET /api/workflow-mirror/normalize-event ──────────────────────────────────
// Utility: resolve a raw event string to its canonical key.
// ?raw=received_reply → { canonical: "reply_received", label: "Reply Received", ... }

router.get("/normalize-event", (req: Request, res: Response) => {
  const raw = (req.query.raw as string) || "";
  const canonical = normalizeEventType(raw);
  const meta = CANONICAL_EVENTS[canonical as keyof typeof CANONICAL_EVENTS];
  return res.json({ canonical, ...(meta ?? {}) });
});

// ── GET /api/workflow-mirror ──────────────────────────────────────────────────
// Returns mirror config + app connections for one automation.

router.get("/", async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const workflowId  = req.query.workflowId  as string;
  if (!workspaceId || !workflowId) {
    return res.status(400).json({ error: "workspaceId and workflowId required" }) as any;
  }

  const mirror = await prisma.workflowMirror.findUnique({
    where:   { workspaceId_workflowId: { workspaceId, workflowId } },
    include: {
      appConnections: {
        include: { observedEvents: true },
        orderBy: { appKey: "asc" },
      },
    },
  });

  return res.json(mirror ?? null);
});

// ── POST /api/workflow-mirror ─────────────────────────────────────────────────
// Upsert mirror (correlationKey + unknownMappings).

router.post("/", async (req: Request, res: Response) => {
  const { workspaceId, workflowId, platform, correlationKey, unknownMappings } =
    req.body as {
      workspaceId: string; workflowId: string; platform: string;
      correlationKey?: string; unknownMappings?: Record<string, string>;
    };

  if (!workspaceId || !workflowId || !platform) {
    return res.status(400).json({ error: "workspaceId, workflowId and platform required" }) as any;
  }

  const mirror = await prisma.workflowMirror.upsert({
    where:  { workspaceId_workflowId: { workspaceId, workflowId } },
    create: {
      workspaceId, workflowId, platform,
      correlationKey:  correlationKey  ?? null,
      unknownMappings: JSON.stringify(unknownMappings ?? {}),
    },
    update: {
      correlationKey:  correlationKey  ?? null,
      unknownMappings: JSON.stringify(unknownMappings ?? {}),
    },
  });

  return res.json(mirror);
});

// ── POST /api/workflow-mirror/:mirrorId/connections ───────────────────────────
// Add or update an app connection for this mirror.

router.post("/:mirrorId/connections", async (req: Request, res: Response) => {
  const { mirrorId } = req.params;
  const { workspaceId, appKey, connectionType, credential, webhookSecret } =
    req.body as {
      workspaceId: string; appKey: string; connectionType: "webhook" | "polling";
      credential?: string; webhookSecret?: string;
    };

  if (!workspaceId || !appKey || !connectionType) {
    return res.status(400).json({ error: "workspaceId, appKey and connectionType required" }) as any;
  }

  const credentialEnc = credential ? encrypt(credential) : undefined;

  const conn = await prisma.workflowAppConnection.upsert({
    where:  { mirrorId_appKey: { mirrorId, appKey } },
    create: {
      workspaceId, mirrorId, appKey, connectionType,
      credentialEnc: credentialEnc ?? null,
      webhookSecret: webhookSecret ?? null,
      status: "connected",
    },
    update: {
      credentialEnc: credentialEnc ?? undefined,
      webhookSecret: webhookSecret ?? undefined,
      status: "connected",
      errorMessage: null,
    },
    include: { observedEvents: true },
  });

  return res.json(conn);
});

// ── DELETE /api/workflow-mirror/:mirrorId/connections/:connectionId ───────────

router.delete("/:mirrorId/connections/:connectionId", async (req: Request, res: Response) => {
  const { connectionId } = req.params;
  await prisma.workflowAppConnection.delete({ where: { id: connectionId } });
  return res.json({ ok: true });
});

// ── PUT /api/workflow-mirror/:mirrorId/connections/:connectionId/events ───────
// Replace the full set of observed events for this connection.

router.put("/:mirrorId/connections/:connectionId/events", async (req: Request, res: Response) => {
  const { connectionId } = req.params;
  const { events } = req.body as {
    events: { key: string; label: string; appKey: string }[];
  };

  // Delete existing, insert new
  await prisma.observedEvent.deleteMany({ where: { connectionId } });

  if (events.length > 0) {
    await prisma.observedEvent.createMany({
      data: events.map(e => ({
        connectionId,
        appKey:   e.appKey,
        eventKey: e.key,
        label:    e.label,
      })),
    });
  }

  const updated = await prisma.workflowAppConnection.findUnique({
    where:   { id: connectionId },
    include: { observedEvents: true },
  });

  return res.json(updated);
});

// ── GET /api/workflow-mirror/:mirrorId/correlation ────────────────────────────
// Returns the 50 most recent correlation results for this mirror.

router.get("/:mirrorId/correlation", async (req: Request, res: Response) => {
  const { mirrorId } = req.params;

  const results = await prisma.correlationResult.findMany({
    where:   { mirrorId },
    orderBy: { matchedAt: "desc" },
    take:    50,
    include: {
      appEvent: {
        select: { appKey: true, eventKey: true, receivedAt: true, correlationValue: true },
      },
    },
  });

  return res.json(results);
});

export default router;
