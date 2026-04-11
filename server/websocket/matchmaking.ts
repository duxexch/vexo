import { WebSocket } from "ws";
import { db } from "../db";
import { matchmakingQueue, gameMatches, games, users } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "./shared";
import { clients } from "./shared";
import { sendNotification } from "./notifications";

const GAME_ROUTE_SEGMENTS: Record<string, string> = {
  chess: "chess",
  backgammon: "backgammon",
  domino: "domino",
  tarneeb: "tarneeb",
  baloot: "baloot",
};

function normalizeGameRouteSegment(gameName: string | null | undefined): string | null {
  const normalized = String(gameName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!normalized) return null;
  if (GAME_ROUTE_SEGMENTS[normalized]) {
    return GAME_ROUTE_SEGMENTS[normalized];
  }

  if (normalized.includes("backgammon")) return "backgammon";
  if (normalized.includes("chess")) return "chess";
  if (normalized.includes("domino")) return "domino";
  if (normalized.includes("tarneeb")) return "tarneeb";
  if (normalized.includes("baloot")) return "baloot";

  return null;
}

function buildMatchLink(gameName: string | null | undefined, matchId: string): string {
  const routeSegment = normalizeGameRouteSegment(gameName);
  if (!routeSegment) {
    return "/multiplayer";
  }
  return `/game/${routeSegment}/${matchId}`;
}

/**
 * Handle matchmaking message types:
 * join_random_match, invite_friend, accept_invite, decline_invite, cancel_matchmaking
 */
