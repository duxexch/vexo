import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { moveRateLimiter, resignRateLimiter, sessionMoveRateLimiter, sessionUserMoveRateLimiter } from '../lib/rate-limiter';
import { redisRateLimit } from '../lib/redis';
import { logger } from '../lib/logger';
import { checkWsUpgradeRateLimit, isWsOriginAllowed, rejectWsUpgrade } from '../lib/ws-upgrade-guard';
import type { AuthenticatedWebSocket } from './types';
import { rooms } from './types';
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

const MAX_GAME_WS_MESSAGE_BYTES = 60 * 1024; // structured rejection (ws maxPayload remains 64KB)

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

      // Server-controlled correlation/attempt ids for *every* inbound message,
      // including schema-validation failures (so rejected responses can always
      // carry correlationId).
      const attemptId = randomUUID();
      ws.attemptId = attemptId;
      ws.correlationId = attemptId;

      // Enforce structured payload-size rejection for all message types.
      const incomingBytes = typeof (data as { byteLength?: number }).byteLength === 'number'
        ? (data as { byteLength: number }).byteLength
        : typeof (data as { length?: number }).length === 'number'
          ? (data as { length: number }).length
          : 0;

      if (incomingBytes > MAX_GAME_WS_MESSAGE_BYTES) {
        sendError(
          ws,
          'Payload too large',
          'payload_too_large',
          { maxBytes: MAX_GAME_WS_MESSAGE_BYTES, receivedBytes: incomingBytes },
        );
        return;
      }

      try {
        const rateLimitKey = ws.userId
          ? `ws:game:msg:user:${ws.userId}`
          : `ws:game:msg:ip:${clientIp}`;
        const wsRateLimit = await redisRateLimit(rateLimitKey, 120, 10_000);
        if (!wsRateLimit.allowed) {
          sendError(
            ws,
            'Too many websocket messages, slow down',
            'rate_limit',
            { retryAfterMs: wsRateLimit.retryAfterMs },
          );
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
  // If payload carries a sessionId, stamp room operation ids so broadcasts
  // (which bypass `send()`) include correlationId/sessionId too.
  const maybePayload = message.payload as unknown as { sessionId?: unknown };
  const maybeSessionId = typeof maybePayload?.sessionId === 'string' ? maybePayload.sessionId : undefined;
  if (maybeSessionId) {
    const operationRoom = rooms.get(maybeSessionId);
    if (operationRoom) {
      operationRoom.operationCorrelationId = ws.correlationId;
      operationRoom.operationAttemptId = ws.attemptId;
    }
  }

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
      // SECURITY: correlationId must be server-controlled; reject client injection attempts.
      const clientCorrelationId = (message.payload as { correlationId?: unknown }).correlationId;
      if (typeof clientCorrelationId === 'string' && clientCorrelationId.trim().length > 0) {
        logger.warn('[GameWS] correlationId injection attempt', {
          sessionId: ws.sessionId,
          userId: ws.userId,
        });
        sendError(
          ws,
          'correlationId is server-controlled',
          'CORRELATION_ID_INJECTION',
        );
        return;
      }

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

      // Propagate server-controlled ids to every outgoing accepted/rejected message.
      ws.attemptId = attemptId;
      ws.correlationId = correlationId;

      // Ensure room broadcasts (game_over, etc.) carry the same correlation/attempt.
      const operationRoom = rooms.get(sessionId);
      if (operationRoom) {
        operationRoom.operationCorrelationId = correlationId;
        operationRoom.operationAttemptId = attemptId;
      }

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
        sendError(
          ws,
          'Too many moves, slow down',
          'rate_limit',
          { retryAfterMs: moveRL.retryAfterMs },
        );
        break;
      }

      const sessionRL = sessionMoveRateLimiter.check(sessionId);
      if (!sessionRL.allowed) {
        wsMoveRateLimitedTotal.inc({ scope: 'session' });
        await logThrottledMove('session', sessionRL.retryAfterMs);
        sendError(
          ws,
          'Too many moves in this match, slow down',
          'rate_limit',
          { retryAfterMs: sessionRL.retryAfterMs },
        );
        break;
      }

      const sessionUserRL = sessionUserMoveRateLimiter.check(sessionId, userId);
      if (!sessionUserRL.allowed) {
        wsMoveRateLimitedTotal.inc({ scope: 'session_user' });
        await logThrottledMove('session_user', sessionUserRL.retryAfterMs);
        sendError(
          ws,
          'Too many moves from this player in this match, slow down',
          'rate_limit',
          { retryAfterMs: sessionUserRL.retryAfterMs },
        );
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
    case 'resign': {
      // Ensure room broadcasts carry correlation/attempt for this operation.
      const operationRoom = rooms.get(message.payload.sessionId);
      if (operationRoom) {
        operationRoom.operationCorrelationId = ws.correlationId;
        operationRoom.operationAttemptId = ws.attemptId;
      }

      if (ws.userId) {
        const resignRL = resignRateLimiter.check(ws.userId);
        if (!resignRL.allowed) {
          sendError(
            ws,
            'Please wait before resigning again',
            'rate_limit',
            { retryAfterMs: resignRL.retryAfterMs },
          );
          break;
        }
      }
      await handleResign(ws, message.payload);
      break;
    }
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
