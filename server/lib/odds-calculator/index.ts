/**
 * Odds Calculator for Spectator Support System
 * 
 * Barrel module re-exporting all odds calculator functionality.
 */

export type { PlayerStats, SupportSettings, OddsResult, WinningsResult } from "./types";
export { DEFAULT_SETTINGS, normalizeNumber } from "./types";

import { calculateWinRate, calculateExperienceScore, calculateStreakScore, calculatePlayerProbability } from "./probability";
export { calculateWinRate, calculateExperienceScore, calculateStreakScore, calculatePlayerProbability } from "./probability";

import { probabilityToOdds, applyHouseFee, calculateOdds, calculatePotentialWinnings } from "./odds";
export { probabilityToOdds, applyHouseFee, calculateOdds, calculatePotentialWinnings } from "./odds";

import { validateOdds, oddsToImpliedProbability, calculateHouseEdge, generateOddsReport } from "./analysis";
export { validateOdds, oddsToImpliedProbability, calculateHouseEdge, generateOddsReport } from "./analysis";

export default {
  calculateWinRate,
  calculateExperienceScore,
  calculateStreakScore,
  calculatePlayerProbability,
  probabilityToOdds,
  applyHouseFee,
  calculateOdds,
  calculatePotentialWinnings,
  validateOdds,
  oddsToImpliedProbability,
  calculateHouseEdge,
  generateOddsReport,
};
