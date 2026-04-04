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
  isSpectator?: boolean;
  isAlive?: boolean;
  spectatorId?: string;
}

export interface GameRoom {
  sessionId: string;
  players: Map<string, AuthenticatedWebSocket>;
  spectators: Map<string, AuthenticatedWebSocket>;
  gameType: string;
  gameState: string;
  turnTimeLimitMs?: number;
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
