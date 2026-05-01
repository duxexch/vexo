import { storage } from "../storage";
import {
  challengeChatMessages,
  challengeGameSessions,
  challenges,
  notifications,
  p2pDisputes,
  p2pSettings,
  p2pTrades,
  p2pTransactionLogs,
} from "@shared/schema";
import { db, pool } from "../db";
import { eq, and, or, sql, lt } from "drizzle-orm";
import { broadcastSystemEvent, challengeGameRooms } from "../websocket";
import { logger } from "../lib/logger";
import { runAdaptiveAiHealthCheck } from "../lib/adaptive-ai";
import { sendAiAgentLearningEvent } from "../lib/ai-agent-client";
import { startMarketerCommissionScheduler } from "../lib/marketer-commission-scheduler";
import { getGameEngine } from "../game-engines";
import type { MoveData } from "../game-engines/types";
import { settleChallengePayout, settleDrawPayout } from "../lib/payout";
import { normalizeChallengeGameState } from "../lib/challenge-game-state";
import { WebSocket } from "ws";

/**
 * Watchdogs run every ~1s. When a challenge enters an unrecoverable state
 * (e.g. "invalid game state", "no valid timeout move"), the watchdog returns
 * early and re-enters the same branch on every tick, producing thousands of
 * duplicate WARN log lines per hour.
 *
 * This cache de-duplicates WARN messages per `(challengeId, reason)` for a
 * configurable TTL so each stuck challenge is logged once per hour instead of
 * once per second. The cache is bounded to prevent unbounded memory growth.
 */
const WATCHDOG_SKIP_LOG_TTL_MS = 60 * 60 * 1000;
const WATCHDOG_SKIP_LOG_MAX_ENTRIES = 5000;
const watchdogSkipLogCache = new Map<string, number>();

function shouldLogWatchdogSkip(challengeId: string, reason: string): boolean {
  const key = `${challengeId}::${reason}`;
  const now = Date.now();
  const last = watchdogSkipLogCache.get(key);
  if (last !== undefined && now - last < WATCHDOG_SKIP_LOG_TTL_MS) {
    return false;
  }
  watchdogSkipLogCache.set(key, now);

  if (watchdogSkipLogCache.size > WATCHDOG_SKIP_LOG_MAX_ENTRIES) {
    for (const [k, t] of watchdogSkipLogCache) {
      if (now - t > WATCHDOG_SKIP_LOG_TTL_MS) {
        watchdogSkipLogCache.delete(k);
      }
    }
    if (watchdogSkipLogCache.size > WATCHDOG_SKIP_LOG_MAX_ENTRIES) {
      const overflow = watchdogSkipLogCache.size - WATCHDOG_SKIP_LOG_MAX_ENTRIES;
      let removed = 0;
      for (const k of watchdogSkipLogCache.keys()) {
        if (removed >= overflow) break;
        watchdogSkipLogCache.delete(k);
        removed++;
      }
    }
  }
  return true;
}

function selectDominoTimeoutAutoMove(validMoves: MoveData[]): MoveData | null {
  const playableMoves = validMoves.filter((move) => move.type === "play");
  if (playableMoves.length > 0) {
    const scored = playableMoves
      .map((move) => {
        const tile = move.tile as { left?: number; right?: number } | undefined;
        const left = typeof tile?.left === "number" ? tile.left : 0;
        const right = typeof tile?.right === "number" ? tile.right : 0;
        const isDouble = left === right;
        return {
          move,
          score: (left + right) + (isDouble ? 12 : 0),
        };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.move ?? playableMoves[0] ?? null;
  }

  const drawMove = validMoves.find((move) => move.type === "draw");
  if (drawMove) {
    return drawMove;
  }

  const passMove = validMoves.find((move) => move.type === "pass");
  return passMove ?? null;
}

const BALOOT_HOKM_TIMEOUT_POINTS: Record<string, number> = {
  J: 20,
  "9": 14,
  A: 11,
  "10": 10,
  K: 4,
  Q: 3,
  "8": 0,
  "7": 0,
};

const BALOOT_SUN_TIMEOUT_POINTS: Record<string, number> = {
  A: 11,
  "10": 10,
  K: 4,
  Q: 3,
  J: 2,
  "9": 0,
  "8": 0,
  "7": 0,
};

function parseBalootMoveCard(move: MoveData): { suit: string; rank: string } | null {
  if (move.type !== "playCard" || move.card == null) {
    return null;
  }

  let payload: unknown = move.card;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const suit = (payload as { suit?: unknown }).suit;
  const rank = (payload as { rank?: unknown }).rank;

  if (typeof suit !== "string" || typeof rank !== "string") {
    return null;
  }

  return { suit, rank };
}

function buildBalootMoveKey(move: MoveData): string {
  if (move.type === "playCard") {
    const card = parseBalootMoveCard(move);
    if (card) {
      return `playCard:${card.suit}:${card.rank}`;
    }
    return "playCard:unknown";
  }

  if (move.type === "choose") {
    const gameType = typeof move.gameType === "string" ? move.gameType : "unknown";
    const trumpSuit = typeof move.trumpSuit === "string" ? move.trumpSuit : "none";
    return `choose:${gameType}:${trumpSuit}`;
  }

  return String(move.type || "unknown");
}

function findMatchingBalootMove(targetMove: MoveData, validMoves: MoveData[]): MoveData | null {
  const targetKey = buildBalootMoveKey(targetMove);
  const exact = validMoves.find((candidate) => buildBalootMoveKey(candidate) === targetKey);
  if (exact) {
    return exact;
  }

  if (targetMove.type === "playCard") {
    const targetCard = parseBalootMoveCard(targetMove);
    if (targetCard) {
      return validMoves.find((candidate) => {
        if (candidate.type !== "playCard") {
          return false;
        }
        const candidateCard = parseBalootMoveCard(candidate);
        return Boolean(candidateCard && candidateCard.suit === targetCard.suit && candidateCard.rank === targetCard.rank);
      }) ?? null;
    }
  }

  return null;
}

function selectBalootTimeoutAutoMove(
  engine: NonNullable<ReturnType<typeof getGameEngine>>,
  stateJson: string,
  validMoves: MoveData[],
): MoveData | null {
  if (validMoves.length === 0) {
    return null;
  }

  let parsedState: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(stateJson) as unknown;
    if (parsed && typeof parsed === "object") {
      parsedState = parsed as Record<string, unknown>;
    }
  } catch {
    parsedState = null;
  }

  const strategyMove = (() => {
    if (!parsedState) {
      return null;
    }

    const generator = (engine as unknown as { generateBotMove?: (state: unknown) => MoveData }).generateBotMove;
    if (typeof generator !== "function") {
      return null;
    }

    try {
      return generator.call(engine, parsedState);
    } catch {
      return null;
    }
  })();

  if (strategyMove) {
    const matchedMove = findMatchingBalootMove(strategyMove, validMoves);
    if (matchedMove) {
      return matchedMove;
    }
  }

  const playableMoves = validMoves.filter((move) => move.type === "playCard");
  if (playableMoves.length > 0) {
    const gameType = parsedState?.gameType === "hokm" ? "hokm" : "sun";
    const trumpSuit = typeof parsedState?.trumpSuit === "string" ? parsedState.trumpSuit : null;

    const scoredMoves = playableMoves
      .map((move, index) => {
        const card = parseBalootMoveCard(move);
        const score = !card
          ? Number.MAX_SAFE_INTEGER
          : (gameType === "hokm" && trumpSuit && card.suit === trumpSuit
            ? (BALOOT_HOKM_TIMEOUT_POINTS[card.rank] ?? 0)
            : (BALOOT_SUN_TIMEOUT_POINTS[card.rank] ?? 0));

        return {
          move,
          score,
          tie: card ? `${card.suit}:${card.rank}` : `idx:${index}`,
        };
      })
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score;
        }
        return a.tie.localeCompare(b.tie);
      });

    return scoredMoves[0]?.move ?? playableMoves[0] ?? null;
  }

  const passMove = validMoves.find((move) => move.type === "pass");
  if (passMove) {
    return passMove;
  }

  const sunMove = validMoves.find((move) => move.type === "choose" && String(move.gameType || "").toLowerCase() === "sun");
  if (sunMove) {
    return sunMove;
  }

  const hokmMove = validMoves.find((move) => move.type === "choose" && String(move.gameType || "").toLowerCase() === "hokm");
  if (hokmMove) {
    return hokmMove;
  }

  return validMoves[0] ?? null;
}

