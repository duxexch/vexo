import type { Express, Response } from "express";
import crypto from "crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { uploadFile } from "../../lib/minio-client";
import {
  adWatchLog,
  advertisements,
  affiliates,
  dailyRewards,
  freePlayAdEvents,
  referralRewardsLog,
  users,
} from "@shared/schema";
import {
  type AdminRequest,
  adminAuthMiddleware,
  getErrorMessage,
  logAdminAction,
} from "../helpers";

const MAX_CAMPAIGN_ASSET_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CAMPAIGN_ASSET_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/ogg", "ogg"],
]);

function parseLimit(value: unknown, fallback = 20, max = 200): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseWindowDays(value: unknown, fallback = 30, max = 365): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function toDecimalString(value: unknown, fallback = "0.00"): string {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed.toFixed(2);
}

function toCampaignPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const titleAr = String(body.titleAr ?? "").trim();
  const rawType = String(body.type ?? "image").trim().toLowerCase();
  const assetUrl = String(body.assetUrl ?? "").trim();
  const targetUrl = String(body.targetUrl ?? "").trim();
  const embedCode = String(body.embedCode ?? "").trim();
  const displayDuration = Number.parseInt(String(body.displayDuration ?? "5000"), 10);
  const sortOrder = Number.parseInt(String(body.sortOrder ?? "0"), 10);
  const isActive = body.isActive !== false;

  if (!title) {
    throw new Error("Campaign title is required");
  }

  const supportedTypes = ["image", "video", "link", "embed"] as const;
  if (!supportedTypes.includes(rawType as typeof supportedTypes[number])) {
    throw new Error("Unsupported campaign type");
  }
  const type = rawType as typeof supportedTypes[number];

  if ((type === "image" || type === "video") && !assetUrl) {
    throw new Error("assetUrl is required for image/video campaigns");
  }

  if (type === "embed" && !embedCode) {
    throw new Error("embedCode is required for embed campaigns");
  }

  if ((type === "image" || type === "video" || type === "link") && !targetUrl) {
    throw new Error("targetUrl is required for clickable campaigns");
  }

  if (!Number.isFinite(displayDuration) || displayDuration < 1000 || displayDuration > 120000) {
    throw new Error("displayDuration must be between 1000 and 120000 ms");
  }

  if (!Number.isFinite(sortOrder)) {
    throw new Error("sortOrder must be a valid integer");
  }

  return {
    title,
    titleAr: titleAr || null,
    type,
    assetUrl: assetUrl || null,
    targetUrl: targetUrl || null,
    embedCode: embedCode || null,
    displayDuration,
    sortOrder,
    isActive,
  };
}

function getRequestIp(req: AdminRequest): string | null {
  const raw = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim();
  return raw || null;
}

