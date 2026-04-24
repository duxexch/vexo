import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { blockUser, unblockUser } from "../../lib/user-blocking";
import { invalidateUserBlockCache } from "../../lib/redis";

export function registerBlockingRoutes(app: Express): void {

  // Block a user (chat context - uses users.blockedUsers array)
  app.post("/api/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      if (userId === targetUserId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      const [targetUser] = await db.select({ id: users.id })
        .from(users).where(eq(users.id, targetUserId));
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const { alreadyBlocked } = await blockUser(userId, targetUserId);
      if (alreadyBlocked) {
        return res.status(400).json({ error: "User already blocked" });
      }

      res.json({ success: true, message: "User blocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unblock a user (chat context)
  app.delete("/api/users/:userId/block", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      await unblockUser(userId, targetUserId);

      res.json({ success: true, message: "User unblocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Mute a user
  app.post("/api/users/:userId/mute", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      if (userId === targetUserId) {
        return res.status(400).json({ error: "Cannot mute yourself" });
      }

      const [targetUser] = await db.select({ id: users.id })
        .from(users).where(eq(users.id, targetUserId));
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const [user] = await db.select({ mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, userId));

      const mutedUsers = user?.mutedUsers || [];
      if (mutedUsers.includes(targetUserId)) {
        return res.status(400).json({ error: "User already muted" });
      }

      const newMutedUsers = [...new Set([...mutedUsers, targetUserId])];

      await db.update(users)
        .set({ mutedUsers: newMutedUsers })
        .where(eq(users.id, userId));

      res.json({ success: true, message: "User muted" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unmute a user
  app.delete("/api/users/:userId/mute", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      const [user] = await db.select({ mutedUsers: users.mutedUsers })
        .from(users).where(eq(users.id, userId));

      const mutedUsers = user?.mutedUsers || [];
      const newMutedUsers = mutedUsers.filter((id: string) => id !== targetUserId);

      await db.update(users)
        .set({ mutedUsers: newMutedUsers })
        .where(eq(users.id, userId));

      res.json({ success: true, message: "User unmuted" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Mute notifications for a single conversation (does NOT hide messages)
  app.post(
    "/api/users/:userId/notification-mute",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const targetUserId = req.params.userId;

        if (userId === targetUserId) {
          return res
            .status(400)
            .json({ error: "Cannot mute notifications for yourself" });
        }

        const [targetUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, targetUserId));
        if (!targetUser) {
          return res.status(404).json({ error: "User not found" });
        }

        const [user] = await db
          .select({ notificationMutedUsers: users.notificationMutedUsers })
          .from(users)
          .where(eq(users.id, userId));

        const current = user?.notificationMutedUsers || [];
        if (current.includes(targetUserId)) {
          return res
            .status(400)
            .json({ error: "Conversation notifications already muted" });
        }

        const next = [...new Set([...current, targetUserId])];
        await db
          .update(users)
          .set({ notificationMutedUsers: next })
          .where(eq(users.id, userId));
        invalidateUserBlockCache(userId);

        res.json({ success: true, message: "Notifications muted" });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Unmute notifications for a single conversation
  app.delete(
    "/api/users/:userId/notification-mute",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const targetUserId = req.params.userId;

        const [user] = await db
          .select({ notificationMutedUsers: users.notificationMutedUsers })
          .from(users)
          .where(eq(users.id, userId));

        const current = user?.notificationMutedUsers || [];
        const next = current.filter((id: string) => id !== targetUserId);

        await db
          .update(users)
          .set({ notificationMutedUsers: next })
          .where(eq(users.id, userId));
        invalidateUserBlockCache(userId);

        res.json({ success: true, message: "Notifications unmuted" });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Get blocked and muted users
  app.get("/api/users/blocked-muted", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [user] = await db.select({
        blockedUsers: users.blockedUsers,
        mutedUsers: users.mutedUsers,
        notificationMutedUsers: users.notificationMutedUsers,
      }).from(users).where(eq(users.id, userId));

      res.json({
        blockedUsers: user?.blockedUsers || [],
        mutedUsers: user?.mutedUsers || [],
        notificationMutedUsers: user?.notificationMutedUsers || [],
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
