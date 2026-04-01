import { WebSocket } from "ws";
import { db } from "../../db";
import { challengeGameSessions, challengeChatMessages, challenges } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { settleChallengePayout, settleDrawPayout } from "../../lib/payout";
import { isChallengeSessionFinalStatus } from "../../lib/challenge-game-state";
import { sendNotification } from "../notifications";
import { logger } from "../../lib/logger";
import type { AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";
import { requireChallengePlayer } from "./guards";

/** Handle game_resign message — resign with payout settlement */
export async function handleGameResign(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) {
    return;
  }
  const { room } = guard;

  try {
    const result = await db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');
      if (!challenge) throw new Error("Challenge not found");
      if (challenge.status === "completed" || challenge.status === "cancelled") {
        throw new Error("Challenge already ended");
      }

      const team1Ids = [challenge.player1Id, challenge.player3Id].filter(Boolean) as string[];
      const team2Ids = [challenge.player2Id, challenge.player4Id].filter(Boolean) as string[];
      const isTeamGame = Number(challenge.requiredPlayers || 2) >= 4;

      let winnerId: string | null = null;
      let winningTeam: number | undefined;

      if (isTeamGame) {
        if (team1Ids.includes(ws.userId!)) {
          winnerId = team2Ids[0] || null;
          winningTeam = 1;
        } else if (team2Ids.includes(ws.userId!)) {
          winnerId = team1Ids[0] || null;
          winningTeam = 0;
        } else {
          throw new Error("Resigning user is not part of this challenge");
        }
      } else {
        winnerId = challenge.player1Id === ws.userId ? challenge.player2Id : challenge.player1Id;
      }

      if (!winnerId) {
        throw new Error("Unable to resolve winner on resignation");
      }

      const [session] = await tx.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1)
        .for('update');

      if (session && isChallengeSessionFinalStatus(session.status)) {
        throw new Error("Game already finished");
      }

      if (session) {
        await tx.update(challengeGameSessions)
          .set({
            status: "finished",
            winnerId,
            winReason: "resignation",
            updatedAt: new Date(),
          })
          .where(eq(challengeGameSessions.id, session.id));
      }

      await tx.update(challenges)
        .set({
          status: "completed",
          winnerId,
          endedAt: new Date(),
        })
        .where(eq(challenges.id, challengeId));

      return { winnerId, winningTeam, challenge, gameType: session?.gameType || challenge.gameType };
    });

    // CRITICAL: Settle payout on resignation
    if (result.winnerId) {
      const payoutResult = await settleChallengePayout(
        challengeId,
        result.winnerId,
        ws.userId!,
        result.gameType
      );

      if (!payoutResult.success) {
        throw new Error(payoutResult.error || "Payout settlement failed");
      }
    }

    // Broadcast game ended
    const gameEndedSeq = room.currentState && typeof room.currentState.totalMoves === "number"
      ? room.currentState.totalMoves
      : 0;
    [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "game_ended",
          winnerId: result.winnerId,
          reason: "resignation",
          seq: gameEndedSeq,
        }));
      }
    });

    // Send DB notifications for resignation result
    const betAmount = result.challenge.betAmount ? parseFloat(result.challenge.betAmount) : 0;
    const gameLabel = result.gameType || 'game';
    if (result.winnerId) {
      const winnerIds = result.winningTeam !== undefined
        ? (result.winningTeam === 0
          ? [result.challenge.player1Id, result.challenge.player3Id]
          : [result.challenge.player2Id, result.challenge.player4Id]).filter(Boolean) as string[]
        : [result.winnerId];

      const loserIds = result.winningTeam !== undefined
        ? (result.winningTeam === 0
          ? [result.challenge.player2Id, result.challenge.player4Id]
          : [result.challenge.player1Id, result.challenge.player3Id]).filter(Boolean) as string[]
        : [ws.userId!];

      winnerIds.forEach((winnerId) => {
        sendNotification(winnerId, { type: 'success', priority: 'normal', title: `Opponent Resigned — ${gameLabel}`, titleAr: `استسلم الخصم — ${gameLabel}`, message: `Your opponent resigned. You win!${betAmount > 0 ? ` You earned $${(betAmount * 2 * 0.95).toFixed(2)}.` : ''}`, messageAr: `استسلم خصمك. فزت!${betAmount > 0 ? ` ربحت $${(betAmount * 2 * 0.95).toFixed(2)}.` : ''}`, link: '/challenges' }).catch(() => { });
      });

      loserIds.forEach((loserId) => {
        sendNotification(loserId, { type: 'warning', priority: 'normal', title: `You Resigned — ${gameLabel}`, titleAr: `استسلمت — ${gameLabel}`, message: `You resigned from the challenge.${betAmount > 0 ? ` $${betAmount.toFixed(2)} deducted.` : ''}`, messageAr: `استسلمت من التحدي.${betAmount > 0 ? ` تم خصم $${betAmount.toFixed(2)}.` : ''}`, link: '/challenges' }).catch(() => { });
      });
    }

    // Delete game chat messages after resignation
    try {
      const [gameSession] = await db.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1);
      if (gameSession) {
        await db.delete(challengeChatMessages)
          .where(eq(challengeChatMessages.sessionId, gameSession.id));
      }
    } catch (cleanupErr) {
      logger.error('Failed to cleanup game chat (resign):', cleanupErr);
    }
  } catch (error: unknown) {
    logger.error('Resign error:', error);
    ws.send(JSON.stringify({ type: "challenge_error", error: "Failed to process resignation" }));
  }
}

