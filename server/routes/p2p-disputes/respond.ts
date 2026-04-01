import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pDisputeMessages,
  p2pTransactionLogs,
  p2pTrades,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendNotification } from "../../websocket";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

/** POST /api/p2p/disputes/:id/respond — Respondent actions: accept, contest, escalate */
export function registerRespondRoutes(app: Express) {

  app.post("/api/p2p/disputes/:id/respond", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;
      const { action, details } = req.body;

      if (!action || !["accept", "contest", "escalate"].includes(action)) {
        return res.status(400).json({ error: "action must be one of: accept, contest, escalate" });
      }

      // 1. Validate dispute
      const [dispute] = await db
        .select()
        .from(p2pDisputes)
        .where(eq(p2pDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      // Only the respondent can respond
      if (dispute.respondentId !== userId) {
        return res.status(403).json({ error: "Only the respondent can use this action" });
      }

      if (dispute.status !== "open") {
        return res.status(400).json({ error: "Dispute is no longer open for response" });
      }

      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";

      if (action === "accept") {
        const [trade] = await db
          .select({ id: p2pTrades.id, currencyType: p2pTrades.currencyType })
          .from(p2pTrades)
          .where(eq(p2pTrades.id, dispute.tradeId))
          .limit(1);

        if (!trade) {
          return res.status(404).json({ error: "Related trade not found" });
        }

        const resolutionReason = details || "Respondent accepted the dispute";
        const settleResult = trade.currencyType === 'project'
          ? await storage.resolveP2PDisputedTradeProjectCurrencyAtomic(dispute.tradeId, dispute.initiatorId, resolutionReason)
          : await storage.resolveP2PDisputedTradeAtomic(dispute.tradeId, dispute.initiatorId, resolutionReason);

        if (!settleResult.success) {
          return res.status(400).json({ error: settleResult.error || "Failed to settle trade" });
        }

        // Respondent accepts the dispute — resolve in favour of initiator
        await db
          .update(p2pDisputes)
          .set({
            status: "resolved",
            resolution: resolutionReason,
            winnerUserId: dispute.initiatorId,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(p2pDisputes.id, disputeId));

        await db.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId,
          userId,
          action: "dispute_resolved",
          description: `${req.user!.username} accepted the dispute. Resolved in favour of initiator.`,
          descriptionAr: `قبل ${req.user!.username} النزاع. تم الحل لصالح مقدم النزاع.`,
          ipAddress,
          userAgent,
        });

        // Notify initiator that respondent accepted
        await sendNotification(dispute.initiatorId, {
          type: 'success',
          priority: 'high',
          title: 'Dispute Resolved ✅',
          titleAr: 'تم حل النزاع ✅',
          message: `${req.user!.username} accepted your dispute. It has been resolved in your favor.`,
          messageAr: `قبل ${req.user!.username} نزاعك. تم حله لصالحك.`,
          link: '/p2p/disputes',
          metadata: JSON.stringify({ disputeId, action: 'dispute_accepted' }),
        }).catch(() => { });

        return res.json({ success: true, action: "accepted", newStatus: "resolved" });

      } else if (action === "contest") {
        // Respondent contests — escalate to investigating (support review)
        await db
          .update(p2pDisputes)
          .set({
            status: "investigating",
            updatedAt: new Date(),
          })
          .where(eq(p2pDisputes.id, disputeId));

        // Auto-add a system message
        await db.insert(p2pDisputeMessages).values({
          disputeId,
          senderId: userId,
          message: details || "I contest this dispute and request support review.",
          isPrewritten: false,
          isFromSupport: false,
        });

        await db.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId,
          userId,
          action: "dispute_message",
          description: `${req.user!.username} contested the dispute. Escalated to support review.`,
          descriptionAr: `اعترض ${req.user!.username} على النزاع. تم تصعيده لمراجعة الدعم.`,
          ipAddress,
          userAgent,
        });

        // Notify initiator that respondent contested
        await sendNotification(dispute.initiatorId, {
          type: 'warning',
          priority: 'high',
          title: 'Dispute Contested',
          titleAr: 'تم الاعتراض على النزاع',
          message: `${req.user!.username} contested your dispute #${disputeId.slice(0, 8)}. It has been escalated to support review.`,
          messageAr: `اعترض ${req.user!.username} على نزاعك #${disputeId.slice(0, 8)}. تم تصعيده لمراجعة الدعم.`,
          link: '/p2p/disputes',
          metadata: JSON.stringify({ disputeId, action: 'dispute_contested' }),
        }).catch(() => { });

        return res.json({ success: true, action: "contested", newStatus: "investigating" });

      } else if (action === "escalate") {
        // Respondent also wants admin — set to investigating
        await db
          .update(p2pDisputes)
          .set({
            status: "investigating",
            updatedAt: new Date(),
          })
          .where(eq(p2pDisputes.id, disputeId));

        await db.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId,
          userId,
          action: "dispute_message",
          description: `${req.user!.username} escalated the dispute to support.`,
          descriptionAr: `صعّد ${req.user!.username} النزاع إلى الدعم.`,
          ipAddress,
          userAgent,
        });

        // Notify initiator that respondent escalated
        await sendNotification(dispute.initiatorId, {
          type: 'warning',
          priority: 'high',
          title: 'Dispute Escalated',
          titleAr: 'تم تصعيد النزاع',
          message: `${req.user!.username} escalated the dispute #${disputeId.slice(0, 8)} to admin support.`,
          messageAr: `صعّد ${req.user!.username} النزاع #${disputeId.slice(0, 8)} إلى دعم الإدارة.`,
          link: '/p2p/disputes',
          metadata: JSON.stringify({ disputeId, action: 'dispute_escalated' }),
        }).catch(() => { });

        return res.json({ success: true, action: "escalated", newStatus: "investigating" });
      }
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes/:id/respond error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
