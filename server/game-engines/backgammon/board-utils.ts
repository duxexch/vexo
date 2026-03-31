import type { MoveData } from '../types';
import type { BackgammonState } from './types';

/** Get the color assigned to a player ID */
export function getPlayerColor(state: BackgammonState, playerId: string): 'white' | 'black' | null {
  if (state.players.white === playerId) return 'white';
  if (state.players.black === playerId) return 'black';
  return null;
}

/** Check if a player can bear off (all checkers in home board) */
export function canBearOff(state: BackgammonState, playerColor: 'white' | 'black'): boolean {
  if (state.bar[playerColor] > 0) return false;

  if (playerColor === 'white') {
    for (let i = 0; i < 18; i++) {
      if (state.board[i] > 0) return false;
    }
  } else {
    for (let i = 6; i < 24; i++) {
      if (state.board[i] < 0) return false;
    }
  }
  return true;
}

/** Check if a checker is the highest (farthest from bearing off) in home board */
export function isHighestCheckerInHome(state: BackgammonState, playerColor: 'white' | 'black', fromPoint: number): boolean {
  if (playerColor === 'white') {
    for (let i = 18; i < fromPoint; i++) {
      if (state.board[i] > 0) return false;
    }
    return true;
  } else {
    for (let i = 5; i > fromPoint; i--) {
      if (state.board[i] < 0) return false;
    }
    return true;
  }
}

/** Check if a player has checkers in the opponent's home board */
export function hasCheckerInOpponentHome(state: BackgammonState, playerColor: 'white' | 'black'): boolean {
  if (playerColor === 'white') {
    for (let i = 18; i <= 23; i++) {
      if (state.board[i] > 0) return true;
    }
  } else {
    for (let i = 0; i <= 5; i++) {
      if (state.board[i] < 0) return true;
    }
  }
  return false;
}

/** Get all valid moves for a player given the current board and unused dice */
export function getAllValidMoves(state: BackgammonState, playerColor: 'white' | 'black'): MoveData[] {
  const moves: MoveData[] = [];
  const direction = playerColor === 'white' ? 1 : -1;
  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;
  const unusedDice = state.dice.filter((_, i) => !state.diceUsed[i]);

  if (unusedDice.length === 0) {
    return [];
  }

  // Must move from bar first
  if (state.bar[playerColor] > 0) {
    for (const die of new Set(unusedDice)) {
      const to = playerColor === 'white' ? die - 1 : 24 - die;
      if (to >= 0 && to <= 23) {
        const targetValue = state.board[to];
        const blocked = playerColor === 'white' ? targetValue < -1 : targetValue > 1;
        if (!blocked) {
          moves.push({ type: 'move', from: String(barPosition), to: String(to) });
        }
      }
    }
    return moves;
  }

  // Normal moves from board points
  for (let point = 0; point < 24; point++) {
    const checkerValue = state.board[point];
    const hasChecker = playerColor === 'white' ? checkerValue > 0 : checkerValue < 0;
    
    if (hasChecker) {
      for (const die of new Set(unusedDice)) {
        const to = point + (die * direction);
        
        if (to >= 0 && to <= 23) {
          const targetValue = state.board[to];
          const blocked = playerColor === 'white' ? targetValue < -1 : targetValue > 1;
          if (!blocked) {
            moves.push({ type: 'move', from: String(point), to: String(to) });
          }
        }
      }

      // Bear off moves
      if (canBearOff(state, playerColor)) {
        const distanceToOff = playerColor === 'white' ? 24 - point : point + 1;
        
        for (const die of new Set(unusedDice)) {
          if (die === distanceToOff) {
            moves.push({ type: 'move', from: String(point), to: String(bearOffPosition) });
          } else if (die > distanceToOff && isHighestCheckerInHome(state, playerColor, point)) {
            moves.push({ type: 'move', from: String(point), to: String(bearOffPosition) });
            break;
          }
        }
      }
    }
  }

  return moves;
}
