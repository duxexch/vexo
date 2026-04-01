import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { getBlockedUserIds } from "../../lib/user-blocking";

export function registerSocialListRoutes(app: Express): void {

  app.get("/api/users/friends", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const following = await storage.getUserFollowing(req.user!.id);
      const followers = await storage.getUserFollowers(req.user!.id);

      const followingIds = new Set(following.map(r => r.targetUserId));
      const followerIds = new Set(followers.map(r => r.userId));

      const mutualIds = [...followingIds].filter(id => followerIds.has(id));

      // Batch fetch all users in one query instead of N+1
      const usersMap = await storage.getUsersByIds(mutualIds);
      const friends = mutualIds
        .map(id => usersMap.get(id))
        .filter(Boolean)
        .map(user => { const { password, ...safeUser } = user!; return safeUser; });

      res.json(friends);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/following", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const following = await storage.getUserFollowing(req.user!.id);

      // Batch fetch all users in one query
      const ids = following.map(rel => rel.targetUserId);
      const usersMap = await storage.getUsersByIds(ids);
      const users = ids
        .map(id => usersMap.get(id))
        .filter(Boolean)
        .map(user => { const { password, ...safeUser } = user!; return safeUser; });

      res.json(users);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/followers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const followers = await storage.getUserFollowers(req.user!.id);

      // Batch fetch all users in one query
      const ids = followers.map(rel => rel.userId);
      const usersMap = await storage.getUsersByIds(ids);
      const users = ids
        .map(id => usersMap.get(id))
        .filter(Boolean)
        .map(user => { const { password, ...safeUser } = user!; return safeUser; });

      res.json(users);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/blocked", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const blockedIds = await getBlockedUserIds(req.user!.id);

      // Batch fetch all users in one query
      const usersMap = await storage.getUsersByIds(blockedIds);
      const users = blockedIds
        .map(id => usersMap.get(id))
        .filter(Boolean)
        .map(user => { const { password, ...safeUser } = user!; return safeUser; });

      res.json(users);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/users/batch", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.json([]);
      }

      const limitedIds = userIds.slice(0, 50);

      // Batch fetch all users in one query
      const usersMap = await storage.getUsersByIds(limitedIds);
      const batchUsers = limitedIds
        .map(id => usersMap.get(id))
        .filter(Boolean)
        .map(user => ({
          id: user!.id,
          username: user!.username,
          nickname: user!.nickname,
          profilePicture: user!.profilePicture,
        }));

      res.json(batchUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
