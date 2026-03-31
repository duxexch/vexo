/**
 * Game Sound System — Shared Web Audio API synthesized sounds for all games.
 * Builds on the same pattern as chess-sounds.ts but provides game-specific presets.
 * No external files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!isGameSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playNoise(duration: number, volume = 0.08) {
  if (!isGameSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {}
}

function playClick(frequency = 600, volume = 0.06) {
  playTone(frequency, 0.04, 'sine', volume);
}

// ─── Backgammon Sounds ──────────────────────────────────────────────
export const backgammonSounds = {
  /** Dice roll — rapid noise bursts */
  diceRoll() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => playNoise(0.04, 0.1), i * 40);
    }
    setTimeout(() => playClick(500, 0.08), 180);
  },

  /** Piece moved to point */
  move() {
    playNoise(0.06, 0.08);
    playTone(350, 0.05, 'sine', 0.06);
  },

  /** Hit opponent piece (sent to bar) */
  hit() {
    playNoise(0.1, 0.12);
    playTone(220, 0.12, 'triangle', 0.1);
    setTimeout(() => playTone(180, 0.1, 'triangle', 0.06), 60);
  },

  /** Bear off a piece */
  bearOff() {
    playTone(500, 0.08, 'sine', 0.07);
    setTimeout(() => playTone(600, 0.08, 'sine', 0.07), 70);
  },

  /** Doubling cube offered */
  doubleOffer() {
    playTone(660, 0.1, 'triangle', 0.08);
    setTimeout(() => playTone(880, 0.12, 'triangle', 0.08), 100);
  },

  /** Victory */
  victory() {
    playTone(523, 0.15, 'triangle', 0.1);
    setTimeout(() => playTone(659, 0.15, 'triangle', 0.1), 120);
    setTimeout(() => playTone(784, 0.15, 'triangle', 0.1), 240);
    setTimeout(() => playTone(1047, 0.3, 'triangle', 0.12), 360);
  },

  /** Defeat */
  defeat() {
    playTone(400, 0.2, 'triangle', 0.1);
    setTimeout(() => playTone(350, 0.2, 'triangle', 0.1), 150);
    setTimeout(() => playTone(300, 0.3, 'triangle', 0.08), 300);
  },

  /** Game start */
  gameStart() {
    playTone(330, 0.1, 'sine', 0.08);
    setTimeout(() => playTone(440, 0.1, 'sine', 0.08), 100);
    setTimeout(() => playTone(550, 0.15, 'sine', 0.1), 200);
  },

  /** Can't move (no valid moves) */
  noMoves() {
    playTone(200, 0.15, 'sawtooth', 0.06);
  }
};

// ─── Domino Sounds ──────────────────────────────────────────────────
export const dominoSounds = {
  /** Tile placed on board */
  placeTile() {
    playNoise(0.08, 0.1);
    playTone(300, 0.06, 'sine', 0.06);
  },

  /** Draw tile from boneyard */
  drawTile() {
    playNoise(0.05, 0.06);
    playTone(450, 0.05, 'sine', 0.05);
  },

  /** Player passes */
  pass() {
    playTone(250, 0.1, 'sine', 0.04);
  },

  /** Game blocked (no one can play) */
  blocked() {
    playTone(300, 0.12, 'sawtooth', 0.06);
    setTimeout(() => playTone(250, 0.12, 'sawtooth', 0.06), 100);
  },

  /** Victory */
  victory() {
    playTone(440, 0.12, 'triangle', 0.1);
    setTimeout(() => playTone(554, 0.12, 'triangle', 0.1), 100);
    setTimeout(() => playTone(659, 0.12, 'triangle', 0.1), 200);
    setTimeout(() => playTone(880, 0.25, 'triangle', 0.12), 300);
  },

  /** Defeat */
  defeat() {
    playTone(350, 0.2, 'triangle', 0.08);
    setTimeout(() => playTone(300, 0.2, 'triangle', 0.08), 150);
    setTimeout(() => playTone(250, 0.3, 'triangle', 0.06), 300);
  },

  /** Game start */
  gameStart() {
    playTone(350, 0.08, 'sine', 0.07);
    setTimeout(() => playTone(440, 0.08, 'sine', 0.07), 80);
    setTimeout(() => playTone(525, 0.12, 'sine', 0.09), 160);
  },

  /** C10-F7: Your turn notification */
  yourTurn() {
    playTone(600, 0.06, 'sine', 0.06);
    setTimeout(() => playTone(800, 0.06, 'sine', 0.06), 70);
  }
};

