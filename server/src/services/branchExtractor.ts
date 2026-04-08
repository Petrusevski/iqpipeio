/**
 * branchExtractor.ts
 *
 * Parses imported n8n workflow and Make.com scenario structures to detect
 * branching nodes (IF, Switch, Router, Filter) and extract one
 * WorkflowBranchDef row per output port.
 *
 * Called by syncN8nConnection() and syncMakeConnection() after each workflow
 * upsert. Idempotent — re-running on the same workflow replaces existing rows.
 *
 * Output: WorkflowBranchDef rows describing:
 *   - which conditional node creates the split
 *   - which output port (0 = TRUE/first route, 1 = FALSE/second, …)
 *   - a human-readable condition summary
 *   - which apps / event types are reachable downstream from that port
 *   - what the inferred primary channel is (email / linkedin / phone / sms)
 */

import { prisma } from "../db";

// ─── Channel classification ────────────────────────────────────────────────────

/**
 * App slug → outreach channel.
 * Slugs match n8n node type suffixes and Make module prefixes.
 */
const APP_CHANNEL: Record<string, string> = {
  // LinkedIn
  heyreach: "linkedin", expandi: "linkedin", dripify: "linkedin",
  waalaxy: "linkedin", meetalfred: "linkedin", phantombuster: "linkedin",
  linkedIn: "linkedin", linkedin: "linkedin", lempod: "linkedin",

  // Email
  lemlist: "email", instantly: "email", smartlead: "email",
  mailshake: "email", apollo: "email", gmail: "email",
  sendgrid: "email", mailgun: "email", smtp: "email",
  outlook: "email", microsoftOutlook: "email",
  replyio: "email", salesloft: "email", outreach: "email",
  klenty: "email",

  // Phone
  aircall: "phone", dialpad: "phone", kixie: "phone",
  orum: "phone", ringcentral: "phone", openphone: "phone",
  vonage: "phone",

  // SMS / WhatsApp
  twilio: "sms", sakari: "sms", wati: "sms",
};

/** Which IQPipe event types each channel fires. */
const CHANNEL_EVENTS: Record<string, string[]> = {
  linkedin: ["connection_sent", "connection_request_sent", "connection_accepted",
             "message_sent", "inmail_sent", "reply_received", "follow_sent"],
  email:    ["email_sent", "sequence_started", "email_opened", "email_clicked", "reply_received"],
  phone:    ["call_initiated", "call_completed", "voicemail_left"],
  sms:      ["sms_sent", "sms_received", "whatsapp_sent", "whatsapp_received"],
  mixed:    [],
  unknown:  [],
};

function inferChannel(appSlugs: string[]): string {
  const channels = [...new Set(appSlugs.map(s => APP_CHANNEL[s]).filter(Boolean))];
  if (channels.length === 0) return "unknown";
  if (channels.length === 1) return channels[0];
  return "mixed";
}

// ─── n8n branch extraction ─────────────────────────────────────────────────────

const N8N_BRANCH_TYPES = new Set(["if", "switch"]);

/** Strip package prefix and Trigger suffix from n8n node type strings. */
function n8nSlug(nodeType: string): string {
  const parts = nodeType.split(".");
  return parts[parts.length - 1].replace(/Trigger$/, "").toLowerCase();
}

/**
 * Walk all nodes reachable downstream from a set of target node names,
 * stopping at other branch nodes (they get their own rows).
 * Returns the set of app slugs found.
 */
function walkN8nDownstream(
  startTargets: string[],
  nodeByName: Record<string, any>,
  connections: Record<string, any>,
  visited = new Set<string>(),
): string[] {
  const apps  = new Set<string>();
  const queue = [...startTargets];

  while (queue.length) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);

    const node = nodeByName[name];
    if (!node) continue;

    const slug = n8nSlug(node.type ?? "");
    if (APP_CHANNEL[slug]) apps.add(slug);

    // Don't cross into another branch node's sub-tree — it gets its own rows
    if (N8N_BRANCH_TYPES.has(slug)) continue;

    const nodePorts: any[][] = connections[name]?.main ?? [];
    for (const portTargets of nodePorts) {
      for (const t of portTargets ?? []) {
        if (t?.node && !visited.has(t.node)) queue.push(t.node);
      }
    }
  }

  return [...apps];
}

