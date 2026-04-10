import { Router, Request, Response } from "express";
import { prisma } from "../db";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET env variable is not set.");

// 1. Define a custom Request type to fix the TypeScript error
interface AuthenticatedRequest extends Request {
  user?: {
    sub: string; // 'sub' is the standard JWT claim for User ID
    email: string;
  };
}

// Middleware to decode token inline (keeps this file self-contained)
const verifyToken = (req: AuthenticatedRequest, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    req.user = decoded; // Attach to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// GET /api/workspaces/primary
// Returns the first workspace found for the logged-in user
router.get("/primary", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  // 2. Use the type-safe property
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    // 3. Find the membership
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" } // Oldest workspace = Primary
    });

    if (!membership) {
      console.warn(`User ${userId} has no workspace membership.`);
      return res.status(404).json({ error: "No workspace found for this user" });
    }

    return res.json({
      id:     membership.workspaceId,
      name:   membership.workspace.name,
      slug:   membership.workspace.slug,
      isDemo: membership.workspace.isDemo,
      plan:   membership.workspace.plan,
    });

  } catch (error) {
    console.error("Workspace fetch error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/workspaces/webhook-url
// Returns ready-to-use webhook URLs for n8n and Make.com push-only mode.
// Requires auth — no platform API key needed.
router.get("/webhook-url", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "User not authenticated" });

  try {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) return res.status(404).json({ error: "No workspace found" });

    const workspaceId = membership.workspaceId;
    const base = process.env.API_BASE_URL ?? "https://api.iqpipe.io";

    return res.json({
      workspaceId,
      n8n:  `${base}/api/webhooks/n8n?workspaceId=${workspaceId}`,
      make: `${base}/api/webhooks/make?workspaceId=${workspaceId}`,
      note: "Add one HTTP Request node at the end of any workflow. No n8n or Make.com API key required.",
    });
  } catch (err) {
    console.error("webhook-url error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;