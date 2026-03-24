/**
 * n8nClient.ts
 *
 * Connects to a user's n8n instance via its REST API (API key auth).
 * Fetches all saved workflows, parses node types to identify apps used,
 * and stores per-workflow metadata in N8nWorkflowMeta.
 *
 * Does NOT import or render workflow canvas data — metadata only.
 */

import axios from "axios";
import { createHash } from "crypto";
import { prisma } from "../db";
import { decrypt } from "../utils/encryption";

// ── Node → App mapping ────────────────────────────────────────────────────────
// Maps n8n node type slugs to human-readable app names.
// Handles both "n8n-nodes-base.{slug}" and trigger variants "{slug}Trigger".

const NODE_APP_MAP: Record<string, string> = {
  // CRM
  hubspot: "HubSpot", pipedrive: "Pipedrive", salesforce: "Salesforce",
  zohocrm: "Zoho CRM", freshsales: "Freshsales", copper: "Copper",
  attio: "Attio", close: "Close CRM",

  // Sales engagement
  apollo: "Apollo", outreach: "Outreach", salesloft: "Salesloft",
  instantly: "Instantly", lemlist: "Lemlist", smartlead: "Smartlead",
  reply: "Reply.io", klenty: "Klenty", mixmax: "Mixmax",
  woodpecker: "Woodpecker", mailshake: "Mailshake", quickmail: "QuickMail",

  // LinkedIn automation
  heyreach: "HeyReach", expandi: "Expandi", dripify: "Dripify",
  waalaxy: "Waalaxy",

  // Email providers
  gmail: "Gmail", sendgrid: "SendGrid", mailchimp: "Mailchimp",
  mailgun: "Mailgun", smtp: "SMTP", imap: "IMAP",
  microsoftOutlook: "Outlook", postmark: "Postmark", sparkpost: "SparkPost",
  sendInBlue: "Brevo", brevo: "Brevo",

  // Data enrichment
  clearbit: "Clearbit", hunter: "Hunter.io", clay: "Clay",
  zoominfo: "ZoomInfo", lusha: "Lusha", cognism: "Cognism",
  snov: "Snov.io", rocketReach: "RocketReach",
  phantombuster: "PhantomBuster", pdl: "People Data Labs",

  // Productivity / docs
  googleSheets: "Google Sheets", googleDrive: "Google Drive",
  googleDocs: "Google Docs", googleCalendar: "Google Calendar",
  googleForms: "Google Forms", googleAnalytics: "Google Analytics",
  airtable: "Airtable", notion: "Notion",
  microsoftExcel: "Excel", microsoftOneDrive: "OneDrive",
  microsoftTeams: "Microsoft Teams", sharepoint: "SharePoint",
  dropbox: "Dropbox", box: "Box",

  // Communication / messaging
  slack: "Slack", discord: "Discord", telegram: "Telegram",
  microsoftOutlookTrigger: "Outlook", intercom: "Intercom",
  drift: "Drift", crisp: "Crisp", freshchat: "Freshchat",
  zendesk: "Zendesk", freshdesk: "Freshdesk", helpscout: "Help Scout",

  // Project management
  jira: "Jira", asana: "Asana", trello: "Trello",
  linear: "Linear", clickup: "ClickUp", monday: "Monday.com",
  basecamp: "Basecamp", todoist: "Todoist", wrike: "Wrike",

  // Dev / engineering
  github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket",
  jenkins: "Jenkins", jiraService: "Jira",

  // Billing / finance
  stripe: "Stripe", chargebee: "Chargebee", paddle: "Paddle",
  quickbooks: "QuickBooks", xero: "Xero", recurly: "Recurly",

  // Forms / surveys
  typeform: "Typeform", jotform: "JotForm", surveymonkey: "SurveyMonkey",
  tally: "Tally", formstack: "Formstack",

  // Analytics / BI
  segment: "Segment", mixpanel: "Mixpanel", amplitude: "Amplitude",
  plausible: "Plausible", posthog: "PostHog",

  // AI / LLM
  openAi: "OpenAI", anthropicClaude: "Anthropic", cohere: "Cohere",
  huggingFace: "HuggingFace",

  // Database
  postgres: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB",
  redis: "Redis", supabase: "Supabase", planetscale: "PlanetScale",

  // Storage / cloud
  s3: "AWS S3", googleCloudStorage: "GCS", cloudflareR2: "Cloudflare R2",

  // Scheduling / calendar
  calendly: "Calendly", cal: "Cal.com", savvycal: "SavvyCal",

  // Phone / SMS
  twilio: "Twilio", vonage: "Vonage", aircall: "Aircall",

  // Marketing
  mailerlite: "MailerLite", activecampaign: "ActiveCampaign",
  klaviyo: "Klaviyo", drip: "Drip", convertkit: "ConvertKit",
  hubspotMarketing: "HubSpot",

  // Automation infra
  httpRequest: "HTTP Request", webhook: "Webhook",
};

