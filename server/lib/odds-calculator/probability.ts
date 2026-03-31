/**
 * Probability calculation functions for player skill assessment.
 * Calculates win rates, experience scores, streak bonuses, and combined probability.
 */

import type { PlayerStats, SupportSettings } from "./types";
import { DEFAULT_SETTINGS, normalizeNumber } from "./types";

/**
 * Calculates the win rate for a player
 * 
 * Formula: gamesWon / (gamesWon + gamesLost)
 * Returns 0.5 if player has no completed games
 * 
 * @param player Player statistics
 * @param gameType Optional game type filter (chess, backgammon, etc.)
 * @returns Win rate between 0 and 1
 */
export function calculateWinRate(player: PlayerStats, gameType?: string): number {
  let won = player.gamesWon;
  let played = player.gamesPlayed;

  // Use game-specific stats if available
  if (gameType) {
    const gameKey = gameType.toLowerCase();
    const wonKey = `${gameKey}Won` as keyof PlayerStats;
    const playedKey = `${gameKey}Played` as keyof PlayerStats;
    
    if (wonKey in player && playedKey in player) {
      won = (player[wonKey] as number) || 0;
      played = (player[playedKey] as number) || 0;
    }
  }

  // Prevent division by zero
  if (played === 0) {
    return 0.5; // New players start at 50%
  }

  return won / played;
}

/**
 * Normalizes experience (total games played) to a 0-1 score
 * Uses exponential curve for diminishing returns
 * 
 * Formula: 1 - e^(-0.01 * gamesPlayed)
 * This means:
 * - 1 game = ~0.009 bonus
 * - 100 games = ~0.632 bonus
 * - 1000 games = ~0.99 bonus (capped)
 * 
 * @param player Player statistics
 * @param threshold Optional max games to consider (default 100)
 * @returns Experience score between 0 and 1
 */
export function calculateExperienceScore(player: PlayerStats, threshold: number = 100): number {
  const games = Math.min(player.gamesPlayed, threshold);
  
  if (games === 0) {
    return 0;
  }

  // Use exponential curve for experience bonus
  // This rewards experience but with diminishing returns
  return 1 - Math.exp(-0.01 * games);
}

/**
 * Normalizes current win streak to a 0-1 score
 * Uses logarithmic curve for diminishing returns
 * 
 * Formula: log(1 + streak) / log(1 + threshold)
 * This means:
 * - 1 win streak = ~0.30 bonus
 * - 10 win streak = 1.0 bonus
 * - Higher streaks don't increase further
 * 
 * @param player Player statistics
 * @param threshold Optional max streak to consider (default 10)
 * @returns Streak score between 0 and 1
 */
export function calculateStreakScore(player: PlayerStats, threshold: number = 10): number {
  const streak = Math.min(Math.max(player.currentWinStreak, 0), threshold);
  
  if (threshold === 0) {
    return 0;
  }

  // Use logarithmic curve for streak normalization
  // This rewards momentum but caps at threshold
  return Math.log(1 + streak) / Math.log(1 + threshold);
}

/**
 * Calculates the probability of a player winning based on their statistics
 * 
 * Formula: (winRate * winRateWeight) + (experience * experienceWeight) + (streak * streakWeight)
 * The weighted components are normalized to 0-1 and then combined
 * 
 * @param player Player statistics
 * @param settings Support settings (defaults applied if not provided)
 * @param gameType Optional game type for game-specific stats
 * @returns Probability between 0 and 1
 */
export function calculatePlayerProbability(
  player: PlayerStats,
  settings?: Partial<SupportSettings>,
  gameType?: string
): number {
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
  
  // Parse weights as numbers
  const winRateWeight = normalizeNumber(finalSettings.winRateWeight);
  const experienceWeight = normalizeNumber(finalSettings.experienceWeight);
  const streakWeight = normalizeNumber(finalSettings.streakWeight);
  
  // Calculate component scores
  const winRate = calculateWinRate(player, gameType);
  const experience = calculateExperienceScore(
    player,
    parseInt(finalSettings.experienceThreshold?.toString() ?? '100')
  );
  const streak = calculateStreakScore(
    player,
    parseInt(finalSettings.streakThreshold?.toString() ?? '10')
  );
  
  // Calculate weighted probability
  const probability = (winRate * winRateWeight) + (experience * experienceWeight) + (streak * streakWeight);
  
  // Ensure probability is within valid range (0.05 to 0.95 for fairness)
  // This prevents unrealistic odds where one player is guaranteed to win
  return Math.max(0.05, Math.min(0.95, probability));
}
