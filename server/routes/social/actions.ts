import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { sendNotification } from "../../websocket";

export function registerSocialActionRoutes(app: Express): void {

  app.post("/api/users/follow/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      
      if (targetUserId === req.user!.id) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }
      
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const isBlocked = await storage.getUserRelationship(targetUserId, req.user!.id, "block");
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot follow this user" });
      }
      
      const existing = await storage.getUserRelationship(req.user!.id, targetUserId, "follow");
      if (existing) {
        return res.status(400).json({ error: "Already following this user" });
      }
      
      await storage.createUserRelationship({
        userId: req.user!.id,
        targetUserId,
        type: "follow",
        status: "active",
      });
      
      const currentUser = await storage.getUser(req.user!.id);
      await sendNotification(targetUserId, {
        type: "system",
        priority: "normal",
        title: "New Follower",
        titleAr: "متابع جديد",
        message: `${currentUser?.username || "Someone"} started following you`,
        messageAr: `بدأ ${currentUser?.username || "شخص ما"} بمتابعتك`,
        link: `/player/${req.user!.id}`,
      });
      
      const reverseFollow = await storage.getUserRelationship(targetUserId, req.user!.id, "follow");
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
          link: `/player/${req.user!.id}`,
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
      const targetUserId = req.params.userId;
      
      if (targetUserId === req.user!.id) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }
      
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.deleteUserRelationship(req.user!.id, targetUserId, "follow");
      await storage.deleteUserRelationship(targetUserId, req.user!.id, "follow");
      
      const existing = await storage.getUserRelationship(req.user!.id, targetUserId, "block");
      if (!existing) {
        await storage.createUserRelationship({
          userId: req.user!.id,
          targetUserId,
          type: "block",
          status: "active",
        });
      }
      
      res.json({ success: true, message: "User blocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/users/unblock/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      
      await storage.deleteUserRelationship(req.user!.id, targetUserId, "block");
      
      res.json({ success: true, message: "User unblocked" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