export function registerFreePlayInsightsRoutes(app: Express) {
  app.get("/api/admin/free-play/leaderboard", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const section = String(req.query.section || "daily").toLowerCase();
      const limit = parseLimit(req.query.limit, 20, 200);
      const windowDays = parseWindowDays(req.query.windowDays, 30, 365);
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const activeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      if (section === "daily") {
        const rows = await db.execute(sql`
          SELECT
            dr.user_id AS user_id,
            u.username AS username,
            u.nickname AS nickname,
            u.last_active_at AS last_active_at,
            COUNT(dr.id)::int AS activity_count,
            COALESCE(SUM(dr.amount::numeric), 0)::text AS total_rewards,
            MAX(dr.claimed_at) AS last_activity_at
          FROM daily_rewards dr
          INNER JOIN users u ON u.id = dr.user_id
          WHERE dr.claimed_at >= ${windowStart}
          GROUP BY dr.user_id, u.username, u.nickname, u.last_active_at
          ORDER BY activity_count DESC, COALESCE(SUM(dr.amount::numeric), 0) DESC
          LIMIT ${limit}
        `).then((result) => result.rows as Array<Record<string, unknown>>);

        return res.json({ section, windowDays, rows });
      }

      if (section === "ads") {
        const rows = await db.execute(sql`
          SELECT
            aw.user_id AS user_id,
            u.username AS username,
            u.nickname AS nickname,
            u.last_active_at AS last_active_at,
            COUNT(aw.id)::int AS activity_count,
            COALESCE(SUM(aw.reward_amount::numeric), 0)::text AS total_rewards,
            MAX(aw.watched_at) AS last_activity_at
          FROM ad_watch_log aw
          INNER JOIN users u ON u.id = aw.user_id
          WHERE aw.watched_at >= ${windowStart}
          GROUP BY aw.user_id, u.username, u.nickname, u.last_active_at
          ORDER BY activity_count DESC, COALESCE(SUM(aw.reward_amount::numeric), 0) DESC
          LIMIT ${limit}
        `).then((result) => result.rows as Array<Record<string, unknown>>);

        return res.json({ section, windowDays, rows });
      }

      if (section === "referral") {
        const rows = await db.execute(sql`
          SELECT
            rr.referrer_id AS user_id,
            u.username AS username,
            u.nickname AS nickname,
            u.last_active_at AS last_active_at,
            COUNT(rr.id)::int AS activity_count,
            COUNT(DISTINCT rr.referred_id)::int AS successful_referrals,
            COALESCE(SUM(CASE WHEN rr.reward_status IN ('released', 'paid') THEN rr.reward_amount::numeric ELSE 0 END), 0)::text AS total_rewards,
            COALESCE(SUM(CASE WHEN rr.reward_status = 'on_hold' THEN rr.reward_amount::numeric ELSE 0 END), 0)::text AS pending_rewards,
            (
              SELECT COUNT(*)::int
              FROM users iu
              WHERE iu.referred_by = rr.referrer_id
            ) AS invited_total,
            (
              SELECT COUNT(*)::int
              FROM users iu
              WHERE iu.referred_by = rr.referrer_id
                AND iu.status = 'active'
                AND iu.last_active_at IS NOT NULL
                AND iu.last_active_at >= ${activeCutoff}
            ) AS invited_active,
            MAX(rr.created_at) AS last_activity_at
          FROM referral_rewards_log rr
          INNER JOIN users u ON u.id = rr.referrer_id
          WHERE rr.created_at >= ${windowStart}
          GROUP BY rr.referrer_id, u.username, u.nickname, u.last_active_at
          ORDER BY activity_count DESC, COALESCE(SUM(rr.reward_amount::numeric), 0) DESC
          LIMIT ${limit}
        `).then((result) => result.rows as Array<Record<string, unknown>>);

        return res.json({ section, windowDays, rows });
      }

      if (section === "games") {
        const rows = await db.execute(sql`
          WITH player_rows AS (
            SELECT gm.player1_id AS user_id, gm.created_at AS created_at
            FROM game_matches gm
            WHERE gm.created_at >= ${windowStart}
            UNION ALL
            SELECT gm.player2_id AS user_id, gm.created_at AS created_at
            FROM game_matches gm
            WHERE gm.created_at >= ${windowStart}
          )
          SELECT
            pr.user_id AS user_id,
            u.username AS username,
            u.nickname AS nickname,
            u.last_active_at AS last_active_at,
            COUNT(*)::int AS activity_count,
            MAX(pr.created_at) AS last_activity_at,
            COALESCE(u.games_played, 0)::int AS games_played,
            COALESCE(u.games_won, 0)::int AS games_won,
            COALESCE(u.total_earnings, '0.00')::text AS total_earnings
          FROM player_rows pr
          INNER JOIN users u ON u.id = pr.user_id
          GROUP BY pr.user_id, u.username, u.nickname, u.last_active_at, u.games_played, u.games_won, u.total_earnings
          ORDER BY activity_count DESC, COALESCE(u.games_won, 0) DESC
          LIMIT ${limit}
        `).then((result) => result.rows as Array<Record<string, unknown>>);

        return res.json({ section, windowDays, rows });
      }

      return res.status(400).json({ error: "Unsupported section. Use daily|ads|referral|games" });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/users/:userId/performance", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = String(req.params.userId || "").trim();
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const [user] = await db.select({
        id: users.id,
        username: users.username,
        nickname: users.nickname,
        status: users.status,
        isOnline: users.isOnline,
        lastActiveAt: users.lastActiveAt,
        totalDeposited: users.totalDeposited,
        totalEarnings: users.totalEarnings,
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        freePlayCount: users.freePlayCount,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [daily] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS claims,
          COALESCE(SUM(amount::numeric), 0)::text AS total_rewards,
          MAX(claimed_at) AS last_claim_at
        FROM daily_rewards
        WHERE user_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [ads] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS watches,
          COALESCE(SUM(reward_amount::numeric), 0)::text AS total_rewards,
          MAX(watched_at) AS last_watch_at
        FROM ad_watch_log
        WHERE user_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [referralEarned] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS reward_events,
          COALESCE(SUM(CASE WHEN reward_status IN ('released', 'paid') THEN reward_amount::numeric ELSE 0 END), 0)::text AS total_rewards,
          COALESCE(SUM(CASE WHEN reward_status = 'on_hold' THEN reward_amount::numeric ELSE 0 END), 0)::text AS pending_rewards,
          MAX(created_at) AS last_reward_at
        FROM referral_rewards_log
        WHERE referrer_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [invitedSummary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS invited_total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS invited_active,
          COUNT(*) FILTER (WHERE status <> 'active')::int AS invited_inactive,
          COALESCE(SUM(total_deposited::numeric), 0)::text AS invited_total_deposits,
          COALESCE(SUM(total_earnings::numeric), 0)::text AS invited_total_earnings
        FROM users
        WHERE referred_by = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [games] = await db.execute(sql`
        WITH player_rows AS (
          SELECT player1_id AS user_id, created_at AS created_at
          FROM game_matches
          WHERE player1_id = ${userId}
          UNION ALL
          SELECT player2_id AS user_id, created_at AS created_at
          FROM game_matches
          WHERE player2_id = ${userId}
        )
        SELECT
          COUNT(*)::int AS matches,
          MAX(created_at) AS last_match_at
        FROM player_rows
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const adEvents = await db.execute(sql`
        SELECT
          event_type,
          COUNT(*)::int AS total
        FROM free_play_ad_events
        WHERE user_id = ${userId}
        GROUP BY event_type
      `).then((result) => result.rows as Array<{ event_type: string; total: number }>);

      const adEventMap: Record<string, number> = {
        view: 0,
        click: 0,
        reward_claim: 0,
      };
      for (const row of adEvents) {
        adEventMap[row.event_type] = Number(row.total || 0);
      }

      return res.json({
        user,
        sections: {
          daily: {
            claims: Number(daily?.claims || 0),
            totalRewards: toDecimalString(daily?.total_rewards),
            lastClaimAt: daily?.last_claim_at || null,
          },
          ads: {
            watches: Number(ads?.watches || 0),
            totalRewards: toDecimalString(ads?.total_rewards),
            lastWatchAt: ads?.last_watch_at || null,
            trackedViews: adEventMap.view,
            trackedClicks: adEventMap.click,
            trackedRewardClaims: adEventMap.reward_claim,
          },
          referral: {
            rewardEvents: Number(referralEarned?.reward_events || 0),
            totalRewards: toDecimalString(referralEarned?.total_rewards),
            pendingRewards: toDecimalString(referralEarned?.pending_rewards),
            lastRewardAt: referralEarned?.last_reward_at || null,
            invitedTotal: Number(invitedSummary?.invited_total || 0),
            invitedActive: Number(invitedSummary?.invited_active || 0),
            invitedInactive: Number(invitedSummary?.invited_inactive || 0),
            invitedTotalDeposits: toDecimalString(invitedSummary?.invited_total_deposits),
            invitedTotalEarnings: toDecimalString(invitedSummary?.invited_total_earnings),
          },
          games: {
            matches: Number(games?.matches || 0),
            gamesPlayed: Number(user.gamesPlayed || 0),
            gamesWon: Number(user.gamesWon || 0),
            freePlayCount: Number(user.freePlayCount || 0),
            lastMatchAt: games?.last_match_at || null,
          },
        },
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/referrals/:userId/details", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = Math.max(Number.parseInt(String(req.query.offset || 0), 10) || 0, 0);
      const activeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [referrer] = await db.select({
        id: users.id,
        username: users.username,
        nickname: users.nickname,
        status: users.status,
        isOnline: users.isOnline,
        lastActiveAt: users.lastActiveAt,
      }).from(users).where(eq(users.id, userId)).limit(1);

      if (!referrer) {
        return res.status(404).json({ error: "Referrer not found" });
      }

      const [affiliate] = await db.select({
        id: affiliates.id,
        affiliateCode: affiliates.affiliateCode,
        referralLink: affiliates.referralLink,
        commissionRate: affiliates.commissionRate,
        isActive: affiliates.isActive,
      }).from(affiliates).where(eq(affiliates.userId, userId)).limit(1);

      const [summary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS invited_total,
          COUNT(*) FILTER (
            WHERE status = 'active'
              AND last_active_at IS NOT NULL
              AND last_active_at >= ${activeCutoff}
          )::int AS invited_active,
          COUNT(*) FILTER (
            WHERE status <> 'active'
               OR last_active_at IS NULL
               OR last_active_at < ${activeCutoff}
          )::int AS invited_inactive,
          COALESCE(SUM(total_deposited::numeric), 0)::text AS invited_total_deposits,
          COALESCE(SUM(total_earnings::numeric), 0)::text AS invited_total_earnings,
          COALESCE(SUM(games_played), 0)::int AS invited_total_games
        FROM users
        WHERE referred_by = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [commissionTotals] = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN reward_status IN ('released', 'paid') THEN reward_amount::numeric ELSE 0 END), 0)::text AS total_commissions,
          COALESCE(SUM(CASE WHEN reward_status = 'on_hold' THEN reward_amount::numeric ELSE 0 END), 0)::text AS pending_commissions,
          COALESCE(SUM(CASE WHEN reward_type = 'cpa' THEN reward_amount::numeric ELSE 0 END), 0)::text AS total_cpa,
          COALESCE(SUM(CASE WHEN reward_type = 'revshare' THEN reward_amount::numeric ELSE 0 END), 0)::text AS total_revshare,
          COUNT(*)::int AS commission_events,
          MAX(created_at) AS last_commission_at
        FROM referral_rewards_log
        WHERE referrer_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const invitedUsers = await db.execute(sql`
        SELECT
          u.id,
          u.username,
          u.nickname,
          u.status,
          u.is_online,
          u.last_active_at,
          u.total_deposited,
          u.total_earnings,
          u.total_won,
          u.games_played,
          u.created_at,
          COALESCE(rr.commission_generated, 0)::text AS commission_generated,
          COALESCE(rr.pending_commission_generated, 0)::text AS pending_commission_generated
        FROM users u
        LEFT JOIN (
          SELECT
            referred_id,
            SUM(CASE WHEN reward_status IN ('released', 'paid') THEN reward_amount::numeric ELSE 0 END) AS commission_generated,
            SUM(CASE WHEN reward_status = 'on_hold' THEN reward_amount::numeric ELSE 0 END) AS pending_commission_generated
          FROM referral_rewards_log
          WHERE referrer_id = ${userId}
          GROUP BY referred_id
        ) rr ON rr.referred_id = u.id
        WHERE u.referred_by = ${userId}
        ORDER BY u.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      return res.json({
        referrer,
        affiliate: affiliate || null,
        summary: {
          invitedTotal: Number(summary?.invited_total || 0),
          invitedActive: Number(summary?.invited_active || 0),
          invitedInactive: Number(summary?.invited_inactive || 0),
          totalInvitedDeposits: toDecimalString(summary?.invited_total_deposits),
          totalInvitedEarnings: toDecimalString(summary?.invited_total_earnings),
          totalInvitedGames: Number(summary?.invited_total_games || 0),
          totalCommissions: toDecimalString(commissionTotals?.total_commissions),
          pendingCommissions: toDecimalString(commissionTotals?.pending_commissions),
          totalCpa: toDecimalString(commissionTotals?.total_cpa),
          totalRevshare: toDecimalString(commissionTotals?.total_revshare),
          commissionEvents: Number(commissionTotals?.commission_events || 0),
          lastCommissionAt: commissionTotals?.last_commission_at || null,
        },
        invitedUsers,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/free-play/referrals/:userId/commission", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const commissionRate = Number.parseFloat(String(req.body?.commissionRate ?? ""));

      if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
        return res.status(400).json({ error: "commissionRate must be between 0 and 100" });
      }

      const [targetUser] = await db.select({ id: users.id, username: users.username, accountId: users.accountId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const [existingAffiliate] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);

      let updatedAffiliate;
      if (existingAffiliate) {
        [updatedAffiliate] = await db.update(affiliates)
          .set({
            commissionRate: commissionRate.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(affiliates.id, existingAffiliate.id))
          .returning();
      } else {
        const [invitedCount] = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE referred_by = ${userId}
        `).then((result) => result.rows as Array<{ count: number }>);

        const affiliateCode = `AFF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const referralToken = targetUser.accountId || targetUser.username;
        const referralLink = `/login?ref=${encodeURIComponent(String(referralToken || affiliateCode))}`;

        [updatedAffiliate] = await db.insert(affiliates)
          .values({
            userId,
            affiliateCode,
            referralLink,
            commissionRate: commissionRate.toFixed(2),
            totalReferrals: Number(invitedCount?.count || 0),
            activeReferrals: 0,
          })
          .returning();
      }

      await logAdminAction(
        req.admin!.id,
        "settings_change",
        "free_play_referral_commission",
        userId,
        {
          newValue: JSON.stringify({
            userId,
            commissionRate: commissionRate.toFixed(2),
          }),
        },
        req,
      );

      return res.json({
        success: true,
        affiliate: updatedAffiliate,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/ads/campaigns", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const windowDays = parseWindowDays(req.query.windowDays, 30, 365);
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      const rows = await db.execute(sql`
        SELECT
          a.id,
          a.title,
          a.title_ar,
          a.type,
          a.asset_url,
          a.target_url,
          a.embed_code,
          a.display_duration,
          a.sort_order,
          a.is_active,
          a.starts_at,
          a.ends_at,
          a.created_at,
          a.updated_at,
          COALESCE(SUM(CASE WHEN e.event_type = 'view' THEN 1 ELSE 0 END), 0)::int AS tracked_views,
          COALESCE(SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END), 0)::int AS tracked_clicks,
          COALESCE(SUM(CASE WHEN e.event_type = 'reward_claim' THEN 1 ELSE 0 END), 0)::int AS reward_claims,
          COALESCE(SUM(CASE WHEN e.event_type = 'reward_claim' THEN COALESCE(e.reward_amount, 0)::numeric ELSE 0 END), 0)::text AS reward_total
        FROM advertisements a
        LEFT JOIN free_play_ad_events e
          ON e.advertisement_id = a.id
          AND e.created_at >= ${windowStart}
        GROUP BY a.id
        ORDER BY a.sort_order ASC, a.created_at DESC
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      return res.json({ campaigns: rows, windowDays });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/free-play/ads/analytics", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const windowDays = parseWindowDays(req.query.windowDays, 30, 365);
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      const [totals] = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(*) FILTER (WHERE event_type = 'reward_claim')::int AS reward_claims,
          COUNT(DISTINCT user_id)::int AS unique_users,
          COALESCE(SUM(CASE WHEN event_type = 'reward_claim' THEN COALESCE(reward_amount, 0)::numeric ELSE 0 END), 0)::text AS reward_total
        FROM free_play_ad_events
        WHERE created_at >= ${windowStart}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const [campaignSummary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_campaigns,
          COUNT(*) FILTER (WHERE is_active = true)::int AS active_campaigns
        FROM advertisements
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const topCampaigns = await db.execute(sql`
        SELECT
          a.id,
          a.title,
          a.type,
          COALESCE(SUM(CASE WHEN e.event_type = 'view' THEN 1 ELSE 0 END), 0)::int AS views,
          COALESCE(SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END), 0)::int AS clicks,
          COALESCE(SUM(CASE WHEN e.event_type = 'reward_claim' THEN 1 ELSE 0 END), 0)::int AS reward_claims,
          COALESCE(SUM(CASE WHEN e.event_type = 'reward_claim' THEN COALESCE(e.reward_amount, 0)::numeric ELSE 0 END), 0)::text AS reward_total
        FROM advertisements a
        LEFT JOIN free_play_ad_events e ON e.advertisement_id = a.id AND e.created_at >= ${windowStart}
        GROUP BY a.id
        ORDER BY clicks DESC, views DESC
        LIMIT 10
      `).then((result) => result.rows as Array<Record<string, unknown>>);

      const views = Number(totals?.views || 0);
      const clicks = Number(totals?.clicks || 0);
      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(2) : "0.00";

      return res.json({
        windowDays,
        totals: {
          views,
          clicks,
          rewardClaims: Number(totals?.reward_claims || 0),
          uniqueUsers: Number(totals?.unique_users || 0),
          rewardTotal: toDecimalString(totals?.reward_total),
          clickThroughRate: ctr,
          totalCampaigns: Number(campaignSummary?.total_campaigns || 0),
          activeCampaigns: Number(campaignSummary?.active_campaigns || 0),
        },
        topCampaigns,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/free-play/ads/upload-asset", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { data, mimeType, fileName } = req.body ?? {};
      if (!data || !mimeType || !fileName) {
        return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });
      }

      const normalizedMimeType = String(mimeType).trim().toLowerCase();
      const extension = ALLOWED_CAMPAIGN_ASSET_TYPES.get(normalizedMimeType);
      if (!extension) {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      const buffer = Buffer.from(String(data), "base64");
      if (!buffer.length) {
        return res.status(400).json({ error: "Invalid file payload" });
      }

      if (buffer.length > MAX_CAMPAIGN_ASSET_SIZE_BYTES) {
        return res.status(400).json({ error: "File is too large (max 20MB)" });
      }

      const objectName = `ads/assets/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const assetUrl = await uploadFile(objectName, buffer, normalizedMimeType);

      await logAdminAction(req.admin!.id, "settings_update", "free_play_ad_asset", objectName, {
        newValue: JSON.stringify({
          assetUrl,
          mimeType: normalizedMimeType,
          fileName: String(fileName).slice(0, 255),
          sizeBytes: buffer.length,
        }),
      }, req);

      return res.json({ assetUrl });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/free-play/ads/campaigns", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const payload = toCampaignPayload(req.body || {});
      const [created] = await db.insert(advertisements)
        .values({
          ...payload,
          createdBy: req.admin!.id,
        })
        .returning();

      await logAdminAction(req.admin!.id, "settings_update", "free_play_ad_campaign", created.id, {
        newValue: JSON.stringify(created),
      }, req);

      return res.status(201).json(created);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/free-play/ads/campaigns/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Campaign id is required" });
      }

      const [existing] = await db.select().from(advertisements).where(eq(advertisements.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const payload = toCampaignPayload({ ...existing, ...req.body });
      const [updated] = await db.update(advertisements)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(advertisements.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_update", "free_play_ad_campaign", id, {
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      }, req);

      return res.json(updated);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/free-play/ads/campaigns/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Campaign id is required" });
      }

      const [existing] = await db.select().from(advertisements).where(eq(advertisements.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      await db.delete(advertisements).where(eq(advertisements.id, id));

      await logAdminAction(req.admin!.id, "settings_update", "free_play_ad_campaign", id, {
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify({ deleted: true }),
      }, req);

      return res.json({ success: true });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