/** Turn n8n IF/Switch parameters into a one-line human-readable string. */
function n8nConditionSummary(params: any, port: number): string | null {
  try {
    // n8n IF: conditions.string | conditions.number | conditions.boolean | conditions.dateTime
    const conds = params?.conditions ?? {};
    const allConds: any[] = [
      ...(conds.string  ?? []),
      ...(conds.number  ?? []),
      ...(conds.boolean ?? []),
      ...(conds.dateTime ?? []),
      // newer n8n uses a flat array
      ...(Array.isArray(conds.conditions) ? conds.conditions : []),
    ];

    if (allConds.length > 0 && port === 0) {
      const c = allConds[0];
      const field = (c.value1 ?? c.leftValue ?? "").replace(/\{\{.*?\}\}/g, "").replace(/[^a-zA-Z0-9_.]/g, "").trim() || "field";
      const op    = c.operation ?? c.operator ?? "unknown";
      const val   = c.value2 ?? c.rightValue ?? "";
      return `${field} ${op}${val ? ` "${val}"` : ""}`.slice(0, 120);
    }

    // Switch: rules
    const rules: any[] = params?.rules?.rules ?? params?.rules ?? [];
    if (rules.length > port) {
      const r = rules[port];
      const field = (r.value1 ?? "field").replace(/[^a-zA-Z0-9_.]/g, "").trim();
      const op    = r.operation ?? "equals";
      const val   = r.value2 ?? "";
      return `${field} ${op}${val ? ` "${val}"` : ""}`.slice(0, 120);
    }

    if (port === 0) return "condition = TRUE";
    if (port === 1) return "condition = FALSE (fallback)";
    return `output ${port}`;
  } catch {
    return null;
  }
}

interface BranchRow {
  platform: string;
  nativeWorkflowId: string;
  workflowName: string;
  branchNodeId: string;
  branchNodeName: string;
  branchNodeType: string;
  branchPort: number;
  branchLabel: string;
  conditionSummary: string | null;
  conditionRaw: string | null;
  primaryChannel: string;
  downstreamApps: string;
  expectedEventTypes: string;
}

export function extractN8nBranches(
  workflowId:   string,
  workflowName: string,
  nodes:        any[],
  connections:  Record<string, any>,
): BranchRow[] {
  const nodeByName: Record<string, any> = {};
  for (const n of nodes) nodeByName[n.name] = n;

  const rows: BranchRow[] = [];

  for (const node of nodes) {
    const slug = n8nSlug(node.type ?? "");
    if (!N8N_BRANCH_TYPES.has(slug)) continue;

    const ports: any[][] = connections[node.name]?.main ?? [];
    if (ports.length === 0) continue;

    for (let port = 0; port < ports.length; port++) {
      const portTargets: string[] = (ports[port] ?? []).map((t: any) => t?.node).filter(Boolean);

      const appSlugs       = walkN8nDownstream(portTargets, nodeByName, connections);
      const primaryChannel = inferChannel(appSlugs);
      const expected       = CHANNEL_EVENTS[primaryChannel] ?? [];

      let label = port === 0 ? "TRUE" : "FALSE";
      if (slug === "switch") label = `Case ${port + 1}`;
      if (port === ports.length - 1 && slug === "switch") label = "Fallback";

      const condRaw = JSON.stringify(
        node.parameters?.conditions ?? node.parameters?.rules ?? {}
      ).slice(0, 1000);

      rows.push({
        platform:          "n8n",
        nativeWorkflowId:  workflowId,
        workflowName,
        branchNodeId:      node.id ?? node.name,
        branchNodeName:    node.name,
        branchNodeType:    slug,
        branchPort:        port,
        branchLabel:       label,
        conditionSummary:  n8nConditionSummary(node.parameters, port),
        conditionRaw:      condRaw,
        primaryChannel,
        downstreamApps:    JSON.stringify(appSlugs),
        expectedEventTypes: JSON.stringify(expected),
      });
    }
  }

  return rows;
}

// ─── Make.com branch extraction ────────────────────────────────────────────────

const MAKE_BRANCH_MODULES = new Set(["flow:router", "flow:filter"]);

/** Collect all app-bearing module prefixes reachable in a Make flow array. */
function walkMakeFlow(flow: any[]): string[] {
  const apps = new Set<string>();

  for (const mod of flow ?? []) {
    const prefix = (mod.module ?? "").split(":")[0];
    if (APP_CHANNEL[prefix]) apps.add(prefix);

    // Recurse into routes of nested routers
    if (mod.module === "flow:router") {
      for (const route of mod.routes ?? []) {
        for (const slug of walkMakeFlow(route.flow ?? [])) apps.add(slug);
      }
    }
  }

  return [...apps];
}

/** Summarise a Make filter condition set into one readable line. */
function makeConditionSummary(filter: any): string | null {
  if (!filter) return null;
  if (filter.name) return filter.name.slice(0, 120);
  try {
    const cond = filter.conditions?.[0]?.[0];
    if (!cond) return null;
    const field = (cond.a ?? "").replace(/\{\{.*?\}\}/g, "").trim() || "field";
    const op    = cond.o ?? "ne";
    const val   = cond.b ?? "";
    return `${field} ${op}${val ? ` "${val}"` : ""}`.slice(0, 120);
  } catch {
    return null;
  }
}

