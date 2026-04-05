import type { Express, Response } from "express";
import fs from "fs";
import path from "path";
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
import { sanitizeNullablePlainText, sanitizePlainText } from "../../lib/input-security";
import { ensureP2PUsername } from "../../lib/p2p-username";

/** POST /api/p2p/disputes/:id/messages + POST /api/p2p/disputes/:id/evidence */
export function registerMessagesEvidenceRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Disputes] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

  const allowedEvidenceTypes = new Set(['screenshot', 'video', 'document', 'other']);
  const maxEvidenceSizeBytes = 10 * 1024 * 1024;
  const allowedMimeByExt: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".pdf": "application/pdf",
  };

  function parseAndValidateEvidenceUrl(rawFileUrl: string): { normalizedPath: string; fileName: string } | null {
    const trimmed = String(rawFileUrl || "").trim();
    if (!trimmed) return null;

    const asRelativePath = (candidate: string): { normalizedPath: string; fileName: string } | null => {
      if (!(candidate.startsWith('/uploads/') || candidate.startsWith('/storage/'))) return null;
      if (candidate.includes('..')) return null;
      const fileName = path.posix.basename(candidate);
      if (!fileName || fileName.includes('/') || fileName.includes('\\')) return null;
      return { normalizedPath: candidate, fileName };
    };

    if (trimmed.startsWith('/')) {
      return asRelativePath(trimmed);
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return asRelativePath(parsed.pathname);
    } catch {
      return null;
    }
  }

  // ==================== POST /api/p2p/disputes/:id/messages ====================
  // Send a message in the dispute chat

  app.post("/api/p2p/disputes/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeId = req.params.id;
      const { message, isPrewritten, prewrittenTemplateId } = req.body;
      const senderP2PUsername = await ensureP2PUsername(userId, req.user!.username);

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
      const safeMessage = sanitizePlainText(message, { maxLength: 2000 });
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
        description: `Message sent by ${senderP2PUsername}`,
        descriptionAr: `تم إرسال رسالة بواسطة ${senderP2PUsername}`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      // Notify the other party about new dispute message
      const recipientId = dispute.initiatorId === userId ? dispute.respondentId : dispute.initiatorId;
      await notifyWithLog(recipientId, {
        type: 'p2p',
        priority: 'normal',
        title: 'New Dispute Message',
        titleAr: 'رسالة جديدة في النزاع',
        message: `${senderP2PUsername} sent a message in dispute #${disputeId.slice(0, 8)}.`,
        messageAr: `أرسل ${senderP2PUsername} رسالة في النزاع #${disputeId.slice(0, 8)}.`,
        link: '/p2p/disputes',
        metadata: JSON.stringify({ disputeId, action: 'dispute_message' }),
      }, "dispute-message");

      res.status(201).json({
        ...newMessage,
        senderName: senderP2PUsername,
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
      const uploaderP2PUsername = await ensureP2PUsername(userId, req.user!.username);

      if (!fileName || !fileUrl || !fileType || !evidenceType) {
        return res.status(400).json({ error: "fileName, fileUrl, fileType, and evidenceType are required" });
      }

      const safeFileUrl = String(fileUrl).slice(0, 2000);
      const parsedEvidenceUrl = parseAndValidateEvidenceUrl(safeFileUrl);
      if (!parsedEvidenceUrl) {
        return res.status(400).json({ error: "Invalid evidence URL. Use uploaded files only." });
      }

      // Sanitize text inputs
      const safeFileName = sanitizePlainText(fileName, { maxLength: 255 });
      const safeDescription = sanitizeNullablePlainText(description, 1000);
      const safeEvidenceType = sanitizePlainText(evidenceType, { maxLength: 50 });
      const safeFileType = sanitizePlainText(fileType, { maxLength: 100 });
      const ext = path.extname(parsedEvidenceUrl.fileName).toLowerCase();
      const inferredMime = allowedMimeByExt[ext] || "";
      const normalizedMime = inferredMime || safeFileType.toLowerCase();
      let validatedFileSize = Number(fileSize || 0);

      if (parsedEvidenceUrl.normalizedPath.startsWith('/uploads/')) {
        const localUploadsPath = path.join(process.cwd(), 'uploads', parsedEvidenceUrl.fileName);
        if (!fs.existsSync(localUploadsPath)) {
          return res.status(400).json({ error: "Uploaded evidence file not found" });
        }
        const stat = fs.statSync(localUploadsPath);
        validatedFileSize = stat.size;
      }

      const isAllowedMime = normalizedMime.startsWith('image/') || normalizedMime.startsWith('video/') || normalizedMime === 'application/pdf';
      if (!isAllowedMime) {
        return res.status(400).json({ error: 'Unsupported evidence file type' });
      }

      if (!Number.isFinite(validatedFileSize) || validatedFileSize <= 0 || validatedFileSize > maxEvidenceSizeBytes) {
        return res.status(400).json({ error: 'Evidence file size must be between 1 byte and 10MB' });
      }

      if (!allowedEvidenceTypes.has(safeEvidenceType)) {
        return res.status(400).json({ error: 'Invalid evidence type' });
      }

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
          fileUrl: parsedEvidenceUrl.normalizedPath,
          fileType: normalizedMime,
          fileSize: validatedFileSize,
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
        description: `Evidence uploaded by ${uploaderP2PUsername}: ${fileName} (${evidenceType})`,
        descriptionAr: `تم رفع إثبات بواسطة ${uploaderP2PUsername}: ${fileName} (${evidenceType})`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      });

      res.status(201).json({
        ...evidence,
        uploaderName: uploaderP2PUsername,
      });
    } catch (error: unknown) {
      console.error("[P2P Disputes] POST /disputes/:id/evidence error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
