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

  app.post("/api/users/friend-request/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      const requesterId = req.user!.id;

      if (targetUserId === requesterId) {
        return res.status(400).json({ error: "Cannot send a friend request to yourself" });
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
        return res.status(403).json({ error: "Cannot send a friend request to this user" });
      }

      const [myFollow, theirFollow, outgoingRequest, incomingRequest] = await Promise.all([
        storage.getUserRelationship(requesterId, targetUserId, "follow"),
        storage.getUserRelationship(targetUserId, requesterId, "follow"),
        storage.getUserRelationship(requesterId, targetUserId, "friend_request"),
        storage.getUserRelationship(targetUserId, requesterId, "friend_request"),
      ]);

      const alreadyFriends = myFollow?.status === "active" && theirFollow?.status === "active";
      if (alreadyFriends) {
        return res.status(400).json({ error: "Already friends" });
      }

      if (outgoingRequest?.status === "pending") {
        return res.status(400).json({ error: "Friend request already sent" });
      }

      if (incomingRequest?.status === "pending") {
        return res.status(409).json({
          error: "This user already sent you a friend request",
          code: "INCOMING_REQUEST_EXISTS",
        });
      }

      await storage.createUserRelationship({
        userId: requesterId,
        targetUserId,
        type: "friend_request",
        status: "pending",
      });

      await sendNotification(targetUserId, {
        type: "system",
        priority: "normal",
        title: "Friend Request",
        titleAr: "طلب صداقة",
        message: `${currentUser.username || "Someone"} sent you a friend request`,
        messageAr: `أرسل ${currentUser.username || "شخص ما"} طلب صداقة`,
        link: "/friends",
      });

      res.json({ success: true, message: "Friend request sent" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/users/friend-request/:userId/accept", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requesterId = req.params.userId;
      const approverId = req.user!.id;

      if (requesterId === approverId) {
        return res.status(400).json({ error: "Invalid friend request" });
      }

      const [requesterUser, approverUser] = await Promise.all([
        storage.getUser(requesterId),
        storage.getUser(approverId),
      ]);

      if (!requesterUser || !approverUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const isBlocked = await isEitherUserBlocked(requesterId, approverId);
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot accept this friend request" });
      }

      const accepted = await storage.acceptFriendRequest(requesterId, approverId);
      if (!accepted) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      await sendNotification(requesterId, {
        type: "system",
        priority: "normal",
        title: "Friend Request Accepted",
        titleAr: "تم قبول طلب الصداقة",
        message: `${approverUser.username || "A user"} accepted your friend request`,
        messageAr: `قبل ${approverUser.username || "مستخدم"} طلب صداقتك`,
        link: `/player/${approverId}`,
      });

      res.json({ success: true, message: "Friend request accepted" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/users/friend-request/:userId/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requesterId = req.params.userId;
      const rejectorId = req.user!.id;

      if (requesterId === rejectorId) {
        return res.status(400).json({ error: "Invalid friend request" });
      }

      const rejected = await storage.rejectFriendRequest(requesterId, rejectorId);
      if (!rejected) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      res.json({ success: true, message: "Friend request rejected" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/users/friend-request/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const requesterId = req.user!.id;
      const targetUserId = req.params.userId;

      const cancelled = await storage.cancelFriendRequest(requesterId, targetUserId);
      if (!cancelled) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      res.json({ success: true, message: "Friend request cancelled" });
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
