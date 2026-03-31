/**
 * Odds conversion and calculation functions.
 * Converts probabilities to betting odds, applies house fees, and calculates winnings.
 */

import type { PlayerStats, SupportSettings, OddsResult, WinningsResult } from "./types";
import { DEFAULT_SETTINGS, normalizeNumber } from "./types";
import { calculatePlayerProbability } from "./probability";

/**
 * Converts a probability to decimal betting odds
 * 
 * Formula: 1 / probability
 * For example: 50% probability = 2.0 odds, 33% probability = 3.0 odds
 * 
 * @param probability Win probability (0-1)
 * @returns Decimal odds (e.g., 1.5, 2.0, 3.0)
 */
export function probabilityToOdds(probability: number): number {
  if (probability <= 0 || probability >= 1) {
    return probability <= 0 ? 100 : 1; // Extreme values
  }

  const odds = 1 / probability;
  
  // Round to 2 decimal places for standard betting format
  return Math.round(odds * 100) / 100;
}

/**
 * Applies house fee to betting odds
 * This ensures the house makes a profit while keeping odds fair
 * 
 * Formula: odds * (1 - houseFeePercent)
 * For example: 2.0 odds with 5% fee = 1.90 odds
 * 
 * @param odds Original decimal odds
 * @param houseFeePercent House fee as decimal (0.05 = 5%)
 * @returns Adjusted odds after house fee
 */
export function applyHouseFee(odds: number, houseFeePercent: number): number {
  const fee = normalizeNumber(houseFeePercent);
  const adjustedOdds = odds * (1 - fee);
  
  // Minimum odds should be at least 1.01 to avoid negative returns
  return Math.max(1.01, adjustedOdds);
}

/**
 * Calculates betting odds for two players
 * 
 * This function:
 * 1. Calculates probability for each player
 * 2. Converts probabilities to decimal odds
 * 3. Applies house fee
 * 4. Normalizes odds so they're fair and proportional
 * 
 * @param player1 First player statistics
 * @param player2 Second player statistics
 * @param settings Support settings (defaults applied if not provided)
 * @param gameType Optional game type for game-specific stats
 * @returns Odds for both players and their probabilities
 */
export function calculateOdds(
  player1: PlayerStats,
  player2: PlayerStats,
  settings?: Partial<SupportSettings>,
  gameType?: string
): OddsResult {
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
  
  // If manual mode is enabled, return default odds
  if (finalSettings.oddsMode === 'manual') {
    return {
      player1Odds: parseFloat(finalSettings.defaultOddsPlayer1?.toString() ?? '2.0'),
      player2Odds: parseFloat(finalSettings.defaultOddsPlayer2?.toString() ?? '2.0'),
      player1Probability: 0.5,
      player2Probability: 0.5,
      houseFeePercent: parseFloat(finalSettings.houseFeePercent.toString()),
    };
  }
  
  // Calculate probabilities for both players
  const player1Probability = calculatePlayerProbability(player1, settings, gameType);
  const player2Probability = calculatePlayerProbability(player2, settings, gameType);
  
  // Normalize probabilities to ensure they sum to 1
  const totalProbability = player1Probability + player2Probability;
  const normalizedPlayer1Probability = player1Probability / totalProbability;
  const normalizedPlayer2Probability = player2Probability / totalProbability;
  
  // Convert to decimal odds
  let player1Odds = probabilityToOdds(normalizedPlayer1Probability);
  let player2Odds = probabilityToOdds(normalizedPlayer2Probability);
  
  // Apply house fee
  let houseFeePercent = parseFloat(finalSettings.houseFeePercent.toString());
  // Normalize: if stored as whole number percent (e.g., 5.00), convert to decimal (0.05)
  // No legitimate house fee would exceed 100% (1.0 as decimal)
  if (houseFeePercent > 1) {
    houseFeePercent = houseFeePercent / 100;
  }
  player1Odds = applyHouseFee(player1Odds, houseFeePercent);
  player2Odds = applyHouseFee(player2Odds, houseFeePercent);
  
  return {
    player1Odds: Math.round(player1Odds * 100) / 100,
    player2Odds: Math.round(player2Odds * 100) / 100,
    player1Probability: Math.round(normalizedPlayer1Probability * 10000) / 10000,
    player2Probability: Math.round(normalizedPlayer2Probability * 10000) / 10000,
    houseFeePercent,
  };
}

/**
 * Calculates potential winnings from a bet
 * 
 * Formula: 
 * - Potential Winnings = stake * (odds - 1)
 * - Total Return = stake * odds
 * - Profit = Total Return - Stake
 * 
 * For example: $100 bet at 2.0 odds
 * - Winnings: $100 (net profit)
 * - Total Return: $200 (includes original stake)
 * - Profit: $100 (net gain)
 * 
 * @param amount Stake amount
 * @param odds Decimal odds (e.g., 1.5, 2.0, 3.0)
 * @returns Potential winnings calculation
 */
export function calculatePotentialWinnings(amount: string | number, odds: string | number): WinningsResult {
  const stake = normalizeNumber(amount);
  const oddsValue = normalizeNumber(odds);
  
  // Calculate total return
  const totalReturn = stake * oddsValue;
  
  // Calculate profit (return minus original stake)
  const profit = totalReturn - stake;
  
  // Potential winnings is the profit (not including original stake)
  const potentialWinnings = profit;
  
  return {
    potentialWinnings: Math.round(potentialWinnings * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    profit: Math.round(profit * 100) / 100,
  };
}
