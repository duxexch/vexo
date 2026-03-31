import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";

/** POST rate, GET/POST messages — Rating and messaging */
export function registerRateMessageRoutes(app: Express) {

  app.post("/api/p2p/trades/:id/rate", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const trade = await storage.getP2PTrade(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to rate this trade" });
      }
      
      if (trade.status !== "completed") {
        return res.status(400).json({ error: "Can only rate completed trades" });
      }
      
      const { rating, comment } = req.body;
      
      if (rating === undefined || rating === null || typeof rating !== 'number') {
        return res.status(400).json({ error: "Rating is required" });
      }
      
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
      }
      
      if (comment && (typeof comment !== 'string' || comment.length > 500)) {
        return res.status(400).json({ error: "Comment must be a string under 500 characters" });
      }
      
      const ratedUserId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
      
      const existingRatings = await storage.getP2PTraderRatings(ratedUserId);
      const alreadyRated = existingRatings.find(r => r.tradeId === trade.id && r.raterId === req.user!.id);
      
      if (alreadyRated) {
        return res.status(400).json({ error: "Already rated this trade" });
      }
      
      const newRating = await storage.createP2PTraderRating({
        tradeId: trade.id,
        raterId: req.user!.id,
        ratedUserId,
        rating,
        comment: comment || null,
      });
      
      const allRatings = await storage.getP2PTraderRatings(ratedUserId);
      const totalRatings = allRatings.length;
      const positiveRatings = allRatings.filter(r => r.rating >= 4).length;
      const negativeRatings = allRatings.filter(r => r.rating <= 2).length;
      const avgRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
      
      await storage.updateP2PTraderMetrics(ratedUserId, {
        positiveRatings,
        negativeRatings,
        overallRating: avgRating.toFixed(2),
      });

      // Notify rated user about their rating
      const rater = await storage.getUser(req.user!.id);
      const stars = '⭐'.repeat(rating);
      await sendNotification(ratedUserId, {
        type: 'system',
        priority: 'normal',
        title: `New Rating: ${stars}`,
        titleAr: `تقييم جديد: ${stars}`,
        message: `${rater?.username || 'A trader'} rated you ${rating}/5 on trade #${trade.id.slice(0,8)}.${comment ? ' "' + comment + '"' : ''}`,
        messageAr: `قام ${rater?.username || 'متداول'} بتقييمك ${rating}/5 على الصفقة #${trade.id.slice(0,8)}.${comment ? ' "' + comment + '"' : ''}`,
        link: '/p2p/profile',
        metadata: JSON.stringify({ tradeId: trade.id, rating }),
      }).catch(() => {});
      
      res.status(201).json(newRating);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/trades/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const trade = await storage.getP2PTrade(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to view trade messages" });
      }
      
      const messages = await storage.getP2PTradeMessages(req.params.id);
      
      const messagesWithSender = await Promise.all(messages.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, username: sender.username, nickname: sender.nickname } : null,
        };
      }));
      
      res.json(messagesWithSender);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/trades/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const trade = await storage.getP2PTrade(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to message in this trade" });
      }
      
      if (trade.status === "completed" || trade.status === "cancelled") {
        return res.status(400).json({ error: "Cannot message in closed trades" });
      }
      
      const { message, isPrewritten } = req.body;
      
      if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }
      
      if (message.length > 1000) {
        return res.status(400).json({ error: "Message too long" });
      }
      
      // SECURITY: Strip HTML tags from message to prevent stored XSS
      const safeMessage = message.trim().replace(/<[^>]*>/g, '');
      const newMessage = await storage.createP2PTradeMessage({
        tradeId: req.params.id,
        senderId: req.user!.id,
        message: safeMessage,
        isPrewritten: isPrewritten || false,
        isSystemMessage: false,
      });
      
      const sender = await storage.getUser(req.user!.id);
      
      res.status(201).json({
        ...newMessage,
        sender: sender ? { id: sender.id, username: sender.username, nickname: sender.nickname } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
