/**
 * adminAuth.ts  —  Admin-only JWT middleware
 *
 * Completely separate from the user auth system:
 *  - Different secret: ADMIN_JWT_SECRET
 *  - Tokens carry { sub: "admin", role: "admin" }
 *  - Short-lived: 8 hours
 *
 * Admin credentials are env-var-only — no database rows involved.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || "admin-dev-secret-change-in-prod";

export const ADMIN_TOKEN_TTL = 8 * 60 * 60; // 8 hours in seconds

export interface AdminRequest extends Request {
  admin?: { role: "admin" };
}

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET) as any;
    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Forbidden." });
    }
    req.admin = { role: "admin" };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired admin token." });
  }
}
