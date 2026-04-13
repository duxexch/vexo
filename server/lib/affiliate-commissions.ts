import { and, desc, eq, sql } from "drizzle-orm";
import {
    affiliateReferralSnapshots,
    affiliates,
    gameplaySettings,
    projectCurrencyLedger,
    projectCurrencyWallets,
    referralRewardsLog,
    users,
} from "@shared/schema";
import { db } from "../db";
import { createRewardReference } from "./reward-reference";
import { sendNotification } from "../websocket";

type DecimalLike = string | number | null | undefined;

const MARKETER_SETTING_KEYS = {
    cpaEnabled: "marketer_cpa_enabled",
    cpaAmount: "marketer_cpa_amount",
    revshareEnabled: "marketer_revshare_enabled",
    revshareRate: "marketer_revshare_rate_percent",
    holdDays: "marketer_commission_hold_days",
    minDeposit: "marketer_min_referred_deposit",
    minWagered: "marketer_min_referred_wagered",
    minGames: "marketer_min_referred_games",
} as const;

function toNumber(value: DecimalLike, fallback = 0): number {
    const parsed = Number.parseFloat(String(value ?? ""));
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
}

function toFixed2(value: number): string {
    return value.toFixed(2);
}

function toSafeInt(value: DecimalLike, fallback = 0): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
}

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + Math.max(0, days));
    return d;
}

export type RegistrationCommissionResult = {
    mode: "marketer" | "legacy" | "none";
    amount: string;
    status: "on_hold" | "released";
};

type MarketerProgramSettings = {
    cpaEnabled: boolean;
    cpaAmount: number;
    revshareEnabled: boolean;
    revshareRate: number;
    holdDays: number;
    minDeposit: number;
    minWagered: number;
    minGames: number;
};

async function getMarketerProgramSettings(): Promise<MarketerProgramSettings> {
    const rows = await db.select({ key: gameplaySettings.key, value: gameplaySettings.value })
        .from(gameplaySettings)
        .where(sql`${gameplaySettings.key} IN (
      ${MARKETER_SETTING_KEYS.cpaEnabled},
      ${MARKETER_SETTING_KEYS.cpaAmount},
      ${MARKETER_SETTING_KEYS.revshareEnabled},
      ${MARKETER_SETTING_KEYS.revshareRate},
      ${MARKETER_SETTING_KEYS.holdDays},
      ${MARKETER_SETTING_KEYS.minDeposit},
      ${MARKETER_SETTING_KEYS.minWagered},
      ${MARKETER_SETTING_KEYS.minGames}
    )`);

    const map = new Map<string, string>(rows.map((row) => [row.key, row.value]));

    return {
        cpaEnabled: map.get(MARKETER_SETTING_KEYS.cpaEnabled) !== "false",
        cpaAmount: toNumber(map.get(MARKETER_SETTING_KEYS.cpaAmount), 5),
        revshareEnabled: map.get(MARKETER_SETTING_KEYS.revshareEnabled) !== "false",
        revshareRate: toNumber(map.get(MARKETER_SETTING_KEYS.revshareRate), 10),
        holdDays: Math.max(0, toSafeInt(map.get(MARKETER_SETTING_KEYS.holdDays), 7)),
        minDeposit: Math.max(0, toNumber(map.get(MARKETER_SETTING_KEYS.minDeposit), 0)),
        minWagered: Math.max(0, toNumber(map.get(MARKETER_SETTING_KEYS.minWagered), 0)),
        minGames: Math.max(0, toSafeInt(map.get(MARKETER_SETTING_KEYS.minGames), 0)),
    };
}

async function creditCommissionToWallet(
    tx: any,
    referrerId: string,
    amount: number,
    referenceId: string,
    description: string,
): Promise<void> {
    if (amount <= 0) {
        return;
    }

    await tx.execute(sql`
    INSERT INTO project_currency_wallets (user_id)
    VALUES (${referrerId})
    ON CONFLICT (user_id) DO NOTHING
  `);

    const [wallet] = await tx.select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, referrerId))
        .for("update");

    if (!wallet) {
        throw new Error("Affiliate wallet not found");
    }

    const balanceBefore = toNumber(wallet.totalBalance);
    const earnedBefore = toNumber(wallet.earnedBalance);
    const balanceAfter = balanceBefore + amount;

    await tx.update(projectCurrencyWallets)
        .set({
            earnedBalance: toFixed2(earnedBefore + amount),
            totalBalance: toFixed2(balanceAfter),
            totalEarned: toFixed2(toNumber(wallet.totalEarned) + amount),
            updatedAt: new Date(),
        })
        .where(eq(projectCurrencyWallets.id, wallet.id));

    await tx.insert(projectCurrencyLedger).values({
        userId: referrerId,
        walletId: wallet.id,
        type: "bonus",
        amount: toFixed2(amount),
        balanceBefore: toFixed2(balanceBefore),
        balanceAfter: toFixed2(balanceAfter),
        referenceId,
        referenceType: "affiliate_commission",
        description,
    });
}

