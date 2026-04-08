import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { type Server } from "http";
import { setupWebSocket } from "./websocket";
import { trackError } from "./lib/health";
import { logger, requestLogger } from "./lib/logger";
import { registerModularRoutes } from "./routes/index";
import { authMiddleware, type AuthRequest } from "./routes/middleware";
import { apiRateLimiter, attackProtectionLimiter } from "./setup/rate-limiters";
import { runDatabaseSeeds } from "./setup/seeds";
import { runAdminBootstrap } from "./setup/admin-bootstrap";
import { startSchedulers } from "./setup/schedulers";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Apply request logging middleware
  app.use(requestLogger() as unknown as RequestHandler);

  // Apply DDoS protection first (absolute limit)
  app.use("/api", attackProtectionLimiter);

  // Apply general API rate limiter to all API routes
  app.use("/api", apiRateLimiter);

  // Register modular routes (health, auth, users, games, transactions, p2p, challenges, etc.)
  registerModularRoutes(app);

  // ==================== GAME PLAY ROUTES (REMOVED - single-player games deleted) ====================
  app.post("/api/games/:id/play", authMiddleware, async (_req: AuthRequest, res: Response) => {
    res.status(410).json({ error: "Single-player games have been removed" });
  });
  app.get("/api/games/:id/history", authMiddleware, async (_req: AuthRequest, res: Response) => {
    res.json([]);
  });

  // ==================== DATABASE SEEDS ====================
  runDatabaseSeeds();

  // ==================== WEBSOCKET SETUP ====================
  setupWebSocket(httpServer);

  // ==================== ADMIN BOOTSTRAP (PRODUCTION-SAFE) ====================
  runAdminBootstrap();

  // Global error handler with error tracking
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    const statusFromError = (err && typeof err === "object" && "status" in err)
      ? (err as { status: number }).status
      : undefined;
    const isMalformedJson = err instanceof SyntaxError && /json/i.test(errMsg);
    const errStatus = isMalformedJson ? 400 : (statusFromError ?? 500);
    trackError(errMsg || 'Unknown error');
    logger.error(`Unhandled error: ${errMsg}`, err instanceof Error ? err : undefined, {
      path: _req.path,
      method: _req.method,
    });

    if (res.headersSent) {
      return _next(err);
    }

    const safeMessage = errStatus >= 500
      ? "Internal server error"
      : (isMalformedJson ? "Invalid JSON payload" : (errMsg || "Bad request"));

    res.status(errStatus || 500).json({
      error: process.env.NODE_ENV === "production" ? safeMessage : errMsg
    });
  });

  // ==================== SCHEDULERS ====================
  startSchedulers();

  return httpServer;
}
