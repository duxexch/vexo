import type { DominoTile, DominoState } from './types';
import { shuffleSecure } from '../../lib/game-utils';

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
