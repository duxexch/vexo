import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pDisputeEvidence,
  p2pDisputeMessages,
  p2pDisputes,
  p2pTrades,
  p2pTransactionLogs,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { emitDisputeAlert } from "../../lib/admin-alerts";
import { db } from "../../db";
import { and, desc, eq, or } from "drizzle-orm";
import {
  type AdminRequest,
  adminAuthMiddleware,
  createHttpError,
  getErrorMessage,
  logAdminAction,
  resolveErrorStatus,
} from "../helpers";
import { sanitizeNullablePlainText } from "../../lib/input-security";

export function registerDisputeActionRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[Admin P2P] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

  app.post("/api/admin/p2p/disputes/:id/resolve", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { resolution, winnerId } = req.body;

      const resolutionMessage = typeof resolution === 'string' && resolution.trim().length > 0
        ? resolution
        : 'Resolved by admin';

      // CRITICAL: every check below MUST throw on failure, not return a
      // `{ success: false }` envelope. A Drizzle transaction callback that
      // returns normally commits whatever ran before the return; only a
      // throw triggers rollback. Today most pre-mutation guards are safe in
      // isolation, but the storage settlement call mutates external state
      // and the WHERE-guarded dispute update could be followed by additional
      // mutations in future edits — throwing keeps the route atomic by
      // construction.
      const outcome = await db.transaction(async (tx) => {
        const [dispute] = await tx
          .select()
          .from(p2pDisputes)
          .where(eq(p2pDisputes.id, id))
          .limit(1)
          .for("update");

        if (!dispute) {
          throw createHttpError(404, "Dispute not found");
        }

        if (dispute.status === 'resolved' || dispute.status === 'closed') {
          throw createHttpError(400, "Dispute is already resolved");
        }

        if (!winnerId || (winnerId !== dispute.initiatorId && winnerId !== dispute.respondentId)) {
          throw createHttpError(400, "winnerId must be dispute initiator or respondent");
        }

        const [trade] = await tx
          .select({ id: p2pTrades.id, currencyType: p2pTrades.currencyType })
          .from(p2pTrades)
          .where(eq(p2pTrades.id, dispute.tradeId))
          .limit(1);

        if (!trade) {
          throw createHttpError(404, "Related trade not found");
        }

        const settlementResult = trade.currencyType === 'project'
          ? await storage.resolveP2PDisputedTradeProjectCurrencyAtomic(dispute.tradeId, winnerId, resolutionMessage)
          : await storage.resolveP2PDisputedTradeAtomic(dispute.tradeId, winnerId, resolutionMessage);

        if (!settlementResult.success) {
          throw createHttpError(400, settlementResult.error || "Failed to settle disputed trade");
        }

        const [updated] = await tx.update(p2pDisputes)
          .set({
            status: "resolved",
            resolution: resolutionMessage,
            resolvedBy: req.admin!.id,
            winnerUserId: winnerId,
            resolvedAt: new Date(),
            updatedAt: new Date()
          })
          .where(and(
            eq(p2pDisputes.id, id),
            or(eq(p2pDisputes.status, "open"), eq(p2pDisputes.status, "investigating")),
          ))
          .returning();

        if (!updated) {
          throw createHttpError(409, "Dispute was updated by another moderator. Please refresh.");
        }

        // Log the action to transaction logs
        await tx.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId: id,
          userId: req.admin!.id,
          action: "dispute_resolved",
          description: `Dispute resolved by admin. Winner: ${winnerId}. Resolution: ${resolutionMessage}`,
          metadata: JSON.stringify({ winnerId, resolution: resolutionMessage, adminId: req.admin!.id })
        });

        return {
          dispute,
          updated,
          resolutionMessage,
        };
      });

      const dispute = outcome.dispute;
      const updated = outcome.updated;
      const resolvedMessage = outcome.resolutionMessage;

      await logAdminAction(req.admin!.id, "p2p_dispute_resolve", "p2p_dispute", id, {
        reason: resolvedMessage,
        newValue: winnerId
      }, req);

      // Emit admin alert for dispute resolution
      await emitDisputeAlert({
        disputeId: id,
        tradeId: dispute.tradeId,
        isNew: false,
        severity: "info",
        message: `Dispute resolved by ${req.admin!.username}. Resolution: ${resolvedMessage}`
      });

      // Notify both dispute parties about admin resolution
      await notifyWithLog(dispute.initiatorId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${id.slice(0, 8)} has been resolved by admin.${resolvedMessage ? ' ' + resolvedMessage : ''}`,
        messageAr: `تم حل النزاع #${id.slice(0, 8)} بواسطة الإدارة.${resolvedMessage ? ' ' + resolvedMessage : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'admin_dispute_resolved', winnerId }),
      }, "resolve:initiator");
      await notifyWithLog(dispute.respondentId, {
        type: 'system',
        priority: 'high',
        title: 'Dispute Resolved by Admin',
        titleAr: 'تم حل النزاع بواسطة الإدارة',
        message: `Dispute #${id.slice(0, 8)} has been resolved by admin.${resolvedMessage ? ' ' + resolvedMessage : ''}`,
        messageAr: `تم حل النزاع #${id.slice(0, 8)} بواسطة الإدارة.${resolvedMessage ? ' ' + resolvedMessage : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'admin_dispute_resolved', winnerId }),
      }, "resolve:respondent");

      res.json(updated);
    } catch (error: unknown) {
      // Errors thrown from inside `db.transaction` propagate here AFTER the
      // transaction has rolled back; `resolveErrorStatus` translates the
      // attached `statusCode` into the right 4xx/5xx response.
      res.status(resolveErrorStatus(error)).json({ error: getErrorMessage(error) });
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
      await notifyWithLog(dispute.initiatorId, {
        type: 'p2p',
        priority: 'high',
        title: 'Dispute Under Investigation',
        titleAr: 'النزاع قيد التحقيق',
        message: `Dispute #${id.slice(0, 8)} has been escalated for investigation.${escalateReason ? ' Reason: ' + escalateReason : ''}`,
        messageAr: `تم تصعيد النزاع #${id.slice(0, 8)} للتحقيق.${escalateReason ? ' السبب: ' + escalateReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_escalated' }),
      }, "escalate:initiator");
      await notifyWithLog(dispute.respondentId, {
        type: 'p2p',
        priority: 'high',
        title: 'Dispute Under Investigation',
        titleAr: 'النزاع قيد التحقيق',
        message: `Dispute #${id.slice(0, 8)} has been escalated for investigation.${escalateReason ? ' Reason: ' + escalateReason : ''}`,
        messageAr: `تم تصعيد النزاع #${id.slice(0, 8)} للتحقيق.${escalateReason ? ' السبب: ' + escalateReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_escalated' }),
      }, "escalate:respondent");

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
      await notifyWithLog(dispute.initiatorId, {
        type: 'p2p',
        priority: 'normal',
        title: 'Dispute Closed',
        titleAr: 'تم إغلاق النزاع',
        message: `Dispute #${id.slice(0, 8)} has been closed.${closeReason ? ' Reason: ' + closeReason : ''}`,
        messageAr: `تم إغلاق النزاع #${id.slice(0, 8)}.${closeReason ? ' السبب: ' + closeReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_closed' }),
      }, "close:initiator");
      await notifyWithLog(dispute.respondentId, {
        type: 'p2p',
        priority: 'normal',
        title: 'Dispute Closed',
        titleAr: 'تم إغلاق النزاع',
        message: `Dispute #${id.slice(0, 8)} has been closed.${closeReason ? ' Reason: ' + closeReason : ''}`,
        messageAr: `تم إغلاق النزاع #${id.slice(0, 8)}.${closeReason ? ' السبب: ' + closeReason : ''}`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId: id, action: 'dispute_closed' }),
      }, "close:respondent");

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Verify or unverify dispute evidence
  app.post("/api/admin/p2p/disputes/:id/evidence/:evidenceId/verify", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id, evidenceId } = req.params;
      const requestedVerification = req.body?.isVerified;
      const isVerified = typeof requestedVerification === 'boolean' ? requestedVerification : true;
      const note = sanitizeNullablePlainText(req.body?.note, 1000);

      // CRITICAL: throw on failure inside the callback — see the matching
      // comment on the /resolve route. Even though every guard below runs
      // before any mutation today, the no-op early-success path
      // (`alreadyInRequestedState`) and the verify+log pair share the same
      // transaction, so future edits adding mutations before a guard would
      // silently commit them if we returned an envelope instead of throwing.
      const outcome = await db.transaction(async (tx) => {
        const [dispute] = await tx
          .select({
            id: p2pDisputes.id,
            tradeId: p2pDisputes.tradeId,
            status: p2pDisputes.status,
            initiatorId: p2pDisputes.initiatorId,
            respondentId: p2pDisputes.respondentId,
          })
          .from(p2pDisputes)
          .where(eq(p2pDisputes.id, id))
          .limit(1)
          .for("update");

        if (!dispute) {
          throw createHttpError(404, "Dispute not found");
        }

        if (dispute.status === "resolved" || dispute.status === "closed") {
          throw createHttpError(400, "Cannot verify evidence for a resolved dispute");
        }

        const [evidence] = await tx
          .select()
          .from(p2pDisputeEvidence)
          .where(and(
            eq(p2pDisputeEvidence.id, evidenceId),
            eq(p2pDisputeEvidence.disputeId, id),
          ))
          .limit(1)
          .for("update");

        if (!evidence) {
          throw createHttpError(404, "Evidence not found for this dispute");
        }

        const alreadyInRequestedState = Boolean(evidence.isVerified) === isVerified;
        if (alreadyInRequestedState) {
          // Idempotent no-op: nothing has been mutated, returning is safe.
          // Committing an empty transaction is fine.
          return {
            dispute,
            evidence,
            changed: false,
          };
        }

        const [updatedEvidence] = await tx
          .update(p2pDisputeEvidence)
          .set({
            isVerified,
            verifiedBy: isVerified ? req.admin!.id : null,
            verifiedAt: isVerified ? new Date() : null,
          })
          .where(eq(p2pDisputeEvidence.id, evidenceId))
          .returning();

        await tx.insert(p2pTransactionLogs).values({
          tradeId: dispute.tradeId,
          disputeId: id,
          userId: req.admin!.id,
          action: "dispute_message",
          description: isVerified
            ? `Admin verified evidence ${evidenceId}.${note ? ` Note: ${note}` : ""}`
            : `Admin removed verification from evidence ${evidenceId}.${note ? ` Note: ${note}` : ""}`,
          descriptionAr: isVerified
            ? `قام المشرف بتأكيد دليل ${evidenceId}.${note ? ` ملاحظة: ${note}` : ""}`
            : `قام المشرف بإلغاء تأكيد الدليل ${evidenceId}.${note ? ` ملاحظة: ${note}` : ""}`,
          metadata: JSON.stringify({
            eventType: isVerified ? "evidence_verified" : "evidence_unverified",
            evidenceId,
            note,
          }),
        });

        return {
          dispute,
          evidence: updatedEvidence,
          changed: true,
        };
      });

      const dispute = outcome.dispute;
      const evidence = outcome.evidence;

      if (outcome.changed) {
        await logAdminAction(req.admin!.id, "p2p_dispute_evidence_verify", "p2p_dispute_evidence", evidenceId, {
          previousValue: isVerified ? "unverified" : "verified",
          newValue: isVerified ? "verified" : "unverified",
          reason: note || undefined,
          metadata: JSON.stringify({ disputeId: id }),
        }, req);

        await notifyWithLog(dispute.initiatorId, {
          type: 'p2p',
          priority: 'normal',
          title: isVerified ? 'Evidence Verified by Admin' : 'Evidence Verification Updated',
          titleAr: isVerified ? 'تم تأكيد الدليل بواسطة الإدارة' : 'تم تحديث حالة التحقق من الدليل',
          message: isVerified
            ? `Evidence in dispute #${id.slice(0, 8)} was verified by admin.${note ? ` Note: ${note}` : ''}`
            : `Evidence in dispute #${id.slice(0, 8)} was marked as unverified by admin.${note ? ` Note: ${note}` : ''}`,
          messageAr: isVerified
            ? `تم تأكيد دليل في النزاع #${id.slice(0, 8)} بواسطة الإدارة.${note ? ` ملاحظة: ${note}` : ''}`
            : `تم إلغاء تأكيد دليل في النزاع #${id.slice(0, 8)} بواسطة الإدارة.${note ? ` ملاحظة: ${note}` : ''}`,
          link: '/p2p/disputes',
          metadata: JSON.stringify({ disputeId: id, evidenceId, action: isVerified ? 'evidence_verified' : 'evidence_unverified' }),
        }, "evidence-verify:initiator");

        await notifyWithLog(dispute.respondentId, {
          type: 'p2p',
          priority: 'normal',
          title: isVerified ? 'Evidence Verified by Admin' : 'Evidence Verification Updated',
          titleAr: isVerified ? 'تم تأكيد الدليل بواسطة الإدارة' : 'تم تحديث حالة التحقق من الدليل',
          message: isVerified
            ? `Evidence in dispute #${id.slice(0, 8)} was verified by admin.${note ? ` Note: ${note}` : ''}`
            : `Evidence in dispute #${id.slice(0, 8)} was marked as unverified by admin.${note ? ` Note: ${note}` : ''}`,
          messageAr: isVerified
            ? `تم تأكيد دليل في النزاع #${id.slice(0, 8)} بواسطة الإدارة.${note ? ` ملاحظة: ${note}` : ''}`
            : `تم إلغاء تأكيد دليل في النزاع #${id.slice(0, 8)} بواسطة الإدارة.${note ? ` ملاحظة: ${note}` : ''}`,
          link: '/p2p/disputes',
          metadata: JSON.stringify({ disputeId: id, evidenceId, action: isVerified ? 'evidence_verified' : 'evidence_unverified' }),
        }, "evidence-verify:respondent");
      }

      res.json({
        success: true,
        changed: outcome.changed,
        evidence,
      });
    } catch (error: unknown) {
      // Errors thrown from inside `db.transaction` propagate here AFTER the
      // transaction has rolled back; `resolveErrorStatus` translates the
      // attached `statusCode` into the right 4xx/5xx response.
      res.status(resolveErrorStatus(error)).json({ error: getErrorMessage(error) });
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

  // Get dispute details for admin review (messages, evidence, and logs)
  app.get("/api/admin/p2p/disputes/:id/details", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [dispute] = await db
        .select()
        .from(p2pDisputes)
        .where(eq(p2pDisputes.id, id))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      const [trade] = await db
        .select()
        .from(p2pTrades)
        .where(eq(p2pTrades.id, dispute.tradeId))
        .limit(1);

      const [messages, evidenceRows, logs] = await Promise.all([
        db.select()
          .from(p2pDisputeMessages)
          .where(eq(p2pDisputeMessages.disputeId, id))
          .orderBy(p2pDisputeMessages.createdAt),
        db.select()
          .from(p2pDisputeEvidence)
          .where(eq(p2pDisputeEvidence.disputeId, id))
          .orderBy(p2pDisputeEvidence.createdAt),
        db.select()
          .from(p2pTransactionLogs)
          .where(eq(p2pTransactionLogs.disputeId, id))
          .orderBy(desc(p2pTransactionLogs.createdAt)),
      ]);

      const participantIds = new Set<string>();
      participantIds.add(dispute.initiatorId);
      participantIds.add(dispute.respondentId);

      for (const message of messages) {
        participantIds.add(message.senderId);
      }

      for (const evidence of evidenceRows) {
        participantIds.add(evidence.uploaderId);
        if (evidence.verifiedBy) {
          participantIds.add(evidence.verifiedBy);
        }
      }

      for (const log of logs) {
        if (log.userId) {
          participantIds.add(log.userId);
        }
      }

      const userIdList = Array.from(participantIds).filter(Boolean);
      const userMap = new Map<string, { id: string; username: string }>();

      const users = await Promise.all(userIdList.map(async (userId) => storage.getUser(userId)));
      for (const user of users) {
        if (user) {
          userMap.set(user.id, { id: user.id, username: user.username });
        }
      }

      const response = {
        dispute: {
          ...dispute,
          initiatorName: userMap.get(dispute.initiatorId)?.username || "Unknown",
          respondentName: userMap.get(dispute.respondentId)?.username || "Unknown",
          tradeAmount: trade?.amount || "0",
          fiatAmount: trade?.fiatAmount || "0",
          currencyType: trade?.currencyType || "usd",
        },
        messages: messages.map((message) => ({
          ...message,
          senderName: userMap.get(message.senderId)?.username || "Unknown",
        })),
        evidence: evidenceRows.map((evidence) => ({
          ...evidence,
          uploaderName: userMap.get(evidence.uploaderId)?.username || "Unknown",
          verifiedByName: evidence.verifiedBy ? userMap.get(evidence.verifiedBy)?.username || "Unknown" : null,
        })),
        logs: logs.map((log) => ({
          ...log,
          username: log.userId ? userMap.get(log.userId)?.username || "System" : "System",
        })),
      };

      res.json(response);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
