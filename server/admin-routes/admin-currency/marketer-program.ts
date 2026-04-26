import type { Express, Response } from "express";
import crypto from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
    affiliates,
    badgeCatalog,
    marketerCommissionSchedulerRuns,
    referralRewardsLog,
    userBadges,
    users,
} from "@shared/schema";
import {
    type AdminRequest,
    adminAuthMiddleware,
    getErrorMessage,
    logAdminAction,
} from "../helpers";
import {
    releaseEligibleMarketerCommissions,
    syncMarketerRevshareCommissions,
} from "../../lib/affiliate-commissions";
import { runMarketerCommissionSchedulerNow } from "../../lib/marketer-commission-scheduler";

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number.parseFloat(String(value ?? ""));
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
}

function toInt(value: unknown, fallback = 0): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
}

function toDecimalString(value: unknown): string {
    return toNumber(value).toFixed(2);
}

function asRunStatus(value: unknown): "running" | "success" | "failed" | "skipped" | null {
    const normalized = String(value || "").toLowerCase();
    if (["running", "success", "failed", "skipped"].includes(normalized)) {
        return normalized as "running" | "success" | "failed" | "skipped";
    }
    return null;
}

function asRunTrigger(value: unknown): "auto" | "manual" | null {
    const normalized = String(value || "").toLowerCase();
    if (["auto", "manual"].includes(normalized)) {
        return normalized as "auto" | "manual";
    }
    return null;
}

function asStartOfDay(value: unknown): Date | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function asEndOfDay(value: unknown): Date | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const date = new Date(`${raw}T23:59:59.999Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function resolveSchedulerIdempotencyKey(input: {
    adminId: string;
    releaseOnly: boolean;
    referrerUserId?: string;
    provided?: string;
}): string {
    const provided = typeof input.provided === "string" ? input.provided.trim() : "";
    if (provided.length > 0) {
        return provided.slice(0, 120);
    }

    const bucket = Math.floor(Date.now() / 15_000);
    const scope = `${input.releaseOnly ? "release" : "full"}:${input.referrerUserId || "all"}`;
    return crypto
        .createHash("sha256")
        .update(`${input.adminId}:${scope}:${bucket}`)
        .digest("hex")
        .slice(0, 48);
}

async function ensureAffiliateRecordForUser(userId: string) {
    const [existing] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);
    if (existing) {
        return existing;
    }

    const [targetUser] = await db.select({ accountId: users.accountId, username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const affiliateCode = `AFF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const referralToken = targetUser?.accountId || targetUser?.username || affiliateCode;
    const referralLink = `/register?ref=${encodeURIComponent(String(referralToken))}`;

    const [created] = await db.insert(affiliates)
        .values({
            userId,
            affiliateCode,
            referralLink,
        })
        .returning();

    return created;
}

async function getOrCreateMarketerBadgeId(): Promise<string> {
    const [existing] = await db.select({ id: badgeCatalog.id })
        .from(badgeCatalog)
        .where(and(
            eq(badgeCatalog.category, "marketer"),
            eq(badgeCatalog.name, "Marketer"),
        ))
        .limit(1);

    if (existing) {
        return existing.id;
    }

    const [created] = await db.insert(badgeCatalog)
        .values({
            name: "Marketer",
            nameAr: "ماركتر",
            description: "Approved marketer account with CPA and RevShare access",
            descriptionAr: "حساب ماركتر معتمد يتيح CPA وRevShare",
            iconName: "Megaphone",
            color: "#0EA5E9",
            category: "marketer",
            requirement: "Admin approval",
            level: 2,
            points: 200,
            isActive: true,
            showOnProfile: true,
            sortOrder: 40,
        })
        .returning({ id: badgeCatalog.id });

    return created.id;
}