function pickRandomMove(validMoves: MoveData[]): MoveData | null {
  if (validMoves.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * validMoves.length);
  return validMoves[index] ?? validMoves[0] ?? null;
}

function selectTarneebTimeoutAutoMove(validMoves: MoveData[]): MoveData | null {
  if (validMoves.length === 0) {
    return null;
  }

  // Keep timeout behavior human-like: random legal card if the turn is a card play.
  const playCardMoves = validMoves.filter((move) => move.type === "playCard");
  if (playCardMoves.length > 0) {
    return pickRandomMove(playCardMoves);
  }

  const setTrumpMoves = validMoves.filter((move) => move.type === "setTrump");
  if (setTrumpMoves.length > 0) {
    return pickRandomMove(setTrumpMoves);
  }

  const passLikeBid = validMoves.find((move) => move.type === "bid" && (move.bid === null || move.bid === undefined));
  if (passLikeBid) {
    return passLikeBid.bid === undefined
      ? ({ ...passLikeBid, bid: null } as unknown as MoveData)
      : passLikeBid;
  }

  const bidMoves = validMoves.filter((move) => move.type === "bid" && typeof move.bid === "number");
  if (bidMoves.length > 0) {
    return pickRandomMove(bidMoves);
  }

  return pickRandomMove(validMoves);
}

type WatchdogFailureState = {
  consecutiveFailures: number;
  backoffUntilMs: number;
  lastErrorLogAtMs: number;
};

type DatabaseWatchdogState = WatchdogFailureState & {
  lastProbeAtMs: number;
  probeSucceededAtMs: number;
};

const DATABASE_PROBE_MIN_INTERVAL_MS = 5_000;
const DATABASE_PROBE_FAILURE_BACKOFF_MS = 30_000;

function createDatabaseWatchdogState(): DatabaseWatchdogState {
  return {
    consecutiveFailures: 0,
    backoffUntilMs: 0,
    lastErrorLogAtMs: 0,
    lastProbeAtMs: 0,
    probeSucceededAtMs: 0,
  };
}

async function shouldRunDatabaseWatchdog(state: DatabaseWatchdogState): Promise<boolean> {
  const now = Date.now();
  if (now < state.backoffUntilMs) {
    return false;
  }

  if (now - state.lastProbeAtMs < DATABASE_PROBE_MIN_INTERVAL_MS && state.probeSucceededAtMs > 0) {
    return true;
  }

  state.lastProbeAtMs = now;
  try {
    await pool.query("SELECT 1");
    state.probeSucceededAtMs = now;
    state.consecutiveFailures = 0;
    state.backoffUntilMs = 0;
    return true;
  } catch {
    state.consecutiveFailures += 1;
    state.backoffUntilMs = now + DATABASE_PROBE_FAILURE_BACKOFF_MS;
    if (state.consecutiveFailures === 1 || now - state.lastErrorLogAtMs >= WATCHDOG_ERROR_LOG_THROTTLE_MS) {
      logger.warn("[Database Watchdog Gate] Skipping schedulers because the database is unavailable");
      state.lastErrorLogAtMs = now;
    }
    return false;
  }
}
const WATCHDOG_ERROR_LOG_THROTTLE_MS = 30_000;
const WATCHDOG_BACKOFF_BASE_MS = 3_000;
const WATCHDOG_BACKOFF_MAX_MS = 60_000;

function createWatchdogFailureState(): WatchdogFailureState {
  return {
    consecutiveFailures: 0,
    backoffUntilMs: 0,
    lastErrorLogAtMs: 0,
  };
}

function shouldRunWatchdog(state: WatchdogFailureState): boolean {
  return Date.now() >= state.backoffUntilMs;
}

function markWatchdogFailure(name: string, state: WatchdogFailureState, error: Error): void {
  const now = Date.now();
  state.consecutiveFailures += 1;

  const backoffMs = Math.min(
    WATCHDOG_BACKOFF_MAX_MS,
    WATCHDOG_BACKOFF_BASE_MS * 2 ** (state.consecutiveFailures - 1),
  );
  state.backoffUntilMs = now + backoffMs;

  const shouldLog = state.consecutiveFailures === 1 || (now - state.lastErrorLogAtMs) >= WATCHDOG_ERROR_LOG_THROTTLE_MS;
  if (shouldLog) {
    logger.error(
      `[${name}] Error (failure #${state.consecutiveFailures}, next retry in ${backoffMs}ms)`,
      error,
    );
    state.lastErrorLogAtMs = now;
  }
}

function markWatchdogRecovery(name: string, state: WatchdogFailureState): void {
  if (state.consecutiveFailures > 0) {
    logger.info(`[${name}] Recovered after ${state.consecutiveFailures} consecutive failures`);
  }

  state.consecutiveFailures = 0;
  state.backoffUntilMs = 0;
  state.lastErrorLogAtMs = 0;
}

