/**
 * syncService.ts
 *
 * Shared logic for polling each connected GTM tool's API and writing
 * new events (Lead + Activity records) into the database.
 *
 * Called by:
 *  - syncPoller.ts  — automated background loop (every POLL_INTERVAL_MS)
 *  - integrations.ts /:provider/sync route — manual "Sync contacts" button
 */

import axios from "axios";
import Stripe from "stripe";
import { prisma } from "../db";
import { decrypt, encrypt } from "../utils/encryption";
import { createNotification } from "./notificationService";
import { updateLeadScoreForEvent } from "../utils/icpUtils";
import { resolveIqLead, recordTouchpoint } from "../utils/identity";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

type AuthData = { apiKey?: string; accessToken?: string; lastSyncAt?: string; [k: string]: any };

function parseAuth(raw?: string | null): AuthData | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)); } catch { return null; }
}

// ─── Apollo ───────────────────────────────────────────────────────────────────

export async function syncApollo(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "apollo", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const lastSyncAt: Date | null = auth.lastSyncAt ? new Date(auth.lastSyncAt) : null;
  let page = 1;
  let imported = 0;
  let keepPaging = true;

  try {
    while (keepPaging) {
      const resp = await axios.post(
        "https://api.apollo.io/api/v1/contacts/search",
        { per_page: 25, page, sort_by_field: "contact_updated_at", sort_ascending: false },
        { headers: { "X-Api-Key": auth.apiKey.trim(), "Content-Type": "application/json" } }
      );

      const contacts: any[] = resp.data?.contacts ?? [];
      const totalPages: number = resp.data?.pagination?.total_pages ?? 1;

      if (contacts.length === 0) break;

      for (const c of contacts) {
        const updatedAt = new Date(c.updated_at || c.created_at);
        if (lastSyncAt && updatedAt <= lastSyncAt) { keepPaging = false; break; }

        const firstName = c.first_name || "Unknown";
        const lastName  = c.last_name  || "";
        const email     = c.email      || null;
        const contactId = `apollo-${c.id}`;

        await prisma.contact.upsert({
          where: { id: contactId },
          update: { firstName, lastName, email: email ?? undefined, jobTitle: c.title ?? undefined, linkedinUrl: c.linkedin_url ?? undefined },
          create: { id: contactId, workspaceId, firstName, lastName, email, jobTitle: c.title || null, linkedinUrl: c.linkedin_url || null, status: "active" },
        });

        // Always resolve identity + record touchpoint for every contact seen —
        // recordTouchpoint deduplicates all-time for lead_imported, so re-syncing
        // the same contact is a safe no-op.
        const iqLeadId = await resolveIqLead(
          workspaceId,
          { email, linkedin: c.linkedin_url || null },
          { firstName, lastName, company: c.organization_name || null, title: c.title || null },
        );
        await recordTouchpoint(workspaceId, iqLeadId, "apollo", "lead_imported", {
          company: c.organization_name, title: c.title, via: "sync",
        }, null, null, "direct_api", 1);

        const existingLead = await prisma.lead.findFirst({ where: { contactId } });
        if (!existingLead) {
          let leadScore = 20;
          if (email) leadScore += 20;
          if (c.title) leadScore += 10;
          if (c.organization_name) leadScore += 10;
          if (c.linkedin_url) leadScore += 15;
          if (c.phone_numbers?.length > 0) leadScore += 10;
          const seniority = (c.seniority || "").toLowerCase();
          if (["c_suite", "owner", "founder", "partner"].some(s => seniority.includes(s))) leadScore += 15;
          else if (["vp", "vice president", "director"].some(s => seniority.includes(s))) leadScore += 10;
          else if (["manager", "head"].some(s => seniority.includes(s))) leadScore += 5;

          const lead = await prisma.lead.create({
            data: {
              workspaceId,
              contactId,
              email: email ?? "",
              fullName: `${firstName} ${lastName}`.trim(),
              firstName,
              lastName,
              company: c.organization_name || null,
              title: c.title || null,
              linkedin: c.linkedin_url || null,
              source: "Apollo",
              status: "new",
              leadScore: Math.min(leadScore, 95),
            },
          });

          await prisma.activity.create({
            data: {
              workspaceId,
              type: "lead_imported",
              subject: `${firstName} ${lastName}`.trim() || "Unknown",
              body: JSON.stringify({ company: c.organization_name, title: c.title, email, source: "Apollo" }),
              status: "completed",
              leadId: lead.id,
            },
          });

          imported++;
        }
      }

      if (page >= totalPages) break;
      page++;
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });

    if (imported > 0) {
      await createNotification({
        workspaceId,
        type: "apollo_sync",
        title: `Apollo synced ${imported} new contact${imported !== 1 ? "s" : ""}`,
        body: `${imported} new lead${imported !== 1 ? "s" : ""} from Apollo have been imported and are now visible in the Signal Center.`,
        severity: "info",
      });
    }
  } catch (err: any) {
    console.error(`[syncService] Apollo sync error for workspace ${workspaceId}:`, err.response?.data?.message || err.message);
  }

  return { imported };
}

