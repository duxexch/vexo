import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

export function registerHealthRoutes(app: Express): void {
  // Liveness — does not touch the DB
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "agents-service", uptime: process.uptime() });
  });

  // Readiness — confirms DB connectivity
  app.get("/health/ready", async (_req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ ok: true, db: "ok" });
    } catch (error) {
      res.status(503).json({
        ok: false,
        db: "unreachable",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
