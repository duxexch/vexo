import { and, eq, inArray } from "drizzle-orm";
import { badgeCatalog, userBadges } from "@shared/schema";
import { db } from "../db";

export interface TrustBadgeSummary {
    id: string;
    name: string;
    nameAr: string | null;
    iconUrl: string | null;
    iconName: string | null;
    color: string | null;
    category: string | null;
    level: number;
    points: number;
}

export interface UserBadgeEntitlements {
    badgeCount: number;
    topBadge: TrustBadgeSummary | null;
    maxP2PMonthlyLimit: number | null;
    maxChallengeMaxAmount: number | null;
    grantsP2pPrivileges: boolean;
}

function parseDecimal(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function pickTopBadge(current: TrustBadgeSummary | null, candidate: TrustBadgeSummary): TrustBadgeSummary {
    if (!current) {
        return candidate;
    }

    if (candidate.level !== current.level) {
        return candidate.level > current.level ? candidate : current;
    }

    if (candidate.points !== current.points) {
        return candidate.points > current.points ? candidate : current;
    }

    return current;
}

function createDefaultEntitlements(): UserBadgeEntitlements {
    return {
        badgeCount: 0,
        topBadge: null,
        maxP2PMonthlyLimit: null,
        maxChallengeMaxAmount: null,
        grantsP2pPrivileges: false,
    };
}

export function resolveEffectiveP2PMonthlyLimit(
    baseMonthlyLimit: number | null,
    badgeMonthlyLimit: number | null,
    hasProfile: boolean,
): number | null {
    if (hasProfile) {
        if (baseMonthlyLimit === null) {
            // Existing profile with null means unlimited by admin policy.
            return null;
        }

        if (badgeMonthlyLimit === null) {
            return baseMonthlyLimit;
        }

        return Math.max(baseMonthlyLimit, badgeMonthlyLimit);
    }

    return badgeMonthlyLimit;
}

export async function getBadgeEntitlementsForUsers(userIds: string[]): Promise<Map<string, UserBadgeEntitlements>> {
    const normalizedUserIds = Array.from(new Set(userIds.filter((id) => typeof id === "string" && id.trim().length > 0)));
    const entitlementsMap = new Map<string, UserBadgeEntitlements>();
    const fallbackTopBadges = new Map<string, TrustBadgeSummary | null>();

    for (const userId of normalizedUserIds) {
        entitlementsMap.set(userId, createDefaultEntitlements());
    }

    if (normalizedUserIds.length === 0) {
        return entitlementsMap;
    }

    const rows = await db
        .select({
            userId: userBadges.userId,
            badgeId: badgeCatalog.id,
            name: badgeCatalog.name,
            nameAr: badgeCatalog.nameAr,
            iconUrl: badgeCatalog.iconUrl,
            iconName: badgeCatalog.iconName,
            color: badgeCatalog.color,
            category: badgeCatalog.category,
            level: badgeCatalog.level,
            points: badgeCatalog.points,
            showOnProfile: badgeCatalog.showOnProfile,
            grantsP2pPrivileges: badgeCatalog.grantsP2pPrivileges,
            p2pMonthlyLimit: badgeCatalog.p2pMonthlyLimit,
            challengeMaxAmount: badgeCatalog.challengeMaxAmount,
        })
        .from(userBadges)
        .innerJoin(badgeCatalog, eq(userBadges.badgeId, badgeCatalog.id))
        .where(and(
            inArray(userBadges.userId, normalizedUserIds),
            eq(badgeCatalog.isActive, true),
        ));

    for (const row of rows) {
        const current = entitlementsMap.get(row.userId) ?? createDefaultEntitlements();

        const candidate: TrustBadgeSummary = {
            id: row.badgeId,
            name: row.name,
            nameAr: row.nameAr,
            iconUrl: row.iconUrl,
            iconName: row.iconName,
            color: row.color,
            category: row.category,
            level: row.level,
            points: row.points,
        };

        current.badgeCount += 1;
        current.grantsP2pPrivileges = current.grantsP2pPrivileges || Boolean(row.grantsP2pPrivileges);

        const currentFallback = fallbackTopBadges.get(row.userId) ?? null;
        fallbackTopBadges.set(row.userId, pickTopBadge(currentFallback, candidate));

        const p2pLimit = parseDecimal(row.p2pMonthlyLimit);
        if (p2pLimit !== null) {
            current.maxP2PMonthlyLimit = current.maxP2PMonthlyLimit === null
                ? p2pLimit
                : Math.max(current.maxP2PMonthlyLimit, p2pLimit);
        }

        const challengeLimit = parseDecimal(row.challengeMaxAmount);
        if (challengeLimit !== null) {
            current.maxChallengeMaxAmount = current.maxChallengeMaxAmount === null
                ? challengeLimit
                : Math.max(current.maxChallengeMaxAmount, challengeLimit);
        }

        if (row.showOnProfile) {
            current.topBadge = pickTopBadge(current.topBadge, candidate);
        }

        entitlementsMap.set(row.userId, current);
    }

    for (const [userId, entitlements] of entitlementsMap.entries()) {
        if (!entitlements.topBadge) {
            entitlements.topBadge = fallbackTopBadges.get(userId) ?? null;
            entitlementsMap.set(userId, entitlements);
        }
    }

    return entitlementsMap;
}

export async function getBadgeEntitlementForUser(userId: string): Promise<UserBadgeEntitlements> {
    const map = await getBadgeEntitlementsForUsers([userId]);
    return map.get(userId) ?? createDefaultEntitlements();
}
