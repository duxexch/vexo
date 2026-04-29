/**
 * Reverse proxy that forwards commercial-agents endpoints to the standalone
 * `agents-service` container when `AGENTS_SERVICE_URL` is set. The main
 * server validates the admin session locally, then injects the validated
 * admin info as headers and forwards the request body verbatim.
 *
 * If `AGENTS_SERVICE_URL` is unset, this middleware is a no-op and the
 * legacy in-process routes (registerAdminAgentsRoutes, registerAgentRoutes)
 * continue to handle the requests. This is the default in dev / Replit.
 */
import type { Request, Response, NextFunction } from "express";
import {
  AuthVerificationError,
  getAdminTokenFromRequest,
  getUserTokenFromRequest,
  verifyAdminAccessToken,
  verifyUserAccessToken,
} from "../lib/auth-verification";
import { logger } from "../lib/logger";

interface ResolvedAdmin {
  id: string;
  role: string;
  username: string;
}

/**
 * Path-aware proxy prefixes. The two namespaces use different legacy auth
 * sources, so we route them through `resolveAdmin()` with the matching
 * token-extraction strategy below.
 *  - `/api/admin/agents/*` → admin JWT (adminAuthMiddleware in legacy)
 *  - `/api/agents/*`       → user JWT with role==="admin" (authMiddleware
 *                            + adminMiddleware in legacy)
 */
const ADMIN_PREFIX = "/api/admin/agents";
const PAYMENT_PREFIX = "/api/agents";

function matchesPrefix(reqPath: string, prefix: string): boolean {
  return reqPath === prefix || reqPath.startsWith(`${prefix}/`) || reqPath.startsWith(`${prefix}?`);
}

function shouldProxy(reqPath: string): boolean {
  return matchesPrefix(reqPath, ADMIN_PREFIX) || matchesPrefix(reqPath, PAYMENT_PREFIX);
}

/**
 * Resolve an admin context from either:
 *  1. an admin access token (preferred, used by `/api/admin/agents/*`), OR
 *  2. a user access token whose `role === "admin"` (legacy auth used by
 *     `/api/agents/*`).
 *
 * Returning `null` means "no credentials"; throwing AuthVerificationError
 * means the credentials were present but invalid (status carried on the
 * error). Anything else is treated as "credentials present but invalid".
 */
async function resolveAdmin(req: Request): Promise<ResolvedAdmin | null> {
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;

  const adminToken = getAdminTokenFromRequest(req);
  if (adminToken) {
    try {
      const verified = await verifyAdminAccessToken(adminToken, {
        userAgent: ua,
        requireActiveSession: true,
        updateSessionActivity: true,
      });
      return { id: verified.id, role: verified.role, username: verified.username };
    } catch (error) {
      if (error instanceof AuthVerificationError) throw error;
      // Fall through to try user token below
    }
  }

  const userToken = getUserTokenFromRequest(req);
  if (userToken) {
    try {
      const verified = await verifyUserAccessToken(userToken, {
        userAgent: ua,
        requireActiveSession: true,
        updateSessionActivity: true,
      });
      if (verified.role !== "admin") {
        // Match legacy adminMiddleware behaviour: 403, not 401
        throw new AuthVerificationError(403, "Admin access required");
      }
      return { id: verified.id, role: verified.role, username: verified.username };
    } catch (error) {
      if (error instanceof AuthVerificationError) throw error;
      return null;
    }
  }

  return null;
}

export function createAgentsProxyMiddleware() {
  const targetBase = process.env.AGENTS_SERVICE_URL?.replace(/\/+$/, "");
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

  if (!targetBase) {
    logger.info(
      "[agents-proxy] disabled (AGENTS_SERVICE_URL not set) — using in-process agent routes",
    );
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  if (!internalToken) {
    logger.warn(
      "[agents-proxy] AGENTS_SERVICE_URL is set but INTERNAL_SERVICE_TOKEN is missing — proxy disabled for safety",
    );
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  logger.info(`[agents-proxy] enabled → ${targetBase}`);

  return async function agentsProxy(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!shouldProxy(req.path)) {
      return next();
    }

    let admin: ResolvedAdmin | null;
    try {
      admin = await resolveAdmin(req);
    } catch (error) {
      if (error instanceof AuthVerificationError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    if (!admin) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    // Build forward URL preserving the original path & query string
    const originalUrl = req.originalUrl || req.url;
    const targetUrl = `${targetBase}${originalUrl}`;

    // Forward minimal headers + injected admin context
    const forwardHeaders: Record<string, string> = {
      "content-type": req.is("application/json") ? "application/json" : (req.headers["content-type"] as string) || "application/json",
      "x-internal-service-token": internalToken,
      "x-admin-id": admin.id,
      "x-admin-role": admin.role,
      "x-admin-username": admin.username,
    };
    const ua = req.headers["user-agent"];
    if (typeof ua === "string") forwardHeaders["user-agent"] = ua;
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string") forwardHeaders["x-forwarded-for"] = `${xff}, ${req.ip}`;
    else if (req.ip) forwardHeaders["x-forwarded-for"] = req.ip;

    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : undefined;
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body,
      });

      // Mirror status + relevant response headers
      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type");
      if (contentType) res.setHeader("content-type", contentType);
      const cacheCtl = upstream.headers.get("cache-control");
      if (cacheCtl) res.setHeader("cache-control", cacheCtl);

      const text = await upstream.text();
      res.send(text);
    } catch (error) {
      logger.error(
        `[agents-proxy] upstream error: ${req.method} ${originalUrl}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(502).json({ error: "Agents service unavailable" });
    }
  };
}
