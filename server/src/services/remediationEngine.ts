/**
 * remediationEngine.ts
 *
 * Phase 3 — Remediation
 *
 * Maps a diagnosed cause to an executable fix or a precise manual instruction set.
 *
 * Fix taxonomy:
 *   "auto"    — IQPipe can execute the fix immediately with no user input.
 *   "confirm" — Requires confirmed:true before mutating external state.
 *   "manual"  — IQPipe cannot execute; returns step-by-step instructions.
 *
 * Entry point: applyFix(workspaceId, params)
 */

import { prisma } from "../db";
import { setN8nWorkflowActive } from "./n8nClient";
import { setMakeScenarioActive } from "./makeClient";
import { APP_CATALOG } from "../routes/workflowMirror";

// ─── Output types ─────────────────────────────────────────────────────────────

export type FixStatus =
  | "executed"          // fix applied — no further action needed
  | "needs_confirmation"// send back to Claude to ask user, then re-call with confirmed:true
  | "manual_required"   // can't automate — instructions returned
  | "not_applicable"    // cause not recognised or no fix available
  | "error";            // attempted but failed

export interface ManualStep {
  step:        number;
  instruction: string;
}

export interface RemediationResult {
  fixId:       string;
  cause:       string;
  status:      FixStatus;
  /** Human-readable description of what was / will be done */
  description: string;
  /** For webhook fixes: the URL to register in the external tool */
  webhookUrl?:  string;
  /** For workflow activation: the new state */
  workflowActive?: boolean;
  /** For manual fixes: ordered step list */
  instructions?: ManualStep[];
  /** Rough effort estimate for manual fixes */
  estimatedTime?: string;
  /** What Claude should say / do next */
  nextAction:  string;
  /** Any error message if status === "error" */
  error?: string;
}

// ─── Tool-specific manual instruction library ─────────────────────────────────
// Each entry is a function so it can be parametric on tool/workflow name.

type StepFactory = (ctx: FixContext) => ManualStep[];

interface FixContext {
  tool?:         string;
  workflowId?:   string;
  workflowName?: string;
  eventType?:    string;
  webhookUrl?:   string;
}

const TOOL_DASHBOARD_PATHS: Record<string, string> = {
  hubspot:       "Settings → Integrations → Connected Apps → Webhooks",
  salesforce:    "Setup → Integrations → Outbound Messages / Connected Apps",
  pipedrive:     "Settings → Tools and Integrations → Webhooks",
  apollo:        "Settings → Integrations → Webhooks",
  instantly:     "Settings → Integrations → Webhooks",
  lemlist:       "Settings → API → Webhooks",
  smartlead:     "Settings → Integrations → Webhooks",
  heyreach:      "Settings → Webhooks",
  outreach:      "Settings → API → Webhooks",
  replyio:       "Settings → Integrations → Webhooks",
  phantombuster: "Phantom settings → Webhook notifications",
  clay:          "Table settings → Integrations → Webhooks",
  clearbit:      "Account → API → Webhooks",
  hunter:        "Account → API Keys",
  lusha:         "Settings → Integrations → API",
  cognism:       "Settings → Integrations → API Key",
};

function toolPath(tool: string): string {
  return TOOL_DASHBOARD_PATHS[tool] ?? "Settings → Integrations";
}

// ─── Step factories ───────────────────────────────────────────────────────────

