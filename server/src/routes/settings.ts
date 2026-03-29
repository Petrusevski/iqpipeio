// server/src/routes/settings.ts

import { Router } from "express";
import { prisma } from "../db";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { isFreeEmailDomain, getEmailDomain } from "../utils/corporateEmail";
import { PLAN_LIMITS } from "../utils/quota";


const router = Router();
router.use(requireAuth);

/**
 * For now: simple current-user resolver.
 * Replace with real auth (e.g. req.user.id) when ready.
 */
function getCurrentUserId(req: AuthenticatedRequest): string {
  // requireAuth guarantees req.user exists
  return req.user!.id;
}

/**
 * Get the membership + workspace for the current user.
 * For MVP we just take the first workspace membership.
 * Later you can pass workspaceId from the frontend.
 */
async function getCurrentMembership(req: AuthenticatedRequest) {
  const userId = getCurrentUserId(req);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found.");
  }

  let membership = await prisma.workspaceUser.findFirst({
    where: { userId },
    include: { workspace: true },
  });

  // If no workspace exists yet, create one and membership
  if (!membership) {
    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.fullName || "Untitled"} workspace`,
        slug: `ws-${userId}`,
        companyName: null,
        primaryDomain: null,
        plan: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        publicApiKey: `rvn_pk_${crypto.randomBytes(12).toString("hex")}`,
        webhookEndpoint: `https://api.revenuela.com/webhooks/${userId}`,
      },
    });

    membership = await prisma.workspaceUser.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: "owner",
        isBillingOwner: true,
      },
      include: { workspace: true },
    });
  }

  return membership;
}


/**
 * GET /api/settings
 * Returns workspace + membership-level settings for the current user.
 */
// Valid plan IDs that correspond to real pricing tiers
const VALID_PLANS = new Set(["trial", "starter", "growth", "scale"]);

router.get("/", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req);
    const { workspace, ...membershipFields } = membership;

    // Normalize legacy "pro" (and any unknown) plan → "trial" and persist the fix
    let plan = workspace.plan;
    if (!VALID_PLANS.has(plan)) {
      plan = "trial";
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: {
          plan: "trial",
          trialEndsAt: workspace.trialEndsAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Fetch the user's full name to include in membership
    const user = await prisma.user.findUnique({
      where: { id: membershipFields.userId },
      select: { fullName: true, email: true },
    });

    const workspaceSettings = {
      id: workspace.id,
      workspaceName: workspace.name,
      companyName: workspace.companyName,
      primaryDomain: workspace.primaryDomain,
      defaultCurrency: workspace.defaultCurrency,
      timezone: workspace.timezone,
      industry: workspace.industry,
      plan,
      trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      createdAt: workspace.createdAt.toISOString(),
      seatsTotal: workspace.seatsTotal,
      seatsUsed: workspace.seatsUsed,
      billingEmail: workspace.billingEmail,
      revenuelaIdPrefix: workspace.revenuelaIdPrefix,
      publicApiKey: workspace.publicApiKey,
      webhookEndpoint: workspace.webhookEndpoint,
      dataAnonymization: workspace.dataAnonymization,
      dataRetentionMonths: workspace.dataRetentionMonths,
    };

    const membershipSettings = {
      id: membershipFields.id,
      role: membershipFields.role,
      isBillingOwner: membershipFields.isBillingOwner,
      darkMode: membershipFields.darkMode,
      weeklyDigest: membershipFields.weeklyDigest,
      performanceAlerts: membershipFields.performanceAlerts,
      userFullName: user?.fullName ?? "—",
      userEmail: user?.email ?? "—",
    };

    return res.json({
      workspace: workspaceSettings,
      membership: membershipSettings,
    });
  } catch (err: any) {
    console.error("GET /api/settings error", err);
    return res.status(500).json({
      error: "Failed to load settings",
      details: err?.message || "Unknown error",
    });
  }
});

/**
 * Allowed fields to update for each section
 */
const WORKSPACE_UPDATABLE_FIELDS = [
  "workspaceName",
  "companyName",
  "primaryDomain",
  "defaultCurrency",
  "timezone",
  "industry",
  "plan",
  "seatsTotal",
  "seatsUsed",
  "billingEmail",
  "revenuelaIdPrefix",
  "publicApiKey",
  "webhookEndpoint",
  "dataAnonymization",
  "dataRetentionMonths",
] as const;

const MEMBERSHIP_UPDATABLE_FIELDS = [
  "role",
  "isBillingOwner",
  "darkMode",
  "weeklyDigest",
  "performanceAlerts",
] as const;

type WorkspaceUpdateField = (typeof WORKSPACE_UPDATABLE_FIELDS)[number];
type MembershipUpdateField = (typeof MEMBERSHIP_UPDATABLE_FIELDS)[number];

