import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pDisputeMessages,
  p2pDisputeEvidence,
  p2pTransactionLogs,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendNotification } from "../../websocket";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

/** POST /api/p2p/disputes/:id/messages + POST /api/p2p/disputes/:id/evidence */
export function registerMessagesEvidenceRoutes(app: Express) {

  // ==================== POST /api/p2p/disputes/:id/messages ====================
  // Send a message in the dispute chat

  app.post("/api/p2p/disputes/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;
      const { message, isPrewritten, prewrittenTemplateId } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // 1. Validate dispute exists and user is a party
      const [dispute] = await db
        .select({
          id: p2pDisputes.id,
          initiatorId: p2pDisputes.initiatorId,
          respondentId: p2pDisputes.respondentId,
          tradeId: p2pDisputes.tradeId,
          status: p2pDisputes.status,
        })
        .from(p2pDisputes)
        .where(eq(p2pDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      if (dispute.initiatorId !== userId && dispute.respondentId !== userId && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (dispute.status === "resolved" || dispute.status === "closed") {
        return res.status(400).json({ error: "Cannot send messages on a resolved dispute" });
      }

      // 2. Insert the message (sanitize to prevent stored XSS)
      const safeMessage = message.trim().replace(/<[^>]*>/g, '').slice(0, 2000);
      const [newMessage] = await db
        .insert(p2pDisputeMessages)
        .values({
          disputeId,
          senderId: userId,
          message: safeMessage,
          isPrewritten: isPrewritten || false,
          prewrittenTemplateId: prewrittenTemplateId || null,
          isFromSupport: isAdmin,
        })
        .returning();

      // 3. Log it
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId,
        userId,
        action: "dispute_message",
        description: `Message sent by ${req.user!.username}`,
        descriptionAr: `تم إرسال رسالة بواسطة ${req.user!.username}`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      // Notify the other party about new dispute message
      const recipientId = dispute.initiatorId === userId ? dispute.respondentId : dispute.initiatorId;
      await sendNotification(recipientId, {
        type: 'p2p',
        priority: 'normal',
        title: 'New Dispute Message',
        titleAr: 'رسالة جديدة في النزاع',
        message: `${req.user!.username} sent a message in dispute #${disputeId.slice(0,8)}.`,
        messageAr: `أرسل ${req.user!.username} رسالة في النزاع #${disputeId.slice(0,8)}.`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_message' }),
      }).catch(() => {});

      res.status(201).json({
        ...newMessage,
        senderName: req.user!.username,
      });
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes/:id/messages error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== POST /api/p2p/disputes/:id/evidence ====================
  // Upload evidence for a dispute

  app.post("/api/p2p/disputes/:id/evidence", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;
      const { fileName, fileUrl, fileType, fileSize, description, evidenceType } = req.body;

      if (!fileName || !fileUrl || !fileType || !evidenceType) {
        return res.status(400).json({ error: "fileName, fileUrl, fileType, and evidenceType are required" });
      }

      // SECURITY: Validate fileUrl is a safe URL (no javascript: or data: schemes)
      const safeFileUrl = String(fileUrl).slice(0, 2000);
      if (!/^https?:\/\//.test(safeFileUrl)) {
        return res.status(400).json({ error: "Invalid file URL" });
      }
      // SECURITY: Block SSRF — reject internal/private IPs and hostnames
      try {
        const parsed = new URL(safeFileUrl);
        const hostname = parsed.hostname.toLowerCase();
        const isInternal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
          || hostname === '::1' || hostname === '[::1]'
          || hostname.endsWith('.local') || hostname.endsWith('.internal')
          || /^10\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
          || /^192\.168\./.test(hostname) || hostname === '169.254.169.254'
          || hostname.startsWith('metadata');
        if (isInternal) {
          return res.status(400).json({ error: "External URLs only" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid file URL" });
      }
      // Sanitize text inputs
      const safeFileName = String(fileName).replace(/<[^>]*>/g, '').slice(0, 255);
      const safeDescription = description ? String(description).replace(/<[^>]*>/g, '').slice(0, 1000) : null;
      const safeEvidenceType = String(evidenceType).replace(/<[^>]*>/g, '').slice(0, 50);
      const safeFileType = String(fileType).replace(/<[^>]*>/g, '').slice(0, 100);

      // 1. Validate dispute exists and user is party
      const [dispute] = await db
        .select({
          id: p2pDisputes.id,
          initiatorId: p2pDisputes.initiatorId,
          respondentId: p2pDisputes.respondentId,
          tradeId: p2pDisputes.tradeId,
          status: p2pDisputes.status,
        })
        .from(p2pDisputes)
        .where(eq(p2pDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      if (dispute.initiatorId !== userId && dispute.respondentId !== userId && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (dispute.status === "resolved" || dispute.status === "closed") {
        return res.status(400).json({ error: "Cannot upload evidence on a resolved dispute" });
      }

      // 2. Insert evidence
      const [evidence] = await db
        .insert(p2pDisputeEvidence)
        .values({
          disputeId,
          uploaderId: userId,
          fileName: safeFileName,
          fileUrl: safeFileUrl,
          fileType: safeFileType,
          fileSize: fileSize || 0,
          description: safeDescription,
          evidenceType: safeEvidenceType,
        })
        .returning();

      // 3. Log it
      await db.insert(p2pTransactionLogs).values({
        tradeId: dispute.tradeId,
        disputeId,
        userId,
        action: "evidence_uploaded",
        description: `Evidence uploaded by ${req.user!.username}: ${fileName} (${evidenceType})`,
        descriptionAr: `تم رفع إثبات بواسطة ${req.user!.username}: ${fileName} (${evidenceType})`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      res.status(201).json({
        ...evidence,
        uploaderName: req.user!.username,
      });
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes/:id/evidence error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
