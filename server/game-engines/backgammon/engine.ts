import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from '../types';
import type { BackgammonState } from './types';
import {
  getPlayerColor,
  getConstrainedMoveChoices,
  canBearOff,
  isOpeningRollPending,
} from './board-utils';
import { validateMove as validate } from './validation';
import { createNewGame, applyMove as apply, getGameStatus } from './moves';

/** Backgammon game engine implementing the GameEngine interface */
export class BackgammonEngine implements GameEngine {
  gameType = 'backgammon';
  minPlayers = 2;
  maxPlayers = 2;

  createInitialState(): string {
    return JSON.stringify(createNewGame('', ''));
  }

  initializeWithPlayers(player1Id: string, player2Id: string): string {
    const state = createNewGame(player1Id, player2Id);

    // Identify bot players (IDs starting with 'bot-')
    const players = [player1Id, player2Id];
    const botPlayers = players.filter(id => id.startsWith('bot-'));
    if (botPlayers.length > 0) {
      state.botPlayers = botPlayers;
    }

    // Auto-play any initial bot turns
    if (botPlayers.length > 0 && this.isBotPlayer(state, state.players[state.currentTurn])) {
      return this.runBotTurns(state);
    }
    return JSON.stringify(state);
  }

  // ─── Bot AI ──────────────────────────────────────────────────────

  private isBotPlayer(state: BackgammonState, playerId: string): boolean {
    return state.botPlayers?.includes(playerId) ?? false;
  }

  private toMoveData(from: number, to: number): MoveData {
    return { type: 'move', from: String(from), to: String(to) };
  }

  /** Score a move based on backgammon strategy heuristics */
  private scoreBotMove(state: BackgammonState, playerColor: 'white' | 'black', from: number, to: number): number {
    let score = 0;
    const opponent = playerColor === 'white' ? -1 : 1;
    const bearOffPos = playerColor === 'white' ? 24 : -1;

    // Bearing off is always good
    if (to === bearOffPos) {
      score += 50;
      return score;
    }

    if (to < 0 || to > 23) return score;

    const targetCheckers = state.board[to];

    // Hitting a blot (opponent has exactly 1 checker): very valuable
    const isBlot = playerColor === 'white' ? targetCheckers === -1 : targetCheckers === 1;
    if (isBlot) {
      score += 30;
      // Extra value for hitting in our home board
      const inHome = playerColor === 'white' ? to >= 18 : to <= 5;
      if (inHome) score += 10;
    }

    // Making a point (landing where we already have 1 checker): valuable
    const ownCheckers = playerColor === 'white' ? targetCheckers : -targetCheckers;
    if (ownCheckers === 1) {
      score += 25; // makes a safe point (2 checkers)
      // Bonus for points in home board
      const inHome = playerColor === 'white' ? to >= 18 : to <= 5;
      if (inHome) score += 10;
      // Bonus for adjacent to existing points (prime building)
      for (const adj of [to - 1, to + 1]) {
        if (adj >= 0 && adj <= 23) {
          const adjOwn = playerColor === 'white' ? state.board[adj] : -state.board[adj];
          if (adjOwn >= 2) score += 8; // extending/connecting primes
        }
      }
    }

    // Landing on a safe point (≥2 own checkers): safe
    if (ownCheckers >= 2) {
      score += 5;
    }

    // Penalty for leaving a blot (moving away from a point with 2, leaving 1)
    const barPos = playerColor === 'white' ? -1 : 24;
    if (from !== barPos && from >= 0 && from <= 23) {
      const fromOwn = playerColor === 'white' ? state.board[from] : -state.board[from];
      if (fromOwn === 2) {
        // Moving will leave 1 checker (a blot) — risky
        score -= 15;
        // Extra penalty if blot is in opponent's home board
        const inDanger = playerColor === 'white' ? from <= 5 : from >= 18;
        if (inDanger) score -= 10;
      }
    }

    // Forward progress bonus
    const progress = playerColor === 'white' ? to - Math.max(from, 0) : Math.min(from, 23) - to;
    score += progress * 0.5;

    return score;
  }

  /** Generate a bot move for the current state */
  private generateBotMove(state: BackgammonState): MoveData {
    const playerColor = state.currentTurn;

    // Must roll phase
    if (state.mustRoll) {
      return { type: 'roll' };
    }

    // Must respond to doubling offer
    if (state.cubeOffered && state.cubeOfferedBy !== playerColor) {
      // Simple heuristic: accept if pip count is close or ahead
      return { type: 'accept_double' };
    }

    // Moving phase: pick best available move
    const validMoves = getConstrainedMoveChoices(state, playerColor)
      .map((choice) => this.toMoveData(choice.from, choice.to));

    if (validMoves.length === 0) {
      return { type: 'end_turn' };
    }

    // Score all valid moves and pick the best
    let bestMove = validMoves[0];
    let bestScore = -Infinity;

    for (const move of validMoves) {
      if (move.type === 'move' && move.from !== undefined && move.to !== undefined) {
        const from = parseInt(String(move.from), 10);
        const to = parseInt(String(move.to), 10);
        const moveScore = this.scoreBotMove(state, playerColor, from, to);
        if (moveScore > bestScore) {
          bestScore = moveScore;
          bestMove = move;
        }
      }
    }

    return bestMove;
  }

