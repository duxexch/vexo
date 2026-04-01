import { WebSocket } from "ws";
import { db } from "../../db";
import { challengeGameSessions, challenges } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { getGameEngine } from "../../game-engines";
import { isChallengeSessionPlayableStatus, normalizeChallengeGameState } from "../../lib/challenge-game-state";
import { getErrorMessage, type AuthenticatedSocket } from "../shared";
import { requireChallengePlayer } from "./guards";

/** Handle roll_dice message — backgammon dice roll */
export async function handleRollDice(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) {
    return;
  }
  const { room } = guard;

  try {
    const result = await db.transaction(async (tx) => {
      const [session] = await tx.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1)
        .for('update');

      if (!session || !isChallengeSessionPlayableStatus(session.status) || String(session.gameType || "").toLowerCase() !== "backgammon") {
        throw new Error("Cannot roll dice now");
      }

      const bgEngine = getGameEngine('backgammon');
      if (!bgEngine) throw new Error("Backgammon engine not available");

      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId));
      if (!challenge) {
        throw new Error("Challenge not found");
      }

      const normalizedState = normalizeChallengeGameState(session.gameState);
      const stateJson = normalizedState || bgEngine.initializeWithPlayers(challenge.player1Id, challenge.player2Id!);

      const rollResult = bgEngine.applyMove(stateJson, ws.userId!, { type: 'roll' });
      if (!rollResult.success) {
        throw new Error(rollResult.error || "Cannot roll now");
      }

      const [updatedSession] = await tx.update(challengeGameSessions)
        .set({
          gameState: rollResult.newState,
          totalMoves: (session.totalMoves || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(challengeGameSessions.id, session.id))
        .returning();

      return { newState: rollResult.newState, engine: bgEngine, updatedSession };
    });

    const gameState = JSON.parse(result.newState);
    const seq = typeof result.updatedSession?.totalMoves === "number" ? result.updatedSession.totalMoves : 0;

    // Player views
    for (const [playerId, socket] of room.players) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "dice_rolled",
          dice: gameState.dice,
          playerId: ws.userId,
          view: result.engine.getPlayerView(result.newState, playerId),
          seq,
        }));
      }
    }
    for (const [, socket] of room.spectators) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "dice_rolled",
          dice: gameState.dice,
          playerId: ws.userId,
          view: result.engine.getPlayerView(result.newState, 'spectator'),
          seq,
        }));
      }
    }
  } catch (error: unknown) {
    ws.send(JSON.stringify({ type: "challenge_error", error: getErrorMessage(error) }));
  }
}

/** Handle end_turn message — backgammon end turn */
export async function handleEndTurn(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;
  const guard = requireChallengePlayer(ws, challengeId);
  if (!guard.ok) return;
  const { room } = guard;

  try {
    const result = await db.transaction(async (tx) => {
      const [session] = await tx.select().from(challengeGameSessions)
        .where(eq(challengeGameSessions.challengeId, challengeId))
        .orderBy(desc(challengeGameSessions.createdAt))
        .limit(1)
        .for('update');

      if (!session || !isChallengeSessionPlayableStatus(session.status) || String(session.gameType || "").toLowerCase() !== "backgammon") {
        throw new Error("Cannot end turn");
      }

      const bgEngine = getGameEngine('backgammon');
      if (!bgEngine) throw new Error("Backgammon engine not available");

      const normalizedState = normalizeChallengeGameState(session.gameState);
      if (!normalizedState) {
        throw new Error("Corrupted game state");
      }

      const endTurnResult = bgEngine.applyMove(normalizedState, ws.userId!, { type: 'end_turn' });
      if (!endTurnResult.success) {
        throw new Error(endTurnResult.error || "Cannot end turn");
      }

      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId));
      const newState = JSON.parse(endTurnResult.newState);
      const nextTurn = newState.currentTurn === 'white' ? challenge.player1Id : challenge.player2Id;

      const [updatedSession] = await tx.update(challengeGameSessions)
        .set({
          gameState: endTurnResult.newState,
          currentTurn: nextTurn,
          totalMoves: (session.totalMoves || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(challengeGameSessions.id, session.id))
        .returning();

      return { newState: endTurnResult.newState, nextTurn, engine: bgEngine, updatedSession };
    });

    const seq = typeof result.updatedSession?.totalMoves === "number" ? result.updatedSession.totalMoves : 0;

    for (const [playerId, socket] of room.players) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "turn_ended",
          view: result.engine.getPlayerView(result.newState, playerId),
          nextPlayer: result.nextTurn,
          seq,
        }));
      }
    }
    for (const [, socket] of room.spectators) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "turn_ended",
          view: result.engine.getPlayerView(result.newState, 'spectator'),
          nextPlayer: result.nextTurn,
          seq,
        }));
      }
    }
  } catch (error: unknown) {
    ws.send(JSON.stringify({ type: "challenge_error", error: getErrorMessage(error) }));
  }
}
