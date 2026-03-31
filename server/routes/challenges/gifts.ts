import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and, desc } from "drizzle-orm";
import { challenges as challengesTable, users } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { broadcastToUser } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getChallengeParticipantIds, getChallengeReadAccess, getErrorMessage } from "./helpers";

export function registerGiftsRoutes(app: Express) {
  app.get("/api/gifts/catalog", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { giftCatalog } = await import("@shared/schema");
      const gifts = await db.select()
        .from(giftCatalog)
        .where(eq(giftCatalog.isActive, true))
        .orderBy(giftCatalog.sortOrder, giftCatalog.price);
      res.json(gifts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/gifts/inventory", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userGiftInventory, giftCatalog } = await import("@shared/schema");
      const inventory = await db.select({
        id: userGiftInventory.id,
        giftId: userGiftInventory.giftId,
        quantity: userGiftInventory.quantity,
        giftName: giftCatalog.name,
        giftNameAr: giftCatalog.nameAr,
        giftIcon: giftCatalog.iconUrl,
        giftPrice: giftCatalog.price,
        category: giftCatalog.category,
      })
        .from(userGiftInventory)
        .innerJoin(giftCatalog, eq(userGiftInventory.giftId, giftCatalog.id))
        .where(eq(userGiftInventory.userId, req.user!.id));
      res.json(inventory);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/gifts/purchase", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { giftCatalog, userGiftInventory } = await import("@shared/schema");
      const { giftId, quantity = 1 } = req.body;
      if (!giftId) return res.status(400).json({ error: "giftId is required" });

      // SECURITY: Validate quantity
      const qty = parseInt(String(quantity));
      if (!qty || qty < 1 || qty > 100) return res.status(400).json({ error: "Invalid quantity (1-100)" });

      const [gift] = await db.select().from(giftCatalog).where(eq(giftCatalog.id, giftId));
      if (!gift || !gift.isActive) return res.status(404).json({ error: "Gift not found" });

      const totalCost = parseFloat(gift.price) * qty;

      // SECURITY: Atomic transaction — lock user row, check balance, deduct, update inventory
      const result = await db.transaction(async (tx) => {
        const [buyer] = await tx.select().from(users).where(eq(users.id, req.user!.id)).for('update');
        if (!buyer || parseFloat(buyer.balance) < totalCost) {
          throw new Error("Insufficient balance");
        }

        const newBalance = (parseFloat(buyer.balance) - totalCost).toFixed(8);
        await tx.update(users).set({ balance: newBalance, updatedAt: new Date() }).where(eq(users.id, req.user!.id));

        // Add to inventory (upsert)
        const [existing] = await tx.select()
          .from(userGiftInventory)
          .where(and(eq(userGiftInventory.userId, req.user!.id), eq(userGiftInventory.giftId, giftId)));

        if (existing) {
          await tx.update(userGiftInventory)
            .set({ quantity: existing.quantity + qty, updatedAt: new Date() })
            .where(eq(userGiftInventory.id, existing.id));
        } else {
          await tx.insert(userGiftInventory).values({
            userId: req.user!.id,
            giftId,
            quantity: qty,
          });
        }

        return { newBalance };
      });

      res.json({ success: true, totalCost, newBalance: result.newBalance });
    } catch (error: unknown) {
      if (getErrorMessage(error) === "Insufficient balance") {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/challenges/:id/gifts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [challenge] = await db.select()
        .from(challengesTable)
        .where(eq(challengesTable.id, req.params.id))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      const { challengeGifts, giftCatalog } = await import("@shared/schema");
      const gifts = await db.select({
        id: challengeGifts.id,
        senderId: challengeGifts.senderId,
        recipientId: challengeGifts.recipientId,
        giftId: challengeGifts.giftId,
        quantity: challengeGifts.quantity,
        message: challengeGifts.message,
        sentAt: challengeGifts.sentAt,
        giftName: giftCatalog.name,
        giftNameAr: giftCatalog.nameAr,
        giftIcon: giftCatalog.iconUrl,
        animationType: giftCatalog.animationType,
        coinValue: giftCatalog.coinValue,
      })
        .from(challengeGifts)
        .innerJoin(giftCatalog, eq(challengeGifts.giftId, giftCatalog.id))
        .where(eq(challengeGifts.challengeId, req.params.id))
        .orderBy(desc(challengeGifts.sentAt));
      res.json(gifts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/challenges/:id/gifts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challengeGifts, userGiftInventory, giftCatalog } = await import("@shared/schema");
      const { giftId, recipientId, quantity = 1, message } = req.body;
      const giftQuantity = parseInt(String(quantity), 10);

      if (!giftId || !recipientId) {
        return res.status(400).json({ error: "giftId and recipientId are required" });
      }

      if (!giftQuantity || giftQuantity < 1 || giftQuantity > 100) {
        return res.status(400).json({ error: "Invalid quantity (1-100)" });
      }

      const [challenge] = await db.select()
        .from(challengesTable)
        .where(eq(challengesTable.id, req.params.id))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      const participantIds = getChallengeParticipantIds(challenge);
      if (!participantIds.includes(recipientId)) {
        return res.status(400).json({ error: "Recipient is not a participant in this challenge" });
      }

      // Check inventory
      const [inv] = await db.select()
        .from(userGiftInventory)
        .where(and(
          eq(userGiftInventory.userId, req.user!.id),
          eq(userGiftInventory.giftId, giftId)
        ));

      if (!inv || inv.quantity < giftQuantity) {
        return res.status(400).json({ error: "Not enough gifts in inventory" });
      }

      // Deduct from inventory
      if (inv.quantity === giftQuantity) {
        await db.delete(userGiftInventory).where(eq(userGiftInventory.id, inv.id));
      } else {
        await db.update(userGiftInventory)
          .set({ quantity: inv.quantity - giftQuantity, updatedAt: new Date() })
          .where(eq(userGiftInventory.id, inv.id));
      }

      // Record gift in challenge
      const [gift] = await db.insert(challengeGifts).values({
        challengeId: req.params.id,
        senderId: req.user!.id,
        recipientId,
        giftId,
        quantity: giftQuantity,
        message: message || null,
      }).returning();

      // Get gift details to broadcast
      const [giftInfo] = await db.select().from(giftCatalog).where(eq(giftCatalog.id, giftId));

      // Notify recipient
      broadcastToUser(recipientId, {
        type: "challenge_gift",
        challengeId: req.params.id,
        gift: { ...gift, giftName: giftInfo?.name, animationType: giftInfo?.animationType },
      });

      // Persistent notification for gift recipient
      await sendNotification(recipientId, {
        type: 'promotion',
        priority: 'normal',
        title: `Gift Received! 🎁`,
        titleAr: `حصلت على هدية! 🎁`,
        message: `${req.user!.username} sent you ${giftInfo?.name || 'a gift'}${message ? ': "' + message + '"' : ''}.`,
        messageAr: `أرسل لك ${req.user!.username} ${giftInfo?.nameAr || giftInfo?.name || 'هدية'}${message ? ': "' + message + '"' : ''}.`,
        link: `/challenge/${req.params.id}`,
        metadata: JSON.stringify({ challengeId: req.params.id, giftId, giftName: giftInfo?.name }),
      }).catch(() => {});

      res.json({ success: true, gift });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
