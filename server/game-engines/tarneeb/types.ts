export interface PlayingCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  value: number;
}

export interface TarneebState {
  phase: 'bidding' | 'playing' | 'finished';
  hands: { [playerId: string]: PlayingCard[] };
  currentTrick: { playerId: string; card: PlayingCard }[];
  trumpSuit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | null;
  currentPlayer: string;
  playerOrder: string[];
  bids: { playerId: string; bid: number | null }[];
  highestBid: { playerId: string; bid: number } | null;
  biddingTeam: number | null;
  tricksWon: { team0: number; team1: number };
  roundScores: { team0: number; team1: number };
  totalScores: { team0: number; team1: number };
  dealerId: string;
  dealerIndex: number;
  trickLeader: string;
  roundNumber: number;
  targetScore: number;
  lastTrickWinner?: string;
  teams: { team0: string[]; team1: string[] };
  /** Last completed trick cards for "peek" feature */
  lastCompletedTrick?: { playerId: string; card: PlayingCard }[];
  /** Bot player IDs (generated when only 2 humans join) */
  botPlayers?: string[];
  /** Number of consecutive all-pass redeals */
  redealCount?: number;
  /** Played cards memory for bot AI — tracks all cards seen this round */
  playedCardsMemo?: Array<{ suit: string; rank: string; playerId: string }>;
  /** Inline void tracking: player → suits they are void in (detected during play) */
  playerVoids?: Record<string, string[]>;
  /** Previous round scores — preserved across round transitions for UI summary */
  lastRoundScores?: { team0: number; team1: number };
  lastBidValue?: number;
  lastBiddingTeam?: number;
  lastBiddingTeamMade?: boolean;
  lastIsKaboot?: boolean;
  /** Persisted winning team index when game finishes (for tiebreaker accuracy) */
  winningTeam?: number;
}