export function extractMakeBranches(
  scenarioId:   string,
  scenarioName: string,
  flow:         any[],
): BranchRow[] {
  const rows: BranchRow[] = [];

  function processFlow(modules: any[]) {
    for (const mod of modules ?? []) {
      if (mod.module === "flow:router") {
        const routes: any[] = mod.routes ?? [];

        for (let port = 0; port < routes.length; port++) {
          const route       = routes[port];
          const appSlugs    = walkMakeFlow(route.flow ?? []);
          const channel     = inferChannel(appSlugs);
          const expected    = CHANNEL_EVENTS[channel] ?? [];
          const filter      = route.filter ?? null;

          // Last route with no filter = fallback
          const isFallback  = !filter && port === routes.length - 1;
          const label       = filter?.name
            ? filter.name.slice(0, 60)
            : isFallback ? "Fallback (no filter)"
            : `Route ${port + 1}`;

          rows.push({
            platform:          "make",
            nativeWorkflowId:  scenarioId,
            workflowName:      scenarioName,
            branchNodeId:      String(mod.id),
            branchNodeName:    `Router (module ${mod.id})`,
            branchNodeType:    "router",
            branchPort:        port,
            branchLabel:       label,
            conditionSummary:  makeConditionSummary(filter),
            conditionRaw:      JSON.stringify(filter ?? {}).slice(0, 1000),
            primaryChannel:    channel,
            downstreamApps:    JSON.stringify(appSlugs),
            expectedEventTypes: JSON.stringify(expected),
          });

          // Recurse into the route's own flow
          processFlow(route.flow ?? []);
        }
      } else if (mod.module === "flow:filter") {
        // Standalone filter — two implicit branches: pass / stop
        const filter   = mod.filter ?? null;
        const label    = filter?.name ? filter.name.slice(0, 60) : "Filter";

        // We only record the "pass" branch (port 0) — "stop" is implicit
        rows.push({
          platform:          "make",
          nativeWorkflowId:  scenarioId,
          workflowName:      scenarioName,
          branchNodeId:      String(mod.id),
          branchNodeName:    `Filter (module ${mod.id})`,
          branchNodeType:    "filter",
          branchPort:        0,
          branchLabel:       `${label} — pass`,
          conditionSummary:  makeConditionSummary(filter),
          conditionRaw:      JSON.stringify(filter ?? {}).slice(0, 1000),
          primaryChannel:    "unknown",  // filter doesn't split channels, just gates them
          downstreamApps:    "[]",
          expectedEventTypes: "[]",
        });
      }
    }
  }

  processFlow(flow);
  return rows;
}

// ─── DB upsert ─────────────────────────────────────────────────────────────────

/**
 * Persist branch definitions for one workflow.
 * Deletes stale rows (branches removed since last sync) then upserts all current ones.
 */
export async function syncWorkflowBranches(
  workspaceId: string,
  rows: BranchRow[],
): Promise<void> {
  if (rows.length === 0) {
    // Clear any previously extracted branches if the workflow no longer has any
    await prisma.workflowBranchDef.deleteMany({
      where: {
        workspaceId,
        platform:         rows[0]?.platform          ?? "__none__",
        nativeWorkflowId: rows[0]?.nativeWorkflowId  ?? "__none__",
      },
    });
    return;
  }

  const { platform, nativeWorkflowId } = rows[0];

  // Remove rows for ports that no longer exist in the current workflow
  await prisma.workflowBranchDef.deleteMany({
    where: { workspaceId, platform, nativeWorkflowId },
  });

  // Upsert all current branches
  for (const row of rows) {
    await prisma.workflowBranchDef.upsert({
      where: {
        workspaceId_platform_nativeWorkflowId_branchNodeId_branchPort: {
          workspaceId,
          platform:         row.platform,
          nativeWorkflowId: row.nativeWorkflowId,
          branchNodeId:     row.branchNodeId,
          branchPort:       row.branchPort,
        },
      },
      create: { workspaceId, ...row, syncedAt: new Date(), updatedAt: new Date() },
      update: {
        workflowName:       row.workflowName,
        branchNodeName:     row.branchNodeName,
        branchLabel:        row.branchLabel,
        conditionSummary:   row.conditionSummary,
        conditionRaw:       row.conditionRaw,
        primaryChannel:     row.primaryChannel,
        downstreamApps:     row.downstreamApps,
        expectedEventTypes: row.expectedEventTypes,
        updatedAt:          new Date(),
      },
    });
  }
}