  /** Auto-play bot turns until a human player or game over */
  private runBotTurns(state: BackgammonState): string {
    const result = this.runBotLoop(state);
    return JSON.stringify(result.state);
  }

  /** Auto-play bot turns, accumulating events */
  private runBotTurnsWithEvents(state: BackgammonState, events: GameEvent[]): { stateJson: string; events: GameEvent[] } {
    const result = this.runBotLoop(state, events);
    return { stateJson: JSON.stringify(result.state), events: result.events };
  }

  /** Unified bot auto-play loop */
  private runBotLoop(state: BackgammonState, eventsList?: GameEvent[]): { state: BackgammonState; events: GameEvent[] } {
    let current = state;
    const allEvents: GameEvent[] = eventsList ? [...eventsList] : [];
    let iterations = 0;

    while (iterations < 200 && current.gamePhase !== 'finished' && this.isBotPlayer(current, current.players[current.currentTurn])) {
      const botMove = this.generateBotMove(current);
      const result = apply(JSON.stringify(current), current.players[current.currentTurn], botMove);
      if (!result.success) {
        console.warn('[Backgammon] Bot move failed', { turn: current.currentTurn, moveType: botMove.type, error: result.error });
        break;
      }
      current = JSON.parse(result.newState);
      allEvents.push(...result.events);
      iterations++;
    }

    if (iterations >= 200 && current.gamePhase !== 'finished') {
      console.warn('[Backgammon] Bot loop hit 200 iterations without game over');
    }

    return { state: current, events: allEvents };
  }

  validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
    try {
      const state: BackgammonState = JSON.parse(stateJson);
      return validate(state, playerId, move);
    } catch (error) {
      return { valid: false, error: 'Invalid game state', errorKey: 'backgammon.invalidState' };
    }
  }

  applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
    const result = apply(stateJson, playerId, move);
    if (!result.success) return result;

    // Auto-play any bot turns after this human move
    try {
      const state: BackgammonState = JSON.parse(result.newState);
      if (state.botPlayers && state.botPlayers.length > 0
        && state.gamePhase !== 'finished'
        && this.isBotPlayer(state, state.players[state.currentTurn])) {
        const botResult = this.runBotTurnsWithEvents(state, result.events);
        return { success: true, newState: botResult.stateJson, events: botResult.events };
      }
    } catch {
      // If parsing fails, return original result
    }
    return result;
  }

  getGameStatus(stateJson: string): GameStatus {
    return getGameStatus(stateJson);
  }

  getValidMoves(stateJson: string, playerId: string): MoveData[] {
    try {
      const state: BackgammonState = JSON.parse(stateJson);
      const playerColor = getPlayerColor(state, playerId);

      if (!playerColor || state.currentTurn !== playerColor) {
        // Can respond to double even if not your turn
        if (playerColor && state.cubeOffered && state.cubeOfferedBy !== playerColor) {
          return [{ type: 'accept_double' }, { type: 'decline_double' }];
        }
        return [];
      }

      if (state.cubeOffered) {
        return []; // Waiting for opponent to accept/decline
      }

      if (state.mustRoll) {
        const moves: MoveData[] = [{ type: 'roll' }];
        // Can double before rolling if you own cube or cube is centered
        if (!isOpeningRollPending(state) && state.doublingCube < 64 && (state.cubeOwner === null || state.cubeOwner === playerColor)) {
          moves.push({ type: 'double' });
        }
        return moves;
      }

      return getConstrainedMoveChoices(state, playerColor)
        .map((choice) => this.toMoveData(choice.from, choice.to));
    } catch {
      return [];
    }
  }

  getPlayerView(stateJson: string, playerId: string): PlayerView {
    try {
      const state: BackgammonState = JSON.parse(stateJson);
      const playerColor = getPlayerColor(state, playerId);
      const isMyTurn = playerColor === state.currentTurn;

      return {
        board: state.board,
        bar: state.bar,
        borneOff: state.borneOff,
        dice: state.dice,
        diceUsed: state.diceUsed,
        currentTurn: state.currentTurn,
        currentTurnPlayer: state.players[state.currentTurn],
        myColor: playerColor || 'spectator',
        isMyTurn: isMyTurn && playerColor !== null,
        gamePhase: state.gamePhase,
        mustRoll: state.mustRoll,
        doublingCube: state.doublingCube,
        cubeOwner: state.cubeOwner,
        cubeOffered: state.cubeOffered,
        cubeOfferedBy: state.cubeOfferedBy,
        validMoves: isMyTurn && playerColor
          ? getConstrainedMoveChoices(state, playerColor).map((choice) => this.toMoveData(choice.from, choice.to))
          : (playerColor && state.cubeOffered && state.cubeOfferedBy !== playerColor
            ? [{ type: 'accept_double' }, { type: 'decline_double' }] : []),
        players: state.players,
        canBearOff: playerColor ? canBearOff(state, playerColor) : false
      };
    } catch {
      return { board: null };
    }
  }
}
