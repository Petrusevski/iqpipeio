/**
 * fieldMappings.ts — Field Mapping management API
 *
 * GET  /api/field-mappings          — list learned mappings for workspace
 * POST /api/field-mappings/preview  — run detection on a sample payload (no DB write)
 * PUT  /api/field-mappings/:id      — human override: set canonicalField manually
 * DELETE /api/field-mappings/:id    — reject a mapping (marks isRejected = true)
 */

import { Router, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { detectFieldsSync } from "../utils/fieldDetector";

const router = Router();

// ─── GET /api/field-mappings ──────────────────────────────────────────────────
// Returns all field mappings for the authenticated user's primary workspace.
// Optional query params: ?source=clay&includeRejected=true

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return res.status(404).json({ error: "No workspace found." });

    const { source, includeRejected } = req.query;

    const mappings = await prisma.fieldMapping.findMany({
      where: {
        workspaceId: membership.workspaceId,
        ...(source ? { source: String(source) } : {}),
        ...(includeRejected !== "true" ? { isRejected: false } : {}),
      },
      orderBy: [{ source: "asc" }, { useCount: "desc" }],
    });

    return res.json(mappings);
  } catch (err: any) {
    console.error("[fieldMappings/GET]", err.message);
    return res.status(500).json({ error: "Failed to load field mappings." });
  }
});

// ─── POST /api/field-mappings/preview ────────────────────────────────────────
// Runs auto-detection on a sample payload without writing to DB.
// Body: { payload: Record<string, any>, source?: string }

router.post("/preview", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { payload } = req.body || {};
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload is required (object)" });
    }

    const detections = detectFieldsSync(payload);

    // Group by canonicalField, pick best confidence per field
    const best: Record<string, { rawPath: string; value: string; confidence: number; method: string }> = {};
    for (const d of detections) {
      const existing = best[d.canonicalField];
      if (!existing || d.confidence > existing.confidence) {
        best[d.canonicalField] = {
          rawPath:   d.rawPath,
          value:     d.value,
          confidence: d.confidence,
          method:    d.detectionMethod,
        };
      }
    }

    return res.json({
      detected: best,
      allDetections: detections,
      threshold: 0.70,
    });
  } catch (err: any) {
    console.error("[fieldMappings/preview]", err.message);
    return res.status(500).json({ error: "Detection failed." });
  }
});

// ─── PUT /api/field-mappings/:id ──────────────────────────────────────────────
// Human override: set canonicalField for a mapping.
// Body: { canonicalField: string }
// Also accepts creating a new override: { source, rawPath, canonicalField }

router.put("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return res.status(404).json({ error: "No workspace found." });

    const { canonicalField } = req.body || {};
    if (!canonicalField || typeof canonicalField !== "string") {
      return res.status(400).json({ error: "canonicalField is required (string)" });
    }

    const VALID_FIELDS = new Set([
      "contact.email", "contact.phone", "contact.linkedin",
      "contact.firstName", "contact.lastName", "contact.company",
      "contact.title", "contact.anonymousId",
    ]);
    if (!VALID_FIELDS.has(canonicalField)) {
      return res.status(400).json({
        error: "Invalid canonicalField.",
        validValues: Array.from(VALID_FIELDS),
      });
    }

    // Verify ownership
    const existing = await prisma.fieldMapping.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.workspaceId !== membership.workspaceId) {
      return res.status(404).json({ error: "Mapping not found." });
    }

    const updated = await prisma.fieldMapping.update({
      where: { id: req.params.id },
      data: {
        canonicalField,
        confidence:      1.0,
        detectionMethod: "manual",
        isOverride:      true,
        isRejected:      false, // un-reject if previously rejected
        overriddenBy:    req.user!.id,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("[fieldMappings/PUT]", err.message);
    return res.status(500).json({ error: "Failed to update mapping." });
  }
});

// ─── DELETE /api/field-mappings/:id ──────────────────────────────────────────
// Reject a mapping — marks isRejected = true so it is never applied again.
// Does not delete the record (keeps history of what was tried).

router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return res.status(404).json({ error: "No workspace found." });

    const existing = await prisma.fieldMapping.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.workspaceId !== membership.workspaceId) {
      return res.status(404).json({ error: "Mapping not found." });
    }

    await prisma.fieldMapping.update({
      where: { id: req.params.id },
      data: {
        isRejected:   true,
        overriddenBy: req.user!.id,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[fieldMappings/DELETE]", err.message);
    return res.status(500).json({ error: "Failed to reject mapping." });
  }
});

export default router;
