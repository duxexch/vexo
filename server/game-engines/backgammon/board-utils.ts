import type { MoveData } from '../types';
import type { BackgammonState } from './types';

export interface ConstrainedBackgammonMove {
  from: number;
  to: number;
  die: number;
}

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
    // White's opponent home is points 0..5.
    for (let i = 0; i <= 5; i++) {
      if (state.board[i] > 0) return true;
    }
  } else {
    // Black's opponent home is points 18..23.
    for (let i = 18; i <= 23; i++) {
      if (state.board[i] < 0) return true;
    }
  }
  return false;
}

export function isOpeningRollPending(state: BackgammonState): boolean {
  if (!state.openingRoll) {
    return false;
  }

  return !state.openingRoll.resolved;
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

function parseMoveCoordinates(move: MoveData): { from: number; to: number } | null {
  const from = typeof move.from === 'string' ? parseInt(move.from, 10) : Number(move.from);
  const to = typeof move.to === 'string' ? parseInt(move.to, 10) : Number(move.to);

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }

  return { from, to };
}

function getUnusedDiceValues(state: BackgammonState): number[] {
  return state.dice.filter((_, index) => !state.diceUsed[index]);
}

function getMoveDistance(playerColor: 'white' | 'black', from: number, to: number): number {
  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;

  if (from === barPosition) {
    return playerColor === 'white' ? to + 1 : 24 - to;
  }

  if (to === bearOffPosition) {
    return playerColor === 'white' ? 24 - from : from + 1;
  }

  return Math.abs(to - from);
}

function getDieCandidatesForMove(
  state: BackgammonState,
  playerColor: 'white' | 'black',
  from: number,
  to: number,
): number[] {
  const unusedDice = getUnusedDiceValues(state);
  if (unusedDice.length === 0) {
    return [];
  }

  const bearOffPosition = playerColor === 'white' ? 24 : -1;
  const distance = getMoveDistance(playerColor, from, to);
  const exact = Array.from(new Set(unusedDice.filter((die) => die === distance)));

  if (exact.length > 0) {
    return exact;
  }

  if (to === bearOffPosition && canBearOff(state, playerColor) && from >= 0 && from <= 23 && isHighestCheckerInHome(state, playerColor, from)) {
    return Array.from(new Set(unusedDice.filter((die) => die > distance))).sort((a, b) => a - b);
  }

  return [];
}

function consumeDieValue(state: BackgammonState, dieValue: number): boolean {
  const dieIndex = state.dice.findIndex((die, index) => !state.diceUsed[index] && die === dieValue);
  if (dieIndex === -1) {
    return false;
  }

  state.diceUsed[dieIndex] = true;
  return true;
}

function simulateCandidateMove(
  state: BackgammonState,
  playerColor: 'white' | 'black',
  candidate: ConstrainedBackgammonMove,
): BackgammonState | null {
  const next = structuredClone(state);
  if (!consumeDieValue(next, candidate.die)) {
    return null;
  }

  const checkerValue = playerColor === 'white' ? 1 : -1;
  const opponentColor = playerColor === 'white' ? 'black' : 'white';
  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;

  if (candidate.from === barPosition) {
    if (next.bar[playerColor] <= 0) {
      return null;
    }
    next.bar[playerColor] -= 1;
  } else {
    if (candidate.from < 0 || candidate.from > 23) {
      return null;
    }

    const source = next.board[candidate.from];
    const hasOwnChecker = playerColor === 'white' ? source > 0 : source < 0;
    if (!hasOwnChecker) {
      return null;
    }

    next.board[candidate.from] -= checkerValue;
  }

  if (candidate.to === bearOffPosition) {
    next.borneOff[playerColor] += 1;
    return next;
  }

  if (candidate.to < 0 || candidate.to > 23) {
    return null;
  }

  const targetValue = next.board[candidate.to];
  const isHit = playerColor === 'white' ? targetValue === -1 : targetValue === 1;

  if (isHit) {
    next.board[candidate.to] = checkerValue;
    next.bar[opponentColor] += 1;
  } else {
    next.board[candidate.to] += checkerValue;
  }

  return next;
}

function listUnconstrainedCandidates(state: BackgammonState, playerColor: 'white' | 'black'): ConstrainedBackgammonMove[] {
  const rawMoves = getAllValidMoves(state, playerColor);
  const seen = new Set<string>();
  const candidates: ConstrainedBackgammonMove[] = [];

  for (const move of rawMoves) {
    const parsed = parseMoveCoordinates(move);
    if (!parsed) {
      continue;
    }

    const dieCandidates = getDieCandidatesForMove(state, playerColor, parsed.from, parsed.to);
    for (const die of dieCandidates) {
      const key = `${parsed.from}:${parsed.to}:${die}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({ from: parsed.from, to: parsed.to, die });
    }
  }

  return candidates;
}

function buildSearchKey(state: BackgammonState, playerColor: 'white' | 'black'): string {
  return [
    playerColor,
    state.board.join(','),
    `${state.bar.white},${state.bar.black}`,
    `${state.borneOff.white},${state.borneOff.black}`,
    state.dice.map((die, index) => `${die}:${state.diceUsed[index] ? 1 : 0}`).join(','),
  ].join('|');
}

function maxMovesFromState(
  state: BackgammonState,
  playerColor: 'white' | 'black',
  memo: Map<string, number>,
): number {
  const key = buildSearchKey(state, playerColor);
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const candidates = listUnconstrainedCandidates(state, playerColor);
  if (candidates.length === 0) {
    memo.set(key, 0);
    return 0;
  }

  let best = 0;
  for (const candidate of candidates) {
    const next = simulateCandidateMove(state, playerColor, candidate);
    if (!next) {
      continue;
    }

    const branch = 1 + maxMovesFromState(next, playerColor, memo);
    if (branch > best) {
      best = branch;
    }
  }

  memo.set(key, best);
  return best;
}

export function getConstrainedMoveChoices(state: BackgammonState, playerColor: 'white' | 'black'): ConstrainedBackgammonMove[] {
  const candidates = listUnconstrainedCandidates(state, playerColor);
  if (candidates.length === 0) {
    return [];
  }

  const memo = new Map<string, number>();
  const maxTotalMoves = maxMovesFromState(state, playerColor, memo);

  let constrained = candidates.filter((candidate) => {
    const next = simulateCandidateMove(state, playerColor, candidate);
    if (!next) {
      return false;
    }

    return 1 + maxMovesFromState(next, playerColor, memo) === maxTotalMoves;
  });

  const uniqueUnusedDice = Array.from(new Set(getUnusedDiceValues(state)));
  if (maxTotalMoves === 1 && uniqueUnusedDice.length === 2) {
    const playableDice = Array.from(new Set(candidates.map((candidate) => candidate.die)));
    if (playableDice.length > 1) {
      const higherDie = Math.max(...playableDice);
      constrained = constrained.filter((candidate) => candidate.die === higherDie);
    }
  }

  return constrained;
}

export function selectConstrainedDieValue(
  state: BackgammonState,
  playerColor: 'white' | 'black',
  from: number,
  to: number,
): number | null {
  const constrained = getConstrainedMoveChoices(state, playerColor);
  const match = constrained.find((candidate) => candidate.from === from && candidate.to === to);
  return match?.die ?? null;
}
