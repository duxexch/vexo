import { WebSocket } from "ws";
import { db } from "../../db";
import { challengeGameSessions, challengeChatMessages, challenges } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { getGameEngine } from "../../game-engines";
import { settleChallengePayout, settleDrawPayout } from "../../lib/payout";
import { isChallengeSessionPlayableStatus, normalizeChallengeGameState } from "../../lib/challenge-game-state";
import { sendNotification } from "../notifications";
import { logger } from "../../lib/logger";
import { getErrorMessage, type AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";

/** Handle game_move message — process a move with DB transaction and payout settlement */
export async function handleGameMove(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId, move } = data;
  const room = challengeGameRooms.get(challengeId);

  if (!room || !room.players.has(ws.userId!)) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Not a player in this game" }));
    return;
  }

  try {
    // Use DB transaction with row lock for atomic move processing
    const result = await db.transaction(async (tx) => {
      // Lock the session row to prevent race conditions
      const [session] = await tx.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1)
        .for('update');

      if (!session || !isChallengeSessionPlayableStatus(session.status)) {
        throw new Error("Game not in progress");
      }

      if (session.currentTurn !== ws.userId) {
        throw new Error("Not your turn");
      }

      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId));
      if (!challenge) throw new Error("Challenge not found");

      const gameType = String(session.gameType || "").toLowerCase();
      const engine = getGameEngine(gameType);
      if (!engine) throw new Error(`Unknown game type: ${gameType}`);

      // Get or initialize game state
      let stateJson: string;
      const normalizedState = normalizeChallengeGameState(session.gameState);
      if (normalizedState) {
        stateJson = normalizedState;
      } else {
        const playerIds = [
          challenge.player1Id,
          challenge.player2Id,
          challenge.player3Id,
          challenge.player4Id,
        ].filter(Boolean) as string[];
        if ((session.totalMoves || 0) > 0) {
          throw new Error("Corrupted game state");
        }

        if (gameType === "tarneeb") {
          stateJson = engine.initializeWithPlayers(playerIds, 31);
        } else if (gameType === "baloot") {
          stateJson = engine.initializeWithPlayers(playerIds, 152);
        } else if (gameType === "backgammon") {
          stateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
        } else if (gameType === "domino") {
          stateJson = engine.initializeWithPlayers(playerIds);
        } else {
          stateJson = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
        }
      }

      // Validate the move
      const validation = engine.validateMove(stateJson, ws.userId!, move);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid move');
      }

      // Apply the move
      const applyResult = engine.applyMove(stateJson, ws.userId!, move);
      if (!applyResult.success) {
        throw new Error(applyResult.error || 'Move apply failed');
      }

      // Check game status
      const gameStatus = engine.getGameStatus(applyResult.newState);
      let winnerId: string | null = null;
      let isGameOver = false;
      let isDraw = false;
      let winningTeam: number | undefined;

      if (gameStatus.isOver) {
        isGameOver = true;
        isDraw = gameStatus.isDraw || false;
        if (gameStatus.winner) {
          winnerId = gameStatus.winner;
        } else if (gameStatus.winningTeam !== undefined) {
          winningTeam = gameStatus.winningTeam;
          // For team games, map winning team to player
          const state = JSON.parse(applyResult.newState);
          if (state.teams) {
            const winningTeamPlayers = gameStatus.winningTeam === 0 ? state.teams.team0 : state.teams.team1;
            winnerId = winningTeamPlayers?.[0] || null;
          } else {
            winnerId = gameStatus.winningTeam === 0 ? challenge.player1Id : challenge.player2Id;
          }
        }
      }

      // Determine next turn from game state
      let nextTurn: string | null = null;
      if (!isGameOver) {
        const newState = JSON.parse(applyResult.newState);
        const playerIds = [
          challenge.player1Id,
          challenge.player2Id,
          challenge.player3Id,
          challenge.player4Id,
        ].filter(Boolean) as string[];
        if (newState.currentPlayer) {
          nextTurn = newState.currentPlayer;
        } else if (newState.currentTurn) {
          // For backgammon: map color to player
          if (newState.currentTurn === 'white' || newState.currentTurn === 'black') {
            nextTurn = newState.currentTurn === 'white' ? challenge.player1Id : challenge.player2Id!;
          } else {
            nextTurn = newState.currentTurn;
          }
        } else {
          // Fallback: rotate among seated players
          if (playerIds.length > 1) {
            const currentIdx = playerIds.indexOf(ws.userId!);
            nextTurn = playerIds[(currentIdx + 1) % playerIds.length] || null;
          } else {
            nextTurn = playerIds[0] || null;
          }
        }
      }

      // Update session in DB
      const [updatedSession] = await tx.update(challengeGameSessions)
        .set({
          gameState: applyResult.newState,
          currentTurn: isGameOver ? null : nextTurn,
          totalMoves: (session.totalMoves || 0) + 1,
          lastMoveAt: new Date(),
          updatedAt: new Date(),
          status: isGameOver ? 'finished' : 'playing',
          winnerId: winnerId,
        })
        .where(eq(challengeGameSessions.id, session.id))
        .returning();

      return {
        updatedSession,
        newState: applyResult.newState,
        events: applyResult.events,
        isGameOver,
        isDraw,
        winnerId,
        winningTeam,
        challenge,
        engine,
        gameType
      };
    });

    // Broadcast to players with personalized views (hide opponent cards)
    for (const [playerId, socket] of room.players) {
      if (socket.readyState === WebSocket.OPEN) {
        const playerView = result.engine.getPlayerView(result.newState, playerId);
        socket.send(JSON.stringify({
          type: "game_move",
          session: { ...result.updatedSession, gameState: undefined },
          view: playerView,
          events: result.events,
          move,
          playerId: ws.userId,
        }));
      }
    }

    // Broadcast to spectators with spectator view (hidden hands)
    for (const [, socket] of room.spectators) {
      if (socket.readyState === WebSocket.OPEN) {
        const spectatorView = result.engine.getPlayerView(result.newState, 'spectator');
        socket.send(JSON.stringify({
          type: "game_move",
          session: { ...result.updatedSession, gameState: undefined },
          view: spectatorView,
          events: result.events,
          move,
          playerId: ws.userId,
        }));
      }
    }

    // CRITICAL: Settle payout if game is over
    if (result.isGameOver && result.challenge) {
      if (result.isDraw) {
        const drawSettlement = await settleDrawPayout(
          challengeId,
          result.challenge.player1Id,
          result.challenge.player2Id!,
          result.gameType,
          undefined,
          [result.challenge.player3Id, result.challenge.player4Id].filter(Boolean) as string[]
        );

        if (!drawSettlement.success) {
          throw new Error(drawSettlement.error || "Draw payout settlement failed");
        }
      } else if (result.winnerId) {
        const allPlayerIds = [
          result.challenge.player1Id,
          result.challenge.player2Id,
          result.challenge.player3Id,
          result.challenge.player4Id,
        ].filter(Boolean) as string[];

        const loserId = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? ([result.challenge.player2Id, result.challenge.player4Id].filter(Boolean) as string[])[0]
            : ([result.challenge.player1Id, result.challenge.player3Id].filter(Boolean) as string[])[0])
          : allPlayerIds.find((id) => id !== result.winnerId);

        if (!loserId) {
          throw new Error('Unable to resolve loser for payout settlement');
        }

        const payoutSettlement = await settleChallengePayout(
          challengeId,
          result.winnerId,
          loserId,
          result.gameType
        );

        if (!payoutSettlement.success) {
          throw new Error(payoutSettlement.error || "Winner payout settlement failed");
        }
      }

      // Update challenge status after successful settlement to keep money/state consistency
      await db.update(challenges)
        .set({
          status: "completed",
          winnerId: result.winnerId,
          endedAt: new Date(),
        })
        .where(eq(challenges.id, challengeId));

      // Broadcast game over
      const gameStatus2 = result.engine.getGameStatus(result.newState);
      [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "game_ended",
            winnerId: result.winnerId,
            isDraw: result.isDraw,
            reason: result.isDraw ? "draw" : (gameStatus2.reason || "game_complete"), // F3: use engine reason (e.g. "blocked")
            scores: gameStatus2.scores || undefined, // F12: include final scores
          }));
        }
      });

      // Send DB notifications for game result
      const betAmount = result.challenge.betAmount ? parseFloat(result.challenge.betAmount) : 0;
      const gameLabel = result.gameType || 'game';
      if (result.isDraw) {
        // Notify all players of draw
        const drawPlayerIds = [
          result.challenge.player1Id,
          result.challenge.player2Id,
          result.challenge.player3Id,
          result.challenge.player4Id,
        ].filter(Boolean) as string[];
        const drawMsg = { type: 'system' as const, priority: 'normal' as const, title: `${gameLabel} — Draw`, titleAr: `${gameLabel} — تعادل`, message: `The game ended in a draw. ${betAmount > 0 ? `$${betAmount.toFixed(2)} refunded.` : ''}`, messageAr: `انتهت اللعبة بالتعادل. ${betAmount > 0 ? `تم إرجاع $${betAmount.toFixed(2)}.` : ''}`, link: '/challenges' };
        drawPlayerIds.forEach((playerId) => {
          sendNotification(playerId, drawMsg).catch(() => { });
        });
      } else if (result.winnerId) {
        const winnerIds = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? [result.challenge.player1Id, result.challenge.player3Id]
            : [result.challenge.player2Id, result.challenge.player4Id]).filter(Boolean) as string[]
          : [result.winnerId];

        const loserIds = result.winningTeam !== undefined
          ? (result.winningTeam === 0
            ? [result.challenge.player2Id, result.challenge.player4Id]
            : [result.challenge.player1Id, result.challenge.player3Id]).filter(Boolean) as string[]
          : ([result.challenge.player1Id, result.challenge.player2Id, result.challenge.player3Id, result.challenge.player4Id]
            .filter((id): id is string => Boolean(id && id !== result.winnerId)));

        winnerIds.forEach((winnerId) => {
          sendNotification(winnerId, { type: 'success', priority: 'normal', title: `You Won! — ${gameLabel}`, titleAr: `فزت! — ${gameLabel}`, message: `Congratulations! You won the challenge.${betAmount > 0 ? ` You earned $${(betAmount * 2 * 0.95).toFixed(2)}.` : ''}`, messageAr: `تهانينا! فزت بالتحدي.${betAmount > 0 ? ` ربحت $${(betAmount * 2 * 0.95).toFixed(2)}.` : ''}`, link: '/challenges' }).catch(() => { });
        });

        loserIds.forEach((loserId) => {
          sendNotification(loserId, { type: 'warning', priority: 'normal', title: `You Lost — ${gameLabel}`, titleAr: `خسرت — ${gameLabel}`, message: `You lost the challenge.${betAmount > 0 ? ` $${betAmount.toFixed(2)} deducted.` : ''} Better luck next time!`, messageAr: `خسرت التحدي.${betAmount > 0 ? ` تم خصم $${betAmount.toFixed(2)}.` : ''} حظاً أوفر المرة القادمة!`, link: '/challenges' }).catch(() => { });
        });
      }

      // Delete game chat messages after game ends
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
        logger.error('Failed to cleanup game chat:', cleanupErr);
      }
    }
  } catch (error: unknown) {
    ws.send(JSON.stringify({ type: "move_error", error: getErrorMessage(error) || 'Invalid move' }));
  }
}
