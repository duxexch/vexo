import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pDisputeMessages,
  p2pDisputeEvidence,
  p2pTransactionLogs,
  p2pTrades,
  users,
} from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage, formatDispute } from "./helpers";

/** GET /api/p2p/disputes/:id — Get dispute details + messages + evidence + logs */
export function registerDetailsRoutes(app: Express) {

  app.get("/api/p2p/disputes/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;

      const initiator = alias(users, "initiator");
      const respondent = alias(users, "respondent");

      // 1. Get dispute with trade info
      const [row] = await db
        .select({
          dispute_id: p2pDisputes.id,
          trade_id: p2pDisputes.tradeId,
          initiator_id: p2pDisputes.initiatorId,
          initiator_name: initiator.username,
          respondent_id: p2pDisputes.respondentId,
          respondent_name: respondent.username,
          dispute_status: p2pDisputes.status,
          reason: p2pDisputes.reason,
          description: p2pDisputes.description,
          resolution: p2pDisputes.resolution,
          dispute_created_at: p2pDisputes.createdAt,
          trade_amount: p2pTrades.amount,
          fiat_amount: p2pTrades.fiatAmount,
          currency_type: p2pTrades.currencyType,
        })
        .from(p2pDisputes)
        .innerJoin(p2pTrades, eq(p2pDisputes.tradeId, p2pTrades.id))
        .innerJoin(initiator, eq(p2pDisputes.initiatorId, initiator.id))
        .innerJoin(respondent, eq(p2pDisputes.respondentId, respondent.id))
        .where(eq(p2pDisputes.id, disputeId))
        .limit(1);

      if (!row) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      // 2. Authorization: only parties or admin
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      if (row.initiator_id !== userId && row.respondent_id !== userId && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      // 3. Get messages with sender names
      const sender = alias(users, "sender");
      const messages = await db
        .select({
          id: p2pDisputeMessages.id,
          disputeId: p2pDisputeMessages.disputeId,
          senderId: p2pDisputeMessages.senderId,
          senderName: sender.username,
          message: p2pDisputeMessages.message,
          isPrewritten: p2pDisputeMessages.isPrewritten,
          isFromSupport: p2pDisputeMessages.isFromSupport,
          createdAt: p2pDisputeMessages.createdAt,
        })
        .from(p2pDisputeMessages)
        .innerJoin(sender, eq(p2pDisputeMessages.senderId, sender.id))
        .where(eq(p2pDisputeMessages.disputeId, disputeId))
        .orderBy(p2pDisputeMessages.createdAt);

      // 4. Get evidence with uploader names
      const uploader = alias(users, "uploader");
      const evidence = await db
        .select({
          id: p2pDisputeEvidence.id,
          disputeId: p2pDisputeEvidence.disputeId,
          uploaderId: p2pDisputeEvidence.uploaderId,
          uploaderName: uploader.username,
          fileName: p2pDisputeEvidence.fileName,
          fileUrl: p2pDisputeEvidence.fileUrl,
          fileType: p2pDisputeEvidence.fileType,
          fileSize: p2pDisputeEvidence.fileSize,
          description: p2pDisputeEvidence.description,
          evidenceType: p2pDisputeEvidence.evidenceType,
          isVerified: p2pDisputeEvidence.isVerified,
          createdAt: p2pDisputeEvidence.createdAt,
        })
        .from(p2pDisputeEvidence)
        .innerJoin(uploader, eq(p2pDisputeEvidence.uploaderId, uploader.id))
        .where(eq(p2pDisputeEvidence.disputeId, disputeId))
        .orderBy(p2pDisputeEvidence.createdAt);

      // 5. Get transaction logs for this dispute or trade
      const logs = await db
        .select({
          id: p2pTransactionLogs.id,
          tradeId: p2pTransactionLogs.tradeId,
          disputeId: p2pTransactionLogs.disputeId,
          userId: p2pTransactionLogs.userId,
          action: p2pTransactionLogs.action,
          description: p2pTransactionLogs.description,
          descriptionAr: p2pTransactionLogs.descriptionAr,
          createdAt: p2pTransactionLogs.createdAt,
        })
        .from(p2pTransactionLogs)
        .where(
          or(
            eq(p2pTransactionLogs.disputeId, disputeId),
            eq(p2pTransactionLogs.tradeId, row.trade_id),
          )
        )
        .orderBy(p2pTransactionLogs.createdAt);

      res.json({
        dispute: formatDispute(row),
        messages,
        evidence,
        logs,
      });
    } catch (error: unknown) {
      console.error("[P2P Disputes] GET /disputes/:id error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
