import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { and, eq } from "drizzle-orm";
import { challengeSpectators } from "@shared/schema";
import { db } from "../db";
import { logger } from "../lib/logger";
import type { AuthenticatedSocket } from "./shared";
import { clients, voiceRooms, challengeGameRooms } from "./shared";
import { handleAuth } from "./auth";
import { getPresenceAudienceUserIds } from "./auth";
import { handleChat } from "./chat";
import { handleMatchmaking } from "./matchmaking";
import { handleVoice } from "./voice";
import { handleChallengeGames } from "./challenge-games";
import { trackUserOffline } from "../lib/redis";
import { redisRateLimit } from "../lib/redis";
import { checkWsUpgradeRateLimit, isWsOriginAllowed, rejectWsUpgrade } from "../lib/ws-upgrade-guard";
import { createWsProtocolError, type WebSocketProtocolError, validateWebSocketEnvelope } from "./validation";

const challengeMessageTypes = new Set([
  "join_challenge_game",
  "leave_challenge_game",
  "game_move",
  "roll_dice",
  "end_turn",
  "challenge_chat",
  "game_resign",
  "offer_draw",
  "respond_draw",
  "gift_to_player",
  "send_gift",
]);

const chatMessageTypes = new Set([
  "chat_message",
  "typing",
  "get_chat_history",
  "message_read",
  "mark_chat_read",
  "delete_message",
  "edit_message",
  "react_to_message",
  "search_messages",
  "send_message",
]);

// Re-export all public APIs so external imports from "./websocket" continue to work
export { sendNotification, broadcastNotification, broadcastSystemEvent, broadcastAdminAlert, broadcastChallengeUpdate, broadcastToUser, getOnlineUsersCount, getActiveGameRoomsCount } from "./notifications";
export type { AuthenticatedSocket, JwtPayload, GameRoomState } from "./shared";
export { clients, voiceRooms, challengeGameRooms } from "./shared";

