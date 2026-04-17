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
import { clients } from "../websocket/shared";
import { getVoiceTelemetrySnapshot } from "../websocket/voice";

const PROCESS_BOOT_AT = new Date().toISOString();

interface ReleaseInfo {
  webVersion: string;
  releasedAt: string;
  nativeLatestVersion: string | null;
  nativeUpdateUrlAndroid: string | null;
  nativeUpdateUrlIos: string | null;
  forceNativeUpdate: boolean;
}

function resolveRequestOrigin(req: Request): string {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : typeof forwardedProtoHeader === "string"
      ? forwardedProtoHeader.split(",")[0]
      : undefined;

  const protocol = (forwardedProto || req.protocol || "https").trim();
  const host = req.get("host");

  if (host) {
    return `${protocol}://${host}`;
  }

  return process.env.APP_PUBLIC_BASE_URL || "https://vixo.click";
}

function resolveNativeLatestVersion(webVersion: string): string | null {
  if (process.env.APP_NATIVE_LATEST_VERSION) {
    return process.env.APP_NATIVE_LATEST_VERSION;
  }

  return /\d/.test(webVersion) ? webVersion : null;
}

function readReleaseInfo(req: Request): ReleaseInfo {
  const webVersion =
    process.env.APP_RELEASE_VERSION ||
    process.env.RELEASE_VERSION ||
    process.env.npm_package_version ||
    "dev";

  const requestOrigin = resolveRequestOrigin(req);
  const nativeLatestVersion = resolveNativeLatestVersion(webVersion);

  return {
    webVersion,
    releasedAt: process.env.APP_RELEASED_AT || process.env.BUILD_TIMESTAMP || PROCESS_BOOT_AT,
    nativeLatestVersion,
    nativeUpdateUrlAndroid:
      process.env.APP_UPDATE_URL_ANDROID || `${requestOrigin}/downloads/VEX-official-release.apk`,
    nativeUpdateUrlIos: process.env.APP_UPDATE_URL_IOS || null,
    forceNativeUpdate: process.env.APP_FORCE_UPDATE === "true",
  };
}

function getTotalWsConnections(): number {
  let total = 0;
  clients.forEach((sockets) => {
    total += sockets.size;
  });
  return total;
}

async function buildMonitoringKpi(req: Request): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  release: ReleaseInfo;
  kpi: {
    uptimeSeconds: number;
    databaseLatencyMs: number | null;
    redisConnected: boolean;
    minioConnected: boolean;
    connectedUsers: number;
    totalWsConnections: number;
    activeVoiceRooms: number;
    voiceJoinAcceptanceRate: number;
    voiceRejectedEvents: number;
    voiceForwardedEvents: number;
    voiceIceCandidatesObserved: number;
    voiceIceRelayRatio: number;
    voiceIceHost: number;
    voiceIceSrflx: number;
    voiceIceRelay: number;
    voiceIcePrflx: number;
    voiceIceUnknown: number;
    processRssMb: number;
  };
}> {
  const dbStart = Date.now();
  let databaseLatencyMs: number | null = null;
  let databaseHealthy = false;

  try {
    await db.execute(sql`SELECT 1`);
    databaseLatencyMs = Date.now() - dbStart;
    databaseHealthy = true;
  } catch {
    databaseHealthy = false;
  }

  const [redisHealth, minioHealth] = await Promise.all([
    redisHealthCheck().catch(() => false),
    minioHealthCheck().catch(() => false),
  ]);
  const redisConnected = typeof redisHealth === "boolean" ? redisHealth : redisHealth.status === "connected";
  const minioConnected = typeof minioHealth === "boolean" ? minioHealth : minioHealth.status === "connected";

  const voiceTelemetry = getVoiceTelemetrySnapshot();
  const memoryUsage = process.memoryUsage();

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (!databaseHealthy) {
    status = "unhealthy";
  } else if (!redisConnected || !minioConnected) {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    release: readReleaseInfo(req),
    kpi: {
      uptimeSeconds: Math.round(process.uptime()),
      databaseLatencyMs,
      redisConnected,
      minioConnected,
      connectedUsers: clients.size,
      totalWsConnections: getTotalWsConnections(),
      activeVoiceRooms: voiceTelemetry.activeRooms,
      voiceJoinAcceptanceRate: voiceTelemetry.rates.joinAcceptanceRate,
      voiceRejectedEvents: voiceTelemetry.totals.rejected,
      voiceForwardedEvents: voiceTelemetry.totals.forwarded,
      voiceIceCandidatesObserved: voiceTelemetry.iceCandidates.totalObserved,
      voiceIceRelayRatio: voiceTelemetry.iceCandidates.distribution.relay,
      voiceIceHost: voiceTelemetry.iceCandidates.byType.host,
      voiceIceSrflx: voiceTelemetry.iceCandidates.byType.srflx,
      voiceIceRelay: voiceTelemetry.iceCandidates.byType.relay,
      voiceIcePrflx: voiceTelemetry.iceCandidates.byType.prflx,
      voiceIceUnknown: voiceTelemetry.iceCandidates.byType.unknown,
      processRssMb: Math.round(memoryUsage.rss / 1024 / 1024),
    },
  };
}

export function registerHealthRoutes(app: Express): void {
  app.get("/api/release", (req: Request, res: Response) => {
    res.json({
      release: readReleaseInfo(req),
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
        release: readReleaseInfo(_req),
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

  app.get("/api/health/kpi", async (req: Request, res: Response) => {
    try {
      const payload = await buildMonitoringKpi(req);
      const statusCode = payload.status === "unhealthy" ? 503 : 200;
      res.status(statusCode).json(payload);
    } catch (error: unknown) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/admin/health/kpi", adminTokenMiddleware, async (req: Request, res: Response) => {
    try {
      const payload = await buildMonitoringKpi(req);
      const statusCode = payload.status === "unhealthy" ? 503 : 200;
      res.status(statusCode).json(payload);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
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
        release: readReleaseInfo(_req),
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