// ─── HeyReach ────────────────────────────────────────────────────────────────

export async function syncHeyReach(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "heyreach", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const headers = { "X-API-KEY": auth.apiKey.trim(), "Content-Type": "application/json" };
  let imported = 0;

  try {
    const campRes = await axios.post(
      "https://api.heyreach.io/api/public/campaign/GetAll",
      { offset: 0, limit: 50 },
      { headers }
    );
    const campaigns: any[] = campRes.data?.items ?? campRes.data?.payload ?? [];

    for (const camp of campaigns) {
      let offset = 0;
      while (true) {
        const leadsRes = await axios.post(
          "https://api.heyreach.io/api/public/lead/GetAll",
          { campaignId: camp.id, offset, limit: 50 },
          { headers }
        );
        const leads: any[] = leadsRes.data?.items ?? [];
        if (!leads.length) break;

        for (const l of leads) {
          const status = (l.status || "").toUpperCase();
          let eventType: string | null = null;
          if (["REPLIED", "CONVERSATION_REPLIED", "POSITIVE_REPLY"].includes(status)) eventType = "reply_received";
          else if (["MEETING_BOOKED", "MEETING_REQUESTED"].includes(status)) eventType = "meeting_booked";
          else if (["CONNECTED", "ACCEPTED"].includes(status)) eventType = "sequence_started";
          else continue;

          const contactId = `heyreach-${l.id}`;
          const firstName = l.firstName || l.first_name || "Unknown";
          const lastName  = l.lastName  || l.last_name  || "";
          const email     = l.email || null;

          await prisma.contact.upsert({
            where: { id: contactId },
            update: { firstName, lastName, email: email ?? undefined, linkedinUrl: l.linkedInUrl ?? undefined },
            create: { id: contactId, workspaceId, firstName, lastName, email, linkedinUrl: l.linkedInUrl || null, status: "active" },
          });

          let dbLead = await prisma.lead.findFirst({ where: { contactId } });
          if (!dbLead) {
            dbLead = await prisma.lead.create({
              data: {
                workspaceId, contactId, email: email ?? "",
                fullName: `${firstName} ${lastName}`.trim(), firstName, lastName,
                company: l.company || null, title: l.position || null,
                linkedin: l.linkedInUrl || null, source: "HeyReach", status: "new",
              },
            });
          }

          // Always resolve identity + record touchpoint — dedup handles re-runs
          const iqLeadId = await resolveIqLead(
            workspaceId,
            { email, linkedin: l.linkedInUrl || null },
            { firstName, lastName, company: l.company || null, title: l.position || null },
          );
          await recordTouchpoint(workspaceId, iqLeadId, "heyreach", eventType, {
            campaign: camp.name, via: "sync",
          }, null, null, "direct_api", 1);

          const existingAct = await prisma.activity.findFirst({
            where: { workspaceId, leadId: dbLead.id, type: eventType },
          });
          if (!existingAct) {
            await prisma.activity.create({
              data: {
                workspaceId, type: eventType,
                subject: `${firstName} ${lastName}`.trim() || "Unknown",
                body: JSON.stringify({ campaign: camp.name, status, source: "HeyReach" }),
                status: "completed", leadId: dbLead.id,
              },
            });
            await updateLeadScoreForEvent(dbLead.id, eventType);
            imported++;
          }
        }

        if (leads.length < 50) break;
        offset += 50;
      }
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });
  } catch (err: any) {
    console.error(`[syncService] HeyReach sync error for workspace ${workspaceId}:`, err.response?.data?.message || err.message);
  }

  return { imported };
}

