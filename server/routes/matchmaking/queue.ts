import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { users, games, gameMatches, matchmakingQueue, gameplaySettings } from "@shared/schema";
import crypto from "crypto";
import { isEitherUserBlocked } from "../../lib/user-blocking";

export function registerQueueRoutes(app: Express): void {

  // Join random matchmaking queue
  app.post("/api/games/:gameId/matchmaking/random", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { gameId } = req.params;

      // Check if game exists
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (game.length === 0) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Check free play limit
      const freePlayLimitSetting = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "freePlayLimit")).limit(1);
      if (freePlayLimitSetting.length > 0) {
        const limit = parseInt(freePlayLimitSetting[0].value) || 0;
        if (limit > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayMatches = await db.select().from(gameMatches)
            .where(and(
              or(eq(gameMatches.player1Id, userId), eq(gameMatches.player2Id, userId)),
              sql`${gameMatches.createdAt} >= ${today}`
            ));
          if (todayMatches.length >= limit) {
            return res.status(400).json({ error: "Daily free play limit reached" });
          }
        }
      }

      // Check if already in queue
      const existingQueue = await db.select().from(matchmakingQueue)
        .where(and(
          eq(matchmakingQueue.userId, userId),
          eq(matchmakingQueue.status, "waiting")
        ));
      if (existingQueue.length > 0) {
        return res.status(400).json({ error: "Already in matchmaking queue" });
      }

      // Try to find a match - get all waiting players for random selection
      const waitingPlayers = await db.select().from(matchmakingQueue)
        .where(and(
          eq(matchmakingQueue.gameId, gameId),
          eq(matchmakingQueue.matchType, "random"),
          eq(matchmakingQueue.status, "waiting"),
          sql`${matchmakingQueue.userId} != ${userId}`
        ));

      if (waitingPlayers.length > 0) {
        // Fisher-Yates shuffle using crypto.randomInt for true randomness
        const shuffled = [...waitingPlayers];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = crypto.randomInt(0, i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const opponent = shuffled[0];

        // Update opponent's queue status
        await db.update(matchmakingQueue)
          .set({ status: "matched" })
          .where(eq(matchmakingQueue.id, opponent.id));

        // Create match
        const [match] = await db.insert(gameMatches).values({
          gameId,
          player1Id: opponent.userId,
          player2Id: userId,
          status: "pending",
        }).returning();

        res.json({ matched: true, match });
      } else {
        // Join queue
        const [queueEntry] = await db.insert(matchmakingQueue).values({
          gameId,
          userId,
          matchType: "random",
          status: "waiting",
        }).returning();

        res.json({ matched: false, queueEntry });
      }
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Invite friend to match
  app.post("/api/games/:gameId/matchmaking/friend", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { gameId } = req.params;
      const { friendAccountId } = req.body;

      if (!friendAccountId) {
        return res.status(400).json({ error: "Friend account ID required" });
      }

      // Find friend by account ID
      const friend = await db.select().from(users).where(eq(users.accountId, friendAccountId)).limit(1);
      if (friend.length === 0) {
        return res.status(404).json({ error: "Friend not found" });
      }

      if (friend[0].id === userId) {
        return res.status(400).json({ error: "Cannot invite yourself" });
      }

      // Check if either user has blocked the other
      const isBlocked = await isEitherUserBlocked(userId, friend[0].id);
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot invite this user" });
      }

      // Check if game exists
      const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (game.length === 0) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Create pending match as invitation
      const [match] = await db.insert(gameMatches).values({
        gameId,
        player1Id: userId,
        player2Id: friend[0].id,
        status: "pending",
      }).returning();

      // Create queue entry for tracking
      await db.insert(matchmakingQueue).values({
        gameId,
        userId,
        matchType: "friend",
        friendAccountId,
        status: "waiting",
      });

      res.json({ match, friendId: friend[0].id });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Cancel matchmaking
  app.delete("/api/games/matchmaking/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      await db.update(matchmakingQueue)
        .set({ status: "cancelled" })
        .where(and(
          eq(matchmakingQueue.userId, userId),
          eq(matchmakingQueue.status, "waiting")
        ));

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get matchmaking status
  app.get("/api/games/matchmaking/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const queueEntry = await db.select().from(matchmakingQueue)
        .where(and(
          eq(matchmakingQueue.userId, userId),
          eq(matchmakingQueue.status, "waiting")
        ))
        .orderBy(desc(matchmakingQueue.createdAt))
        .limit(1);

      const pendingMatches = await db.select().from(gameMatches)
        .where(and(
          eq(gameMatches.player2Id, userId),
          eq(gameMatches.status, "pending")
        ))
        .orderBy(desc(gameMatches.createdAt));

      const activeMatches = await db.select().from(gameMatches)
        .where(and(
          or(eq(gameMatches.player1Id, userId), eq(gameMatches.player2Id, userId)),
          eq(gameMatches.status, "in_progress")
        ))
        .orderBy(desc(gameMatches.createdAt));

      res.json({
        inQueue: queueEntry.length > 0 ? queueEntry[0] : null,
        pendingInvites: pendingMatches,
        activeMatches,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
