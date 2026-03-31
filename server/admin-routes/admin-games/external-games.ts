import type { Express, Response } from "express";
import { externalGames, externalGameSessions, type ExternalGame } from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql, like, desc, type SQL } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { broadcastSystemEvent } from "../../websocket";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Where external games are stored
const EXT_GAMES_DIR = path.join(PROJECT_ROOT, "client", "public", "games", "ext");

// Ensure directory exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Generate a safe slug from a name
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 60);
}

// Calculate directory size
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

// Max ZIP file size: 50MB
const MAX_ZIP_SIZE = 50 * 1024 * 1024;
// Max HTML embed size: 2MB
const MAX_HTML_SIZE = 2 * 1024 * 1024;

export function registerAdminExternalGamesRoutes(app: Express) {

  // ==================== LIST ALL EXTERNAL GAMES ====================
  app.get("/api/admin/external-games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { category, status, search, integration } = req.query;
      const conditions: SQL[] = [];

      if (category && category !== "all") {
        conditions.push(eq(externalGames.category, String(category)));
      }
      if (status && status !== "all") {
        conditions.push(eq(externalGames.status, String(status) as any));
      }
      if (integration && integration !== "all") {
        conditions.push(eq(externalGames.integrationType, String(integration)));
      }
      if (search) {
        const searchTerm = `%${String(search).toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${externalGames.nameEn}) LIKE ${searchTerm} OR LOWER(${externalGames.nameAr}) LIKE ${searchTerm})`
        );
      }

      const allGames = conditions.length > 0
        ? await db.select().from(externalGames).where(and(...conditions)).orderBy(externalGames.sortOrder)
        : await db.select().from(externalGames).orderBy(externalGames.sortOrder);

      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== GET SINGLE EXTERNAL GAME ====================
  app.get("/api/admin/external-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!game) {
        return res.status(404).json({ error: "External game not found" });
      }
      res.json(game);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== CREATE EXTERNAL GAME ====================
  app.post("/api/admin/external-games", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = req.body;

      if (!data.nameEn || !data.nameAr) {
        return res.status(400).json({ error: "nameEn and nameAr are required" });
      }

      const integrationType = data.integrationType || "zip_upload";
      const validTypes = ["zip_upload", "external_url", "html_embed", "cdn_assets", "api_bridge", "git_repo", "pwa_app"];
      if (!validTypes.includes(integrationType)) {
        return res.status(400).json({ error: `Invalid integration type. Must be one of: ${validTypes.join(", ")}` });
      }

      // Validate required fields per integration type
      if (integrationType === "external_url" && !data.externalUrl) {
        return res.status(400).json({ error: "externalUrl is required for external_url integration" });
      }
      if (integrationType === "cdn_assets" && !data.externalUrl) {
        return res.status(400).json({ error: "externalUrl (CDN entry point) is required for cdn_assets integration" });
      }
      if (integrationType === "pwa_app" && !data.externalUrl) {
        return res.status(400).json({ error: "externalUrl is required for pwa_app integration" });
      }
      if (integrationType === "api_bridge" && (!data.apiEndpoint || !data.apiSecret)) {
        return res.status(400).json({ error: "apiEndpoint and apiSecret are required for api_bridge integration" });
      }
      if (integrationType === "git_repo" && !data.gitRepoUrl) {
        return res.status(400).json({ error: "gitRepoUrl is required for git_repo integration" });
      }
      if (integrationType === "html_embed" && !data.htmlContent) {
        return res.status(400).json({ error: "htmlContent is required for html_embed integration" });
      }

      // HTML embed size check
      if (integrationType === "html_embed" && data.htmlContent && data.htmlContent.length > MAX_HTML_SIZE) {
        return res.status(400).json({ error: `HTML content too large. Max ${MAX_HTML_SIZE / 1024 / 1024}MB` });
      }

      // Generate slug
      let slug = data.slug || slugify(data.nameEn);
      const [existingSlug] = await db.select().from(externalGames).where(eq(externalGames.slug, slug));
      if (existingSlug) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      // For html_embed: save HTML to file and set localPath
      let localPath = data.localPath;
      if (integrationType === "html_embed" && data.htmlContent) {
        const gameDir = path.join(EXT_GAMES_DIR, slug);
        ensureDir(gameDir);
        fs.writeFileSync(path.join(gameDir, "index.html"), data.htmlContent, "utf-8");
        localPath = `/games/ext/${slug}/`;
      }

      const [newGame] = await db.insert(externalGames).values({
        slug,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        descriptionEn: data.descriptionEn,
        descriptionAr: data.descriptionAr,
        category: data.category || "arcade",
        tags: data.tags || [],
        integrationType,
        localPath,
        externalUrl: data.externalUrl,
        htmlContent: integrationType === "html_embed" ? data.htmlContent : undefined,
        gitRepoUrl: data.gitRepoUrl,
        gitBranch: data.gitBranch || "main",
        apiEndpoint: data.apiEndpoint,
        apiSecret: data.apiSecret,
        entryFile: data.entryFile || "index.html",
        iconUrl: data.iconUrl,
        thumbnailUrl: data.thumbnailUrl,
        bannerUrl: data.bannerUrl,
        screenshotUrls: data.screenshotUrls || [],
        accentColor: data.accentColor || "#6366f1",
        orientation: data.orientation || "both",
        minPlayers: data.minPlayers || 1,
        maxPlayers: data.maxPlayers || 1,
        minBet: data.minBet || "0.00",
        maxBet: data.maxBet || "100.00",
        isFreeToPlay: data.isFreeToPlay ?? true,
        hasInGameCurrency: data.hasInGameCurrency ?? false,
        sdkVersion: data.sdkVersion || "1.0",
        sandboxPermissions: data.sandboxPermissions || "allow-scripts allow-same-origin",
        allowedOrigins: data.allowedOrigins || [],
        cspPolicy: data.cspPolicy,
        enableOffline: data.enableOffline ?? false,
        cacheMaxAge: data.cacheMaxAge || 86400,
        status: data.status || "active",
        isFeatured: data.isFeatured ?? false,
        sortOrder: data.sortOrder || 0,
        developerName: data.developerName,
        developerUrl: data.developerUrl,
        version: data.version || "1.0.0",
        createdBy: req.admin!.id,
      }).returning();

      await logAdminAction(req.admin!.id, "settings_change", "external_game", newGame.id, {
        newValue: JSON.stringify({ name: newGame.nameEn, type: integrationType, slug })
      }, req);

      broadcastSystemEvent({
        type: "game_config_changed",
        data: { action: "create_external", gameId: newGame.id, gameName: newGame.nameEn }
      });

      res.status(201).json(newGame);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== UPLOAD ZIP FILE ====================
  app.post("/api/admin/external-games/:id/upload-zip", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      if (game.integrationType !== "zip_upload") {
        return res.status(400).json({ error: "This game is not configured for ZIP upload" });
      }

      const { zipData } = req.body; // base64-encoded ZIP
      if (!zipData) {
        return res.status(400).json({ error: "zipData (base64) is required" });
      }

      const buffer = Buffer.from(zipData, "base64");
      if (buffer.length > MAX_ZIP_SIZE) {
        return res.status(400).json({ error: `ZIP file too large. Max ${MAX_ZIP_SIZE / 1024 / 1024}MB` });
      }

      const gameDir = path.join(EXT_GAMES_DIR, game.slug);

      // Clear old files if re-uploading
      if (fs.existsSync(gameDir)) {
        fs.rmSync(gameDir, { recursive: true, force: true });
      }
      ensureDir(gameDir);

      // Extract ZIP
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      // Security: validate entries
      for (const entry of entries) {
        const entryName = entry.entryName;
        // Block path traversal
        if (entryName.includes("..") || entryName.startsWith("/")) {
          return res.status(400).json({ error: `Invalid ZIP entry: ${entryName}` });
        }
        // Block dangerous file types
        const ext = path.extname(entryName).toLowerCase();
        const blockedExts = [".exe", ".bat", ".cmd", ".sh", ".php", ".py", ".rb", ".pl", ".asp", ".aspx", ".jsp"];
        if (blockedExts.includes(ext)) {
          return res.status(400).json({ error: `Blocked file type in ZIP: ${ext}` });
        }
      }

      zip.extractAllTo(gameDir, true);

      // Check if entry file exists
      const entryFile = game.entryFile || "index.html";
      
      // Maybe entry file is in a subdirectory (common with ZIP)
      let actualEntryPath = path.join(gameDir, entryFile);
      if (!fs.existsSync(actualEntryPath)) {
        // Check one level deep
        const subdirs = fs.readdirSync(gameDir, { withFileTypes: true });
        for (const d of subdirs) {
          if (d.isDirectory()) {
            const subEntry = path.join(gameDir, d.name, entryFile);
            if (fs.existsSync(subEntry)) {
              // Move everything up from subdirectory
              const subContent = fs.readdirSync(path.join(gameDir, d.name));
              for (const f of subContent) {
                fs.renameSync(path.join(gameDir, d.name, f), path.join(gameDir, f));
              }
              fs.rmdirSync(path.join(gameDir, d.name));
              break;
            }
          }
        }
      }

      actualEntryPath = path.join(gameDir, entryFile);
      if (!fs.existsSync(actualEntryPath)) {
        return res.status(400).json({ error: `Entry file '${entryFile}' not found in ZIP` });
      }

      const totalSize = getDirSize(gameDir);
      const localGamePath = `/games/ext/${game.slug}/`;

      const [updated] = await db.update(externalGames)
        .set({
          localPath: localGamePath,
          totalSizeBytes: totalSize,
          updatedAt: new Date(),
        })
        .where(eq(externalGames.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "external_game", id, {
        newValue: JSON.stringify({ action: "zip_upload", size: totalSize, files: entries.length })
      }, req);

      res.json({
        success: true,
        localPath: localGamePath,
        totalSize,
        filesExtracted: entries.length,
        game: updated,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== UPDATE EXTERNAL GAME ====================
  app.patch("/api/admin/external-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [existing] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!existing) {
        return res.status(404).json({ error: "External game not found" });
      }

      const allowedFields = [
        "nameEn", "nameAr", "descriptionEn", "descriptionAr",
        "category", "tags", "integrationType",
        "externalUrl", "htmlContent", "gitRepoUrl", "gitBranch",
        "apiEndpoint", "apiSecret", "entryFile",
        "iconUrl", "thumbnailUrl", "bannerUrl", "screenshotUrls",
        "accentColor", "orientation",
        "minPlayers", "maxPlayers", "minBet", "maxBet",
        "isFreeToPlay", "hasInGameCurrency", "sdkVersion",
        "sandboxPermissions", "allowedOrigins", "cspPolicy",
        "enableOffline", "cacheMaxAge",
        "status", "isFeatured", "sortOrder",
        "developerName", "developerUrl", "version",
      ];

      const safeUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      // If html_embed content changed, rewrite file
      if (safeUpdates.htmlContent && existing.integrationType === "html_embed") {
        if (safeUpdates.htmlContent.length > MAX_HTML_SIZE) {
          return res.status(400).json({ error: `HTML content too large. Max ${MAX_HTML_SIZE / 1024 / 1024}MB` });
        }
        const gameDir = path.join(EXT_GAMES_DIR, existing.slug);
        ensureDir(gameDir);
        fs.writeFileSync(path.join(gameDir, "index.html"), safeUpdates.htmlContent, "utf-8");
        safeUpdates.localPath = `/games/ext/${existing.slug}/`;
        safeUpdates.totalSizeBytes = Buffer.byteLength(safeUpdates.htmlContent, "utf-8");
      }

      const [updated] = await db.update(externalGames)
        .set({ ...safeUpdates, updatedAt: new Date() })
        .where(eq(externalGames.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "external_game", id, {
        previousValue: JSON.stringify({ name: existing.nameEn, status: existing.status }),
        newValue: JSON.stringify({ name: updated.nameEn, status: updated.status })
      }, req);

      broadcastSystemEvent({
        type: "game_config_changed",
        data: { action: "update_external", gameId: updated.id, gameName: updated.nameEn }
      });

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== DELETE EXTERNAL GAME ====================
  app.delete("/api/admin/external-games/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!existing) {
        return res.status(404).json({ error: "External game not found" });
      }

      // Delete local files if they exist
      if (existing.localPath) {
        const gameDir = path.join(EXT_GAMES_DIR, existing.slug);
        if (fs.existsSync(gameDir)) {
          fs.rmSync(gameDir, { recursive: true, force: true });
        }
      }

      // Delete sessions first (FK constraint)
      await db.delete(externalGameSessions).where(eq(externalGameSessions.gameId, id));
      await db.delete(externalGames).where(eq(externalGames.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "external_game", id, {
        previousValue: JSON.stringify({ name: existing.nameEn, slug: existing.slug }),
        reason: "External game deleted"
      }, req);

      broadcastSystemEvent({
        type: "game_config_changed",
        data: { action: "delete_external", gameId: id, gameName: existing.nameEn }
      });

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== GET GAME STATS ====================
  app.get("/api/admin/external-games/:id/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const [sessionStats] = await db.select({
        totalSessions: sql<number>`COUNT(*)::int`,
        completedSessions: sql<number>`COUNT(*) FILTER (WHERE ${externalGameSessions.status} = 'completed')::int`,
        totalBets: sql<string>`COALESCE(SUM(${externalGameSessions.betAmount}), 0)`,
        totalWins: sql<string>`COALESCE(SUM(${externalGameSessions.winAmount}), 0)`,
        uniquePlayers: sql<number>`COUNT(DISTINCT ${externalGameSessions.userId})::int`,
        avgScore: sql<number>`COALESCE(AVG(${externalGameSessions.score}), 0)::int`,
      }).from(externalGameSessions).where(eq(externalGameSessions.gameId, id));

      res.json({
        game,
        stats: sessionStats,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== TOGGLE GAME STATUS ====================
  app.post("/api/admin/external-games/:id/toggle-status", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [game] = await db.select().from(externalGames).where(eq(externalGames.id, id));
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const newStatus = game.status === "active" ? "inactive" : "active";
      const [updated] = await db.update(externalGames)
        .set({ status: newStatus as any, updatedAt: new Date() })
        .where(eq(externalGames.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "external_game", id, {
        previousValue: JSON.stringify({ status: game.status }),
        newValue: JSON.stringify({ status: newStatus })
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== LIST INTEGRATION TYPES ====================
  app.get("/api/admin/external-games/meta/integration-types", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    res.json([
      { value: "zip_upload", label: "ZIP Upload", description: "Upload a ZIP file containing the game (HTML+JS+CSS). Served locally from the server." },
      { value: "external_url", label: "External URL", description: "Game hosted on an external server. Loaded in iframe via URL." },
      { value: "html_embed", label: "HTML Embed", description: "Paste raw HTML/JS code directly. Saved and served locally." },
      { value: "cdn_assets", label: "CDN Assets", description: "Game files hosted on a CDN. Entry point URL loaded in iframe." },
      { value: "api_bridge", label: "API Bridge", description: "Server-to-server API integration. Game has its own backend." },
      { value: "git_repo", label: "Git Repository", description: "Pull game files from a Git repository URL." },
      { value: "pwa_app", label: "PWA App", description: "Standalone Progressive Web App loaded in iframe." },
    ]);
  });
}