// ─── Lemlist ─────────────────────────────────────────────────────────────────

export async function syncLemlist(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "lemlist", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const axiosAuth = { username: "", password: auth.apiKey.trim() };
  let imported = 0;

  try {
    const campRes = await axios.get("https://api.lemlist.com/api/campaigns", { auth: axiosAuth });
    const campaigns: any[] = campRes.data ?? [];

    for (const camp of campaigns) {
      try {
        const leadsRes = await axios.get(
          `https://api.lemlist.com/api/campaigns/${camp._id}/leads`,
          { auth: axiosAuth, params: { limit: 100 } }
        );
        const leads: any[] = Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data?.leads ?? []);

        for (const l of leads) {
          let eventType: string | null = null;
          if (l.hasReplied || l.isInterested) eventType = "reply_received";
          else if (l.isMeetingBooked) eventType = "meeting_booked";
          else if (l.isContacted) eventType = "sequence_started";
          else continue;

          const email     = l.email || null;
          const firstName = l.firstName || "Unknown";
          const lastName  = l.lastName  || "";
          const contactId = `lemlist-${l._id || email}`;

          await prisma.contact.upsert({
            where: { id: contactId },
            update: { firstName, lastName, email: email ?? undefined },
            create: { id: contactId, workspaceId, firstName, lastName, email, status: "active" },
          });

          let dbLead = await prisma.lead.findFirst({ where: { contactId } });
          if (!dbLead) {
            dbLead = await prisma.lead.create({
              data: {
                workspaceId, contactId, email: email ?? "",
                fullName: `${firstName} ${lastName}`.trim(), firstName, lastName,
                company: l.companyName || null, source: "Lemlist", status: "new",
              },
            });
          }

          // Always resolve identity + record touchpoint — dedup handles re-runs
          const iqLeadId = await resolveIqLead(
            workspaceId,
            { email },
            { firstName, lastName, company: l.companyName || null },
          );
          await recordTouchpoint(workspaceId, iqLeadId, "lemlist", eventType, {
            campaign: camp.name, via: "sync",
          }, null, null, "direct_api", 1);

          const existingAct = await prisma.activity.findFirst({
            where: { workspaceId, leadId: dbLead.id, type: eventType },
          });
          if (!existingAct) {
            await prisma.activity.create({
              data: {
                workspaceId, type: eventType,
                subject: `${firstName} ${lastName}`.trim() || email || "Unknown",
                body: JSON.stringify({ campaign: camp.name, source: "Lemlist" }),
                status: "completed", leadId: dbLead.id,
              },
            });
            await updateLeadScoreForEvent(dbLead.id, eventType);
            imported++;
          }
        }
      } catch { /* skip individual campaign errors */ }
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });
  } catch (err: any) {
    console.error(`[syncService] Lemlist sync error for workspace ${workspaceId}:`, err.response?.data?.message || err.message);
  }

  return { imported };
}

// ─── Instantly ───────────────────────────────────────────────────────────────