/**
 * PUT /api/settings
 * Body:
 * {
 *   workspace?: { ...workspace settings subset... },
 *   membership?: { ...membership settings subset... }
 * }
 */
router.put("/", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req);
    const { workspace, membership: membershipPayload } = req.body || {};

    let updatedWorkspace = membership.workspace;
    let updatedMembership = membership;

    // --- Update workspace-level settings ---
    if (workspace && typeof workspace === "object") {
      const workspaceData: Partial<Record<WorkspaceUpdateField, any>> = {};
      WORKSPACE_UPDATABLE_FIELDS.forEach((field) => {
        if (field in workspace) {
          if (field === "workspaceName") {
            // map to actual column 'name' in Prisma
            (workspaceData as any)["name"] = workspace[field];
          } else {
            (workspaceData as any)[field] =
              workspace[field as WorkspaceUpdateField];
          }
        }
      });

      if (Object.keys(workspaceData).length > 0) {
        updatedWorkspace = await prisma.workspace.update({
          where: { id: membership.workspaceId },
          data: workspaceData,
        });
      }
    }

    // --- Update membership (user profile in workspace) ---
    if (membershipPayload && typeof membershipPayload === "object") {
      const membershipData: Partial<Record<MembershipUpdateField, any>> = {};
      MEMBERSHIP_UPDATABLE_FIELDS.forEach((field) => {
        if (field in membershipPayload) {
          (membershipData as any)[field] =
            membershipPayload[field as MembershipUpdateField];
        }
      });

      if (Object.keys(membershipData).length > 0) {
        updatedMembership = await prisma.workspaceUser.update({
          where: { id: membership.id },
          data: membershipData,
          include: { workspace: true },
        });
      }
    }

    // Normalize plan on PUT response too
    const putPlan = VALID_PLANS.has(updatedWorkspace.plan) ? updatedWorkspace.plan : "trial";

    // Fetch user name for membership response
    const putUser = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { fullName: true, email: true },
    });

    return res.json({
      workspace: {
        id: updatedWorkspace.id,
        workspaceName: updatedWorkspace.name,
        companyName: updatedWorkspace.companyName,
        primaryDomain: updatedWorkspace.primaryDomain,
        defaultCurrency: updatedWorkspace.defaultCurrency,
        timezone: updatedWorkspace.timezone,
        industry: updatedWorkspace.industry,
        plan: putPlan,
        trialEndsAt: (updatedWorkspace as any).trialEndsAt ? new Date((updatedWorkspace as any).trialEndsAt).toISOString() : null,
        createdAt: updatedWorkspace.createdAt.toISOString(),
        seatsTotal: updatedWorkspace.seatsTotal,
        seatsUsed: updatedWorkspace.seatsUsed,
        billingEmail: updatedWorkspace.billingEmail,
        revenuelaIdPrefix: updatedWorkspace.revenuelaIdPrefix,
        publicApiKey: updatedWorkspace.publicApiKey,
        webhookEndpoint: updatedWorkspace.webhookEndpoint,
        dataAnonymization: updatedWorkspace.dataAnonymization,
        dataRetentionMonths: updatedWorkspace.dataRetentionMonths,
      },
      membership: {
        id: updatedMembership.id,
        role: updatedMembership.role,
        isBillingOwner: updatedMembership.isBillingOwner,
        darkMode: updatedMembership.darkMode,
        weeklyDigest: updatedMembership.weeklyDigest,
        performanceAlerts: updatedMembership.performanceAlerts,
        userFullName: putUser?.fullName ?? "—",
        userEmail: putUser?.email ?? "—",
      },
    });
  } catch (err: any) {
    console.error("PUT /api/settings error", err);
    return res.status(500).json({
      error: "Failed to update settings",
      details: err?.message || "Unknown error",
    });
  }
});

/**
 * GET /api/settings/members
 * Returns all workspace members + pending invites.
 */