/** Handle offer_draw message */
export async function handleOfferDraw(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) {
    return;
  }
  const { room } = guard;

  // Send to all other players
  room.players.forEach((socket, playerId) => {
    if (playerId !== ws.userId && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "draw_offered",
        offeredBy: ws.userId,
        seq: room.currentState && typeof room.currentState.totalMoves === "number" ? room.currentState.totalMoves : 0,
      }));
    }
  });
}

/** Handle respond_draw message */
export async function handleRespondDraw(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, accept } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) {
    return;
  }
  const { room } = guard;

  if (accept) {
    try {
      const result = await db.transaction(async (tx) => {
        const [challenge] = await tx.select().from(challenges)
          .where(eq(challenges.id, challengeId))
          .for('update');
        if (!challenge) throw new Error("Challenge not found");
        if (challenge.status === "completed" || challenge.status === "cancelled") {
          throw new Error("Challenge already ended");
        }

        const [session] = await tx.select().from(challengeGameSessions)
          .where(eq(challengeGameSessions.challengeId, challengeId))
          .orderBy(desc(challengeGameSessions.createdAt))
          .limit(1)
          .for('update');

        if (session && isChallengeSessionFinalStatus(session.status)) {
          throw new Error("Game already finished");
        }

        if (session) {
          await tx.update(challengeGameSessions)
            .set({
              status: "finished",
              winReason: "draw_agreement",
              updatedAt: new Date(),
            })
            .where(eq(challengeGameSessions.id, session.id));
        }

        await tx.update(challenges)
          .set({
            status: "completed",
            endedAt: new Date(),
          })
          .where(eq(challenges.id, challengeId));

        return { challenge, gameType: session?.gameType || challenge.gameType };
      });

      // Settle draw payout (refund both players)
      const drawResult = await settleDrawPayout(
        challengeId,
        result.challenge.player1Id,
        result.challenge.player2Id || '',
        result.gameType,
        undefined,
        [result.challenge.player3Id, result.challenge.player4Id].filter(Boolean) as string[]
      );

      if (!drawResult.success) {
        throw new Error(drawResult.error || "Draw settlement failed");
      }

      // Broadcast game ended as draw
      const gameEndedSeq = room.currentState && typeof room.currentState.totalMoves === "number"
        ? room.currentState.totalMoves
        : 0;
      [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "game_ended",
            winnerId: null,
            reason: "draw_agreement",
            seq: gameEndedSeq,
          }));
        }
      });

      // Send DB notifications for draw
      const betAmount = result.challenge.betAmount ? parseFloat(result.challenge.betAmount) : 0;
      const gameLabel = result.gameType || 'game';
      const drawMsg = { type: 'system' as const, priority: 'normal' as const, title: `${gameLabel} — Draw Agreement`, titleAr: `${gameLabel} — تعادل بالاتفاق`, message: `The game ended in a draw by agreement.${betAmount > 0 ? ` $${betAmount.toFixed(2)} refunded.` : ''}`, messageAr: `انتهت اللعبة بالتعادل بالاتفاق.${betAmount > 0 ? ` تم إرجاع $${betAmount.toFixed(2)}.` : ''}`, link: '/challenges' };
      [
        result.challenge.player1Id,
        result.challenge.player2Id,
        result.challenge.player3Id,
        result.challenge.player4Id,
      ].filter(Boolean).forEach((playerId) => {
        sendNotification(playerId as string, drawMsg).catch(() => { });
      });

      // Delete game chat messages after draw
      try {
        const [gameSession] = await db.select().from(challengeGameSessions)
          .where(eq(challengeGameSessions.challengeId, challengeId))
          .orderBy(desc(challengeGameSessions.createdAt))
          .limit(1);
        if (gameSession) {
          await db.delete(challengeChatMessages)
            .where(eq(challengeChatMessages.sessionId, gameSession.id));
        }
      } catch (cleanupErr) {
        logger.error('Failed to cleanup game chat (draw):', cleanupErr);
      }
    } catch (error: unknown) {
      logger.error('Draw accept error:', error);
      ws.send(JSON.stringify({ type: "challenge_error", error: "Failed to process draw settlement" }));
    }
  } else {
    // Declined — notify other players
    room.players.forEach((socket, playerId) => {
      if (playerId !== ws.userId && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "draw_declined",
          declinedBy: ws.userId,
          seq: room.currentState && typeof room.currentState.totalMoves === "number" ? room.currentState.totalMoves : 0,
        }));
      }
    });
  }
}
