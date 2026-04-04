/**
 * workflowHealth.ts — GET /api/workflow-health
 *
 * All metrics read from the LeadActivitySummary materialized table via the
 * shared getWorkflowHealthData() service (also used by /api/mcp/workflow-health).
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { getWorkflowHealthData } from "../services/workflowHealthService";

const router = Router();

// ─── GET /api/workflow-health?workspaceId=&period=30d ─────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const period      = (req.query.period as string) ?? "30d";
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    const data = await getWorkflowHealthData(workspaceId, period);
    return res.json(data);
  } catch (err) {
    console.error("[workflow-health]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
