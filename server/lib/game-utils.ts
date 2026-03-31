import crypto from 'crypto';

/**
 * Cryptographically secure dice roll (1-6) using rejection sampling.
 * Eliminates modulo bias: values >= 4294967290 (nearest multiple of 6 below 2^32) are rejected.
 */
export function cryptoRandomDice(): number {
  const MAX_UNBIASED = 4294967290; // Math.floor(2**32 / 6) * 6
  let value: number;
  do {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= MAX_UNBIASED);
  return (value % 6) + 1;
}

/**
 * Cryptographically secure dice pair for backgammon
 */
export function cryptoRandomDicePair(): [number, number] {
  return [cryptoRandomDice(), cryptoRandomDice()];
}

/**
 * Cryptographically secure shuffle (Fisher-Yates with rejection sampling)
 */
export function shuffleSecure<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Rejection sampling to eliminate modulo bias
    const range = i + 1;
    const maxUnbiased = Math.floor(4294967296 / range) * range; // 2^32 / range, rounded down, * range
    let value: number;
    do {
      const randomBuffer = new Uint32Array(1);
      crypto.getRandomValues(randomBuffer);
      value = randomBuffer[0];
    } while (value >= maxUnbiased);
    const j = value % range;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** C10-F1: Cryptographically secure random integer in [0, max) with rejection sampling */
export function cryptoRandomInt(max: number): number {
  if (max <= 1) return 0;
  const maxUnbiased = Math.floor(4294967296 / max) * max;
  let value: number;
  do {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= maxUnbiased);
  return value % max;
}

/**
 * Safe integer parsing with validation — prevents NaN corruption
 */
export function safeParseInt(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName}: expected integer, got "${value}"`);
  }
  return parsed;
}

/**
 * Standard 52-card deck for Tarneeb
 */
export function createStandard52Deck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: { suit: typeof suits[number]; rank: string; value: number }[] = [];
  for (const suit of suits) {
    for (let i = 0; i < ranks.length; i++) {
      deck.push({ suit, rank: ranks[i], value: i });
    }
  }
  return deck;
}

/**
 * Standard 32-card deck for Baloot (7 through A)
 */
export function createStandard32Deck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
  const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: { suit: typeof suits[number]; rank: string; value: number }[] = [];
  for (const suit of suits) {
    for (let i = 0; i < ranks.length; i++) {
      deck.push({ suit, rank: ranks[i], value: i });
    }
  }
  return deck;
}
