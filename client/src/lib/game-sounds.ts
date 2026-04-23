/**
 * Game Sounds — Backwards-compatible facade over the unified `game-audio.ts`.
 *
 * Every legacy export (cardSounds / dominoSounds / backgammonSounds /
 * isGameSoundEnabled / toggleGameSound) now routes through the new central
 * sound library so that:
 *   - master mute + volume from `<GameLayout>` apply across every game
 *   - we use a single AudioContext (no duplicates / autoplay conflicts)
 *   - sound persistence (localStorage) is unified across the app
 */

import { playGameSound as playSound, getGameMuted, setGameMuted } from "./game-audio";

// ─── Backgammon ────────────────────────────────────────────────────
export const backgammonSounds = {
  diceRoll() { playSound("diceRoll"); },
  move() { playSound("tilePlace"); },
  hit() { playSound("capture"); },
  bearOff() { playSound("success"); },
  doubleOffer() { playSound("double"); },
  victory() { playSound("gameWin"); },
  defeat() { playSound("gameLose"); },
  gameStart() { playSound("gameStart"); },
  noMoves() { playSound("error"); },
  yourTurn() { playSound("turnStart"); },
};

// ─── Domino ────────────────────────────────────────────────────────
export const dominoSounds = {
  placeTile() { playSound("tilePlace"); },
  drawTile() { playSound("tileDraw"); },
  pass() { playSound("turnWarn"); },
  blocked() { playSound("error"); },
  victory() { playSound("gameWin"); },
  defeat() { playSound("gameLose"); },
  gameStart() { playSound("gameStart"); },
  yourTurn() { playSound("turnStart"); },
};

// ─── Card Games (Tarneeb & Baloot) ─────────────────────────────────
export const cardSounds = {
  playCard() { playSound("cardPlay"); },
  trickWon() { playSound("trickWin"); },
  bid() { playSound("click"); },
  bidPass() { playSound("turnWarn"); },
  trumpSelected() { playSound("success"); },
  roundEnd() { playSound("success"); },
  victory() { playSound("gameWin"); },
  defeat() { playSound("gameLose"); },
  gameStart() { playSound("gameStart"); },
  yourTurn() { playSound("turnStart"); },
  kaboot() { playSound("checkmate"); },
};

// ─── Settings (legacy API) ─────────────────────────────────────────
export function isGameSoundEnabled(): boolean {
  return !getGameMuted();
}

export function toggleGameSound(): boolean {
  const next = !getGameMuted();
  setGameMuted(next);
  return !next;
}
