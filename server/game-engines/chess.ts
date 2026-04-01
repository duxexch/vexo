import { Chess } from 'chess.js';
import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from './types';

interface ChessHistoryEntry {
  san: string;
  from: string;
  to: string;
  color: 'w' | 'b';
  captured?: string;
}

interface ChessState {
  fen: string;
  history: ChessHistoryEntry[];
  players: {
    white: string;
    black: string;
  };
  currentTurn: 'white' | 'black';
  startTime: number;
  lastMoveTime: number;
  whiteTimeMs: number;
  blackTimeMs: number;
  incrementMs: number;
  capturedPieces: { white: string[]; black: string[] };
  lastMove: { from: string; to: string } | null;
}

interface ChessInitOptions {
  timeMs?: number;
  incrementMs?: number;
}

const DEFAULT_TIME_MS = 600000; // 10 minutes
const DEFAULT_INCREMENT_MS = 0;

export class ChessEngine implements GameEngine {
  gameType = 'chess';
  minPlayers = 2;
  maxPlayers = 2;

  private buildInitialState(player1Id = '', player2Id = '', options?: ChessInitOptions): ChessState {
    const configuredTimeMs = Math.max(1000, options?.timeMs ?? DEFAULT_TIME_MS);
    const configuredIncrementMs = Math.max(0, options?.incrementMs ?? DEFAULT_INCREMENT_MS);
    return {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      history: [],
      players: { white: player1Id, black: player2Id },
      currentTurn: 'white',
      startTime: Date.now(),
      lastMoveTime: Date.now(),
      whiteTimeMs: configuredTimeMs,
      blackTimeMs: configuredTimeMs,
      incrementMs: configuredIncrementMs,
      capturedPieces: { white: [], black: [] },
      lastMove: null
    };
  }

  /** Ensure backward-compat for old states missing new fields */
  private normalizeState(state: Partial<ChessState> & { fen: string; players: { white: string; black: string } }): ChessState {
    return {
      fen: state.fen,
      history: Array.isArray(state.history)
        ? state.history.map((h: any) =>
          typeof h === 'string'
            ? { san: h, from: '', to: '', color: 'w' as const }
            : h
        )
        : [],
      players: state.players,
      currentTurn: state.currentTurn ?? 'white',
      startTime: state.startTime ?? Date.now(),
      lastMoveTime: state.lastMoveTime ?? Date.now(),
      whiteTimeMs: state.whiteTimeMs ?? DEFAULT_TIME_MS,
      blackTimeMs: state.blackTimeMs ?? DEFAULT_TIME_MS,
      incrementMs: state.incrementMs ?? DEFAULT_INCREMENT_MS,
      capturedPieces: state.capturedPieces ?? { white: [], black: [] },
      lastMove: state.lastMove ?? null
    };
  }

  createInitialState(): string {
    return JSON.stringify(this.buildInitialState());
  }

  initializeWithPlayers(player1Id: string, player2Id: string, options?: ChessInitOptions): string {
    return JSON.stringify(this.buildInitialState(player1Id, player2Id, options));
  }

  validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
    try {
      const raw = JSON.parse(stateJson);
      const state = this.normalizeState(raw);
      const chess = new Chess(state.fen);

      const playerColor = state.players.white === playerId ? 'white'
        : state.players.black === playerId ? 'black'
          : null;

      if (!playerColor) {
        return { valid: false, error: 'You are not a player in this game', errorKey: 'chess.notPlayer' };
      }
      if (state.currentTurn !== playerColor) {
        return { valid: false, error: 'It is not your turn', errorKey: 'chess.notYourTurn' };
      }

      // Check if player ran out of time
      const now = Date.now();
      const elapsed = now - state.lastMoveTime;
      const remainingMs = playerColor === 'white'
        ? state.whiteTimeMs - elapsed
        : state.blackTimeMs - elapsed;
      if (remainingMs <= 0) {
        return { valid: false, error: 'Time expired', errorKey: 'chess.timeExpired' };
      }

      const result = chess.move({
        from: move.from!,
        to: move.to!,
        promotion: move.promotion
      });

      if (!result) {
        return { valid: false, error: 'Invalid move', errorKey: 'chess.invalidMove' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid game state', errorKey: 'chess.invalidState' };
    }
  }

  applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
    try {
      const raw = JSON.parse(stateJson);
      const state = this.normalizeState(raw);
      const chess = new Chess(state.fen);

      const result = chess.move({
        from: move.from!,
        to: move.to!,
        promotion: move.promotion
      });

      if (!result) {
        return { success: false, newState: stateJson, events: [], error: 'Invalid move' };
      }

      // --- Timer management ---
      const now = Date.now();
      const elapsed = now - state.lastMoveTime;
      if (state.currentTurn === 'white') {
        state.whiteTimeMs = Math.max(0, state.whiteTimeMs - elapsed + state.incrementMs);
      } else {
        state.blackTimeMs = Math.max(0, state.blackTimeMs - elapsed + state.incrementMs);
      }

      // --- Track captured pieces ---
      if (result.captured) {
        if (state.currentTurn === 'white') {
          state.capturedPieces.white.push(result.captured);
        } else {
          state.capturedPieces.black.push(result.captured);
        }
      }

      // --- Build events ---
      const events: GameEvent[] = [];

      events.push({
        type: 'move',
        data: {
          from: result.from,
          to: result.to,
          piece: result.piece,
          san: result.san,
          captured: result.captured,
          color: result.color
        }
      });

      if (result.captured) {
        events.push({
          type: 'capture',
          data: { piece: result.captured, square: result.to }
        });
      }

      if (chess.isCheck()) {
        events.push({
          type: 'check',
          data: { color: chess.turn() === 'w' ? 'white' : 'black' }
        });
      }

      if (chess.isCheckmate()) {
        const winner = state.currentTurn === 'white' ? state.players.white : state.players.black;
        const loser = winner === state.players.white ? state.players.black : state.players.white;
        events.push({ type: 'checkmate', data: { winner, loser } });
        events.push({ type: 'game_over', data: { winner, reason: 'checkmate' } });
      }

      if (chess.isDraw()) {
        const reason = this.getDrawReason(chess);
        events.push({ type: 'draw', data: { reason } });
        events.push({ type: 'game_over', data: { isDraw: true, reason } });
      }

      if (!chess.isGameOver()) {
        events.push({
          type: 'turn_change',
          data: {
            nextTurn: state.currentTurn === 'white' ? 'black' : 'white',
            nextPlayer: state.currentTurn === 'white' ? state.players.black : state.players.white
          }
        });
      }

      // --- Build new state ---
      const newState: ChessState = {
        ...state,
        fen: chess.fen(),
        history: [...state.history, {
          san: result.san,
          from: result.from,
          to: result.to,
          color: result.color,
          captured: result.captured
        }],
        currentTurn: state.currentTurn === 'white' ? 'black' : 'white',
        lastMoveTime: now,
        lastMove: { from: result.from, to: result.to }
      };

      return { success: true, newState: JSON.stringify(newState), events };
    } catch {
      return { success: false, newState: stateJson, events: [], error: 'Failed to apply move' };
    }
  }

  private getDrawReason(chess: Chess): string {
    if (chess.isStalemate()) return 'stalemate';
    if (chess.isThreefoldRepetition()) return 'threefold_repetition';
    if (chess.isInsufficientMaterial()) return 'insufficient_material';
    if (chess.isDraw()) return 'fifty_move_rule';
    return 'draw';
  }

