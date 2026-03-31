import type { Express, Request, Response } from "express";
import { externalGames, externalGameSessions, users } from "@shared/schema";
import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "./middleware";
import crypto from "crypto";
import { getErrorMessage } from "./helpers";

export function registerExternalGamesRoutes(app: Express): void {

  // ==================== PUBLIC: List active external games ====================
  app.get("/api/external-games", async (_req: Request, res: Response) => {
    try {
      const allGames = await db.select({
        id: externalGames.id,
        slug: externalGames.slug,
        nameEn: externalGames.nameEn,
        nameAr: externalGames.nameAr,
        descriptionEn: externalGames.descriptionEn,
        descriptionAr: externalGames.descriptionAr,
        category: externalGames.category,
        tags: externalGames.tags,
        integrationType: externalGames.integrationType,
        iconUrl: externalGames.iconUrl,
        thumbnailUrl: externalGames.thumbnailUrl,
        bannerUrl: externalGames.bannerUrl,
        accentColor: externalGames.accentColor,
        orientation: externalGames.orientation,
        minPlayers: externalGames.minPlayers,
        maxPlayers: externalGames.maxPlayers,
        minBet: externalGames.minBet,
        maxBet: externalGames.maxBet,
        isFreeToPlay: externalGames.isFreeToPlay,
        playCount: externalGames.playCount,
        rating: externalGames.rating,
        ratingCount: externalGames.ratingCount,
        isFeatured: externalGames.isFeatured,
        sortOrder: externalGames.sortOrder,
        developerName: externalGames.developerName,
        version: externalGames.version,
        enableOffline: externalGames.enableOffline,
      })
        .from(externalGames)
        .where(eq(externalGames.status, "active"))
        .orderBy(externalGames.sortOrder);
      res.json(allGames);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== PUBLIC: Get game by slug ====================
  app.get("/api/external-games/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const [game] = await db.select().from(externalGames).where(
        and(eq(externalGames.slug, slug), eq(externalGames.status, "active"))
      );
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      // Don't expose sensitive fields
      const { apiSecret, apiEndpoint, htmlContent, ...publicGame } = game;
      res.json(publicGame);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH: Start game session ====================
  app.post("/api/external-games/:slug/start", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { slug } = req.params;
      const userId = req.user!.id;
      const { betAmount } = req.body;

      const [game] = await db.select().from(externalGames).where(
        and(eq(externalGames.slug, slug), eq(externalGames.status, "active"))
      );
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Get user balance
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const bet = Number(betAmount || 0);
      const userBalance = Number(user.balance);

      // Validate bet amounts
      if (!game.isFreeToPlay && bet <= 0) {
        return res.status(400).json({ error: "Bet amount required for paid games" });
      }
      if (bet > 0) {
        const minBet = Number(game.minBet || 0);
        const maxBet = Number(game.maxBet || 9999999);
        if (bet < minBet) {
          return res.status(400).json({ error: `Minimum bet is ${minBet}` });
        }
        if (bet > maxBet) {
          return res.status(400).json({ error: `Maximum bet is ${maxBet}` });
        }
        if (userBalance < bet) {
          return res.status(400).json({ error: "Insufficient balance" });
        }
      }

      // Generate unique session token
      const sessionToken = crypto.randomBytes(32).toString("hex");

      // Debit bet from user balance
      let newBalance = userBalance;
      if (bet > 0) {
        newBalance = userBalance - bet;
        await db.update(users)
          .set({ balance: String(newBalance) })
          .where(eq(users.id, userId));
      }

      // Create session
      const [session] = await db.insert(externalGameSessions).values({
        gameId: game.id,
        userId,
        sessionToken,
        betAmount: String(bet),
        balanceBefore: String(userBalance),
        status: "active",
      }).returning();

      // Increment play count
      await db.update(externalGames)
        .set({
          playCount: sql`${externalGames.playCount} + 1`,
        })
        .where(eq(externalGames.id, game.id));

      // Build game URL based on integration type
      let gameUrl = "";
      switch (game.integrationType) {
        case "zip_upload":
          gameUrl = `${game.localPath || `/games/ext/${game.slug}/`}${game.entryFile || "index.html"}`;
          break;
        case "html_embed":
          gameUrl = `${game.localPath || `/games/ext/${game.slug}/`}index.html`;
          break;
        case "external_url":
        case "cdn_assets":
        case "pwa_app":
          gameUrl = game.externalUrl || "";
          break;
        case "git_repo":
          gameUrl = `${game.localPath || `/games/ext/${game.slug}/`}${game.entryFile || "index.html"}`;
          break;
        case "api_bridge":
          gameUrl = game.externalUrl || game.apiEndpoint || "";
          break;
      }

      res.json({
        sessionId: session.id,
        sessionToken,
        gameUrl,
        game: {
          id: game.id,
          slug: game.slug,
          nameEn: game.nameEn,
          nameAr: game.nameAr,
          orientation: game.orientation,
          sandboxPermissions: game.sandboxPermissions,
          enableOffline: game.enableOffline,
          sdkVersion: game.sdkVersion,
        },
        player: {
          id: user.id,
          username: user.username,
          balance: String(newBalance),
          language: "en",
          avatar: user.profilePicture || "",
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH: End game session ====================
  app.post("/api/external-games/session/end", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sessionToken, result, score, winAmount, metadata } = req.body;

      if (!sessionToken) {
        return res.status(400).json({ error: "sessionToken is required" });
      }

      const [session] = await db.select().from(externalGameSessions).where(
        and(
          eq(externalGameSessions.sessionToken, sessionToken),
          eq(externalGameSessions.userId, userId),
          eq(externalGameSessions.status, "active")
        )
      );

      if (!session) {
        return res.status(404).json({ error: "Active session not found" });
      }

      // Get user
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const win = Math.max(0, Number(winAmount || 0));
      let newBalance = Number(user.balance);

      // Credit winnings
      if (win > 0) {
        // Validate win amount against max bet * reasonable multiplier
        const [game] = await db.select().from(externalGames).where(eq(externalGames.id, session.gameId));
        const maxWin = Number(game?.maxBet || 1000) * 100; // Max 100x
        const safeWin = Math.min(win, maxWin);

        newBalance += safeWin;
        await db.update(users)
          .set({ balance: String(newBalance) })
          .where(eq(users.id, userId));
      }

      // Update session
      await db.update(externalGameSessions)
        .set({
          status: "completed",
          result: result || "none",
          score: Number(score || 0),
          winAmount: String(win),
          balanceAfter: String(newBalance),
          metadata: metadata || null,
          endedAt: new Date(),
        })
        .where(eq(externalGameSessions.id, session.id));

      res.json({
        success: true,
        newBalance: String(newBalance),
        winAmount: String(win),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH: Debit from game ====================
  app.post("/api/external-games/session/debit", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sessionToken, amount, reason } = req.body;

      if (!sessionToken || !amount) {
        return res.status(400).json({ error: "sessionToken and amount are required" });
      }

      const debitAmount = Number(amount);
      if (debitAmount <= 0 || debitAmount > 100000) {
        return res.status(400).json({ error: "Invalid debit amount" });
      }

      const [session] = await db.select().from(externalGameSessions).where(
        and(
          eq(externalGameSessions.sessionToken, sessionToken),
          eq(externalGameSessions.userId, userId),
          eq(externalGameSessions.status, "active")
        )
      );

      if (!session) {
        return res.status(404).json({ error: "Active session not found" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ error: "User not found" });

      const currentBalance = Number(user.balance);
      if (currentBalance < debitAmount) {
        return res.status(400).json({ error: "Insufficient balance", balance: String(currentBalance) });
      }

      const newBalance = currentBalance - debitAmount;
      await db.update(users)
        .set({ balance: String(newBalance) })
        .where(eq(users.id, userId));

      // Add to session bet amount
      await db.update(externalGameSessions)
        .set({
          betAmount: sql`(${externalGameSessions.betAmount}::numeric + ${debitAmount})::text`,
        })
        .where(eq(externalGameSessions.id, session.id));

      res.json({
        success: true,
        newBalance: String(newBalance),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH: Credit from game ====================
  app.post("/api/external-games/session/credit", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sessionToken, amount, reason } = req.body;

      if (!sessionToken || !amount) {
        return res.status(400).json({ error: "sessionToken and amount are required" });
      }

      const creditAmount = Number(amount);
      if (creditAmount <= 0 || creditAmount > 1000000) {
        return res.status(400).json({ error: "Invalid credit amount" });
      }

      const [session] = await db.select().from(externalGameSessions).where(
        and(
          eq(externalGameSessions.sessionToken, sessionToken),
          eq(externalGameSessions.userId, userId),
          eq(externalGameSessions.status, "active")
        )
      );

      if (!session) {
        return res.status(404).json({ error: "Active session not found" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ error: "User not found" });

      const newBalance = Number(user.balance) + creditAmount;
      await db.update(users)
        .set({ balance: String(newBalance) })
        .where(eq(users.id, userId));

      // Add to session win amount
      await db.update(externalGameSessions)
        .set({
          winAmount: sql`(${externalGameSessions.winAmount}::numeric + ${creditAmount})::text`,
        })
        .where(eq(externalGameSessions.id, session.id));

      res.json({
        success: true,
        newBalance: String(newBalance),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUTH: Get user's game history ====================
  app.get("/api/external-games/history", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const sessions = await db.select({
        id: externalGameSessions.id,
        gameId: externalGameSessions.gameId,
        betAmount: externalGameSessions.betAmount,
        winAmount: externalGameSessions.winAmount,
        score: externalGameSessions.score,
        status: externalGameSessions.status,
        result: externalGameSessions.result,
        startedAt: externalGameSessions.startedAt,
        endedAt: externalGameSessions.endedAt,
        gameName: externalGames.nameEn,
        gameSlug: externalGames.slug,
        gameIcon: externalGames.iconUrl,
      })
        .from(externalGameSessions)
        .innerJoin(externalGames, eq(externalGameSessions.gameId, externalGames.id))
        .where(eq(externalGameSessions.userId, userId))
        .orderBy(desc(externalGameSessions.startedAt))
        .limit(50);

      res.json(sessions);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
