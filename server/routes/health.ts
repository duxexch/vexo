import type { Express, Request, Response } from "express";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import os from "os";
import { getDominoMoveErrorTelemetry, getHealthReport } from "../lib/health";
import { getAllCircuitBreakerStats } from "../lib/circuit-breaker";
import { redisHealthCheck } from "../lib/redis";
import { minioHealthCheck } from "../lib/minio-client";
import { adminTokenMiddleware } from "./middleware";
import { getErrorMessage } from "./helpers";

const PROCESS_BOOT_AT = new Date().toISOString();

interface ReleaseInfo {
  webVersion: string;
  releasedAt: string;
  nativeLatestVersion: string | null;
  nativeUpdateUrlAndroid: string | null;
  nativeUpdateUrlIos: string | null;
  forceNativeUpdate: boolean;
}

function readReleaseInfo(): ReleaseInfo {
  const webVersion =
    process.env.APP_RELEASE_VERSION ||
    process.env.RELEASE_VERSION ||
    process.env.npm_package_version ||
    "dev";

  return {
    webVersion,
    releasedAt: process.env.APP_RELEASED_AT || process.env.BUILD_TIMESTAMP || PROCESS_BOOT_AT,
    nativeLatestVersion: process.env.APP_NATIVE_LATEST_VERSION || null,
    nativeUpdateUrlAndroid: process.env.APP_UPDATE_URL_ANDROID || null,
    nativeUpdateUrlIos: process.env.APP_UPDATE_URL_IOS || null,
    forceNativeUpdate: process.env.APP_FORCE_UPDATE === "true",
  };
}

export function registerHealthRoutes(app: Express): void {
  app.get("/api/release", (_req: Request, res: Response) => {
    res.json({
      release: readReleaseInfo(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - dbStart;

      // Check Redis and MinIO (non-blocking)
      const [redisOk, minioOk] = await Promise.all([
        redisHealthCheck().catch(() => false),
        minioHealthCheck().catch(() => false),
      ]);

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latency: `${dbLatency}ms`,
        },
        redis: { status: redisOk ? "connected" : "unavailable" },
        minio: { status: minioOk ? "connected" : "unavailable" },
        release: readReleaseInfo(),
        uptime: process.uptime(),
      });
    } catch (error: unknown) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          error: getErrorMessage(error),
        },
      });
    }
  });

  app.get("/api/health/detailed", adminTokenMiddleware, async (_req: Request, res: Response) => {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - dbStart;

      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Check Redis and MinIO
      const [redisOk, minioOk] = await Promise.all([
        redisHealthCheck().catch(() => false),
        minioHealthCheck().catch(() => false),
      ]);

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latency: `${dbLatency}ms`,
          pool: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
          },
        },
        redis: { status: redisOk ? "connected" : "unavailable" },
        minio: { status: minioOk ? "connected" : "unavailable" },
        release: readReleaseInfo(),
        memory: {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        },
        cpu: {
          user: `${Math.round(cpuUsage.user / 1000)}ms`,
          system: `${Math.round(cpuUsage.system / 1000)}ms`,
        },
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          loadAverage: os.loadavg(),
          freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
          totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
        },
        dominoMoveErrors: getDominoMoveErrorTelemetry(),
        uptime: process.uptime(),
      });
    } catch (error: unknown) {
      res.status(503).json({
        status: "unhealthy",
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/health/full", adminTokenMiddleware, async (_req: Request, res: Response) => {
    try {
      const report = await getHealthReport();
      const circuitBreakers = getAllCircuitBreakerStats();

      res.json({
        ...report,
        circuitBreakers,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/health/circuits", adminTokenMiddleware, async (_req: Request, res: Response) => {
    const circuitBreakers = getAllCircuitBreakerStats();
    res.json(circuitBreakers);
  });

  app.get("/api/health/domino-move-errors", adminTokenMiddleware, async (_req: Request, res: Response) => {
    res.json(getDominoMoveErrorTelemetry());
  });
}
