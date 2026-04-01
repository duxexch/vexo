import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { sendNotification } from "../../websocket";
import { blockUser, isEitherUserBlocked, unblockUser } from "../../lib/user-blocking";

export function registerSocialActionRoutes(app: Express): void {

  app.post("/api/users/follow/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      const requesterId = req.user!.id;

      if (targetUserId === requesterId) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }

      const [targetUser, currentUser] = await Promise.all([
        storage.getUser(targetUserId),
        storage.getUser(requesterId),
      ]);

      if (!targetUser || !currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const isBlocked = await isEitherUserBlocked(requesterId, targetUserId);
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot follow this user" });
      }

      const existing = await storage.getUserRelationship(requesterId, targetUserId, "follow");
      if (existing) {
        return res.status(400).json({ error: "Already following this user" });
      }

      await storage.createUserRelationship({
        userId: requesterId,
        targetUserId,
        type: "follow",
        status: "active",
      });

      await sendNotification(targetUserId, {
        type: "system",
        priority: "normal",
        title: "New Follower",
        titleAr: "متابع جديد",
        message: `${currentUser?.username || "Someone"} started following you`,
        messageAr: `بدأ ${currentUser?.username || "شخص ما"} بمتابعتك`,
        link: `/player/${requesterId}`,
      });

      const reverseFollow = await storage.getUserRelationship(targetUserId, requesterId, "follow");
      if (reverseFollow) {
        await sendNotification(req.user!.id, {
          type: "system",
          priority: "normal",
          title: "New Friend",
          titleAr: "صديق جديد",
          message: `You and ${targetUser.username} are now friends!`,
          messageAr: `أنت و ${targetUser.username} أصدقاء الآن!`,
          link: `/player/${targetUserId}`,
        });
        await sendNotification(targetUserId, {
          type: "system",
          priority: "normal",
          title: "New Friend",
          titleAr: "صديق جديد",
          message: `You and ${currentUser?.username || "a user"} are now friends!`,
          messageAr: `أنت و ${currentUser?.username || "مستخدم"} أصدقاء الآن!`,
          link: `/player/${requesterId}`,
        });
      }

      res.json({ success: true, message: "Now following user" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/users/unfollow/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;

      await storage.deleteUserRelationship(req.user!.id, targetUserId, "follow");

      res.json({ success: true, message: "Unfollowed user" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/users/block/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      if (targetUserId === userId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      const targetUser = await storage.getUser(targetUserId);
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

  app.delete("/api/users/unblock/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetUserId = req.params.userId;

      await unblockUser(userId, targetUserId);

      res.json({ success: true, message: "User unblocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
