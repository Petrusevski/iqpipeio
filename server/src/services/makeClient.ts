/**
 * makeClient.ts
 *
 * Connects to a user's Make.com account via the Make REST API v2.
 * Fetches all scenarios for the team, parses module types to identify
 * apps used, and stores per-scenario metadata in MakeScenarioMeta.
 *
 * Key API flow:
 *   1. GET /api/v2/users/me            → get teamId + organizationId
 *   2. GET /api/v2/scenarios?teamId=   → paginated scenario list
 *   3. GET /api/v2/scenarios/{id}      → full scenario + blueprint flow
 */

import axios from "axios";
import { prisma } from "../db";
import { decrypt } from "../utils/encryption";

// ── Module → App display name mapping ────────────────────────────────────────
// Keys are the prefix of Make's "appSlug:actionName" module format.

const MODULE_APP_MAP: Record<string, string> = {
  // CRM
  hubspot: "HubSpot", pipedrive: "Pipedrive", salesforce: "Salesforce",
  "zoho-crm": "Zoho CRM", freshsales: "Freshsales", attio: "Attio",
  copper: "Copper", close: "Close CRM",

  // Sales engagement
  instantly: "Instantly", lemlist: "Lemlist", smartlead: "Smartlead",
  apollo: "Apollo", outreach: "Outreach", salesloft: "Salesloft",
  reply: "Reply.io", woodpecker: "Woodpecker", mailshake: "Mailshake",
  mixmax: "Mixmax", klenty: "Klenty",

  // LinkedIn automation
  heyreach: "HeyReach", expandi: "Expandi", dripify: "Dripify", waalaxy: "Waalaxy",

  // Email providers
  gmail: "Gmail", "google-gmail": "Gmail", sendgrid: "SendGrid",
  mailchimp: "Mailchimp", mailgun: "Mailgun", postmark: "Postmark",
  "microsoft-365-email": "Outlook", brevo: "Brevo",
  sendinblue: "Brevo", sparkpost: "SparkPost", smtp: "SMTP",

  // Data enrichment
  clearbit: "Clearbit", hunter: "Hunter.io", clay: "Clay",
  lusha: "Lusha", cognism: "Cognism", zoominfo: "ZoomInfo",
  phantombuster: "PhantomBuster", snov: "Snov.io",

  // Productivity
  "google-sheets": "Google Sheets", "google-drive": "Google Drive",
  "google-calendar": "Google Calendar", "google-docs": "Google Docs",
  "google-forms": "Google Forms",
  airtable: "Airtable", notion: "Notion",
  "microsoft-excel": "Excel", "microsoft-teams": "Microsoft Teams",
  sharepoint: "SharePoint", dropbox: "Dropbox", box: "Box",

  // Communication
  slack: "Slack", discord: "Discord", telegram: "Telegram",
  intercom: "Intercom", drift: "Drift", zendesk: "Zendesk",
  freshdesk: "Freshdesk", crisp: "Crisp",

  // Project management
  jira: "Jira", asana: "Asana", trello: "Trello",
  linear: "Linear", clickup: "ClickUp", monday: "Monday.com",
  "monday-crm": "Monday.com", basecamp: "Basecamp",
  todoist: "Todoist",

  // Dev / engineering
  github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket",

  // Billing / finance
  stripe: "Stripe", chargebee: "Chargebee", paddle: "Paddle",
  quickbooks: "QuickBooks", xero: "Xero",

  // Forms / surveys
  typeform: "Typeform", jotform: "JotForm", surveymonkey: "SurveyMonkey",
  tally: "Tally",

  // Analytics / BI
  segment: "Segment", mixpanel: "Mixpanel", amplitude: "Amplitude",
  posthog: "PostHog", plausible: "Plausible",

  // AI
  openai: "OpenAI", anthropic: "Anthropic",

  // Database
  postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB",
  supabase: "Supabase",

  // Scheduling
  calendly: "Calendly", cal: "Cal.com",

  // Phone / SMS
  twilio: "Twilio", aircall: "Aircall",
};

// Module prefixes that are pure Make internals — not external apps
const SKIP_PREFIXES = new Set([
  "gateway", "http", "json", "tools", "math", "text", "regexp",
  "flow", "util", "time", "compose", "builtin", "error",
  "data-store", "datastore", "rss", "xml", "csv", "image",
  "pdf", "archive", "mime", "markdown",
]);

// ── Blueprint parser ──────────────────────────────────────────────────────────

function extractAppsFromBlueprint(flow: any[]): { apps: string[]; moduleTypes: string[] } {
  const appSet  = new Set<string>();
  const typeSet = new Set<string>();

  for (const node of flow ?? []) {
    const mod = node.module as string;
    if (!mod) continue;
    typeSet.add(mod);

    const prefix = mod.split(":")[0];
    if (SKIP_PREFIXES.has(prefix)) continue;

    const appName = MODULE_APP_MAP[prefix];
    if (appName) {
      appSet.add(appName);
    } else {
      // Humanize unknown slug: "google-analytics" → "Google Analytics"
      const readable = prefix
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      if (readable && readable.length > 1) appSet.add(readable);
    }
  }

  return { apps: [...appSet].sort(), moduleTypes: [...typeSet] };
}

