import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, sensitiveRateLimiter } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import {
  users, transactions, challenges as challengesTable, challengeSpectators, gameplaySettings, projectCurrencyWallets, projectCurrencyLedger,
} from "@shared/schema";

export function registerGiftChallengeRoutes(app: Express): void {

  // ==================== CHALLENGE GIFTS ====================

  // Send gift to player in a challenge
  app.post("/api/challenges/:challengeId/gifts", authMiddleware, sensitiveRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { recipientId, giftId, quantity = 1, message, idempotencyKey: bodyIdempotencyKey } = req.body;
      const challengeId = req.params.challengeId;
      const senderId = req.user!.id;

      // Validate input
      const parsedQuantity = parseInt(String(quantity));
      if (!giftId || typeof giftId !== 'string') {
        return res.status(400).json({ error: "Invalid giftId" });
      }
      if (!recipientId || typeof recipientId !== 'string') {
        return res.status(400).json({ error: "Invalid recipientId" });
      }
      if (isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 100) {
        return res.status(400).json({ error: "Quantity must be between 1 and 100" });
      }
      if (recipientId === senderId) {
        return res.status(400).json({ error: "Cannot send gift to yourself" });
      }

      // Verify challenge exists and is active
      const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, challengeId));
      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }
      if (challenge.status !== 'active' && challenge.status !== 'waiting') {
        return res.status(400).json({ error: "Challenge is not active" });
      }

      // Verify recipient is a player in the challenge (supports 2p and 4p rooms)
      const participantIds = [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id].filter(Boolean);
      if (!participantIds.includes(recipientId)) {
        return res.status(400).json({ error: "Recipient must be a player in this challenge" });
      }

      const isPlayerSender = senderId === challenge.player1Id || senderId === challenge.player2Id;
      const [activeSpectator] = isPlayerSender ? [] : await db.select({ id: challengeSpectators.id })
        .from(challengeSpectators)
        .where(and(
          eq(challengeSpectators.challengeId, challengeId),
          eq(challengeSpectators.userId, senderId),
          sql`${challengeSpectators.leftAt} IS NULL`,
        ))
        .limit(1);

      if (!isPlayerSender && !activeSpectator) {
        return res.status(403).json({ error: "Sender must be an active challenge participant or spectator" });
      }

      // Verify gift exists
      const gift = await storage.getGiftFromCatalog(giftId);
      if (!gift) {
        return res.status(404).json({ error: "Gift not found" });
      }
      if (!gift.isActive) {
        return res.status(400).json({ error: "Gift is currently unavailable" });
      }

      const [currencyModeSetting] = await db.select({ value: gameplaySettings.value })
        .from(gameplaySettings)
        .where(eq(gameplaySettings.key, "play_gift_currency_mode"))
        .limit(1);
      const enforceProjectOnly = !currencyModeSetting || currencyModeSetting.value !== "mixed";

      const giftValue = (gift.coinValue || 1) * parsedQuantity * 0.01;
      const senderReferenceToken = String(
        bodyIdempotencyKey
        || req.headers["x-idempotency-key"]
        || (req as AuthRequest & { requestId?: string }).requestId
        || ""
      ).trim().slice(0, 128);
      const challengeGiftReferenceId = senderReferenceToken
        ? `challenge_inventory_gift:${challengeId}:${senderId}:${senderReferenceToken}`
        : undefined;

      // Atomic transaction for gift sending
      const sentGift = await db.transaction(async (tx) => {
        const { userGiftInventory, challengeGifts } = await import("@shared/schema");

        if (challengeGiftReferenceId) {
          const [existingRecord] = await tx.select({ id: transactions.id })
            .from(transactions)
            .where(and(
              eq(transactions.referenceId, challengeGiftReferenceId),
              eq(transactions.userId, recipientId),
              eq(transactions.type, "gift_received"),
              eq(transactions.status, "completed"),
            ))
            .for('update')
            .limit(1);

          if (existingRecord) {
            return null;
          }
        }

        // Check and deduct from sender's inventory
        const [inventory] = await tx.select().from(userGiftInventory)
          .where(and(
            eq(userGiftInventory.userId, senderId),
            eq(userGiftInventory.giftId, giftId)
          ))
          .for('update');

        if (!inventory || inventory.quantity < parsedQuantity) {
          throw new Error("Insufficient gift quantity in inventory");
        }

        if (inventory.quantity === parsedQuantity) {
          await tx.delete(userGiftInventory).where(eq(userGiftInventory.id, inventory.id));
        } else {
          await tx.update(userGiftInventory)
            .set({ quantity: inventory.quantity - parsedQuantity, updatedAt: new Date() })
            .where(eq(userGiftInventory.id, inventory.id));
        }

        // Record the gift
        const [giftRecord] = await tx.insert(challengeGifts).values({
          challengeId,
          senderId,
          recipientId,
          giftId,
          quantity: parsedQuantity,
          message: message || null,
        }).returning();

        // Credit recipient with gift value. In project-only mode, keep value in project wallet ledger.
        if (giftValue > 0) {
          if (enforceProjectOnly) {
            await tx.execute(sql`
              INSERT INTO project_currency_wallets (user_id)
              VALUES (${recipientId})
              ON CONFLICT (user_id) DO NOTHING
            `);

            const [wallet] = await tx.select()
              .from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, recipientId))
              .for("update");

            if (!wallet) {
              throw new Error("Recipient project wallet not found");
            }

            const balanceBefore = parseFloat(wallet.totalBalance || "0");
            const earnedBefore = parseFloat(wallet.earnedBalance || "0");
            const balanceAfter = (balanceBefore + giftValue).toFixed(2);

            await tx.update(projectCurrencyWallets)
              .set({
                earnedBalance: (earnedBefore + giftValue).toFixed(2),
                totalBalance: balanceAfter,
                totalEarned: (parseFloat(wallet.totalEarned || "0") + giftValue).toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(projectCurrencyWallets.id, wallet.id));

            await tx.insert(projectCurrencyLedger).values({
              userId: recipientId,
              walletId: wallet.id,
              type: "bonus",
              amount: giftValue.toFixed(2),
              balanceBefore: balanceBefore.toFixed(2),
              balanceAfter,
              referenceId: challengeGiftReferenceId || `challenge_inventory_gift:${giftRecord.id}`,
              referenceType: "gift_reward",
              description: `Received ${parsedQuantity}x ${gift.name} in project currency`,
            });
          } else {
            const [recipientUser] = await tx.select({ balance: users.balance })
              .from(users)
              .where(eq(users.id, recipientId))
              .for("update");

            if (!recipientUser) {
              throw new Error("Recipient account not found");
            }

            const balanceBefore = parseFloat(recipientUser.balance);
            const balanceAfter = (balanceBefore + giftValue).toFixed(2);

            await tx.update(users)
              .set({ balance: balanceAfter, updatedAt: new Date() })
              .where(eq(users.id, recipientId));

            await tx.insert(transactions).values({
              userId: recipientId,
              type: "gift_received",
              amount: giftValue.toString(),
              status: "completed",
              balanceBefore: balanceBefore.toFixed(2),
              balanceAfter,
              description: `Received ${parsedQuantity}x ${gift.name} from spectator`,
              referenceId: challengeGiftReferenceId || `challenge_inventory_gift:${giftRecord.id}`,
              processedAt: new Date(),
            });
          }
        }

        return giftRecord;
      });

      if (!sentGift) {
        return res.json({
          success: true,
          duplicate: true,
          message: "Gift already processed",
        });
      }

      res.json({
        success: true,
        gift: sentGift,
        giftName: gift.name,
        giftNameAr: gift.nameAr,
        animationType: gift.animationType,
        coinValue: gift.coinValue,
      });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg.includes('Insufficient')) {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });

  // Get gifts sent in a challenge
  app.get("/api/challenges/:challengeId/gifts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const gifts = await storage.getChallengeGifts(req.params.challengeId);
      res.json(gifts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
