import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, sensitiveRateLimiter } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import {
  projectCurrencyWallets, projectCurrencyLedger,
} from "@shared/schema";

export function registerGiftPurchaseRoutes(app: Express): void {

  // ==================== GIFT CATALOG & PURCHASE ====================

  // Backward-compatible alias while consolidating gift routes under the gifts module.
  app.get("/api/gifts/catalog", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const gifts = await storage.listGiftCatalog(true);
      res.json(gifts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

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

  app.post("/api/gifts/purchase", authMiddleware, sensitiveRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { giftId, quantity = 1, idempotencyKey: bodyIdempotencyKey } = req.body;

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
      if (!gift.isActive) {
        return res.status(400).json({ error: "Gift is currently unavailable" });
      }

      const totalCost = parseFloat(gift.price) * parsedQuantity;
      const userId = req.user!.id;

      const settings = await storage.getProjectCurrencySettings();
      if (!settings?.isActive || !settings?.useInGames) {
        return res.status(400).json({
          error: "Project currency is required for gift purchases but is currently unavailable.",
        });
      }

      const senderReferenceToken = String(
        bodyIdempotencyKey
        || req.headers["x-idempotency-key"]
        || (req as AuthRequest & { requestId?: string }).requestId
        || ""
      ).trim().slice(0, 128);
      const purchaseReferenceId = senderReferenceToken
        ? `gift_purchase:${userId}:${senderReferenceToken}`
        : undefined;

      // Atomic transaction for purchase
      await db.transaction(async (tx) => {
        if (purchaseReferenceId) {
          const [existingLedger] = await tx.select({ id: projectCurrencyLedger.id })
            .from(projectCurrencyLedger)
            .where(and(
              eq(projectCurrencyLedger.referenceId, purchaseReferenceId),
              eq(projectCurrencyLedger.userId, userId),
            ))
            .for('update')
            .limit(1);

          if (existingLedger) {
            return;
          }
        }

        await tx.execute(sql`
          INSERT INTO project_currency_wallets (user_id)
          VALUES (${userId})
          ON CONFLICT (user_id) DO NOTHING
        `);

        const [wallet] = await tx.select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, userId))
          .for('update');

        if (!wallet) {
          throw new Error('Project currency wallet not found');
        }

        let earnedBalance = parseFloat(wallet.earnedBalance);
        let purchasedBalance = parseFloat(wallet.purchasedBalance);
        const totalBalance = earnedBalance + purchasedBalance;
        if (totalBalance < totalCost) {
          throw new Error("Insufficient project currency balance");
        }

        let remaining = totalCost;
        if (earnedBalance >= remaining) {
          earnedBalance -= remaining;
          remaining = 0;
        } else {
          remaining -= earnedBalance;
          earnedBalance = 0;
          purchasedBalance -= remaining;
        }

        const balanceBefore = parseFloat(wallet.totalBalance || '0');
        const balanceAfter = (earnedBalance + purchasedBalance).toFixed(2);

        await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: earnedBalance.toFixed(2),
            purchasedBalance: purchasedBalance.toFixed(2),
            totalBalance: balanceAfter,
            totalSpent: (parseFloat(wallet.totalSpent || '0') + totalCost).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id));

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: 'admin_adjustment',
          amount: (-totalCost).toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter,
          referenceId: purchaseReferenceId,
          referenceType: 'gift_purchase',
          description: `Purchased ${parsedQuantity}x ${gift.name} using project currency`,
        });

        const { userGiftInventory } = await import("@shared/schema");
        const [existing] = await tx.select().from(userGiftInventory)
          .where(and(
            eq(userGiftInventory.userId, userId),
            eq(userGiftInventory.giftId, giftId)
          ))
          .for('update');

        if (existing) {
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
