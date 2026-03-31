import type { Express, Response } from "express";
import { chatMediaPermissions, chatAutoDeletePermissions, users } from "@shared/schema";
import { db } from "../db";
import { eq, or, like, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminChatPinRoutes(app: Express) {

  // Admin reset user's chat PIN
  app.post("/api/admin/chat-pin/reset/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      await db.update(users).set({
        chatPinHash: null,
        chatPinEnabled: false,
        chatPinFailedAttempts: 0,
        chatPinLockedUntil: null,
        chatPinSetAt: null,
      }).where(eq(users.id, userId));

      // Notify user
      try {
        const { sendNotification } = await import("../websocket");
        sendNotification(userId, {
          type: "system",
          title: "تم إعادة تعيين رقم PIN",
          message: "تم إعادة تعيين رقم PIN الخاص بالدردشة بواسطة المسؤول.",
        });
      } catch {}

      await logAdminAction(req.admin!.id, "update", "chat_pin_reset", userId, { metadata: "reset_pin" }, req);

      res.json({ success: true, message: "PIN reset successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Search users for granting features
  app.get("/api/admin/chat-features/search-users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { search } = req.query;
      if (!search || String(search).length < 2) {
        return res.json({ users: [] });
      }

      const searchTerm = `%${String(search).toLowerCase()}%`;
      const result = await db.select({
        id: users.id,
        username: users.username,
        accountId: users.accountId,
        profilePicture: users.profilePicture,
      }).from(users)
        .where(or(
          like(sql`LOWER(${users.username})`, searchTerm),
          like(sql`LOWER(${users.accountId})`, searchTerm)
        ))
        .limit(20);

      // Get media & auto-delete status for each user
      const enriched = await Promise.all(result.map(async (u) => {
        const [media] = await db.select({ mediaEnabled: chatMediaPermissions.mediaEnabled })
          .from(chatMediaPermissions).where(eq(chatMediaPermissions.userId, u.id));
        const [autoDel] = await db.select({ autoDeleteEnabled: chatAutoDeletePermissions.autoDeleteEnabled })
          .from(chatAutoDeletePermissions).where(eq(chatAutoDeletePermissions.userId, u.id));
        const [pinStatus] = await db.select({ chatPinEnabled: users.chatPinEnabled })
          .from(users).where(eq(users.id, u.id));
        
        return {
          ...u,
          mediaEnabled: media?.mediaEnabled || false,
          autoDeleteEnabled: autoDel?.autoDeleteEnabled || false,
          pinEnabled: pinStatus?.chatPinEnabled || false,
        };
      }));

      res.json({ users: enriched });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
