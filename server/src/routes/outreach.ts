/**
 * outreach.ts — GET /api/outreach/*
 *
 * REST endpoints that expose the outreach observability data
 * to the authenticated frontend (JWT auth, not MCP API key).
 *
 * Routes:
 *   GET /api/outreach/overview
 *   GET /api/outreach/stuck-leads
 *   GET /api/outreach/sequence-funnel/:sequenceId
 *   GET /api/outreach/webhook-reliability
 *   GET /api/outreach/improvement-report
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getOutreachOverview,
  getStuckLeads,
  getSequenceFunnel,
  getWebhookReliability,
  getOutcomeAttribution,
} from "../services/outreachQueryService";
import {
  fetchAllWorkflowMetrics,
  scoreWorkflows,
  enrichWithBranches,
} from "../services/workflowScoreService";
import { prisma } from "../db";

const router = Router();

// ─── GET /api/outreach/overview ───────────────────────────────────────────────
router.get("/overview", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const data = await getOutreachOverview(workspaceId);
    return res.json(data);
  } catch (err) {
    console.error("[outreach/overview]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/outreach/stuck-leads ───────────────────────────────────────────
router.get("/stuck-leads", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const daysSilent  = parseInt((req.query.daysSilent as string) ?? "5", 10);
  const limit       = parseInt((req.query.limit as string) ?? "50", 10);
  const sequenceId  = req.query.sequenceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const data = await getStuckLeads(workspaceId, { daysSilent, limit, sequenceId });
    return res.json(data);
  } catch (err) {
    console.error("[outreach/stuck-leads]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/outreach/sequence-funnel/:sequenceId ───────────────────────────
router.get("/sequence-funnel/:sequenceId", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const { sequenceId } = req.params;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const data = await getSequenceFunnel(workspaceId, sequenceId);
    return res.json(data);
  } catch (err) {
    console.error("[outreach/sequence-funnel]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/outreach/webhook-reliability ───────────────────────────────────
router.get("/webhook-reliability", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const hours       = parseInt((req.query.hours as string) ?? "720", 10); // 30d default
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const data = await getWebhookReliability(workspaceId, { hours });
    return res.json(data);
  } catch (err) {
    console.error("[outreach/webhook-reliability]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/outreach/improvement-report ────────────────────────────────────
router.get("/improvement-report", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const days        = parseInt((req.query.days as string) ?? "30", 10);
  const workflowId  = req.query.workflowId as string | undefined;
  const sequenceId  = req.query.sequenceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const period = `${days}d`;
  const since  = new Date(Date.now() - days * 86_400_000);

  try {
    const [overviewRaw, stuckLeads, webhookHealth, outreachOverview] = await Promise.all([
      (async () => {
        const allMetrics = await fetchAllWorkflowMetrics(workspaceId, {
          ids: workflowId ? [workflowId] : [],
          platform: "all",
          since,
        });
        if (allMetrics.length === 0) return null;
        const ws      = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultCurrency: true } });
        const scored  = scoreWorkflows(allMetrics, 5000, ws?.defaultCurrency ?? "USD");
        return enrichWithBranches(workspaceId, scored);
      })(),
      getStuckLeads(workspaceId, { sequenceId, daysSilent: 5, limit: 20 }),
      getWebhookReliability(workspaceId, { hours: days * 24 }),
      getOutreachOverview(workspaceId),
    ]);

    const funnelData = sequenceId
      ? await getSequenceFunnel(workspaceId, sequenceId)
      : null;

    // ── Issue detection ────────────────────────────────────────────────────
    const issues: {
      severity:    "critical" | "warning" | "info";
      category:    string;
      title:       string;
      detail:      string;
      workflowId?: string;
      metric?:     Record<string, unknown>;
    }[] = [];

    if (overviewRaw) {
      for (const w of overviewRaw) {
        if (w.pillars.reliability < 70 && w.metrics.reliability.total > 0) {
          issues.push({
            severity: "critical", category: "workflow_reliability",
            title:  `${w.name} has low reliability (${w.pillars.reliability}%)`,
            detail: `${w.metrics.reliability.failed} failed events out of ${w.metrics.reliability.total} in the last ${period}.`,
            workflowId: w.id,
            metric: { successRate: w.pillars.reliability, failedEvents: w.metrics.reliability.failed },
          });
        }
        if (w.leakage.totalLoss > 5000) {
          issues.push({
            severity: w.leakage.totalLoss > 20000 ? "critical" : "warning",
            category: "revenue_leakage",
            title:  `${w.name} leaking ~$${w.leakage.totalLoss.toLocaleString()}`,
            detail: `Top leak: ${w.leakage.breakdown[0]?.eventType ?? "unknown"} (${w.leakage.breakdown[0]?.failedCount ?? 0} failed events).`,
            workflowId: w.id,
            metric: { totalLoss: w.leakage.totalLoss, topLeaks: w.leakage.breakdown.slice(0, 2) },
          });
        }
        for (const b of w.branches) {
          if (b.leadsEntered > 20 && b.conversionRate === 0) {
            issues.push({
              severity: "warning", category: "branch_dead",
              title:  `Branch "${b.label}" in ${w.name} has 0% conversion (${b.channel})`,
              detail: `${b.leadsEntered} leads entered with no positive outcome.`,
              workflowId: w.id,
              metric: { branch: b.label, channel: b.channel, leadsEntered: b.leadsEntered },
            });
          }
        }
      }
    }

    for (const t of webhookHealth.tools) {
      if (t.processRate < 70 && t.total > 10) {
        issues.push({
          severity: t.processRate < 40 ? "critical" : "warning",
          category: "webhook_reliability",
          title:  `${t.tool} webhooks: only ${t.processRate}% processed`,
          detail: `${t.droppedQuota} dropped (quota), ${t.droppedNoId} no identity, ${t.errors} errors out of ${t.total} total.`,
          metric: { tool: t.tool, processRate: t.processRate, droppedNoId: t.droppedNoId },
        });
      }
    }

    const neverReplied = stuckLeads.filter((l: any) => !l.hasReplied);
    if (neverReplied.length > 10) {
      issues.push({
        severity: "warning", category: "stuck_leads",
        title:  `${neverReplied.length} leads stuck with no reply (5+ days silent)`,
        detail: `Top stuck: ${neverReplied.slice(0, 3).map((l: any) => `${l.displayName} @ ${l.company ?? "unknown"} (${l.daysSilent}d silent)`).join(", ")}.`,
        metric: { stuckCount: neverReplied.length, sampleLeads: neverReplied.slice(0, 5).map((l: any) => ({ name: l.displayName, company: l.company, daysSilent: l.daysSilent })) },
      });
    }

    if (funnelData) {
      const biggestDrop = funnelData.steps
        .filter((s: any) => s.conversionFromPrev !== null && s.conversionFromPrev < 30)
        .sort((a: any, b: any) => (a.conversionFromPrev ?? 100) - (b.conversionFromPrev ?? 100))[0];
      if (biggestDrop) {
        const dropRate = biggestDrop.conversionFromPrev ?? 0;
        issues.push({
          severity: dropRate < 10 ? "critical" : "warning",
          category: "funnel_bottleneck",
          title:  `Sequence ${sequenceId}: ${dropRate}% conversion at ${biggestDrop.eventType}`,
          detail: `Only ${biggestDrop.leadCount} of ${funnelData.entryLeads} leads reached this step.`,
          metric: { stage: biggestDrop.eventType, leadCount: biggestDrop.leadCount, entryLeads: funnelData.entryLeads, conversionFromPrev: dropRate },
        });
      }
    }

    for (const seq of outreachOverview.sequences) {
      if (seq.totalLeads > 50 && seq.replyRate < 2) {
        issues.push({
          severity: "warning", category: "sequence_performance",
          title:  `Sequence ${seq.sequenceId} has ${seq.replyRate}% reply rate`,
          detail: `${seq.totalLeads} leads contacted via ${seq.tool}, only ${seq.replies} replied.`,
          metric: { sequenceId: seq.sequenceId, tool: seq.tool, totalLeads: seq.totalLeads, replyRate: seq.replyRate },
        });
      }
    }

    // ── Suggestions ────────────────────────────────────────────────────────
    const suggestions: {
      priority:   number;
      impact:     "high" | "medium" | "low";
      action:     string;
      reason:     string;
      n8n_hint?:  string;
      make_hint?: string;
    }[] = [];

    const criticalWf = issues.filter(i => i.category === "workflow_reliability" && i.severity === "critical");
    if (criticalWf.length > 0) {
      suggestions.push({
        priority: 1, impact: "high",
        action: "Fix failing workflow nodes",
        reason: `${criticalWf.length} workflow(s) have <70% reliability.`,
        n8n_hint: "Check 'Error' nodes in the n8n execution log. Add an Error Trigger node to catch failures. Re-authenticate expired credentials.",
        make_hint: "Open scenario history and filter by 'Error'. Review failed module inputs. Re-authorize connections.",
      });
    }

    const leakageIssues = issues.filter(i => i.category === "revenue_leakage");
    if (leakageIssues.length > 0) {
      const topLoss = leakageIssues.reduce((sum, i) => sum + ((i.metric?.totalLoss as number) ?? 0), 0);
      suggestions.push({
        priority: 2, impact: "high",
        action: `Recover ~$${topLoss.toLocaleString()} in pipeline leakage`,
        reason: "Failed events for high-value types (meeting_booked, deal_created) are losing pipeline value.",
        n8n_hint: "Add a Retry node after HTTP Request nodes calling your CRM. Use IF node to branch on error and trigger a Slack alert.",
        make_hint: "Enable 'Incomplete execution' handling on router modules. Add error handlers on CRM write modules.",
      });
    }

    const noIdDrops = webhookHealth.tools.filter((t: any) => t.droppedNoId > 20);
    if (noIdDrops.length > 0) {
      suggestions.push({
        priority: 3, impact: "high",
        action: `Fix missing identity fields in ${noIdDrops.map((t: any) => t.tool).join(", ")} webhooks`,
        reason: `${noIdDrops.reduce((s: number, t: any) => s + t.droppedNoId, 0)} events dropped — IQPipe could not identify the lead.`,
        n8n_hint: "In your IQPipe webhook node, ensure 'email' or 'linkedin_url' is mapped. Use a Set node to normalize field names before the HTTP Request.",
        make_hint: "In the HTTP module sending to IQPipe, verify the Body includes an 'email' key mapped from the trigger data.",
      });
    }

    if (neverReplied.length > 10) {
      suggestions.push({
        priority: 4, impact: "medium",
        action: `Add a follow-up step for ${neverReplied.length} silent leads`,
        reason: "A timed follow-up can recover 10–20% of non-replied leads.",
        n8n_hint: "Add a Wait node (5 days) → IF node checking for reply_received from IQPipe → conditional follow-up via Lemlist/Instantly.",
        make_hint: "Add a delay module (5 days), then use an IQPipe HTTP lookup to check for a reply before triggering your sequencer.",
      });
    }

    const deadBranches = issues.filter(i => i.category === "branch_dead");
    if (deadBranches.length > 0) {
      suggestions.push({
        priority: 5, impact: "medium",
        action: `Investigate dead branch(es): ${deadBranches.map(i => i.title).join("; ")}`,
        reason: "Branches with 0% conversion despite traffic indicate a configuration error or inactive sequence.",
        n8n_hint: "Check that the IF branch routes to an active node. Use a test lead to trace execution manually.",
        make_hint: "Run the scenario with a test webhook and trace the Router path. Verify downstream modules are not paused.",
      });
    }

    const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return res.json({
      generatedAt:  new Date().toISOString(),
      period,
      workflowId:   workflowId ?? null,
      sequenceId:   sequenceId ?? null,
      summary: {
        issueCount:     issues.length,
        criticalIssues: issues.filter(i => i.severity === "critical").length,
        warningIssues:  issues.filter(i => i.severity === "warning").length,
        stuckLeadCount: neverReplied.length,
        totalWorkflows: overviewRaw?.length ?? 0,
      },
      issues,
      suggestions: suggestions.sort((a, b) => a.priority - b.priority),
    });
  } catch (err) {
    console.error("[outreach/improvement-report]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
