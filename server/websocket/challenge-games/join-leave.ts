import { WebSocket } from "ws";
import { db } from "../../db";
import { storage } from "../../storage";
import { users, challengeGameSessions, challenges, challengeSpectators } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { getGameEngine } from "../../game-engines";
import { normalizeChallengeGameState } from "../../lib/challenge-game-state";
import type { AuthenticatedSocket } from "../shared";
import { challengeGameRooms } from "../shared";

/** Handle join_challenge_game message */
export async function handleJoinChallengeGame(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;

  // Verify challenge exists
  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  if (!challenge) {
    ws.send(JSON.stringify({ type: "challenge_error", error: "Challenge not found" }));
    return;
  }

  const normalizedGameType = String(challenge.gameType || "").toLowerCase();

  // SERVER-SIDE ROLE DETERMINATION: Check if user is actually a seated player in this challenge
  const socketUserId = ws.userId ?? null;
  const isActualPlayer = [
    challenge.player1Id,
    challenge.player2Id,
    challenge.player3Id,
    challenge.player4Id,
  ].includes(socketUserId);

  // Initialize room if needed
  if (!challengeGameRooms.has(challengeId)) {
    challengeGameRooms.set(challengeId, {
      players: new Map(),
      spectators: new Map(),
    });
  }

  const room = challengeGameRooms.get(challengeId)!;

  if (!isActualPlayer) {
    // SECURITY: Block spectators from private challenges unless they're the invited friend
    if (challenge.visibility === 'private' && ws.userId !== challenge.friendAccountId) {
      ws.send(JSON.stringify({ type: "challenge_error", error: "This is a private challenge", code: "private_challenge_forbidden" }));
      return;
    }

    // SECURITY: Check if spectators are allowed for this game type
    const challengeConfig = await storage.getChallengeSettings(normalizedGameType);
    if (!challengeConfig.allowSpectators) {
      ws.send(JSON.stringify({ type: "challenge_error", error: "Spectators are not allowed for this game", code: "spectators_disabled" }));
      return;
    }

    // SECURITY: Check max spectator limit
    if (room.spectators.size >= challengeConfig.maxSpectators) {
      ws.send(JSON.stringify({ type: "challenge_error", error: "Spectator limit reached", code: "spectator_limit_reached" }));
      return;
    }

    // User is NOT a player - they are a spectator
    room.spectators.set(ws.userId!, ws);
    ws.activeChallengeId = challengeId;
    ws.activeChallengeRole = "spectator";

    try {
      await db.insert(challengeSpectators)
        .values({
          challengeId,
          userId: ws.userId!,
          joinedAt: new Date(),
          leftAt: null,
        })
        .onConflictDoUpdate({
          target: [challengeSpectators.challengeId, challengeSpectators.userId],
          set: {
            joinedAt: new Date(),
            leftAt: null,
          },
        });
    } catch (error) {
      console.error("[WS] Failed to mark challenge spectator join", error);
    }

    // Notify players about new spectator
    const [spectatorUser] = await db.select({
      id: users.id,
      username: users.username,
      avatarUrl: users.profilePicture,
    }).from(users).where(eq(users.id, ws.userId!));

    room.players.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "spectator_joined",
          spectator: spectatorUser
        }));
      }
    });

    // Tell the client they joined as spectator
    ws.send(JSON.stringify({ type: "role_assigned", role: "spectator" }));
  } else {
    // User IS a player in this challenge
    // Close previous connection from same user if exists (multi-tab)
    const existingSocket = room.players.get(ws.userId!);
    if (existingSocket && existingSocket !== ws && existingSocket.readyState === WebSocket.OPEN) {
      existingSocket.send(JSON.stringify({ type: "session_replaced", reason: "Opened in another tab" }));
      existingSocket.close(4001, 'Replaced by new connection');
    }
    room.players.set(ws.userId!, ws);
    ws.activeChallengeId = challengeId;
    ws.activeChallengeRole = "player";

    // Tell the client they joined as player
    ws.send(JSON.stringify({ type: "role_assigned", role: "player", playerId: ws.userId }));
  }

  // Broadcast spectator count
  const spectatorCount = room.spectators.size;
  [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "spectator_count", count: spectatorCount }));
    }
  });

  // Send current game state — SECURITY: Use getPlayerView() to prevent leaking cards/hidden state
  const sendFilteredState = (stateSource: any) => {
    if (!stateSource) return;
    const seq = typeof stateSource.totalMoves === "number" ? stateSource.totalMoves : 0;
    const rawState = stateSource.gameState;
    if (!rawState) {
      ws.send(JSON.stringify({ type: "game_state_sync", session: stateSource, seq }));
      return;
    }

    const normalizedState = normalizeChallengeGameState(rawState);
    if (!normalizedState) {
      ws.send(JSON.stringify({
        type: "challenge_error",
        error: "Corrupted game state",
        code: "invalid_game_state",
      }));
      return;
    }

    try {
      const engine = getGameEngine(normalizedGameType);
      const viewerId = isActualPlayer ? ws.userId! : "spectator";
      const fallbackView = JSON.parse(normalizedState);
      const view = engine?.getPlayerView(normalizedState, viewerId) || fallbackView;
      ws.send(JSON.stringify({
        type: "game_state_sync",
        session: { ...stateSource, gameState: undefined },
        view,
        seq,
      }));
    } catch {
      ws.send(JSON.stringify({
        type: "challenge_error",
        error: "Failed to prepare game state",
        code: "state_sync_failed",
      }));
    }
  };

  if (room.currentState) {
    sendFilteredState(room.currentState);
  } else {
    const [session] = await db.select().from(challengeGameSessions)
      .where(eq(challengeGameSessions.challengeId, challengeId))
      .orderBy(desc(challengeGameSessions.createdAt))
      .limit(1);

    if (session) {
      sendFilteredState(session);
    }
  }

  ws.send(JSON.stringify({ type: "joined_challenge_game", challengeId }));
}

/** Handle leave_challenge_game message */
export async function handleLeaveChallengeGame(ws: AuthenticatedSocket, data: any): Promise<void> {
  const { challengeId } = data;
  const room = challengeGameRooms.get(challengeId);

  if (room) {
    if (room.spectators.has(ws.userId!)) {
      room.spectators.delete(ws.userId!);

      try {
        await db.update(challengeSpectators)
          .set({ leftAt: new Date() })
          .where(and(
            eq(challengeSpectators.challengeId, challengeId),
            eq(challengeSpectators.userId, ws.userId!),
          ));
      } catch (error) {
        console.error("[WS] Failed to mark challenge spectator leave", error);
      }

      // Notify players about spectator leaving
      room.players.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "spectator_left",
            spectatorId: ws.userId
          }));
        }
      });

      // Broadcast updated spectator count
      const spectatorCount = room.spectators.size;
      [...room.players.values(), ...room.spectators.values()].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "spectator_count", count: spectatorCount }));
        }
      });
    } else {
      room.players.delete(ws.userId!);
    }

    // Clean up empty room
    if (room.players.size === 0 && room.spectators.size === 0) {
      challengeGameRooms.delete(challengeId);
    }
  }

  if (ws.activeChallengeId === challengeId) {
    ws.activeChallengeId = undefined;
    ws.activeChallengeRole = undefined;
  }
}
