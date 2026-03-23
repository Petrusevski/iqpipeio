/**
 * admin.ts  —  IQPipe internal admin API
 *
 * ALL routes require admin JWT (requireAdmin middleware).
 * Exception: POST /login — issues the JWT.
 *
 * Endpoints:
 *   POST /api/admin/login
 *   GET  /api/admin/stats
 *   GET  /api/admin/users
 *   GET  /api/admin/workspaces
 *   GET  /api/admin/billing
 *   GET  /api/admin/activity
 *   POST /api/admin/mail/send
 *   GET  /api/admin/mail/logs
 *
 * Credentials (set in Vercel / server/.env):
 *   ADMIN_PASSWORD      — master password for /login
 *   ADMIN_JWT_SECRET    — signs admin JWTs (different from JWT_SECRET)
 *   ADMIN_SMTP_HOST     — SMTP host  (e.g. smtp.resend.com)
 *   ADMIN_SMTP_PORT     — SMTP port  (default 587)
 *   ADMIN_SMTP_USER     — SMTP user
 *   ADMIN_SMTP_PASS     — SMTP password / API key
 *   ADMIN_FROM_EMAIL    — From address (e.g. "iqpipe <admin@iqpipe.io>")
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { prisma } from "../db";
import {
  requireAdmin,
  AdminRequest,
  ADMIN_JWT_SECRET,
  ADMIN_TOKEN_TTL,
} from "../middleware/adminAuth";

const router = Router();

const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || "";
const ADMIN_FROM      = process.env.ADMIN_FROM_EMAIL || "iqpipe <admin@iqpipe.io>";

// ── Nodemailer transport (lazy — only initialised when a mail is sent) ────────

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.ADMIN_SMTP_HOST || "smtp.resend.com",
    port:   Number(process.env.ADMIN_SMTP_PORT || 587),
    secure: Number(process.env.ADMIN_SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.ADMIN_SMTP_USER || "",
      pass: process.env.ADMIN_SMTP_PASS || "",
    },
  });
}

// ─── POST /api/admin/login ────────────────────────────────────────────────────

router.post("/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "ADMIN_PASSWORD is not configured." });
  }

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = jwt.sign({ sub: "admin", role: "admin" }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL,
  });

  return res.json({ token, expiresIn: ADMIN_TOKEN_TTL });
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

router.get("/stats", requireAdmin, async (_req: AdminRequest, res: Response) => {
  const [
    totalUsers,
    totalWorkspaces,
    totalLeads,
    totalTouchpoints,
    totalDeals,
    planBreakdown,
    recentSignups,
    totalActivities,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.lead.count(),
    prisma.touchpoint.count(),
    prisma.deal.count(),
    prisma.workspace.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  { id: true, email: true, fullName: true, createdAt: true },
    }),
    prisma.activity.count(),
  ]);

  // MRR estimate from active paid plans
  const PLAN_MRR: Record<string, number> = {
    starter: 29, growth: 99, agency: 299,
  };
  const mrr = planBreakdown.reduce((sum, row) => {
    return sum + (PLAN_MRR[row.plan] ?? 0) * row._count._all;
  }, 0);

  // Active workspaces (at least one touchpoint in last 30 days)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activeWsRaw = await prisma.touchpoint.groupBy({
    by:     ["workspaceId"],
    where:  { recordedAt: { gte: since30d } },
    _count: { _all: true },
  });

  return res.json({
    totalUsers,
    totalWorkspaces,
    totalLeads,
    totalTouchpoints,
    totalDeals,
    totalActivities,
    estimatedMrr: mrr,
    activeWorkspaces30d: activeWsRaw.length,
    planBreakdown: planBreakdown.map((r) => ({ plan: r.plan, count: r._count._all })),
    recentSignups,
  });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

router.get("/users", requireAdmin, async (req: AdminRequest, res: Response) => {
  const page  = Math.max(1, Number(req.query.page  || 1));
  const limit = Math.min(100, Number(req.query.limit || 50));
  const q     = (req.query.q as string | undefined)?.trim();

  const where = q
    ? { OR: [{ email: { contains: q } }, { fullName: { contains: q } }] }
    : undefined;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:   (page - 1) * limit,
      take:   limit,
      include: {
        memberships: {
          include: { workspace: { select: { id: true, name: true, plan: true, trialEndsAt: true, createdAt: true } } },
          orderBy:  { createdAt: "asc" },
          take:     1,
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const rows = users.map((u) => ({
    id:        u.id,
    email:     u.email,
    fullName:  u.fullName,
    createdAt: u.createdAt,
    workspace: u.memberships[0]?.workspace ?? null,
  }));

  return res.json({ users: rows, total, page, limit });
});

// ─── GET /api/admin/workspaces ────────────────────────────────────────────────

router.get("/workspaces", requireAdmin, async (req: AdminRequest, res: Response) => {
  const page  = Math.max(1, Number(req.query.page  || 1));
  const limit = Math.min(100, Number(req.query.limit || 50));
  const plan  = req.query.plan as string | undefined;

  const where = plan ? { plan } : undefined;

  const [workspaces, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        users: {
          include: { user: { select: { email: true, fullName: true } } },
          orderBy: { createdAt: "asc" },
          take:    1,
        },
        _count: { select: { leads: true, deals: true, integrations: true } },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  const rows = workspaces.map((ws) => ({
    id:             ws.id,
    name:           ws.name,
    plan:           ws.plan,
    trialEndsAt:    ws.trialEndsAt,
    createdAt:      ws.createdAt,
    billingEmail:   ws.billingEmail,
    stripeCustomerId:    ws.stripeCustomerId,
    stripeSubscriptionId: ws.stripeSubscriptionId,
    currentPeriodEnd:    ws.stripeCurrentPeriodEnd,
    owner: ws.users[0]?.user ?? null,
    counts: ws._count,
  }));

  return res.json({ workspaces: rows, total, page, limit });
});

// ─── GET /api/admin/billing ───────────────────────────────────────────────────

router.get("/billing", requireAdmin, async (_req: AdminRequest, res: Response) => {
  const PLAN_MRR: Record<string, number> = { starter: 29, growth: 99, agency: 299 };

  const [planBreakdown, recentUpgrades, cancelledThisMonth] = await Promise.all([
    prisma.workspace.groupBy({
      by:     ["plan"],
      _count: { _all: true },
    }),
    // Workspaces that upgraded (have a stripeSubscriptionId) ordered by period end
    prisma.workspace.findMany({
      where:   { stripeSubscriptionId: { not: null } },
      orderBy: { stripeCurrentPeriodEnd: "desc" },
      take:    20,
      select: {
        id: true, name: true, plan: true,
        stripeCurrentPeriodEnd: true,
        billingEmail: true,
        users: {
          take:    1,
          orderBy: { createdAt: "asc" },
          include: { user: { select: { email: true } } },
        },
      },
    }),
    // Workspaces on free plan that had a subscription (cancelled)
    prisma.workspace.count({
      where: {
        plan: "free",
        stripeSubscriptionId: null,
        stripeCustomerId: { not: null },
      },
    }),
  ]);

  const mrr = planBreakdown.reduce((sum, r) => sum + (PLAN_MRR[r.plan] ?? 0) * r._count._all, 0);
  const arr = mrr * 12;

  const subs = recentUpgrades.map((ws) => ({
    id:        ws.id,
    name:      ws.name,
    plan:      ws.plan,
    email:     ws.users[0]?.user?.email ?? ws.billingEmail,
    renewsAt:  ws.stripeCurrentPeriodEnd,
  }));

  return res.json({
    mrr,
    arr,
    planBreakdown: planBreakdown.map((r) => ({ plan: r.plan, count: r._count._all })),
    activeSubscriptions: subs,
    cancelledTotal: cancelledThisMonth,
  });
});

// ─── POST /api/admin/sql ──────────────────────────────────────────────────────
// Execute a raw SQL SELECT query against the database.
// Only SELECT statements are permitted — all others are rejected immediately.
// Results are capped at 500 rows to prevent memory issues.
// Admin JWT required.

router.post("/sql", requireAdmin, async (req: AdminRequest, res: Response) => {
  const { query } = req.body as { query?: string };

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "query is required." });
  }

  const normalised = query.trim().replace(/\s+/g, " ");

  // Hard guard: only allow SELECT statements
  if (!/^SELECT\s/i.test(normalised)) {
    return res.status(400).json({
      error: "Only SELECT statements are permitted.",
    });
  }

  // Reject multiple statements (semicolon mid-query)
  if ((normalised.match(/;/g) ?? []).length > 1 ||
      (normalised.endsWith(";") && normalised.slice(0, -1).includes(";"))) {
    return res.status(400).json({ error: "Multiple statements are not allowed." });
  }

  // Strip trailing semicolon and inject LIMIT if none present
  const stripped = normalised.replace(/;$/, "");
  const hasLimit = /\bLIMIT\s+\d+/i.test(stripped);
  const finalQuery = hasLimit ? stripped : `${stripped} LIMIT 500`;

  try {
    const rows: any[] = await (prisma as any).$queryRawUnsafe(finalQuery);

    // Serialise BigInt values (Postgres returns them for COUNT etc.)
    const safe = JSON.parse(
      JSON.stringify(rows, (_key, val) =>
        typeof val === "bigint" ? val.toString() : val
      )
    );

    return res.json({
      rows:    safe,
      count:   safe.length,
      columns: safe.length > 0 ? Object.keys(safe[0]) : [],
      query:   finalQuery,
    });
  } catch (err: any) {
    // Return the DB error message — useful for query debugging
    return res.status(400).json({ error: err.message ?? "Query failed." });
  }
});

// ─── POST /api/admin/mail/send ────────────────────────────────────────────────
// Send email to one user, a list, or all users.
// Body: { to: "all" | string | string[], subject, html, text? }

router.post("/mail/send", requireAdmin, async (req: AdminRequest, res: Response) => {
  const { to, subject, html, text } = req.body as {
    to: "all" | string | string[];
    subject?: string;
    html?: string;
    text?: string;
  };

  if (!subject || (!html && !text)) {
    return res.status(400).json({ error: "subject and html (or text) are required." });
  }

  if (!process.env.ADMIN_SMTP_HOST || !process.env.ADMIN_SMTP_PASS) {
    return res.status(503).json({
      error: "SMTP not configured.",
      detail: "Set ADMIN_SMTP_HOST, ADMIN_SMTP_USER, ADMIN_SMTP_PASS in env.",
    });
  }

  // Resolve recipients
  let recipients: { email: string; fullName: string }[] = [];

  if (to === "all") {
    recipients = await prisma.user.findMany({
      select: { email: true, fullName: true },
    });
  } else {
    const emails = Array.isArray(to) ? to : [to];
    recipients = await prisma.user.findMany({
      where:  { email: { in: emails } },
      select: { email: true, fullName: true },
    });
  }

  if (recipients.length === 0) {
    return res.status(404).json({ error: "No matching recipients found." });
  }

  const transport = createTransport();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    try {
      await transport.sendMail({
        from:    ADMIN_FROM,
        to:      `${r.fullName} <${r.email}>`,
        subject,
        html:    html ?? `<p>${text}</p>`,
        text:    text ?? "",
      });
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${r.email}: ${err.message}`);
    }
  }

  // Log the send to Activity table on the first workspace found (audit trail)
  await prisma.activity.create({
    data: {
      workspaceId: (await prisma.workspace.findFirst({ select: { id: true } }))?.id ?? "admin",
      type:    "admin_mail",
      subject: subject,
      body:    JSON.stringify({ to: to === "all" ? "all" : recipients.map((r) => r.email), sent, failed }),
      status:  "completed",
    },
  }).catch(() => {});

  return res.json({ sent, failed, errors: errors.slice(0, 10) });
});

// ─── GET /api/admin/mail/logs ─────────────────────────────────────────────────

router.get("/mail/logs", requireAdmin, async (_req: AdminRequest, res: Response) => {
  const logs = await prisma.activity.findMany({
    where:   { type: "admin_mail" },
    orderBy: { createdAt: "desc" },
    take:    50,
    select:  { id: true, subject: true, body: true, createdAt: true },
  });

  return res.json({
    logs: logs.map((l) => ({
      id:        l.id,
      subject:   l.subject,
      createdAt: l.createdAt,
      ...(l.body ? JSON.parse(l.body) : {}),
    })),
  });
});

export default router;
