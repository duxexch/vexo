import { shuffleSecure } from '../../lib/game-utils';
import type { PlayingCard, BalootState } from './types';
import { BALOOT_HOKM_VALUES, BALOOT_SUN_VALUES } from './types';

export function createDeck(): PlayingCard[] {
  const suits: PlayingCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: PlayingCard[] = [];

  for (const suit of suits) {
    for (let i = 0; i < ranks.length; i++) {
      deck.push({ suit, rank: ranks[i], value: i });
    }
  }

  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  return shuffleSecure(array);
}

export function createNewGame(
  playerIds: string[],
  targetPoints: number,
  dealerIndex: number = 0,
  teams?: { team0: string[]; team1: string[] }
): BalootState {
  if (playerIds.length !== 4) {
    throw new Error('Baloot requires exactly 4 players');
  }

  const deck = shuffle(createDeck());
  const hands: { [playerId: string]: PlayingCard[] } = {};

  for (let i = 0; i < 4; i++) {
    hands[playerIds[i]] = deck.slice(i * 8, (i + 1) * 8);
  }

  // Teams are FIXED: indices 0,2 = team0, indices 1,3 = team1
  const fixedTeams = teams || {
    team0: [playerIds[0], playerIds[2]],
    team1: [playerIds[1], playerIds[3]],
  };

  const firstChooser = playerIds[(dealerIndex + 1) % 4];

  return {
    phase: 'choosing',
    hands,
    currentTrick: [],
    lastCompletedTrick: undefined,
    gameType: null,
    trumpSuit: null,
    currentPlayer: firstChooser,
    playerOrder: playerIds,
    choosingPlayer: firstChooser,
    tricksWon: { team0: 0, team1: 0 },
    roundPoints: { team0: 0, team1: 0 },
    totalPoints: { team0: 0, team1: 0 },
    projects: [],
    dealerId: playerIds[dealerIndex],
    dealerIndex,
    trickLeader: firstChooser,
    roundNumber: 1,
    targetPoints,
    passCount: 0,
    passRound: 1,
    teams: fixedTeams,
    playedCardsMemo: [],
  };
}

export function getCardStrength(
  card: PlayingCard,
  gameType: 'sun' | 'hokm',
  trumpSuit: string | null,
  leadSuit: string
): number {
  const values = gameType === 'hokm' && card.suit === trumpSuit ? BALOOT_HOKM_VALUES : BALOOT_SUN_VALUES;
  let value = values[card.rank] || 0;

  if (trumpSuit && card.suit === trumpSuit) {
    value += 100;
  } else if (card.suit === leadSuit) {
    value += 50;
  }

  return value;
}

export function getHighestTrumpStrength(
  trick: { playerId: string; card: PlayingCard }[],
  trumpSuit: string
): number {
  let highest = 0;
  for (const entry of trick) {
    if (entry.card.suit === trumpSuit) {
      const strength = BALOOT_HOKM_VALUES[entry.card.rank] || 0;
      if (strength > highest) highest = strength;
    }
  }
  return highest;
}

export function detectProjects(
  hand: PlayingCard[],
  gameType: 'sun' | 'hokm',
  trumpSuit: string | null
): { project: string; points: number }[] {
  const projects: { project: string; points: number }[] = [];
  const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits: PlayingCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];

  // Check for sequences (sra/arba'in/khamsin) in each suit
  for (const suit of suits) {
    const suitCards = hand.filter(c => c.suit === suit);
    if (suitCards.length < 3) continue;

    const indices = suitCards.map(c => rankOrder.indexOf(c.rank)).sort((a, b) => a - b);
    
    // Find all consecutive sequences and pick the longest
    let maxSeq = 1;
    let currentSeq = 1;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === indices[i - 1] + 1) {
        currentSeq++;
        if (currentSeq > maxSeq) maxSeq = currentSeq;
      } else {
        currentSeq = 1;
      }
    }

    if (maxSeq >= 5) {
      projects.push({ project: 'khamsin', points: 100 });
    } else if (maxSeq >= 4) {
      projects.push({ project: "arba'in", points: 50 });
    } else if (maxSeq >= 3) {
      projects.push({ project: 'sra', points: 20 });
    }
  }

  // Check for four of a kind (mi'a) — for ranks 10, J, Q, K, A = 100pts
  for (const rank of ['10', 'J', 'Q', 'K', 'A']) {
    const count = hand.filter(c => c.rank === rank).length;
    if (count === 4) {
      projects.push({ project: "mi'a", points: 100 });
    }
  }

  // Four 9s = "Jami" — 100 points (special project)
  const nineCount = hand.filter(c => c.rank === '9').length;
  if (nineCount === 4) {
    projects.push({ project: 'jami', points: 100 });
  }

  // Check for Baloot (K+Q of trump) in hokm mode
  if (gameType === 'hokm' && trumpSuit) {
    const hasKing = hand.some(c => c.suit === trumpSuit && c.rank === 'K');
    const hasQueen = hand.some(c => c.suit === trumpSuit && c.rank === 'Q');
    if (hasKing && hasQueen) {
      projects.push({ project: 'baloot', points: 20 });
    }
  }

  return projects;
}

export function getCardPoints(
  card: PlayingCard,
  gameType: 'sun' | 'hokm',
  isTrump: boolean
): number {
  if (!card || typeof card.rank !== 'string') return 0;
  const values = gameType === 'hokm' && isTrump ? BALOOT_HOKM_VALUES : BALOOT_SUN_VALUES;
  return values[card.rank] || 0;
}