// Nodes that are pure flow-control — do not represent external apps
const SKIP_NODES = new Set([
  "if", "switch", "merge", "set", "noOp", "start", "stickyNote",
  "splitInBatches", "itemLists", "dateTime", "moveBinaryData",
  "code", "function", "functionItem", "executeWorkflow",
  "executeWorkflowTrigger", "wait", "stopAndError", "respondToWebhook",
  "compareDatasets", "sort", "limit", "removeDuplicates", "summarize",
  "filter", "aggregate", "html", "markdown", "xml", "crypto",
  "editImage", "compression", "convertToFile", "readBinaryFile",
  "writeBinaryFile", "spreadsheetFile", "extractFromFile",
  "workflowTrigger", "manualTrigger", "errorTrigger",
  "intervalTrigger", "localFileTrigger",
]);

// ── Node parser ───────────────────────────────────────────────────────────────

/**
 * Given a raw n8n node type string like "n8n-nodes-base.googleSheets"
 * or "n8n-nodes-base.googleSheetsTrigger", returns the slug.
 */
function extractSlug(nodeType: string): string {
  // Remove package prefix
  const parts = nodeType.split(".");
  const slug = parts[parts.length - 1];
  // Strip "Trigger" suffix for lookup (keep for trigger detection)
  return slug.replace(/Trigger$/, "");
}

/**
 * Classify the trigger type by inspecting trigger nodes.
 */
function classifyTrigger(nodes: any[]): string {
  const triggerNode = nodes.find(n =>
    n.type?.includes("Trigger") ||
    n.type === "n8n-nodes-base.start" ||
    n.type === "n8n-nodes-base.manualTrigger"
  );
  if (!triggerNode) return "manual";
  const t = (triggerNode.type || "").toLowerCase();
  if (t.includes("webhook"))  return "webhook";
  if (t.includes("schedule") || t.includes("cron") || t.includes("interval")) return "schedule";
  if (t.includes("email") || t.includes("gmail") || t.includes("imap")) return "email";
  if (t.includes("manual"))   return "manual";
  return "event";
}

/**
 * Parse a workflow's nodes array and return deduplicated app names.
 */
export function parseWorkflowApps(nodes: any[]): { apps: string[]; nodeTypes: string[] } {
  const appSet  = new Set<string>();
  const typeSet = new Set<string>();

  for (const node of nodes) {
    const rawType = node.type as string;
    if (!rawType) continue;

    typeSet.add(rawType);
    const slug = extractSlug(rawType);
    if (SKIP_NODES.has(slug)) continue;

    // Direct match
    const appName = NODE_APP_MAP[slug];
    if (appName) {
      appSet.add(appName);
      continue;
    }

    // Fallback: convert camelCase slug to Title Case words
    // e.g. "someUnknownApp" → "Some Unknown App"
    const readable = slug
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^\w/, c => c.toUpperCase());
    if (readable && readable.length > 1) {
      appSet.add(readable);
    }
  }

  return {
    apps:      [...appSet].sort(),
    nodeTypes: [...typeSet],
  };
}

// ── n8n REST API client ───────────────────────────────────────────────────────

async function n8nGet(baseUrl: string, apiKey: string, path: string): Promise<any> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const resp = await axios.get(url, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
    timeout: 15_000,
  });
  return resp.data;
}

