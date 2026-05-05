import type { DominoTile, DominoState } from './types';
import { shuffleSecure } from '../../lib/game-utils';

interface DominoIntegrityIssue {
  code: string;
  message: string;
}

const DOMINO_MIN_PIP = 0;
const DOMINO_MAX_PIP = 6;
const DOMINO_TOTAL_TILES = 28;

function canonicalTileId(tile: DominoTile): string {
  const low = Math.min(tile.left, tile.right);
  const high = Math.max(tile.left, tile.right);
  return `${low}-${high}`;
}

function isValidTileValue(value: number): boolean {
  return Number.isInteger(value) && value >= DOMINO_MIN_PIP && value <= DOMINO_MAX_PIP;
}

function validateTileShape(tile: DominoTile, source: string): DominoIntegrityIssue | null {
  if (!Number.isFinite(tile.left) || !Number.isFinite(tile.right)) {
    return { code: 'invalid_tile_shape', message: `Tile in ${source} has non-numeric values` };
  }

  if (!isValidTileValue(tile.left) || !isValidTileValue(tile.right)) {
    return { code: 'invalid_tile_value', message: `Tile in ${source} is outside 0-6 range` };
  }

  if (typeof tile.id === 'string' && tile.id.length > 0) {
    const expectedId = canonicalTileId(tile);
    if (tile.id !== expectedId) {
      return {
        code: 'invalid_tile_id',
        message: `Tile id mismatch in ${source}. Expected ${expectedId}, got ${tile.id}`,
      };
    }
  }

  return null;
}

function verifyBoardChain(board: DominoTile[]): DominoIntegrityIssue | null {
  if (board.length <= 1) {
    return null;
  }

  for (let i = 0; i < board.length - 1; i += 1) {
    const current = board[i];
    const next = board[i + 1];
    if (current.right !== next.left) {
      return {
        code: 'broken_board_chain',
        message: `Board chain break between index ${i} and ${i + 1}`,
      };
    }
  }

  return null;
}

function getCanonicalTileId(tile: DominoTile): string {
  return typeof tile.id === 'string' && tile.id.length > 0
    ? tile.id
    : canonicalTileId(tile);
}

function findAnchorTileId(state: DominoState): string | null {
  if (typeof state.anchorTileId === 'string' && state.anchorTileId.length > 0) {
    return state.anchorTileId;
  }

  if (state.board.length === 0) {
    return null;
  }

  const firstTile = state.board[0];
  return getCanonicalTileId(firstTile);
}

function validateDominoChain(board: DominoTile[]): DominoIntegrityIssue | null {
  for (let i = 1; i < board.length; i += 1) {
    const prev = board[i - 1];
    const curr = board[i];
    const match =
      prev.right === curr.left ||
      prev.right === curr.right ||
      prev.left === curr.left ||
      prev.left === curr.right;

    if (!match) {
      return { code: 'broken_board_chain', message: `Invalid domino chain at index ${i}` };
    }
  }

  return null;
}

