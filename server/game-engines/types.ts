export interface GameEngine {
  gameType: string;
  minPlayers: number;
  maxPlayers: number;

  createInitialState(): string;
  initializeWithPlayers(...args: unknown[]): string;
  validateMove(state: string, playerId: string, move: MoveData): ValidationResult;
  applyMove(state: string, playerId: string, move: MoveData): ApplyMoveResult;
  getGameStatus(state: string): GameStatus;
  getValidMoves(state: string, playerId: string): MoveData[];
  getPlayerView(state: string, playerId: string): PlayerView;
}

export interface MoveData {
  type: string;
  from?: string;
  to?: string;
  piece?: string;
  promotion?: string;
  card?: string;
  tile?: string | object;
  dice?: number[];
  bid?: number;
  suit?: string;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorKey?: string;
}

export interface ApplyMoveResult {
  success: boolean;
  newState: string;
  events: GameEvent[];
  error?: string;
}

export interface GameEvent {
  type: 'move' | 'capture' | 'check' | 'checkmate' | 'draw' | 'win' | 'score' | 'turn_change' | 'game_over';
  data: Record<string, unknown>;
}

export interface GameStatus {
  isOver: boolean;
  winner?: string;
  winningTeam?: number;
  isDraw?: boolean;
  reason?: string;
  scores?: { [playerId: string]: number };
  teamScores?: { [key: string]: number };
}

export interface PlayerView {
  board?: unknown;
  hand?: unknown[];
  validMoves?: unknown;
  scores?: { [playerId: string]: number };
  currentTurn?: string;
  gamePhase?: string;
  [key: string]: unknown;
}

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

export interface JoinGamePayload {
  sessionId: string;
  token: string;
}

export interface MakeMovePayload {
  sessionId: string;
  move: MoveData;
  expectedTurn?: number;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface ChatPayload {
  sessionId: string;
  message: string;
}

export interface SpectatePayload {
  sessionId: string;
  token?: string;
}

export interface SendGiftPayload {
  sessionId: string;
  recipientId: string;
  giftItemId: string;
  quantity: number;
  message?: string;
}
