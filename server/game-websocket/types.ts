import { WebSocket } from 'ws';

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  role?: string;
  userAgent?: string;
  tokenFingerprint?: string;
  sessionId?: string;
  /**
   * Cached parent challenge id for the active session. Set on join so
   * downstream handlers (e.g. chat) can mirror events to the Socket.IO
   * `challenge:<id>` room without an extra DB hit per message.
   */
  challengeId?: string;
  isSpectator?: boolean;
  isAlive?: boolean;
  spectatorId?: string;

  /**
   * Server-controlled correlation id for the currently processed inbound
   * WS message, propagated to outgoing accepted/rejected messages.
   * Set/reset by server/game-websocket/index.ts message loop.
   */
  correlationId?: string;

  /**
   * Server-controlled physical attempt id for tracing (not for idempotency).
   * Set/reset by server/game-websocket/index.ts message loop.
   */
  attemptId?: string;
}

export interface GameRoom {
  sessionId: string;
  players: Map<string, AuthenticatedWebSocket>;
  spectators: Map<string, AuthenticatedWebSocket>;
  gameType: string;
  gameState: string;
  turnTimeLimitMs?: number;

  /**
   * Operational correlation/attempt ids for server-emitted broadcast events.
   * Set by the handler that is servicing an inbound WS message (or by the
   * timer/auto-move path) so every broadcast can carry a consistent
   * correlationId for incident traceability.
   */
  operationCorrelationId?: string;
  operationAttemptId?: string;

  /**
   * Per-player AI think-time multiplier (e.g. 1 for Normal, 0.65 for Fast,
   * 0.4 for Turbo). Reported by clients via `set_speed_mode`. The effective
   * delay used for AI moves is the minimum across all players in the room
   * (favoring whichever human prefers a snappier pace).
   */
  playerSpeedMultipliers?: Map<string, number>;
}

// === Shared mutable state ===
export const rooms: Map<string, GameRoom> = new Map();
export const userConnections: Map<string, AuthenticatedWebSocket> = new Map();

// Reconnection grace period tracking
export const RECONNECT_GRACE_MS = 60000; // 60 seconds to reconnect
export const disconnectedPlayers: Map<string, { sessionId: string; userId: string; timer: NodeJS.Timeout }> = new Map();

// Turn timer tracking
export const TURN_TIMEOUT_MS = 30000; // Fixed 30 seconds per turn across challenge games
export const turnTimers: Map<string, NodeJS.Timeout> = new Map();

// Track sessions that are already being processed for forfeit to prevent double execution
export const forfeitingSessionsLock = new Set<string>();
