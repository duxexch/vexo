import type { MoveData, ValidationResult } from '../types';
import type { BackgammonState } from './types';
import { getPlayerColor, canBearOff, isHighestCheckerInHome, getAllValidMoves } from './board-utils';

/** Validate a player's move against the current game state */
export function validateMove(state: BackgammonState, playerId: string, move: MoveData): ValidationResult {
  const playerColor = getPlayerColor(state, playerId);
  if (!playerColor) {
    return { valid: false, error: 'You are not a player in this game', errorKey: 'backgammon.notPlayer' };
  }

  if (state.currentTurn !== playerColor) {
    return { valid: false, error: 'It is not your turn', errorKey: 'backgammon.notYourTurn' };
  }

  if (move.type === 'roll') {
    if (!state.mustRoll) {
      return { valid: false, error: 'You have already rolled', errorKey: 'backgammon.alreadyRolled' };
    }
    if (state.cubeOffered) {
      return { valid: false, error: 'Must respond to doubling offer first', errorKey: 'backgammon.mustRespondDouble' };
    }
    return { valid: true };
  }

  // Doubling cube actions
  if (move.type === 'double') {
    if (state.cubeOffered) {
      return { valid: false, error: 'Double already offered', errorKey: 'backgammon.doubleAlreadyOffered' };
    }
    if (!state.mustRoll) {
      return { valid: false, error: 'Can only double before rolling', errorKey: 'backgammon.doubleAfterRoll' };
    }
    // Can only double if you own the cube or cube is in center (null)
    if (state.cubeOwner !== null && state.cubeOwner !== playerColor) {
      return { valid: false, error: 'You do not own the doubling cube', errorKey: 'backgammon.notCubeOwner' };
    }
    if (state.doublingCube >= 64) {
      return { valid: false, error: 'Maximum doubling level reached', errorKey: 'backgammon.maxDouble' };
    }
    return { valid: true };
  }

  if (move.type === 'accept_double') {
    if (!state.cubeOffered || state.cubeOfferedBy === playerColor) {
      return { valid: false, error: 'No doubling offer to accept', errorKey: 'backgammon.noDoubleToAccept' };
    }
    return { valid: true };
  }

  if (move.type === 'decline_double') {
    if (!state.cubeOffered || state.cubeOfferedBy === playerColor) {
      return { valid: false, error: 'No doubling offer to decline', errorKey: 'backgammon.noDoubleToDecline' };
    }
    return { valid: true };
  }

  if (move.type === 'move') {
    if (state.mustRoll) {
      return { valid: false, error: 'You must roll the dice first', errorKey: 'backgammon.mustRoll' };
    }

    const from = typeof move.from === 'string' ? parseInt(move.from, 10) : Number(move.from);
    const to = typeof move.to === 'string' ? parseInt(move.to, 10) : Number(move.to);
    
    if (isNaN(from) || isNaN(to)) {
      return { valid: false, error: 'Invalid move coordinates', errorKey: 'backgammon.invalidCoords' };
    }

    const validation = validateSingleMove(state, playerColor, from, to);
    if (!validation.valid) {
      return validation;
    }

    return { valid: true };
  }

  if (move.type === 'end_turn') {
    if (state.mustRoll) {
      return { valid: false, error: 'You must roll first', errorKey: 'backgammon.mustRoll' };
    }
    
    const availableMoves = getAllValidMoves(state, playerColor);
    if (availableMoves.length > 0) {
      return { valid: false, error: 'You still have valid moves available', errorKey: 'backgammon.hasValidMoves' };
    }
    
    return { valid: true };
  }

  return { valid: false, error: 'Invalid move type', errorKey: 'backgammon.invalidMoveType' };
}

/** Validate a single checker move (from/to positions) */
export function validateSingleMove(state: BackgammonState, playerColor: 'white' | 'black', from: number, to: number): ValidationResult {
  const direction = playerColor === 'white' ? 1 : -1;
  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;

  if (from === barPosition) {
    const barCount = state.bar[playerColor];
    if (barCount === 0) {
      return { valid: false, error: 'No checkers on the bar', errorKey: 'backgammon.noCheckersOnBar' };
    }
  } else {
    if (from < 0 || from > 23) {
      return { valid: false, error: 'Invalid from position', errorKey: 'backgammon.invalidFrom' };
    }
    
    const checkerValue = state.board[from];
    const hasOwnChecker = playerColor === 'white' ? checkerValue > 0 : checkerValue < 0;
    if (!hasOwnChecker) {
      return { valid: false, error: 'No checker at that position', errorKey: 'backgammon.noChecker' };
    }

    if (state.bar[playerColor] > 0) {
      return { valid: false, error: 'Must move checkers from bar first', errorKey: 'backgammon.mustMoveFromBar' };
    }
  }

  const isBearingOff = to === bearOffPosition;
  
  if (isBearingOff) {
    if (!canBearOff(state, playerColor)) {
      return { valid: false, error: 'Cannot bear off yet', errorKey: 'backgammon.cannotBearOff' };
    }
  } else {
    if (to < 0 || to > 23) {
      return { valid: false, error: 'Invalid to position', errorKey: 'backgammon.invalidTo' };
    }
    
    const targetValue = state.board[to];
    const blockedByOpponent = playerColor === 'white' ? targetValue < -1 : targetValue > 1;
    if (blockedByOpponent) {
      return { valid: false, error: 'Point is blocked by opponent', errorKey: 'backgammon.pointBlocked' };
    }
  }

  let distance: number;
  if (from === barPosition) {
    distance = playerColor === 'white' ? to + 1 : 24 - to;
  } else if (isBearingOff) {
    distance = playerColor === 'white' ? 24 - from : from + 1;
  } else {
    distance = Math.abs(to - from);
    const correctDirection = playerColor === 'white' ? to > from : to < from;
    if (!correctDirection) {
      return { valid: false, error: 'Must move in correct direction', errorKey: 'backgammon.wrongDirection' };
    }
  }

  const unusedDice = state.dice.filter((d, i) => !state.diceUsed[i]);
  const hasMatchingDie = unusedDice.includes(distance);
  
  if (!hasMatchingDie) {
    if (isBearingOff) {
      const highestDie = Math.max(...unusedDice);
      const maxDistance = playerColor === 'white' ? 24 - from : from + 1;
      const isHighestChecker = isHighestCheckerInHome(state, playerColor, from);
      
      if (!(highestDie > maxDistance && isHighestChecker)) {
        return { valid: false, error: 'No matching die for this move', errorKey: 'backgammon.noDieMatch' };
      }
    } else {
      return { valid: false, error: 'No matching die for this move', errorKey: 'backgammon.noDieMatch' };
    }
  }

  return { valid: true };
}
