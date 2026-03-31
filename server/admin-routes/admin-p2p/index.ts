import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pOffers, p2pTrades, p2pDisputes,
  users,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { registerDisputeListingRoutes } from "./dispute-listing";
import { registerDisputeActionRoutes } from "./dispute-actions";
import { registerP2pSettingsRoutes } from "./settings";
import { registerP2pAnalyticsRoutes } from "./analytics";

export function registerAdminP2pRoutes(app: Express) {

  // ==================== P2P STATS ====================

  app.get("/api/admin/p2p/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const [activeOffers] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pOffers)
        .where(eq(p2pOffers.status, "active"));
      
      const [completedTrades] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pTrades)
        .where(sql`${p2pTrades.status} = 'completed'`);
      
      const [pendingTrades] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pTrades)
        .where(sql`${p2pTrades.status} IN ('pending', 'paid', 'confirmed')`);
      
      const [openDisputes] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pDisputes)
        .where(sql`${p2pDisputes.status} IN ('open', 'investigating')`);

      res.json({
        activeOffers: Number(activeOffers?.count) || 0,
        completedTrades: Number(completedTrades?.count) || 0,
        pendingTrades: Number(pendingTrades?.count) || 0,
        openDisputes: Number(openDisputes?.count) || 0,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== P2P OFFERS LIST ====================

  app.get("/api/admin/p2p/offers", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const offers = await db.select({
        id: p2pOffers.id,
        userId: p2pOffers.userId,
        type: p2pOffers.type,
        availableAmount: p2pOffers.availableAmount,
        price: p2pOffers.price,
        cryptoCurrency: p2pOffers.cryptoCurrency,
        fiatCurrency: p2pOffers.fiatCurrency,
        minLimit: p2pOffers.minLimit,
        maxLimit: p2pOffers.maxLimit,
        paymentMethods: p2pOffers.paymentMethods,
        status: p2pOffers.status,
        createdAt: p2pOffers.createdAt,
        username: users.username,
      })
        .from(p2pOffers)
        .leftJoin(users, eq(p2pOffers.userId, users.id))
        .orderBy(desc(p2pOffers.createdAt))
        .limit(100);
      
      const formattedOffers = offers.map(offer => ({
        ...offer,
        amount: offer.availableAmount,
        currency: `${offer.cryptoCurrency}/${offer.fiatCurrency}`,
      }));
      
      res.json(formattedOffers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== P2P TRADES LIST ====================

  app.get("/api/admin/p2p/trades", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const trades = await db.select()
        .from(p2pTrades)
        .orderBy(desc(p2pTrades.createdAt))
        .limit(100);

      const tradesWithUsers = await Promise.all(trades.map(async (trade) => {
        const buyer = await storage.getUser(trade.buyerId);
        const seller = await storage.getUser(trade.sellerId);
        return {
          ...trade,
          buyerUsername: buyer?.username || "Unknown",
          sellerUsername: seller?.username || "Unknown",
        };
      }));

      res.json(tradesWithUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== CANCEL OFFER ====================

  app.post("/api/admin/p2p/offers/:id/cancel", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [updated] = await db.update(p2pOffers)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(p2pOffers.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "p2p_offer_cancel", "p2p_offer", id, { reason }, req);

      // Notify offer owner about admin cancellation
      if (updated?.userId) {
        await sendNotification(updated.userId, {
          type: 'warning',
          priority: 'high',
          title: 'P2P Offer Cancelled by Admin',
          titleAr: 'تم إلغاء عرض P2P بواسطة الإدارة',
          message: `Your P2P offer has been cancelled by an administrator.${reason ? ' Reason: ' + reason : ''}`,
          messageAr: `تم إلغاء عرض P2P الخاص بك بواسطة الإدارة.${reason ? ' السبب: ' + reason : ''}`,
          link: '/p2p',
          metadata: JSON.stringify({ offerId: id, action: 'admin_cancel', reason }),
        }).catch(() => {});
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Register sub-modules
  registerDisputeListingRoutes(app);
  registerDisputeActionRoutes(app);
  registerP2pSettingsRoutes(app);
  registerP2pAnalyticsRoutes(app);
}
