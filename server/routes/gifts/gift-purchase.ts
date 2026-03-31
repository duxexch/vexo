import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import {
  users, transactions,
} from "@shared/schema";

export function registerGiftPurchaseRoutes(app: Express): void {

  // ==================== GIFT CATALOG & PURCHASE ====================

  app.get("/api/gifts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const gifts = await storage.listGiftCatalog(true);
      res.json(gifts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/gifts/inventory", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const inventory = await storage.getUserGiftInventory(req.user!.id);
      res.json(inventory.map(item => ({
        id: item.id,
        giftId: item.giftId,
        giftName: item.gift.name,
        giftNameAr: item.gift.nameAr,
        iconUrl: item.gift.iconUrl,
        quantity: item.quantity,
        coinValue: item.gift.coinValue,
      })));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/gifts/purchase", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { giftId, quantity = 1 } = req.body;
      
      // Validate input
      const parsedQuantity = parseInt(String(quantity));
      if (!giftId || typeof giftId !== 'string') {
        return res.status(400).json({ error: "Invalid giftId" });
      }
      if (isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 100) {
        return res.status(400).json({ error: "Quantity must be between 1 and 100" });
      }
      
      const gift = await storage.getGiftFromCatalog(giftId);
      if (!gift) {
        return res.status(404).json({ error: "Gift not found" });
      }
      
      const totalCost = parseFloat(gift.price) * parsedQuantity;
      const userId = req.user!.id;
      
      // Atomic transaction for purchase
      await db.transaction(async (tx) => {
        const [user] = await tx.select()
          .from(users)
          .where(eq(users.id, userId))
          .for('update');
        
        if (!user || parseFloat(user.balance) < totalCost) {
          throw new Error("Insufficient balance");
        }
        
        // Deduct balance
        await tx.update(users)
          .set({ balance: (parseFloat(user.balance) - totalCost).toString() })
          .where(eq(users.id, userId));
        
        // Add to inventory (using table directly in transaction with row locking)
        const { userGiftInventory } = await import("@shared/schema");
        const [existing] = await tx.select().from(userGiftInventory)
          .where(and(
            eq(userGiftInventory.userId, userId),
            eq(userGiftInventory.giftId, giftId)
          ))
          .for('update');
        
        if (existing) {
          // Use atomic SQL increment to prevent race conditions
          await tx.update(userGiftInventory)
            .set({ 
              quantity: sql`${userGiftInventory.quantity} + ${parsedQuantity}`,
              updatedAt: new Date() 
            })
            .where(eq(userGiftInventory.id, existing.id));
        } else {
          await tx.insert(userGiftInventory)
            .values({ userId, giftId, quantity: parsedQuantity });
        }
        
        // Create transaction record
        await tx.insert(transactions).values({
          userId,
          type: "gift_sent",
          amount: (-totalCost).toString(),
          status: "completed",
          balanceBefore: "0",
          balanceAfter: "0",
          description: `Purchased ${parsedQuantity}x ${gift.name}`,
        });
      });
      
      res.json({ 
        success: true, 
        giftId, 
        quantity: parsedQuantity, 
        totalCost: totalCost.toFixed(2),
        message: "Gift purchased successfully" 
      });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg.includes('Insufficient')) {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });
}
