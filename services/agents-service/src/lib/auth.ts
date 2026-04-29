import type { Request, Response, NextFunction } from "express";
import { env } from "../env";

export interface AdminContext {
  id: string;
  role: string;
  username: string;
}

export interface AdminRequest extends Request {
  admin?: AdminContext;
}

/**
 * Trust internal proxy from the main server. The main server is responsible
 * for validating the admin session/JWT and then forwarding the request with:
 *  - X-Internal-Service-Token: shared secret (must match env)
 *  - X-Admin-Id, X-Admin-Role, X-Admin-Username: validated admin info
 *
 * Direct external access (without the internal token) is rejected with 401.
 */
export function internalAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = req.header("x-internal-service-token");
  if (!token || token !== env.INTERNAL_SERVICE_TOKEN) {
    res.status(401).json({ error: "Unauthorized: missing or invalid internal service token" });
    return;
  }

  const adminId = req.header("x-admin-id");
  const adminRole = req.header("x-admin-role");
  const adminUsername = req.header("x-admin-username");

  if (!adminId || !adminRole) {
    res.status(401).json({ error: "Unauthorized: missing admin context headers" });
    return;
  }

  req.admin = {
    id: adminId,
    role: adminRole,
    username: adminUsername || "unknown",
  };
  next();
}
