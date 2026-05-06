import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { moveRateLimiter, resignRateLimiter, sessionMoveRateLimiter, sessionUserMoveRateLimiter } from '../lib/rate-limiter';
import { redisRateLimit } from '../lib/redis';
import { logger } from '../lib/logger';
import { checkWsUpgradeRateLimit, isWsOriginAllowed, rejectWsUpgrade } from '../lib/ws-upgrade-guard';
import type { AuthenticatedWebSocket } from './types';
import { send, sendError } from './utils';
import { handleAuthenticate, handleJoinGame, handleSpectate } from './auth-join';
import { handleMakeMove } from './moves';
import { handleChat, handleSendGift } from './chat-gifts';
import { handleGetState, handleResign, handleOfferDraw, handleRespondDraw } from './state-resign';
import { handleLeaveGame, handleDisconnect } from './timers-disconnect';
import { handleSetSpeedMode } from './speed-mode';
import { createGameWsProtocolError, validateGameMessage, type ValidatedGameMessage } from './validation';
import { wsEventLagMs, wsMoveRateLimitedTotal } from '../lib/prometheus-metrics';
import { appendGameEvent, finalizeGameEvent } from '../lib/game-events';

export { rooms, userConnections } from './types';

export function setupGameWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024 // 64KB max message size — prevents memory attacks
  });

  // Register upgrade handler via the shared routing mechanism
  // (see server/index.ts for the centralized upgrade router)
  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws/game') {
      try {
        const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
        if (!isWsOriginAllowed(origin)) {
          rejectWsUpgrade(socket, 403);
          return;
        }

        const connLimit = await checkWsUpgradeRateLimit(request, 'ws:game:conn:ip', 20, 10_000);
        if (!connLimit.allowed) {
          rejectWsUpgrade(socket, 429);
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const gameWs = ws as AuthenticatedWebSocket;
          gameWs.userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined;
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        logger.warn(`[GameWS] Upgrade rejected: ${error instanceof Error ? error.message : String(error)}`);
        socket.destroy();
      }
    }
    // Don't destroy the socket here — let other handlers process it
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 45000); // 45s — optimized for scale (was 30s)

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    ws.isAlive = true;
    ws.userAgent = ws.userAgent || undefined;
    const clientIp = req.socket.remoteAddress || 'unknown';

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      const startedAt = Date.now();
      try {
        const rateLimitKey = ws.userId
          ? `ws:game:msg:user:${ws.userId}`
          : `ws:game:msg:ip:${clientIp}`;
        const wsRateLimit = await redisRateLimit(rateLimitKey, 120, 10_000);
        if (!wsRateLimit.allowed) {
          send(ws, {
            type: 'error',
            payload: {
              error: 'Too many websocket messages, slow down',
              code: 'rate_limit',
              retryAfterMs: wsRateLimit.retryAfterMs
            }
          });
          return;
        }

        const parsed = JSON.parse(data.toString()) as unknown;
        const validation = validateGameMessage(parsed);

        if (!validation.ok) {
          sendError(ws, validation.error.message, validation.error.code);
          return;
        }

        await handleMessage(ws, validation.data);
      } catch (error) {
        logger.error('[GameWS] Message handler error', error instanceof Error ? error : new Error(String(error)));
        const protocolError = createGameWsProtocolError('Invalid message format', 'invalid_format');
        sendError(ws, protocolError.message, protocolError.code);
      } finally {
        wsEventLagMs.observe(Date.now() - startedAt);
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', error instanceof Error ? error : new Error(String(error)));
      handleDisconnect(ws);
    });
  });

  return wss;
}

