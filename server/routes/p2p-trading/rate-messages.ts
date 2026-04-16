import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";
import { sanitizePlainText } from "../../lib/input-security";
import { ensureP2PUsername, getP2PUsernameMap } from "../../lib/p2p-username";
import { db } from "../../db";
import { p2pTraderProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";

function isAllowedTradeAttachmentUrl(rawAttachmentUrl: string): boolean {
  const normalizedUrl = rawAttachmentUrl.trim();
  if (!normalizedUrl) {
    return false;
  }

  if (normalizedUrl.includes("..")) {
    return false;
  }

  return normalizedUrl.startsWith("/uploads/") || normalizedUrl.startsWith("/storage/");
}

/** POST rate, GET/POST messages — Rating and messaging */
export function registerRateMessageRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Trading] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

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
      const raterP2PUsername = await ensureP2PUsername(req.user!.id, rater?.username || req.user!.username);
      const stars = '⭐'.repeat(rating);
      await notifyWithLog(ratedUserId, {
        type: 'system',
        priority: 'normal',
        title: `New Rating: ${stars}`,
        titleAr: `تقييم جديد: ${stars}`,
        message: `${raterP2PUsername} rated you ${rating}/5 on trade #${trade.id.slice(0, 8)}.${comment ? ' "' + comment + '"' : ''}`,
        messageAr: `قام ${raterP2PUsername} بتقييمك ${rating}/5 على الصفقة #${trade.id.slice(0, 8)}.${comment ? ' "' + comment + '"' : ''}`,
        link: '/p2p/profile',
        metadata: JSON.stringify({ tradeId: trade.id, rating }),
      }, "trade-rate:rated-user");

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

      const senderIds = Array.from(new Set(messages.map((msg) => msg.senderId)));
      const [senderUsernames, senderRecords] = await Promise.all([
        getP2PUsernameMap(senderIds),
        Promise.all(senderIds.map((senderId) => storage.getUser(senderId))),
      ]);

      const senderRecordMap = new Map(senderRecords.filter(Boolean).map((sender) => [sender!.id, sender!]));

      const messagesWithSender = messages.map((msg) => {
        const sender = senderRecordMap.get(msg.senderId);
        return {
          ...msg,
          sender: sender
            ? {
              id: sender.id,
              username: senderUsernames.get(sender.id) || sender.username,
              nickname: sender.nickname,
            }
            : null,
        };
      });

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

      const { message, isPrewritten, attachmentUrl, attachmentType } = req.body;

      const normalizedMessage = typeof message === "string" ? message.trim() : "";
      const normalizedAttachmentUrl = typeof attachmentUrl === "string" ? attachmentUrl.trim() : "";
      const normalizedAttachmentType = typeof attachmentType === "string" ? attachmentType.trim().toLowerCase() : "";

      const hasMessage = normalizedMessage.length > 0;
      const hasAttachment = normalizedAttachmentUrl.length > 0;

      if (!hasMessage && !hasAttachment) {
        return res.status(400).json({ error: "Message or image attachment is required" });
      }

      if (hasMessage && normalizedMessage.length > 1000) {
        return res.status(400).json({ error: "Message too long" });
      }

      let safeAttachmentUrl: string | undefined;
      let safeAttachmentType: string | undefined;

      if (hasAttachment) {
        if (!normalizedAttachmentType.startsWith("image/")) {
          return res.status(400).json({ error: "Only image attachments are allowed" });
        }

        if (!isAllowedTradeAttachmentUrl(normalizedAttachmentUrl)) {
          return res.status(400).json({ error: "Invalid attachment URL" });
        }

        safeAttachmentUrl = normalizedAttachmentUrl.slice(0, 2048);
        safeAttachmentType = normalizedAttachmentType.slice(0, 128);
      }

      // SECURITY: Strip HTML tags from message to prevent stored XSS
      const safeMessage = hasMessage
        ? sanitizePlainText(normalizedMessage, { maxLength: 1000 })
        : "[image]";

      const newMessage = await storage.createP2PTradeMessage({
        tradeId: req.params.id,
        senderId: req.user!.id,
        message: safeMessage,
        isPrewritten: isPrewritten || false,
        isSystemMessage: false,
        attachmentUrl: safeAttachmentUrl,
        attachmentType: safeAttachmentType,
      });

      const sender = await storage.getUser(req.user!.id);
      const senderP2PUsername = await ensureP2PUsername(req.user!.id, sender?.username || req.user!.username);

      const recipientId = trade.buyerId === req.user!.id ? trade.sellerId : trade.buyerId;
      const [recipientProfile] = await db
        .select({ notifyOnMessage: p2pTraderProfiles.notifyOnMessage })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, recipientId))
        .limit(1);

      const shouldNotifyRecipient = recipientProfile?.notifyOnMessage ?? true;
      if (shouldNotifyRecipient) {
        const compactTradeId = trade.id.slice(0, 8);
        const baseNotificationMessage = hasMessage
          ? safeMessage
          : "[Image attachment]";
        const trimmedMessage = baseNotificationMessage.length > 140
          ? `${baseNotificationMessage.slice(0, 137)}...`
          : baseNotificationMessage;

        await notifyWithLog(recipientId, {
          type: 'p2p',
          priority: 'normal',
          title: 'New P2P Message',
          titleAr: 'رسالة جديدة في P2P',
          message: `${senderP2PUsername} sent a new message on trade #${compactTradeId}: "${trimmedMessage}"`,
          messageAr: `أرسل ${senderP2PUsername} رسالة جديدة في الصفقة #${compactTradeId}: "${trimmedMessage}"`,
          link: `/p2p/trade/${trade.id}`,
          metadata: JSON.stringify({ tradeId: trade.id, senderId: req.user!.id, type: 'trade_message' }),
        }, "trade-message:recipient");
      }

      res.status(201).json({
        ...newMessage,
        sender: sender ? { id: sender.id, username: senderP2PUsername, nickname: sender.nickname } : null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
