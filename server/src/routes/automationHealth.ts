import { Router, Request, Response } from "express";
import { prisma } from "../db";

const router = Router();

function periodStart(period: string): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

router.get("/", async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || "";
  const period      = (req.query.period as string) || "30d";
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const since = periodStart(period);
  const dateFilter = since ? { createdAt: { gte: since } } : {};

  try {
    // ── n8n ──────────────────────────────────────────────────────────────────

    // Group by workflowId to get all distinct workflows
    const byWorkflow = await prisma.n8nQueuedEvent.groupBy({
      by: ["workflowId"],
      where: { workspaceId, ...dateFilter },
      _count: { id: true },
    });

    // Fetch workflow names for all workflows in one query
    const wfIds = byWorkflow.map(r => r.workflowId);
    const wfMetas = await prisma.n8nWorkflowMeta.findMany({
      where: { workspaceId, n8nId: { in: wfIds } },
      select: { n8nId: true, name: true },
    });
    const wfMetaMap = Object.fromEntries(wfMetas.map(m => [m.n8nId, m]));

    const workflows = await Promise.all(
      byWorkflow.map(async (row) => {
        const wfId = row.workflowId;
        const wfFilter = { workspaceId, workflowId: wfId, ...dateFilter };

        const [statusGroups, classGroups, appGroups, lastEvent, wfErrors] = await Promise.all([
          prisma.n8nQueuedEvent.groupBy({
            by: ["status"],
            where: wfFilter,
            _count: { id: true },
          }),
          prisma.n8nQueuedEvent.groupBy({
            by: ["eventClass"],
            where: wfFilter,
            _count: { id: true },
          }),
          prisma.n8nQueuedEvent.groupBy({
            by: ["sourceApp"],
            where: wfFilter,
            _count: { id: true },
          }),
          prisma.n8nQueuedEvent.findFirst({
            where: wfFilter,
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, eventType: true },
          }),
          prisma.webhookError.findMany({
            where: {
              workspaceId,
              source: `n8n:${wfId}`,
              resolvedAt: null,
              ...(since ? { createdAt: { gte: since } } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, errorCode: true, errorDetail: true, retryCount: true, createdAt: true },
          }),
        ]);

        const statusMap  = Object.fromEntries(statusGroups.map(s => [s.status, s._count.id]));
        const classMap   = Object.fromEntries(classGroups.map(c => [c.eventClass ?? "unknown", c._count.id]));
        const total      = row._count.id;
        const done       = statusMap.done ?? 0;

        const meta = wfMetaMap[wfId];
        return {
          workflowId:     wfId,
          workflowName:   meta?.name ?? null,
          totalEvents:    total,
          done,
          pending:        statusMap.pending    ?? 0,
          failed:         statusMap.failed     ?? 0,
          successRate:    total > 0 ? Math.round((done / total) * 100) : 0,
          outcomeEvents:  classMap.outcome     ?? 0,
          processEvents:  classMap.process     ?? 0,
          sourceApps:     appGroups.map(a => a.sourceApp),
          lastEventAt:    lastEvent?.createdAt?.toISOString() ?? null,
          lastEventType:  lastEvent?.eventType ?? null,
          recentErrors:   wfErrors.map(e => ({
            id: e.id, errorCode: e.errorCode, errorDetail: e.errorDetail,
            retryCount: e.retryCount, createdAt: e.createdAt.toISOString(),
          })),
        };
      }),
    );

    // Queue stats (not period-filtered — show live queue state)
    const queueGroups = await prisma.n8nQueuedEvent.groupBy({
      by: ["status"],
      where: { workspaceId },
      _count: { id: true },
    });
    const qMap = Object.fromEntries(queueGroups.map(g => [g.status, g._count.id]));
    const queueStats = {
      pending:    qMap.pending    ?? 0,
      processing: qMap.processing ?? 0,
      done:       qMap.done       ?? 0,
      failed:     qMap.failed     ?? 0,
      total:      queueGroups.reduce((s, g) => s + g._count.id, 0),
    };

    // Global n8n error list
    const n8nErrors = await prisma.webhookError.findMany({
      where: {
        workspaceId,
        source: { startsWith: "n8n:" },
        resolvedAt: null,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, source: true, errorCode: true, errorDetail: true, retryCount: true, resolvedAt: true, createdAt: true },
    });

    // Total events + success rate across all workflows
    const totalEvents   = workflows.reduce((s, w) => s + w.totalEvents,   0);
    const totalDone     = workflows.reduce((s, w) => s + w.done,          0);
    const outcomeEvents = workflows.reduce((s, w) => s + w.outcomeEvents,  0);
    const processEvents = workflows.reduce((s, w) => s + w.processEvents,  0);

    // ── make.com ─────────────────────────────────────────────────────────────

    const [makeErrors, makeConnection] = await Promise.all([
      prisma.webhookError.findMany({
        where: {
          workspaceId,
          source: "make",
          resolvedAt: null,
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, errorCode: true, errorDetail: true, retryCount: true, createdAt: true },
      }),
      prisma.integrationConnection.findFirst({
        where: { workspaceId, provider: "make" },
        select: { id: true },
      }),
    ]);

    const makeTotalCount = await prisma.webhookError.count({
      where: {
        workspaceId,
        source: "make",
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    });

    return res.json({
      n8n: {
        totalWorkflows: workflows.length,
        totalEvents,
        outcomeEvents,
        processEvents,
        successRate:    totalEvents > 0 ? Math.round((totalDone / totalEvents) * 100) : 0,
        queueStats,
        workflows: workflows.sort((a, b) => b.totalEvents - a.totalEvents),
        errors: n8nErrors.map(e => ({
          id: e.id, source: e.source, errorCode: e.errorCode, errorDetail: e.errorDetail,
          retryCount: e.retryCount,
          resolvedAt: e.resolvedAt?.toISOString() ?? null,
          createdAt:  e.createdAt.toISOString(),
        })),
      },
      make: {
        totalEvents:  makeTotalCount,
        errors:       makeErrors.map(e => ({
          id: e.id, errorCode: e.errorCode, errorDetail: e.errorDetail,
          retryCount: e.retryCount, createdAt: e.createdAt.toISOString(),
        })),
        isConnected: !!makeConnection,
      },
    });
  } catch (err: any) {
    console.error("[automationHealth]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
