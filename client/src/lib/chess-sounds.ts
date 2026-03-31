/**
 * Chess Sound System — Web Audio API synthesized sounds
 * No external files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume on user interaction if suspended
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!isSoundEnabled()) return;
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
  if (!isSoundEnabled()) return;
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

export const chessSounds = {
  /** Piece placed on square */
  move() {
    playNoise(0.08, 0.12);
    playTone(400, 0.06, 'sine', 0.06);
  },

  /** Piece captured */
  capture() {
    playNoise(0.12, 0.18);
    playTone(250, 0.1, 'triangle', 0.1);
    setTimeout(() => playTone(200, 0.08, 'triangle', 0.06), 50);
  },

  /** Check */
  check() {
    playTone(880, 0.12, 'square', 0.08);
    setTimeout(() => playTone(1100, 0.1, 'square', 0.06), 80);
  },

  /** Checkmate / game won */
  checkmate() {
    playTone(523, 0.15, 'triangle', 0.1);
    setTimeout(() => playTone(659, 0.15, 'triangle', 0.1), 120);
    setTimeout(() => playTone(784, 0.15, 'triangle', 0.1), 240);
    setTimeout(() => playTone(1047, 0.3, 'triangle', 0.12), 360);
  },

  /** Game lost */
  defeat() {
    playTone(400, 0.2, 'triangle', 0.1);
    setTimeout(() => playTone(350, 0.2, 'triangle', 0.1), 150);
    setTimeout(() => playTone(300, 0.3, 'triangle', 0.08), 300);
  },

  /** Draw */
  draw() {
    playTone(440, 0.2, 'sine', 0.08);
    setTimeout(() => playTone(440, 0.3, 'sine', 0.06), 250);
  },

  /** Game start */
  gameStart() {
    playTone(330, 0.1, 'sine', 0.08);
    setTimeout(() => playTone(440, 0.1, 'sine', 0.08), 100);
    setTimeout(() => playTone(550, 0.15, 'sine', 0.1), 200);
  },

  /** Low time warning */
  lowTime() {
    playTone(1000, 0.06, 'square', 0.05);
  },

  /** Illegal move */
  illegal() {
    playTone(200, 0.15, 'sawtooth', 0.06);
  },

  /** Castling */
  castle() {
    playNoise(0.06, 0.1);
    setTimeout(() => playNoise(0.06, 0.1), 80);
    playTone(500, 0.08, 'sine', 0.06);
  },

  /** Promotion */
  promote() {
    playTone(440, 0.1, 'triangle', 0.08);
    setTimeout(() => playTone(660, 0.1, 'triangle', 0.08), 80);
    setTimeout(() => playTone(880, 0.15, 'triangle', 0.1), 160);
  }
};

const SOUND_KEY = 'vex-chess-sounds-enabled';

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function toggleSound(): boolean {
  const newVal = !isSoundEnabled();
  try {
    localStorage.setItem(SOUND_KEY, String(newVal));
  } catch {}
  return newVal;
}
