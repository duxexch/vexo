import type { Express, Response } from "express";
import { storage } from "../../storage";
import {
  p2pOffers, p2pTrades, p2pDisputes,
  p2pTraderPaymentMethods,
  p2pTraderProfiles,
  users,
} from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { registerDisputeListingRoutes } from "./dispute-listing";
import { registerDisputeActionRoutes } from "./dispute-actions";
import { registerP2pSettingsRoutes } from "./settings";
import { registerP2pAnalyticsRoutes } from "./analytics";
import { registerP2pFreezeProgramAdminRoutes } from "./freeze-program";
import { getP2PUsernameMap } from "../../lib/p2p-username";
import { getBadgeEntitlementsForUsers, resolveEffectiveP2PMonthlyLimit } from "../../lib/user-badge-entitlements";

type P2PVerificationLevel = "none" | "email" | "phone" | "kyc_basic" | "kyc_full";

const p2pVerificationRank: Record<P2PVerificationLevel, number> = {
  none: 0,
  email: 1,
  phone: 2,
  kyc_basic: 3,
  kyc_full: 4,
};

function normalizeP2PVerificationLevel(raw: unknown): P2PVerificationLevel {
  if (raw === "none" || raw === "email" || raw === "phone" || raw === "kyc_basic" || raw === "kyc_full") {
    return raw;
  }

  return "none";
}

function inferP2PVerificationLevelFromUser(user: {
  phoneVerified?: boolean | null;
  emailVerified?: boolean | null;
  idVerificationStatus?: string | null;
}): P2PVerificationLevel {
  if (user.idVerificationStatus === "approved") {
    return "kyc_basic";
  }

  if (user.phoneVerified) {
    return "phone";
  }

  if (user.emailVerified) {
    return "email";
  }

  return "none";
}

function isVerificationBypassed(profileLevelRaw: unknown, user: {
  phoneVerified?: boolean | null;
  emailVerified?: boolean | null;
  idVerificationStatus?: string | null;
}): boolean {
  const profileLevel = normalizeP2PVerificationLevel(profileLevelRaw);
  const accountLevel = inferP2PVerificationLevelFromUser(user);

  return p2pVerificationRank[profileLevel] >= p2pVerificationRank.phone
    && p2pVerificationRank[accountLevel] < p2pVerificationRank.phone;
}

