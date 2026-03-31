import type { Express, Response } from "express";
import { db } from "../../db";
import { users, chatAutoDeletePermissions, chatMessages, transactions } from "@shared/schema";
import { eq, and, lt, isNotNull, sql } from "drizzle-orm";
import { deleteFile } from "../../lib/minio-client";
import { logger } from "../../lib/logger";
import type { AuthRequest } from "../middleware";
import { getErrorMessage, getConfigNumber, getConfigValue, checkRateLimit, type AuthMiddleware } from "./helpers";

/** Auto-delete permission routes — status, purchase, settings + cleanup cron */
export function registerAutoDeleteRoutes(app: Express, authMiddleware: AuthMiddleware): void {

  // Check auto-delete permission status
  app.get("/api/chat/auto-delete/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [permission] = await db.select()
        .from(chatAutoDeletePermissions)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      const price = await getConfigNumber("chat_auto_delete_price", 50);
      const systemEnabled = await getConfigValue("chat_auto_delete_enabled", "true");

      const [user] = await db.select({ balance: users.balance })
        .from(users).where(eq(users.id, userId));

      const isEnabled = permission?.autoDeleteEnabled && !permission.revokedAt &&
        (!permission.expiresAt || permission.expiresAt > new Date());

      res.json({
        autoDeleteEnabled: isEnabled || false,
        systemEnabled: systemEnabled === "true",
        deleteAfterMinutes: permission?.deleteAfterMinutes || 60,
        price,
        userBalance: parseFloat(user?.balance || "0"),
        canAfford: parseFloat(user?.balance || "0") >= price,
        availableIntervals: [1, 5, 15, 30, 60, 1440],
        grantedBy: permission?.grantedBy,
        expiresAt: permission?.expiresAt,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Purchase auto-delete permission
  app.post("/api/chat/auto-delete/purchase", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      if (!checkRateLimit(`auto_del_purchase_${userId}`, 3, 3600000)) {
        return res.status(429).json({ error: "Too many purchase attempts" });
      }

      const price = await getConfigNumber("chat_auto_delete_price", 50);
      const systemEnabled = await getConfigValue("chat_auto_delete_enabled", "true");

      if (systemEnabled !== "true") {
        return res.status(400).json({ error: "Auto-delete feature is currently disabled" });
      }

      const [existing] = await db.select()
        .from(chatAutoDeletePermissions)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      if (existing?.autoDeleteEnabled && !existing.revokedAt) {
        return res.status(400).json({ error: "You already have auto-delete permission" });
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
          description: "شراء ميزة المسح التلقائي للرسائل",
          referenceId: `chat_auto_delete_${userId}`,
        });

        if (existing) {
          await tx.update(chatAutoDeletePermissions).set({
            autoDeleteEnabled: true,
            grantedBy: "purchase",
            grantedAt: new Date(),
            pricePaid: price.toString(),
            revokedAt: null,
            revokedBy: null,
          }).where(eq(chatAutoDeletePermissions.userId, userId));
        } else {
          await tx.insert(chatAutoDeletePermissions).values({
            userId,
            autoDeleteEnabled: true,
            grantedBy: "purchase",
            pricePaid: price.toString(),
          });
        }
      });

      res.json({ success: true, message: "Auto-delete permission purchased successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update auto-delete settings (interval)
  app.put("/api/chat/auto-delete/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { deleteAfterMinutes, enabled } = req.body;

      const validIntervals = [1, 5, 15, 30, 60, 1440];
      if (deleteAfterMinutes && !validIntervals.includes(deleteAfterMinutes)) {
        return res.status(400).json({ error: "Invalid interval", validIntervals });
      }

      const [permission] = await db.select()
        .from(chatAutoDeletePermissions)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      if (!permission || !permission.autoDeleteEnabled || permission.revokedAt) {
        return res.status(403).json({ error: "Auto-delete permission required" });
      }

      const updateData: Record<string, unknown> = {};
      if (deleteAfterMinutes !== undefined) updateData.deleteAfterMinutes = deleteAfterMinutes;
      if (enabled !== undefined) updateData.autoDeleteEnabled = enabled;

      await db.update(chatAutoDeletePermissions)
        .set(updateData)
        .where(eq(chatAutoDeletePermissions.userId, userId));

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Auto-delete cron job — runs every 60 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      
      const expiredMessages = await db.select({
        id: chatMessages.id,
        mediaUrl: chatMessages.mediaUrl,
      }).from(chatMessages)
        .where(and(
          isNotNull(chatMessages.autoDeleteAt),
          lt(chatMessages.autoDeleteAt, now),
        ))
        .limit(100);

      if (expiredMessages.length === 0) return;

      for (const msg of expiredMessages) {
        if (msg.mediaUrl) {
          try {
            const objectName = msg.mediaUrl.replace('/storage/', '');
            await deleteFile(objectName);
          } catch (err) {
            // Continue even if file deletion fails
          }
        }
      }

      const idsToDelete = expiredMessages.map(m => m.id);
      await db.execute(sql`
        DELETE FROM chat_messages WHERE id = ANY(${idsToDelete})
      `);

    } catch (error) {
      logger.error('[Auto-Delete] Error cleaning expired messages', error instanceof Error ? error : new Error(String(error)));
    }
  }, 60000);
}
