import type { Express, Response } from "express";
import { chatMediaPermissions, chatAutoDeletePermissions, users } from "@shared/schema";
import { db } from "../db";
import { eq, or, ilike, inArray } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "./helpers";

export function registerAdminChatPinRoutes(app: Express) {

  const resetChatPinForUser = async (userId: string, req: AdminRequest, res: Response) => {
    const targetUserId = String(userId || "").trim();
    if (!targetUserId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    await db.update(users).set({
      chatPinHash: null,
      chatPinEnabled: false,
      chatPinFailedAttempts: 0,
      chatPinLockedUntil: null,
      chatPinSetAt: null,
    }).where(eq(users.id, targetUserId));

    try {
      const { sendNotification } = await import("../websocket");
      sendNotification(targetUserId, {
        type: "system",
        title: "تم إعادة تعيين رقم PIN",
        message: "تم إعادة تعيين رقم PIN الخاص بالدردشة بواسطة المسؤول.",
      });
    } catch { }

    await logAdminAction(req.admin!.id, "update", "chat_pin_reset", targetUserId, { metadata: "reset_pin" }, req);

    return res.json({ success: true, message: "PIN reset successfully" });
  };

  // Admin reset user's chat PIN
  app.post("/api/admin/chat-pin/reset/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      return await resetChatPinForUser(req.params.userId, req, res);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Compatibility alias used by current admin chat page (body: { userId })
  app.post("/api/admin/chat/pin/reset", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      return await resetChatPinForUser(req.body?.userId, req, res);
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

      const searchTerm = `%${String(search).trim()}%`;
      const result = await db.select({
        id: users.id,
        username: users.username,
        accountId: users.accountId,
        profilePicture: users.profilePicture,
        chatPinEnabled: users.chatPinEnabled,
      }).from(users)
        .where(or(
          ilike(users.username, searchTerm),
          ilike(users.accountId, searchTerm)
        ))
        .limit(20);

      if (result.length === 0) {
        return res.json({ users: [] });
      }

      const userIds = result.map((u) => u.id);
      const [mediaRows, autoDeleteRows] = await Promise.all([
        db.select({
          userId: chatMediaPermissions.userId,
          mediaEnabled: chatMediaPermissions.mediaEnabled,
        })
          .from(chatMediaPermissions)
          .where(inArray(chatMediaPermissions.userId, userIds)),
        db.select({
          userId: chatAutoDeletePermissions.userId,
          autoDeleteEnabled: chatAutoDeletePermissions.autoDeleteEnabled,
        })
          .from(chatAutoDeletePermissions)
          .where(inArray(chatAutoDeletePermissions.userId, userIds)),
      ]);

      const mediaMap = new Map(mediaRows.map((row) => [row.userId, row.mediaEnabled]));
      const autoDeleteMap = new Map(autoDeleteRows.map((row) => [row.userId, row.autoDeleteEnabled]));

      const enriched = result.map((u) => ({
        ...u,
        mediaEnabled: Boolean(mediaMap.get(u.id)),
        autoDeleteEnabled: Boolean(autoDeleteMap.get(u.id)),
        pinEnabled: Boolean(u.chatPinEnabled),
      }));

      res.json({ users: enriched });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