export async function syncInstantly(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "instantly", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const apiKey = auth.apiKey.trim();
  let imported = 0;

  try {
    const campRes = await axios.get("https://api.instantly.ai/api/v1/campaign/list", {
      params: { api_key: apiKey, limit: 100, skip: 0 },
    });
    const campaigns: any[] = campRes.data?.campaigns ?? campRes.data ?? [];

    for (const camp of campaigns) {
      try {
        const leadsRes = await axios.get("https://api.instantly.ai/api/v1/lead/list", {
          params: { api_key: apiKey, campaign_id: camp.id, limit: 100, skip: 0 },
        });
        const leads: any[] = leadsRes.data?.leads ?? leadsRes.data ?? [];

        for (const l of leads) {
          const ltStage = (l.lt_stage || "").toUpperCase();
          let eventType: string | null = null;
          if (ltStage === "REPLIED" || (l.replied_count ?? 0) > 0) eventType = "reply_received";
          else if (ltStage === "COMPLETED" || l.is_completed) eventType = "sequence_ended";
          else if (l.is_contacted || ltStage === "ACTIVE") eventType = "sequence_started";
          else continue;

          const email     = l.email || null;
          const firstName = l.first_name || l.firstName || "Unknown";
          const lastName  = l.last_name  || l.lastName  || "";
          const contactId = `instantly-${l.id || email}`;

          await prisma.contact.upsert({
            where: { id: contactId },
            update: { firstName, lastName, email: email ?? undefined },
            create: { id: contactId, workspaceId, firstName, lastName, email, status: "active" },
          });

          let dbLead = await prisma.lead.findFirst({ where: { contactId } });
          if (!dbLead) {
            dbLead = await prisma.lead.create({
              data: {
                workspaceId, contactId, email: email ?? "",
                fullName: `${firstName} ${lastName}`.trim(), firstName, lastName,
                company: l.company_name || l.companyName || null,
                source: "Instantly", status: "new",
              },
            });
          }

          // Always resolve identity + record touchpoint — dedup handles re-runs
          const iqLeadId = await resolveIqLead(
            workspaceId,
            { email },
            { firstName, lastName, company: l.company_name || l.companyName || null },
          );
          await recordTouchpoint(workspaceId, iqLeadId, "instantly", eventType, {
            campaign: camp.name, via: "sync",
          }, null, null, "direct_api", 1);

          const existingAct = await prisma.activity.findFirst({
            where: { workspaceId, leadId: dbLead.id, type: eventType },
          });
          if (!existingAct) {
            await prisma.activity.create({
              data: {
                workspaceId, type: eventType,
                subject: `${firstName} ${lastName}`.trim() || email || "Unknown",
                body: JSON.stringify({ campaign: camp.name, source: "Instantly" }),
                status: "completed", leadId: dbLead.id,
              },
            });
            await updateLeadScoreForEvent(dbLead.id, eventType);
            imported++;
          }
        }
      } catch { /* skip individual campaign errors */ }
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });
  } catch (err: any) {
    console.error(`[syncService] Instantly sync error for workspace ${workspaceId}:`, err.response?.data?.message || err.message);
  }

  return { imported };
}

// ─── Smartlead ───────────────────────────────────────────────────────────────