router.get("/members", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req as AuthenticatedRequest);
    const workspaceId = membership.workspaceId;

    const [members, invites] = await Promise.all([
      prisma.workspaceUser.findMany({
        where: { workspaceId },
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.workspaceInvite.findMany({
        where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return res.json({
      members: members.map(m => ({
        id: m.id,
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.role,
        isBillingOwner: m.isBillingOwner,
        joinedAt: m.createdAt.toISOString(),
      })),
      pendingInvites: invites.map(i => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error("GET /api/settings/members error", err);
    return res.status(500).json({ error: "Failed to load members" });
  }
});

/**
 * POST /api/settings/invite
 * Invites a user to the workspace.
 *
 * Agency plan: invited email must use the workspace's corporate domain.
 * All plans: free email providers are blocked for agency workspaces.
 */
router.post("/invite", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req as AuthenticatedRequest);
    const { workspace } = membership;

    if (!["owner", "admin"].includes(membership.role)) {
      return res.status(403).json({ error: "Only owners and admins can invite members." });
    }

    const { email, role = "analyst" } = req.body as { email?: string; role?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email address required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const inviteDomain = getEmailDomain(normalizedEmail);

    // Agency plan: enforce corporate domain
    if (workspace.plan === "agency") {
      if (isFreeEmailDomain(normalizedEmail)) {
        return res.status(400).json({
          error: "Agency workspaces only accept corporate email addresses. Free providers (Gmail, Yahoo, Hotmail, etc.) are not allowed.",
        });
      }

      // Derive corporate domain from owner's email if not set yet
      let corporateDomain = workspace.primaryDomain;
      if (!corporateDomain) {
        const owner = await prisma.workspaceUser.findFirst({
          where: { workspaceId: workspace.id, role: "owner" },
          include: { user: { select: { email: true } } },
        });
        if (owner) {
          corporateDomain = getEmailDomain(owner.user.email);
          await prisma.workspace.update({
            where: { id: workspace.id },
            data: { primaryDomain: corporateDomain },
          });
        }
      }

      if (corporateDomain && inviteDomain !== corporateDomain) {
        return res.status(400).json({
          error: `Agency workspace members must use a @${corporateDomain} email address.`,
          requiredDomain: corporateDomain,
        });
      }
    }

    const validRoles = ["admin", "analyst", "readonly"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be admin, analyst, or readonly." });
    }

    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const alreadyMember = await prisma.workspaceUser.findFirst({
        where: { workspaceId: workspace.id, userId: existingUser.id },
      });
      if (alreadyMember) {
        return res.status(409).json({ error: "This user is already a member of the workspace." });
      }
    }

    // Cancel any existing pending invite for this email
    await prisma.workspaceInvite.deleteMany({
      where: { workspaceId: workspace.id, email: normalizedEmail, acceptedAt: null },
    });

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        email: normalizedEmail,
        role,
        invitedById: membership.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // In production this would send an email. For now return the accept link.
    const acceptUrl = `${process.env.CLIENT_ORIGIN ?? "https://iqpipe.vercel.app"}/accept-invite?token=${invite.token}`;

    return res.status(201).json({
      ok: true,
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
      acceptUrl,
      note: "Invite created. Share the accept link with the invitee.",
    });
  } catch (err: any) {
    console.error("POST /api/settings/invite error", err);
    return res.status(500).json({ error: "Failed to create invite" });
  }
});

/**
 * DELETE /api/settings/invite/:id
 * Cancels a pending invite.
 */
router.delete("/invite/:id", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req as AuthenticatedRequest);
    if (!["owner", "admin"].includes(membership.role)) {
      return res.status(403).json({ error: "Only owners and admins can cancel invites." });
    }

    await prisma.workspaceInvite.deleteMany({
      where: { id: req.params.id, workspaceId: membership.workspaceId },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to cancel invite" });
  }
});

// ── GET /api/settings/usage ───────────────────────────────────────────────────

router.get("/usage", async (req, res) => {
  try {
    const membership = await getCurrentMembership(req as AuthenticatedRequest);
    const ws = membership.workspace;

    const limit   = PLAN_LIMITS[ws.plan] ?? 500;
    const wsAny   = ws as any;
    const count   = wsAny.eventCountMonth  ?? 0;
    const resetAt = wsAny.eventCountResetAt ?? null;
    const pct     = limit > 0 ? Math.round((count / limit) * 100) : 0;

    // Count contacts tracked (IqLeads not erased)
    const contactCount = await prisma.iqLead.count({
      where: { workspaceId: ws.id, erasedAt: null },
    });

    // Count active automations (n8n + Make workflows that are active)
    const [n8nActive, makeActive] = await Promise.all([
      prisma.n8nWorkflowMeta.count({ where: { workspaceId: ws.id, active: true } }),
      prisma.makeScenarioMeta.count({ where: { workspaceId: ws.id, active: true } }),
    ]);

    // Data stored estimate: ~2KB per touchpoint
    const touchpointCount = await prisma.touchpoint.count({ where: { workspaceId: ws.id } });
    const estimatedStorageMB = Math.round((touchpointCount * 2) / 1024);

    const planMonths: Record<string, number> = {
      trial: 3, free: 3, starter: 3, growth: 12, agency: 36,
    };
    const retentionMonths = planMonths[ws.plan] ?? ws.dataRetentionMonths;

    return res.json({
      plan: ws.plan,
      events: { count, limit, pct, resetAt },
      contacts: contactCount,
      activeAutomations: n8nActive + makeActive,
      estimatedStorageMB,
      retentionMonths,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load usage" });
  }
});

export default router;
