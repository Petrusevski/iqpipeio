/**
 * customEventTypes.ts — Priority 4
 *
 * Workspace-level custom event type registry.
 * Growth and Agency workspaces can define their own event taxonomy
 * for non-standard sources (web visits, internal DBs, custom APIs).
 *
 * GET    /api/custom-event-types
 * POST   /api/custom-event-types
 * PUT    /api/custom-event-types/:id
 * DELETE /api/custom-event-types/:id
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

const PLAN_ALLOWED = new Set(["growth", "agency"]);
const VALID_CHANNELS  = new Set(["web", "email", "linkedin", "crm", "enrichment", "billing", "automation", "custom"]);
const VALID_CATEGORIES = new Set(["signal", "outcome"]);

// ── Auth middleware ───────────────────────────────────────────────────────────

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

// ── GET /api/custom-event-types ───────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const types = await prisma.customEventType.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
  });

  return res.json({ customEventTypes: types, plan: workspace.plan, allowed: PLAN_ALLOWED.has(workspace.plan) });
});

// ── POST /api/custom-event-types ──────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });
  if (!PLAN_ALLOWED.has(workspace.plan)) {
    return res.status(403).json({ error: "Custom event types require a Growth or Agency plan." });
  }

  const { key, label, channel = "custom", category = "signal", description } = req.body || {};

  if (!key || !/^[a-z][a-z0-9_]{0,49}$/.test(key)) {
    return res.status(400).json({ error: "key must be lowercase snake_case, max 50 chars, start with a letter." });
  }
  if (!label || String(label).length > 100) {
    return res.status(400).json({ error: "label is required, max 100 chars." });
  }
  if (!VALID_CHANNELS.has(channel))   return res.status(400).json({ error: `channel must be one of: ${[...VALID_CHANNELS].join(", ")}` });
  if (!VALID_CATEGORIES.has(category)) return res.status(400).json({ error: `category must be "signal" or "outcome"` });

  const existing = await prisma.customEventType.findFirst({ where: { workspaceId: workspace.id, key } });
  if (existing) return res.status(409).json({ error: `Event type "${key}" already exists.` });

  const created = await prisma.customEventType.create({
    data: { workspaceId: workspace.id, key, label, channel, category, description: description || null },
  });

  return res.status(201).json(created);
});

// ── PUT /api/custom-event-types/:id ──────────────────────────────────────────

router.put("/:id", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const record = await prisma.customEventType.findFirst({ where: { id: req.params.id, workspaceId: workspace.id } });
  if (!record) return res.status(404).json({ error: "Not found" });

  const { label, channel, category, description } = req.body || {};
  const patch: Record<string, any> = {};
  if (label       !== undefined) patch.label       = label;
  if (channel     !== undefined) { if (!VALID_CHANNELS.has(channel)) return res.status(400).json({ error: "Invalid channel" }); patch.channel = channel; }
  if (category    !== undefined) { if (!VALID_CATEGORIES.has(category)) return res.status(400).json({ error: "Invalid category" }); patch.category = category; }
  if (description !== undefined) patch.description = description || null;

  const updated = await prisma.customEventType.update({ where: { id: record.id }, data: patch });
  return res.json(updated);
});

// ── DELETE /api/custom-event-types/:id ───────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  const workspace = await getWorkspace(req);
  if (!workspace) return res.status(401).json({ error: "Unauthorized" });

  const record = await prisma.customEventType.findFirst({ where: { id: req.params.id, workspaceId: workspace.id } });
  if (!record) return res.status(404).json({ error: "Not found" });

  await prisma.customEventType.delete({ where: { id: record.id } });
  return res.json({ ok: true });
});

export default router;
