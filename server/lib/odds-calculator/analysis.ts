/**
 * Odds validation, implied probability, house edge calculation, and reporting.
 */

import type { PlayerStats, OddsResult } from "./types";
import { calculateWinRate, calculateExperienceScore, calculateStreakScore } from "./probability";

/**
 * Validates odds to ensure they're within reasonable bounds
 * 
 * Rules:
 * - Odds must be >= 1.01 (minimum return)
 * - Odds must be <= 100 (maximum reasonable odds)
 * - Both players can't have identical odds (unfair match)
 * 
 * @param player1Odds First player's odds
 * @param player2Odds Second player's odds
 * @returns Validation result with any error messages
 */
export function validateOdds(player1Odds: number, player2Odds: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (player1Odds < 1.01) {
    errors.push(`Player 1 odds (${player1Odds}) is below minimum (1.01)`);
  }
  
  if (player2Odds < 1.01) {
    errors.push(`Player 2 odds (${player2Odds}) is below minimum (1.01)`);
  }
  
  if (player1Odds > 100) {
    errors.push(`Player 1 odds (${player1Odds}) exceeds maximum (100)`);
  }
  
  if (player2Odds > 100) {
    errors.push(`Player 2 odds (${player2Odds}) exceeds maximum (100)`);
  }
  
  if (Math.abs(player1Odds - player2Odds) < 0.01) {
    errors.push('Player odds are too close, indicating potential mismatch data');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates implied probability from decimal odds
 * This is the inverse of probabilityToOdds
 * 
 * Formula: 1 / odds
 * For example: 2.0 odds = 50% probability, 3.0 odds = 33.33% probability
 * 
 * @param odds Decimal odds
 * @returns Implied probability (0-1)
 */
export function oddsToImpliedProbability(odds: number): number {
  if (odds < 1.01) {
    return 0;
  }

  const probability = 1 / odds;
  return Math.max(0, Math.min(1, probability));
}

/**
 * Calculates the house advantage in a match
 * House edge is how much the house profits from the betting market
 * 
 * Formula: 1 - (1/player1Odds + 1/player2Odds)
 * A positive house edge means the house profits (good for casino)
 * A negative house edge means the house loses (bad for casino)
 * 
 * @param player1Odds First player's odds
 * @param player2Odds Second player's odds
 * @returns House edge as decimal (0.05 = 5% edge)
 */
export function calculateHouseEdge(player1Odds: number, player2Odds: number): number {
  const impliedProb1 = oddsToImpliedProbability(player1Odds);
  const impliedProb2 = oddsToImpliedProbability(player2Odds);
  
  const totalImpliedProb = impliedProb1 + impliedProb2;
  const houseEdge = 1 - (1 / totalImpliedProb);
  
  return Math.max(0, Math.min(1, houseEdge));
}

/**
 * Generates a detailed odds report for analysis
 * Useful for auditing and monitoring odds fairness
 * 
 * @param player1 First player statistics
 * @param player2 Second player statistics
 * @param oddsResult Calculated odds result
 * @param gameType Optional game type
 * @returns Detailed report object
 */
export function generateOddsReport(
  player1: PlayerStats,
  player2: PlayerStats,
  oddsResult: OddsResult,
  gameType?: string
) {
  const p1WinRate = calculateWinRate(player1, gameType);
  const p2WinRate = calculateWinRate(player2, gameType);
  
  const p1Experience = calculateExperienceScore(player1);
  const p2Experience = calculateExperienceScore(player2);
  
  const p1Streak = calculateStreakScore(player1);
  const p2Streak = calculateStreakScore(player2);
  
  const houseEdge = calculateHouseEdge(oddsResult.player1Odds, oddsResult.player2Odds);
  const impliedP1Prob = oddsToImpliedProbability(oddsResult.player1Odds);
  const impliedP2Prob = oddsToImpliedProbability(oddsResult.player2Odds);
  
  return {
    player1: {
      stats: {
        gamesPlayed: player1.gamesPlayed,
        gamesWon: player1.gamesWon,
        gamesLost: player1.gamesLost,
        currentWinStreak: player1.currentWinStreak,
      },
      scores: {
        winRate: Math.round(p1WinRate * 10000) / 10000,
        experience: Math.round(p1Experience * 10000) / 10000,
        streak: Math.round(p1Streak * 10000) / 10000,
      },
      odds: oddsResult.player1Odds,
      probability: oddsResult.player1Probability,
      impliedProbability: Math.round(impliedP1Prob * 10000) / 10000,
    },
    player2: {
      stats: {
        gamesPlayed: player2.gamesPlayed,
        gamesWon: player2.gamesWon,
        gamesLost: player2.gamesLost,
        currentWinStreak: player2.currentWinStreak,
      },
      scores: {
        winRate: Math.round(p2WinRate * 10000) / 10000,
        experience: Math.round(p2Experience * 10000) / 10000,
        streak: Math.round(p2Streak * 10000) / 10000,
      },
      odds: oddsResult.player2Odds,
      probability: oddsResult.player2Probability,
      impliedProbability: Math.round(impliedP2Prob * 10000) / 10000,
    },
    market: {
      houseFeePercent: oddsResult.houseFeePercent,
      houseEdgePercent: Math.round(houseEdge * 10000) / 100,
      totalImpliedProbability: Math.round((impliedP1Prob + impliedP2Prob) * 10000) / 10000,
    },
  };
}