const STEPS: Record<string, StepFactory> = {

  webhook_delivery_failed: ({ tool, webhookUrl }) => [
    { step: 1, instruction: `Open your ${tool ?? "tool"} dashboard and navigate to ${toolPath(tool ?? "")}.` },
    { step: 2, instruction: `Look for the IQPipe webhook endpoint. It should point to: ${webhookUrl ?? "(see webhookUrl field above)"}.` },
    { step: 3, instruction: "Check if the endpoint is active/enabled. If disabled, re-enable it." },
    { step: 4, instruction: "Send a test event. If delivery fails with a network error, check if your firewall or IP whitelist is blocking IQPipe's server IP." },
    { step: 5, instruction: "Once fixed, run get_live_feed in IQPipe to confirm events are flowing." },
  ],

  api_key_rotated_or_revoked: ({ tool }) => [
    { step: 1, instruction: `In IQPipe, go to Settings → Connected Apps → ${tool ?? "the affected app"} and click Reconnect.` },
    { step: 2, instruction: `In your ${tool ?? "tool"} dashboard, generate a new API key or retrieve your existing key from ${toolPath(tool ?? "")}.` },
    { step: 3, instruction: "Paste the new API key into IQPipe's reconnect form and save." },
    { step: 4, instruction: "IQPipe will automatically verify the key and resume event collection within 5 minutes." },
  ],

  rate_limit_or_quota_exhausted: ({ tool }) => [
    { step: 1, instruction: `Log into your ${tool ?? "tool"} account and check your plan usage / API quota in ${toolPath(tool ?? "")}.` },
    { step: 2, instruction: "If you've hit the plan limit, upgrade your plan or wait for the quota to reset (usually monthly)." },
    { step: 3, instruction: "If you suspect an unintended spike in API calls, review active workflows sending events to that tool." },
    { step: 4, instruction: "After resolving the quota, IQPipe will resume receiving events automatically." },
  ],

  integration_disconnected: ({ tool }) => [
    { step: 1, instruction: `In IQPipe, go to Settings → Connected Apps and find ${tool ?? "the disconnected integration"}.` },
    { step: 2, instruction: "Click Reconnect and follow the OAuth or API key flow to re-authenticate." },
    { step: 3, instruction: "If the button is greyed out, your plan may not include this integration. Check Settings → Billing." },
  ],

  never_received_events: ({ tool, webhookUrl }) => [
    { step: 1, instruction: `Confirm you have an active ${tool ?? "tool"} account with events happening (contacts created, emails sent, etc.).` },
    { step: 2, instruction: `In your ${tool ?? "tool"} dashboard, go to ${toolPath(tool ?? "")} and add a new webhook endpoint.` },
    { step: 3, instruction: `Paste the IQPipe webhook URL: ${webhookUrl ?? "Get it from get_webhook_url in IQPipe"}.` },
    { step: 4, instruction: "Select all event types you want IQPipe to track (at minimum: contact.creation, deal.creation)." },
    { step: 5, instruction: "Save and trigger a test event. It should appear in IQPipe's Live Feed within 30 seconds." },
  ],

  workflow_processing_errors: ({ workflowName }) => [
    { step: 1, instruction: `In IQPipe, open the Workflow Health page and find "${workflowName ?? "the affected workflow"}".` },
    { step: 2, instruction: "Click on the workflow to see the list of failed events and their error messages." },
    { step: 3, instruction: "Common causes: contact field missing required data, invalid email format, or the downstream app rejected the payload." },
    { step: 4, instruction: "Fix the data mapping in your n8n/Make workflow and re-process failed events if your plan supports it." },
  ],

  recent_failure_spike: ({ workflowName }) => [
    { step: 1, instruction: `Check the last time "${workflowName ?? "the workflow"}" was modified. A recent edit likely introduced the issue.` },
    { step: 2, instruction: "In n8n or Make, compare the current version with the previous version (use version history if available)." },
    { step: 3, instruction: "Revert the last change or fix the broken node/module." },
    { step: 4, instruction: "Run a manual test execution and confirm the success rate improves." },
  ],

  persistent_processing_errors: ({ workflowName }) => [
    { step: 1, instruction: `Open Workflow Health in IQPipe and review error patterns for "${workflowName ?? "the workflow"}".` },
    { step: 2, instruction: "Group errors by type. If >50% are the same error, that's your root cause." },
    { step: 3, instruction: "Fix the underlying data or mapping issue in your n8n/Make workflow." },
    { step: 4, instruction: "Consider adding error-handling nodes in your workflow to catch and log failures rather than dropping events." },
  ],

  all_source_tools_silent: ({ tool }) => [
    { step: 1, instruction: "Multiple tools feeding this event type are silent. Run diagnose_issue for each silent tool individually." },
    { step: 2, instruction: `Start with the tool that produces the most volume. In IQPipe, check Settings → Connected Apps for each.` },
    { step: 3, instruction: "Reconnect any disconnected integrations and verify webhook URLs are registered in each tool's dashboard." },
  ],

  partial_source_tool_failure: ({ tool }) => [
    { step: 1, instruction: "Some of the tools producing this event type are silent. Run diagnose_issue for each silent tool to get specific fixes." },
    { step: 2, instruction: "Events may still flow from the healthy tools, but volume will be reduced until all tools are restored." },
  ],

  upstream_funnel_step_broken: ({ eventType }) => [
    { step: 1, instruction: `"${eventType ?? "this event"}" requires an upstream event to happen first. The upstream step is also silent.` },
    { step: 2, instruction: "Run diagnose_issue for the upstream event type to find the root cause there." },
    { step: 3, instruction: "Fix the upstream issue first — the downstream event type will recover automatically once the funnel is flowing." },
  ],

  event_type_filter_removed_or_trigger_changed: ({ eventType, workflowName }) => [
    { step: 1, instruction: `Open the n8n or Make workflow that produced "${eventType ?? "this event"}" (${workflowName ?? "check Workflow Health"}).` },
    { step: 2, instruction: "Check the trigger node or the IQPipe event-send step for recently changed filters or conditions." },
    { step: 3, instruction: `Ensure "${eventType ?? "the event type"}" is still included in the events being sent to IQPipe.` },
    { step: 4, instruction: "Publish the workflow and trigger a test event to verify it flows through." },
  ],

  app_connection_broken: ({ tool, webhookUrl }) => [
    { step: 1, instruction: `In IQPipe, go to Settings → Workflow Mirror and find the workflow using ${tool ?? "the affected app"}.` },
    { step: 2, instruction: "Click on the broken app connection and click Reconnect." },
    { step: 3, instruction: webhookUrl
      ? `Re-register the webhook URL in your ${tool ?? "app"} dashboard: ${webhookUrl}`
      : `After reconnecting, use get_webhook_url to get the updated webhook URL and re-register it in ${tool ?? "the app"}'s dashboard.` },
  ],
};

