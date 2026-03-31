/**
 * Odds Calculator for Spectator Support System
 * 
 * Type definitions, interfaces, constants, and helpers.
 */

/**
 * Player statistics object extracted from users table
 */
export interface PlayerStats {
  gamesWon: number;
  gamesLost: number;
  gamesPlayed: number;
  currentWinStreak: number;
  longestWinStreak?: number;
  // Game-specific stats (optional)
  chessWon?: number;
  chessPlayed?: number;
  backgammonWon?: number;
  backgammonPlayed?: number;
  dominoWon?: number;
  dominoPlayed?: number;
  tarneebWon?: number;
  tarneebPlayed?: number;
  balootWon?: number;
  balootPlayed?: number;
}

/**
 * Support settings for odds calculation
 */
export interface SupportSettings {
  winRateWeight: string | number;
  experienceWeight: string | number;
  streakWeight: string | number;
  houseFeePercent: string | number;
  defaultOddsPlayer1?: string | number;
  defaultOddsPlayer2?: string | number;
  oddsMode?: 'automatic' | 'manual';
  // Optional: Experience normalization threshold (max games to consider for experience bonus)
  experienceThreshold?: string | number;
  // Optional: Streak normalization threshold (max streak to consider for streak bonus)
  streakThreshold?: string | number;
}

/**
 * Odds calculation result
 */
export interface OddsResult {
  player1Odds: number;
  player2Odds: number;
  player1Probability: number;
  player2Probability: number;
  houseFeePercent: number;
}

/**
 * Winnings calculation result
 */
export interface WinningsResult {
  potentialWinnings: number;
  totalReturn: number;
  profit: number;
}

/**
 * Default support settings
 */
export const DEFAULT_SETTINGS: SupportSettings = {
  winRateWeight: 0.60,
  experienceWeight: 0.25,
  streakWeight: 0.15,
  houseFeePercent: 0.05, // 5% house fee
  oddsMode: 'automatic',
  experienceThreshold: 100, // Games beyond this don't increase score further
  streakThreshold: 10, // Win streaks beyond this are capped for normalization
};

/**
 * Normalizes a value to a number, handling string inputs
 */
export function normalizeNumber(value: string | number): number {
  return typeof value === 'string' ? parseFloat(value) : value;
}
