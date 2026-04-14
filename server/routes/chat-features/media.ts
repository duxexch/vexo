import type { Express, Response } from "express";
import { db } from "../../db";
import { chatMediaPermissions, projectCurrencyLedger, projectCurrencyWallets } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { uploadFile } from "../../lib/minio-client";
import crypto from "crypto";
import type { AuthRequest } from "../middleware";
import { storage } from "../../storage";
import { getErrorMessage, getConfigNumber, getConfigValue, checkRateLimit, normalizeMimeType, validateMagicBytes, type AuthMiddleware } from "./helpers";

const IMAGE_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_UPLOAD_MIME_TYPES = ["video/mp4", "video/webm"];
const VOICE_UPLOAD_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"];
const CHAT_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  ...VIDEO_UPLOAD_MIME_TYPES,
  ...VOICE_UPLOAD_MIME_TYPES,
];

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

      const currencySettings = await storage.getProjectCurrencySettings();
      const wallet = await storage.getOrCreateProjectCurrencyWallet(userId);
      const walletBalance = parseFloat(wallet.totalBalance || "0");

      const isEnabled = permission?.mediaEnabled && !permission.revokedAt &&
        (!permission.expiresAt || permission.expiresAt > new Date());

      res.json({
        mediaEnabled: isEnabled || false,
        systemEnabled: systemEnabled === "true",
        price,
        maxImageSize,
        maxVideoSize,
        userBalance: walletBalance,
        canAfford: walletBalance >= price,
        currencySymbol: currencySettings?.currencySymbol || "VEX",
        currencyName: currencySettings?.currencyName || "VEX Coin",
        allowedTypes: [...IMAGE_UPLOAD_MIME_TYPES, ...VIDEO_UPLOAD_MIME_TYPES],
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

      const currencySettings = await storage.getProjectCurrencySettings();
      if (!currencySettings?.isActive) {
        return res.status(400).json({ error: "Project currency is not enabled" });
      }

      let newBalance = 0;

      // Atomic purchase with project currency wallet debit + permission grant
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO project_currency_wallets (user_id)
          VALUES (${userId})
          ON CONFLICT (user_id) DO NOTHING
        `);

        const [wallet] = await tx.select()
          .from(projectCurrencyWallets)
          .where(eq(projectCurrencyWallets.userId, userId))
          .for('update');

        if (!wallet) {
          throw new Error("Project currency wallet not found");
        }

        let earnedBalance = parseFloat(wallet.earnedBalance || "0");
        let purchasedBalance = parseFloat(wallet.purchasedBalance || "0");
        const totalBalance = earnedBalance + purchasedBalance;
        if (totalBalance < price) {
          throw new Error("Insufficient project currency balance");
        }

        let remaining = price;
        if (earnedBalance >= remaining) {
          earnedBalance -= remaining;
          remaining = 0;
        } else {
          remaining -= earnedBalance;
          earnedBalance = 0;
          purchasedBalance -= remaining;
        }

        const balanceBefore = parseFloat(wallet.totalBalance || "0");
        const balanceAfter = earnedBalance + purchasedBalance;
        newBalance = balanceAfter;

        await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: earnedBalance.toFixed(2),
            purchasedBalance: purchasedBalance.toFixed(2),
            totalBalance: balanceAfter.toFixed(2),
            totalSpent: (parseFloat(wallet.totalSpent || "0") + price).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(projectCurrencyWallets.id, wallet.id));

        await tx.insert(projectCurrencyLedger).values({
          userId,
          walletId: wallet.id,
          type: "admin_adjustment",
          amount: (-price).toString(),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          referenceId: `chat_media_purchase:${userId}`,
          referenceType: "chat_media_purchase",
          description: "Purchased media permission for private chat",
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

      res.json({
        success: true,
        message: "Media permission purchased successfully",
        newBalance,
        currencySymbol: currencySettings.currencySymbol,
        currencyName: currencySettings.currencyName,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message.includes("Insufficient")) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  // Upload media file for chat
  app.post("/api/chat/media/upload", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      if (!checkRateLimit(`media_upload_${userId}`, 10, 60000)) {
        return res.status(429).json({ error: "Too many uploads. Please wait." });
      }

      const { data, mimeType, fileName, ticketId } = req.body;

      if (!data || !mimeType || !fileName) {
        return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });
      }

      const normalizedMimeType = normalizeMimeType(String(mimeType));
      const isVoiceUpload = VOICE_UPLOAD_MIME_TYPES.includes(normalizedMimeType);

      if (!CHAT_UPLOAD_MIME_TYPES.includes(normalizedMimeType)) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      if (!isVoiceUpload) {
        const [permission] = await db.select()
          .from(chatMediaPermissions)
          .where(eq(chatMediaPermissions.userId, userId));

        const isEnabled = permission?.mediaEnabled && !permission.revokedAt &&
          (!permission.expiresAt || permission.expiresAt > new Date());

        if (!isEnabled) {
          return res.status(403).json({ error: "Media permission required. Purchase to unlock." });
        }
      }

      const maxImageSize = await getConfigNumber("chat_media_max_image_size", 5242880);
      const maxVideoSize = await getConfigNumber("chat_media_max_video_size", 26214400);
      const maxAudioSize = await getConfigNumber("chat_media_max_audio_size", 10485760);

      const buffer = Buffer.from(data, 'base64');

      const isImage = IMAGE_UPLOAD_MIME_TYPES.includes(normalizedMimeType);
      const isVideo = VIDEO_UPLOAD_MIME_TYPES.includes(normalizedMimeType);
      const maxSize = isImage ? maxImageSize : isVideo ? maxVideoSize : maxAudioSize;
      if (buffer.length > maxSize) {
        return res.status(400).json({
          error: `File too large. Maximum: ${Math.round(maxSize / 1048576)}MB`
        });
      }

      if (!validateMagicBytes(buffer, normalizedMimeType)) {
        return res.status(400).json({ error: "File content doesn't match declared type" });
      }

      const ext = normalizedMimeType === "audio/ogg"
        ? "ogg"
        : normalizedMimeType.split('/')[1] || 'bin';
      const objectName = `chat-media/${userId}/${crypto.randomUUID()}.${ext}`;

      const mediaUrl = await uploadFile(objectName, buffer, normalizedMimeType);

      let thumbnailUrl = null;
      if (isImage && buffer.length > 100000) {
        thumbnailUrl = mediaUrl;
      }

      res.json({
        mediaUrl,
        thumbnailUrl: thumbnailUrl || mediaUrl,
        mediaSize: buffer.length,
        mediaMimeType: normalizedMimeType,
        mediaOriginalName: String(fileName).slice(0, 255),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
