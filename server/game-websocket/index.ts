import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { moveRateLimiter, resignRateLimiter } from '../lib/rate-limiter';
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
import { createGameWsProtocolError, validateGameMessage, type ValidatedGameMessage } from './validation';

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
    case 'make_move':
      if (ws.userId) {
        const moveRL = moveRateLimiter.check(ws.userId);
        if (!moveRL.allowed) {
          send(ws, { type: 'error', payload: { error: 'Too many moves, slow down', code: 'rate_limit', retryAfterMs: moveRL.retryAfterMs } });
          break;
        }
      }
      await handleMakeMove(ws, message.payload);
      break;
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
    default:
      sendError(ws, 'Unknown message type', 'unknown_type');
  }
}
