import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import {
  users, transactions, challenges as challengesTable,
} from "@shared/schema";

export function registerGiftChallengeRoutes(app: Express): void {

  // ==================== CHALLENGE GIFTS ====================

  // Send gift to player in a challenge
  app.post("/api/challenges/:challengeId/gifts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { recipientId, giftId, quantity = 1, message } = req.body;
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
      
      // Verify recipient is a player in the challenge
      if (recipientId !== challenge.player1Id && recipientId !== challenge.player2Id) {
        return res.status(400).json({ error: "Recipient must be a player in this challenge" });
      }
      
      // Verify gift exists
      const gift = await storage.getGiftFromCatalog(giftId);
      if (!gift) {
        return res.status(404).json({ error: "Gift not found" });
      }
      
      const giftValue = (gift.coinValue || 1) * parsedQuantity * 0.01;
      
      // Atomic transaction for gift sending
      const sentGift = await db.transaction(async (tx) => {
        const { userGiftInventory, challengeGifts } = await import("@shared/schema");
        
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
        
        // Credit recipient with gift value
        if (giftValue > 0) {
          await tx.update(users)
            .set({ balance: sql`${users.balance}::decimal + ${giftValue}` })
            .where(eq(users.id, recipientId));
          
          await tx.insert(transactions).values({
            userId: recipientId,
            type: "gift_received",
            amount: giftValue.toString(),
            status: "completed",
            balanceBefore: "0",
            balanceAfter: "0",
            description: `Received ${parsedQuantity}x ${gift.name} from spectator`,
          });
        }
        
        return giftRecord;
      });
      
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
