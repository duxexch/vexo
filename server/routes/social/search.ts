import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";

export function registerSocialSearchRoutes(app: Express): void {

  app.get("/api/users/search", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const query = (req.query.q as string) || "";
      
      if (query.length < 2) {
        return res.json([]);
      }
      
      const searchResults = await storage.searchUsers(query, req.user!.id);
      const following = await storage.getUserFollowing(req.user!.id);
      const followingIds = new Set(following.map(r => r.targetUserId));
      
      const results = searchResults.map(user => {
        const { password, ...safeUser } = user;
        return {
          ...safeUser,
          isFollowing: followingIds.has(user.id),
        };
      });
      
      res.json(results);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/:accountId/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const accountId = req.params.accountId;
      
      const user = await storage.getUserByAccountId(accountId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password, ...safeUser } = user;
      
      const following = await storage.getUserFollowing(req.user!.id);
      const followers = await storage.getUserFollowers(req.user!.id);
      const blocked = await storage.getUserBlocked(req.user!.id);
      
      const isFollowing = following.some(r => r.targetUserId === user.id);
      const isFollower = followers.some(r => r.userId === user.id);
      const isBlocked = blocked.some(r => r.targetUserId === user.id);
      const isFriend = isFollowing && isFollower;
      
      res.json({
        ...safeUser,
        isFollowing,
        isFollower,
        isBlocked,
        isFriend,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