async function incrementAffiliateReferralCounters(tx: any, affiliateId: string): Promise<void> {
    await tx.execute(sql`
    UPDATE affiliates
    SET
      total_referrals = total_referrals + 1,
      total_registrations = total_registrations + 1,
      updated_at = NOW()
    WHERE id = ${affiliateId}
  `);
}

function isMarketerApproved(affiliateRow: typeof affiliates.$inferSelect | undefined): boolean {
    if (!affiliateRow) {
        return false;
    }
    return affiliateRow.isActive && affiliateRow.marketerStatus === "approved";
}

export async function processReferralRegistrationCommission(input: {
    referrerId: string;
    referredId: string;
    referredUsername: string;
    legacyDescription: string;
}): Promise<RegistrationCommissionResult> {
    const [rewardSetting, rateSetting, enabledSetting, affiliateRow, marketerSettings] = await Promise.all([
        db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "referral_reward_amount")).limit(1).then((rows) => rows[0]),
        db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "referral_reward_rate_percent")).limit(1).then((rows) => rows[0]),
        db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "referral_reward_enabled")).limit(1).then((rows) => rows[0]),
        db.select().from(affiliates).where(eq(affiliates.userId, input.referrerId)).limit(1).then((rows) => rows[0]),
        getMarketerProgramSettings(),
    ]);

    const baseReward = toNumber(rewardSetting?.value, 5);
    const baseRate = toNumber(rateSetting?.value, 100);
    const legacyEnabled = !enabledSetting || enabledSetting.value !== "false";
    const legacyRewardAmount = legacyEnabled ? (baseReward * (baseRate / 100)) : 0;

    const marketerMode = isMarketerApproved(affiliateRow);
    const marketerCpaEnabled = marketerMode
        ? affiliateRow.cpaEnabled && marketerSettings.cpaEnabled
        : false;
    const marketerCpaAmount = marketerMode
        ? Math.max(0, toNumber(affiliateRow.cpaAmount, marketerSettings.cpaAmount))
        : 0;
    const holdDays = marketerMode
        ? Math.max(0, toSafeInt(affiliateRow.commissionHoldDays, marketerSettings.holdDays))
        : 0;

    if (marketerMode && marketerCpaEnabled && marketerCpaAmount > 0) {
        const rewardStatus = holdDays > 0 ? "on_hold" : "released";
        const holdUntil = holdDays > 0 ? addDays(new Date(), holdDays) : null;
        const eventReference = `cpa:${input.referrerId}:${input.referredId}`;

        await db.transaction(async (tx) => {
            if (affiliateRow) {
                await incrementAffiliateReferralCounters(tx, affiliateRow.id);
            }

            const existingEvent = await tx.select({ id: referralRewardsLog.id })
                .from(referralRewardsLog)
                .where(eq(referralRewardsLog.eventReference, eventReference))
                .limit(1);
            if (existingEvent.length > 0) {
                return;
            }

            await tx.insert(referralRewardsLog).values({
                referrerId: input.referrerId,
                referredId: input.referredId,
                rewardAmount: toFixed2(marketerCpaAmount),
                rewardType: "cpa",
                rewardStatus,
                holdUntil,
                releasedAt: rewardStatus === "released" ? new Date() : null,
                sourceType: "registration",
                sourceId: input.referredId,
                eventReference,
                metadata: JSON.stringify({ mode: "marketer_cpa", referredUsername: input.referredUsername }),
            });

            await tx.execute(sql`
        UPDATE affiliates
        SET
          total_commission_earned = total_commission_earned + ${marketerCpaAmount},
          total_cpa_earned = total_cpa_earned + ${marketerCpaAmount},
          pending_commission = pending_commission + ${rewardStatus === "on_hold" ? marketerCpaAmount : 0},
          total_withdrawable_commission = total_withdrawable_commission + ${rewardStatus === "released" ? marketerCpaAmount : 0},
          updated_at = NOW()
        WHERE id = ${affiliateRow?.id || ""}
      `);

            if (rewardStatus === "released") {
                const rewardRef = createRewardReference("referral");
                await creditCommissionToWallet(
                    tx,
                    input.referrerId,
                    marketerCpaAmount,
                    rewardRef,
                    `CPA commission for inviting ${input.referredUsername}`,
                );
            }
        });

        if (holdDays > 0) {
            await sendNotification(input.referrerId, {
                type: "transaction",
                priority: "normal",
                title: "CPA commission pending",
                titleAr: "عمولة CPA قيد الانتظار",
                message: `Your CPA commission for ${input.referredUsername} is pending qualification checks.`,
                messageAr: `عمولة CPA الخاصة بك عن ${input.referredUsername} معلقة حتى اكتمال شروط التأهيل.`,
                link: "/referral",
            }).catch(() => { });
        }

        return {
            mode: "marketer",
            amount: toFixed2(marketerCpaAmount),
            status: rewardStatus,
        };
    }

    if (affiliateRow) {
        await db.transaction(async (tx) => {
            await incrementAffiliateReferralCounters(tx, affiliateRow.id);
        });
    }

    if (!(legacyEnabled && legacyRewardAmount > 0)) {
        return {
            mode: "none",
            amount: "0.00",
            status: "released",
        };
    }

    const legacyEventReference = `legacy:${input.referrerId}:${input.referredId}`;
    await db.transaction(async (tx) => {
        const existingEvent = await tx.select({ id: referralRewardsLog.id })
            .from(referralRewardsLog)
            .where(eq(referralRewardsLog.eventReference, legacyEventReference))
            .limit(1);
        if (existingEvent.length > 0) {
            return;
        }

        await tx.insert(referralRewardsLog).values({
            referrerId: input.referrerId,
            referredId: input.referredId,
            rewardAmount: toFixed2(legacyRewardAmount),
            rewardType: "cpa",
            rewardStatus: "released",
            releasedAt: new Date(),
            sourceType: "legacy_registration",
            sourceId: input.referredId,
            eventReference: legacyEventReference,
            metadata: JSON.stringify({ mode: "legacy", referredUsername: input.referredUsername }),
        });

        if (affiliateRow) {
            await tx.execute(sql`
        UPDATE affiliates
        SET
          total_commission_earned = total_commission_earned + ${legacyRewardAmount},
          total_cpa_earned = total_cpa_earned + ${legacyRewardAmount},
          total_withdrawable_commission = total_withdrawable_commission + ${legacyRewardAmount},
          updated_at = NOW()
        WHERE id = ${affiliateRow.id}
      `);
        }

        const rewardRef = createRewardReference("referral");
        await creditCommissionToWallet(tx, input.referrerId, legacyRewardAmount, rewardRef, input.legacyDescription);
    });

    await sendNotification(input.referrerId, {
        type: "transaction",
        priority: "normal",
        title: "Referral Bonus Earned!",
        titleAr: "مكافأة إحالة!",
        message: `You earned ${toFixed2(legacyRewardAmount)} project coins because ${input.referredUsername} joined!`,
        messageAr: `حصلت على ${toFixed2(legacyRewardAmount)} من عملات المشروع لأن ${input.referredUsername} انضم!`,
        link: "/wallet",
    }).catch(() => { });

    return {
        mode: "legacy",
        amount: toFixed2(legacyRewardAmount),
        status: "released",
    };
}

