import type { Express, Request, Response } from "express";
import { AuthRequest, adminTokenMiddleware, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { users, gameMatches, gameplayEmojis, gameplayMessages } from "@shared/schema";
import { logger } from "../../lib/logger";
import { getSocketIO } from "../../socketio";
import { SOCKETIO_NS_CHAT } from "@shared/socketio-events";
import {
  broadcastMatchEmoji,
  type MatchChatNamespace,
} from "../../socketio/match-chat-bridge";

export function registerEmojisRoutes(app: Express): void {

  // ==================== GAMEPLAY EMOJIS & IN-GAME CHAT ====================

  // Get all active gameplay emojis
  app.get("/api/gameplay/emojis", async (req: Request, res: Response) => {
    try {
      const emojis = await db.query.gameplayEmojis.findMany({
        where: eq(gameplayEmojis.isActive, true),
        orderBy: [gameplayEmojis.sortOrder],
      });
      res.json(emojis);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create gameplay emoji
  app.post("/api/admin/gameplay/emojis", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { emoji, name, nameAr, price, category } = req.body;
      const [newEmoji] = await db.insert(gameplayEmojis).values({
        emoji,
        name,
        nameAr,
        price: price || "0.50",
        category: category || "general",
      }).returning();
      res.json(newEmoji);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Update gameplay emoji
  app.patch("/api/admin/gameplay/emojis/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [updated] = await db.update(gameplayEmojis)
        .set(updates)
        .where(eq(gameplayEmojis.id, id))
        .returning();
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Delete gameplay emoji
  app.delete("/api/admin/gameplay/emojis/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await db.delete(gameplayEmojis).where(eq(gameplayEmojis.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Send in-game message (text or emoji)
  app.post("/api/gameplay/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { matchId, message, emojiId, isEmoji } = req.body;

      // Verify user is part of the match
      const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      if (match.player1Id !== userId && match.player2Id !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      let emojiCost = null;

      // If sending emoji, deduct balance atomically
      if (isEmoji && emojiId) {
        const [emoji] = await db.select().from(gameplayEmojis).where(eq(gameplayEmojis.id, emojiId));
        if (!emoji) {
          return res.status(404).json({ error: "Emoji not found" });
        }

        const emojiPrice = parseFloat(emoji.price);

        // SECURITY: Atomic balance deduction with row lock to prevent double-spend
        const result = await db.transaction(async (tx) => {
          const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
          const userBalance = parseFloat(user.balance);

          if (userBalance < emojiPrice) {
            throw new Error("Insufficient balance for emoji");
          }

          await tx.update(users)
            .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) - ${emojiPrice})::text` })
            .where(eq(users.id, userId));

          return true;
        });

        emojiCost = emoji.price;
      }

      // Create message
      const [newMessage] = await db.insert(gameplayMessages).values({
        matchId,
        senderId: userId,
        message: isEmoji ? null : message,
        emojiId: isEmoji ? emojiId : null,
        isEmoji: isEmoji || false,
        emojiCost,
      }).returning();

      // Get sender info for response
      const [sender] = await db.select({
        id: users.id,
        username: users.username,
        avatarUrl: users.profilePicture,
      }).from(users).where(eq(users.id, userId));

      const responseMessage: Record<string, unknown> = { ...newMessage, sender };

      // If emoji, include emoji details
      if (isEmoji && emojiId) {
        const [emoji] = await db.select().from(gameplayEmojis).where(eq(gameplayEmojis.id, emojiId));
        responseMessage.emoji = emoji;

        // Task #139: fan out the emoji as a `chat:message` socket
        // broadcast so the peer sees it instantly now that the 2s
        // polling has been removed from `InGameChat`. The REST
        // endpoint still owns the balance debit + persistence (kept
        // here for the row-locked transaction); this is purely the
        // realtime delivery path. Best-effort — swallow errors so a
        // socket hiccup never fails the user-facing send.
        try {
          const io = getSocketIO();
          if (io) {
            const chatNs = io.of(SOCKETIO_NS_CHAT) as unknown as MatchChatNamespace;
            const ts = newMessage.createdAt
              ? new Date(newMessage.createdAt).getTime()
              : Date.now();
            await broadcastMatchEmoji(
              {
                matchId,
                senderId: userId,
                emojiId,
                messageId: newMessage.id,
                ts,
              },
              chatNs,
            );
          }
        } catch (err) {
          logger.warn?.(
            `[gameplay/messages] emoji socket fan-out failed: ${(err as Error).message}`,
          );
        }
      }

      res.json(responseMessage);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get messages for a match
  app.get("/api/gameplay/messages/:matchId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { matchId } = req.params;

      // Verify user is part of the match
      const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      if (match.player1Id !== userId && match.player2Id !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const messages = await db.query.gameplayMessages.findMany({
        where: eq(gameplayMessages.matchId, matchId),
        orderBy: [gameplayMessages.createdAt],
        with: {
          sender: {
            columns: { id: true, username: true, profilePicture: true },
          },
          emoji: true,
        },
      });

      res.json(messages);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Seed default emojis if none exist
  (async () => {
    try {
      const existingEmojis = await db.select().from(gameplayEmojis).limit(1);
      if (existingEmojis.length === 0) {
        const defaultEmojis = [
          { emoji: "👍", name: "Thumbs Up", nameAr: "إعجاب", price: "0.50", category: "reactions", sortOrder: 1 },
          { emoji: "😂", name: "Laughing", nameAr: "ضحك", price: "0.50", category: "emotions", sortOrder: 2 },
          { emoji: "🔥", name: "Fire", nameAr: "نار", price: "1.00", category: "special", sortOrder: 3 },
          { emoji: "💰", name: "Money Bag", nameAr: "كيس نقود", price: "2.00", category: "special", sortOrder: 4 },
          { emoji: "🎉", name: "Party", nameAr: "احتفال", price: "1.50", category: "celebrations", sortOrder: 5 },
          { emoji: "😎", name: "Cool", nameAr: "رائع", price: "0.75", category: "emotions", sortOrder: 6 },
          { emoji: "💎", name: "Diamond", nameAr: "ماس", price: "3.00", category: "premium", sortOrder: 7 },
          { emoji: "🏆", name: "Trophy", nameAr: "كأس", price: "2.50", category: "premium", sortOrder: 8 },
          { emoji: "👑", name: "Crown", nameAr: "تاج", price: "5.00", category: "premium", sortOrder: 9 },
          { emoji: "💀", name: "Skull", nameAr: "جمجمة", price: "1.00", category: "reactions", sortOrder: 10 },
        ];
        await db.insert(gameplayEmojis).values(defaultEmojis);
        logger.info("Default gameplay emojis created");
      }
    } catch (error) {
      logger.error('Failed to seed gameplay emojis', error instanceof Error ? error : new Error(String(error)));
    }
  })();
}