export function startSchedulers(): void {
  // ==================== MARKETER COMMISSION SCHEDULER ====================
  startMarketerCommissionScheduler();

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
  const p2pExpirySchedulerState = createWatchdogFailureState();
  const databaseWatchdogState = createDatabaseWatchdogState();

  async function processExpiredTrades() {
    if (!shouldRunWatchdog(p2pExpirySchedulerState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

    try {
      const [settings] = await db.select().from(p2pSettings).limit(1);
      if (!settings?.autoExpireEnabled) {
        markWatchdogRecovery("P2P Scheduler", p2pExpirySchedulerState);
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

            await db.insert(p2pTransactionLogs).values({
              tradeId: trade.id,
              userId: trade.sellerId,
              action: "trade_cancelled",
              description: `Trade auto-cancelled after payment timeout expiry.`,
              descriptionAr: `تم إلغاء الصفقة تلقائياً بعد انتهاء مهلة الدفع.`,
              metadata: JSON.stringify({
                reason: "auto_expired",
                expiresAt: trade.expiresAt,
              }),
            });

            await db.insert(p2pTransactionLogs).values({
              tradeId: trade.id,
              userId: trade.sellerId,
              action: "escrow_returned",
              description: `Escrow returned to seller after auto-cancellation.`,
              descriptionAr: `تم إرجاع الضمان للبائع بعد الإلغاء التلقائي.`,
              metadata: JSON.stringify({
                reason: "auto_expired",
                escrowAmount: trade.escrowAmount,
              }),
            });

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
      markWatchdogRecovery("P2P Scheduler", p2pExpirySchedulerState);
    } catch (error) {
      markWatchdogFailure(
        "P2P Scheduler",
        p2pExpirySchedulerState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setInterval(processExpiredTrades, P2P_EXPIRY_INTERVAL);
  logger.info(`[P2P Scheduler] Started expired trades processor (interval: ${P2P_EXPIRY_INTERVAL / 1000}s)`);

  // ==================== P2P DISPUTE ESCALATION SCHEDULER ====================
  // Auto-escalate stale open disputes after peer-negotiation window.
  const P2P_DISPUTE_ESCALATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const P2P_PEER_NEGOTIATION_TIMEOUT_MINUTES = 10;

  async function processStaleOpenDisputes() {
    try {
      const cutoff = new Date(Date.now() - (P2P_PEER_NEGOTIATION_TIMEOUT_MINUTES * 60 * 1000));

      const staleOpenDisputes = await db.select({
        id: p2pDisputes.id,
        tradeId: p2pDisputes.tradeId,
        initiatorId: p2pDisputes.initiatorId,
        respondentId: p2pDisputes.respondentId,
      })
        .from(p2pDisputes)
        .where(and(
          eq(p2pDisputes.status, "open"),
          lt(p2pDisputes.createdAt, cutoff),
        ))
        .limit(50);

      for (const dispute of staleOpenDisputes) {
        try {
          const [escalated] = await db.update(p2pDisputes)
            .set({
              status: "investigating",
              updatedAt: new Date(),
            })
            .where(and(
              eq(p2pDisputes.id, dispute.id),
              eq(p2pDisputes.status, "open"),
            ))
            .returning({ id: p2pDisputes.id });

          if (!escalated) {
            continue;
          }

          await db.insert(p2pTransactionLogs).values({
            tradeId: dispute.tradeId,
            disputeId: dispute.id,
            action: "dispute_message",
            description: "Dispute auto-escalated to support review after peer negotiation timeout.",
            descriptionAr: "تم تصعيد النزاع تلقائياً لمراجعة الدعم بعد انتهاء مهلة التفاوض.",
          });

          await storage.createNotification({
            userId: dispute.initiatorId,
            type: 'p2p',
            title: 'Dispute Escalated to Support',
            titleAr: 'تم تصعيد النزاع للدعم',
            message: `Dispute #${dispute.id.slice(0, 8)} was auto-escalated after no response during peer negotiation.`,
            messageAr: `تم تصعيد النزاع #${dispute.id.slice(0, 8)} تلقائياً بعد عدم الاستجابة خلال التفاوض.`,
            metadata: JSON.stringify({ disputeId: dispute.id, tradeId: dispute.tradeId, action: 'auto_escalated' }),
            link: '/p2p/disputes',
          });

          await storage.createNotification({
            userId: dispute.respondentId,
            type: 'p2p',
            title: 'Dispute Escalated to Support',
            titleAr: 'تم تصعيد النزاع للدعم',
            message: `Dispute #${dispute.id.slice(0, 8)} was auto-escalated after peer negotiation timeout.`,
            messageAr: `تم تصعيد النزاع #${dispute.id.slice(0, 8)} تلقائياً بعد انتهاء مهلة التفاوض.`,
            metadata: JSON.stringify({ disputeId: dispute.id, tradeId: dispute.tradeId, action: 'auto_escalated' }),
            link: '/p2p/disputes',
          });

          logger.info(`[P2P Dispute Scheduler] Auto-escalated stale dispute ${dispute.id}`);
        } catch (disputeError) {
          logger.error(
            `[P2P Dispute Scheduler] Error processing dispute ${dispute.id}`,
            disputeError instanceof Error ? disputeError : new Error(String(disputeError)),
          );
        }
      }

      if (staleOpenDisputes.length > 0) {
        logger.info(`[P2P Dispute Scheduler] Processed ${staleOpenDisputes.length} stale open disputes`);
      }
    } catch (error) {
      logger.error('[P2P Dispute Scheduler] Error processing stale disputes', error instanceof Error ? error : new Error(String(error)));
    }
  }

  setInterval(processStaleOpenDisputes, P2P_DISPUTE_ESCALATION_INTERVAL);
  logger.info(`[P2P Dispute Scheduler] Started stale open disputes escalator (interval: ${P2P_DISPUTE_ESCALATION_INTERVAL / 1000}s, timeout=${P2P_PEER_NEGOTIATION_TIMEOUT_MINUTES}m)`);

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

  // ==================== SITEMAP REBUILD SCHEDULER ====================
  // Proactively refresh programmatic-SEO sitemap caches and per-route SEO meta
  // every 30 minutes so search engines see fresh URLs (new players, matches,
  // game name updates) without waiting for a TTL miss on each request.
  const SITEMAP_REBUILD_INTERVAL = 30 * 60 * 1000;
  async function rebuildSitemapCaches() {
    try {
      const { invalidateSitemapCache, clearDynamicSeoCache } = await import("../lib/sitemap-builder");
      invalidateSitemapCache();
      clearDynamicSeoCache();
      logger.info(`[Sitemap Rebuild] Cleared sitemap and dynamic SEO caches`);
    } catch (error) {
      logger.error('[Sitemap Rebuild] Error', error instanceof Error ? error : new Error(String(error)));
    }
  }
  setTimeout(rebuildSitemapCaches, 60_000);
  setInterval(rebuildSitemapCaches, SITEMAP_REBUILD_INTERVAL);
  logger.info(`[Sitemap Rebuild] Started (interval: ${SITEMAP_REBUILD_INTERVAL / 60000}m)`);

  // ==================== CHESS TIMEOUT WATCHDOG ====================
  // Server-authoritative timeout settlement for active challenge chess games.
  const CHESS_TIMEOUT_WATCHDOG_INTERVAL = 3000;
  const chessTimeoutWatchdogState = createWatchdogFailureState();

  async function processChallengeChessTimeouts() {
    if (!shouldRunWatchdog(chessTimeoutWatchdogState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

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
      markWatchdogRecovery("Chess Timeout Watchdog", chessTimeoutWatchdogState);
    } catch (error) {
      markWatchdogFailure(
        "Chess Timeout Watchdog",
        chessTimeoutWatchdogState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setTimeout(processChallengeChessTimeouts, 10000);
  setInterval(processChallengeChessTimeouts, CHESS_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Chess Timeout Watchdog] Started (interval: ${CHESS_TIMEOUT_WATCHDOG_INTERVAL}ms)`);

  // ==================== DOMINO TIMEOUT AUTO-MOVE WATCHDOG ====================
  // Server-authoritative 30s per-turn timeout for challenge domino sessions.
  const DOMINO_TURN_TIMEOUT_MS = 30_000;
  const DOMINO_TIMEOUT_WATCHDOG_INTERVAL = 1000;
  const dominoTimeoutWatchdogState = createWatchdogFailureState();

  async function processChallengeDominoTimeouts() {
    const dominoEngine = getGameEngine("domino");
    if (!dominoEngine) {
      return;
    }

    if (!shouldRunWatchdog(dominoTimeoutWatchdogState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

    try {
      const activeRows = await db.select({
        challengeId: challengeGameSessions.challengeId,
      })
        .from(challengeGameSessions)
        .innerJoin(challenges, eq(challengeGameSessions.challengeId, challenges.id))
        .where(and(
          eq(challengeGameSessions.status, "playing"),
          eq(challenges.status, "active"),
          eq(challengeGameSessions.gameType, "domino"),
          sql`${challengeGameSessions.currentTurn} IS NOT NULL`
        ))
        .limit(80);

      for (const row of activeRows) {
        try {
          const outcome = await db.transaction(async (tx) => {
            const [session] = await tx.select()
              .from(challengeGameSessions)
              .where(eq(challengeGameSessions.challengeId, row.challengeId))
              .orderBy(sql`${challengeGameSessions.createdAt} DESC`)
              .limit(1)
              .for("update");

            if (!session || session.status !== "playing" || !session.currentTurn || String(session.gameType || "").toLowerCase() !== "domino") {
              return null;
            }

            const [challenge] = await tx.select()
              .from(challenges)
              .where(eq(challenges.id, row.challengeId))
              .limit(1)
              .for("update");

            if (!challenge || challenge.status !== "active") {
              return null;
            }

            const playerIds = [
              challenge.player1Id,
              challenge.player2Id,
              challenge.player3Id,
              challenge.player4Id,
            ].filter(Boolean) as string[];

            const timedOutPlayerId = session.currentTurn;
            if (!playerIds.includes(timedOutPlayerId)) {
              return null;
            }

            const nowMs = Date.now();
            const turnStartedAt = session.lastMoveAt ?? session.updatedAt ?? session.createdAt ?? new Date(nowMs);
            const elapsedMs = Math.max(0, nowMs - new Date(turnStartedAt).getTime());
            if (elapsedMs < DOMINO_TURN_TIMEOUT_MS) {
              return null;
            }

            const normalizedState = normalizeChallengeGameState(session.gameState);
            if (!normalizedState) {
              if (shouldLogWatchdogSkip(row.challengeId, "domino:invalid_state")) {
                logger.warn(`[Domino Timeout Watchdog] Skipped challenge ${row.challengeId} due to invalid game state`);
              }
              return null;
            }

            const validMoves = dominoEngine.getValidMoves(normalizedState, timedOutPlayerId);
            const timeoutMove = selectDominoTimeoutAutoMove(validMoves);
            if (!timeoutMove) {
              if (shouldLogWatchdogSkip(row.challengeId, "domino:no_timeout_move")) {
                logger.warn(`[Domino Timeout Watchdog] No valid timeout move for challenge ${row.challengeId}`);
              }
              return null;
            }

            const validation = dominoEngine.validateMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!validation.valid) {
              logger.warn(`[Domino Timeout Watchdog] Invalid timeout move for challenge ${row.challengeId}: ${validation.error || "unknown"}`);
              return null;
            }

            const applyResult = dominoEngine.applyMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!applyResult.success) {
              logger.warn(`[Domino Timeout Watchdog] Failed applying timeout move for challenge ${row.challengeId}: ${applyResult.error || "unknown"}`);
              return null;
            }

            const gameStatus = dominoEngine.getGameStatus(applyResult.newState);
            const isGameOver = gameStatus.isOver;
            const isDraw = Boolean(gameStatus.isDraw);
            const parsedNewState = JSON.parse(applyResult.newState) as Record<string, unknown>;

            let winnerId: string | null = typeof gameStatus.winner === "string" ? gameStatus.winner : null;
            const winningTeam = typeof gameStatus.winningTeam === "number" ? gameStatus.winningTeam : undefined;
            if (!winnerId && typeof winningTeam === "number") {
              const winningTeamPlayers = winningTeam === 0
                ? [challenge.player1Id, challenge.player3Id]
                : [challenge.player2Id, challenge.player4Id];
              winnerId = (winningTeamPlayers.find(Boolean) as string | undefined) ?? null;
            }

            let nextTurn: string | null = null;
            if (!isGameOver) {
              const stateTurn = typeof parsedNewState.currentPlayer === "string"
                ? parsedNewState.currentPlayer
                : (typeof parsedNewState.currentTurn === "string" ? parsedNewState.currentTurn : null);

              if (stateTurn && playerIds.includes(stateTurn)) {
                nextTurn = stateTurn;
              } else {
                const currentIndex = playerIds.indexOf(timedOutPlayerId);
                nextTurn = currentIndex >= 0 ? playerIds[(currentIndex + 1) % playerIds.length] : null;
              }
            }

            const winReason = isGameOver
              ? (isDraw ? "draw" : (gameStatus.reason || "timeout_auto_move"))
              : null;

            const [updatedSession] = await tx.update(challengeGameSessions)
              .set({
                gameState: applyResult.newState,
                currentTurn: isGameOver ? null : nextTurn,
                totalMoves: (session.totalMoves || 0) + 1,
                lastMoveAt: new Date(),
                updatedAt: new Date(),
                status: isGameOver ? "finished" : "playing",
                winnerId: isGameOver ? winnerId : null,
                winReason,
              })
              .where(eq(challengeGameSessions.id, session.id))
              .returning();

            return {
              challenge,
              updatedSession,
              newState: applyResult.newState,
              events: applyResult.events,
              timeoutMove,
              timedOutPlayerId,
              isGameOver,
              isDraw,
              winnerId,
              winningTeam,
              winReason,
            };
          });

          if (!outcome) {
            continue;
          }

          const seq = typeof outcome.updatedSession.totalMoves === "number" ? outcome.updatedSession.totalMoves : 0;
          const room = challengeGameRooms.get(row.challengeId);

          if (room) {
            room.currentState = {
              challengeId: row.challengeId,
              gameType: "domino",
              gameState: outcome.newState,
              currentTurn: outcome.updatedSession.currentTurn || "",
              totalMoves: seq,
              status: outcome.updatedSession.status,
              spectatorCount: room.spectators.size,
            };

            const timeoutMessage = JSON.stringify({
              type: "turn_timeout",
              payload: {
                timedOutPlayer: outcome.timedOutPlayerId,
                autoAction: "auto_move",
                moveType: outcome.timeoutMove.type,
                turnTimeLimitMs: DOMINO_TURN_TIMEOUT_MS,
              },
              seq,
            });

            [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(timeoutMessage);
              }
            });

            for (const [playerId, socket] of room.players) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              const playerView = dominoEngine.getPlayerView(outcome.newState, playerId);
              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: playerView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }

            const spectatorView = dominoEngine.getPlayerView(outcome.newState, "spectator");
            for (const [, socket] of room.spectators) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: spectatorView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }
          }

          if (outcome.isGameOver) {
            let payoutSettled = true;

            if (outcome.isDraw) {
              const drawSettlement = await settleDrawPayout(
                row.challengeId,
                outcome.challenge.player1Id,
                outcome.challenge.player2Id || "",
                "domino",
                undefined,
                [outcome.challenge.player3Id, outcome.challenge.player4Id].filter(Boolean) as string[],
              );

              if (!drawSettlement.success) {
                payoutSettled = false;
                logger.error(`[Domino Timeout Watchdog] Draw payout failed for challenge ${row.challengeId}: ${drawSettlement.error}`);
              }
            } else if (outcome.winnerId) {
              const allPlayerIds = [
                outcome.challenge.player1Id,
                outcome.challenge.player2Id,
                outcome.challenge.player3Id,
                outcome.challenge.player4Id,
              ].filter(Boolean) as string[];

              const loserId = outcome.winningTeam !== undefined
                ? (outcome.winningTeam === 0
                  ? ([outcome.challenge.player2Id, outcome.challenge.player4Id].filter(Boolean) as string[])[0]
                  : ([outcome.challenge.player1Id, outcome.challenge.player3Id].filter(Boolean) as string[])[0])
                : allPlayerIds.find((id) => id !== outcome.winnerId);

              if (loserId) {
                const payoutResult = await settleChallengePayout(
                  row.challengeId,
                  outcome.winnerId,
                  loserId,
                  "domino",
                );

                if (!payoutResult.success) {
                  payoutSettled = false;
                  logger.error(`[Domino Timeout Watchdog] Winner payout failed for challenge ${row.challengeId}: ${payoutResult.error}`);
                }
              }
            }

            if (payoutSettled) {
              await db.update(challenges)
                .set({
                  status: "completed",
                  winnerId: outcome.winnerId,
                  endedAt: new Date(),
                })
                .where(eq(challenges.id, row.challengeId));
            }

            await db.delete(challengeChatMessages)
              .where(eq(challengeChatMessages.sessionId, outcome.updatedSession.id));

            if (room) {
              const endedMessage = JSON.stringify({
                type: "game_ended",
                winnerId: outcome.winnerId,
                isDraw: outcome.isDraw,
                reason: outcome.winReason || (outcome.isDraw ? "draw" : "timeout_auto_move"),
                seq,
              });

              [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(endedMessage);
                }
              });
            }
          }

          logger.info(`[Domino Timeout Watchdog] Applied timeout auto-move for challenge ${row.challengeId}`);
        } catch (perChallengeError) {
          logger.error(
            `[Domino Timeout Watchdog] Failed processing challenge ${row.challengeId}`,
            perChallengeError instanceof Error ? perChallengeError : new Error(String(perChallengeError)),
          );
        }
      }
      markWatchdogRecovery("Domino Timeout Watchdog", dominoTimeoutWatchdogState);
    } catch (error) {
      markWatchdogFailure(
        "Domino Timeout Watchdog",
        dominoTimeoutWatchdogState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setTimeout(processChallengeDominoTimeouts, 12000);
  setInterval(processChallengeDominoTimeouts, DOMINO_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Domino Timeout Watchdog] Started (interval: ${DOMINO_TIMEOUT_WATCHDOG_INTERVAL}ms, turn=${DOMINO_TURN_TIMEOUT_MS}ms)`);

  // ==================== LANGUAGE DUEL TIMEOUT AUTO-MOVE WATCHDOG ====================
  // Server-authoritative 30s timeout for challenge language duel sessions.
  const LANGUAGE_DUEL_TURN_TIMEOUT_MS = 30_000;
  const LANGUAGE_DUEL_TIMEOUT_WATCHDOG_INTERVAL = 1000;
  const languageDuelTimeoutWatchdogState = createWatchdogFailureState();

  async function processChallengeLanguageDuelTimeouts() {
    const languageDuelEngine = getGameEngine("languageduel");
    if (!languageDuelEngine) {
      return;
    }

    if (!shouldRunWatchdog(languageDuelTimeoutWatchdogState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

    try {
      const activeRows = await db.select({
        challengeId: challengeGameSessions.challengeId,
      })
        .from(challengeGameSessions)
        .innerJoin(challenges, eq(challengeGameSessions.challengeId, challenges.id))
        .where(and(
          eq(challengeGameSessions.status, "playing"),
          eq(challenges.status, "active"),
          eq(challengeGameSessions.gameType, "languageduel"),
          sql`${challengeGameSessions.currentTurn} IS NOT NULL`
        ))
        .limit(80);

      for (const row of activeRows) {
        try {
          const outcome = await db.transaction(async (tx) => {
            const [session] = await tx.select()
              .from(challengeGameSessions)
              .where(eq(challengeGameSessions.challengeId, row.challengeId))
              .orderBy(sql`${challengeGameSessions.createdAt} DESC`)
              .limit(1)
              .for("update");

            if (!session || session.status !== "playing" || !session.currentTurn || String(session.gameType || "").toLowerCase() !== "languageduel") {
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

            const playerIds = [challenge.player1Id, challenge.player2Id].filter(Boolean) as string[];
            const timedOutPlayerId = session.currentTurn;

            if (!playerIds.includes(timedOutPlayerId)) {
              return null;
            }

            const nowMs = Date.now();
            const turnStartedAt = session.lastMoveAt ?? session.updatedAt ?? session.createdAt ?? new Date(nowMs);
            const elapsedMs = Math.max(0, nowMs - new Date(turnStartedAt).getTime());
            if (elapsedMs < LANGUAGE_DUEL_TURN_TIMEOUT_MS) {
              return null;
            }

            const normalizedState = normalizeChallengeGameState(session.gameState);
            if (!normalizedState) {
              if (shouldLogWatchdogSkip(row.challengeId, "languageDuel:invalid_state")) {
                logger.warn(`[Language Duel Timeout Watchdog] Skipped challenge ${row.challengeId} due to invalid game state`);
              }
              return null;
            }

            const validMoves = languageDuelEngine.getValidMoves(normalizedState, timedOutPlayerId);
            const timeoutMove = validMoves.find((move) => move.type === "timeout") || validMoves[0] || null;
            if (!timeoutMove) {
              if (shouldLogWatchdogSkip(row.challengeId, "languageDuel:no_timeout_move")) {
                logger.warn(`[Language Duel Timeout Watchdog] No valid timeout move for challenge ${row.challengeId}`);
              }
              return null;
            }

            const validation = languageDuelEngine.validateMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!validation.valid) {
              logger.warn(`[Language Duel Timeout Watchdog] Invalid timeout move for challenge ${row.challengeId}: ${validation.error || "unknown"}`);
              return null;
            }

            const applyResult = languageDuelEngine.applyMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!applyResult.success) {
              logger.warn(`[Language Duel Timeout Watchdog] Failed applying timeout move for challenge ${row.challengeId}: ${applyResult.error || "unknown"}`);
              return null;
            }

            const gameStatus = languageDuelEngine.getGameStatus(applyResult.newState);
            const isGameOver = Boolean(gameStatus.isOver);
            const isDraw = Boolean(gameStatus.isDraw);
            const parsedNewState = JSON.parse(applyResult.newState) as Record<string, unknown>;

            const winnerId = typeof gameStatus.winner === "string" ? gameStatus.winner : null;
            const nextTurn = !isGameOver && typeof parsedNewState.currentTurn === "string"
              ? parsedNewState.currentTurn
              : null;

            const winReason = isGameOver
              ? (isDraw ? "draw" : (gameStatus.reason || "timeout"))
              : null;

            const [updatedSession] = await tx.update(challengeGameSessions)
              .set({
                gameState: applyResult.newState,
                currentTurn: isGameOver ? null : nextTurn,
                totalMoves: (session.totalMoves || 0) + 1,
                lastMoveAt: new Date(),
                updatedAt: new Date(),
                status: isGameOver ? "finished" : "playing",
                winnerId: isGameOver ? winnerId : null,
                winReason,
              })
              .where(eq(challengeGameSessions.id, session.id))
              .returning();

            return {
              challenge,
              updatedSession,
              newState: applyResult.newState,
              events: applyResult.events,
              timeoutMove,
              timedOutPlayerId,
              isGameOver,
              isDraw,
              winnerId,
              winReason,
            };
          });

          if (!outcome) {
            continue;
          }

          const seq = typeof outcome.updatedSession.totalMoves === "number" ? outcome.updatedSession.totalMoves : 0;
          const room = challengeGameRooms.get(row.challengeId);

          if (room) {
            room.currentState = {
              challengeId: row.challengeId,
              gameType: "languageduel",
              gameState: outcome.newState,
              currentTurn: outcome.updatedSession.currentTurn || "",
              totalMoves: seq,
              status: outcome.updatedSession.status,
              spectatorCount: room.spectators.size,
            };

            const timeoutMessage = JSON.stringify({
              type: "turn_timeout",
              payload: {
                timedOutPlayer: outcome.timedOutPlayerId,
                autoAction: "auto_move",
                moveType: outcome.timeoutMove.type,
                turnTimeLimitMs: LANGUAGE_DUEL_TURN_TIMEOUT_MS,
              },
              seq,
            });

            [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(timeoutMessage);
              }
            });

            for (const [playerId, socket] of room.players) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              const playerView = languageDuelEngine.getPlayerView(outcome.newState, playerId);
              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: playerView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }

            const spectatorView = languageDuelEngine.getPlayerView(outcome.newState, "spectator");
            for (const [, socket] of room.spectators) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: spectatorView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }
          }

          if (outcome.isGameOver) {
            let payoutSettled = true;

            if (outcome.isDraw) {
              const drawSettlement = await settleDrawPayout(
                row.challengeId,
                outcome.challenge.player1Id,
                outcome.challenge.player2Id || "",
                "languageduel",
              );

              if (!drawSettlement.success) {
                payoutSettled = false;
                logger.error(`[Language Duel Timeout Watchdog] Draw payout failed for challenge ${row.challengeId}: ${drawSettlement.error}`);
              }
            } else if (outcome.winnerId) {
              const loserId = outcome.winnerId === outcome.challenge.player1Id
                ? outcome.challenge.player2Id
                : outcome.challenge.player1Id;

              if (loserId) {
                const payoutResult = await settleChallengePayout(
                  row.challengeId,
                  outcome.winnerId,
                  loserId,
                  "languageduel",
                );

                if (!payoutResult.success) {
                  payoutSettled = false;
                  logger.error(`[Language Duel Timeout Watchdog] Winner payout failed for challenge ${row.challengeId}: ${payoutResult.error}`);
                }
              }
            }

            if (payoutSettled) {
              await db.update(challenges)
                .set({
                  status: "completed",
                  winnerId: outcome.winnerId,
                  endedAt: new Date(),
                })
                .where(eq(challenges.id, row.challengeId));
            }

            await db.delete(challengeChatMessages)
              .where(eq(challengeChatMessages.sessionId, outcome.updatedSession.id));

            if (room) {
              const endedMessage = JSON.stringify({
                type: "game_ended",
                winnerId: outcome.winnerId,
                isDraw: outcome.isDraw,
                reason: outcome.winReason || (outcome.isDraw ? "draw" : "timeout"),
                seq,
              });

              [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(endedMessage);
                }
              });
            }
          }

          logger.info(`[Language Duel Timeout Watchdog] Applied timeout auto-move for challenge ${row.challengeId}`);
        } catch (perChallengeError) {
          logger.error(
            `[Language Duel Timeout Watchdog] Failed processing challenge ${row.challengeId}`,
            perChallengeError instanceof Error ? perChallengeError : new Error(String(perChallengeError)),
          );
        }
      }
      markWatchdogRecovery("Language Duel Timeout Watchdog", languageDuelTimeoutWatchdogState);
    } catch (error) {
      markWatchdogFailure(
        "Language Duel Timeout Watchdog",
        languageDuelTimeoutWatchdogState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setTimeout(processChallengeLanguageDuelTimeouts, 13000);
  setInterval(processChallengeLanguageDuelTimeouts, LANGUAGE_DUEL_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Language Duel Timeout Watchdog] Started (interval: ${LANGUAGE_DUEL_TIMEOUT_WATCHDOG_INTERVAL}ms, turn=${LANGUAGE_DUEL_TURN_TIMEOUT_MS}ms)`);

  // ==================== BALOOT TIMEOUT AUTO-MOVE WATCHDOG ====================
  // Server-authoritative 30s per-turn timeout for challenge baloot sessions.
  const BALOOT_TURN_TIMEOUT_MS = 30_000;
  const BALOOT_TIMEOUT_WATCHDOG_INTERVAL = 1000;
  const balootTimeoutWatchdogState = createWatchdogFailureState();

  async function processChallengeBalootTimeouts() {
    const balootEngine = getGameEngine("baloot");
    if (!balootEngine) {
      return;
    }

    if (!shouldRunWatchdog(balootTimeoutWatchdogState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

    try {
      const activeRows = await db.select({
        challengeId: challengeGameSessions.challengeId,
      })
        .from(challengeGameSessions)
        .innerJoin(challenges, eq(challengeGameSessions.challengeId, challenges.id))
        .where(and(
          eq(challengeGameSessions.status, "playing"),
          eq(challenges.status, "active"),
          eq(challengeGameSessions.gameType, "baloot"),
          sql`${challengeGameSessions.currentTurn} IS NOT NULL`
        ))
        .limit(80);

      for (const row of activeRows) {
        try {
          const outcome = await db.transaction(async (tx) => {
            const [session] = await tx.select()
              .from(challengeGameSessions)
              .where(eq(challengeGameSessions.challengeId, row.challengeId))
              .orderBy(sql`${challengeGameSessions.createdAt} DESC`)
              .limit(1)
              .for("update");

            if (!session || session.status !== "playing" || !session.currentTurn || String(session.gameType || "").toLowerCase() !== "baloot") {
              return null;
            }

            const [challenge] = await tx.select()
              .from(challenges)
              .where(eq(challenges.id, row.challengeId))
              .limit(1)
              .for("update");

            if (!challenge || challenge.status !== "active") {
              return null;
            }

            const playerIds = [
              challenge.player1Id,
              challenge.player2Id,
              challenge.player3Id,
              challenge.player4Id,
            ].filter(Boolean) as string[];

            const timedOutPlayerId = session.currentTurn;
            if (!playerIds.includes(timedOutPlayerId)) {
              return null;
            }

            const nowMs = Date.now();
            const turnStartedAt = session.lastMoveAt ?? session.updatedAt ?? session.createdAt ?? new Date(nowMs);
            const elapsedMs = Math.max(0, nowMs - new Date(turnStartedAt).getTime());
            if (elapsedMs < BALOOT_TURN_TIMEOUT_MS) {
              return null;
            }

            const normalizedState = normalizeChallengeGameState(session.gameState);
            if (!normalizedState) {
              if (shouldLogWatchdogSkip(row.challengeId, "baloot:invalid_state")) {
                logger.warn(`[Baloot Timeout Watchdog] Skipped challenge ${row.challengeId} due to invalid game state`);
              }
              return null;
            }

            const validMoves = balootEngine.getValidMoves(normalizedState, timedOutPlayerId);
            const timeoutMove = selectBalootTimeoutAutoMove(balootEngine, normalizedState, validMoves);
            if (!timeoutMove) {
              if (shouldLogWatchdogSkip(row.challengeId, "baloot:no_timeout_move")) {
                logger.warn(`[Baloot Timeout Watchdog] No valid timeout move for challenge ${row.challengeId}`);
              }
              return null;
            }

            const validation = balootEngine.validateMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!validation.valid) {
              logger.warn(`[Baloot Timeout Watchdog] Invalid timeout move for challenge ${row.challengeId}: ${validation.error || "unknown"}`);
              return null;
            }

            const applyResult = balootEngine.applyMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!applyResult.success) {
              logger.warn(`[Baloot Timeout Watchdog] Failed applying timeout move for challenge ${row.challengeId}: ${applyResult.error || "unknown"}`);
              return null;
            }

            const gameStatus = balootEngine.getGameStatus(applyResult.newState);
            const isGameOver = Boolean(gameStatus.isOver);
            const isDraw = Boolean(gameStatus.isDraw);
            const parsedNewState = JSON.parse(applyResult.newState) as Record<string, unknown>;

            let winnerId: string | null = typeof gameStatus.winner === "string" ? gameStatus.winner : null;
            const winningTeam = typeof gameStatus.winningTeam === "number" ? gameStatus.winningTeam : undefined;

            if (!winnerId && typeof winningTeam === "number") {
              const stateTeams = parsedNewState.teams as { team0?: unknown; team1?: unknown } | undefined;
              const winningTeamPlayers = winningTeam === 0 ? stateTeams?.team0 : stateTeams?.team1;
              if (Array.isArray(winningTeamPlayers)) {
                winnerId = (winningTeamPlayers.find((id): id is string => typeof id === "string") ?? null);
              }

              if (!winnerId) {
                const fallbackWinners = winningTeam === 0
                  ? [challenge.player1Id, challenge.player3Id]
                  : [challenge.player2Id, challenge.player4Id];
                winnerId = (fallbackWinners.find(Boolean) as string | undefined) ?? null;
              }
            }

            let nextTurn: string | null = null;
            if (!isGameOver) {
              const stateTurn = typeof parsedNewState.currentPlayer === "string"
                ? parsedNewState.currentPlayer
                : (typeof parsedNewState.currentTurn === "string" ? parsedNewState.currentTurn : null);

              if (stateTurn && playerIds.includes(stateTurn)) {
                nextTurn = stateTurn;
              } else {
                const currentIndex = playerIds.indexOf(timedOutPlayerId);
                nextTurn = currentIndex >= 0 ? playerIds[(currentIndex + 1) % playerIds.length] : null;
              }
            }

            const winReason = isGameOver
              ? (isDraw ? "draw" : (gameStatus.reason || "timeout_auto_move"))
              : null;

            const [updatedSession] = await tx.update(challengeGameSessions)
              .set({
                gameState: applyResult.newState,
                currentTurn: isGameOver ? null : nextTurn,
                totalMoves: (session.totalMoves || 0) + 1,
                lastMoveAt: new Date(),
                updatedAt: new Date(),
                status: isGameOver ? "finished" : "playing",
                winnerId: isGameOver ? winnerId : null,
                winReason,
              })
              .where(eq(challengeGameSessions.id, session.id))
              .returning();

            return {
              challenge,
              updatedSession,
              newState: applyResult.newState,
              events: applyResult.events,
              timeoutMove,
              timedOutPlayerId,
              isGameOver,
              isDraw,
              winnerId,
              winningTeam,
              winReason,
            };
          });

          if (!outcome) {
            continue;
          }

          const seq = typeof outcome.updatedSession.totalMoves === "number" ? outcome.updatedSession.totalMoves : 0;
          const room = challengeGameRooms.get(row.challengeId);

          if (room) {
            room.currentState = {
              challengeId: row.challengeId,
              gameType: "baloot",
              gameState: outcome.newState,
              currentTurn: outcome.updatedSession.currentTurn || "",
              totalMoves: seq,
              status: outcome.updatedSession.status,
              spectatorCount: room.spectators.size,
            };

            const timeoutMessage = JSON.stringify({
              type: "turn_timeout",
              payload: {
                timedOutPlayer: outcome.timedOutPlayerId,
                autoAction: "auto_move",
                moveType: outcome.timeoutMove.type,
                turnTimeLimitMs: BALOOT_TURN_TIMEOUT_MS,
              },
              seq,
            });

            [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(timeoutMessage);
              }
            });

            for (const [playerId, socket] of room.players) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              const playerView = balootEngine.getPlayerView(outcome.newState, playerId);
              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: playerView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }

            const spectatorView = balootEngine.getPlayerView(outcome.newState, "spectator");
            for (const [, socket] of room.spectators) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: spectatorView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }
          }

          if (outcome.isGameOver) {
            let payoutSettled = true;

            if (outcome.isDraw) {
              const drawSettlement = await settleDrawPayout(
                row.challengeId,
                outcome.challenge.player1Id,
                outcome.challenge.player2Id || "",
                "baloot",
                undefined,
                [outcome.challenge.player3Id, outcome.challenge.player4Id].filter(Boolean) as string[],
              );

              if (!drawSettlement.success) {
                payoutSettled = false;
                logger.error(`[Baloot Timeout Watchdog] Draw payout failed for challenge ${row.challengeId}: ${drawSettlement.error}`);
              }
            } else if (outcome.winnerId) {
              const allPlayerIds = [
                outcome.challenge.player1Id,
                outcome.challenge.player2Id,
                outcome.challenge.player3Id,
                outcome.challenge.player4Id,
              ].filter(Boolean) as string[];

              const loserId = outcome.winningTeam !== undefined
                ? (outcome.winningTeam === 0
                  ? ([outcome.challenge.player2Id, outcome.challenge.player4Id].filter(Boolean) as string[])[0]
                  : ([outcome.challenge.player1Id, outcome.challenge.player3Id].filter(Boolean) as string[])[0])
                : allPlayerIds.find((id) => id !== outcome.winnerId);

              if (loserId) {
                const payoutResult = await settleChallengePayout(
                  row.challengeId,
                  outcome.winnerId,
                  loserId,
                  "baloot",
                );

                if (!payoutResult.success) {
                  payoutSettled = false;
                  logger.error(`[Baloot Timeout Watchdog] Winner payout failed for challenge ${row.challengeId}: ${payoutResult.error}`);
                }
              }
            }

            if (payoutSettled) {
              await db.update(challenges)
                .set({
                  status: "completed",
                  winnerId: outcome.winnerId,
                  endedAt: new Date(),
                })
                .where(eq(challenges.id, row.challengeId));
            }

            await db.delete(challengeChatMessages)
              .where(eq(challengeChatMessages.sessionId, outcome.updatedSession.id));

            if (room) {
              const endedMessage = JSON.stringify({
                type: "game_ended",
                winnerId: outcome.winnerId,
                isDraw: outcome.isDraw,
                reason: outcome.winReason || (outcome.isDraw ? "draw" : "timeout_auto_move"),
                seq,
              });

              [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(endedMessage);
                }
              });
            }
          }

          logger.info(`[Baloot Timeout Watchdog] Applied timeout auto-move for challenge ${row.challengeId}`);
        } catch (perChallengeError) {
          logger.error(
            `[Baloot Timeout Watchdog] Failed processing challenge ${row.challengeId}`,
            perChallengeError instanceof Error ? perChallengeError : new Error(String(perChallengeError)),
          );
        }
      }
      markWatchdogRecovery("Baloot Timeout Watchdog", balootTimeoutWatchdogState);
    } catch (error) {
      markWatchdogFailure(
        "Baloot Timeout Watchdog",
        balootTimeoutWatchdogState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setTimeout(processChallengeBalootTimeouts, 13000);
  setInterval(processChallengeBalootTimeouts, BALOOT_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Baloot Timeout Watchdog] Started (interval: ${BALOOT_TIMEOUT_WATCHDOG_INTERVAL}ms, turn=${BALOOT_TURN_TIMEOUT_MS}ms)`);

  // ==================== TARNEEB TIMEOUT AUTO-MOVE WATCHDOG ====================
  // Server-authoritative 30s per-turn timeout for challenge tarneeb sessions.
  const TARNEEB_TURN_TIMEOUT_MS = 30_000;
  const TARNEEB_TIMEOUT_WATCHDOG_INTERVAL = 1000;
  const tarneebTimeoutWatchdogState = createWatchdogFailureState();

  async function processChallengeTarneebTimeouts() {
    const tarneebEngine = getGameEngine("tarneeb");
    if (!tarneebEngine) {
      return;
    }

    if (!shouldRunWatchdog(tarneebTimeoutWatchdogState)) {
      return;
    }
    if (!(await shouldRunDatabaseWatchdog(databaseWatchdogState))) {
      return;
    }

    try {
      const activeRows = await db.select({
        challengeId: challengeGameSessions.challengeId,
      })
        .from(challengeGameSessions)
        .innerJoin(challenges, eq(challengeGameSessions.challengeId, challenges.id))
        .where(and(
          eq(challengeGameSessions.status, "playing"),
          eq(challenges.status, "active"),
          eq(challengeGameSessions.gameType, "tarneeb"),
          sql`${challengeGameSessions.currentTurn} IS NOT NULL`
        ))
        .limit(80);

      for (const row of activeRows) {
        try {
          const outcome = await db.transaction(async (tx) => {
            const [session] = await tx.select()
              .from(challengeGameSessions)
              .where(eq(challengeGameSessions.challengeId, row.challengeId))
              .orderBy(sql`${challengeGameSessions.createdAt} DESC`)
              .limit(1)
              .for("update");

            if (!session || session.status !== "playing" || !session.currentTurn || String(session.gameType || "").toLowerCase() !== "tarneeb") {
              return null;
            }

            const [challenge] = await tx.select()
              .from(challenges)
              .where(eq(challenges.id, row.challengeId))
              .limit(1)
              .for("update");

            if (!challenge || challenge.status !== "active") {
              return null;
            }

            const playerIds = [
              challenge.player1Id,
              challenge.player2Id,
              challenge.player3Id,
              challenge.player4Id,
            ].filter(Boolean) as string[];

            const timedOutPlayerId = session.currentTurn;

            const nowMs = Date.now();
            const turnStartedAt = session.lastMoveAt ?? session.updatedAt ?? session.createdAt ?? new Date(nowMs);
            const elapsedMs = Math.max(0, nowMs - new Date(turnStartedAt).getTime());
            if (elapsedMs < TARNEEB_TURN_TIMEOUT_MS) {
              return null;
            }

            const normalizedState = normalizeChallengeGameState(session.gameState);
            if (!normalizedState) {
              if (shouldLogWatchdogSkip(row.challengeId, "tarneeb:invalid_state")) {
                logger.warn(`[Tarneeb Timeout Watchdog] Skipped challenge ${row.challengeId} due to invalid game state`);
              }
              return null;
            }

            const validMoves = tarneebEngine.getValidMoves(normalizedState, timedOutPlayerId);
            if (validMoves.length === 0) {
              if (shouldLogWatchdogSkip(row.challengeId, "tarneeb:no_valid_moves")) {
                logger.warn(`[Tarneeb Timeout Watchdog] No valid moves for current turn ${timedOutPlayerId} in challenge ${row.challengeId}`);
              }
              return null;
            }

            const timeoutMove = selectTarneebTimeoutAutoMove(validMoves);
            if (!timeoutMove) {
              if (shouldLogWatchdogSkip(row.challengeId, "tarneeb:no_timeout_move")) {
                logger.warn(`[Tarneeb Timeout Watchdog] No valid timeout move for challenge ${row.challengeId}`);
              }
              return null;
            }

            const validation = tarneebEngine.validateMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!validation.valid) {
              logger.warn(`[Tarneeb Timeout Watchdog] Invalid timeout move for challenge ${row.challengeId}: ${validation.error || "unknown"}`);
              return null;
            }

            const applyResult = tarneebEngine.applyMove(normalizedState, timedOutPlayerId, timeoutMove);
            if (!applyResult.success) {
              logger.warn(`[Tarneeb Timeout Watchdog] Failed applying timeout move for challenge ${row.challengeId}: ${applyResult.error || "unknown"}`);
              return null;
            }

            const gameStatus = tarneebEngine.getGameStatus(applyResult.newState);
            const isGameOver = Boolean(gameStatus.isOver);
            const isDraw = Boolean(gameStatus.isDraw);
            const parsedNewState = JSON.parse(applyResult.newState) as Record<string, unknown>;

            let winnerId: string | null = typeof gameStatus.winner === "string" ? gameStatus.winner : null;
            const winningTeam = typeof gameStatus.winningTeam === "number" ? gameStatus.winningTeam : undefined;

            if (!winnerId && typeof winningTeam === "number") {
              const stateTeams = parsedNewState.teams as { team0?: unknown; team1?: unknown } | undefined;
              const winningTeamPlayers = winningTeam === 0 ? stateTeams?.team0 : stateTeams?.team1;
              if (Array.isArray(winningTeamPlayers)) {
                winnerId = (winningTeamPlayers.find((id): id is string => typeof id === "string") ?? null);
              }

              if (!winnerId) {
                const fallbackWinners = winningTeam === 0
                  ? [challenge.player1Id, challenge.player3Id]
                  : [challenge.player2Id, challenge.player4Id];
                winnerId = (fallbackWinners.find(Boolean) as string | undefined) ?? null;
              }
            }

            let nextTurn: string | null = null;
            if (!isGameOver) {
              const stateTurn = typeof parsedNewState.currentPlayer === "string"
                ? parsedNewState.currentPlayer
                : (typeof parsedNewState.currentTurn === "string" ? parsedNewState.currentTurn : null);

              if (stateTurn) {
                nextTurn = stateTurn;
              } else {
                const currentIndex = playerIds.indexOf(timedOutPlayerId);
                nextTurn = currentIndex >= 0 ? playerIds[(currentIndex + 1) % playerIds.length] : null;
              }
            }

            const winReason = isGameOver
              ? (isDraw ? "draw" : (gameStatus.reason || "timeout_auto_move"))
              : null;

            const [updatedSession] = await tx.update(challengeGameSessions)
              .set({
                gameState: applyResult.newState,
                currentTurn: isGameOver ? null : nextTurn,
                totalMoves: (session.totalMoves || 0) + 1,
                lastMoveAt: new Date(),
                updatedAt: new Date(),
                status: isGameOver ? "finished" : "playing",
                winnerId: isGameOver ? winnerId : null,
                winReason,
              })
              .where(eq(challengeGameSessions.id, session.id))
              .returning();

            return {
              challenge,
              updatedSession,
              newState: applyResult.newState,
              events: applyResult.events,
              timeoutMove,
              timedOutPlayerId,
              isGameOver,
              isDraw,
              winnerId,
              winningTeam,
              winReason,
            };
          });

          if (!outcome) {
            continue;
          }

          const seq = typeof outcome.updatedSession.totalMoves === "number" ? outcome.updatedSession.totalMoves : 0;
          const room = challengeGameRooms.get(row.challengeId);

          if (room) {
            room.currentState = {
              challengeId: row.challengeId,
              gameType: "tarneeb",
              gameState: outcome.newState,
              currentTurn: outcome.updatedSession.currentTurn || "",
              totalMoves: seq,
              status: outcome.updatedSession.status,
              spectatorCount: room.spectators.size,
            };

            const timeoutMessage = JSON.stringify({
              type: "turn_timeout",
              payload: {
                timedOutPlayer: outcome.timedOutPlayerId,
                autoAction: "auto_move",
                moveType: outcome.timeoutMove.type,
                turnTimeLimitMs: TARNEEB_TURN_TIMEOUT_MS,
              },
              seq,
            });

            [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(timeoutMessage);
              }
            });

            for (const [playerId, socket] of room.players) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              const playerView = tarneebEngine.getPlayerView(outcome.newState, playerId);
              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: playerView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }

            const spectatorView = tarneebEngine.getPlayerView(outcome.newState, "spectator");
            for (const [, socket] of room.spectators) {
              if (socket.readyState !== WebSocket.OPEN) {
                continue;
              }

              socket.send(JSON.stringify({
                type: "game_move",
                session: { ...outcome.updatedSession, gameState: undefined },
                view: spectatorView,
                events: outcome.events,
                move: outcome.timeoutMove,
                playerId: outcome.timedOutPlayerId,
                seq,
                timeoutAuto: true,
              }));
            }
          }

          if (outcome.isGameOver) {
            let payoutSettled = true;

            if (outcome.isDraw) {
              const drawSettlement = await settleDrawPayout(
                row.challengeId,
                outcome.challenge.player1Id,
                outcome.challenge.player2Id || "",
                "tarneeb",
                undefined,
                [outcome.challenge.player3Id, outcome.challenge.player4Id].filter(Boolean) as string[],
              );

              if (!drawSettlement.success) {
                payoutSettled = false;
                logger.error(`[Tarneeb Timeout Watchdog] Draw payout failed for challenge ${row.challengeId}: ${drawSettlement.error}`);
              }
            } else if (outcome.winnerId) {
              const allPlayerIds = [
                outcome.challenge.player1Id,
                outcome.challenge.player2Id,
                outcome.challenge.player3Id,
                outcome.challenge.player4Id,
              ].filter(Boolean) as string[];

              const loserId = outcome.winningTeam !== undefined
                ? (outcome.winningTeam === 0
                  ? ([outcome.challenge.player2Id, outcome.challenge.player4Id].filter(Boolean) as string[])[0]
                  : ([outcome.challenge.player1Id, outcome.challenge.player3Id].filter(Boolean) as string[])[0])
                : allPlayerIds.find((id) => id !== outcome.winnerId);

              if (loserId) {
                const payoutResult = await settleChallengePayout(
                  row.challengeId,
                  outcome.winnerId,
                  loserId,
                  "tarneeb",
                );

                if (!payoutResult.success) {
                  payoutSettled = false;
                  logger.error(`[Tarneeb Timeout Watchdog] Winner payout failed for challenge ${row.challengeId}: ${payoutResult.error}`);
                }
              }
            }

            if (payoutSettled) {
              await db.update(challenges)
                .set({
                  status: "completed",
                  winnerId: outcome.winnerId,
                  endedAt: new Date(),
                })
                .where(eq(challenges.id, row.challengeId));
            }

            await db.delete(challengeChatMessages)
              .where(eq(challengeChatMessages.sessionId, outcome.updatedSession.id));

            if (room) {
              const endedMessage = JSON.stringify({
                type: "game_ended",
                winnerId: outcome.winnerId,
                isDraw: outcome.isDraw,
                reason: outcome.winReason || (outcome.isDraw ? "draw" : "timeout_auto_move"),
                seq,
              });

              [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(endedMessage);
                }
              });
            }
          }

          logger.info(`[Tarneeb Timeout Watchdog] Applied timeout auto-move for challenge ${row.challengeId}`);
        } catch (perChallengeError) {
          logger.error(
            `[Tarneeb Timeout Watchdog] Failed processing challenge ${row.challengeId}`,
            perChallengeError instanceof Error ? perChallengeError : new Error(String(perChallengeError)),
          );
        }
      }
      markWatchdogRecovery("Tarneeb Timeout Watchdog", tarneebTimeoutWatchdogState);
    } catch (error) {
      markWatchdogFailure(
        "Tarneeb Timeout Watchdog",
        tarneebTimeoutWatchdogState,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setTimeout(processChallengeTarneebTimeouts, 14000);
  setInterval(processChallengeTarneebTimeouts, TARNEEB_TIMEOUT_WATCHDOG_INTERVAL);
  logger.info(`[Tarneeb Timeout Watchdog] Started (interval: ${TARNEEB_TIMEOUT_WATCHDOG_INTERVAL}ms, turn=${TARNEEB_TURN_TIMEOUT_MS}ms)`);
}