async function upsertRevshareSnapshot(tx: any, affiliateId: string, referredId: string, netRevenue: number): Promise<void> {
    await tx.execute(sql`
    INSERT INTO affiliate_referral_snapshots (affiliate_id, referred_id, last_net_revenue, last_synced_at, updated_at)
    VALUES (${affiliateId}, ${referredId}, ${toFixed2(netRevenue)}, NOW(), NOW())
    ON CONFLICT (affiliate_id, referred_id)
    DO UPDATE SET
      last_net_revenue = EXCLUDED.last_net_revenue,
      last_synced_at = NOW(),
      updated_at = NOW()
  `);
}

export async function syncMarketerRevshareCommissions(options?: {
    referrerUserId?: string;
    maxAffiliates?: number;
    maxReferralsPerAffiliate?: number;
}): Promise<{ generatedEvents: number; generatedAmount: string }> {
    const marketerSettings = await getMarketerProgramSettings();
    const maxAffiliates = Math.max(1, options?.maxAffiliates || 200);
    const maxReferralsPerAffiliate = Math.max(1, options?.maxReferralsPerAffiliate || 1000);

    let affiliatesQuery = db.select().from(affiliates)
        .where(and(
            eq(affiliates.marketerStatus, "approved"),
            eq(affiliates.isActive, true),
            eq(affiliates.revshareEnabled, true),
        ))
        .orderBy(desc(affiliates.updatedAt))
        .limit(maxAffiliates);

    if (options?.referrerUserId) {
        affiliatesQuery = db.select().from(affiliates)
            .where(and(
                eq(affiliates.userId, options.referrerUserId),
                eq(affiliates.marketerStatus, "approved"),
                eq(affiliates.isActive, true),
                eq(affiliates.revshareEnabled, true),
            ))
            .limit(1);
    }

    const marketerRows = await affiliatesQuery;

    let generatedEvents = 0;
    let generatedAmount = 0;

    for (const marketer of marketerRows) {
        const revshareRate = Math.max(0, toNumber(marketer.revshareRate, marketerSettings.revshareRate));
        if (!(marketerSettings.revshareEnabled && revshareRate > 0)) {
            continue;
        }

        const holdDays = Math.max(0, toSafeInt(marketer.commissionHoldDays, marketerSettings.holdDays));

        const referredUsers = await db.select({
            id: users.id,
            username: users.username,
            totalWagered: users.totalWagered,
            totalWon: users.totalWon,
        })
            .from(users)
            .where(eq(users.referredBy, marketer.userId))
            .limit(maxReferralsPerAffiliate);

        for (const referred of referredUsers) {
            const netRevenue = Math.max(0, toNumber(referred.totalWagered) - toNumber(referred.totalWon));

            const [snapshot] = await db.select()
                .from(affiliateReferralSnapshots)
                .where(and(
                    eq(affiliateReferralSnapshots.affiliateId, marketer.id),
                    eq(affiliateReferralSnapshots.referredId, referred.id),
                ))
                .limit(1);

            const lastNetRevenue = toNumber(snapshot?.lastNetRevenue);
            const deltaNetRevenue = netRevenue - lastNetRevenue;

            if (deltaNetRevenue <= 0) {
                if (!snapshot) {
                    await db.execute(sql`
            INSERT INTO affiliate_referral_snapshots (affiliate_id, referred_id, last_net_revenue, last_synced_at, updated_at)
            VALUES (${marketer.id}, ${referred.id}, ${toFixed2(netRevenue)}, NOW(), NOW())
            ON CONFLICT (affiliate_id, referred_id) DO NOTHING
          `);
                }
                continue;
            }

            const commissionAmount = deltaNetRevenue * (revshareRate / 100);
            if (commissionAmount <= 0) {
                continue;
            }

            const rewardStatus = holdDays > 0 ? "on_hold" : "released";
            const holdUntil = holdDays > 0 ? addDays(new Date(), holdDays) : null;
            const eventReference = `revshare:${marketer.id}:${referred.id}:${toFixed2(netRevenue)}`;

            const [existing] = await db.select({ id: referralRewardsLog.id })
                .from(referralRewardsLog)
                .where(eq(referralRewardsLog.eventReference, eventReference))
                .limit(1);
            if (existing) {
                await db.execute(sql`
          UPDATE affiliate_referral_snapshots
          SET last_net_revenue = ${toFixed2(netRevenue)}, last_synced_at = NOW(), updated_at = NOW()
          WHERE affiliate_id = ${marketer.id} AND referred_id = ${referred.id}
        `);
                continue;
            }

            await db.transaction(async (tx) => {
                await upsertRevshareSnapshot(tx, marketer.id, referred.id, netRevenue);

                await tx.insert(referralRewardsLog).values({
                    referrerId: marketer.userId,
                    referredId: referred.id,
                    rewardAmount: toFixed2(commissionAmount),
                    rewardType: "revshare",
                    rewardStatus,
                    holdUntil,
                    releasedAt: rewardStatus === "released" ? new Date() : null,
                    sourceType: "revshare_snapshot",
                    sourceId: `${referred.id}:${toFixed2(netRevenue)}`,
                    eventReference,
                    metadata: JSON.stringify({
                        ratePercent: revshareRate,
                        deltaNetRevenue: toFixed2(deltaNetRevenue),
                        netRevenue: toFixed2(netRevenue),
                        referredUsername: referred.username,
                    }),
                });

                await tx.execute(sql`
          UPDATE affiliates
          SET
            total_commission_earned = total_commission_earned + ${commissionAmount},
            total_revshare_earned = total_revshare_earned + ${commissionAmount},
            pending_commission = pending_commission + ${rewardStatus === "on_hold" ? commissionAmount : 0},
            total_withdrawable_commission = total_withdrawable_commission + ${rewardStatus === "released" ? commissionAmount : 0},
            updated_at = NOW()
          WHERE id = ${marketer.id}
        `);

                if (rewardStatus === "released") {
                    const rewardRef = createRewardReference("referral");
                    await creditCommissionToWallet(
                        tx,
                        marketer.userId,
                        commissionAmount,
                        rewardRef,
                        `RevShare commission from ${referred.username}`,
                    );
                }
            });

            generatedEvents += 1;
            generatedAmount += commissionAmount;
        }
    }

    return {
        generatedEvents,
        generatedAmount: toFixed2(generatedAmount),
    };
}