export function validateDominoStateIntegrity(state: DominoState): DominoIntegrityIssue | null {
  if (!Array.isArray(state.playerOrder) || state.playerOrder.length < 2 || state.playerOrder.length > 4) {
    return { code: 'invalid_player_order', message: 'Player order must contain 2-4 players' };
  }

  if (!state.currentPlayer || !state.playerOrder.includes(state.currentPlayer)) {
    return { code: 'invalid_current_player', message: 'Current player is not part of player order' };
  }

  if (!state.hands || typeof state.hands !== 'object') {
    return { code: 'invalid_hands', message: 'Hands object is missing or invalid' };
  }

  for (const playerId of state.playerOrder) {
    if (!Array.isArray(state.hands[playerId])) {
      return { code: 'missing_player_hand', message: `Missing hand for player ${playerId}` };
    }
  }

  if (!Array.isArray(state.board) || !Array.isArray(state.boneyard)) {
    return { code: 'invalid_collections', message: 'Board or boneyard is not an array' };
  }

  if (!Number.isInteger(state.passCount) || state.passCount < 0) {
    return { code: 'invalid_pass_count', message: 'passCount must be a non-negative integer' };
  }

  if (!Number.isInteger(state.drawsThisTurn) || state.drawsThisTurn < 0) {
    return { code: 'invalid_draw_count', message: 'drawsThisTurn must be a non-negative integer' };
  }

  if (!Array.isArray(state.drewThisRound)) {
    return { code: 'invalid_drew_this_round', message: 'drewThisRound must be an array' };
  }
  const drewSeen = new Set<string>();
  for (const drewId of state.drewThisRound) {
    if (typeof drewId !== 'string' || !state.playerOrder.includes(drewId)) {
      return { code: 'invalid_drew_this_round_entry', message: `drewThisRound contains invalid player id (${String(drewId)})` };
    }
    if (drewSeen.has(drewId)) {
      return { code: 'invalid_drew_this_round_entry', message: `drewThisRound contains duplicate player id (${drewId})` };
    }
    drewSeen.add(drewId);
  }

  const tileIdCounts = new Map<string, number>();
  let totalTiles = 0;

  const checkTileCollection = (tiles: DominoTile[], source: string): DominoIntegrityIssue | null => {
    for (const tile of tiles) {
      const tileError = validateTileShape(tile, source);
      if (tileError) {
        return tileError;
      }

      const id = typeof tile.id === 'string' && tile.id.length > 0
        ? tile.id
        : canonicalTileId(tile);

      const currentCount = tileIdCounts.get(id) || 0;
      tileIdCounts.set(id, currentCount + 1);
      if (currentCount + 1 > 1) {
        return { code: 'duplicate_tile', message: `Duplicate tile detected (${id})` };
      }

      totalTiles += 1;
    }
    return null;
  };

  const boardIssue = checkTileCollection(state.board, 'board');
  if (boardIssue) {
    return boardIssue;
  }

  for (const playerId of state.playerOrder) {
    const handIssue = checkTileCollection(state.hands[playerId], `hand:${playerId}`);
    if (handIssue) {
      return handIssue;
    }
  }

  const boneyardIssue = checkTileCollection(state.boneyard, 'boneyard');
  if (boneyardIssue) {
    return boneyardIssue;
  }

  if (totalTiles !== DOMINO_TOTAL_TILES) {
    return {
      code: 'tile_count_mismatch',
      message: `Expected ${DOMINO_TOTAL_TILES} total tiles, got ${totalTiles}`,
    };
  }

  if (state.board.length === 0) {
    if (state.leftEnd !== -1 || state.rightEnd !== -1) {
      return {
        code: 'invalid_ends_on_empty_board',
        message: 'leftEnd/rightEnd must be -1 when board is empty',
      };
    }
    return null;
  }

  const chainIssue = validateDominoChain(state.board) ?? verifyBoardChain(state.board);
  if (chainIssue) {
    return chainIssue;
  }

  const anchorTileId = findAnchorTileId(state);
  if (!anchorTileId) {
    return { code: 'missing_anchor_tile', message: 'Board anchor tile is missing' };
  }

  const anchorIndex = state.board.findIndex((tile) => getCanonicalTileId(tile) === anchorTileId);
  if (anchorIndex === -1) {
    return { code: 'missing_anchor_tile', message: `Anchor tile ${anchorTileId} is not present on board` };
  }

  const first = state.board[0];
  const last = state.board[state.board.length - 1];
  if (state.leftEnd !== first.left || state.rightEnd !== last.right) {
    return {
      code: 'board_end_mismatch',
      message: `Board ends mismatch. leftEnd=${state.leftEnd}, rightEnd=${state.rightEnd}`,
    };
  }

  if (state.anchorTileId && getCanonicalTileId(state.board[anchorIndex]) !== state.anchorTileId) {
    return { code: 'invalid_anchor_tile', message: 'Anchor tile does not match board contents' };
  }

  return null;
}

export function createAllTiles(): DominoTile[] {
  const tiles: DominoTile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push({ left: i, right: j, id: `${i}-${j}` });
    }
  }
  return tiles;
}

export function shuffleTiles<T>(array: T[]): T[] {
  return shuffleSecure(array);
}

