import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "./middleware";
import { getErrorMessage } from "./helpers";
import { storage } from "../storage";
import { db } from "../db";
import {
    countryPaymentMethods,
    p2pBadgeDefinitions,
    p2pSettings,
    p2pTraderBadges,
    p2pTraderMetrics,
    p2pTraderPaymentMethods,
    p2pTraderProfiles,
    p2pTrades,
} from "@shared/schema";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { sanitizePlainText } from "../lib/input-security";
import {
    ensureP2PUsername,
    getP2PUsernameMap,
    getP2PUsernameSettings,
    updateP2PUsernameOnce,
} from "../lib/p2p-username";
import { getBadgeEntitlementForUser, resolveEffectiveP2PMonthlyLimit } from "../lib/user-badge-entitlements";

function toNumber(value: string | number | null | undefined, fallback = 0): number {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function pickLargestMetricValue(...values: Array<string | number | null | undefined>): number {
    let largest = 0;

    for (const value of values) {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue) && numericValue > largest) {
            largest = numericValue;
        }
    }

    return largest;
}

function maskAccountNumber(accountNumber: string | null): string {
    if (!accountNumber) return "";
    const trimmed = accountNumber.trim();
    if (trimmed.length <= 4) return "****";
    return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export function registerP2PProfileRoutes(app: Express): void {
    app.get("/api/p2p/profile/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.params.userId === "me" ? req.user!.id : req.params.userId;
            const includePrivateProfileContext = req.user!.id === userId;
            const user = await storage.getUser(userId);

            if (!user) return res.status(404).json({ error: "User not found" });

            const [profile] = await db
                .select()
                .from(p2pTraderProfiles)
                .where(eq(p2pTraderProfiles.userId, userId))
                .limit(1);

            const [metrics] = await db
                .select()
                .from(p2pTraderMetrics)
                .where(eq(p2pTraderMetrics.userId, userId))
                .limit(1);

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const [derivedTradeStats] = await db
                .select({
                    totalTrades: sql<string>`count(*)`,
                    completedTrades: sql<string>`coalesce(sum(case when ${p2pTrades.status} = 'completed' then 1 else 0 end), 0)`,
                    cancelledTrades: sql<string>`coalesce(sum(case when ${p2pTrades.status} = 'cancelled' then 1 else 0 end), 0)`,
                    totalBuyTrades: sql<string>`coalesce(sum(case when ${p2pTrades.buyerId} = ${userId} then 1 else 0 end), 0)`,
                    totalSellTrades: sql<string>`coalesce(sum(case when ${p2pTrades.sellerId} = ${userId} then 1 else 0 end), 0)`,
                    totalVolumeUsdt: sql<string>`coalesce(sum(case when ${p2pTrades.status} <> 'cancelled' then cast(${p2pTrades.fiatAmount} as numeric) else 0 end), 0)`,
                    trades30d: sql<string>`coalesce(sum(case when ${p2pTrades.createdAt} >= ${thirtyDaysAgo} then 1 else 0 end), 0)`,
                    completed30d: sql<string>`coalesce(sum(case when ${p2pTrades.createdAt} >= ${thirtyDaysAgo} and ${p2pTrades.status} = 'completed' then 1 else 0 end), 0)`,
                    volume30d: sql<string>`coalesce(sum(case when ${p2pTrades.createdAt} >= ${thirtyDaysAgo} and ${p2pTrades.status} <> 'cancelled' then cast(${p2pTrades.fiatAmount} as numeric) else 0 end), 0)`,
                    firstTradeAt: sql<Date | null>`min(${p2pTrades.createdAt})`,
                    lastTradeAt: sql<Date | null>`max(${p2pTrades.createdAt})`,
                })
                .from(p2pTrades)
                .where(or(eq(p2pTrades.buyerId, userId), eq(p2pTrades.sellerId, userId)));

            const p2pUsernameSettings = await getP2PUsernameSettings(userId);
            const badgeEntitlements = await getBadgeEntitlementForUser(userId);
            const baseMonthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
                ? Number(profile.monthlyTradeLimit)
                : null;
            const effectiveMonthlyTradeLimit = resolveEffectiveP2PMonthlyLimit(
                baseMonthlyLimit,
                badgeEntitlements.maxP2PMonthlyLimit,
                Boolean(profile),
            );
            const canTradeP2P = Boolean(profile?.canTradeP2P) || badgeEntitlements.grantsP2pPrivileges;
            const canCreateOffers = Boolean(profile?.canCreateOffers) || badgeEntitlements.grantsP2pPrivileges;

            const badges = await db
                .select({
                    slug: p2pBadgeDefinitions.slug,
                    name: p2pBadgeDefinitions.name,
                    nameAr: p2pBadgeDefinitions.nameAr,
                    icon: p2pBadgeDefinitions.icon,
                    color: p2pBadgeDefinitions.color,
                    earnedAt: p2pTraderBadges.earnedAt,
                })
                .from(p2pTraderBadges)
                .innerJoin(p2pBadgeDefinitions, eq(p2pTraderBadges.badgeSlug, p2pBadgeDefinitions.slug))
                .where(eq(p2pTraderBadges.userId, userId))
                .orderBy(desc(p2pTraderBadges.earnedAt));

            const paymentMethods = await db
                .select({
                    id: p2pTraderPaymentMethods.id,
                    type: p2pTraderPaymentMethods.type,
                    name: p2pTraderPaymentMethods.name,
                    displayLabel: p2pTraderPaymentMethods.displayLabel,
                    holderName: p2pTraderPaymentMethods.holderName,
                    isVerified: p2pTraderPaymentMethods.isVerified,
                })
                .from(p2pTraderPaymentMethods)
                .where(and(eq(p2pTraderPaymentMethods.userId, userId), eq(p2pTraderPaymentMethods.isActive, true)))
                .orderBy(asc(p2pTraderPaymentMethods.sortOrder), asc(p2pTraderPaymentMethods.createdAt));

            const recentTradeRows = await db
                .select()
                .from(p2pTrades)
                .where(
                    and(
                        or(eq(p2pTrades.buyerId, userId), eq(p2pTrades.sellerId, userId)),
                        eq(p2pTrades.status, "completed"),
                    ),
                )
                .orderBy(desc(p2pTrades.completedAt), desc(p2pTrades.createdAt))
                .limit(10);

            const recentCounterpartyIds = recentTradeRows.map((trade) => (trade.buyerId === userId ? trade.sellerId : trade.buyerId));
            const p2pUsernamesByUserId = await getP2PUsernameMap(recentCounterpartyIds);

            const recentTrades = recentTradeRows.map((trade) => {
                const counterpartyId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;
                return {
                    id: trade.id,
                    type: trade.buyerId === userId ? "buy" : "sell",
                    amount: trade.amount,
                    currency: trade.currencyType === "project" ? "VEX" : "USD",
                    fiatAmount: trade.fiatAmount,
                    counterparty: p2pUsernamesByUserId.get(counterpartyId) || "Unknown",
                    status: trade.status,
                    completedAt: trade.completedAt || trade.updatedAt,
                };
            });

            const derivedTotalTrades = toNumber(derivedTradeStats?.totalTrades);
            const derivedCompletedTrades = toNumber(derivedTradeStats?.completedTrades);
            const derivedCancelledTrades = toNumber(derivedTradeStats?.cancelledTrades);
            const derivedBuyTrades = toNumber(derivedTradeStats?.totalBuyTrades);
            const derivedSellTrades = toNumber(derivedTradeStats?.totalSellTrades);
            const derivedVolumeUsdt = toNumber(derivedTradeStats?.totalVolumeUsdt);
            const derivedTrades30d = toNumber(derivedTradeStats?.trades30d);
            const derivedCompleted30d = toNumber(derivedTradeStats?.completed30d);
            const derivedVolume30d = toNumber(derivedTradeStats?.volume30d);

            const totalTrades = pickLargestMetricValue(metrics?.totalTrades, user.p2pTotalTrades, derivedTotalTrades);
            const completedTrades = pickLargestMetricValue(metrics?.completedTrades, user.p2pSuccessfulTrades, derivedCompletedTrades);
            const cancelledTrades = pickLargestMetricValue(metrics?.cancelledTrades, derivedCancelledTrades);
            const totalBuyTrades = pickLargestMetricValue(metrics?.totalBuyTrades, derivedBuyTrades);
            const totalSellTrades = pickLargestMetricValue(metrics?.totalSellTrades, derivedSellTrades);
            const totalVolumeUsdt = pickLargestMetricValue(metrics?.totalVolumeUsdt, derivedVolumeUsdt);
            const trades30d = pickLargestMetricValue(metrics?.trades30d, derivedTrades30d);
            const volume30d = pickLargestMetricValue(metrics?.volume30d, derivedVolume30d);

            const calculatedCompletionRate = totalTrades > 0 ? (completedTrades / totalTrades) * 100 : 0;
            const completionRate = pickLargestMetricValue(metrics?.completionRate, calculatedCompletionRate);

            const totalDisputes = toNumber(metrics?.totalDisputes);
            const calculatedDisputeRate = totalTrades > 0 ? (totalDisputes / totalTrades) * 100 : 0;
            const disputeRate = pickLargestMetricValue(metrics?.disputeRate, calculatedDisputeRate);

            const completion30dCalculated = derivedTrades30d > 0
                ? (derivedCompleted30d / derivedTrades30d) * 100
                : 0;
            const completion30d = pickLargestMetricValue(metrics?.completion30d, completion30dCalculated);

            const profileVerificationLevel = profile?.verificationLevel
                || (user.idVerificationStatus === "approved"
                    ? "kyc_basic"
                    : user.phoneVerified
                        ? "phone"
                        : user.emailVerified
                            ? "email"
                            : "none");

            const derivedDisplayName = profile?.displayName?.trim()
                || p2pUsernameSettings.p2pUsername
                || `${user.firstName || ""} ${user.lastName || ""}`.trim()
                || user.username;

            res.json({
                id: userId,
                username: user.username,
                p2pUsername: p2pUsernameSettings.p2pUsername,
                p2pUsernameChangeCount: p2pUsernameSettings.p2pUsernameChangeCount,
                canChangeP2PUsername: p2pUsernameSettings.canChangeP2PUsername,
                displayName: derivedDisplayName,
                bio: profile?.bio || "",
                region: profile?.region || "",
                verificationLevel: profileVerificationLevel,
                isOnline: profile?.isOnline || false,
                lastSeenAt: profile?.lastSeenAt || user.createdAt,
                memberSince: user.createdAt,
                account: includePrivateProfileContext
                    ? {
                        accountId: user.accountId || null,
                        emailVerified: Boolean(user.emailVerified),
                        phoneVerified: Boolean(user.phoneVerified),
                        idVerificationStatus: user.idVerificationStatus || "none",
                    }
                    : null,
                settings: includePrivateProfileContext
                    ? {
                        canTradeP2P,
                        canCreateOffers,
                        monthlyTradeLimit: effectiveMonthlyTradeLimit !== null
                            ? effectiveMonthlyTradeLimit.toFixed(2)
                            : null,
                        autoReplyEnabled: profile?.autoReplyEnabled ?? false,
                        notifyOnTrade: profile?.notifyOnTrade ?? true,
                        notifyOnDispute: profile?.notifyOnDispute ?? true,
                        notifyOnMessage: profile?.notifyOnMessage ?? true,
                    }
                    : null,
                trustBadge: badgeEntitlements.topBadge,
                metrics: {
                    totalTrades,
                    completedTrades,
                    cancelledTrades,
                    completionRate,
                    totalBuyTrades,
                    totalSellTrades,
                    totalVolumeUsdt: totalVolumeUsdt.toFixed(2),
                    totalDisputes,
                    disputesWon: toNumber(metrics?.disputesWon),
                    disputesLost: toNumber(metrics?.disputesLost),
                    disputeRate,
                    avgReleaseTimeSeconds: toNumber(metrics?.avgReleaseTimeSeconds),
                    avgPaymentTimeSeconds: toNumber(metrics?.avgPaymentTimeSeconds),
                    avgResponseTimeSeconds: toNumber(metrics?.avgResponseTimeSeconds),
                    positiveRatings: toNumber(metrics?.positiveRatings),
                    negativeRatings: toNumber(metrics?.negativeRatings),
                    overallRating: pickLargestMetricValue(metrics?.overallRating, user.p2pRating),
                    trades30d,
                    completion30d,
                    volume30d: volume30d.toFixed(2),
                    firstTradeAt: metrics?.firstTradeAt || derivedTradeStats?.firstTradeAt || null,
                    lastTradeAt: metrics?.lastTradeAt || derivedTradeStats?.lastTradeAt || null,
                },
                badges,
                paymentMethods,
                recentTrades,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/p2p/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const displayName = req.body?.displayName ? sanitizePlainText(req.body.displayName, { maxLength: 80 }) : null;
            const bio = req.body?.bio ? sanitizePlainText(req.body.bio, { maxLength: 500 }) : null;
            const region = req.body?.region ? sanitizePlainText(req.body.region, { maxLength: 80 }) : null;

            const [existing] = await db
                .select()
                .from(p2pTraderProfiles)
                .where(eq(p2pTraderProfiles.userId, req.user!.id))
                .limit(1);

            let updated;
            if (existing) {
                [updated] = await db
                    .update(p2pTraderProfiles)
                    .set({ displayName, bio, region, updatedAt: new Date() })
                    .where(eq(p2pTraderProfiles.userId, req.user!.id))
                    .returning();
            } else {
                [updated] = await db
                    .insert(p2pTraderProfiles)
                    .values({ userId: req.user!.id, displayName, bio, region })
                    .returning();
            }

            res.json({ success: true, profile: updated });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/p2p/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const [profile] = await db
                .select()
                .from(p2pTraderProfiles)
                .where(eq(p2pTraderProfiles.userId, req.user!.id))
                .limit(1);

            const [globalSettings] = await db.select().from(p2pSettings).limit(1);
            const p2pUsernameSettings = await getP2PUsernameSettings(req.user!.id);

            res.json({
                p2pUsername: p2pUsernameSettings.p2pUsername,
                p2pUsernameChangeCount: p2pUsernameSettings.p2pUsernameChangeCount,
                canChangeP2PUsername: p2pUsernameSettings.canChangeP2PUsername,
                autoReplyEnabled: profile?.autoReplyEnabled || false,
                autoReplyMessage: profile?.autoReplyMessage || "",
                notifyOnTrade: profile?.notifyOnTrade ?? true,
                notifyOnDispute: profile?.notifyOnDispute ?? true,
                notifyOnMessage: profile?.notifyOnMessage ?? true,
                preferredCurrencies: profile?.preferredCurrencies || ["USD"],
                tradeLimits: {
                    minBuy: String(globalSettings?.minTradeAmount || "10"),
                    maxBuy: String(globalSettings?.maxTradeAmount || "100000"),
                    minSell: String(globalSettings?.minTradeAmount || "10"),
                    maxSell: String(globalSettings?.maxTradeAmount || "100000"),
                },
                autoConfirmEnabled: false,
                autoConfirmDelayMinutes: 15,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/p2p/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const autoReplyMessage = req.body?.autoReplyMessage
                ? sanitizePlainText(req.body.autoReplyMessage, { maxLength: 500 })
                : null;

            const requestedP2PUsername = typeof req.body?.p2pUsername === "string"
                ? req.body.p2pUsername
                : undefined;

            let p2pUsernameSettings;
            if (requestedP2PUsername !== undefined) {
                p2pUsernameSettings = await updateP2PUsernameOnce(req.user!.id, requestedP2PUsername);
            } else {
                await ensureP2PUsername(req.user!.id, req.user!.username);
                p2pUsernameSettings = await getP2PUsernameSettings(req.user!.id);
            }

            const preferredCurrencies = Array.isArray(req.body?.preferredCurrencies)
                ? req.body.preferredCurrencies.map((c: unknown) => sanitizePlainText(String(c), { maxLength: 10 }).toUpperCase())
                : undefined;

            const [existing] = await db
                .select()
                .from(p2pTraderProfiles)
                .where(eq(p2pTraderProfiles.userId, req.user!.id))
                .limit(1);

            const payload = {
                autoReplyEnabled: req.body?.autoReplyEnabled ?? existing?.autoReplyEnabled ?? false,
                autoReplyMessage,
                notifyOnTrade: req.body?.notifyOnTrade ?? existing?.notifyOnTrade ?? true,
                notifyOnDispute: req.body?.notifyOnDispute ?? existing?.notifyOnDispute ?? true,
                notifyOnMessage: req.body?.notifyOnMessage ?? existing?.notifyOnMessage ?? true,
                preferredCurrencies: preferredCurrencies ?? existing?.preferredCurrencies ?? ["USD"],
                updatedAt: new Date(),
            };

            let updated;
            if (existing) {
                [updated] = await db
                    .update(p2pTraderProfiles)
                    .set(payload)
                    .where(eq(p2pTraderProfiles.userId, req.user!.id))
                    .returning();
            } else {
                [updated] = await db
                    .insert(p2pTraderProfiles)
                    .values({ userId: req.user!.id, ...payload })
                    .returning();
            }

            res.json({
                success: true,
                settings: updated,
                p2pUsername: p2pUsernameSettings.p2pUsername,
                p2pUsernameChangeCount: p2pUsernameSettings.p2pUsernameChangeCount,
                canChangeP2PUsername: p2pUsernameSettings.canChangeP2PUsername,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/p2p/badges", authMiddleware, async (_req: AuthRequest, res: Response) => {
        try {
            const badges = await db
                .select({
                    slug: p2pBadgeDefinitions.slug,
                    name: p2pBadgeDefinitions.name,
                    nameAr: p2pBadgeDefinitions.nameAr,
                    description: p2pBadgeDefinitions.description,
                    descriptionAr: p2pBadgeDefinitions.descriptionAr,
                    icon: p2pBadgeDefinitions.icon,
                    color: p2pBadgeDefinitions.color,
                    minTrades: p2pBadgeDefinitions.minTrades,
                    minCompletionRate: p2pBadgeDefinitions.minCompletionRate,
                    minVolume: p2pBadgeDefinitions.minVolume,
                    maxDisputeRate: p2pBadgeDefinitions.maxDisputeRate,
                    maxResponseTime: p2pBadgeDefinitions.maxResponseTime,
                    requiresVerification: p2pBadgeDefinitions.requiresVerification,
                })
                .from(p2pBadgeDefinitions)
                .where(eq(p2pBadgeDefinitions.isActive, true))
                .orderBy(asc(p2pBadgeDefinitions.sortOrder), asc(p2pBadgeDefinitions.slug));

            res.json(badges.map((badge) => ({
                slug: badge.slug,
                name: badge.name,
                nameAr: badge.nameAr,
                description: badge.description,
                descriptionAr: badge.descriptionAr,
                icon: badge.icon,
                color: badge.color,
                criteria: {
                    minTrades: badge.minTrades,
                    minCompletionRate: badge.minCompletionRate,
                    minVolume: badge.minVolume,
                    maxDisputeRate: badge.maxDisputeRate,
                    maxResponseTime: badge.maxResponseTime,
                    requiresVerification: badge.requiresVerification,
                },
            })));
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/p2p/payment-methods", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const methods = await db
                .select({
                    id: p2pTraderPaymentMethods.id,
                    userId: p2pTraderPaymentMethods.userId,
                    type: p2pTraderPaymentMethods.type,
                    name: p2pTraderPaymentMethods.name,
                    displayLabel: p2pTraderPaymentMethods.displayLabel,
                    countryCode: p2pTraderPaymentMethods.countryCode,
                    countryPaymentMethodId: p2pTraderPaymentMethods.countryPaymentMethodId,
                    accountNumber: p2pTraderPaymentMethods.accountNumber,
                    bankName: p2pTraderPaymentMethods.bankName,
                    holderName: p2pTraderPaymentMethods.holderName,
                    details: p2pTraderPaymentMethods.details,
                    isVerified: p2pTraderPaymentMethods.isVerified,
                    isActive: p2pTraderPaymentMethods.isActive,
                    sortOrder: p2pTraderPaymentMethods.sortOrder,
                    createdAt: p2pTraderPaymentMethods.createdAt,
                })
                .from(p2pTraderPaymentMethods)
                .where(and(eq(p2pTraderPaymentMethods.userId, req.user!.id), eq(p2pTraderPaymentMethods.isActive, true)))
                .orderBy(asc(p2pTraderPaymentMethods.sortOrder), asc(p2pTraderPaymentMethods.createdAt));

            res.json(methods.map((method) => ({
                ...method,
                accountNumber: maskAccountNumber(method.accountNumber),
            })));
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/p2p/payment-methods", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const countryPaymentMethodId = sanitizePlainText(String(req.body?.countryPaymentMethodId || ""), { maxLength: 64 });
            if (!countryPaymentMethodId) {
                return res.status(400).json({ error: "countryPaymentMethodId is required" });
            }

            const [catalogMethod] = await db
                .select({
                    id: countryPaymentMethods.id,
                    countryCode: countryPaymentMethods.countryCode,
                    type: countryPaymentMethods.type,
                    name: countryPaymentMethods.name,
                })
                .from(countryPaymentMethods)
                .where(and(
                    eq(countryPaymentMethods.id, countryPaymentMethodId),
                    eq(countryPaymentMethods.isActive, true),
                    eq(countryPaymentMethods.isAvailable, true),
                ))
                .limit(1);

            if (!catalogMethod) {
                return res.status(400).json({ error: "Selected payment method is unavailable" });
            }

            const accountNumber = sanitizePlainText(String(req.body?.accountNumber || ""), { maxLength: 120 });
            const bankName = req.body?.bankName ? sanitizePlainText(String(req.body.bankName), { maxLength: 120 }) : null;
            const holderName = req.body?.holderName ? sanitizePlainText(String(req.body.holderName), { maxLength: 120 }) : null;
            const details = req.body?.details ? sanitizePlainText(String(req.body.details), { maxLength: 500 }) : null;
            const displayLabel = req.body?.displayLabel
                ? sanitizePlainText(String(req.body.displayLabel), { maxLength: 120 })
                : null;

            if (!accountNumber) {
                return res.status(400).json({ error: "accountNumber is required" });
            }

            const [created] = await db
                .insert(p2pTraderPaymentMethods)
                .values({
                    userId: req.user!.id,
                    type: catalogMethod.type,
                    name: catalogMethod.name,
                    countryCode: catalogMethod.countryCode,
                    countryPaymentMethodId: catalogMethod.id,
                    accountNumber,
                    bankName,
                    holderName,
                    details,
                    displayLabel,
                    isVerified: false,
                    isActive: true,
                })
                .returning();

            res.status(201).json({
                ...created,
                accountNumber: maskAccountNumber(created.accountNumber),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.delete("/api/p2p/payment-methods/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const [updated] = await db
                .update(p2pTraderPaymentMethods)
                .set({ isActive: false })
                .where(and(eq(p2pTraderPaymentMethods.id, req.params.id), eq(p2pTraderPaymentMethods.userId, req.user!.id)))
                .returning();

            if (!updated) {
                return res.status(404).json({ error: "Payment method not found" });
            }

            res.json({ success: true });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
