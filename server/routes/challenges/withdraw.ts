import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { users, projectCurrencyWallets, projectCurrencyLedger, challenges as challengesTable, liveGameSessions, transactions } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { broadcastChallengeUpdate } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";

export function registerWithdrawRoutes(app: Express) {
    app.post("/api/challenges/:id/withdraw", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.id;
            const challengeId = req.params.id;

            // Atomic transaction: lock row, verify permissions, apply refunds/penalties.
            const result = await db.transaction(async (tx) => {
                const [dbChallenge] = await tx.select().from(challengesTable)
                    .where(eq(challengesTable.id, challengeId))
                    .for("update");

                if (!dbChallenge) {
                    throw new Error("Challenge not found");
                }

                const allPlayerIds = [dbChallenge.player1Id, dbChallenge.player2Id, dbChallenge.player3Id, dbChallenge.player4Id].filter(Boolean);
                if (!allPlayerIds.includes(userId)) {
                    throw new Error("You are not a player in this challenge");
                }

                if (dbChallenge.status !== "waiting" && dbChallenge.status !== "active") {
                    throw new Error("Can only withdraw waiting or active challenges");
                }

                const betAmount = parseFloat(dbChallenge.betAmount || "0");
                const currencyType = dbChallenge.currencyType || "usd";

                const refundUserStake = async (targetUserId: string, amount: number, refundReason: string) => {
                    if (amount <= 0) return;

                    if (currencyType === "project") {
                        const refundReferenceId = `challenge_withdraw_refund:${challengeId}:${refundReason}:${targetUserId}`;
                        const [existingRefund] = await tx.select({ id: projectCurrencyLedger.id })
                            .from(projectCurrencyLedger)
                            .where(and(
                                eq(projectCurrencyLedger.userId, targetUserId),
                                eq(projectCurrencyLedger.referenceId, refundReferenceId),
                                eq(projectCurrencyLedger.referenceType, "challenge_withdraw_refund"),
                            ))
                            .for("update")
                            .limit(1);

                        if (existingRefund) return;

                        const [wallet] = await tx.select().from(projectCurrencyWallets)
                            .where(eq(projectCurrencyWallets.userId, targetUserId))
                            .for("update");

                        if (!wallet) {
                            throw new Error(`Project currency wallet not found for user ${targetUserId}`);
                        }

                        const balanceBefore = parseFloat(wallet.totalBalance);
                        const earnedBefore = parseFloat(wallet.earnedBalance);
                        const newEarned = (earnedBefore + amount).toFixed(2);
                        const newTotal = (balanceBefore + amount).toFixed(2);

                        await tx.update(projectCurrencyWallets)
                            .set({ earnedBalance: newEarned, totalBalance: newTotal, updatedAt: new Date() })
                            .where(eq(projectCurrencyWallets.userId, targetUserId));

                        await tx.insert(projectCurrencyLedger).values({
                            userId: targetUserId,
                            walletId: wallet.id,
                            type: "refund",
                            amount: amount.toFixed(2),
                            balanceBefore: balanceBefore.toFixed(2),
                            balanceAfter: newTotal,
                            referenceId: refundReferenceId,
                            referenceType: "challenge_withdraw_refund",
                            description: `Challenge withdrawal refund (${refundReason}) for ${challengeId}`,
                            metadata: JSON.stringify({
                                challengeId,
                                reason: refundReason,
                                currencyType,
                            }),
                        });

                        return;
                    }

                    await tx.update(users)
                        .set({
                            balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${amount.toFixed(2)})::text`,
                            updatedAt: new Date(),
                        })
                        .where(eq(users.id, targetUserId));
                };

                // ========== WAITING ==========
                if (dbChallenge.status === "waiting") {
                    const isCreator = dbChallenge.player1Id === userId;
                    const requiredPlayers = Number(dbChallenge.requiredPlayers || 2);
                    const currentPlayers = Math.max(1, Number(dbChallenge.currentPlayers || 1));
                    const isTeamChallenge = requiredPlayers >= 4;

                    // Non-creator cannot cancel waiting challenge.
                    // In 4-player waiting challenges, they can only leave their own seat.
                    if (!isCreator) {
                        if (!isTeamChallenge || currentPlayers <= 1) {
                            throw new Error("Only challenge creator can cancel before start");
                        }

                        const seatUpdate: {
                            player2Id?: string | null;
                            player3Id?: string | null;
                            player4Id?: string | null;
                            currentPlayers: number;
                            updatedAt: Date;
                        } = {
                            currentPlayers: Math.max(1, currentPlayers - 1),
                            updatedAt: new Date(),
                        };

                        if (dbChallenge.player2Id === userId) {
                            seatUpdate.player2Id = null;
                        } else if (dbChallenge.player3Id === userId) {
                            seatUpdate.player3Id = null;
                        } else if (dbChallenge.player4Id === userId) {
                            seatUpdate.player4Id = null;
                        } else {
                            throw new Error("Only challenge creator can cancel before start");
                        }

                        await refundUserStake(userId, betAmount, "waiting_seat_exit");

                        const [updatedChallenge] = await tx.update(challengesTable)
                            .set(seatUpdate)
                            .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.status, "waiting")))
                            .returning();

                        if (!updatedChallenge) {
                            throw new Error("Challenge was already processed");
                        }

                        await tx.insert(transactions).values({
                            userId,
                            type: "game_refund",
                            amount: betAmount.toFixed(2),
                            balanceBefore: "0",
                            balanceAfter: betAmount.toFixed(2),
                            status: "completed",
                            description: `Full refund after leaving waiting challenge ${challengeId}`,
                            referenceId: challengeId,
                            processedAt: new Date(),
                        });

                        return {
                            challenge: updatedChallenge,
                            penalty: 0,
                            refundAmount: betAmount,
                            otherPlayerRefund: 0,
                            isActive: false,
                            action: "left_waiting" as const,
                        };
                    }

                    // Creator cancellation before start: refund all players who already staked.
                    const paidParticipantIds: string[] = [dbChallenge.player1Id];
                    let joinedNonCreatorCount = Math.max(0, currentPlayers - 1);
                    const candidateSeats = [dbChallenge.player2Id, dbChallenge.player3Id, dbChallenge.player4Id];

                    for (const seatUserId of candidateSeats) {
                        if (seatUserId && joinedNonCreatorCount > 0) {
                            paidParticipantIds.push(seatUserId);
                            joinedNonCreatorCount -= 1;
                        }
                    }

                    for (const participantId of paidParticipantIds) {
                        await refundUserStake(participantId, betAmount, "waiting_creator_cancel");
                    }

                    const [cancelled] = await tx.update(challengesTable)
                        .set({ status: "cancelled", updatedAt: new Date() })
                        .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.status, "waiting")))
                        .returning();

                    if (!cancelled) {
                        throw new Error("Challenge was already processed");
                    }

                    for (const participantId of paidParticipantIds) {
                        await tx.insert(transactions).values({
                            userId: participantId,
                            type: "game_refund",
                            amount: betAmount.toFixed(2),
                            balanceBefore: "0",
                            balanceAfter: betAmount.toFixed(2),
                            status: "completed",
                            description: `Full refund - challenge ${challengeId} cancelled before start`,
                            referenceId: challengeId,
                            processedAt: new Date(),
                        });
                    }

                    return {
                        challenge: cancelled,
                        penalty: 0,
                        refundAmount: betAmount,
                        otherPlayerRefund: betAmount,
                        isActive: false,
                        action: "cancelled_waiting" as const,
                        refundedPlayerIds: paidParticipantIds.filter((id) => id !== userId),
                    };
                }

                // ========== ACTIVE ==========
                const ACTIVE_PENALTY_PERCENT = 70;
                const penalty = betAmount * (ACTIVE_PENALTY_PERCENT / 100);
                const withdrawerRefund = betAmount - penalty;
                const otherPlayerIds = allPlayerIds.filter((id) => id !== userId) as string[];

                if (withdrawerRefund > 0) {
                    await refundUserStake(userId, withdrawerRefund, "active_withdrawer_partial");
                }

                for (const otherPlayerId of otherPlayerIds) {
                    await refundUserStake(otherPlayerId, betAmount, "active_opponent_full");
                }

                const [cancelled] = await tx.update(challengesTable)
                    .set({ status: "cancelled", updatedAt: new Date() })
                    .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.status, "active")))
                    .returning();

                if (!cancelled) {
                    throw new Error("Challenge was already processed");
                }

                await tx.update(liveGameSessions)
                    .set({ status: "completed", endedAt: new Date() })
                    .where(and(eq(liveGameSessions.challengeId, challengeId), eq(liveGameSessions.status, "in_progress")));

                if (penalty > 0) {
                    await tx.insert(transactions).values({
                        userId,
                        type: "platform_fee",
                        amount: penalty.toFixed(2),
                        balanceBefore: "0",
                        balanceAfter: "0",
                        status: "completed",
                        description: `Withdrawal penalty (${ACTIVE_PENALTY_PERCENT}%) from active challenge ${challengeId}`,
                        referenceId: challengeId,
                        processedAt: new Date(),
                    });
                }

                await tx.insert(transactions).values({
                    userId,
                    type: "game_refund",
                    amount: withdrawerRefund.toFixed(2),
                    balanceBefore: betAmount.toFixed(2),
                    balanceAfter: withdrawerRefund.toFixed(2),
                    status: "completed",
                    description: `Partial refund (${100 - ACTIVE_PENALTY_PERCENT}%) for active challenge withdrawal ${challengeId}`,
                    referenceId: challengeId,
                    processedAt: new Date(),
                });

                for (const otherPlayerId of otherPlayerIds) {
                    await tx.insert(transactions).values({
                        userId: otherPlayerId,
                        type: "game_refund",
                        amount: betAmount.toFixed(2),
                        balanceBefore: "0",
                        balanceAfter: betAmount.toFixed(2),
                        status: "completed",
                        description: `Full refund - opponent withdrew from active challenge ${challengeId}`,
                        referenceId: challengeId,
                        processedAt: new Date(),
                    });
                }

                return {
                    challenge: cancelled,
                    penalty,
                    refundAmount: withdrawerRefund,
                    otherPlayerRefund: betAmount,
                    isActive: true,
                    otherPlayerIds,
                    action: "cancelled_active" as const,
                };
            });

            if (result.action === "left_waiting") {
                broadcastChallengeUpdate("joined", result.challenge);
            } else {
                broadcastChallengeUpdate("cancelled", result.challenge);
            }

            if (result.isActive) {
                await sendNotification(userId, {
                    type: "warning",
                    priority: "high",
                    title: "Challenge Withdrawn - Penalty Applied",
                    titleAr: "تم سحب التحدي - تم تطبيق العقوبة",
                    message: `You withdrew from an active challenge. Penalty: $${result.penalty.toFixed(2)} (70%). Refund: $${result.refundAmount.toFixed(2)}.`,
                    messageAr: `انسحبت من تحدي نشط. الغرامة: $${result.penalty.toFixed(2)} (70%). الاسترداد: $${result.refundAmount.toFixed(2)}.`,
                    link: "/challenges",
                    metadata: JSON.stringify({ challengeId, penalty: result.penalty, refund: result.refundAmount, type: "active_withdraw" }),
                }).catch(() => { });

                const withdrawer = await storage.getUser(userId);
                for (const otherPlayerId of result.otherPlayerIds || []) {
                    await sendNotification(otherPlayerId, {
                        type: "system",
                        priority: "high",
                        title: "Opponent Withdrew - Full Refund",
                        titleAr: "انسحب الخصم - استرداد كامل",
                        message: `${withdrawer?.nickname || withdrawer?.username || "Your opponent"} withdrew from the challenge. Your stake of $${result.otherPlayerRefund.toFixed(2)} has been fully refunded.`,
                        messageAr: `انسحب ${withdrawer?.nickname || withdrawer?.username || "خصمك"} من التحدي. تم استرداد رهانك بالكامل: $${result.otherPlayerRefund.toFixed(2)}.`,
                        link: "/challenges",
                        metadata: JSON.stringify({ challengeId, refund: result.otherPlayerRefund, type: "opponent_withdraw" }),
                    }).catch(() => { });
                }
            } else if (result.action === "left_waiting") {
                await sendNotification(userId, {
                    type: "system",
                    priority: "normal",
                    title: "You Left The Waiting Challenge",
                    titleAr: "لقد غادرت التحدي قيد الانتظار",
                    message: `You left your seat in the waiting challenge. Full refund: $${result.refundAmount.toFixed(2)}.`,
                    messageAr: `لقد غادرت مقعدك في التحدي قيد الانتظار. استرداد كامل: $${result.refundAmount.toFixed(2)}.`,
                    link: "/challenges",
                    metadata: JSON.stringify({ challengeId, refund: result.refundAmount, type: "waiting_leave" }),
                }).catch(() => { });
            } else {
                await sendNotification(userId, {
                    type: "system",
                    priority: "normal",
                    title: "Challenge Cancelled",
                    titleAr: "تم إلغاء التحدي",
                    message: `Your challenge was cancelled. Full refund: $${result.refundAmount.toFixed(2)}.`,
                    messageAr: `تم إلغاء التحدي. استرداد كامل: $${result.refundAmount.toFixed(2)}.`,
                    link: "/challenges",
                    metadata: JSON.stringify({ challengeId, refund: result.refundAmount, type: "waiting_cancel" }),
                }).catch(() => { });

                const creator = await storage.getUser(userId);
                for (const refundedPlayerId of result.refundedPlayerIds || []) {
                    await sendNotification(refundedPlayerId, {
                        type: "system",
                        priority: "normal",
                        title: "Challenge Cancelled By Creator",
                        titleAr: "تم إلغاء التحدي بواسطة المنشئ",
                        message: `${creator?.nickname || creator?.username || "The creator"} cancelled the challenge before start. Your full stake was refunded.`,
                        messageAr: `قام ${creator?.nickname || creator?.username || "منشئ التحدي"} بإلغاء التحدي قبل البداية. تم استرداد رهانك بالكامل.`,
                        link: "/challenges",
                        metadata: JSON.stringify({ challengeId, refund: result.otherPlayerRefund, type: "waiting_creator_cancelled" }),
                    }).catch(() => { });
                }
            }

            res.json({ ...result.challenge, penalty: result.penalty, refundAmount: result.refundAmount });
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const normalizedError = errorMessage.toLowerCase();

            const status = normalizedError.includes("not found") || normalizedError.includes("not a player")
                ? 404
                : normalizedError.includes("only challenge creator")
                    ? 403
                    : normalizedError.includes("only withdraw") || normalizedError.includes("already processed") || normalizedError.includes("can only")
                        ? 400
                        : 500;

            res.status(status).json({ error: errorMessage });
        }
    });
}