function classifyTrigger(flow: any[]): string {
  const firstMod = (flow?.[0]?.module ?? "").toLowerCase();
  if (firstMod.includes("webhook") || firstMod.startsWith("gateway:")) return "webhook";
  if (firstMod.includes("email") || firstMod.includes("gmail") || firstMod.includes("imap")) return "email";
  if (firstMod.includes("trigger") || firstMod.includes("watch")) return "event";
  return "schedule";
}

// ── Make REST API client ──────────────────────────────────────────────────────

async function makeGet(apiKey: string, region: string, path: string): Promise<any> {
  const url = `https://${region}.make.com/api/v2${path}`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    timeout: 15_000,
  });
  return resp.data;
}

export async function testMakeConnection(
  apiKey: string,
  region: string,
): Promise<{ ok: boolean; organizationId?: string; teamId?: string; error?: string }> {
  try {
    const data = await makeGet(apiKey, region, "/users/me");
    const user = data.user ?? data;
    if (!user?.id) return { ok: false, error: "Could not authenticate with Make.com" };

    // Handle different API response shapes
    const organizationId = String(
      user.organizationId ?? user.organization?.id ?? ""
    );
    const teamId = String(
      user.teamId ?? user.defaultTeamId ?? user.teams?.[0]?.id ?? ""
    );

    return { ok: true, organizationId, teamId };
  } catch (err: any) {
    const msg: string =
      err?.response?.data?.message || err?.message || "Connection failed";
    return { ok: false, error: msg };
  }
}

async function fetchAllScenarios(
  apiKey: string,
  region: string,
  teamId: string,
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const path = `/scenarios?teamId=${teamId}&pg[limit]=${limit}&pg[offset]=${offset}`;
    const data = await makeGet(apiKey, region, path);
    const items: any[] = data.scenarios ?? [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }

  return all;
}

async function fetchScenarioFlow(
  apiKey: string,
  region: string,
  scenarioId: string,
): Promise<any[]> {
  try {
    const data = await makeGet(apiKey, region, `/scenarios/${scenarioId}`);
    return data.scenario?.blueprint?.flow ?? data.scenario?.flow ?? [];
  } catch {
    return [];
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export async function syncMakeConnection(
  workspaceId: string,
): Promise<{ synced: number; errors: number }> {
  const conn = await prisma.makeConnection.findUnique({ where: { workspaceId } });
  if (!conn || conn.status === "disconnected") return { synced: 0, errors: 0 };

  let apiKey: string;
  try {
    apiKey = decrypt(conn.apiKeyEnc);
  } catch {
    await prisma.makeConnection.update({
      where: { workspaceId },
      data: { status: "error", lastError: "Failed to decrypt API key" },
    });
    return { synced: 0, errors: 1 };
  }

  if (!conn.teamId) {
    await prisma.makeConnection.update({
      where: { workspaceId },
      data: { status: "error", lastError: "No teamId — please reconnect" },
    });
    return { synced: 0, errors: 1 };
  }

  let synced = 0;
  let errors = 0;

  try {
    const scenarios = await fetchAllScenarios(apiKey, conn.region, conn.teamId);

    for (const sc of scenarios) {
      try {
        const flow = await fetchScenarioFlow(apiKey, conn.region, String(sc.id));
        const { apps, moduleTypes } = extractAppsFromBlueprint(flow);
        const triggerType = classifyTrigger(flow);

        await prisma.makeScenarioMeta.upsert({
          where:  { workspaceId_makeId: { workspaceId, makeId: String(sc.id) } },
          create: {
            workspaceId,
            makeId:        String(sc.id),
            name:          sc.name,
            active:        sc.isActive ?? false,
            teamId:        String(sc.teamId ?? conn.teamId),
            appsUsed:      JSON.stringify(apps),
            moduleTypes:   JSON.stringify(moduleTypes),
            moduleCount:   flow.length,
            triggerType,
            lastUpdatedAt: sc.lastEdit ? new Date(sc.lastEdit) : null,
            syncedAt:      new Date(),
          },
          update: {
            name:          sc.name,
            active:        sc.isActive ?? false,
            appsUsed:      JSON.stringify(apps),
            moduleTypes:   JSON.stringify(moduleTypes),
            moduleCount:   flow.length,
            triggerType,
            lastUpdatedAt: sc.lastEdit ? new Date(sc.lastEdit) : null,
            syncedAt:      new Date(),
          },
        });
        synced++;
      } catch (err: any) {
        console.error(`[makeClient] Failed to sync scenario ${sc.id}:`, err.message);
        errors++;
      }
    }

    await prisma.makeConnection.update({
      where: { workspaceId },
      data: {
        status:        "connected",
        lastSyncAt:    new Date(),
        lastError:     null,
        scenarioCount: synced,
      },
    });
  } catch (err: any) {
    console.error(`[makeClient] Sync failed for workspace ${workspaceId}:`, err.message);
    await prisma.makeConnection.update({
      where: { workspaceId },
      data: { status: "error", lastError: err.message?.slice(0, 500) },
    });
    errors++;
  }

  console.log(`[makeClient] Workspace ${workspaceId}: synced ${synced} scenarios, ${errors} errors`);
  return { synced, errors };
}

export async function syncAllMakeConnections(): Promise<void> {
  const connections = await prisma.makeConnection.findMany({
    where:  { status: { not: "disconnected" } },
    select: { workspaceId: true },
  });
  for (const { workspaceId } of connections) {
    await syncMakeConnection(workspaceId).catch(err =>
      console.error(`[makeClient] syncAll error for ${workspaceId}:`, err.message)
    );
  }
}
