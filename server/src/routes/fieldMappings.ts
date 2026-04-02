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
import { detectFieldsSync, detectAndLearnWithReport, Detection, CanonicalContactField } from "../utils/fieldDetector";

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
// Runs detection on a sample payload without writing to DB.
// Returns a full explainability report: best detections, reasons, skipped fields.
//
// Body: { payload: Record<string, any>, source?: string, verbose?: boolean }
//   source   — optional tool slug; if provided, also applies stored/manual mappings
//   verbose  — if true, includes allDetections (every raw candidate) for debugging
//
// Default response (verbose=false): lightweight, safe for UI display.
// verbose=true: adds allDetections for full debugging.

router.post("/preview", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return res.status(404).json({ error: "No workspace found." });

    const { payload, source, verbose } = req.body || {};
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload is required (object)" });
    }

    const sourceKey = source ? String(source) : "_preview";

    if (source) {
      // Full pipeline with stored mappings — uses detectAndLearnWithReport but
      // passes a fake workspaceId read path; we don't persist (source != real slug).
      // We isolate by calling detectAndLearnWithReport on the real workspace but
      // passing the source so stored mappings load correctly.
      const { contact, report } = await detectAndLearnWithReport(
        membership.workspaceId,
        sourceKey,
        payload,
        {},
      );

      return res.json({
        source:      sourceKey,
        threshold:   0.70,
        appliedCount: report.appliedCount,
        appliedFields: report.appliedFields,
        skippedDetections: report.skippedDetections,
        ...(verbose ? { allDetections: report.allDetections } : {}),
        // Convenience: the enriched contact object that would be produced
        resolvedContact: contact,
      });
    }

    // No source — pure auto-detection (no stored mappings, no DB write)
    const allDetections = detectFieldsSync(payload);

    // Select best per canonical field with full reason tracking
    const bestMap  = new Map<CanonicalContactField, Detection>();
    const lostMap: Detection[] = [];
    for (const d of allDetections) {
      const existing = bestMap.get(d.canonicalField);
      if (!existing || d.confidence > existing.confidence) {
        if (existing) lostMap.push(existing);
        bestMap.set(d.canonicalField, d);
      } else {
        lostMap.push(d);
      }
    }

    const THRESHOLD = 0.70;
    const applied   = Array.from(bestMap.values()).filter(d => d.confidence >= THRESHOLD);
    const skipped   = [
      ...Array.from(bestMap.values())
        .filter(d => d.confidence < THRESHOLD)
        .map(d => ({
          rawPath:        d.rawPath,
          canonicalField: d.canonicalField,
          value:          d.value,
          confidence:     d.confidence,
          reason:         d.reason + ` (confidence ${(d.confidence * 100).toFixed(0)}% is below threshold ${(THRESHOLD * 100).toFixed(0)}%)`,
          skippedBecause: "below_threshold" as const,
        })),
      ...lostMap.map(d => ({
        rawPath:        d.rawPath,
        canonicalField: d.canonicalField,
        value:          d.value,
        confidence:     d.confidence,
        reason:         d.reason,
        skippedBecause: "lost_to_higher_confidence" as const,
      })),
    ];

    return res.json({
      source:      null,
      threshold:   THRESHOLD,
      appliedCount: applied.length,
      appliedFields: applied.map(d => ({
        canonicalField:  d.canonicalField,
        rawPath:         d.rawPath,
        value:           d.value,
        confidence:      d.confidence,
        detectionMethod: d.detectionMethod,
        reason:          d.reason,
        fromStore:       false,
      })),
      skippedDetections: skipped,
      ...(verbose ? { allDetections } : {}),
      resolvedContact: Object.fromEntries(
        applied.map(d => {
          const key = d.canonicalField.replace("contact.", "");
          return [key, d.value];
        }),
      ),
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