function qualifiesForRelease(referred: {
    status: string;
    totalDeposited: DecimalLike;
    totalWagered: DecimalLike;
    gamesPlayed: DecimalLike;
}, affiliateConfig: {
    minQualifiedDeposits: DecimalLike;
    minQualifiedWagered: DecimalLike;
    minQualifiedGames: DecimalLike;
}): boolean {
    if (referred.status !== "active") {
        return false;
    }

    const depositedOk = toNumber(referred.totalDeposited) >= toNumber(affiliateConfig.minQualifiedDeposits);
    const wageredOk = toNumber(referred.totalWagered) >= toNumber(affiliateConfig.minQualifiedWagered);
    const gamesOk = toSafeInt(referred.gamesPlayed) >= toSafeInt(affiliateConfig.minQualifiedGames);

    return depositedOk && wageredOk && gamesOk;
}

export async function releaseEligibleMarketerCommissions(options?: {
    referrerUserId?: string;
    limit?: number;
}): Promise<{ releasedEvents: number; releasedAmount: string }> {
    const limit = Math.max(1, options?.limit || 500);
    const referrerFilter = options?.referrerUserId
        ? sql`AND rr.referrer_id = ${options.referrerUserId}`
        : sql``;

    const rows = await db.execute(sql`
    SELECT
      rr.id,
      rr.referrer_id,
      rr.referred_id,
      rr.reward_amount,
      rr.reward_type,
      a.id AS affiliate_id,
      a.min_qualified_deposits,
      a.min_qualified_wagered,
      a.min_qualified_games,
      u.status,
      u.total_deposited,
      u.total_wagered,
      u.games_played,
      u.username
    FROM referral_rewards_log rr
    INNER JOIN affiliates a ON a.user_id = rr.referrer_id
    INNER JOIN users u ON u.id = rr.referred_id
    WHERE rr.reward_status = 'on_hold'
      AND rr.hold_until IS NOT NULL
      AND rr.hold_until <= NOW()
      ${referrerFilter}
    ORDER BY rr.created_at ASC
    LIMIT ${limit}
  `);

    const candidates = rows.rows as Array<Record<string, unknown>>;
    let releasedEvents = 0;
    let releasedAmount = 0;

    for (const row of candidates) {
        const isEligible = qualifiesForRelease(
            {
                status: String(row.status || "inactive"),
                totalDeposited: row.total_deposited as DecimalLike,
                totalWagered: row.total_wagered as DecimalLike,
                gamesPlayed: row.games_played as DecimalLike,
            },
            {
                minQualifiedDeposits: row.min_qualified_deposits as DecimalLike,
                minQualifiedWagered: row.min_qualified_wagered as DecimalLike,
                minQualifiedGames: row.min_qualified_games as DecimalLike,
            },
        );

        if (!isEligible) {
            continue;
        }

        const rewardAmount = Math.max(0, toNumber(row.reward_amount as DecimalLike));
        if (rewardAmount <= 0) {
            continue;
        }

        await db.transaction(async (tx) => {
            const [updated] = await tx.update(referralRewardsLog)
                .set({ rewardStatus: "released", releasedAt: new Date() })
                .where(and(
                    eq(referralRewardsLog.id, String(row.id)),
                    eq(referralRewardsLog.rewardStatus, "on_hold"),
                ))
                .returning({ id: referralRewardsLog.id });

            if (!updated) {
                return;
            }

            await tx.execute(sql`
        UPDATE affiliates
        SET
          pending_commission = GREATEST(pending_commission - ${rewardAmount}, 0),
          total_withdrawable_commission = total_withdrawable_commission + ${rewardAmount},
          updated_at = NOW()
        WHERE id = ${String(row.affiliate_id)}
      `);

            const rewardRef = createRewardReference("referral");
            await creditCommissionToWallet(
                tx,
                String(row.referrer_id),
                rewardAmount,
                rewardRef,
                `${String(row.reward_type || "Commission")} release from ${String(row.username || "referral")}`,
            );

            releasedEvents += 1;
            releasedAmount += rewardAmount;
        });
    }

    return {
        releasedEvents,
        releasedAmount: toFixed2(releasedAmount),
    };
}
