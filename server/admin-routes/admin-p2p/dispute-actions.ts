import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pDisputes, p2pTrades, p2pTransactionLogs,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { emitDisputeAlert } from "../../lib/admin-alerts";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerDisputeActionRoutes(app: Express) {

  app.post("/api/admin/p2p/disputes/:id/resolve", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { resolution, winnerId } = req.body;

      const [dispute] = await db.select().from(p2pDisputes).where(eq(p2pDisputes.id, id));
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (!winnerId || (winnerId !== dispute.initiatorId && winnerId !== dispute.respondentId)) {
        return res.status(400).json({ error: "winnerId must be dispute initiator or respondent" });
      }

      const [trade] = await db
        .select({ id: p2pTrades.id, currencyType: p2pTrades.currencyType })
        .from(p2pTrades)
        .where(eq(p2pTrades.id, dispute.tradeId))
        .limit(1);

      if (!trade) {
        return res.status(404).json({ error: "Related trade not found" });
      }

      const settlementResult = trade.currencyType === 'project'
        ? await storage.resolveP2PDisputedTradeProjectCurrencyAtomic(dispute.tradeId, winnerId, resolution)
        : await storage.resolveP2PDisputedTradeAtomic(dispute.tradeId, winnerId, resolution);

      if (!settlementResult.success) {
        return res.status(400).json({ error: settlementResult.error || "Failed to settle disputed trade" });
      }

      const [updated] = await db.update(p2pDisputes)
        .set({
          status: "resolved",
          resolution,
          resolvedBy: req.admin!.id,
          winnerUserId: winnerId,
          resolvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(p2pDisputes.id, id))
        .returning();

      // Log the action to transaction logs
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId: id,
        userId: req.admin!.id,
        action: "dispute_resolved",
        description: `Dispute resolved by admin. Winner: ${winnerId}. Resolution: ${resolution}`,
        metadata: JSON.stringify({ winnerId, resolution, adminId: req.admin!.id })
      });

      await logAdminAction(req.admin!.id, "p2p_dispute_resolve", "p2p_dispute", id, {
        reason: resolution,
        newValue: winnerId
      }, req);

      // Emit admin alert for dispute resolution
      await emitDisputeAlert({
        disputeId: id,
        tradeId: dispute.tradeId,
        isNew: false,
        severity: "info",
        message: `Dispute resolved by ${req.admin!.username}. Resolution: ${resolution}`
      });

      // Notify both dispute parties about admin resolution
      await sendNotification(dispute.initiatorId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${id.slice(0, 8)} has been resolved by admin.${resolution ? ' ' + resolution : ''}`,
        messageAr: `تم حل النزاع #${id.slice(0, 8)} بواسطة الإدارة.${resolution ? ' ' + resolution : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'admin_dispute_resolved', winnerId }),
      }).catch(() => { });
      await sendNotification(dispute.respondentId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${id.slice(0, 8)} has been resolved by admin.${resolution ? ' ' + resolution : ''}`,
        messageAr: `تم حل النزاع #${id.slice(0, 8)} بواسطة الإدارة.${resolution ? ' ' + resolution : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'admin_dispute_resolved', winnerId }),
      }).catch(() => { });

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Escalate dispute to investigating status
  app.post("/api/admin/p2p/disputes/:id/escalate", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [dispute] = await db.select().from(p2pDisputes).where(eq(p2pDisputes.id, id));
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.status !== "open") {
        return res.status(400).json({ error: "Can only escalate open disputes" });
      }

      const [updated] = await db.update(p2pDisputes)
        .set({
          status: "investigating",
          updatedAt: new Date()
        })
        .where(eq(p2pDisputes.id, id))
        .returning();

      // Log to transaction logs
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId: id,
        userId: req.admin!.id,
        action: "dispute_message",
        description: `Dispute escalated to investigation. Reason: ${reason || "No reason provided"}`,
        metadata: JSON.stringify({ reason, adminId: req.admin!.id, previousStatus: "open", eventType: "escalated" })
      });

      await logAdminAction(req.admin!.id, "p2p_dispute_escalate", "p2p_dispute", id, {
        previousValue: "open",
        newValue: "investigating",
        reason
      }, req);

      // Emit admin alert
      await emitDisputeAlert({
        disputeId: id,
        tradeId: dispute.tradeId,
        isNew: false,
        severity: "warning",
        message: `Dispute escalated to investigation by ${req.admin!.username}. Reason: ${reason || "Escalated for investigation"}`
      });

      // Notify both dispute parties about escalation
      const escalateReason = reason || 'Under investigation';
      await sendNotification(dispute.initiatorId, {
        type: 'p2p',
        priority: 'high',
        title: 'Dispute Under Investigation',
        titleAr: 'النزاع قيد التحقيق',
        message: `Dispute #${id.slice(0, 8)} has been escalated for investigation.${escalateReason ? ' Reason: ' + escalateReason : ''}`,
        messageAr: `تم تصعيد النزاع #${id.slice(0, 8)} للتحقيق.${escalateReason ? ' السبب: ' + escalateReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_escalated' }),
      }).catch(() => { });
      await sendNotification(dispute.respondentId, {
        type: 'p2p',
        priority: 'high',
        title: 'Dispute Under Investigation',
        titleAr: 'النزاع قيد التحقيق',
        message: `Dispute #${id.slice(0, 8)} has been escalated for investigation.${escalateReason ? ' Reason: ' + escalateReason : ''}`,
        messageAr: `تم تصعيد النزاع #${id.slice(0, 8)} للتحقيق.${escalateReason ? ' السبب: ' + escalateReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_escalated' }),
      }).catch(() => { });

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Close dispute without resolution
  app.post("/api/admin/p2p/disputes/:id/close", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [dispute] = await db.select().from(p2pDisputes).where(eq(p2pDisputes.id, id));
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      const [trade] = await db
        .select({ id: p2pTrades.id, status: p2pTrades.status })
        .from(p2pTrades)
        .where(eq(p2pTrades.id, dispute.tradeId))
        .limit(1);

      if (!trade) {
        return res.status(404).json({ error: "Related trade not found" });
      }

      if (trade.status !== "completed" && trade.status !== "cancelled") {
        return res.status(400).json({
          error: "Cannot close dispute before trade financial settlement. Use resolve endpoint first.",
        });
      }

      const [updated] = await db.update(p2pDisputes)
        .set({
          status: "closed",
          resolution: reason || "Closed by admin",
          resolvedBy: req.admin!.id,
          resolvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(p2pDisputes.id, id))
        .returning();

      // Log to transaction logs
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId: id,
        userId: req.admin!.id,
        action: "dispute_resolved",
        description: `Dispute closed by admin. Reason: ${reason || "No reason provided"}`,
        metadata: JSON.stringify({ reason, adminId: req.admin!.id, previousStatus: dispute.status, eventType: "closed" })
      });

      await logAdminAction(req.admin!.id, "p2p_dispute_close", "p2p_dispute", id, {
        previousValue: dispute.status,
        newValue: "closed",
        reason
      }, req);

      // Notify both dispute parties about closure
      const closeReason = reason || 'Closed by admin';
      await sendNotification(dispute.initiatorId, {
        type: 'p2p',
        priority: 'normal',
        title: 'Dispute Closed',
        titleAr: 'تم إغلاق النزاع',
        message: `Dispute #${id.slice(0, 8)} has been closed.${closeReason ? ' Reason: ' + closeReason : ''}`,
        messageAr: `تم إغلاق النزاع #${id.slice(0, 8)}.${closeReason ? ' السبب: ' + closeReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_closed' }),
      }).catch(() => { });
      await sendNotification(dispute.respondentId, {
        type: 'p2p',
        priority: 'normal',
        title: 'Dispute Closed',
        titleAr: 'تم إغلاق النزاع',
        message: `Dispute #${id.slice(0, 8)} has been closed.${closeReason ? ' Reason: ' + closeReason : ''}`,
        messageAr: `تم إغلاق النزاع #${id.slice(0, 8)}.${closeReason ? ' السبب: ' + closeReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_closed' }),
      }).catch(() => { });

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get dispute audit trail/transaction logs
  app.get("/api/admin/p2p/disputes/:id/logs", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const logs = await db.select()
        .from(p2pTransactionLogs)
        .where(eq(p2pTransactionLogs.disputeId, id))
        .orderBy(desc(p2pTransactionLogs.createdAt));

      // Enrich with user info
      const logsWithUsers = await Promise.all(logs.map(async (log) => {
        const user = log.userId ? await storage.getUser(log.userId) : null;
        return {
          ...log,
          username: user?.username || "System"
        };
      }));

      res.json(logsWithUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
