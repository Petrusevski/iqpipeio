import { Router } from "express";
import { prisma } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { isFreeEmailDomain, getEmailDomain } from "../utils/corporateEmail";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET env variable is missing or too short.");
}

function createToken(user: { id: string; email: string }) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET!, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    // Minimum password strength
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { fullName: String(fullName).trim(), email: String(email).toLowerCase().trim(), passwordHash },
      });

      const slug = `${String(fullName).toLowerCase().replace(/[^a-z0-9]/g, "-")}-${uuidv4().slice(0, 4)}`;
      const workspace = await tx.workspace.create({
        data: {
          name: `${String(fullName).trim()}'s Workspace`,
          slug,
          plan: "trial",
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          users: {
            create: { userId: user.id, role: "owner" },
          },
        },
      });

      return { user, workspace };
    });

    const token = createToken(result.user);

    return res.status(201).json({
      token,
      user: { id: result.user.id, email: result.user.email, fullName: result.user.fullName },
      workspaceId: result.workspace.id,
    });
  } catch (err: any) {
    console.error("Register error:", err.message);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createToken(user);

    return res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
  } catch (err: any) {
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "Failed to login" });
  }
});

/**
 * GET /api/auth/invite-info?token=...
 * Returns invite metadata (email, workspace name) so the accept page can pre-fill the form.
 */
router.get("/invite-info", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).json({ error: "Token required" });

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: { select: { name: true, plan: true, primaryDomain: true } } },
  });

  if (!invite) return res.status(404).json({ error: "Invite not found or already used" });
  if (invite.acceptedAt) return res.status(410).json({ error: "Invite already accepted" });
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: "Invite has expired" });

  return res.json({
    email: invite.email,
    role: invite.role,
    workspaceName: invite.workspace.name,
    workspacePlan: invite.workspace.plan,
  });
});

/**
 * POST /api/auth/accept-invite
 * Accepts a workspace invite. Creates the user account if they don't have one yet.
 * Body: { token, fullName, password }
 */
router.post("/accept-invite", async (req, res) => {
  try {
    const { token, fullName, password } = req.body || {};
    if (!token) return res.status(400).json({ error: "Token required" });

    const invite = await prisma.workspaceInvite.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true, plan: true, primaryDomain: true } } },
    });

    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.acceptedAt) return res.status(410).json({ error: "Invite already accepted" });
    if (invite.expiresAt < new Date()) return res.status(410).json({ error: "Invite has expired" });

    const email = invite.email;

    // Agency: re-validate domain at acceptance time (defence in depth)
    if (invite.workspace.plan === "agency") {
      if (isFreeEmailDomain(email)) {
        return res.status(400).json({ error: "Agency workspaces require a corporate email address." });
      }
      const domain = invite.workspace.primaryDomain;
      if (domain && getEmailDomain(email) !== domain) {
        return res.status(400).json({ error: `Only @${domain} email addresses are allowed in this workspace.` });
      }
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // New user — fullName + password required
      if (!fullName || !password) {
        return res.status(400).json({ error: "fullName and password required for new accounts", needsRegistration: true });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      user = await prisma.user.create({
        data: { email, fullName: String(fullName).trim(), passwordHash },
      });
    }

    // Add to workspace (idempotent)
    await prisma.workspaceUser.upsert({
      where: { id: `${invite.workspaceId}_${user.id}` },
      create: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
        isBillingOwner: false,
      },
      update: { role: invite.role },
    }).catch(async () => {
      // upsert by compound key not supported — use findFirst + create
      const existing = await prisma.workspaceUser.findFirst({
        where: { workspaceId: invite.workspaceId, userId: user!.id },
      });
      if (!existing) {
        await prisma.workspaceUser.create({
          data: { workspaceId: invite.workspaceId, userId: user!.id, role: invite.role, isBillingOwner: false },
        });
      }
    });

    // Mark invite as accepted
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    const jwtToken = createToken(user);
    return res.json({
      token: jwtToken,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      workspaceId: invite.workspaceId,
      workspaceName: invite.workspace.name,
    });
  } catch (err: any) {
    console.error("Accept invite error:", err.message);
    return res.status(500).json({ error: "Failed to accept invite" });
  }
});

export default router;