  getGameStatus(stateJson: string): GameStatus {
    try {
      const raw = JSON.parse(stateJson);
      const state = this.normalizeState(raw);
      const chess = new Chess(state.fen);

      if (chess.isCheckmate()) {
        // The player whose turn it is in the FEN is in checkmate → the OTHER player won
        // state.currentTurn reflects who SHOULD move next, but after applyMove it's already toggled
        // So the winner is the player who just moved = opposite of currentTurn
        const winner = state.currentTurn === 'white' ? state.players.black : state.players.white;
        return { isOver: true, winner, reason: 'checkmate' };
      }

      if (chess.isDraw()) {
        return { isOver: true, isDraw: true, reason: this.getDrawReason(chess) };
      }

      // Check for flag (time expired)
      const now = Date.now();
      const elapsed = now - state.lastMoveTime;
      if (state.currentTurn === 'white' && state.whiteTimeMs - elapsed <= 0) {
        return { isOver: true, winner: state.players.black, reason: 'timeout' };
      }
      if (state.currentTurn === 'black' && state.blackTimeMs - elapsed <= 0) {
        return { isOver: true, winner: state.players.white, reason: 'timeout' };
      }

      return { isOver: false };
    } catch {
      return { isOver: false };
    }
  }

  getValidMoves(stateJson: string, playerId: string): MoveData[] {
    try {
      const raw = JSON.parse(stateJson);
      const state = this.normalizeState(raw);
      const chess = new Chess(state.fen);

      const playerColor = state.players.white === playerId ? 'white'
        : state.players.black === playerId ? 'black'
          : null;

      if (!playerColor || state.currentTurn !== playerColor) return [];

      return chess.moves({ verbose: true }).map(m => ({
        type: 'move',
        from: m.from,
        to: m.to,
        piece: m.piece,
        promotion: m.promotion
      }));
    } catch {
      return [];
    }
  }

  getPlayerView(stateJson: string, playerId: string): PlayerView {
    try {
      const raw = JSON.parse(stateJson);
      const state = this.normalizeState(raw);
      const chess = new Chess(state.fen);

      const playerColor = state.players.white === playerId ? 'w'
        : state.players.black === playerId ? 'b'
          : null;

      const isMyTurn = playerColor
        ? (playerColor === 'w' && state.currentTurn === 'white') ||
        (playerColor === 'b' && state.currentTurn === 'black')
        : false;

      // Valid moves as "e2e4" strings
      const validMoves: string[] = isMyTurn
        ? chess.moves({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ''}`)
        : [];

      // Build moveHistory in the format the client expects
      const moveHistory = state.history.map((h, i) => ({
        notation: h.san,
        player: h.color,
        moveNumber: Math.floor(i / 2) + 1
      }));

      // Calculate real-time remaining time
      const now = Date.now();
      const elapsed = now - state.lastMoveTime;
      let whiteTimeMs = state.whiteTimeMs;
      let blackTimeMs = state.blackTimeMs;
      if (!chess.isGameOver()) {
        if (state.currentTurn === 'white') {
          whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
        } else {
          blackTimeMs = Math.max(0, blackTimeMs - elapsed);
        }
      }

      return {
        fen: state.fen,
        currentTurn: state.currentTurn === 'white' ? 'w' : 'b',
        currentTurnPlayer: state.currentTurn === 'white' ? state.players.white : state.players.black,
        myColor: playerColor || 'spectator',
        isMyTurn,
        isCheck: chess.isCheck(),
        isCheckmate: chess.isCheckmate(),
        isStalemate: chess.isStalemate(),
        isDraw: chess.isDraw(),
        isGameOver: chess.isGameOver(),
        validMoves: validMoves as unknown as MoveData[],
        lastMove: state.lastMove,
        capturedPieces: state.capturedPieces,
        moveHistory,
        whiteTime: Math.ceil(whiteTimeMs / 1000),
        blackTime: Math.ceil(blackTimeMs / 1000),
        players: state.players,
        board: this.fenToBoard(state.fen),
        history: state.history.map(h => h.san)
      };
    } catch {
      return { board: null };
    }
  }

  private fenToBoard(fen: string): string[][] {
    const board: string[][] = [];
    const rows = fen.split(' ')[0].split('/');
    for (const row of rows) {
      const boardRow: string[] = [];
      for (const char of row) {
        if (isNaN(parseInt(char))) {
          boardRow.push(char);
        } else {
          for (let i = 0; i < parseInt(char); i++) boardRow.push('');
        }
      }
      board.push(boardRow);
    }
    return board;
  }
}

export const chessEngine = new ChessEngine();
