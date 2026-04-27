import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { registerAdminRoutes } from "./admin-routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupGameWebSocket } from "./game-websocket";
import { seedMultiplayerGames, seedGiftCatalog, seedFreePlaySettings } from "./seed";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import { fileURLToPath } from "url";
import { getRedisClient, redisHealthCheck, closeRedis, trackUserOnline, getOnlineUserCount } from "./lib/redis";
import { createPrerenderMiddleware } from "./lib/prerender-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { initMinIO, uploadFile as minioUpload, getFileStream, getMinioClient, getBucketName, minioHealthCheck } from "./lib/minio-client";
import { startSecurityCleanupJob } from "./lib/security-cleanup";
import { db } from "./db";
import { challenges, users, projectCurrencyWallets } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { storage } from "./storage";
import { logger } from "./lib/logger";
import {
  getAdminTokenFromRequest,
  getUserTokenFromRequest,
  verifyAdminAccessToken,
  verifyUserAccessToken,
} from "./lib/auth-verification";

/** Safely extract error message from unknown catch value */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Auto-cancel expired waiting challenges — runs every 5 minutes
function startChallengeExpiryJob() {
  setInterval(async () => {
    try {
      const defaultExpiryMinutes = 30;
      const expiryCutoff = new Date(Date.now() - defaultExpiryMinutes * 60 * 1000);

      // Step 1: Find expired waiting challenges (batch, limit 50 per run)
      const expiredChallenges = await db.select()
        .from(challenges)
        .where(and(
          eq(challenges.status, 'waiting'),
          lt(challenges.createdAt, expiryCutoff)
        ))
        .limit(50);

      if (expiredChallenges.length === 0) return;

      let cancelledCount = 0;
      for (const challenge of expiredChallenges) {
        try {
          await db.transaction(async (tx) => {
            // Lock the challenge row first to prevent concurrent processing
            const [locked] = await tx.select().from(challenges)
              .where(and(eq(challenges.id, challenge.id), eq(challenges.status, 'waiting')))
              .for('update');
            if (!locked) return; // Already processed by another instance

            const betAmount = parseFloat(locked.betAmount || '0');
            const currencyType = locked.currencyType || 'usd';

            // Refund ALL joined players — not just player1
            const allPlayerIds = [locked.player1Id, locked.player2Id, locked.player3Id, locked.player4Id].filter(Boolean) as string[];

            if (betAmount > 0) {
              for (const playerId of allPlayerIds) {
                if (currencyType === 'project') {
                  await tx.execute(sql`
                    UPDATE project_currency_wallets 
                    SET earned_balance = (CAST(earned_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                        total_balance = (CAST(total_balance AS DECIMAL(18,8)) + ${betAmount})::text,
                        updated_at = NOW()
                    WHERE user_id = ${playerId}
                  `);
                } else {
                  await tx.update(users)
                    .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${betAmount})::text` })
                    .where(eq(users.id, playerId));
                }
              }
            }

            await tx.update(challenges)
              .set({ status: 'cancelled', updatedAt: new Date() })
              .where(eq(challenges.id, locked.id));
          });
          cancelledCount++;
        } catch (innerErr: unknown) {
          logger.error(`[CRON] Failed to cancel challenge ${challenge.id}`, new Error(getErrorMessage(innerErr)));
        }
      }

      if (cancelledCount > 0) {
        logger.info(`[CRON] Auto-cancelled ${cancelledCount} expired challenges`);
      }
    } catch (error: unknown) {
      logger.error('[CRON] Challenge expiry job error', new Error(getErrorMessage(error)));
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  logger.info('[CRON] Challenge expiry job started (every 5 min)');
}

// Note: crash handlers are registered below (after route setup) to avoid duplication

const app = express();
const httpServer = createServer(app);

const publicFileRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many upload requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

const gameWss = setupGameWebSocket(httpServer);

const isProduction = process.env.NODE_ENV === "production";

function computeInlineScriptHashes(): string[] {
  const indexCandidates = [
    path.resolve(__dirname, "..", "dist", "public", "index.html"),
    path.resolve(__dirname, "..", "client", "index.html"),
  ];

  let html = "";
  for (const candidate of indexCandidates) {
    if (fs.existsSync(candidate)) {
      html = fs.readFileSync(candidate, "utf-8");
      break;
    }
  }

  if (!html) {
    return [];
  }

  const hashes = new Set<string>();
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = inlineScriptRegex.exec(html)) !== null) {
    const scriptContent = match[1];
    if (!scriptContent || scriptContent.trim().length === 0) {
      continue;
    }

    const hash = crypto.createHash("sha256").update(scriptContent).digest("base64");
    hashes.add(`'sha256-${hash}'`);
  }

  return Array.from(hashes);
}

const cspInlineScriptHashes = isProduction ? computeInlineScriptHashes() : [];

// ==================== SERVICE WORKER — CRITICAL FOR PWA ====================
// Must be served BEFORE Vite middleware or static serving to ensure correct headers
{
  const swDir = isProduction
    ? path.resolve(__dirname, "..", "dist", "public")
    : path.resolve(__dirname, "..", "client", "public");

  app.get("/sw.js", publicFileRateLimiter, (_req: any, res: any) => {
    const swPath = path.join(swDir, "sw.js");
    if (fs.existsSync(swPath)) {
      const content = fs.readFileSync(swPath, "utf-8");
      res.set("Content-Type", "application/javascript; charset=utf-8");
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.set("Service-Worker-Allowed", "/");
      return res.status(200).send(content);
    }
    return res.status(404).type("text/plain").send("// Service worker not found");
  });
}

// ==================== DOWNLOAD FILE SERVING ====================
// Serve APK/AAB downloads BEFORE any other middleware to ensure proper download
{
  const downloadsDir = isProduction
    ? path.resolve(__dirname, "..", "dist", "public", "downloads")
    : path.resolve(__dirname, "..", "client", "public", "downloads");

  const blockPublicAabDownload = (req: Request, res: Response, next: NextFunction) => {
    if (req.path.toLowerCase().endsWith(".aab")) {
      return res.status(404).type("text/plain").send("Not found");
    }
    return next();
  };

  app.use("/downloads", blockPublicAabDownload, express.static(downloadsDir, {
    etag: true,
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      }
      // manifest.json drives the APK filename shown in the download UI —
      // it MUST never be cached, otherwise a freshly-published version
      // (e.g. VEX-1.0.1.apk) would serve a stale filename for up to an
      // hour after the operator runs refresh-android-binaries.sh.
      if (path.basename(filePath) === 'manifest.json') {
        res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    }
  }));
}

// Trust proxy for rate limiting behind nginx/load balancers
// Enable in Replit environment or production (both use proxies)
// Number of proxies between user and server (1 for nginx/Replit proxy)
const isReplit = process.env.REPLIT || process.env.REPL_ID;
app.set("trust proxy", isProduction || isReplit ? 1 : false);

// ==================== SECURITY MIDDLEWARE ====================

// Gzip/Deflate compression — reduces transfer size by ~70%
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// Parse cookies for httpOnly token support
app.use(cookieParser());

const csrfProtection = csurf({
  cookie: {
    key: "vex_csrf",
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
  },
  ignoreMethods: ["GET", "HEAD", "OPTIONS"],
});

function shouldEnforceCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const hasBearerAuth = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ");
  const hasAdminTokenHeader = typeof req.headers["x-admin-token"] === "string" && req.headers["x-admin-token"].length > 0;
  if (hasBearerAuth || hasAdminTokenHeader) {
    return false;
  }

  return typeof req.cookies?.vex_token === "string" && req.cookies.vex_token.length > 0;
}

app.get("/api/auth/csrf-token", csrfProtection, (req: Request, res: Response) => {
  const csrfToken = (req as Request & { csrfToken?: () => string }).csrfToken?.();
  res.setHeader("Cache-Control", "no-store");
  return res.json({ csrfToken: csrfToken || null });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!shouldEnforceCsrf(req)) {
    return next();
  }

  return csrfProtection(req, res, next);
});

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next(err);
});

// CORS protection - restrict cross-origin requests in production
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = isProduction
    ? ['https://vixo.click', 'https://www.vixo.click']
    : ['http://localhost:3001', 'http://localhost:3000', 'http://127.0.0.1:3001'];

  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-csrf-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Security headers (Helmet-like protection without external dependency)
app.use((req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking attacks
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Disable XSS filter (deprecated, can cause issues)
  res.setHeader("X-XSS-Protection", "0");

  // Control referrer information
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — allow same-origin access to the device features
  // the app actually uses (mic + camera for friend calls, fullscreen for
  // game players, clipboard-write for share / copy buttons). Anything
  // not listed here is implicitly disabled, so this header doubles as a
  // self-imposed allow-list.
  //
  // Task #143: previously `camera=()` blocked the camera entirely,
  // which silently broke video calls inside the WebView even though
  // the platform-level permission was granted. The fix is to allow
  // same-origin access ("self") for every API the codebase invokes.
  res.setHeader(
    "Permissions-Policy",
    [
      "geolocation=()",
      "microphone=(self)",
      "camera=(self)",
      "display-capture=(self)",
      "fullscreen=(self)",
      "clipboard-write=(self)",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  );

  // Content Security Policy (CSP) - prevent XSS and injection attacks
  if (isProduction) {
    const scriptSources = ["'self'", "https://accounts.google.com", ...cspInlineScriptHashes].join(" ");

    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      `script-src ${scriptSources}; ` +
      "script-src-attr 'none'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "frame-src 'self' https://accounts.google.com; " +
      "connect-src 'self' wss: ws: https:; " +
      "media-src 'self' blob:; " +
      "worker-src 'self' blob:; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "upgrade-insecure-requests; " +
      "block-all-mixed-content;"
    );

    // Strict Transport Security (HSTS) - force HTTPS
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );

    // Cross-Origin isolation headers
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  }

  // Remove X-Powered-By header (hide Express)
  res.removeHeader("X-Powered-By");

  // Prevent caching of auth/admin API responses
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }

  // Add request ID for tracing
  const requestId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { requestId: string }).requestId = requestId;

  next();
});

// Prerender.io integration for crawler HTML requests.
// Keep this before body parsing/routes so crawler requests are intercepted early.
app.use(createPrerenderMiddleware());

// Request size limits to prevent DoS attacks
// SECURITY: Higher limit for upload routes (base64 images), lower default for API
app.use('/api/user/profile-picture', express.json({ limit: '15mb' }));
app.use('/api/user/cover-photo', express.json({ limit: '15mb' }));
app.use('/api/user/id-verification', express.json({ limit: '15mb' }));
app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    (req as Request & { rawBody: Buffer }).rawBody = buf;
  },
}));

app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// Protect against prototype pollution attacks (safe, non-destructive)
const sanitizeKeys = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeKeys);
  }
  if (obj && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      // Block prototype pollution attacks only
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        logger.warn(`[SECURITY] Blocked prototype pollution attempt: ${key}`);
        continue;
      }
      sanitized[key] = sanitizeKeys((obj as Record<string, unknown>)[key]);
    }
    return sanitized;
  }
  return obj;
};

// Apply prototype pollution protection only (preserves user data)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeKeys(req.body);
  }
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

// High-frequency endpoints that flood production logs without diagnostic value:
//   /api/health   — Docker/Traefik healthcheck every 30s
//   /api/release  — frontend release-version poll every ~5s
// These are intentionally skipped here AND in requestLogger (logger.ts) so the
// structured JSON log stays the single source of truth for API traffic.
const SKIP_REQUEST_LOG_PATHS = new Set(["/api/health", "/api/release"]);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!path.startsWith("/api")) return;
    if (SKIP_REQUEST_LOG_PATHS.has(path)) return;
    // Only emit the human-readable line for non-2xx so production logs aren't
    // duplicated by the structured requestLogger. 4xx/5xx stay visible here
    // for at-a-glance scanning during incidents.
    if (res.statusCode >= 400) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// Utility: get file extension from MIME type
function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
    "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg",
    "image/bmp": ".bmp", "image/tiff": ".tiff", "image/heic": ".heic",
    "image/heif": ".heif", "image/avif": ".avif", "image/ico": ".ico",
    "image/x-icon": ".ico",
    "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
    "video/x-msvideo": ".avi", "video/x-matroska": ".mkv", "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
  };
  return map[mime] || "";
}

// Process-level error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception (exit)', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// Graceful shutdown — close Redis, MinIO connections
const gracefulShutdown = async (signal: string) => {
  logger.info(`[${signal}] Graceful shutdown initiated...`);
  try {
    await closeRedis();
    logger.info('[Shutdown] Redis closed');
  } catch { }
  process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

(async () => {
  try {
    await registerRoutes(httpServer, app);
    registerAdminRoutes(app);

    // ==================== FILE UPLOADS ====================

    // Ensure uploads directory exists and is writable
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    // Verify write permission
    try {
      const testFile = path.join(uploadsDir, ".write-test");
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      log("Uploads directory is writable: " + uploadsDir, "storage");
    } catch (err: unknown) {
      logger.fatal(`Uploads directory NOT writable: ${uploadsDir}`, err instanceof Error ? err : new Error(String(err)));
      logger.error("Fix: Run 'chmod 777 uploads' or 'chown 1001:1001 uploads' on the host");
    }

    // Serve legacy uploaded files from disk (backwards compatibility)
    app.use("/uploads", express.static(uploadsDir, {
      maxAge: "30d",
      immutable: true,
    }));

    // Initialize MinIO in production
    const useMinIO = isProduction && !!process.env.MINIO_ENDPOINT;
    if (useMinIO) {
      try {
        await initMinIO();
        log("MinIO initialized successfully", "storage");
      } catch (err: unknown) {
        logger.error('[MinIO] Init failed, falling back to disk', err instanceof Error ? err : new Error(String(err)));
      }
    }

    // Serve files from MinIO via /storage/* proxy route
    app.get("/storage/*", publicFileRateLimiter, async (req: Request, res: Response) => {
      try {
        const wildcardParam = (req.params as Record<string, string | undefined>)["0"];
        const rawObjectName = typeof wildcardParam === "string" ? wildcardParam.trim() : "";
        const normalizedObjectName = rawObjectName.replace(/\\/g, "/").replace(/^\/+/, "");
        const objectNameParts = normalizedObjectName.split("/");
        if (
          !normalizedObjectName
          || objectNameParts.some((part) => !part || part === "." || part === "..")
        ) {
          return res.status(400).json({ error: "Invalid filename" });
        }
        const objectName = objectNameParts.join("/");

        if (useMinIO) {
          const [stream, objectStat] = await Promise.all([
            getFileStream(objectName),
            getMinioClient().statObject(getBucketName(), objectName).catch(() => null),
          ]);

          // Set cache headers
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");

          const statMimeType = objectStat?.metaData?.["content-type"] || objectStat?.metaData?.["Content-Type"];
          if (typeof statMimeType === "string" && statMimeType.trim().length > 0) {
            res.setHeader("Content-Type", statMimeType);
          } else {
            // Fallback MIME resolution if object metadata is missing.
            const ext = path.extname(objectName).toLowerCase();
            const mimeMap: Record<string, string> = {
              ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
              ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
              ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf",
              ".avif": "image/avif", ".heic": "image/heic", ".bmp": "image/bmp",
              ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav",
              ".aac": "audio/aac", ".m4a": "audio/mp4",
            };
            if (mimeMap[ext]) {
              res.setHeader("Content-Type", mimeMap[ext]);
            }
          }

          stream.pipe(res);
        } else {
          // Fallback: try to serve from local uploads dir
          const localPath = path.resolve(uploadsDir, ...objectNameParts);
          const relativePath = path.relative(uploadsDir, localPath);
          if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
            return res.status(400).json({ error: "Invalid filename" });
          }

          if (fs.existsSync(localPath)) {
            return res.sendFile(localPath);
          }
          res.status(404).json({ error: "File not found" });
        }
      } catch (error: unknown) {
        logger.error('[Storage] Error serving file', new Error(getErrorMessage(error)));
        res.status(404).json({ error: "File not found" });
      }
    });

    // General-purpose file upload endpoint (base64 → MinIO or disk)
    app.post("/api/upload", uploadRateLimiter, async (req: Request, res: Response) => {
      try {
        // Verify auth token for both user and admin upload paths.
        let authenticated = false;

        const userToken = getUserTokenFromRequest(req);
        if (userToken) {
          try {
            await verifyUserAccessToken(userToken, {
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
              requireActiveSession: true,
              updateSessionActivity: true,
            });
            authenticated = true;
          } catch { }
        }

        const adminToken = getAdminTokenFromRequest(req);
        if (!authenticated && adminToken) {
          try {
            await verifyAdminAccessToken(adminToken, {
              userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
              requireActiveSession: true,
              updateSessionActivity: true,
            });
            authenticated = true;
          } catch { }
        }

        if (!authenticated) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { fileData, fileName } = req.body;
        if (!fileData || !fileName) {
          return res.status(400).json({ error: "fileData (base64 data URL) and fileName are required" });
        }

        // Validate base64 data URL format
        const match = (fileData as string).match(/^data:([^;]+);base64,(.+)$/s);
        if (!match) {
          return res.status(400).json({ error: "Invalid file data format. Expected base64 data URL" });
        }

        const mimeType = match[1];
        const base64Data = match[2];

        // Validate allowed MIME types
        const allowedMimes = [
          // Images
          "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
          "image/svg+xml", "image/bmp", "image/tiff", "image/heic", "image/heif",
          "image/avif", "image/ico", "image/x-icon",
          // Videos
          "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
          "video/x-matroska", "video/3gpp",
          // Documents
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "application/zip", "application/x-zip-compressed",
          "application/x-rar-compressed", "application/vnd.rar",
        ];

        if (!allowedMimes.includes(mimeType)) {
          return res.status(400).json({ error: `File type not allowed: ${mimeType}` });
        }

        // Decode and check size (10MB max)
        const buffer = Buffer.from(base64Data, "base64");
        if (buffer.length > 10 * 1024 * 1024) {
          return res.status(400).json({ error: "File size exceeds 10MB limit" });
        }

        // Generate unique filename
        const ext = getExtensionFromMime(mimeType) || path.extname(fileName) || ".bin";
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

        let fileUrl: string;

        if (useMinIO) {
          // Upload to MinIO object storage (production)
          fileUrl = await minioUpload(uniqueName, buffer, mimeType);
          log(`File uploaded to MinIO: ${uniqueName} (${buffer.length} bytes)`, "storage");
        } else {
          // Fallback: save to local disk
          const filePath = path.join(uploadsDir, uniqueName);
          try {
            fs.writeFileSync(filePath, buffer);
            fileUrl = `/uploads/${uniqueName}`;
          } catch (writeErr: unknown) {
            logger.error(`[UPLOAD] Write failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}. Trying temp dir...`);
            // Fallback to temp directory if uploads dir is not writable
            const tempDir = path.join(os.tmpdir(), 'vex-uploads');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const tempPath = path.join(tempDir, uniqueName);
            fs.writeFileSync(tempPath, buffer);
            // Copy to uploads dir via different method
            try {
              fs.copyFileSync(tempPath, filePath);
              fs.unlinkSync(tempPath);
              fileUrl = `/uploads/${uniqueName}`;
            } catch {
              // Serve from temp — add static route fallback
              fileUrl = `/uploads/${uniqueName}`;
              // Try to make uploads dir writable
              logger.error(`[UPLOAD] Cannot write to ${uploadsDir}. File saved to ${tempPath}`);
              throw new Error('Upload directory is not writable. Contact administrator.');
            }
          }
        }

        res.status(201).json({
          url: fileUrl,
          fileName: fileName,
          fileType: mimeType,
          fileSize: buffer.length,
        });
      } catch (error: unknown) {
        logger.error("[Upload] Error", new Error(getErrorMessage(error)));
        res.status(500).json({ error: "Failed to upload file" });
      }
    });

    // Global error handler - catches unhandled errors without crashing the server
    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
      const errObj = err && typeof err === 'object' ? err as Record<string, unknown> : {};
      const status = (typeof errObj.status === 'number' ? errObj.status : typeof errObj.statusCode === 'number' ? errObj.statusCode : 500) as number;
      const errMessage = err instanceof Error ? err.message : String(err);
      const message = isProduction
        ? "Internal Server Error"
        : errMessage || "Internal Server Error";

      const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';

      // Log error details for debugging (never crash)
      const errorLog = {
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.path,
        status,
        error: errMessage,
        stack: !isProduction && err instanceof Error ? err.stack : undefined,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };
      logger.error("[ERROR] Unhandled request error", undefined, errorLog);

      // Only send response if headers haven't been sent
      if (!res.headersSent) {
        res.status(status).json({ message, requestId });
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 3001 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "3001", 10);
    const isClusterWorker = process.env.CLUSTER_WORKER === "true";

    httpServer.listen(
      {
        port: isClusterWorker ? 0 : port,
        host: "0.0.0.0",
      },
      async () => {
        if (isClusterWorker) {
          log(`worker ${process.pid} ready (internal port ${(httpServer.address() as any)?.port})`, "cluster");
        } else {
          log(`serving on port ${port}`);
        }

        // Initialize Redis connection in production
        if (isProduction) {
          try {
            const redis = getRedisClient();
            if (redis) {
              log("Redis connected successfully", "redis");
            }
          } catch (err: unknown) {
            logger.error("[Redis] Init warning", new Error(err instanceof Error ? err.message : String(err)));
          }
        }

        // Ensure support_message enum value exists in DB
        try {
          const { pool } = await import("./db");
          await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_enum
              WHERE enumlabel = 'support_message'
              AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'admin_alert_type')
            ) THEN
              ALTER TYPE "admin_alert_type" ADD VALUE 'support_message';
            END IF;
          END
          $$;
        `);
          log("DB enum support_message verified", "db");
        } catch (err: unknown) {
          logger.error("[DB] Enum migration warning", new Error(err instanceof Error ? err.message : String(err)));
        }

        // Ensure support_messages has media columns
        try {
          const { pool } = await import("./db");
          await pool.query(`
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS media_type TEXT;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS media_name TEXT;
        `);
          log("DB support media columns verified", "db");
        } catch (err: unknown) {
          logger.error("[DB] Media columns migration warning", new Error(err instanceof Error ? err.message : String(err)));
        }

        // Ensure multiplayer_games has thumbnail_url for card background images
        try {
          const { pool } = await import("./db");
          await pool.query(`
          ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
        `);
          log("DB multiplayer thumbnail column verified", "db");
        } catch (err: unknown) {
          logger.error("[DB] Multiplayer thumbnail migration warning", new Error(err instanceof Error ? err.message : String(err)));
        }

        // Ensure transactions have a globally unique public reference for user-facing support and copy flows.
        try {
          const { pool } = await import("./db");
          await pool.query(`
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS public_reference TEXT;
          ALTER TABLE transactions ALTER COLUMN public_reference SET DEFAULT (UPPER('TXN-' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 16)));
          UPDATE transactions
          SET public_reference = UPPER('TXN-' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 16))
          WHERE public_reference IS NULL OR BTRIM(public_reference) = '';
          ALTER TABLE transactions ALTER COLUMN public_reference SET NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_public_reference ON transactions(public_reference);
        `);
          log("DB transactions public references verified", "db");
        } catch (err: unknown) {
          logger.error("[DB] Transactions public reference migration warning", new Error(err instanceof Error ? err.message : String(err)));
        }

        // Ensure chat_messages has Telegram-grade feature columns
        try {
          const { pool } = await import("./db");
          await pool.query(`
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id VARCHAR;
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB;
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_for_users TEXT[] DEFAULT ARRAY[]::text[];
        `);
          log("DB chat_messages Telegram columns verified", "db");
        } catch (err: unknown) {
          logger.error("[DB] Chat columns migration warning", new Error(err instanceof Error ? err.message : String(err)));
        }

        // Seed multiplayer games, gift catalog, and free play settings (runs on both dev and production)
        try {
          await seedMultiplayerGames();
          await seedGiftCatalog();
          await seedFreePlaySettings();
        } catch (error: unknown) {
          log(`Seed error: ${getErrorMessage(error)}`, "seed");
        }

        // Start periodic security cleanup (expired tokens, sessions)
        startSecurityCleanupJob();

        // Start auto-cancel expired challenges job (every 5 minutes)
        startChallengeExpiryJob();

        // Cluster mode: accept connections dispatched from primary process via IPC
        if (isClusterWorker) {
          process.on("message", (message: string, connection: import("net").Socket) => {
            if (message === "sticky:connection" && connection) {
              httpServer.emit("connection", connection);
              connection.resume();
            }
          });
        }

      },
    );
  } catch (error: unknown) {
    logger.fatal('[FATAL] Server startup failed', error instanceof Error ? error : new Error(getErrorMessage(error)));
    process.exit(1);
  }
})();
