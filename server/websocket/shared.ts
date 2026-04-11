import { WebSocket } from "ws";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface JwtPayload {
  id: string;
  role?: string;
  username?: string;
  fp?: string;
}

export interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  username?: string;
  role?: string;
  userAgent?: string;
  clientIp?: string;
  tokenFingerprint?: string;
  isAlive?: boolean;
  activeChallengeId?: string;
  activeChallengeRole?: "player" | "spectator";
}

export interface GameRoomState {
  challengeId: string;
  gameType: string;
  gameState: string;
  currentTurn: string;
  totalMoves: number;
  status: string;
  spectatorCount: number;
}

/** Map of userId -> Set of authenticated WebSocket connections */
export const clients = new Map<string, Set<AuthenticatedSocket>>();

/** Voice chat rooms for WebRTC signaling: matchId -> Map of userId -> socket */
export const voiceRooms = new Map<string, Map<string, AuthenticatedSocket>>();

/** Challenge game rooms with cached state for late joiners */
export const challengeGameRooms = new Map<string, {
  players: Map<string, AuthenticatedSocket>;
  spectators: Map<string, AuthenticatedSocket>;
  currentState?: GameRoomState;
}>();

/** Admin clients for real-time admin notifications */
export const adminClients = new Set<AuthenticatedSocket>();