export async function syncSmartlead(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "smartlead", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const apiKey = auth.apiKey.trim();
  let imported = 0;

  try {
    const campRes = await axios.get("https://server.smartlead.ai/api/v1/campaigns", {
      params: { api_key: apiKey },
    });
    const campaigns: any[] = campRes.data ?? [];

    for (const camp of campaigns) {
      try {
        const leadsRes = await axios.get(
          `https://server.smartlead.ai/api/v1/campaigns/${camp.id}/leads`,
          { params: { api_key: apiKey, offset: 0, limit: 100 } }
        );
        const leads: any[] = leadsRes.data?.data ?? leadsRes.data ?? [];

        for (const l of leads) {
          const leadStatus = (l.lead_status || "").toUpperCase();
          let eventType: string | null = null;
          if (leadStatus.includes("REPLIED")) eventType = "reply_received";
          else if (leadStatus === "COMPLETED") eventType = "sequence_ended";
          else if (leadStatus === "INPROGRESS") eventType = "sequence_started";
          else continue;

          const email     = l.email || null;
          const firstName = l.first_name || "Unknown";
          const lastName  = l.last_name  || "";
          const contactId = `smartlead-${l.id || email}`;

          await prisma.contact.upsert({
            where: { id: contactId },
            update: { firstName, lastName, email: email ?? undefined },
            create: { id: contactId, workspaceId, firstName, lastName, email, status: "active" },
          });

          let dbLead = await prisma.lead.findFirst({ where: { contactId } });
          if (!dbLead) {
            dbLead = await prisma.lead.create({
              data: {
                workspaceId, contactId, email: email ?? "",
                fullName: `${firstName} ${lastName}`.trim(), firstName, lastName,
                company: l.company_name || null, source: "Smartlead", status: "new",
              },
            });
          }

          // Always resolve identity + record touchpoint — dedup handles re-runs
          const iqLeadId = await resolveIqLead(
            workspaceId,
            { email },
            { firstName, lastName, company: l.company_name || null },
          );
          await recordTouchpoint(workspaceId, iqLeadId, "smartlead", eventType, {
            campaign: camp.name, via: "sync",
          }, null, null, "direct_api", 1);

          const existingAct = await prisma.activity.findFirst({
            where: { workspaceId, leadId: dbLead.id, type: eventType },
          });
          if (!existingAct) {
            await prisma.activity.create({
              data: {
                workspaceId, type: eventType,
                subject: `${firstName} ${lastName}`.trim() || email || "Unknown",
                body: JSON.stringify({ campaign: camp.name, leadStatus, source: "Smartlead" }),
                status: "completed", leadId: dbLead.id,
              },
            });
            await updateLeadScoreForEvent(dbLead.id, eventType);
            imported++;
          }
        }
      } catch { /* skip individual campaign errors */ }
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });
  } catch (err: any) {
    console.error(`[syncService] Smartlead sync error for workspace ${workspaceId}:`, err.response?.data?.message || err.message);
  }

  return { imported };
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

export async function syncStripe(workspaceId: string): Promise<{ imported: number }> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "stripe", status: "connected" },
  });
  if (!conn) return { imported: 0 };

  const auth = parseAuth(conn.authData);
  if (!auth?.apiKey) return { imported: 0 };

  const stripe = new Stripe(auth.apiKey.trim(), { apiVersion: "2024-06-20" as any });
  const lastSyncTs = auth.lastSyncAt
    ? Math.floor(new Date(auth.lastSyncAt).getTime() / 1000)
    : undefined;
  let imported = 0;

  try {
    const charges = await stripe.charges.list({
      limit: 100,
      ...(lastSyncTs ? { created: { gte: lastSyncTs } } : {}),
    });

    for (const charge of charges.data) {
      if (!charge.paid) continue;

      const email     = charge.billing_details?.email || charge.receipt_email || null;
      const name      = charge.billing_details?.name || email || "Unknown Customer";
      const parts     = (name || "").split(" ");
      const firstName = parts[0] || "Unknown";
      const lastName  = parts.slice(1).join(" ");
      const contactId = `stripe-${charge.customer || charge.id}`;

      await prisma.contact.upsert({
        where: { id: contactId },
        update: { firstName, lastName, email: email ?? undefined },
        create: { id: contactId, workspaceId, firstName, lastName, email, status: "active" },
      });

      let dbLead = await prisma.lead.findFirst({ where: { contactId } });
      if (!dbLead) {
        dbLead = await prisma.lead.create({
          data: {
            workspaceId, contactId, email: email ?? "",
            fullName: name, firstName, lastName,
            source: "Stripe", status: "won", leadScore: 90,
          },
        });
      }

      // Dedup by charge ID stored in subject
      const existingAct = await prisma.activity.findFirst({
        where: { workspaceId, leadId: dbLead.id, type: "deal_won", subject: charge.id },
      });
      if (!existingAct) {
        await prisma.activity.create({
          data: {
            workspaceId, type: "deal_won",
            subject: charge.id,
            body: JSON.stringify({
              amount: (charge.amount / 100).toFixed(2),
              currency: charge.currency.toUpperCase(),
              description: charge.description,
              source: "Stripe",
            }),
            status: "completed", leadId: dbLead.id,
          },
        });
        await updateLeadScoreForEvent(dbLead.id, "deal_won");

        const iqLeadId = await resolveIqLead(
          workspaceId,
          { email },
          { firstName, lastName },
        );
        await recordTouchpoint(workspaceId, iqLeadId, "stripe", "deal_won", {
          chargeId: charge.id,
          amount: (charge.amount / 100).toFixed(2),
          currency: charge.currency.toUpperCase(),
          via: "sync",
        }, null, null, "direct_api", 1, null, null, null, charge.id);

        imported++;
      }
    }

    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });
  } catch (err: any) {
    console.error(`[syncService] Stripe sync error for workspace ${workspaceId}:`, err.message);
  }

  return { imported };
}

