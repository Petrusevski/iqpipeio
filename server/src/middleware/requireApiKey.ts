import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";

export interface ApiKeyRequest extends Request {
  workspaceId?: string;
}

/**
 * Middleware that authenticates via the workspace's publicApiKey.
 * Clients pass: Authorization: Bearer <publicApiKey>
 * On success, sets req.workspaceId for downstream handlers.
 */
export async function requireApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token.startsWith("rvn_pk_")) {
    return res.status(401).json({ error: "Invalid API key format." });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { publicApiKey: token },
    select: { id: true },
  });

  if (!workspace) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  req.workspaceId = workspace.id;
  return next();
}
