#!/usr/bin/env node
/**
 * IQPipe MCP Server — Phase 1 (Read-only)
 *
 * Exposes IQPipe workspace data to AI agents via the Model Context Protocol.
 * Claude Desktop or any MCP client can call these tools to query GTM data
 * without the user opening the IQPipe dashboard.
 *
 * Configuration (environment variables or Claude Desktop config):
 *   IQPIPE_API_URL  — Base URL of the IQPipe server, e.g. https://api.iqpipe.io
 *                     Defaults to http://localhost:4000
 *   IQPIPE_API_KEY  — Workspace API key (starts with rvn_pk_...)
 *                     Found in IQPipe → Settings → API & Integrations
 *
 * Tools (all read-only):
 *   get_live_feed        — Signal health for all connected tools (24h / 7d events)
 *   get_funnel           — GTM funnel stages with conversion rates
 *   list_workflows       — All n8n workflows and Make.com scenarios
 *   get_workflow_health  — Success rates and health status per workflow
 *   search_contacts      — Search contacts / leads by name, email, or company
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = (process.env.IQPIPE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API_KEY  = process.env.IQPIPE_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write(
    "[iqpipe-mcp] WARNING: IQPIPE_API_KEY is not set. All tool calls will return 401.\n"
  );
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function iqpipeGet(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_URL}/api/mcp${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const body = await res.json() as unknown;

  if (!res.ok) {
    const err = (body as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(`IQPipe API error: ${err}`);
  }

  return body;
}

async function iqpipePatch(path: string, body: unknown): Promise<unknown> {
  const url = `${API_URL}/api/mcp${path}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as unknown;

  if (!res.ok) {
    const err = (data as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(`IQPipe API error: ${err}`);
  }

  return data;
}

async function iqpipePost(path: string, body: unknown): Promise<unknown> {
  const url = `${API_URL}/api/mcp${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as unknown;

  if (!res.ok) {
    const err = (data as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(`IQPipe API error: ${err}`);
  }

  return data;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "iqpipe",
  version: "0.1.0",
});

// ── Tool: get_live_feed ───────────────────────────────────────────────────────

server.tool(
  "get_live_feed",
  "Returns real-time signal health for all connected tools in the IQPipe workspace. " +
  "Shows event counts (24h / 7d / all-time), health status (healthy / warning / silent / never), " +
  "and the top event types for each tool (HubSpot, Apollo, n8n, etc.).",
  {},
  async () => {
    const data = await iqpipeGet("/live-feed");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get_funnel ─────────────────────────────────────────────────────────

server.tool(
  "get_funnel",
  "Returns the GTM funnel stages and conversion rates for the workspace. " +
  "Each stage shows the event type, count, and conversion rate from the previous stage. " +
  "Optionally filter by a specific workflow ID.",
  {
    workflowId: z.string().optional().describe(
      "Optional: filter funnel to a specific n8n workflow or Make.com scenario ID"
    ),
  },
  async ({ workflowId }) => {
    const data = await iqpipeGet("/funnel", workflowId ? { workflowId } : undefined);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ── Tool: list_workflows ──────────────────────────────────────────────────────

server.tool(
  "list_workflows",
  "Lists all n8n workflows and Make.com scenarios connected to the workspace. " +
  "Returns name, platform, active status, apps used, node count, and last sync time.",
  {},
  async () => {
    const data = await iqpipeGet("/workflows");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get_workflow_health ─────────────────────────────────────────────────

server.tool(
  "get_workflow_health",
  "Returns health metrics for all workflows in the workspace over a given period. " +
  "Includes total events, success/failure counts, success rate, and a health label " +
  "(healthy ≥ 90%, warning ≥ 70%, critical < 70%, no_data if no events).",
  {
    period: z.enum(["7d", "14d", "30d", "90d"]).optional().default("30d").describe(
      "Time window for health metrics. Defaults to 30d."
    ),
  },
  async ({ period }) => {
    const data = await iqpipeGet("/workflow-health", { period: period ?? "30d" });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ── Tool: search_contacts ─────────────────────────────────────────────────────

server.tool(
  "search_contacts",
  "Searches contacts (leads) in the IQPipe workspace. " +
  "Matches against name, email, and company. Returns up to 200 contacts if no query is given. " +
  "Each contact includes id, name, email, company, title, status, source, and createdAt.",
  {
    q: z.string().optional().describe(
      "Search query — matches name, email, or company. Leave empty to list recent contacts."
    ),
    limit: z.number().int().min(1).max(200).optional().default(50).describe(
      "Maximum number of contacts to return (1–200). Defaults to 50."
    ),
  },
  async ({ q, limit }) => {
    const params: Record<string, string> = {};
    if (q)     params.q     = q;
    if (limit) params.limit = String(limit);

    const data = await iqpipeGet("/contacts", params);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ── Tool: connect_integration ─────────────────────────────────────────────────

server.tool(
  "connect_integration",
  "Connect a third-party tool (Apollo, HubSpot, Clay, Stripe, etc.) to the IQPipe workspace. " +
  "Credentials are validated live against the provider's API before being stored encrypted. " +
  "Supported providers: apollo, hubspot, pipedrive, clay, stripe, heyreach, lemlist, instantly, " +
  "smartlead, outreach, phantombuster, clearbit, lusha, pdl, snovio, rocketreach, attio, chargebee.\n\n" +
  "credentials format per provider:\n" +
  "  apollo / hubspot / pipedrive / most tools: { apiKey: 'sk_...' }\n" +
  "  clay:    { apiKey: '...', tableId: 't_abc...' }\n" +
  "  stripe:  { apiKey: 'sk_live_...' }  (must be the user's own Stripe key, not a test key)",
  {
    provider: z.string().describe(
      "Provider key, e.g. 'apollo', 'hubspot', 'clay', 'heyreach', 'stripe'."
    ),
    credentials: z.record(z.string(), z.string()).describe(
      "Credential fields for this provider. Most providers only need { apiKey }. " +
      "Clay also needs { tableId }. HubSpot also accepts { accessToken }."
    ),
  },
  async ({ provider, credentials }) => {
    const data = await iqpipePost("/connect-integration", { provider, credentials });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: disconnect_integration ──────────────────────────────────────────────

server.tool(
  "disconnect_integration",
  "Disconnect a third-party integration from the IQPipe workspace. " +
  "Clears the stored credentials and marks the integration as not connected. " +
  "Historical event data is preserved.",
  {
    provider: z.string().describe(
      "Provider to disconnect, e.g. 'apollo', 'hubspot', 'clay'."
    ),
  },
  async ({ provider }) => {
    const data = await iqpipePost("/disconnect-integration", { provider });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: connect_n8n ─────────────────────────────────────────────────────────

server.tool(
  "connect_n8n",
  "Connect an n8n instance to the IQPipe workspace. " +
  "IQPipe will validate the connection, then sync all existing workflows in the background. " +
  "After connecting, use list_workflows to see the imported workflows.",
  {
    baseUrl: z.string().describe(
      "Base URL of the n8n instance, e.g. 'https://my-n8n.example.com' or 'http://localhost:5678'."
    ),
    apiKey: z.string().describe(
      "n8n API key. Generate it in n8n → Settings → API → Create an API Key."
    ),
  },
  async ({ baseUrl, apiKey }) => {
    const data = await iqpipePost("/connect-n8n", { baseUrl, apiKey });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: connect_make ────────────────────────────────────────────────────────

server.tool(
  "connect_make",
  "Connect a Make.com account to the IQPipe workspace. " +
  "IQPipe will validate the API key, then sync all scenarios in the background. " +
  "After connecting, use list_workflows to see the imported scenarios.",
  {
    apiKey: z.string().describe(
      "Make.com API token. Generate it in Make.com → Profile → API access."
    ),
    region: z.enum(["us1", "us2", "eu1", "eu2"]).optional().default("us1").describe(
      "Make.com data center region. Defaults to 'us1'. Check your Make.com URL to identify your region."
    ),
  },
  async ({ apiKey, region }) => {
    const data = await iqpipePost("/connect-make", { apiKey, region: region ?? "us1" });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_workflow_mirror ─────────────────────────────────────────────────

server.tool(
  "get_workflow_mirror",
  "Returns the current mirror configuration for a specific workflow: which apps are connected, " +
  "what credentials/webhooks are in place (presence only, not the secrets themselves), " +
  "and which events are being observed per app. " +
  "Use list_workflows first to get the workflowId.",
  {
    workflowId: z.string().describe(
      "The IQPipe workflow ID (the 'id' field from list_workflows, not the n8n/Make native ID)."
    ),
  },
  async ({ workflowId }) => {
    const data = await iqpipeGet("/workflow-mirror", { workflowId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: setup_workflow_mirror ───────────────────────────────────────────────

server.tool(
  "setup_workflow_mirror",
  "Creates or updates a workflow mirror: connects apps to a specific workflow so IQPipe can " +
  "observe real outcomes (deals won, replies received, meetings booked, etc.) and correlate " +
  "them back to the automation that triggered them.\n\n" +
  "Call get_workflow_mirror first to see what is already configured. " +
  "Call mirror-app-catalog (via get_mirror_app_catalog) to discover valid appKeys and event keys.\n\n" +
  "correlationKey: the field name shared across all connected apps used to link events to a " +
  "contact (e.g. 'email' — HubSpot sends email, Apollo sends email, both can be matched).\n\n" +
  "For webhook apps: provide credential (API key) and webhookSecret (signing secret).\n" +
  "For polling apps (apollo, clay): credential (API key) is sufficient.\n\n" +
  "Supported appKeys: hubspot, salesforce, pipedrive, attio, instantly, lemlist, smartlead, " +
  "heyreach, apollo, clay, stripe, calendly, slack.",
  {
    workflowId: z.string().describe(
      "IQPipe workflow ID from list_workflows."
    ),
    platform: z.enum(["n8n", "make"]).describe(
      "Platform the workflow belongs to."
    ),
    correlationKey: z.string().optional().describe(
      "Shared field used to link events across apps, e.g. 'email'. " +
      "IQPipe matches events from different apps that share the same value for this field."
    ),
    apps: z.array(z.object({
      appKey: z.string().describe(
        "App to connect, e.g. 'hubspot', 'apollo', 'instantly'. " +
        "Must be a key from mirror-app-catalog."
      ),
      connectionType: z.enum(["webhook", "polling"]).describe(
        "How IQPipe receives events. Use mirror-app-catalog to check the required type per app."
      ),
      credential: z.string().optional().describe(
        "API key or access token for this app."
      ),
      webhookSecret: z.string().optional().describe(
        "Webhook signing secret for HMAC verification (webhook apps only)."
      ),
      events: z.array(z.string()).optional().describe(
        "Event keys to observe, e.g. ['deal.creation', 'deal.won']. " +
        "Use mirror-app-catalog to get valid event keys per app. " +
        "If omitted, no events are pre-configured (can be set later)."
      ),
    })).describe(
      "List of apps to connect to this mirror. Each app can have its own credentials and events."
    ),
  },
  async ({ workflowId, platform, correlationKey, apps }) => {
    const data = await iqpipePost("/workflow-mirror", {
      workflowId, platform, correlationKey, apps,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_mirror_app_catalog ──────────────────────────────────────────────

server.tool(
  "get_mirror_app_catalog",
  "Returns the full catalog of apps that can be connected to a workflow mirror. " +
  "For each app: the appKey to use in setup_workflow_mirror, connection type (webhook or polling), " +
  "and the list of event keys that can be observed. " +
  "Always call this before setup_workflow_mirror if you are unsure of the correct appKey or event keys.",
  {},
  async () => {
    const data = await iqpipeGet("/mirror-app-catalog");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — CRM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ── Tool: get_contact ─────────────────────────────────────────────────────────

server.tool(
  "get_contact",
  "Get full details for a contact/lead by id or email address. " +
  "Returns name, email, company, title, status, scores, and the 10 most recent activity events.",
  {
    id:    z.string().optional().describe("Contact id (from search_contacts)."),
    email: z.string().optional().describe("Email address. Used if id is not provided."),
  },
  async ({ id, email }) => {
    const params: Record<string, string> = {};
    if (id)    params.id    = id;
    if (email) params.email = email;
    const data = await iqpipeGet("/contact", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: create_contact ──────────────────────────────────────────────────────

server.tool(
  "create_contact",
  "Create a new contact/lead in the workspace. Email is required and must be unique. " +
  "Status defaults to 'new'; source defaults to 'manual'.",
  {
    email:     z.string().describe("Contact email address (required, must be unique)."),
    firstName: z.string().optional(),
    lastName:  z.string().optional(),
    company:   z.string().optional(),
    title:     z.string().optional(),
    status:    z.string().optional().describe("e.g. 'new', 'active', 'qualified'. Defaults to 'new'."),
    source:    z.string().optional().describe("e.g. 'manual', 'apollo', 'linkedin'. Defaults to 'manual'."),
  },
  async ({ email, firstName, lastName, company, title, status, source }) => {
    const data = await iqpipePost("/contacts", { email, firstName, lastName, company, title, status, source });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: update_contact ──────────────────────────────────────────────────────

server.tool(
  "update_contact",
  "Update a contact/lead's fields. Only the fields you provide will be changed. " +
  "Common use: change status to 'qualified' or 'disqualified', update title or company.",
  {
    id:        z.string().describe("Contact id from search_contacts or get_contact."),
    firstName: z.string().optional(),
    lastName:  z.string().optional(),
    company:   z.string().optional(),
    title:     z.string().optional(),
    status:    z.string().optional().describe("e.g. 'new', 'active', 'qualified', 'disqualified'"),
    source:    z.string().optional(),
    fitScore:  z.number().optional().describe("Fit score 0–100."),
    leadScore: z.number().optional().describe("Lead score 0–100."),
  },
  async ({ id, firstName, lastName, company, title, status, source, fitScore, leadScore }) => {
    const data = await iqpipePatch(`/contacts/${id}`, { firstName, lastName, company, title, status, source, fitScore, leadScore });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: list_deals ──────────────────────────────────────────────────────────

server.tool(
  "list_deals",
  "List deals in the workspace. Filter by stage and/or pipeline. " +
  "Common stages: qualification, proposal, negotiation, closed_won, closed_lost.",
  {
    stage:    z.string().optional().describe("Filter by stage, e.g. 'qualification', 'closed_won'."),
    pipeline: z.string().optional().describe("Filter by pipeline, e.g. 'new_business'."),
    limit:    z.number().int().min(1).max(200).optional().default(50),
  },
  async ({ stage, pipeline, limit }) => {
    const params: Record<string, string> = {};
    if (stage)    params.stage    = stage;
    if (pipeline) params.pipeline = pipeline;
    if (limit)    params.limit    = String(limit);
    const data = await iqpipeGet("/deals", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: create_deal ─────────────────────────────────────────────────────────

server.tool(
  "create_deal",
  "Create a new deal. Name and accountId are required — use list_accounts or create_account first. Stage defaults to 'qualification'; pipeline to 'new_business'; currency to 'USD'.",
  {
    name:             z.string().describe("Deal name (required)."),
    accountId:        z.string().describe("Account id (required). Get from list_accounts or create_account."),
    primaryContactId: z.string().optional().describe("Contact id for the primary contact."),
    stage:            z.string().optional().describe("Pipeline stage. Defaults to 'qualification'."),
    pipeline:         z.string().optional().describe("Pipeline name. Defaults to 'new_business'."),
    amount:           z.number().optional(),
    currency:         z.string().optional().describe("Currency code. Defaults to 'USD'."),
    probability:      z.number().optional().describe("Win probability 0–100."),
    expectedCloseDate: z.string().optional().describe("YYYY-MM-DD format."),
  },
  async ({ name, accountId, primaryContactId, stage, pipeline, amount, currency, probability, expectedCloseDate }) => {
    const data = await iqpipePost("/deals", { name, accountId, primaryContactId, stage, pipeline, amount, currency, probability, expectedCloseDate });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: update_deal ─────────────────────────────────────────────────────────

server.tool(
  "update_deal",
  "Update a deal's fields. Only the fields you provide will be changed. " +
  "Common use: advance stage to 'closed_won' or 'closed_lost', update amount after negotiation.",
  {
    id:               z.string().describe("Deal id from list_deals."),
    name:             z.string().optional(),
    stage:            z.string().optional().describe("e.g. 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'."),
    pipeline:         z.string().optional(),
    amount:           z.number().optional(),
    currency:         z.string().optional(),
    probability:      z.number().optional(),
    expectedCloseDate: z.string().optional().describe("YYYY-MM-DD format."),
    primaryContactId: z.string().optional(),
    accountId:        z.string().optional(),
  },
  async ({ id, name, stage, pipeline, amount, currency, probability, expectedCloseDate, primaryContactId, accountId }) => {
    const data = await iqpipePatch(`/deals/${id}`, { name, stage, pipeline, amount, currency, probability, expectedCloseDate, primaryContactId, accountId });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: list_accounts ───────────────────────────────────────────────────────

server.tool(
  "list_accounts",
  "List accounts/companies in the workspace. Optionally search by name or domain. " +
  "Returns id, name, domain, industry, employee count, lifecycle stage, and contact/deal counts.",
  {
    q:     z.string().optional().describe("Search query — matches name or domain."),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async ({ q, limit }) => {
    const params: Record<string, string> = {};
    if (q)     params.q     = q;
    if (limit) params.limit = String(limit);
    const data = await iqpipeGet("/accounts", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: create_account ──────────────────────────────────────────────────────

server.tool(
  "create_account",
  "Create a new account/company record. Name is required. lifecycleStage defaults to 'prospect'.",
  {
    name:           z.string().describe("Company name (required)."),
    domain:         z.string().optional().describe("Domain, e.g. 'acme.com'."),
    industry:       z.string().optional(),
    employeeCount:  z.number().int().optional(),
    country:        z.string().optional(),
    city:           z.string().optional(),
    websiteUrl:     z.string().optional(),
    lifecycleStage: z.string().optional().describe("e.g. 'prospect', 'lead', 'customer'. Defaults to 'prospect'."),
  },
  async ({ name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage }) => {
    const data = await iqpipePost("/accounts", { name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: update_account ──────────────────────────────────────────────────────

server.tool(
  "update_account",
  "Update an account/company's fields. Only the fields you provide will be changed. " +
  "Common use: advance lifecycleStage to 'customer' after a deal is won.",
  {
    id:             z.string().describe("Account id from list_accounts."),
    name:           z.string().optional(),
    domain:         z.string().optional(),
    industry:       z.string().optional(),
    employeeCount:  z.number().int().optional(),
    country:        z.string().optional(),
    city:           z.string().optional(),
    websiteUrl:     z.string().optional(),
    lifecycleStage: z.string().optional().describe("e.g. 'prospect', 'lead', 'customer', 'churned'."),
  },
  async ({ id, name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage }) => {
    const data = await iqpipePatch(`/accounts/${id}`, { name, domain, industry, employeeCount, country, city, websiteUrl, lifecycleStage });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: get_webhook_url ─────────────────────────────────────────────────────

server.tool(
  "get_webhook_url",
  "Returns the IQPipe webhook URL for a specific app in a workflow mirror. " +
  "Register this URL in the app's dashboard (HubSpot, Instantly, Lemlist, etc.) so IQPipe " +
  "can receive real-time events and correlate them back to the automation that triggered them. " +
  "Call this after setup_workflow_mirror for every webhook-type app you connected.",
  {
    workflowId: z.string().describe("IQPipe workflow ID from list_workflows."),
    appKey:     z.string().describe("App key, e.g. 'hubspot', 'instantly', 'lemlist'. Must be connected to the mirror via setup_workflow_mirror."),
  },
  async ({ workflowId, appKey }) => {
    const data = await iqpipeGet("/webhook-url", { workflowId, appKey });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[iqpipe-mcp] Server running. API: ${API_URL}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iqpipe-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
