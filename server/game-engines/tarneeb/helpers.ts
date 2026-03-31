import type { PlayingCard } from './types';
import { shuffleSecure } from '../../lib/game-utils';

export function createDeck(): PlayingCard[] {
  // Standard 52-card deck for Tarneeb (NOT 32!)
  const suits: PlayingCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: PlayingCard[] = [];

  for (const suit of suits) {
    for (let i = 0; i < ranks.length; i++) {
      deck.push({ suit, rank: ranks[i], value: i });
    }
  }

  return deck;
}

export function createShuffledDeck(): PlayingCard[] {
  return shuffleSecure(createDeck());
}

export function getCardValue(card: PlayingCard, trumpSuit: string | null, leadSuit: string): number {
  let value = card.value;
  if (trumpSuit && card.suit === trumpSuit) {
    value += 100;
  } else if (card.suit === leadSuit) {
    value += 50;
  }
  return value;
}
