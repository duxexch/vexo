import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { parseStringQueryParam } from "../../lib/input-security";
import { getBlockedUserIds } from "../../lib/user-blocking";

type SocialSearchFilter = "all" | "friends" | "following" | "followers" | "blocked";

const ALLOWED_SOCIAL_SEARCH_FILTERS: ReadonlySet<SocialSearchFilter> = new Set([
  "all",
  "friends",
  "following",
  "followers",
  "blocked",
]);

function parseSocialSearchFilter(rawFilter: unknown): SocialSearchFilter {
  const normalized = parseStringQueryParam(rawFilter, 24).toLowerCase();
  if (ALLOWED_SOCIAL_SEARCH_FILTERS.has(normalized as SocialSearchFilter)) {
    return normalized as SocialSearchFilter;
  }
  return "all";
}

export function registerSocialSearchRoutes(app: Express): void {

  app.get("/api/users/search", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const query = parseStringQueryParam(req.query.q, 80);
      const filter = parseSocialSearchFilter(req.query.filter);

      if (query.length < 2) {
        return res.json([]);
      }

      const searchResults = await storage.searchUsers(query, req.user!.id, { limit: 80 });
      const [following, followers, blockedIds] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
      ]);
      const followingIds = new Set(following.map(r => r.targetUserId));
      const followerIds = new Set(followers.map(r => r.userId));
      const blockedSet = new Set(blockedIds);

      const mappedResults = searchResults.map(user => {
        const { password, ...safeUser } = user;
        const isFollowing = followingIds.has(user.id);
        const isFollower = followerIds.has(user.id);
        const isBlocked = blockedSet.has(user.id);

        return {
          ...safeUser,
          isFollowing,
          isFollower,
          isFriend: isFollowing && isFollower,
          isBlocked,
        };
      });

      const filteredResults = mappedResults.filter((user) => {
        switch (filter) {
          case "friends":
            return user.isFriend === true;
          case "following":
            return user.isFollowing === true;
          case "followers":
            return user.isFollower === true;
          case "blocked":
            return user.isBlocked === true;
          case "all":
          default:
            return true;
        }
      });

      res.json(filteredResults);
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

      const [following, followers, blockedIds] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
      ]);

      const isFollowing = following.some(r => r.targetUserId === user.id);
      const isFollower = followers.some(r => r.userId === user.id);
      const isBlocked = blockedIds.includes(user.id);
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
