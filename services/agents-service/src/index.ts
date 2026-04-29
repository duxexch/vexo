import express, { type Request, type Response, type NextFunction } from "express";
import { env, isProduction } from "./env";
import { registerHealthRoutes } from "./routes/health";
import { registerAdminAgentsRoutes } from "./routes/admin";
import { registerAgentPaymentRoutes } from "./routes/payments";
import { closePool } from "./db";

const app = express();

// Trust the proxy (main server) for accurate req.ip / X-Forwarded-For
app.set("trust proxy", true);

// Body parsing — generous limit for ledger metadata payloads
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Minimal request logger (skip /health noise)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!isProduction || !req.path.startsWith("/health")) {
    const adminHeader = req.header("x-admin-id");
    console.log(
      `[agents-service] ${req.method} ${req.path}${adminHeader ? ` admin=${adminHeader}` : ""}`,
    );
  }
  next();
});

// Routes
registerHealthRoutes(app);
registerAdminAgentsRoutes(app);
registerAgentPaymentRoutes(app);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Last-resort error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[agents-service] unhandled error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

const server = app.listen(env.PORT, () => {
  console.log(
    `[agents-service] listening on :${env.PORT} (env=${env.NODE_ENV}, db_pool_max=${env.DB_POOL_MAX})`,
  );
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[agents-service] received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await closePool();
    } catch (e) {
      console.error("[agents-service] pool close error:", e);
    }
    process.exit(0);
  });
  // Hard kill if shutdown stalls
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