export function registerMarketerProgramRoutes(app: Express) {
    app.get("/api/admin/free-play/marketers", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
            const rows = await db.execute(sql`
        SELECT
          a.id,
          a.user_id,
          a.affiliate_code,
          a.marketer_status,
          a.cpa_enabled,
          a.cpa_amount,
          a.revshare_enabled,
          a.revshare_rate,
          a.commission_hold_days,
          a.total_commission_earned,
          a.pending_commission,
          a.total_withdrawable_commission,
          a.total_paid_commission,
          a.total_referrals,
          a.total_registrations,
          a.updated_at,
          u.username,
          u.nickname,
          u.status AS user_status,
          u.total_deposited,
          u.total_wagered,
          u.games_played
        FROM affiliates a
        INNER JOIN users u ON u.id = a.user_id
        ORDER BY a.updated_at DESC
        LIMIT ${limit}
      `);

            res.json({ marketers: rows.rows });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/free-play/marketers/overview", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const [summary] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_marketers,
          COUNT(*) FILTER (WHERE marketer_status = 'approved')::int AS approved_marketers,
          COUNT(*) FILTER (WHERE marketer_status = 'pending')::int AS pending_marketers,
          COUNT(*) FILTER (WHERE marketer_status = 'revoked')::int AS revoked_marketers,
          COALESCE(SUM(total_commission_earned::numeric), 0)::text AS total_commissions,
          COALESCE(SUM(pending_commission::numeric), 0)::text AS total_pending,
          COALESCE(SUM(total_withdrawable_commission::numeric), 0)::text AS total_withdrawable,
          COALESCE(SUM(total_paid_commission::numeric), 0)::text AS total_paid
        FROM affiliates
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            const topMarketers = await db.execute(sql`
        SELECT
          a.user_id,
          u.username,
          u.nickname,
          a.total_referrals,
          a.total_commission_earned,
          a.pending_commission,
          a.total_withdrawable_commission
        FROM affiliates a
        INNER JOIN users u ON u.id = a.user_id
        WHERE a.marketer_status = 'approved'
        ORDER BY a.total_commission_earned::numeric DESC
        LIMIT 10
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            res.json({ summary, topMarketers });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/free-play/marketers/:userId/details", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const userId = String(req.params.userId || "").trim();
            const [targetUser] = await db.select({ id: users.id, username: users.username, nickname: users.nickname, status: users.status })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            if (!targetUser) {
                return res.status(404).json({ error: "User not found" });
            }

            const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);

            const [referralStats] = await db.execute(sql`
        SELECT
          COUNT(*)::int AS invited_total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS invited_active,
          COALESCE(SUM(total_deposited::numeric), 0)::text AS invited_deposits,
          COALESCE(SUM(total_wagered::numeric), 0)::text AS invited_wagered,
          COALESCE(SUM(games_played), 0)::int AS invited_games
        FROM users
        WHERE referred_by = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            const [commissionStats] = await db.execute(sql`
        SELECT
          COALESCE(SUM(reward_amount::numeric), 0)::text AS total_amount,
          COALESCE(SUM(CASE WHEN reward_status = 'on_hold' THEN reward_amount::numeric ELSE 0 END), 0)::text AS on_hold_amount,
          COALESCE(SUM(CASE WHEN reward_status = 'released' THEN reward_amount::numeric ELSE 0 END), 0)::text AS released_amount,
          COALESCE(SUM(CASE WHEN reward_type = 'cpa' THEN reward_amount::numeric ELSE 0 END), 0)::text AS cpa_amount,
          COALESCE(SUM(CASE WHEN reward_type = 'revshare' THEN reward_amount::numeric ELSE 0 END), 0)::text AS revshare_amount,
          COUNT(*)::int AS events_count
        FROM referral_rewards_log
        WHERE referrer_id = ${userId}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            const recentEvents = await db.execute(sql`
        SELECT
          rr.id,
          rr.reward_type,
          rr.reward_status,
          rr.reward_amount,
          rr.hold_until,
          rr.released_at,
          rr.created_at,
          rr.source_type,
          rr.source_id,
          u.username AS referred_username,
          u.nickname AS referred_nickname
        FROM referral_rewards_log rr
        INNER JOIN users u ON u.id = rr.referred_id
        WHERE rr.referrer_id = ${userId}
        ORDER BY rr.created_at DESC
        LIMIT 100
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            return res.json({
                user: targetUser,
                affiliate: affiliate || null,
                referralStats,
                commissionStats,
                recentEvents,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/free-play/marketers/:userId/badge", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const userId = String(req.params.userId || "").trim();
            const action = String(req.body?.action || "grant").toLowerCase();
            if (!userId) {
                return res.status(400).json({ error: "userId is required" });
            }
            if (!["grant", "revoke"].includes(action)) {
                return res.status(400).json({ error: "action must be grant or revoke" });
            }

            const affiliate = await ensureAffiliateRecordForUser(userId);

            if (action === "grant") {
                const badgeId = await getOrCreateMarketerBadgeId();
                // Atomicity convention (Task #193 audit): this callback
                // performs three sequential mutations with NO early-return
                // guards. Any failure from Drizzle propagates as a thrown
                // rejection, which rolls back the whole transaction. No
                // `{ success: false }` envelope is returned from inside the
                // callback, so partial commits are not possible.
                await db.transaction(async (tx) => {
                    await tx.update(affiliates)
                        .set({
                            marketerStatus: "approved",
                            marketerBadgeGrantedAt: new Date(),
                            marketerBadgeGrantedBy: req.admin!.id,
                            updatedAt: new Date(),
                        })
                        .where(eq(affiliates.id, affiliate.id));

                    await tx.execute(sql`
            INSERT INTO user_badges (user_id, badge_id)
            VALUES (${userId}, ${badgeId})
            ON CONFLICT (user_id, badge_id) DO NOTHING
          `);

                    await tx.update(users)
                        .set({ role: "affiliate", updatedAt: new Date() })
                        .where(and(eq(users.id, userId), eq(users.role, "player")));
                });
            } else {
                const [marketerBadge] = await db.select({ id: badgeCatalog.id })
                    .from(badgeCatalog)
                    .where(and(eq(badgeCatalog.category, "marketer"), eq(badgeCatalog.name, "Marketer")))
                    .limit(1);

                // Atomicity convention (Task #193 audit): one update plus a
                // conditional DELETE — no early-return guards inside the
                // callback. The `if (marketerBadge)` check uses a value
                // computed BEFORE `db.transaction` opened, so it is purely
                // a build-time decision about which statements to issue,
                // not a runtime escape from the transaction. No
                // `{ success: false }` envelope is returned, so partial
                // commits are not possible.
                await db.transaction(async (tx) => {
                    await tx.update(affiliates)
                        .set({ marketerStatus: "revoked", updatedAt: new Date() })
                        .where(eq(affiliates.id, affiliate.id));

                    if (marketerBadge) {
                        await tx.execute(sql`
              DELETE FROM user_badges
              WHERE user_id = ${userId} AND badge_id = ${marketerBadge.id}
            `);
                    }
                });
            }

            await logAdminAction(req.admin!.id, "settings_change", "marketer_badge", userId, {
                newValue: JSON.stringify({ action }),
            }, req);

            const [updated] = await db.select().from(affiliates).where(eq(affiliates.id, affiliate.id)).limit(1);
            return res.json({ success: true, affiliate: updated });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.put("/api/admin/free-play/marketers/:userId/config", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const userId = String(req.params.userId || "").trim();
            if (!userId) {
                return res.status(400).json({ error: "userId is required" });
            }

            const cpaEnabled = req.body?.cpaEnabled !== false;
            const revshareEnabled = req.body?.revshareEnabled !== false;
            const cpaAmount = Math.max(0, toNumber(req.body?.cpaAmount, 5));
            const revshareRate = Math.max(0, Math.min(100, toNumber(req.body?.revshareRate, 10)));
            const commissionHoldDays = Math.max(0, Math.min(120, toInt(req.body?.commissionHoldDays, 7)));
            const minQualifiedDeposits = Math.max(0, toNumber(req.body?.minQualifiedDeposits, 0));
            const minQualifiedWagered = Math.max(0, toNumber(req.body?.minQualifiedWagered, 0));
            const minQualifiedGames = Math.max(0, toInt(req.body?.minQualifiedGames, 0));

            const affiliate = await ensureAffiliateRecordForUser(userId);
            const [updated] = await db.update(affiliates)
                .set({
                    cpaEnabled,
                    revshareEnabled,
                    cpaAmount: cpaAmount.toFixed(2),
                    revshareRate: revshareRate.toFixed(4),
                    commissionHoldDays,
                    minQualifiedDeposits: minQualifiedDeposits.toFixed(2),
                    minQualifiedWagered: minQualifiedWagered.toFixed(2),
                    minQualifiedGames,
                    updatedAt: new Date(),
                })
                .where(eq(affiliates.id, affiliate.id))
                .returning();

            await logAdminAction(req.admin!.id, "settings_change", "marketer_config", userId, {
                newValue: JSON.stringify({
                    cpaEnabled,
                    revshareEnabled,
                    cpaAmount: cpaAmount.toFixed(2),
                    revshareRate: revshareRate.toFixed(4),
                    commissionHoldDays,
                    minQualifiedDeposits: minQualifiedDeposits.toFixed(2),
                    minQualifiedWagered: minQualifiedWagered.toFixed(2),
                    minQualifiedGames,
                }),
            }, req);

            return res.json({ success: true, affiliate: updated });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/free-play/marketers/sync", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : undefined;
            const releaseOnly = req.body?.releaseOnly === true;

            const revshare = releaseOnly
                ? { generatedEvents: 0, generatedAmount: "0.00" }
                : await syncMarketerRevshareCommissions({ referrerUserId: userId });

            const release = await releaseEligibleMarketerCommissions({ referrerUserId: userId });

            await logAdminAction(req.admin!.id, "settings_change", "marketer_sync", userId || "all", {
                newValue: JSON.stringify({ revshare, release, releaseOnly }),
            }, req);

            return res.json({
                success: true,
                revshare,
                release,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/free-play/marketers/scheduler/run", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const releaseOnly = req.body?.releaseOnly === true;
            const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : undefined;
            const providedIdempotencyKey = typeof req.body?.idempotencyKey === "string"
                ? req.body.idempotencyKey
                : typeof req.headers["x-idempotency-key"] === "string"
                    ? req.headers["x-idempotency-key"]
                    : "";
            const idempotencyKey = resolveSchedulerIdempotencyKey({
                adminId: req.admin!.id,
                releaseOnly,
                referrerUserId: userId,
                provided: providedIdempotencyKey,
            });

            const runResult = await runMarketerCommissionSchedulerNow({
                releaseOnly,
                referrerUserId: userId,
                idempotencyKey,
            });

            await logAdminAction(req.admin!.id, "settings_change", "marketer_scheduler", userId || "all", {
                newValue: JSON.stringify({
                    action: "run_scheduler",
                    releaseOnly,
                    idempotencyKey,
                    deduplicated: runResult.deduplicated === true,
                    runId: runResult.runId,
                    status: runResult.status,
                }),
            }, req);

            return res.json({ success: true, idempotencyKey, ...runResult });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/free-play/marketers/scheduler/runs", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
            const statusFilter = asRunStatus(req.query.status);
            const triggerFilter = asRunTrigger(req.query.trigger);
            const dateFrom = asStartOfDay(req.query.dateFrom);
            const dateTo = asEndOfDay(req.query.dateTo);

            const conditions = [];
            if (statusFilter) {
                conditions.push(eq(marketerCommissionSchedulerRuns.status, statusFilter));
            }
            if (triggerFilter) {
                conditions.push(eq(marketerCommissionSchedulerRuns.trigger, triggerFilter));
            }
            if (dateFrom) {
                conditions.push(gte(marketerCommissionSchedulerRuns.startedAt, dateFrom));
            }
            if (dateTo) {
                conditions.push(lte(marketerCommissionSchedulerRuns.startedAt, dateTo));
            }

            const runs = await db.select()
                .from(marketerCommissionSchedulerRuns)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(marketerCommissionSchedulerRuns.startedAt))
                .limit(limit);

            return res.json({ runs });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/free-play/marketers/:userId/commission-events", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const userId = String(req.params.userId || "").trim();
            const limit = Math.min(Math.max(toInt(req.query.limit, 100), 1), 500);

            const rows = await db.execute(sql`
        SELECT
          rr.id,
          rr.referred_id,
          u.username AS referred_username,
          rr.reward_type,
          rr.reward_status,
          rr.reward_amount,
          rr.source_type,
          rr.source_id,
          rr.hold_until,
          rr.released_at,
          rr.created_at,
          rr.metadata
        FROM referral_rewards_log rr
        LEFT JOIN users u ON u.id = rr.referred_id
        WHERE rr.referrer_id = ${userId}
        ORDER BY rr.created_at DESC
        LIMIT ${limit}
      `).then((result) => result.rows as Array<Record<string, unknown>>);

            return res.json({
                events: rows,
                totals: {
                    totalAmount: toDecimalString(rows.reduce((acc, row) => acc + toNumber(row.reward_amount), 0)),
                    totalEvents: rows.length,
                },
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
