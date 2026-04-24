import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { multiplayerGames, users, liveGameSessions } from "@shared/schema";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  buildGamesSitemap,
  buildCategoriesSitemap,
  buildPlayersSitemap,
  buildMatchesSitemap,
  buildLeaderboardsSitemap,
  buildSitemapIndex,
  invalidateSitemapCache,
  clearDynamicSeoCache,
  getPublicLeaderboard,
  SEO_GAME_KEYS,
  SEO_GAME_LABELS,
  SEO_CATEGORIES,
  type SeoGameKey,
} from "../lib/sitemap-builder";
import { adminMiddleware, type AuthRequest } from "./middleware";
import { logger } from "../lib/logger";

const publicSeoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const sitemapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function buildBaseUrl(req: Request): string {
  const appUrl = (process.env.APP_URL || process.env.APP_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (appUrl) return appUrl;
  const fwd = typeof req.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"].split(",")[0].trim() : "";
  const proto = fwd || (req.secure ? "https" : "http");
  const host = req.get("host");
  return host ? `${proto}://${host}` : "https://vixo.click";
}

function setXmlHeaders(res: Response): void {
  res.set({
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=1800",
  });
}

export function registerSeoRoutes(app: Express): void {
  // ==================== DYNAMIC SITEMAPS ====================

  // Override sitemap-index.xml with dynamic version (registered BEFORE static handler)
  app.get("/sitemap-index.xml", sitemapLimiter, (req, res) => {
    const xml = buildSitemapIndex(buildBaseUrl(req));
    setXmlHeaders(res);
    res.status(200).send(xml);
  });

  app.get("/sitemap-games.xml", sitemapLimiter, async (req, res) => {
    try {
      const xml = await buildGamesSitemap(buildBaseUrl(req));
      setXmlHeaders(res);
      res.status(200).send(xml);
    } catch (e) {
      logger.error("[SEO] sitemap-games.xml failed", e instanceof Error ? e : undefined);
      res.status(500).type("text/plain").send("error");
    }
  });

  app.get("/sitemap-categories.xml", sitemapLimiter, async (req, res) => {
    try {
      const xml = await buildCategoriesSitemap(buildBaseUrl(req));
      setXmlHeaders(res);
      res.status(200).send(xml);
    } catch (e) {
      logger.error("[SEO] sitemap-categories.xml failed", e instanceof Error ? e : undefined);
      res.status(500).type("text/plain").send("error");
    }
  });

  app.get("/sitemap-players.xml", sitemapLimiter, async (req, res) => {
    try {
      const xml = await buildPlayersSitemap(buildBaseUrl(req));
      setXmlHeaders(res);
      res.status(200).send(xml);
    } catch (e) {
      logger.error("[SEO] sitemap-players.xml failed", e instanceof Error ? e : undefined);
      res.status(500).type("text/plain").send("error");
    }
  });

  app.get("/sitemap-matches.xml", sitemapLimiter, async (req, res) => {
    try {
      const xml = await buildMatchesSitemap(buildBaseUrl(req));
      setXmlHeaders(res);
      res.status(200).send(xml);
    } catch (e) {
      logger.error("[SEO] sitemap-matches.xml failed", e instanceof Error ? e : undefined);
      res.status(500).type("text/plain").send("error");
    }
  });

  app.get("/sitemap-leaderboards.xml", sitemapLimiter, async (req, res) => {
    try {
      const xml = await buildLeaderboardsSitemap(buildBaseUrl(req));
      setXmlHeaders(res);
      res.status(200).send(xml);
    } catch (e) {
      logger.error("[SEO] sitemap-leaderboards.xml failed", e instanceof Error ? e : undefined);
      res.status(500).type("text/plain").send("error");
    }
  });

  // ==================== PUBLIC SEO API (no auth) ====================

  app.get("/api/public/games", publicSeoLimiter, async (_req, res) => {
    try {
      const rows = await db.select({
        key: multiplayerGames.key,
        nameEn: multiplayerGames.nameEn,
        nameAr: multiplayerGames.nameAr,
        descriptionEn: multiplayerGames.descriptionEn,
        descriptionAr: multiplayerGames.descriptionAr,
        thumbnailUrl: multiplayerGames.thumbnailUrl,
        category: multiplayerGames.category,
      }).from(multiplayerGames).where(eq(multiplayerGames.isActive, true));
      res.set("Cache-Control", "public, max-age=300").json({ games: rows });
    } catch (e) {
      logger.error("[SEO] /api/public/games failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  app.get("/api/public/games/:key", publicSeoLimiter, async (req, res) => {
    const key = String(req.params.key || "").toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) {
      return res.status(400).json({ error: "invalid_key" });
    }
    try {
      const [row] = await db.select({
        key: multiplayerGames.key,
        nameEn: multiplayerGames.nameEn,
        nameAr: multiplayerGames.nameAr,
        descriptionEn: multiplayerGames.descriptionEn,
        descriptionAr: multiplayerGames.descriptionAr,
        thumbnailUrl: multiplayerGames.thumbnailUrl,
        category: multiplayerGames.category,
        minPlayers: multiplayerGames.minPlayers,
        maxPlayers: multiplayerGames.maxPlayers,
        totalGamesPlayed: multiplayerGames.totalGamesPlayed,
      }).from(multiplayerGames).where(eq(multiplayerGames.key, key));
      if (!row) {
        const fallback = SEO_GAME_LABELS[key];
        if (!fallback) return res.status(404).json({ error: "not_found" });
        return res.set("Cache-Control", "public, max-age=300").json({
          game: { key, nameEn: fallback.en, nameAr: fallback.ar, descriptionEn: fallback.description.en, descriptionAr: fallback.description.ar },
        });
      }
      res.set("Cache-Control", "public, max-age=300").json({ game: row });
    } catch (e) {
      logger.error("[SEO] /api/public/games/:key failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  app.get("/api/public/players/:username", publicSeoLimiter, async (req, res) => {
    const username = String(req.params.username || "");
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) {
      return res.status(400).json({ error: "invalid_username" });
    }
    try {
      const [row] = await db.select({
        username: users.username,
        nickname: users.nickname,
        profilePicture: users.profilePicture,
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        chessWon: users.chessWon,
        backgammonWon: users.backgammonWon,
        dominoWon: users.dominoWon,
        tarneebWon: users.tarneebWon,
        balootWon: users.balootWon,
        currentWinStreak: users.currentWinStreak,
        longestWinStreak: users.longestWinStreak,
        createdAt: users.createdAt,
      }).from(users).where(and(eq(users.username, username), eq(users.status, "active")));
      if (!row) return res.status(404).json({ error: "not_found" });
      res.set("Cache-Control", "public, max-age=300").json({ player: row });
    } catch (e) {
      logger.error("[SEO] /api/public/players failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  app.get("/api/public/matches/:id", publicSeoLimiter, async (req, res) => {
    const id = String(req.params.id || "");
    if (!/^[a-f0-9-]{8,}$/i.test(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }
    try {
      const [row] = await db.select({
        id: liveGameSessions.id,
        gameType: liveGameSessions.gameType,
        status: liveGameSessions.status,
        player1Id: liveGameSessions.player1Id,
        player2Id: liveGameSessions.player2Id,
        player3Id: liveGameSessions.player3Id,
        player4Id: liveGameSessions.player4Id,
        winnerId: liveGameSessions.winnerId,
        winningTeam: liveGameSessions.winningTeam,
        startedAt: liveGameSessions.startedAt,
        endedAt: liveGameSessions.endedAt,
      }).from(liveGameSessions).where(eq(liveGameSessions.id, id));
      if (!row) return res.status(404).json({ error: "not_found" });

      // Only expose completed matches publicly to avoid leaking live state
      if (row.status !== "completed") {
        return res.status(404).json({ error: "not_found" });
      }

      const playerIds = [row.player1Id, row.player2Id, row.player3Id, row.player4Id].filter(Boolean) as string[];
      const playerRows = playerIds.length
        ? await db.select({ id: users.id, username: users.username, nickname: users.nickname, profilePicture: users.profilePicture })
          .from(users).where(or(...playerIds.map((pid) => eq(users.id, pid))))
        : [];
      const playerMap = new Map(playerRows.map((p) => [p.id, p]));
      const sanitized = {
        id: row.id,
        gameType: row.gameType,
        winnerId: row.winnerId,
        winningTeam: row.winningTeam,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        players: playerIds.map((pid) => playerMap.get(pid)).filter(Boolean),
      };
      res.set("Cache-Control", "public, max-age=600").json({ match: sanitized });
    } catch (e) {
      logger.error("[SEO] /api/public/matches failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  app.get("/api/public/leaderboard/:game", publicSeoLimiter, async (req, res) => {
    const game = String(req.params.game || "").toLowerCase();
    if (!SEO_GAME_KEYS.includes(game as SeoGameKey)) {
      return res.status(404).json({ error: "not_found" });
    }
    if (game === "languageduel") {
      // No win column for languageduel — return empty list rather than failing.
      return res.set("Cache-Control", "public, max-age=300").json({ game, players: [] });
    }
    try {
      const players = await getPublicLeaderboard(game as SeoGameKey, 50);
      res.set("Cache-Control", "public, max-age=300").json({ game, players });
    } catch (e) {
      logger.error("[SEO] /api/public/leaderboard failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  // Recent completed matches for a given game (used by game-landing for
  // crawlable internal links to /match/:id). Limited and read-through cached.
  app.get("/api/public/games/:key/recent-matches", publicSeoLimiter, async (req, res) => {
    const key = String(req.params.key || "").toLowerCase();
    if (!SEO_GAME_KEYS.includes(key as SeoGameKey)) {
      return res.status(404).json({ error: "not_found" });
    }
    try {
      const rows = await db.select({
        id: liveGameSessions.id,
        winnerId: liveGameSessions.winnerId,
        endedAt: liveGameSessions.endedAt,
      })
        .from(liveGameSessions)
        .where(and(eq(liveGameSessions.gameType, key), eq(liveGameSessions.status, "completed")))
        .orderBy(desc(liveGameSessions.endedAt))
        .limit(20);
      res.set("Cache-Control", "public, max-age=600").json({ matches: rows });
    } catch (e) {
      logger.error("[SEO] /api/public/games/:key/recent-matches failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  // Recent completed matches for a player (used by player profile for crawlable
  // links to /match/:id). Joined to enrich with the game type for the link label.
  app.get("/api/public/players/:username/recent-matches", publicSeoLimiter, async (req, res) => {
    const username = String(req.params.username || "");
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: "invalid_username" });
    }
    try {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
      if (!user) return res.status(404).json({ error: "not_found" });
      const rows = await db.select({
        id: liveGameSessions.id,
        gameType: liveGameSessions.gameType,
        winnerId: liveGameSessions.winnerId,
        endedAt: liveGameSessions.endedAt,
      })
        .from(liveGameSessions)
        .where(and(
          eq(liveGameSessions.status, "completed"),
          or(
            eq(liveGameSessions.player1Id, user.id),
            eq(liveGameSessions.player2Id, user.id),
            eq(liveGameSessions.player3Id, user.id),
            eq(liveGameSessions.player4Id, user.id),
          ),
        ))
        .orderBy(desc(liveGameSessions.endedAt))
        .limit(20);
      res.set("Cache-Control", "public, max-age=600").json({ matches: rows });
    } catch (e) {
      logger.error("[SEO] /api/public/players/:username/recent-matches failed", e instanceof Error ? e : undefined);
      res.status(500).json({ error: "internal" });
    }
  });

  // Static helpers
  app.get("/api/public/categories", publicSeoLimiter, (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600").json({
      categories: Object.entries(SEO_CATEGORIES).map(([slug, c]) => ({
        slug,
        titleAr: c.titleAr,
        titleEn: c.titleEn,
        descriptionAr: c.descriptionAr,
        descriptionEn: c.descriptionEn,
        gameKeys: c.slugs,
      })),
    });
  });

  // ==================== ADMIN ====================
  app.post("/api/admin/seo/sitemap-rebuild", adminMiddleware, (_req: AuthRequest, res: Response) => {
    invalidateSitemapCache();
    clearDynamicSeoCache();
    res.json({ ok: true, message: "Sitemap & SEO meta caches cleared" });
  });
}