function getSteps(cause: string, ctx: FixContext): ManualStep[] {
  const factory = STEPS[cause];
  if (factory) return factory(ctx);
  return [
    { step: 1, instruction: `Cause "${cause}" detected. Check the affected integration in IQPipe Settings → Connected Apps.` },
    { step: 2, instruction: "If the issue persists, contact IQPipe support with the diagnostic report." },
  ];
}

// ─── Core fix dispatch ────────────────────────────────────────────────────────

export async function applyFix(
  workspaceId: string,
  params: {
    cause:       string;
    tool?:       string;
    workflowId?: string;
    eventType?:  string;
    confirmed?:  boolean;
    baseUrl?:    string;  // server base URL for webhook URL generation
  }
): Promise<RemediationResult> {
  const { cause, tool, workflowId, eventType, confirmed = false, baseUrl = "" } = params;

  // ── Fetch webhook URL for tool if available ────────────────────────────────
  async function getWebhookUrlForTool(toolKey: string): Promise<string | null> {
    if (!workflowId) return null;
    const mirror = await prisma.workflowMirror.findFirst({
      where:   { workspaceId, workflowId },
      include: { appConnections: { where: { appKey: toolKey } } },
    });
    if (!mirror || !mirror.appConnections[0]) return null;
    const conn = mirror.appConnections[0] as any;
    if (conn.connectionType === "polling") return null;
    return `${baseUrl}/api/app-webhooks/${toolKey}?workspaceId=${workspaceId}&mirrorId=${mirror.id}`;
  }

  // ── 1. Webhook delivery failed — return fresh URL ─────────────────────────
  if (cause === "webhook_delivery_failed" || cause === "app_connection_broken") {
    const targetTool = tool ?? "";
    const webhookUrl = await getWebhookUrlForTool(targetTool);

    if (webhookUrl) {
      return {
        fixId:       `${cause}_${targetTool}_webhook`,
        cause,
        status:      "executed",
        description: `Fresh webhook URL retrieved for ${targetTool}. Register this URL in the ${targetTool} dashboard to restore event delivery.`,
        webhookUrl,
        instructions: getSteps(cause, { tool: targetTool, webhookUrl }),
        estimatedTime: "2 minutes",
        nextAction: `Present the webhook URL to the user and ask them to register it in ${targetTool}'s webhook settings. Guide them with the steps provided.`,
      };
    }

    // No mirror found — fall back to manual
    return {
      fixId:        `${cause}_${targetTool}_manual`,
      cause,
      status:       "manual_required",
      description:  `Could not find a WorkflowMirror for ${targetTool}. Provide the user with manual instructions.`,
      instructions: getSteps(cause, { tool: targetTool }),
      estimatedTime: "5 minutes",
      nextAction:   "Walk the user through registering or verifying the webhook URL in their tool's dashboard.",
    };
  }

  // ── 2. n8n workflow not triggering — re-activate ───────────────────────────
  if ((cause === "workflow_not_triggering" || cause === "recent_failure_spike") && workflowId) {
    const wfMeta = await prisma.n8nWorkflowMeta.findFirst({
      where:  { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] },
      select: { id: true, n8nId: true, name: true, active: true },
    });

    if (wfMeta && !wfMeta.active) {
      if (!confirmed) {
        return {
          fixId:       `activate_n8n_${workflowId}`,
          cause,
          status:      "needs_confirmation",
          description: `Workflow "${wfMeta.name}" is inactive. IQPipe can re-activate it via the n8n API.`,
          nextAction:  `Ask the user: "IQPipe can re-activate the n8n workflow "${wfMeta.name}" automatically. Confirm to proceed? (re-call apply_fix with confirmed:true)"`,
        };
      }

      const result = await setN8nWorkflowActive(workspaceId, wfMeta.n8nId, true);
      if (result.ok) {
        return {
          fixId:          `activate_n8n_${workflowId}`,
          cause,
          status:         "executed",
          description:    `n8n workflow "${wfMeta.name}" has been re-activated via the n8n API.`,
          workflowActive: true,
          nextAction:     `Confirm to the user that the workflow is now active. Suggest running get_workflow_health in 5 minutes to verify the success rate is recovering.`,
        };
      }

      return {
        fixId:       `activate_n8n_${workflowId}`,
        cause,
        status:      "error",
        description: `Failed to re-activate n8n workflow "${wfMeta.name}".`,
        error:       result.error,
        nextAction:  `Inform the user the automatic activation failed (${result.error}). Fall back to manual instructions: open n8n, find the workflow, and toggle it active.`,
      };
    }

    // Make scenario fallback
    const makeMeta = await prisma.makeScenarioMeta.findFirst({
      where:  { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] },
      select: { id: true, makeId: true, name: true, active: true },
    });

    if (makeMeta && !makeMeta.active) {
      if (!confirmed) {
        return {
          fixId:       `activate_make_${workflowId}`,
          cause,
          status:      "needs_confirmation",
          description: `Make.com scenario "${makeMeta.name}" is inactive. IQPipe can resume it via the Make API.`,
          nextAction:  `Ask the user: "IQPipe can resume the Make scenario "${makeMeta.name}" automatically. Confirm to proceed? (re-call apply_fix with confirmed:true)"`,
        };
      }

      const result = await setMakeScenarioActive(workspaceId, makeMeta.makeId, true);
      if (result.ok) {
        return {
          fixId:          `activate_make_${workflowId}`,
          cause,
          status:         "executed",
          description:    `Make.com scenario "${makeMeta.name}" has been resumed via the Make API.`,
          workflowActive: true,
          nextAction:     `Confirm to the user the scenario is now running. Suggest checking Make.com's scenario history to verify executions are succeeding.`,
        };
      }

      return {
        fixId:       `activate_make_${workflowId}`,
        cause,
        status:      "error",
        description: `Failed to resume Make.com scenario "${makeMeta.name}".`,
        error:       result.error,
        nextAction:  `Inform the user the automatic activation failed (${result.error}). Ask them to open Make.com and manually click "Run once" or enable scheduling.`,
      };
    }
  }

  // ── 3. Integration disconnected — reconnect instructions ──────────────────
  if (cause === "integration_disconnected" || cause === "api_key_rotated_or_revoked") {
    const ctx: FixContext = { tool, workflowId, eventType };
    return {
      fixId:        `${cause}_${tool ?? workflowId ?? "unknown"}`,
      cause,
      status:       "manual_required",
      description:  `This fix requires the user to re-enter credentials. IQPipe cannot change external API keys autonomously.`,
      instructions: getSteps(cause, ctx),
      estimatedTime: "3 minutes",
      nextAction:   `Present the steps to the user. After they reconnect, call get_live_feed to verify events are flowing again.`,
    };
  }

  // ── 4. Never received events — full webhook setup walkthrough ─────────────
  if (cause === "never_received_events") {
    const webhookUrl = tool ? await getWebhookUrlForTool(tool) : null;
    const ctx: FixContext = { tool, webhookUrl: webhookUrl ?? undefined };
    return {
      fixId:        `setup_${tool ?? "unknown"}`,
      cause,
      status:       "manual_required",
      description:  `${tool ?? "The tool"} has never sent events to IQPipe. Walk the user through the initial webhook setup.`,
      instructions: getSteps(cause, ctx),
      estimatedTime: "5 minutes",
      nextAction:   `Guide the user step by step. Once they complete step 5, call get_live_feed to confirm the first event appears.`,
    };
  }

  // ── 5. Rate limit / quota ─────────────────────────────────────────────────
  if (cause === "rate_limit_or_quota_exhausted") {
    return {
      fixId:        `quota_${tool ?? "unknown"}`,
      cause,
      status:       "manual_required",
      description:  `${tool ?? "The tool"} appears to be rate-limited or quota-exhausted.`,
      instructions: getSteps(cause, { tool }),
      estimatedTime: "10 minutes",
      nextAction:   `Ask the user to check their ${tool ?? "tool"} plan quota. Events will resume automatically once quota resets or plan is upgraded.`,
    };
  }

  // ── 6. Event-type disappearance causes ────────────────────────────────────
  if (
    cause === "upstream_funnel_step_broken" ||
    cause === "event_type_filter_removed_or_trigger_changed" ||
    cause === "all_source_tools_silent" ||
    cause === "partial_source_tool_failure"
  ) {
    const workflowName = workflowId
      ? (await prisma.n8nWorkflowMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] }, select: { name: true } }))?.name
        ?? (await prisma.makeScenarioMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] }, select: { name: true } }))?.name
        ?? workflowId
      : undefined;

    return {
      fixId:        `${cause}_${eventType ?? tool ?? "unknown"}`,
      cause,
      status:       "manual_required",
      description:  `Fix requires investigation across multiple tools or funnel steps.`,
      instructions: getSteps(cause, { tool, eventType, workflowName }),
      estimatedTime: "15 minutes",
      nextAction:   `Work through the steps with the user. For "all_source_tools_silent", suggest calling diagnose_issue for each affected tool individually.`,
    };
  }

  // ── 7. Workflow processing errors / failure spikes ────────────────────────
  if (cause === "workflow_processing_errors" || cause === "persistent_processing_errors") {
    const workflowName = workflowId
      ? (await prisma.n8nWorkflowMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { n8nId: workflowId }] }, select: { name: true } }))?.name
        ?? (await prisma.makeScenarioMeta.findFirst({ where: { workspaceId, OR: [{ id: workflowId }, { makeId: workflowId }] }, select: { name: true } }))?.name
        ?? workflowId
      : undefined;

    return {
      fixId:        `${cause}_${workflowId ?? "unknown"}`,
      cause,
      status:       "manual_required",
      description:  `Workflow has persistent processing failures. Review error details in Workflow Health.`,
      instructions: getSteps(cause, { workflowName }),
      estimatedTime: "20 minutes",
      nextAction:   `Direct the user to Workflow Health to read the actual error messages. Once they've fixed the mapping issue, call get_workflow_health to verify recovery.`,
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    fixId:        `unknown_${cause}`,
    cause,
    status:       "not_applicable",
    description:  `No automated fix available for cause "${cause}".`,
    instructions: getSteps(cause, { tool, eventType }),
    estimatedTime: "varies",
    nextAction:   `Inform the user IQPipe cannot automate this fix. Present the general instructions and offer to diagnose further if needed.`,
  };
}
