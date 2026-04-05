import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "./middleware";
import { getErrorMessage } from "./helpers";
import { storage } from "../storage";
import { db } from "../db";
import {
    p2pBadgeDefinitions,
    p2pSettings,
    p2pTraderBadges,
    p2pTraderMetrics,
    p2pTraderPaymentMethods,
    p2pTraderProfiles,
    p2pTrades,
} from "@shared/schema";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { sanitizePlainText } from "../lib/input-security";
import {
    ensureP2PUsername,
    getP2PUsernameSettings,
    updateP2PUsernameOnce,
} from "../lib/p2p-username";

function toNumber(value: string | number | null | undefined, fallback = 0): number {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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

            const p2pUsernameSettings = await getP2PUsernameSettings(userId);

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

            const recentTrades = await Promise.all(
                recentTradeRows.map(async (trade) => {
                    const counterpartyId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;
                    const counterparty = await storage.getUser(counterpartyId);
                    return {
                        id: trade.id,
                        type: trade.buyerId === userId ? "buy" : "sell",
                        amount: trade.amount,
                        currency: trade.currencyType === "project" ? "VEX" : "USD",
                        fiatAmount: trade.fiatAmount,
                        counterparty: counterparty?.username || "Unknown",
                        status: trade.status,
                        completedAt: trade.completedAt || trade.updatedAt,
                    };
                }),
            );

            const completionRate = metrics ? toNumber(metrics.completionRate) : 0;
            const disputeRate = metrics ? toNumber(metrics.disputeRate) : 0;

            const derivedDisplayName = profile?.displayName
                || `${user.firstName || ""} ${user.lastName || ""}`.trim()
                || p2pUsernameSettings.p2pUsername;

            res.json({
                id: userId,
                username: user.username,
                p2pUsername: p2pUsernameSettings.p2pUsername,
                p2pUsernameChangeCount: p2pUsernameSettings.p2pUsernameChangeCount,
                canChangeP2PUsername: p2pUsernameSettings.canChangeP2PUsername,
                displayName: derivedDisplayName,
                bio: profile?.bio || "",
                region: profile?.region || "",
                verificationLevel: profile?.verificationLevel || (user.phoneVerified ? "phone" : "email"),
                isOnline: profile?.isOnline || false,
                lastSeenAt: profile?.lastSeenAt || user.createdAt,
                memberSince: user.createdAt,
                metrics: {
                    totalTrades: toNumber(metrics?.totalTrades),
                    completedTrades: toNumber(metrics?.completedTrades),
                    cancelledTrades: toNumber(metrics?.cancelledTrades),
                    completionRate,
                    totalBuyTrades: toNumber(metrics?.totalBuyTrades),
                    totalSellTrades: toNumber(metrics?.totalSellTrades),
                    totalVolumeUsdt: String(metrics?.totalVolumeUsdt || "0"),
                    totalDisputes: toNumber(metrics?.totalDisputes),
                    disputesWon: toNumber(metrics?.disputesWon),
                    disputesLost: toNumber(metrics?.disputesLost),
                    disputeRate,
                    avgReleaseTimeSeconds: toNumber(metrics?.avgReleaseTimeSeconds),
                    avgPaymentTimeSeconds: toNumber(metrics?.avgPaymentTimeSeconds),
                    avgResponseTimeSeconds: toNumber(metrics?.avgResponseTimeSeconds),
                    positiveRatings: toNumber(metrics?.positiveRatings),
                    negativeRatings: toNumber(metrics?.negativeRatings),
                    overallRating: toNumber(metrics?.overallRating),
                    trades30d: toNumber(metrics?.trades30d),
                    completion30d: toNumber(metrics?.completion30d),
                    volume30d: String(metrics?.volume30d || "0"),
                    firstTradeAt: metrics?.firstTradeAt || null,
                    lastTradeAt: metrics?.lastTradeAt || null,
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
                .select()
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
            const type = sanitizePlainText(String(req.body?.type || ""), { maxLength: 30 }) as "bank_transfer" | "e_wallet" | "crypto";
            const allowedTypes = new Set(["bank_transfer", "e_wallet", "crypto"]);
            if (!allowedTypes.has(type)) {
                return res.status(400).json({ error: "Invalid payment method type" });
            }

            const name = sanitizePlainText(String(req.body?.name || ""), { maxLength: 120 });
            const accountNumber = sanitizePlainText(String(req.body?.accountNumber || ""), { maxLength: 120 });
            const bankName = req.body?.bankName ? sanitizePlainText(String(req.body.bankName), { maxLength: 120 }) : null;
            const holderName = req.body?.holderName ? sanitizePlainText(String(req.body.holderName), { maxLength: 120 }) : null;
            const details = req.body?.details ? sanitizePlainText(String(req.body.details), { maxLength: 500 }) : null;

            if (!name || !accountNumber) {
                return res.status(400).json({ error: "name and accountNumber are required" });
            }

            const [created] = await db
                .insert(p2pTraderPaymentMethods)
                .values({
                    userId: req.user!.id,
                    type,
                    name,
                    accountNumber,
                    bankName,
                    holderName,
                    details,
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