function sendWsProtocolError(ws: AuthenticatedSocket, err: WebSocketProtocolError): void {
  ws.send(JSON.stringify({
    type: "ws_error",
    payload: {
      message: err.message,
      code: err.code,
    },
    // Backward-compatible top-level fields for older clients.
    error: err.message,
    code: err.code,
  }));
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });

  // Register upgrade handler — safe with multiple WebSocket servers
  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws') {
      try {
        const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
        if (!isWsOriginAllowed(origin)) {
          rejectWsUpgrade(socket, 403);
          return;
        }

        const connLimit = await checkWsUpgradeRateLimit(request, "ws:general:conn:ip", 20, 10_000);
        if (!connLimit.allowed) {
          rejectWsUpgrade(socket, 429);
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        logger.warn(`[WS] Upgrade rejected: ${error instanceof Error ? error.message : String(error)}`);
        socket.destroy();
      }
    }
    // Don't destroy for non-matching — other handlers or Vite HMR may process it
  });

  wss.on("connection", (ws: AuthenticatedSocket, req) => {
    ws.isAlive = true;
    ws.userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    const clientIp = req.socket.remoteAddress || "unknown";
    ws.clientIp = clientIp;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (message) => {
      try {
        const rateLimitKey = ws.userId
          ? `ws:general:msg:user:${ws.userId}`
          : `ws:general:msg:ip:${clientIp}`;
        const wsRateLimit = await redisRateLimit(rateLimitKey, 180, 10_000);
        if (!wsRateLimit.allowed) {
          sendWsProtocolError(ws, createWsProtocolError("Too many websocket messages, slow down", "rate_limit"));
          return;
        }

        const parsed = JSON.parse(message.toString()) as unknown;
        const validation = validateWebSocketEnvelope(parsed);
        if (!validation.ok) {
          sendWsProtocolError(ws, validation.error);
          return;
        }

        const data = validation.data;

        // SECURITY: Type-based dispatch — only invoke the relevant handler
        const type = data?.type;
        if (!type || typeof type !== 'string') {
          sendWsProtocolError(ws, createWsProtocolError("Invalid message type", "invalid_type"));
          return;
        }

        if (type === 'auth' || type === 'authenticate' || type === 'admin_auth' || type === 'mark_read' || type === 'mark_all_read') {
          await handleAuth(ws, data);
        } else if (chatMessageTypes.has(type) || type.startsWith('chat')) {
          await handleChat(ws, data);
        } else if (type.startsWith('match') || type === 'find_match' || type === 'cancel_match') {
          await handleMatchmaking(ws, data);
        } else if (type.startsWith('voice') || type === 'join_voice' || type === 'leave_voice') {
          await handleVoice(ws, data);
        } else if (challengeMessageTypes.has(type)) {
          // Challenge games, game actions, spectating, etc.
          await handleChallengeGames(ws, data);
        } else {
          sendWsProtocolError(ws, createWsProtocolError("Unknown message type", "unknown_type"));
        }
      } catch (error) {
        logger.error('WebSocket message error', error instanceof Error ? error : new Error(String(error)));
        sendWsProtocolError(ws, createWsProtocolError("Invalid message format", "invalid_format"));
      }
    });

    ws.on("close", () => {
      ws.activeChallengeId = undefined;
      ws.activeChallengeRole = undefined;

      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId)!.delete(ws);
        if (clients.get(ws.userId)!.size === 0) {
          clients.delete(ws.userId);
          // Track offline in Redis (replaces O(N) broadcast)
          trackUserOffline(ws.userId).catch(() => { });
          const disconnectedUserId = ws.userId;
          void (async () => {
            const audienceUserIds = await getPresenceAudienceUserIds(disconnectedUserId);
            if (audienceUserIds.length === 0) {
              return;
            }

            const lastSeen = new Date().toISOString();
            const offlineNotification = JSON.stringify({ type: "user_offline", data: { userId: disconnectedUserId, lastSeen } });
            for (const audienceUserId of audienceUserIds) {
              const sockets = clients.get(audienceUserId);
              if (!sockets) continue;
              for (const s of sockets) {
                if (s.readyState === WebSocket.OPEN) {
                  s.send(offlineNotification);
                  break;
                }
              }
            }
          })().catch(() => { });
        }
      }

      // Clean up voice rooms on disconnect
      if (ws.userId) {
        voiceRooms.forEach((room, matchId) => {
          const mappedSocket = room.get(ws.userId!);
          if (mappedSocket && mappedSocket === ws) {
            room.delete(ws.userId!);
            // Notify remaining peers
            room.forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "voice_peer_left", matchId, peerUserId: ws.userId }));
              }
            });
            // Clean up empty room
            if (room.size === 0) {
              voiceRooms.delete(matchId);
            }
          }
        });

        // SECURITY: Clean up challengeGameRooms on disconnect to prevent memory leak
        const spectatorChallengesToClose: string[] = [];
        challengeGameRooms.forEach((room, challengeId) => {
          const mappedPlayerSocket = room.players.get(ws.userId!);
          if (mappedPlayerSocket && mappedPlayerSocket === ws) {
            room.players.delete(ws.userId!);
          }
          const mappedSpectatorSocket = room.spectators.get(ws.userId!);
          if (mappedSpectatorSocket && mappedSpectatorSocket === ws) {
            room.spectators.delete(ws.userId!);
            spectatorChallengesToClose.push(challengeId);
          }
          // Remove empty rooms
          if (room.players.size === 0 && room.spectators.size === 0) {
            challengeGameRooms.delete(challengeId);
          }
        });

        if (spectatorChallengesToClose.length > 0) {
          const disconnectedUserId = ws.userId;
          void (async () => {
            const leftAt = new Date();
            for (const challengeId of spectatorChallengesToClose) {
              await db.update(challengeSpectators)
                .set({ leftAt })
                .where(and(
                  eq(challengeSpectators.challengeId, challengeId),
                  eq(challengeSpectators.userId, disconnectedUserId),
                ));
            }
          })().catch((error) => {
            logger.warn(`[WS] Failed to mark spectator leave on disconnect: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
      }
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedSocket) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 45000); // 45s — optimized for scale (was 30s)

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
}