// ─── Card Game Sounds (Tarneeb & Baloot) ────────────────────────────
export const cardSounds = {
  /** Card played onto table */
  playCard() {
    playNoise(0.06, 0.08);
    playTone(400, 0.04, 'sine', 0.05);
  },

  /** Trick won — cards swept */
  trickWon() {
    playNoise(0.08, 0.06);
    playTone(500, 0.06, 'sine', 0.06);
    setTimeout(() => playTone(600, 0.06, 'sine', 0.06), 60);
  },

  /** Bid placed */
  bid() {
    playClick(550, 0.07);
    setTimeout(() => playClick(650, 0.07), 80);
  },

  /** Bid passed */
  bidPass() {
    playTone(300, 0.08, 'sine', 0.04);
  },

  /** Trump suit selected */
  trumpSelected() {
    playTone(660, 0.1, 'triangle', 0.08);
    setTimeout(() => playTone(880, 0.12, 'triangle', 0.1), 100);
  },

  /** Round completed */
  roundEnd() {
    playTone(440, 0.1, 'sine', 0.07);
    setTimeout(() => playTone(550, 0.12, 'sine', 0.07), 100);
    setTimeout(() => playNoise(0.06, 0.04), 200);
  },

  /** Game victory */
  victory() {
    playTone(523, 0.12, 'triangle', 0.1);
    setTimeout(() => playTone(659, 0.12, 'triangle', 0.1), 100);
    setTimeout(() => playTone(784, 0.12, 'triangle', 0.1), 200);
    setTimeout(() => playTone(1047, 0.25, 'triangle', 0.12), 300);
    setTimeout(() => playNoise(0.1, 0.04), 500);
  },

  /** Game defeat */
  defeat() {
    playTone(400, 0.18, 'triangle', 0.1);
    setTimeout(() => playTone(350, 0.18, 'triangle', 0.08), 140);
    setTimeout(() => playTone(280, 0.25, 'triangle', 0.06), 280);
  },

  /** Game start */
  gameStart() {
    // Card shuffle sound
    for (let i = 0; i < 3; i++) {
      setTimeout(() => playNoise(0.04, 0.06), i * 60);
    }
    setTimeout(() => playTone(440, 0.1, 'sine', 0.08), 200);
  },

  /** Your turn notification */
  yourTurn() {
    playTone(660, 0.06, 'sine', 0.06);
    setTimeout(() => playTone(880, 0.06, 'sine', 0.06), 70);
  },

  /** Kaboot — dramatic penalty sound */
  kaboot() {
    playTone(220, 0.15, 'sawtooth', 0.12);
    setTimeout(() => playTone(330, 0.15, 'sawtooth', 0.12), 120);
    setTimeout(() => playTone(440, 0.2, 'triangle', 0.14), 240);
    setTimeout(() => playTone(660, 0.3, 'triangle', 0.15), 400);
    setTimeout(() => playNoise(0.15, 0.08), 600);
  }
};

// ─── Sound Settings ─────────────────────────────────────────────────
const SOUND_KEY = 'vex-game-sounds-enabled';

export function isGameSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function toggleGameSound(): boolean {
  const newVal = !isGameSoundEnabled();
  try {
    localStorage.setItem(SOUND_KEY, String(newVal));
  } catch {}
  return newVal;
}