export async function handleMatchmaking(ws: AuthenticatedSocket, data: any): Promise<void> {
  // Join random match queue
  if (data.type === "join_random_match" && ws.userId) {
    const { gameId } = data;

    // Check if already in queue
    const existingQueue = await db.select().from(matchmakingQueue)
      .where(and(
        eq(matchmakingQueue.userId, ws.userId),
        eq(matchmakingQueue.status, "waiting")
      ));

    if (existingQueue.length > 0) {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Already in queue" }));
      return;
    }

    // SECURITY: Validate gameId exists before proceeding
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
    if (!game) {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Invalid game" }));
      return;
    }

    // SECURITY: Atomic match-finding with FOR UPDATE SKIP LOCKED to prevent duplicate matches
    const matchResult = await db.transaction(async (tx) => {
      const waitingPlayers = await tx.select().from(matchmakingQueue)
        .where(and(
          eq(matchmakingQueue.gameId, gameId),
          eq(matchmakingQueue.matchType, "random"),
          eq(matchmakingQueue.status, "waiting"),
          sql`${matchmakingQueue.userId} != ${ws.userId}`
        ))
        .limit(1)
        .for('update', { skipLocked: true });

      if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers[0];

        // Update opponent's queue status
        await tx.update(matchmakingQueue)
          .set({ status: "matched" })
          .where(eq(matchmakingQueue.id, opponent.id));

        // Create match
        const [match] = await tx.insert(gameMatches).values({
          gameId,
          player1Id: opponent.userId,
          player2Id: ws.userId!,
          status: "in_progress",
          startedAt: new Date(),
        }).returning();

        return { matched: true, match, opponent };
      }

      return { matched: false };
    });

    if (matchResult.matched) {
      const { match, opponent } = matchResult as any;

      // Get player info
      const [player1] = await db.select({
        id: users.id,
        username: users.username,
        avatarUrl: users.profilePicture,
        vipLevel: users.vipLevel,
      }).from(users).where(eq(users.id, opponent.userId));

      const [player2] = await db.select({
        id: users.id,
        username: users.username,
        avatarUrl: users.profilePicture,
        vipLevel: users.vipLevel,
      }).from(users).where(eq(users.id, ws.userId));

      const [game] = await db.select().from(games).where(eq(games.id, gameId));

      const matchData = { ...match, player1, player2, game };

      // Notify both players via WebSocket
      ws.send(JSON.stringify({ type: "match_found", data: matchData }));

      const opponentSockets = clients.get(opponent.userId);
      if (opponentSockets) {
        opponentSockets.forEach(socket => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "match_found", data: matchData }));
          }
        });
      }

      // Persist match_found notification for both players (in case WS missed)
      const gameName = game?.name || 'Game';
      const matchLink = buildMatchLink(game?.name, match.id);
      sendNotification(ws.userId!, {
        type: 'system',
        priority: 'high',
        title: `Match Found — ${gameName}`,
        titleAr: `تم إيجاد خصم — ${gameName}`,
        message: `A match has been found! Join now.`,
        messageAr: `تم إيجاد مباراة! انضم الآن.`,
        link: matchLink,
      }).catch(() => { });
      sendNotification(opponent.userId, {
        type: 'system',
        priority: 'high',
        title: `Match Found — ${gameName}`,
        titleAr: `تم إيجاد خصم — ${gameName}`,
        message: `A match has been found! Join now.`,
        messageAr: `تم إيجاد مباراة! انضم الآن.`,
        link: matchLink,
      }).catch(() => { });
    } else {
      // Join queue
      const [queueEntry] = await db.insert(matchmakingQueue).values({
        gameId,
        userId: ws.userId,
        matchType: "random",
        status: "waiting",
      }).returning();

      ws.send(JSON.stringify({ type: "matchmaking_queued", data: queueEntry }));
    }
  }

  // Invite friend to match
  if (data.type === "invite_friend" && ws.userId) {
    const { gameId, friendAccountId } = data;

    // Find friend by account ID
    const [friend] = await db.select().from(users).where(eq(users.accountId, friendAccountId));
    if (!friend) {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Friend not found" }));
      return;
    }

    if (friend.id === ws.userId) {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Cannot invite yourself" }));
      return;
    }

    // Create pending match
    const [match] = await db.insert(gameMatches).values({
      gameId,
      player1Id: ws.userId,
      player2Id: friend.id,
      status: "pending",
    }).returning();

    // Get sender info
    const [sender] = await db.select({
      id: users.id,
      username: users.username,
      avatarUrl: users.profilePicture,
      vipLevel: users.vipLevel,
    }).from(users).where(eq(users.id, ws.userId));

    const [game] = await db.select().from(games).where(eq(games.id, gameId));

    // Notify friend via WebSocket
    const friendSockets = clients.get(friend.id);
    if (friendSockets) {
      friendSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "game_invite",
            data: { match, sender, game }
          }));
        }
      });
    }

    // Persist game invite notification (friend may be offline)
    const gameName = game?.name || 'Game';
    const matchLink = buildMatchLink(game?.name, match.id);
    sendNotification(friend.id, {
      type: 'system',
      priority: 'high',
      title: `Game Invite — ${gameName}`,
      titleAr: `دعوة لعب — ${gameName}`,
      message: `${sender?.username || 'Someone'} invited you to play ${gameName}!`,
      messageAr: `${sender?.username || 'شخص'} دعاك للعب ${gameName}!`,
      link: matchLink,
      metadata: JSON.stringify({ matchId: match.id, senderId: ws.userId }),
    }).catch(() => { });

    ws.send(JSON.stringify({ type: "invite_sent", data: { match, friendId: friend.id } }));
  }

  // Accept friend invite
  if (data.type === "accept_invite" && ws.userId) {
    const { matchId } = data;

    const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
    if (!match || match.player2Id !== ws.userId || match.status !== "pending") {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Invalid invite" }));
      return;
    }

    const [updated] = await db.update(gameMatches)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(eq(gameMatches.id, matchId))
      .returning();

    // Get player info
    const [player1] = await db.select({
      id: users.id,
      username: users.username,
      avatarUrl: users.profilePicture,
      vipLevel: users.vipLevel,
    }).from(users).where(eq(users.id, match.player1Id));

    const [player2] = await db.select({
      id: users.id,
      username: users.username,
      avatarUrl: users.profilePicture,
      vipLevel: users.vipLevel,
    }).from(users).where(eq(users.id, ws.userId));

    const [game] = await db.select().from(games).where(eq(games.id, match.gameId));

    const matchData = { ...updated, player1, player2, game };

    // Notify both players
    ws.send(JSON.stringify({ type: "match_found", data: matchData }));

    const senderSockets = clients.get(match.player1Id);
    if (senderSockets) {
      senderSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "invite_response",
            data: { accepted: true, match: matchData }
          }));
        }
      });
    }
  }

  // Decline friend invite
  if (data.type === "decline_invite" && ws.userId) {
    const { matchId } = data;

    const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
    if (!match || match.player2Id !== ws.userId || match.status !== "pending") {
      ws.send(JSON.stringify({ type: "matchmaking_error", error: "Invalid invite" }));
      return;
    }

    await db.update(gameMatches)
      .set({ status: "cancelled" })
      .where(eq(gameMatches.id, matchId));

    // Notify sender via WebSocket
    const senderSockets = clients.get(match.player1Id);
    if (senderSockets) {
      senderSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "invite_response",
            data: { accepted: false, matchId }
          }));
        }
      });
    }

    // Persist decline notification
    sendNotification(match.player1Id, {
      type: 'system',
      priority: 'normal',
      title: 'Invite Declined',
      titleAr: 'تم رفض الدعوة',
      message: 'Your game invite was declined.',
      messageAr: 'تم رفض دعوة اللعب الخاصة بك.',
      link: '/multiplayer',
    }).catch(() => { });

    ws.send(JSON.stringify({ type: "invite_declined", data: { matchId } }));
  }

  // Cancel matchmaking
  if (data.type === "cancel_matchmaking" && ws.userId) {
    await db.update(matchmakingQueue)
      .set({ status: "cancelled" })
      .where(and(
        eq(matchmakingQueue.userId, ws.userId),
        eq(matchmakingQueue.status, "waiting")
      ));

    ws.send(JSON.stringify({ type: "matchmaking_cancelled" }));
  }
}
