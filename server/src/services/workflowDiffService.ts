/**
 * workflowDiffService.ts
 *
 * Detects structural changes in n8n workflows between sync cycles.
 *
 * On each sync, a SHA-256 hash of the workflow's sorted node types is computed.
 * If the hash differs from the stored value, a human-readable diff summary is
 * generated ("Added: HubSpot, Salesforce. Removed: Slack.") and persisted to
 * N8nWorkflowMeta alongside the new hash and a lastChangeAt timestamp.
 *
 * This enables the diagnostic engine to correlate metric drops with structural
 * workflow edits without requiring Claude to manually compare workflow versions.
 *
 * Pure functions (computeStructureHash, diffApps) are exported for testing.
 */

import { createHash } from "crypto";
import { prisma } from "../db";

// ─── Pure functions (testable without DB) ─────────────────────────────────────

/**
 * Compute a stable SHA-256 hash of the workflow structure.
 * Uses sorted node types so hash is order-independent.
 */
export function computeStructureHash(nodes: Array<{ type: string; name?: string }>): string {
  // Sort by type+name for stability across API responses
  const sorted = nodes
    .map(n => `${n.type}|${n.name ?? ""}`)
    .sort()
    .join("::");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

/**
 * Generate a human-readable diff summary from two sets of app names.
 * Returns null if no change.
 */
export function diffApps(
  prevApps: string[],
  nextApps: string[],
): string | null {
  const prev = new Set(prevApps);
  const next = new Set(nextApps);

  const added   = nextApps.filter(a => !prev.has(a));
  const removed = prevApps.filter(a => !next.has(a));

  if (added.length === 0 && removed.length === 0) return null;

  const parts: string[] = [];
  if (added.length   > 0) parts.push(`Added: ${added.join(", ")}.`);
  if (removed.length > 0) parts.push(`Removed: ${removed.join(", ")}.`);
  return parts.join(" ");
}

// ─── DB write: persist diff if changed ───────────────────────────────────────

/**
 * Called from n8nClient.syncN8nConnection after each workflow sync.
 * Compares the new hash against the stored one; if different, writes
 * the diff summary and updates lastChangeAt.
 *
 * Returns the diff summary string if a change was detected, null otherwise.
 */
export async function detectAndPersistWorkflowDiff(
  workspaceId:  string,
  n8nId:        string,
  nodes:        Array<{ type: string; name?: string }>,
  prevApps:     string[],
  nextApps:     string[],
): Promise<string | null> {
  const newHash = computeStructureHash(nodes);

  const existing = await prisma.n8nWorkflowMeta.findUnique({
    where:  { workspaceId_n8nId: { workspaceId, n8nId } },
    select: { structureHash: true } as any,
  }) as any;

  const oldHash = existing?.structureHash ?? null;
  if (oldHash === newHash) return null;

  const summary = diffApps(prevApps, nextApps) ?? "Workflow structure changed.";

  await prisma.n8nWorkflowMeta.update({
    where: { workspaceId_n8nId: { workspaceId, n8nId } },
    data:  {
      structureHash:     newHash,
      lastChangeAt:      new Date(),
      lastChangeSummary: summary,
    } as any,
  });

  return summary;
}

// ─── Query: recent workflow changes for a workspace ───────────────────────────

export interface WorkflowChange {
  n8nId:        string;
  name:         string;
  lastChangeAt: string;
  summary:      string;
  appsUsed:     string[];
}

export async function getRecentWorkflowChanges(
  workspaceId: string,
  sinceDays    = 7,
): Promise<WorkflowChange[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const rows = await prisma.n8nWorkflowMeta.findMany({
    where: {
      workspaceId,
      lastChangeAt: { gte: since },
    } as any,
    orderBy: { lastUpdatedAt: "desc" } as any,
    select: {
      n8nId:             true,
      name:              true,
      appsUsed:          true,
      lastChangeAt:      true,
      lastChangeSummary: true,
    } as any,
  }) as any[];

  return rows.map((r: any) => ({
    n8nId:        r.n8nId,
    name:         r.name,
    lastChangeAt: r.lastChangeAt?.toISOString() ?? "",
    summary:      r.lastChangeSummary ?? "Workflow changed.",
    appsUsed:     JSON.parse(r.appsUsed || "[]"),
  }));
}
