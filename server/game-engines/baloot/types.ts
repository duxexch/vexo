import type { GameEngine, MoveData, ValidationResult, ApplyMoveResult, GameStatus, PlayerView, GameEvent } from '../types';

export interface PlayingCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  value: number;
}

export interface BalootState {
  phase: 'choosing' | 'playing' | 'finished';
  hands: { [playerId: string]: PlayingCard[] };
  currentTrick: { playerId: string; card: PlayingCard }[];
  lastCompletedTrick?: { playerId: string; card: PlayingCard }[];
  gameType: 'sun' | 'hokm' | null;
  trumpSuit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | null;
  currentPlayer: string;
  playerOrder: string[];
  choosingPlayer: string;
  tricksWon: { team0: number; team1: number };
  roundPoints: { team0: number; team1: number };
  totalPoints: { team0: number; team1: number };
  projects: { playerId: string; project: string; points: number }[];
  dealerId: string;
  dealerIndex: number;
  trickLeader: string;
  roundNumber: number;
  targetPoints: number;
  passCount: number;
  passRound: number; // 1 = first pass round, 2 = second (forced) round
  lastTrickWinner?: string;
  winningTeam?: number;
  teams: { team0: string[]; team1: string[] };
  botPlayers?: string[];
  playedCardsMemo: Array<{ suit: string; rank: string; playerId: string }>;
  // Round summary data for UI
  lastRoundPoints?: { team0: number; team1: number };
  lastRoundGameType?: 'sun' | 'hokm' | null;
  lastRoundKaboot?: boolean;
  lastRoundProjects?: { playerId: string; project: string; points: number }[];
  playerVoids?: Record<string, string[]>;
  lastChoice?: { playerId: string; gameType: string; trumpSuit?: string | null };
  lastTrickPoints?: number;
}

export const BALOOT_HOKM_VALUES: { [key: string]: number } = {
  'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0
};

export const BALOOT_SUN_VALUES: { [key: string]: number } = {
  'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0
};
