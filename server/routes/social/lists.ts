import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { getBlockedUserIds } from "../../lib/user-blocking";

export function registerSocialListRoutes(app: Express): void {

  app.get("/api/users/friend-requests/incoming", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const incomingRequests = await storage.getIncomingFriendRequests(req.user!.id);
      const requesterIds = incomingRequests.map((request) => request.userId);

      const usersMap = await storage.getUsersByIds(requesterIds);
      const users = requesterIds
        .map((id) => usersMap.get(id))
        .filter(Boolean)
        .map((user) => {
          const { password, ...safeUser } = user!;
          return safeUser;
        });

      res.json(users);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/friend-requests/outgoing", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const outgoingRequests = await storage.getOutgoingFriendRequests(req.user!.id);
      const targetIds = outgoingRequests.map((request) => request.targetUserId);

      const usersMap = await storage.getUsersByIds(targetIds);
      const users = targetIds
        .map((id) => usersMap.get(id))
        .filter(Boolean)
        .map((user) => {
          const { password, ...safeUser } = user!;
          return safeUser;
        });

      res.json(users);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/friends", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [following, followers, blockedIds] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
      ]);
      const blockedSet = new Set(blockedIds);

      const followingIds = new Set(following.map(r => r.targetUserId));
      const followerIds = new Set(followers.map(r => r.userId));

      const mutualIds = [...followingIds].filter(id => followerIds.has(id) && !blockedSet.has(id));

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
      const [following, blockedIds] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        getBlockedUserIds(req.user!.id),
      ]);
      const blockedSet = new Set(blockedIds);

      // Batch fetch all users in one query
      const ids = following.map(rel => rel.targetUserId).filter(id => !blockedSet.has(id));
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
      const [followers, blockedIds] = await Promise.all([
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
      ]);
      const blockedSet = new Set(blockedIds);

      // Batch fetch all users in one query
      const ids = followers.map(rel => rel.userId).filter(id => !blockedSet.has(id));
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

  // "Players you may know" — surface friends-of-friends + recent active
  // players, with the requester's own follows / pending-requests / blocks
  // filtered out client-side via the exclusion list we build here.
  app.get("/api/users/suggestions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limitParam = Number(req.query.limit);
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, limitParam)) : 12;

      const [following, followers, incoming, outgoing, blockedIds] = await Promise.all([
        storage.getUserFollowing(userId),
        storage.getUserFollowers(userId),
        storage.getIncomingFriendRequests(userId),
        storage.getOutgoingFriendRequests(userId),
        getBlockedUserIds(userId),
      ]);

      const exclude = new Set<string>();
      following.forEach((r) => exclude.add(r.targetUserId));
      followers.forEach((r) => exclude.add(r.userId));
      incoming.forEach((r) => exclude.add(r.userId));
      outgoing.forEach((r) => exclude.add(r.targetUserId));
      blockedIds.forEach((id) => exclude.add(id));

      const suggestions = await storage.getFriendSuggestions(userId, Array.from(exclude), limit);

      const safe = suggestions.map((u) => {
        const { password, ...rest } = u;
        return rest;
      });

      res.json(safe);
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
