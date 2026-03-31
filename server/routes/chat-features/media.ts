import type { Express, Response } from "express";
import { db } from "../../db";
import { users, chatMediaPermissions, transactions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { uploadFile } from "../../lib/minio-client";
import crypto from "crypto";
import type { AuthRequest } from "../middleware";
import { getErrorMessage, getConfigNumber, getConfigValue, checkRateLimit, validateMagicBytes, type AuthMiddleware } from "./helpers";

/** Media permission routes — status, purchase, upload */
export function registerMediaRoutes(app: Express, authMiddleware: AuthMiddleware): void {

  // Check media permission status for current user
  app.get("/api/chat/media/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      const [permission] = await db.select()
        .from(chatMediaPermissions)
        .where(eq(chatMediaPermissions.userId, userId));
      
      const price = await getConfigNumber("chat_media_price", 100);
      const maxImageSize = await getConfigNumber("chat_media_max_image_size", 5242880);
      const maxVideoSize = await getConfigNumber("chat_media_max_video_size", 26214400);
      const systemEnabled = await getConfigValue("chat_media_enabled", "true");

      const [user] = await db.select({ balance: users.balance })
        .from(users).where(eq(users.id, userId));

      const isEnabled = permission?.mediaEnabled && !permission.revokedAt && 
        (!permission.expiresAt || permission.expiresAt > new Date());

      res.json({
        mediaEnabled: isEnabled || false,
        systemEnabled: systemEnabled === "true",
        price,
        maxImageSize,
        maxVideoSize,
        userBalance: parseFloat(user?.balance || "0"),
        canAfford: parseFloat(user?.balance || "0") >= price,
        allowedTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"],
        grantedBy: permission?.grantedBy,
        expiresAt: permission?.expiresAt,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Purchase media permission
  app.post("/api/chat/media/purchase", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      if (!checkRateLimit(`media_purchase_${userId}`, 3, 3600000)) {
        return res.status(429).json({ error: "Too many purchase attempts. Please try again later." });
      }

      const price = await getConfigNumber("chat_media_price", 100);
      const systemEnabled = await getConfigValue("chat_media_enabled", "true");

      if (systemEnabled !== "true") {
        return res.status(400).json({ error: "Media feature is currently disabled" });
      }

      const [existing] = await db.select()
        .from(chatMediaPermissions)
        .where(eq(chatMediaPermissions.userId, userId));

      if (existing?.mediaEnabled && !existing.revokedAt) {
        return res.status(400).json({ error: "You already have media permission" });
      }

      // SECURITY: Atomic purchase with transaction + row lock to prevent double-spend
      await db.transaction(async (tx) => {
        const [user] = await tx.select({ balance: users.balance })
          .from(users).where(eq(users.id, userId)).for('update');

        const balBefore = parseFloat(user?.balance || "0");
        if (balBefore < price) {
          throw new Error("Insufficient balance");
        }

        await tx.update(users)
          .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) - ${price})::text` })
          .where(eq(users.id, userId));

        await tx.insert(transactions).values({
          userId,
          type: "commission",
          amount: (-price).toString(),
          balanceBefore: balBefore.toString(),
          balanceAfter: (balBefore - price).toString(),
          status: "completed",
          description: "شراء ميزة إرسال الصور والفيديوهات في الدردشة",
          referenceId: `chat_media_${userId}`,
        });

        if (existing) {
          await tx.update(chatMediaPermissions).set({
            mediaEnabled: true,
            grantedBy: "purchase",
            grantedAt: new Date(),
            pricePaid: price.toString(),
            revokedAt: null,
            revokedBy: null,
          }).where(eq(chatMediaPermissions.userId, userId));
        } else {
          await tx.insert(chatMediaPermissions).values({
            userId,
            mediaEnabled: true,
            grantedBy: "purchase",
            pricePaid: price.toString(),
          });
        }
      });

      res.json({ success: true, message: "Media permission purchased successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Upload media file for chat
  app.post("/api/chat/media/upload", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      if (!checkRateLimit(`media_upload_${userId}`, 10, 60000)) {
        return res.status(429).json({ error: "Too many uploads. Please wait." });
      }

      const [permission] = await db.select()
        .from(chatMediaPermissions)
        .where(eq(chatMediaPermissions.userId, userId));

      const isEnabled = permission?.mediaEnabled && !permission.revokedAt &&
        (!permission.expiresAt || permission.expiresAt > new Date());

      if (!isEnabled) {
        return res.status(403).json({ error: "Media permission required. Purchase to unlock." });
      }

      const { data, mimeType, fileName, ticketId } = req.body;

      if (!data || !mimeType || !fileName) {
        return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      const maxImageSize = await getConfigNumber("chat_media_max_image_size", 5242880);
      const maxVideoSize = await getConfigNumber("chat_media_max_video_size", 26214400);

      const buffer = Buffer.from(data, 'base64');

      const isImage = mimeType.startsWith("image/");
      const maxSize = isImage ? maxImageSize : maxVideoSize;
      if (buffer.length > maxSize) {
        return res.status(400).json({ 
          error: `File too large. Maximum: ${Math.round(maxSize / 1048576)}MB` 
        });
      }

      if (!validateMagicBytes(buffer, mimeType)) {
        return res.status(400).json({ error: "File content doesn't match declared type" });
      }

      const ext = mimeType.split('/')[1] || 'bin';
      const objectName = `chat-media/${userId}/${crypto.randomUUID()}.${ext}`;

      const mediaUrl = await uploadFile(objectName, buffer, mimeType);

      let thumbnailUrl = null;
      if (isImage && buffer.length > 100000) {
        thumbnailUrl = mediaUrl;
      }

      res.json({
        mediaUrl,
        thumbnailUrl: thumbnailUrl || mediaUrl,
        mediaSize: buffer.length,
        mediaMimeType: mimeType,
        mediaOriginalName: String(fileName).slice(0, 255),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
