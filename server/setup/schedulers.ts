import { storage } from "../storage";
import { challengeGameSessions, challenges, notifications, p2pSettings, p2pTrades } from "@shared/schema";
import { db } from "../db";
import { eq, and, or, sql, lt } from "drizzle-orm";
import { broadcastSystemEvent, challengeGameRooms } from "../websocket";
import { logger } from "../lib/logger";
import { runAdaptiveAiHealthCheck } from "../lib/adaptive-ai";
import { sendAiAgentLearningEvent } from "../lib/ai-agent-client";
import { settleChallengePayout } from "../lib/payout";
import { WebSocket } from "ws";

export function startSchedulers(): void {
  // ==================== SCHEDULED CONFIG CHANGES SCHEDULER ====================
  const SCHEDULER_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 30s — too frequent)

  async function processScheduledChanges() {
    try {
      const pendingChanges = await storage.getPendingScheduledChanges();

      for (const change of pendingChanges) {
        logger.info(`[Scheduler] Applying scheduled change ${change.id} for game ${change.gameId}`);
        const result = await storage.applyScheduledConfigChange(change.id);

        if (result.success) {
          const game = await storage.getMultiplayerGame(change.gameId);

          broadcastSystemEvent({
            type: 'game_config_changed',
            data: {
              action: change.action,
              gameKey: game?.key,
              scheduledChangeId: change.id,
              isScheduled: true
            }
          });

          logger.info(`[Scheduler] Successfully applied scheduled change ${change.id}`);
        } else {
          logger.error(`[Scheduler] Failed to apply scheduled change ${change.id}: ${result.error}`);
        }
      }
    } catch (error) {
      logger.error('[Scheduler] Error processing scheduled changes', error instanceof Error ? error : new Error(String(error)));
    }
  }

  setInterval(processScheduledChanges, SCHEDULER_INTERVAL);
  logger.info(`[Scheduler] Started scheduled config changes processor (interval: ${SCHEDULER_INTERVAL / 1000}s)`);

  // ==================== ADAPTIVE AI HEALTH MONITOR SCHEDULER ====================
  const AI_MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes

  async function processAdaptiveAiHealth() {
    try {
      const snapshot = await runAdaptiveAiHealthCheck();

      void sendAiAgentLearningEvent('project_snapshot', {
        source: 'adaptive_ai_health_scheduler',
        generatedAt: snapshot.generatedAt,
        modelStale: snapshot.modelStale,
        dominantGamesCount: snapshot.dominantGames.length,
        highAbandonGamesCount: snapshot.highAbandonGames.length,
        dominantGames: snapshot.dominantGames.slice(0, 5),
        highAbandonGames: snapshot.highAbandonGames.slice(0, 5),
      });

      if (snapshot.modelStale || snapshot.dominantGames.length > 0 || snapshot.highAbandonGames.length > 0) {
        logger.info(
          `[AI Monitor] anomalies detected modelStale=${snapshot.modelStale} dominantGames=${snapshot.dominantGames.length} highAbandonGames=${snapshot.highAbandonGames.length}`,
        );
      }
    } catch (error) {
      logger.error('[AI Monitor] Scheduler health check failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  setTimeout(processAdaptiveAiHealth, 15000);
  setInterval(processAdaptiveAiHealth, AI_MONITOR_INTERVAL);
  logger.info(`[AI Monitor] Started adaptive AI health monitor (interval: ${AI_MONITOR_INTERVAL / 1000}s)`);

  // ==================== P2P TRADE EXPIRY SCHEDULER ====================
  const P2P_EXPIRY_INTERVAL = 60 * 1000; // 1 minute

  async function processExpiredTrades() {
    try {
      const [settings] = await db.select().from(p2pSettings).limit(1);
      if (!settings?.autoExpireEnabled) {
        return;
      }

      const now = new Date();
      const expiredTrades = await db.select()
        .from(p2pTrades)
        .where(and(
          or(eq(p2pTrades.status, "pending"), eq(p2pTrades.status, "paid")),
          sql`${p2pTrades.expiresAt} <= ${now}`
        ))
        .limit(50);

      for (const trade of expiredTrades) {
        try {
          let result;
          if (trade.currencyType === 'project') {
            result = await storage.cancelP2PTradeProjectCurrencyAtomic(trade.id, trade.sellerId, "Trade expired - auto-cancelled");
          } else {
            result = await storage.cancelP2PTradeAtomic(trade.id, trade.sellerId, "Trade expired - auto-cancelled");
          }

          if (result.success) {
            logger.info(`[P2P Scheduler] Auto-cancelled expired trade ${trade.id}`);

            await storage.createNotification({
              userId: trade.buyerId,
              type: 'p2p',
              title: 'Trade Expired',
              titleAr: 'انتهت صلاحية الصفقة',
              message: `Your trade #${trade.id.slice(0, 8)} has expired and was auto-cancelled.`,
              messageAr: `انتهت صلاحية صفقتك #${trade.id.slice(0, 8)} وتم إلغاؤها تلقائياً.`,
              metadata: JSON.stringify({ tradeId: trade.id }),
              link: '/p2p',
            });

            await storage.createNotification({
              userId: trade.sellerId,
              type: 'p2p',
              title: 'Trade Expired',
              titleAr: 'انتهت صلاحية الصفقة',
              message: `Trade #${trade.id.slice(0, 8)} has expired and was auto-cancelled. Funds returned to your balance.`,
              messageAr: `انتهت صلاحية الصفقة #${trade.id.slice(0, 8)} وتم إلغاؤها تلقائياً. تم إرجاع الأموال إلى رصيدك.`,
              metadata: JSON.stringify({ tradeId: trade.id }),
              link: '/p2p',
            });
          } else {
            logger.error(`[P2P Scheduler] Failed to auto-cancel trade ${trade.id}: ${result.error}`);
          }
        } catch (tradeError) {
          logger.error(`[P2P Scheduler] Error processing expired trade ${trade.id}`, tradeError instanceof Error ? tradeError : new Error(String(tradeError)));
        }
      }

      if (expiredTrades.length > 0) {
        logger.info(`[P2P Scheduler] Processed ${expiredTrades.length} expired trades`);
      }
    } catch (error) {
      logger.error('[P2P Scheduler] Error processing expired trades', error instanceof Error ? error : new Error(String(error)));
    }
  }

  setInterval(processExpiredTrades, P2P_EXPIRY_INTERVAL);
  logger.info(`[P2P Scheduler] Started expired trades processor (interval: ${P2P_EXPIRY_INTERVAL / 1000}s)`);

  // ==================== NOTIFICATION CLEANUP SCHEDULER ====================
  // Delete read notifications older than 30 days, unread older than 90 days
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  async function cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      // Delete read notifications older than 30 days
      const readResult = await db.delete(notifications)
        .where(and(
          eq(notifications.isRead, true),
          lt(notifications.createdAt, thirtyDaysAgo)
        ));

      // Delete unread notifications older than 90 days
      const unreadResult = await db.delete(notifications)
        .where(and(
          eq(notifications.isRead, false),
          lt(notifications.createdAt, ninetyDaysAgo)
        ));

      const readCount = readResult.rowCount || 0;
      const unreadCount = unreadResult.rowCount || 0;
      if (readCount > 0 || unreadCount > 0) {
        logger.info(`[Notification Cleanup] Deleted ${readCount} read (30d+) and ${unreadCount} unread (90d+) notifications`);
      }
    } catch (error) {
      logger.error('[Notification Cleanup] Error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Run cleanup on startup (after 30s delay) then every 6 hours
  setTimeout(cleanupOldNotifications, 30000);
  setInterval(cleanupOldNotifications, CLEANUP_INTERVAL);
  logger.info(`[Notification Cleanup] Started (interval: ${CLEANUP_INTERVAL / 3600000}h)`);

  // ==================== CHESS TIMEOUT WATCHDOG ====================
  // Server-authoritative timeout settlement for active challenge chess games.
  const CHESS_TIMEOUT_WATCHDOG_INTERVAL = 3000;

  async function processChallengeChessTimeouts() {
    try {
      const activeRows = await db.select({
        challengeId: challengeGameSessions.challengeId,
      })
        .from(challengeGameSessions)
        .innerJoin(challenges, eq(challengeGameSessions.challengeId, challenges.id))
        .where(and(
          eq(challengeGameSessions.status, "playing"),
          eq(challenges.status, "active"),
          eq(challengeGameSessions.gameType, "chess"),
          sql`${challengeGameSessions.currentTurn} IS NOT NULL`
        ))
        .limit(50);

      for (const row of activeRows) {
        try {
          const outcome = await db.transaction(async (tx) => {
            const [session] = await tx.select()
              .from(challengeGameSessions)
              .where(eq(challengeGameSessions.challengeId, row.challengeId))
              .orderBy(sql`${challengeGameSessions.createdAt} DESC`)
              .limit(1)
              .for("update");

            if (!session || session.status !== "playing" || !session.currentTurn) {
              return null;
            }

            const [challenge] = await tx.select()
              .from(challenges)
              .where(eq(challenges.id, row.challengeId))
              .limit(1)
              .for("update");

            if (!challenge || challenge.status !== "active" || !challenge.player2Id) {
              return null;
            }

            const currentTurnPlayerId = session.currentTurn;
            if (currentTurnPlayerId !== challenge.player1Id && currentTurnPlayerId !== challenge.player2Id) {
              return null;
            }

            const nowMs = Date.now();
            const lastMoveAt = session.lastMoveAt ?? session.updatedAt ?? session.createdAt ?? new Date(nowMs);
            const elapsedSec = Math.max(0, Math.floor((nowMs - new Date(lastMoveAt).getTime()) / 1000));
            if (elapsedSec <= 0) {
              return null;
            }

            const player1Remaining = Math.max(0, Number(session.player1TimeRemaining ?? challenge.timeLimit ?? 300));
            const player2Remaining = Math.max(0, Number(session.player2TimeRemaining ?? challenge.timeLimit ?? 300));

            const isPlayer1Turn = currentTurnPlayerId === challenge.player1Id;
            const nextPlayer1Remaining = Math.max(0, isPlayer1Turn ? player1Remaining - elapsedSec : player1Remaining);
            const nextPlayer2Remaining = Math.max(0, !isPlayer1Turn ? player2Remaining - elapsedSec : player2Remaining);
            const timedOut = isPlayer1Turn ? nextPlayer1Remaining <= 0 : nextPlayer2Remaining <= 0;

            if (!timedOut) {
              return null;
            }

            const winnerId = isPlayer1Turn ? challenge.player2Id : challenge.player1Id;
            const loserId = currentTurnPlayerId;

            if (!winnerId || !loserId) {
              return null;
            }

            const [updatedSession] = await tx.update(challengeGameSessions)
              .set({
                status: "finished",
                winnerId,
                winReason: "timeout",
                currentTurn: null,
                player1TimeRemaining: nextPlayer1Remaining,
                player2TimeRemaining: nextPlayer2Remaining,
                updatedAt: new Date(),
              })
              .where(eq(challengeGameSessions.id, session.id))
              .returning();

            await tx.update(challenges)
              .set({
                status: "completed",
                winnerId,
                endedAt: new Date(),
              })
              .where(eq(challenges.id, challenge.id));

            return {
              challengeId: challenge.id,
              winnerId,
              loserId,
              seq: typeof updatedSession?.totalMoves === "number" ? updatedSession.totalMoves : 0,
            };
          });

          if (!outcome) {
            continue;
          }

          const payoutResult = await settleChallengePayout(
            outcome.challengeId,
            outcome.winnerId,
            outcome.loserId,
            "chess",
          );

          if (!payoutResult.success) {
            logger.error(`[Chess Timeout Watchdog] Payout failed for challenge ${outcome.challengeId}: ${payoutResult.error}`);
          }

          const room = challengeGameRooms.get(outcome.challengeId);
          if (room) {
            const message = JSON.stringify({
              type: "game_ended",
              winnerId: outcome.winnerId,
              reason: "timeout",
              seq: outcome.seq,
            });

            [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(message);
              }
            });
          }

          logger.info(`[Chess Timeout Watchdog] Settled timeout challenge ${outcome.challengeId}`);
        } catch (perChallengeError) {
          logger.error(
            `[Chess Timeout Watchdog] Failed processing challenge ${row.challengeId}`,
            perChallengeError instanceof Error ? perChallengeError : new Error(String(perChallengeError)),
          );
        }
      }
    } catch (error) {
      logger.error("[Chess Timeout Watchdog] Error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  setTimeout(processChallengeChessTimeouts, 10000);
  setInterval(processChallengeChessTimeouts, CHESS_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Chess Timeout Watchdog] Started (interval: ${CHESS_TIMEOUT_WATCHDOG_INTERVAL}ms)`);
}
