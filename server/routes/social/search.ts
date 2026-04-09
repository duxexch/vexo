import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import { parseStringQueryParam } from "../../lib/input-security";
import { getBlockedUserIds } from "../../lib/user-blocking";
import { Country, State } from "country-state-city";

type SocialSearchFilter = "all" | "friends" | "following" | "followers" | "blocked";

type GeoCountryOption = {
  code: string;
  name: string;
};

type GeoRegionOption = {
  code: string;
  name: string;
  countryCode: string;
};

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

function parseOptionalQueryParam(rawValue: unknown, maxLength: number): string | undefined {
  const normalized = parseStringQueryParam(rawValue, maxLength).trim();
  return normalized.length > 0 ? normalized : undefined;
}

const GEO_COUNTRIES: GeoCountryOption[] = Country.getAllCountries()
  .map((country) => ({
    code: String(country.isoCode || "").toUpperCase(),
    name: String(country.name || ""),
  }))
  .filter((country) => country.code.length > 0 && country.name.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

function getGeoRegions(countryCode: string): GeoRegionOption[] {
  const normalizedCountryCode = String(countryCode || "").trim().toUpperCase();
  if (!normalizedCountryCode) return [];

  return State.getStatesOfCountry(normalizedCountryCode)
    .map((region) => ({
      code: String(region.isoCode || "").toUpperCase(),
      name: String(region.name || ""),
      countryCode: normalizedCountryCode,
    }))
    .filter((region) => region.code.length > 0 && region.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function registerSocialSearchRoutes(app: Express): void {

  app.get("/api/users/search/meta/countries", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      res.json(GEO_COUNTRIES);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/search/meta/regions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = parseOptionalQueryParam(req.query.countryCode, 8)?.toUpperCase() || "";
      if (!countryCode) {
        return res.json([]);
      }

      res.json(getGeoRegions(countryCode));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/users/search", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const query = parseStringQueryParam(req.query.q, 80);
      const filter = parseSocialSearchFilter(req.query.filter);
      const language = parseOptionalQueryParam(req.query.language, 16)?.toLowerCase();
      const countryCode = parseOptionalQueryParam(req.query.countryCode, 8)?.toUpperCase();
      const regionCode = parseOptionalQueryParam(req.query.regionCode, 24)?.toUpperCase();
      const city = parseOptionalQueryParam(req.query.city, 120);

      if (query.length < 2) {
        return res.json([]);
      }

      const searchResults = await storage.searchUsers(query, req.user!.id, {
        limit: 80,
        language,
        countryCode,
        regionCode,
        city,
      });
      const [following, followers, blockedIds, outgoingRequests, incomingRequests] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
        storage.getOutgoingFriendRequests(req.user!.id),
        storage.getIncomingFriendRequests(req.user!.id),
      ]);
      const followingIds = new Set(following.map(r => r.targetUserId));
      const followerIds = new Set(followers.map(r => r.userId));
      const blockedSet = new Set(blockedIds);
      const outgoingRequestIds = new Set(outgoingRequests.map(r => r.targetUserId));
      const incomingRequestIds = new Set(incomingRequests.map(r => r.userId));

      const mappedResults = searchResults.map(user => {
        const { password, ...safeUser } = user;
        const isFollowing = followingIds.has(user.id);
        const isFollower = followerIds.has(user.id);
        const isBlocked = blockedSet.has(user.id);
        const hasPendingRequestSent = outgoingRequestIds.has(user.id);
        const hasPendingRequestReceived = incomingRequestIds.has(user.id);

        return {
          ...safeUser,
          isFollowing,
          isFollower,
          isFriend: isFollowing && isFollower,
          isBlocked,
          hasPendingRequestSent,
          hasPendingRequestReceived,
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

      const [following, followers, blockedIds, outgoingRequests, incomingRequests] = await Promise.all([
        storage.getUserFollowing(req.user!.id),
        storage.getUserFollowers(req.user!.id),
        getBlockedUserIds(req.user!.id),
        storage.getOutgoingFriendRequests(req.user!.id),
        storage.getIncomingFriendRequests(req.user!.id),
      ]);

      const isFollowing = following.some(r => r.targetUserId === user.id);
      const isFollower = followers.some(r => r.userId === user.id);
      const isBlocked = blockedIds.includes(user.id);
      const isFriend = isFollowing && isFollower;
      const hasPendingRequestSent = outgoingRequests.some(r => r.targetUserId === user.id);
      const hasPendingRequestReceived = incomingRequests.some(r => r.userId === user.id);

      res.json({
        ...safeUser,
        isFollowing,
        isFollower,
        isBlocked,
        isFriend,
        hasPendingRequestSent,
        hasPendingRequestReceived,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
