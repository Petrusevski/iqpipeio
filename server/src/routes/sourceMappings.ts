/**
 * sourceMappings.ts — Priority 2
 *
 * When IQPipe encounters unknown n8n/Make nodes (HTTP Request, Database,
 * Webhook, Code, etc.), users can map them to a named source app.
 * Saved mappings are applied to all future events from that node type.
 *
 * GET    /api/source-mappings              — list all mappings
 * POST   /api/source-mappings              — create/upsert a mapping
 * DELETE /api/source-mappings/:id          — remove a mapping
 * GET    /api/source-mappings/unknown      — list workflows with unmapped nodes
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// Nodes we know are likely custom/non-standard sources
const UNKNOWN_NODE_TYPES = new Set([
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.postgres",
  "n8n-nodes-base.mysql",
  "n8n-nodes-base.mongodb",
  "n8n-nodes-base.redis",
  "n8n-nodes-base.airtable",
  "n8n-nodes-base.googleSheets",
  "n8n-nodes-base.code",
  "n8n-nodes-base.function",
  "n8n-nodes-base.executeCommand",
  "@n8n/n8n-nodes-langchain.code",
]);

async function getWorkspace(req: Request): Promise<{ id: string; plan: string } | null> {
  const auth = (req.headers.authorization ?? "").replace("Bearer ", "");
  if (!auth) return null;
  try {
    const payload = jwt.verify(auth, JWT_SECRET) as { sub: string };
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: payload.sub },
      include: { workspace: { select: { id: true, plan: true } } },
      orderBy: { createdAt: "asc" },
    });
    return membership ? { id: membership.workspace.id, plan: membership.workspace.plan } : null;
  } catch { return null; }
}

// ── GET /api/source-mappings ──────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const mappings = await prisma.sourceMapping.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
  });

  return res.json({ sourceMappings: mappings });
});

// ── GET /api/source-mappings/unknown — workflows with unmapped nodes ──────────

router.get("/unknown", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  // Load all n8n workflows for this workspace
  const workflows = await prisma.n8nWorkflowMeta.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, n8nId: true, name: true, nodeTypes: true, appsUsed: true },
  });

  // Load existing mappings
  const existingMappings = await prisma.sourceMapping.findMany({
    where: { workspaceId: workspace.id, platform: "n8n" },
    select: { nodeType: true },
  });
  const mappedNodeTypes = new Set(existingMappings.map(m => m.nodeType));

  // Find workflows containing at least one unmapped unknown node
  const flagged: any[] = [];
  for (const wf of workflows) {
    let nodeTypes: string[] = [];
    try { nodeTypes = JSON.parse(wf.nodeTypes || "[]"); } catch { }

    const unmappedNodes = nodeTypes.filter(
      n => UNKNOWN_NODE_TYPES.has(n) && !mappedNodeTypes.has(n)
    );
    if (unmappedNodes.length > 0) {
      flagged.push({
        workflowId:    wf.id,
        n8nId:         wf.n8nId,
        name:          wf.name,
        unmappedNodes,
      });
    }
  }

  // Do the same for Make scenarios
  const scenarios = await prisma.makeScenarioMeta.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, makeId: true, name: true, moduleTypes: true, appsUsed: true },
  });

  const makeExisting = await prisma.sourceMapping.findMany({
    where: { workspaceId: workspace.id, platform: "make" },
    select: { nodeType: true },
  });
  const mappedMakeTypes = new Set(makeExisting.map(m => m.nodeType));

  const UNKNOWN_MAKE_TYPES = new Set(["http", "gateway", "json", "csv", "text-parser", "util", "custom"]);

  for (const sc of scenarios) {
    let moduleTypes: string[] = [];
    try { moduleTypes = JSON.parse(sc.moduleTypes || "[]"); } catch { }

    const unmappedModules = moduleTypes.filter(
      m => UNKNOWN_MAKE_TYPES.has(m) && !mappedMakeTypes.has(m)
    );
    if (unmappedModules.length > 0) {
      flagged.push({
        workflowId:    sc.id,
        makeId:        sc.makeId,
        name:          sc.name,
        platform:      "make",
        unmappedNodes: unmappedModules,
      });
    }
  }

  return res.json({ unmapped: flagged, totalUnmapped: flagged.length });
});

// ── POST /api/source-mappings — create/upsert ─────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const {
    nodeType,
    platform = "n8n",
    appKey,
    appLabel,
    channel = "custom",
  } = req.body || {};

  if (!nodeType) return res.status(400).json({ error: "nodeType is required" });
  if (!appKey   || !/^[a-z][a-z0-9_-]{0,49}$/.test(appKey)) {
    return res.status(400).json({ error: "appKey must be lowercase slug, max 50 chars." });
  }
  if (!appLabel) return res.status(400).json({ error: "appLabel is required" });
  if (!["n8n", "make", "custom"].includes(platform)) {
    return res.status(400).json({ error: "platform must be n8n, make, or custom" });
  }

  // Upsert: update if exists, create otherwise
  const existing = await prisma.sourceMapping.findFirst({
    where: { workspaceId: workspace.id, platform, nodeType },
  });

  const result = existing
    ? await prisma.sourceMapping.update({
        where: { id: existing.id },
        data: { appKey, appLabel, channel },
      })
    : await prisma.sourceMapping.create({
        data: { workspaceId: workspace.id, nodeType, platform, appKey, appLabel, channel },
      });

  return res.status(existing ? 200 : 201).json(result);
});

// ── DELETE /api/source-mappings/:id ──────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const record = await prisma.sourceMapping.findFirst({
    where: { id: req.params.id, workspaceId: workspace.id },
  });
  if (!record) return res.status(404).json({ error: "Not found" });

  await prisma.sourceMapping.delete({ where: { id: record.id } });
  return res.json({ ok: true });
});

export default router;
