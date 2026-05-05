export interface DominoTile {
  left: number;
  right: number;
  id: string;
}

export interface DominoState {
  board: DominoTile[];
  leftEnd: number;
  rightEnd: number;
  hands: { [playerId: string]: DominoTile[] };
  boneyard: DominoTile[];
  currentPlayer: string;
  playerOrder: string[];
  passCount: number;
  drawsThisTurn: number;
  /** Player IDs who drew at least once during the current round. Reset every round.
   *  Used to enforce pure domino-out scoring: only winners who never drew score full opponent pips. */
  drewThisRound: string[];
  gameOver: boolean;
  targetScore: number;
  roundNumber: number;
  /**
   * Explicit anchor tile for render/layout.
   * This is the first tile played in the round and should be used instead of
   * inferring the center from array order when reconstructing the board UI.
   */
  anchorTileId?: string;
  winner?: string | null;
  winningTeam?: number;
  isDraw?: boolean;
  reason?: string; // C9-F10: game-over reason stored at mutation time
  scores: { [playerId: string]: number };
  lastAction?: { type: string; playerId: string; tile?: DominoTile; end?: string };
  botPlayers?: string[];
}

/** Compute max draws per turn dynamically: total tiles - dealt tiles = boneyard size */
export function getMaxDrawsPerTurn(playerCount: number): number {
  const totalTiles = 28; // standard double-six set
  const dealtTiles = playerCount * 7;
  return Math.max(totalTiles - dealtTiles, 0); // C11-F12: 4p has 0 boneyard — accurate cap
}