export async function testN8nConnection(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const data = await n8nGet(baseUrl, apiKey, "/health");
    return { ok: true, version: data?.status ?? "ok" };
  } catch {
    // /health might not exist in older n8n — try /workflows with limit=1
    try {
      await n8nGet(baseUrl, apiKey, "/workflows?limit=1");
      return { ok: true };
    } catch (err2: any) {
      const msg: string =
        err2?.response?.data?.message || err2?.message || "Connection failed";
      return { ok: false, error: msg };
    }
  }
}

interface N8nWorkflowListItem {
  id: string;
  name: string;
  active: boolean;
  tags?: { id: string; name: string }[];
  updatedAt?: string;
  description?: string;
}

async function fetchAllWorkflows(
  baseUrl: string,
  apiKey: string,
): Promise<N8nWorkflowListItem[]> {
  const all: N8nWorkflowListItem[] = [];
  let cursor: string | undefined;

  // n8n paginates with cursor
  do {
    const path = cursor
      ? `/workflows?limit=100&cursor=${encodeURIComponent(cursor)}`
      : `/workflows?limit=100`;
    const page = await n8nGet(baseUrl, apiKey, path);
    const items: N8nWorkflowListItem[] = page.data ?? page ?? [];
    all.push(...items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return all;
}

async function fetchWorkflowNodes(
  baseUrl: string,
  apiKey: string,
  id: string,
): Promise<any[]> {
  const data = await n8nGet(baseUrl, apiKey, `/workflows/${id}`);
  return data.nodes ?? [];
}

// ── Sync ──────────────────────────────────────────────────────────────────────

/**
 * Sync one workspace's n8n connection: fetch all workflows, parse nodes,
 * upsert N8nWorkflowMeta records.
 */
export async function syncN8nConnection(
  workspaceId: string,
): Promise<{ synced: number; errors: number }> {
  const conn = await prisma.n8nConnection.findUnique({ where: { workspaceId } });
  if (!conn || conn.status === "disconnected") return { synced: 0, errors: 0 };

  let apiKey: string;
  try {
    apiKey = decrypt(conn.apiKeyEnc);
  } catch {
    await prisma.n8nConnection.update({
      where: { workspaceId },
      data: { status: "error", lastError: "Failed to decrypt API key" },
    });
    return { synced: 0, errors: 1 };
  }

  let synced = 0;
  let errors = 0;

  try {
    const workflows = await fetchAllWorkflows(conn.baseUrl, apiKey);

    for (const wf of workflows) {
      try {
        const nodes = await fetchWorkflowNodes(conn.baseUrl, apiKey, wf.id);
        const { apps, nodeTypes } = parseWorkflowApps(nodes);
        const triggerType = classifyTrigger(nodes);
        const tags = (wf.tags ?? []).map((t: any) => t.name ?? t).filter(Boolean);

        await prisma.n8nWorkflowMeta.upsert({
          where:  { workspaceId_n8nId: { workspaceId, n8nId: wf.id } },
          create: {
            workspaceId,
            n8nId:         wf.id,
            name:          wf.name,
            active:        wf.active ?? false,
            tags:          JSON.stringify(tags),
            appsUsed:      JSON.stringify(apps),
            nodeTypes:     JSON.stringify(nodeTypes),
            nodeCount:     nodes.length,
            triggerType,
            description:   wf.description || null,
            lastUpdatedAt: wf.updatedAt ? new Date(wf.updatedAt) : null,
            syncedAt:      new Date(),
          },
          update: {
            name:          wf.name,
            active:        wf.active ?? false,
            tags:          JSON.stringify(tags),
            appsUsed:      JSON.stringify(apps),
            nodeTypes:     JSON.stringify(nodeTypes),
            nodeCount:     nodes.length,
            triggerType,
            description:   wf.description || null,
            lastUpdatedAt: wf.updatedAt ? new Date(wf.updatedAt) : null,
            syncedAt:      new Date(),
          },
        });
        synced++;
      } catch (err: any) {
        console.error(`[n8nClient] Failed to sync workflow ${wf.id}:`, err.message);
        errors++;
      }
    }

    await prisma.n8nConnection.update({
      where: { workspaceId },
      data: {
        status:        "connected",
        lastSyncAt:    new Date(),
        lastError:     null,
        workflowCount: synced,
      },
    });
  } catch (err: any) {
    console.error(`[n8nClient] Sync failed for workspace ${workspaceId}:`, err.message);
    await prisma.n8nConnection.update({
      where: { workspaceId },
      data: { status: "error", lastError: err.message?.slice(0, 500) },
    });
    errors++;
  }

  console.log(`[n8nClient] Workspace ${workspaceId}: synced ${synced} workflows, ${errors} errors`);
  return { synced, errors };
}

// ── Execution polling ─────────────────────────────────────────────────────────

interface ContactFields {
  email?: string;
  linkedin?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}

/** Extract contact identifiers + metadata from a single n8n node output item. */
function extractContactFromJson(json: Record<string, any>): ContactFields | null {
  if (!json || typeof json !== "object") return null;

  // Some tools (HubSpot, Pipedrive) nest fields under `properties`
  const props: any = json.properties ?? {};

  const email =
    json.email ?? json.emailAddress ?? json.email_address ??
    json["Email"] ?? json["email address"] ??
    props.email ?? props.hs_email_address;

  const linkedin =
    json.linkedin_url ?? json.linkedinUrl ?? json.linkedin ??
    json.profileUrl ?? json["LinkedIn URL"] ??
    props.linkedin ?? props.hs_linkedin_bio;

  const phone =
    json.phone ?? json.phoneNumber ?? json.phone_number ??
    json["Phone"] ?? props.phone ?? props.mobilephone;

  if (!email && !linkedin && !phone) return null;

  const name = typeof json.name === "string" ? json.name : "";
  const firstName =
    json.first_name ?? json.firstName ?? json["First Name"] ??
    props.firstname ?? props.first_name ??
    (name ? name.split(" ")[0] : undefined);

  const lastName =
    json.last_name ?? json.lastName ?? json["Last Name"] ??
    props.lastname ?? props.last_name ??
    (name ? name.split(" ").slice(1).join(" ") : undefined);

  const company =
    json.company ?? json.organization ?? json.companyName ?? json.company_name ??
    json["Company"] ?? props.company ?? json.account?.name;

  const title =
    json.title ?? json.jobTitle ?? json.job_title ??
    json["Title"] ?? json["Job Title"] ?? json.position ??
    props.jobtitle ?? props.title;

  return {
    email:     typeof email     === "string" ? email.trim().toLowerCase() : undefined,
    linkedin:  typeof linkedin  === "string" ? linkedin.trim() : undefined,
    phone:     typeof phone     === "string" ? phone.trim() : undefined,
    firstName: typeof firstName === "string" ? firstName.trim() : undefined,
    lastName:  typeof lastName  === "string" ? lastName.trim() : undefined,
    company:   typeof company   === "string" ? company.trim() : undefined,
    title:     typeof title     === "string" ? title.trim() : undefined,
  };
}

const LINKEDIN_APPS = new Set(["HeyReach", "Expandi", "Dripify", "Waalaxy"]);
const EMAIL_APPS    = new Set(["Instantly", "Lemlist", "Smartlead", "Mailshake", "QuickMail", "Woodpecker", "Reply.io", "Klenty", "Mixmax", "Outreach", "Salesloft"]);
const ENRICH_APPS   = new Set(["Clay", "Clearbit", "ZoomInfo", "Hunter.io", "Lusha", "Cognism", "PhantomBuster", "People Data Labs", "Snov.io", "RocketReach"]);
const CRM_APPS      = new Set(["HubSpot", "Pipedrive", "Salesforce", "Attio", "Close CRM", "Freshsales", "Zoho CRM"]);
const BILLING_APPS  = new Set(["Stripe", "Chargebee", "Paddle"]);

/** Heuristically infer the iqpipe event type from a node name and its app. */
function inferEventType(nodeName: string, appName: string): string {
  const lc = nodeName.toLowerCase();
  if (lc.includes("reply") || lc.includes("replied"))                         return "reply_received";
  if (lc.includes("meeting") || lc.includes("book") || lc.includes("booked")) return "meeting_booked";
  if (lc.includes("deal won") || lc.includes("closed won"))                   return "deal_won";
  if (lc.includes("deal lost") || lc.includes("closed lost"))                 return "deal_lost";
  if (lc.includes("enrich"))                                                   return "enriched";
  if (lc.includes("deal") && (lc.includes("creat") || lc.includes("new")))    return "deal_created";
  if (LINKEDIN_APPS.has(appName))                                              return "linkedin_message_sent";
  if (EMAIL_APPS.has(appName))                                                 return "email_sent";
  if (ENRICH_APPS.has(appName))                                                return "enriched";
  if (CRM_APPS.has(appName))                                                   return "crm_updated";
  if (BILLING_APPS.has(appName))                                               return "deal_created";
  return "contacted";
}

/** Fuzzy-match a node name against known apps in the workflow's appsUsed list. */
function findAppForNode(nodeName: string, appsUsed: string[]): string | undefined {
  const lc = nodeName.toLowerCase();
  for (const app of appsUsed) {
    if (lc.includes(app.toLowerCase())) return app;
  }
  for (const [slug, appName] of Object.entries(NODE_APP_MAP)) {
    if (lc.includes(slug.toLowerCase()) || lc.includes(appName.toLowerCase())) {
      return appName;
    }
  }
  return undefined;
}

async function fetchExecutions(
  baseUrl: string,
  apiKey: string,
  workflowId: string,
  limit = 50,
): Promise<any[]> {
  try {
    const path = `/executions?workflowId=${encodeURIComponent(workflowId)}&status=success&limit=${limit}&includeData=true`;
    const resp = await n8nGet(baseUrl, apiKey, path);
    return resp?.data ?? [];
  } catch (err: any) {
    console.warn(`[n8nExec] fetchExecutions error for workflow ${workflowId}:`, err.message);
    return [];
  }
}

type WfMetaForPoll = {
  id: string;
  n8nId: string;
  name: string;
  lastExecCursor: string | null;
  eventFilter: string | null;
  execSyncEnabled: boolean;
  appsUsed: string;
};

/**
 * Poll new executions for a single workflow and enqueue contact events.
 * Returns the number of events queued.
 */
async function processWorkflowExecutions(
  workspaceId: string,
  wfMeta: WfMetaForPoll,
  baseUrl: string,
  apiKey: string,
): Promise<number> {
  if (!wfMeta.execSyncEnabled) return 0;

  let filter: { enabled: boolean; apps: string[]; eventTypes: string[] } | null = null;
  if (wfMeta.eventFilter) {
    try { filter = JSON.parse(wfMeta.eventFilter); } catch {}
  }
  if (filter && !filter.enabled) return 0;

  const executions = await fetchExecutions(baseUrl, apiKey, wfMeta.n8nId);
  if (executions.length === 0) return 0;

  // n8n returns newest-first; collect everything newer than the stored cursor
  const lastCursor = wfMeta.lastExecCursor;
  const newExecs: any[] = [];
  let newestId: string | null = null;

  for (const exec of executions) {
    const execId = String(exec.id ?? "");
    if (!execId) continue;
    if (lastCursor && execId === lastCursor) break; // reached already-processed
    newExecs.push(exec);
    if (!newestId) newestId = execId; // first item = newest
  }

  if (newExecs.length === 0) return 0;

  // Process oldest-first for chronological ordering
  newExecs.reverse();

  const appsUsed: string[] = JSON.parse(wfMeta.appsUsed || "[]");
  let queued = 0;

  for (const exec of newExecs) {
    const execId = String(exec.id ?? "");
    const runData: Record<string, any[]> = exec?.data?.resultData?.runData ?? {};

    let nodeIdx = 0;
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      nodeIdx++;
      const items: any[] = (nodeRuns?.[0]?.data?.main ?? []).flat();
      if (items.length === 0) continue;

      const appName = findAppForNode(nodeName, appsUsed) ?? "";

      // Apply app filter
      if (filter?.apps?.length && appName && !filter.apps.includes(appName)) continue;

      let itemIdx = 0;
      for (const item of items) {
        itemIdx++;
        const json = item?.json ?? item;
        if (!json || typeof json !== "object") continue;

        const contact = extractContactFromJson(json as Record<string, any>);
        if (!contact) continue;

        const eventType = inferEventType(nodeName, appName);

        // Apply event type filter
        if (filter?.eventTypes?.length && !filter.eventTypes.includes(eventType)) continue;

        // Stable idempotency key per execution × node × item
        const iKey = createHash("sha256")
          .update(`exec:${workspaceId}:${execId}:${nodeName}:${itemIdx}`)
          .digest("hex")
          .slice(0, 48);

        const exists = await prisma.n8nQueuedEvent.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: iKey } },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.n8nQueuedEvent.create({
          data: {
            workspaceId,
            workflowId:     wfMeta.n8nId,
            stepId:         nodeName,
            sourceApp:      appName || "n8n",
            externalId:     contact.email ?? contact.linkedin ?? iKey,
            eventType,
            contact: JSON.stringify({
              email:        contact.email        ?? null,
              linkedin_url: contact.linkedin     ?? null,
              phone:        contact.phone        ?? null,
              first_name:   contact.firstName    ?? null,
              last_name:    contact.lastName     ?? null,
              company:      contact.company      ?? null,
              title:        contact.title        ?? null,
            }),
            idempotencyKey: iKey,
            sourceType:     "n8n_workflow",
            sourcePriority: 3,
          },
        });
        queued++;
      }
    }
  }

  // Advance cursor to the newest execution we just processed
  if (newestId && newestId !== lastCursor) {
    await prisma.n8nWorkflowMeta.updateMany({
      where: { workspaceId, n8nId: wfMeta.n8nId },
      data:  { lastExecCursor: newestId },
    });
  }

  return queued;
}