export function registerAdminP2pRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[Admin P2P] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

  // ==================== P2P STATS ====================

  app.get("/api/admin/p2p/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const [activeOffers] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pOffers)
        .where(eq(p2pOffers.status, "active"));

      const [completedTrades] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pTrades)
        .where(sql`${p2pTrades.status} = 'completed'`);

      const [pendingTrades] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pTrades)
        .where(sql`${p2pTrades.status} IN ('pending', 'paid', 'confirmed')`);

      const [openDisputes] = await db.select({ count: sql<number>`count(*)` })
        .from(p2pDisputes)
        .where(sql`${p2pDisputes.status} IN ('open', 'investigating')`);

      res.json({
        activeOffers: Number(activeOffers?.count) || 0,
        completedTrades: Number(completedTrades?.count) || 0,
        pendingTrades: Number(pendingTrades?.count) || 0,
        openDisputes: Number(openDisputes?.count) || 0,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== P2P OFFERS LIST ====================

  app.get("/api/admin/p2p/offers", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const offers = await db.select({
        id: p2pOffers.id,
        userId: p2pOffers.userId,
        type: p2pOffers.type,
        availableAmount: p2pOffers.availableAmount,
        price: p2pOffers.price,
        cryptoCurrency: p2pOffers.cryptoCurrency,
        fiatCurrency: p2pOffers.fiatCurrency,
        minLimit: p2pOffers.minLimit,
        maxLimit: p2pOffers.maxLimit,
        paymentMethods: p2pOffers.paymentMethods,
        status: p2pOffers.status,
        createdAt: p2pOffers.createdAt,
        username: users.username,
      })
        .from(p2pOffers)
        .leftJoin(users, eq(p2pOffers.userId, users.id))
        .orderBy(desc(p2pOffers.createdAt))
        .limit(100);

      const formattedOffers = offers.map(offer => ({
        ...offer,
        amount: offer.availableAmount,
        currency: `${offer.cryptoCurrency}/${offer.fiatCurrency}`,
      }));

      const usernamesByUserId = await getP2PUsernameMap(formattedOffers.map((offer) => offer.userId));

      const normalizedOffers = formattedOffers.map((offer) => ({
        ...offer,
        username: usernamesByUserId.get(offer.userId) || offer.username || "trader_user",
      }));

      res.json(normalizedOffers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== P2P TRADES LIST ====================

  app.get("/api/admin/p2p/trades", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const trades = await db.select()
        .from(p2pTrades)
        .orderBy(desc(p2pTrades.createdAt))
        .limit(100);

      const usernamesByUserId = await getP2PUsernameMap(trades.flatMap((trade) => [trade.buyerId, trade.sellerId]));

      const tradesWithUsers = trades.map((trade) => ({
        ...trade,
        buyerUsername: usernamesByUserId.get(trade.buyerId) || "trader_user",
        sellerUsername: usernamesByUserId.get(trade.sellerId) || "trader_user",
      }));

      res.json(tradesWithUsers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AD POSTING PERMISSIONS ====================

  app.get("/api/admin/p2p/ad-permissions", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const q = typeof _req.query.q === "string" ? _req.query.q.trim().toLowerCase() : "";
      const requestedLimit = Number(_req.query.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
        : 100;

      const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof sql>> = [eq(users.role, "player")];
      if (q) {
        const likePattern = `%${q}%`;
        conditions.push(sql`(
          lower(${users.username}) LIKE ${likePattern}
          OR lower(coalesce(${users.email}, '')) LIKE ${likePattern}
        )`);
      }

      const userRows = await db.select({
        userId: users.id,
        username: users.username,
        email: users.email,
        p2pBanned: users.p2pBanned,
        p2pBanReason: users.p2pBanReason,
        phoneVerified: users.phoneVerified,
        emailVerified: users.emailVerified,
        idVerificationStatus: users.idVerificationStatus,
        profileVerificationLevel: p2pTraderProfiles.verificationLevel,
        canCreateOffers: p2pTraderProfiles.canCreateOffers,
        canTradeP2P: p2pTraderProfiles.canTradeP2P,
        monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        createdAt: users.createdAt,
      })
        .from(users)
        .leftJoin(p2pTraderProfiles, eq(users.id, p2pTraderProfiles.userId))
        .where(and(...conditions))
        .orderBy(desc(users.createdAt))
        .limit(limit);

      const userIds = userRows.map((row) => row.userId);
      if (userIds.length === 0) {
        return res.json([]);
      }

      const badgeEntitlementsMap = await getBadgeEntitlementsForUsers(userIds);

      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

      const [paymentMethodCounts, activeOfferCounts, buyerMonthlyVolumes, sellerMonthlyVolumes] = await Promise.all([
        db.select({
          userId: p2pTraderPaymentMethods.userId,
          count: sql<number>`count(*)`,
        })
          .from(p2pTraderPaymentMethods)
          .where(and(
            inArray(p2pTraderPaymentMethods.userId, userIds),
            eq(p2pTraderPaymentMethods.isActive, true),
          ))
          .groupBy(p2pTraderPaymentMethods.userId),
        db.select({
          userId: p2pOffers.userId,
          count: sql<number>`count(*)`,
        })
          .from(p2pOffers)
          .where(and(
            inArray(p2pOffers.userId, userIds),
            eq(p2pOffers.status, "active"),
          ))
          .groupBy(p2pOffers.userId),
        db.select({
          userId: p2pTrades.buyerId,
          total: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as numeric)), 0)`,
        })
          .from(p2pTrades)
          .where(and(
            inArray(p2pTrades.buyerId, userIds),
            ne(p2pTrades.status, "cancelled"),
            gte(p2pTrades.createdAt, monthStart),
            lt(p2pTrades.createdAt, nextMonthStart),
          ))
          .groupBy(p2pTrades.buyerId),
        db.select({
          userId: p2pTrades.sellerId,
          total: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as numeric)), 0)`,
        })
          .from(p2pTrades)
          .where(and(
            inArray(p2pTrades.sellerId, userIds),
            ne(p2pTrades.status, "cancelled"),
            gte(p2pTrades.createdAt, monthStart),
            lt(p2pTrades.createdAt, nextMonthStart),
          ))
          .groupBy(p2pTrades.sellerId),
      ]);

      const paymentCountMap = new Map(paymentMethodCounts.map((row) => [row.userId, Number(row.count) || 0]));
      const activeOfferCountMap = new Map(activeOfferCounts.map((row) => [row.userId, Number(row.count) || 0]));
      const monthlyVolumeMap = new Map<string, number>();

      for (const row of buyerMonthlyVolumes) {
        monthlyVolumeMap.set(row.userId, (monthlyVolumeMap.get(row.userId) || 0) + Number(row.total || 0));
      }

      for (const row of sellerMonthlyVolumes) {
        monthlyVolumeMap.set(row.userId, (monthlyVolumeMap.get(row.userId) || 0) + Number(row.total || 0));
      }

      res.json(userRows.map((row) => {
        const badgeEntitlements = badgeEntitlementsMap.get(row.userId);
        const hasProfile = row.canTradeP2P !== null && row.canTradeP2P !== undefined;
        const baseMonthlyTradeLimit = row.monthlyTradeLimit !== null && row.monthlyTradeLimit !== undefined
          ? Number(row.monthlyTradeLimit)
          : null;
        const effectiveMonthlyTradeLimit = resolveEffectiveP2PMonthlyLimit(
          baseMonthlyTradeLimit,
          badgeEntitlements?.maxP2PMonthlyLimit ?? null,
          hasProfile,
        );
        const effectiveCanTradeP2P = Boolean(row.canTradeP2P) || Boolean(badgeEntitlements?.grantsP2pPrivileges);
        const effectiveCanCreateOffers = Boolean(row.canCreateOffers) || Boolean(badgeEntitlements?.grantsP2pPrivileges);

        return {
          ...row,
          verificationBypassed: isVerificationBypassed(row.profileVerificationLevel, {
            phoneVerified: row.phoneVerified,
            emailVerified: row.emailVerified,
            idVerificationStatus: row.idVerificationStatus,
          }),
          canCreateOffers: effectiveCanCreateOffers,
          canTradeP2P: effectiveCanTradeP2P,
          monthlyTradeLimit: effectiveMonthlyTradeLimit,
          monthlyTradedAmount: monthlyVolumeMap.get(row.userId) || 0,
          activePaymentMethodCount: paymentCountMap.get(row.userId) || 0,
          activeOfferCount: activeOfferCountMap.get(row.userId) || 0,
        };
      }));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/p2p/ad-permissions/:userId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const hasCanCreateOffers = typeof req.body?.canCreateOffers === "boolean";
      const hasCanTradeP2P = typeof req.body?.canTradeP2P === "boolean";
      const hasMonthlyTradeLimit = Object.prototype.hasOwnProperty.call(req.body ?? {}, "monthlyTradeLimit");
      const hasBypassVerification = typeof req.body?.bypassVerification === "boolean";

      if (!hasCanCreateOffers && !hasCanTradeP2P && !hasMonthlyTradeLimit && !hasBypassVerification) {
        return res.status(400).json({ error: "At least one permission field is required" });
      }

      let canCreateOffers = hasCanCreateOffers ? Boolean(req.body.canCreateOffers) : undefined;
      let canTradeP2P = hasCanTradeP2P ? Boolean(req.body.canTradeP2P) : undefined;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
      const bypassVerification = hasBypassVerification ? Boolean(req.body.bypassVerification) : undefined;

      // Publishing ads requires trading permission too.
      if (canCreateOffers === true && canTradeP2P === undefined) {
        canTradeP2P = true;
      }

      if (canCreateOffers === true && canTradeP2P === false) {
        return res.status(400).json({ error: "canTradeP2P must be true when canCreateOffers is true" });
      }

      let monthlyTradeLimit: string | null | undefined = undefined;
      if (hasMonthlyTradeLimit) {
        const rawMonthlyTradeLimit = req.body?.monthlyTradeLimit;
        if (rawMonthlyTradeLimit === null || rawMonthlyTradeLimit === "") {
          monthlyTradeLimit = null;
        } else {
          const parsedLimit = Number(rawMonthlyTradeLimit);
          if (!Number.isFinite(parsedLimit) || parsedLimit < 0 || parsedLimit > 1_000_000_000) {
            return res.status(400).json({ error: "monthlyTradeLimit must be a valid number between 0 and 1,000,000,000" });
          }
          monthlyTradeLimit = parsedLimit.toFixed(2);
        }
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.role !== "player") {
        return res.status(400).json({ error: "Ad posting permission can only be updated for player accounts" });
      }

      const [existingProfile] = await db
        .select({
          id: p2pTraderProfiles.id,
          verificationLevel: p2pTraderProfiles.verificationLevel,
          canCreateOffers: p2pTraderProfiles.canCreateOffers,
          canTradeP2P: p2pTraderProfiles.canTradeP2P,
          monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, userId))
        .limit(1);

      const effectiveCanTradeP2P = canTradeP2P !== undefined
        ? canTradeP2P
        : (existingProfile?.canTradeP2P ?? false);

      let effectiveCanCreateOffers = canCreateOffers !== undefined
        ? canCreateOffers
        : (existingProfile?.canCreateOffers ?? false);

      // Ads cannot remain enabled when trading itself is disabled.
      if (!effectiveCanTradeP2P && effectiveCanCreateOffers) {
        effectiveCanCreateOffers = false;
      }

      const inferredVerificationLevel = inferP2PVerificationLevelFromUser({
        phoneVerified: targetUser.phoneVerified,
        emailVerified: targetUser.emailVerified,
        idVerificationStatus: targetUser.idVerificationStatus,
      });

      const existingVerificationLevel = normalizeP2PVerificationLevel(existingProfile?.verificationLevel);

      let effectiveVerificationLevel: P2PVerificationLevel;
      if (bypassVerification === true) {
        effectiveVerificationLevel = p2pVerificationRank[existingVerificationLevel] >= p2pVerificationRank.phone
          ? existingVerificationLevel
          : "phone";
      } else if (bypassVerification === false) {
        effectiveVerificationLevel = inferredVerificationLevel;
      } else if (existingProfile) {
        effectiveVerificationLevel = existingVerificationLevel;
      } else {
        effectiveVerificationLevel = inferredVerificationLevel;
      }

      let updatedProfile;
      if (existingProfile) {
        const profileUpdateValues: {
          verificationLevel: P2PVerificationLevel;
          canCreateOffers: boolean;
          canTradeP2P: boolean;
          monthlyTradeLimit?: string | null;
          updatedAt: Date;
        } = {
          verificationLevel: effectiveVerificationLevel,
          canCreateOffers: effectiveCanCreateOffers,
          canTradeP2P: effectiveCanTradeP2P,
          updatedAt: new Date(),
        };

        if (monthlyTradeLimit !== undefined) {
          profileUpdateValues.monthlyTradeLimit = monthlyTradeLimit;
        }

        [updatedProfile] = await db
          .update(p2pTraderProfiles)
          .set(profileUpdateValues)
          .where(eq(p2pTraderProfiles.userId, userId))
          .returning();
      } else {
        [updatedProfile] = await db
          .insert(p2pTraderProfiles)
          .values({
            userId,
            verificationLevel: effectiveVerificationLevel,
            canCreateOffers: effectiveCanCreateOffers,
            canTradeP2P: effectiveCanTradeP2P,
            monthlyTradeLimit: monthlyTradeLimit ?? null,
          })
          .returning();
      }

      await logAdminAction(
        req.admin!.id,
        "p2p_trader_permission_update",
        "p2p_trader_profile",
        updatedProfile.id,
        {
          previousValue: JSON.stringify({
            verificationLevel: existingProfile?.verificationLevel ?? inferredVerificationLevel,
            canCreateOffers: existingProfile?.canCreateOffers ?? false,
            canTradeP2P: existingProfile?.canTradeP2P ?? false,
            monthlyTradeLimit: existingProfile?.monthlyTradeLimit ?? null,
          }),
          newValue: JSON.stringify({
            verificationLevel: updatedProfile.verificationLevel,
            canCreateOffers: updatedProfile.canCreateOffers,
            canTradeP2P: updatedProfile.canTradeP2P,
            monthlyTradeLimit: updatedProfile.monthlyTradeLimit,
          }),
          reason,
          metadata: JSON.stringify({
            userId,
            verificationLevel: updatedProfile.verificationLevel,
            verificationBypassed: isVerificationBypassed(updatedProfile.verificationLevel, {
              phoneVerified: targetUser.phoneVerified,
              emailVerified: targetUser.emailVerified,
              idVerificationStatus: targetUser.idVerificationStatus,
            }),
            canCreateOffers: updatedProfile.canCreateOffers,
            canTradeP2P: updatedProfile.canTradeP2P,
            monthlyTradeLimit: updatedProfile.monthlyTradeLimit,
          }),
        },
        req,
      );

      const previousCanCreateOffers = existingProfile?.canCreateOffers ?? false;
      const previousCanTradeP2P = existingProfile?.canTradeP2P ?? false;
      const previousBypassVerification = isVerificationBypassed(existingProfile?.verificationLevel, {
        phoneVerified: targetUser.phoneVerified,
        emailVerified: targetUser.emailVerified,
        idVerificationStatus: targetUser.idVerificationStatus,
      });
      const currentCanCreateOffers = Boolean(updatedProfile.canCreateOffers);
      const currentCanTradeP2P = Boolean(updatedProfile.canTradeP2P);
      const currentBypassVerification = isVerificationBypassed(updatedProfile.verificationLevel, {
        phoneVerified: targetUser.phoneVerified,
        emailVerified: targetUser.emailVerified,
        idVerificationStatus: targetUser.idVerificationStatus,
      });

      if (!previousCanCreateOffers && currentCanCreateOffers) {
        await notifyWithLog(userId, {
          type: "success",
          priority: "high",
          title: "P2P Ad Posting Enabled",
          titleAr: "تم تفعيل نشر إعلانات P2P",
          message: `Your account is now approved to publish P2P ads.${reason ? ` Note: ${reason}` : ""}`,
          messageAr: `حسابك أصبح معتمدًا لنشر إعلانات P2P.${reason ? ` ملاحظة: ${reason}` : ""}`,
          link: "/p2p",
          metadata: JSON.stringify({ action: "ad_permission_enabled" }),
        }, "ad-permission:grant");
      } else if (previousCanCreateOffers && !currentCanCreateOffers) {
        await notifyWithLog(userId, {
          type: "warning",
          priority: "high",
          title: "P2P Ad Posting Restricted",
          titleAr: "تم تقييد نشر إعلانات P2P",
          message: `Your ability to publish P2P ads has been restricted.${reason ? ` Reason: ${reason}` : ""}`,
          messageAr: `تم تقييد قدرتك على نشر إعلانات P2P.${reason ? ` السبب: ${reason}` : ""}`,
          link: "/p2p",
          metadata: JSON.stringify({ action: "ad_permission_disabled" }),
        }, "ad-permission:revoke");
      }

      if (!previousCanTradeP2P && currentCanTradeP2P) {
        await notifyWithLog(userId, {
          type: "success",
          priority: "high",
          title: "P2P Trading Enabled",
          titleAr: "تم تفعيل تداول P2P",
          message: `Your account is now approved for P2P trading.${reason ? ` Note: ${reason}` : ""}`,
          messageAr: `حسابك أصبح معتمدًا لتداول P2P.${reason ? ` ملاحظة: ${reason}` : ""}`,
          link: "/p2p",
          metadata: JSON.stringify({ action: "trading_permission_enabled" }),
        }, "trade-permission:grant");
      } else if (previousCanTradeP2P && !currentCanTradeP2P) {
        await notifyWithLog(userId, {
          type: "warning",
          priority: "high",
          title: "P2P Trading Restricted",
          titleAr: "تم تقييد تداول P2P",
          message: `Your P2P trading permission has been restricted.${reason ? ` Reason: ${reason}` : ""}`,
          messageAr: `تم تقييد صلاحية تداول P2P.${reason ? ` السبب: ${reason}` : ""}`,
          link: "/p2p",
          metadata: JSON.stringify({ action: "trading_permission_disabled" }),
        }, "trade-permission:revoke");
      }

      if (monthlyTradeLimit !== undefined) {
        await notifyWithLog(userId, {
          type: "system",
          priority: "normal",
          title: "P2P Monthly Limit Updated",
          titleAr: "تم تحديث الحد الشهري لتداول P2P",
          message: monthlyTradeLimit === null
            ? "Your monthly P2P trading limit was removed by an administrator."
            : `Your monthly P2P trading limit is now ${monthlyTradeLimit}.`,
          messageAr: monthlyTradeLimit === null
            ? "تمت إزالة الحد الشهري لتداول P2P بواسطة الإدارة."
            : `الحد الشهري لتداول P2P أصبح ${monthlyTradeLimit}.`,
          link: "/p2p",
          metadata: JSON.stringify({ action: "monthly_limit_updated", monthlyTradeLimit }),
        }, "trade-limit:update");
      }

      if (!previousBypassVerification && currentBypassVerification) {
        await notifyWithLog(userId, {
          type: "warning",
          priority: "high",
          title: "P2P Verification Override Enabled",
          titleAr: "تم تفعيل تجاوز توثيق P2P",
          message: "An administrator enabled a verification override for your P2P permissions.",
          messageAr: "قامت الإدارة بتفعيل تجاوز التوثيق لصلاحيات P2P الخاصة بك.",
          link: "/p2p",
          metadata: JSON.stringify({ action: "verification_override_enabled" }),
        }, "verification-override:grant");
      } else if (previousBypassVerification && !currentBypassVerification) {
        await notifyWithLog(userId, {
          type: "system",
          priority: "normal",
          title: "P2P Verification Override Removed",
          titleAr: "تم إلغاء تجاوز توثيق P2P",
          message: "Your P2P verification override has been removed and account verification rules now apply.",
          messageAr: "تم إلغاء تجاوز توثيق P2P وأصبحت قواعد التوثيق المعتادة مطبقة.",
          link: "/p2p",
          metadata: JSON.stringify({ action: "verification_override_removed" }),
        }, "verification-override:revoke");
      }

      res.json({
        success: true,
        userId,
        verificationLevel: updatedProfile.verificationLevel,
        verificationBypassed: currentBypassVerification,
        canCreateOffers: updatedProfile.canCreateOffers,
        canTradeP2P: updatedProfile.canTradeP2P,
        monthlyTradeLimit: updatedProfile.monthlyTradeLimit,
        updatedAt: updatedProfile.updatedAt,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== CANCEL OFFER ====================

  app.post("/api/admin/p2p/offers/:id/cancel", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [updated] = await db.update(p2pOffers)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(p2pOffers.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "p2p_offer_cancel", "p2p_offer", id, { reason }, req);

      // Notify offer owner about admin cancellation
      if (updated?.userId) {
        await notifyWithLog(updated.userId, {
          type: 'warning',
          priority: 'high',
          title: 'P2P Offer Cancelled by Admin',
          titleAr: 'تم إلغاء عرض P2P بواسطة الإدارة',
          message: `Your P2P offer has been cancelled by an administrator.${reason ? ' Reason: ' + reason : ''}`,
          messageAr: `تم إلغاء عرض P2P الخاص بك بواسطة الإدارة.${reason ? ' السبب: ' + reason : ''}`,
          link: '/p2p',
          metadata: JSON.stringify({ offerId: id, action: 'admin_cancel', reason }),
        }, "cancel-offer");
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Register sub-modules
  registerDisputeListingRoutes(app);
  registerDisputeActionRoutes(app);
  registerP2pSettingsRoutes(app);
  registerP2pAnalyticsRoutes(app);
  registerP2pFreezeProgramAdminRoutes(app);
}