async function handleMessage(ws: AuthenticatedWebSocket, message: ValidatedGameMessage) {
  switch (message.type) {
    case 'authenticate':
      await handleAuthenticate(ws, message.payload);
      break;
    case 'ping':
      send(ws, { type: 'pong', payload: { ts: Date.now() } });
      break;
    case 'join_game':
      await handleJoinGame(ws, message.payload);
      break;
    case 'spectate':
      await handleSpectate(ws, message.payload);
      break;
    case 'make_move': {
      if (!ws.userId || !ws.sessionId) {
        // If we don't have enough identity context, let move handler enforce session/auth.
        await handleMakeMove(ws, message.payload);
        break;
      }

      // Cache for TS narrowing so we never pass possibly-undefined values
      const sessionId: string = ws.sessionId;
      const userId: string = ws.userId;

      const { idempotencyKey } = message.payload;

      const normalizedIdempotencyKey =
        typeof idempotencyKey === 'string' ? idempotencyKey.trim().slice(0, 128) : '';

      const attemptId = randomUUID();
      const correlationId = normalizedIdempotencyKey
        ? `live_game_move_corr:${sessionId}:${userId}:${normalizedIdempotencyKey}`.slice(0, 128)
        : attemptId;

      const logThrottledMove = async (scope: 'user' | 'session' | 'session_user', retryAfterMs: number | undefined) => {
        const eventId = randomUUID();
        const idempotencyKeyForAudit = `live_game_move_rl:${sessionId}:${userId}:${scope}:${correlationId}`.slice(0, 128);

        let recordId: string | undefined;

        try {
          const result = await appendGameEvent({
            eventId,
            idempotencyKey: idempotencyKeyForAudit,
            sessionId,
            source: 'live_game_ws',
            eventType: 'move_rate_limited',
            actorId: userId,
            actorType: 'player',
            moveType: typeof message.payload.move?.type === 'string' ? message.payload.move.type : 'move',
            payload: {
              scope,
              retryAfterMs: retryAfterMs ?? null,
              correlationId,
              attemptId,
            },
          });

          recordId = result.recordId;

          await finalizeGameEvent(recordId, 'rejected', 'rate_limit');
        } catch (err) {
          // Never fail closed for audit logging
          logger.warn(`[GameWS][RateLimitAudit] Failed to append throttled move audit for session=${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      };

      const moveRL = moveRateLimiter.check(userId);
      if (!moveRL.allowed) {
        wsMoveRateLimitedTotal.inc({ scope: 'user' });
        await logThrottledMove('user', moveRL.retryAfterMs);
        send(ws, {
          type: 'error',
          payload: {
            error: 'Too many moves, slow down',
            code: 'rate_limit',
            retryAfterMs: moveRL.retryAfterMs,
            correlationId,
          },
        });
        break;
      }

      const sessionRL = sessionMoveRateLimiter.check(sessionId);
      if (!sessionRL.allowed) {
        wsMoveRateLimitedTotal.inc({ scope: 'session' });
        await logThrottledMove('session', sessionRL.retryAfterMs);
        send(ws, {
          type: 'error',
          payload: {
            error: 'Too many moves in this match, slow down',
            code: 'rate_limit',
            retryAfterMs: sessionRL.retryAfterMs,
            correlationId,
          },
        });
        break;
      }

      const sessionUserRL = sessionUserMoveRateLimiter.check(sessionId, userId);
      if (!sessionUserRL.allowed) {
        wsMoveRateLimitedTotal.inc({ scope: 'session_user' });
        await logThrottledMove('session_user', sessionUserRL.retryAfterMs);
        send(ws, {
          type: 'error',
          payload: {
            error: 'Too many moves from this player in this match, slow down',
            code: 'rate_limit',
            retryAfterMs: sessionUserRL.retryAfterMs,
            correlationId,
          },
        });
        break;
      }

      await handleMakeMove(ws, message.payload);
      break;
    }
    case 'chat':
      await handleChat(ws, message.payload);
      break;
    case 'send_gift':
      await handleSendGift(ws, message.payload);
      break;
    case 'leave_game':
      handleLeaveGame(ws);
      break;
    case 'get_state':
      await handleGetState(ws, message.payload);
      break;
    case 'resign':
      if (ws.userId) {
        const resignRL = resignRateLimiter.check(ws.userId);
        if (!resignRL.allowed) {
          send(ws, { type: 'error', payload: { error: 'Please wait before resigning again', code: 'rate_limit' } });
          break;
        }
      }
      await handleResign(ws, message.payload);
      break;
    case 'offer_draw':
      await handleOfferDraw(ws, message.payload);
      break;
    case 'respond_draw':
      await handleRespondDraw(ws, message.payload);
      break;
    case 'set_speed_mode':
      await handleSetSpeedMode(ws, message.payload);
      break;
    default:
      sendError(ws, 'Unknown message type', 'unknown_type');
  }
}