/** Poll all workflows in one workspace for new execution events. */
export async function pollN8nExecutions(workspaceId: string): Promise<void> {
  const conn = await prisma.n8nConnection.findUnique({ where: { workspaceId } });
  if (!conn || conn.status === "disconnected") return;

  let apiKey: string;
  try { apiKey = decrypt(conn.apiKeyEnc); } catch { return; }

  const workflows = await prisma.n8nWorkflowMeta.findMany({
    where:  { workspaceId, execSyncEnabled: true },
    select: { id: true, n8nId: true, name: true, lastExecCursor: true, eventFilter: true, execSyncEnabled: true, appsUsed: true },
  });

  let totalQueued = 0;
  for (const wf of workflows) {
    try {
      totalQueued += await processWorkflowExecutions(workspaceId, wf, conn.baseUrl, apiKey);
    } catch (err: any) {
      console.error(`[n8nExec] Error polling workflow ${wf.n8nId}:`, err.message);
    }
  }

  await prisma.n8nConnection.update({
    where: { workspaceId },
    data:  { lastExecPollAt: new Date() },
  });

  if (totalQueued > 0) {
    console.log(`[n8nExec] Workspace ${workspaceId}: queued ${totalQueued} contact events from executions`);
  }
}

/** Poll all connected workspaces. Called from syncPoller every 5 minutes. */
export async function pollAllN8nExecutions(): Promise<void> {
  const connections = await prisma.n8nConnection.findMany({
    where:  { status: { not: "disconnected" } },
    select: { workspaceId: true },
  });
  for (const { workspaceId } of connections) {
    await pollN8nExecutions(workspaceId).catch(err =>
      console.error(`[n8nExec] pollAllN8nExecutions error for ${workspaceId}:`, err.message)
    );
  }
}

/**
 * Sync all connected n8n workspaces. Called from syncPoller every 2 hours.
 */
export async function syncAllN8nConnections(): Promise<void> {
  const connections = await prisma.n8nConnection.findMany({
    where:  { status: { not: "disconnected" } },
    select: { workspaceId: true },
  });

  for (const { workspaceId } of connections) {
    await syncN8nConnection(workspaceId).catch(err =>
      console.error(`[n8nClient] syncAllN8nConnections error for ${workspaceId}:`, err.message)
    );
  }
}