// ─── Dispatcher: 2-hour background poll ──────────────────────────────────────
//
// Every 2 hours, iqpipe pulls from each tool's API to catch events that may
// have been missed due to webhook delivery failures, retries, or tool downtime.
//
// Cross-check & deduplication strategy (two layers):
//
//   Layer 1 — Touchpoint table (identity.ts → recordTouchpoint):
//     For every incoming API-pulled event, recordTouchpoint checks whether an
//     IqLead already has a Touchpoint for the same (tool, eventType) on the same
//     calendar day. If found → skip. Import/enrichment events are deduplicated
//     all-time (a lead is only imported once per tool, ever).
//
//   Layer 2 — Activity table (each sync function):
//     Each sync function additionally checks prisma.activity for an existing
//     record with (workspaceId, leadId, type). If found → skip. This ensures
//     the backward-compatible Activity feed never shows duplicates either.
//
// Both layers must pass before any new event is written. The result: if a
// webhook already delivered an event earlier in the day, the API poll sees
// the existing Touchpoint and silently skips it — no double-counting.

export async function syncWorkspace(workspaceId: string): Promise<void> {
  const connections = await prisma.integrationConnection.findMany({
    where: { workspaceId, status: "connected" },
    select: { provider: true },
  });
  const connected = new Set(connections.map(c => c.provider));

  // ── All tools with API sync functions — run every 2 h ────────────────────
  // Each function is a no-op if the provider is not connected.
  // Deduplication at both Touchpoint and Activity level prevents double-recording
  // of events that were already captured in real-time via webhook.
  if (connected.has("apollo"))     await syncApollo(workspaceId);
  if (connected.has("heyreach"))   await syncHeyReach(workspaceId);
  if (connected.has("lemlist"))    await syncLemlist(workspaceId);
  if (connected.has("instantly"))  await syncInstantly(workspaceId);
  if (connected.has("smartlead"))  await syncSmartlead(workspaceId);
  if (connected.has("stripe"))     await syncStripe(workspaceId);
}

// ─── Run all workspaces ───────────────────────────────────────────────────────

export async function syncAllWorkspaces(): Promise<void> {
  try {
    const connections = await prisma.integrationConnection.findMany({
      where: { status: "connected" },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
    });

    for (const { workspaceId } of connections) {
      await syncWorkspace(workspaceId);
    }
  } catch (err) {
    console.error("[syncService] syncAllWorkspaces error:", err);
  }
}