export function canPlayTile(state: DominoState, tile: DominoTile, end: 'left' | 'right'): boolean {
  if (state.board.length === 0) {
    return true;
  }
  const targetValue = end === 'left' ? state.leftEnd : state.rightEnd;
  return tile.left === targetValue || tile.right === targetValue;
}

/** C12-F3: Check if two tiles represent the same domino piece (order-independent) */
export function matchesTile(a: DominoTile, b: { left: number; right: number; id?: string }): boolean {
  if (a.id && b.id) return a.id === b.id;
  return (a.left === b.left && a.right === b.right) || (a.left === b.right && a.right === b.left);
}

/** Returns tiles from the player's hand that can be placed on the board, with valid placement ends.
 *  C8-F12: When the board is empty, all tiles are playable. Only 'left' end is returned by
 *  convention — for the first tile placement, 'left'/'right' is semantically identical since both
 *  board ends are unset. The server validates accordingly. */
export function getPlayableTiles(state: DominoState, playerId: string): { tile: DominoTile; ends: ('left' | 'right')[] }[] {
  const hand = state.hands[playerId] || [];
  const playable: { tile: DominoTile; ends: ('left' | 'right')[] }[] = [];

  if (state.board.length === 0) {
    return hand.map(tile => ({ tile, ends: ['left' as const] }));
  }

  for (const tile of hand) {
    const ends: ('left' | 'right')[] = [];
    if (canPlayTile(state, tile, 'left')) ends.push('left');
    if (canPlayTile(state, tile, 'right')) ends.push('right');
    if (ends.length > 0) {
      playable.push({ tile, ends });
    }
  }

  return playable;
}

export function advanceTurn(state: DominoState): void {
  const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
  if (currentIndex === -1) {
    console.warn(`[Domino] advanceTurn: currentPlayer "${state.currentPlayer}" not in playerOrder, defaulting to first player`);
    state.currentPlayer = state.playerOrder[0];
    return;
  }
  state.currentPlayer = state.playerOrder[(currentIndex + 1) % state.playerOrder.length];
  // C11-F9: Reset draws counter when turn advances — encapsulates the invariant
  state.drawsThisTurn = 0;
}

/** Find winner of a blocked game — lowest pips wins. Handles ties fairly.
 *  F5: In 4-player mode, uses team scoring (player[0]+[2] vs player[1]+[3]).
 *  C8-F9: Defensively handles missing hands with ?? [] fallback. */
export function findBlockedGameWinner(state: DominoState): { winner: string | null; lowestPips: number; winningTeamPips?: number } {
  // C8-F9: Safe pip sum helper — handles missing/undefined hands
  const sumPips = (pid: string) => (state.hands[pid] ?? []).reduce((s, t) => s + t.left + t.right, 0);

  // 4-player team mode: compare team pip totals
  if (state.playerOrder.length === 4) {
    const teamA = [state.playerOrder[0], state.playerOrder[2]];
    const teamB = [state.playerOrder[1], state.playerOrder[3]];
    const pipsA = teamA.reduce((sum, pid) => sum + sumPips(pid), 0);
    const pipsB = teamB.reduce((sum, pid) => sum + sumPips(pid), 0);
    if (pipsA === pipsB) return { winner: null, lowestPips: pipsA, winningTeamPips: pipsA };
    // C15-F6: Return the lower-pips teammate as representative winner for clearer UI/stats
    const winningTeam = pipsA < pipsB ? teamA : teamB;
    const first = sumPips(winningTeam[0]);
    const second = sumPips(winningTeam[1]);
    return {
      winner: first <= second ? winningTeam[0] : winningTeam[1],
      lowestPips: Math.min(first, second),
      winningTeamPips: Math.min(pipsA, pipsB)
    };
  }

  // 2-3 player mode: individual scoring
  const pipCounts = state.playerOrder.map(pid => ({
    pid,
    pips: sumPips(pid)
  }));
  pipCounts.sort((a, b) => a.pips - b.pips);

  const lowestPips = pipCounts[0].pips;
  const tiedPlayers = pipCounts.filter(p => p.pips === lowestPips);

  // If multiple players tie, it's a draw  
  if (tiedPlayers.length > 1) {
    return { winner: null, lowestPips };
  }
  return { winner: tiedPlayers[0].pid, lowestPips };
}
