export type GameSoundName =
  | "move"
  | "capture"
  | "check"
  | "checkmate"
  | "castle"
  | "promote"
  | "cardPlay"
  | "cardDeal"
  | "cardShuffle"
  | "cardFlip"
  | "diceRoll"
  | "diceShake"
  | "tilePlace"
  | "tileDraw"
  | "trickWin"
  | "gameStart"
  | "gameWin"
  | "gameLose"
  | "gameDraw"
  | "turnStart"
  | "turnWarn"
  | "timer"
  | "timeout"
  | "drawOffer"
  | "double"
  | "gift"
  | "chat"
  | "click"
  | "error"
  | "success"
  | "join"
  | "leave";

interface ToneSpec {
  freq: number;
  freq2?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  attack?: number;
  release?: number;
  delay?: number;
}

interface SoundSpec {
  url?: string;
  tones: ToneSpec[];
}

export const SOUND_LIBRARY: Record<GameSoundName, SoundSpec> = {
  move: { tones: [{ freq: 520, freq2: 380, dur: 0.07, type: "triangle", gain: 0.28, attack: 0.005, release: 0.05 }] },
  capture: {
    tones: [
      { freq: 220, freq2: 110, dur: 0.16, type: "sawtooth", gain: 0.32, attack: 0.005, release: 0.12 },
      { freq: 90, dur: 0.12, type: "square", gain: 0.18, attack: 0.005, release: 0.1, delay: 0.02 },
    ],
  },
  check: {
    tones: [
      { freq: 880, freq2: 1040, dur: 0.1, type: "square", gain: 0.22, attack: 0.005, release: 0.08 },
      { freq: 660, dur: 0.12, type: "triangle", gain: 0.18, attack: 0.005, release: 0.1, delay: 0.06 },
    ],
  },
  checkmate: {
    tones: [
      { freq: 440, freq2: 220, dur: 0.5, type: "sawtooth", gain: 0.32, attack: 0.01, release: 0.4 },
      { freq: 165, dur: 0.6, type: "sine", gain: 0.22, attack: 0.02, release: 0.5, delay: 0.05 },
    ],
  },
  castle: { tones: [{ freq: 360, freq2: 540, dur: 0.18, type: "triangle", gain: 0.26, attack: 0.005, release: 0.15 }] },
  promote: {
    tones: [
      { freq: 660, freq2: 990, dur: 0.18, type: "sine", gain: 0.28, attack: 0.005, release: 0.15 },
      { freq: 1320, dur: 0.14, type: "triangle", gain: 0.18, attack: 0.005, release: 0.12, delay: 0.08 },
    ],
  },
  cardPlay: { tones: [{ freq: 320, freq2: 240, dur: 0.07, type: "triangle", gain: 0.24, attack: 0.003, release: 0.06 }] },
  cardDeal: { tones: [{ freq: 280, freq2: 180, dur: 0.05, type: "triangle", gain: 0.22, attack: 0.003, release: 0.04 }] },
  cardShuffle: {
    tones: [
      { freq: 200, freq2: 240, dur: 0.04, type: "sawtooth", gain: 0.18, attack: 0.002, release: 0.035 },
      { freq: 220, freq2: 260, dur: 0.04, type: "sawtooth", gain: 0.18, attack: 0.002, release: 0.035, delay: 0.05 },
      { freq: 240, freq2: 280, dur: 0.04, type: "sawtooth", gain: 0.18, attack: 0.002, release: 0.035, delay: 0.1 },
    ],
  },
  cardFlip: { tones: [{ freq: 400, freq2: 600, dur: 0.06, type: "triangle", gain: 0.2, attack: 0.003, release: 0.05 }] },
  diceRoll: {
    tones: [
      { freq: 180, freq2: 90, dur: 0.06, type: "sawtooth", gain: 0.18, attack: 0.002, release: 0.05 },
      { freq: 200, freq2: 110, dur: 0.06, type: "sawtooth", gain: 0.18, attack: 0.002, release: 0.05, delay: 0.07 },
      { freq: 160, freq2: 80, dur: 0.07, type: "sawtooth", gain: 0.2, attack: 0.002, release: 0.06, delay: 0.15 },
    ],
  },
  diceShake: { tones: [{ freq: 140, freq2: 200, dur: 0.18, type: "sawtooth", gain: 0.16, attack: 0.005, release: 0.15 }] },
  tilePlace: {
    tones: [
      { freq: 240, freq2: 160, dur: 0.08, type: "square", gain: 0.26, attack: 0.003, release: 0.07 },
      { freq: 110, dur: 0.06, type: "sine", gain: 0.16, attack: 0.005, release: 0.05, delay: 0.02 },
    ],
  },
  tileDraw: { tones: [{ freq: 320, freq2: 220, dur: 0.06, type: "triangle", gain: 0.2, attack: 0.003, release: 0.05 }] },
  trickWin: {
    tones: [
      { freq: 520, freq2: 780, dur: 0.18, type: "sine", gain: 0.3, attack: 0.005, release: 0.15 },
      { freq: 880, dur: 0.18, type: "triangle", gain: 0.22, attack: 0.005, release: 0.15, delay: 0.08 },
    ],
  },
  gameStart: {
    tones: [
      { freq: 440, freq2: 660, dur: 0.18, type: "sine", gain: 0.28, attack: 0.005, release: 0.15 },
      { freq: 880, dur: 0.18, type: "triangle", gain: 0.2, attack: 0.005, release: 0.15, delay: 0.1 },
      { freq: 1320, dur: 0.22, type: "sine", gain: 0.18, attack: 0.005, release: 0.18, delay: 0.22 },
    ],
  },
  gameWin: {
    tones: [
      { freq: 523, dur: 0.16, type: "sine", gain: 0.32, attack: 0.005, release: 0.14 },
      { freq: 659, dur: 0.16, type: "sine", gain: 0.32, attack: 0.005, release: 0.14, delay: 0.16 },
      { freq: 784, dur: 0.16, type: "sine", gain: 0.32, attack: 0.005, release: 0.14, delay: 0.32 },
      { freq: 1047, dur: 0.5, type: "triangle", gain: 0.28, attack: 0.005, release: 0.45, delay: 0.48 },
    ],
  },
  gameLose: {
    tones: [
      { freq: 440, freq2: 220, dur: 0.4, type: "sine", gain: 0.28, attack: 0.01, release: 0.35 },
      { freq: 165, freq2: 110, dur: 0.5, type: "sawtooth", gain: 0.2, attack: 0.02, release: 0.4, delay: 0.15 },
    ],
  },
  gameDraw: {
    tones: [
      { freq: 392, dur: 0.18, type: "sine", gain: 0.26, attack: 0.005, release: 0.15 },
      { freq: 392, dur: 0.18, type: "sine", gain: 0.26, attack: 0.005, release: 0.15, delay: 0.22 },
    ],
  },
  turnStart: { tones: [{ freq: 660, freq2: 880, dur: 0.12, type: "sine", gain: 0.22, attack: 0.005, release: 0.1 }] },
  turnWarn: {
    tones: [
      { freq: 880, dur: 0.08, type: "square", gain: 0.18, attack: 0.003, release: 0.07 },
      { freq: 880, dur: 0.08, type: "square", gain: 0.18, attack: 0.003, release: 0.07, delay: 0.15 },
    ],
  },
  timer: { tones: [{ freq: 1000, dur: 0.05, type: "square", gain: 0.14, attack: 0.002, release: 0.04 }] },
  timeout: {
    tones: [
      { freq: 220, freq2: 110, dur: 0.6, type: "sawtooth", gain: 0.3, attack: 0.005, release: 0.55 },
    ],
  },
  drawOffer: { tones: [{ freq: 440, freq2: 440, dur: 0.18, type: "triangle", gain: 0.22, attack: 0.005, release: 0.15 }] },
  double: { tones: [{ freq: 600, freq2: 400, dur: 0.16, type: "square", gain: 0.22, attack: 0.005, release: 0.13 }] },
  gift: {
    tones: [
      { freq: 880, freq2: 1320, dur: 0.18, type: "sine", gain: 0.26, attack: 0.005, release: 0.15 },
      { freq: 1760, dur: 0.14, type: "triangle", gain: 0.18, attack: 0.005, release: 0.12, delay: 0.1 },
    ],
  },
  chat: { tones: [{ freq: 600, freq2: 800, dur: 0.05, type: "sine", gain: 0.18, attack: 0.003, release: 0.04 }] },
  click: { tones: [{ freq: 400, dur: 0.03, type: "triangle", gain: 0.16, attack: 0.001, release: 0.025 }] },
  error: {
    tones: [
      { freq: 220, freq2: 165, dur: 0.18, type: "sawtooth", gain: 0.22, attack: 0.005, release: 0.15 },
    ],
  },
  success: {
    tones: [
      { freq: 660, freq2: 990, dur: 0.14, type: "sine", gain: 0.26, attack: 0.005, release: 0.12 },
    ],
  },
  join: { tones: [{ freq: 440, freq2: 660, dur: 0.16, type: "triangle", gain: 0.22, attack: 0.005, release: 0.13 }] },
  leave: { tones: [{ freq: 660, freq2: 440, dur: 0.16, type: "triangle", gain: 0.2, attack: 0.005, release: 0.13 }] },
};

const STORAGE_VOLUME = "vex.gameAudio.volume";
const STORAGE_MUTED = "vex.gameAudio.muted";

let sharedCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let volume = 0.7;
const sampleCache = new Map<string, AudioBuffer>();
const listeners = new Set<() => void>();

function loadPrefs() {
  if (typeof window === "undefined") return;
  try {
    const v = window.localStorage.getItem(STORAGE_VOLUME);
    const m = window.localStorage.getItem(STORAGE_MUTED);
    if (v !== null) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) volume = Math.min(1, Math.max(0, parsed));
    }
    if (m !== null) muted = m === "1";
  } catch {
    // localStorage may be unavailable
  }
}
loadPrefs();

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    masterGain = sharedCtx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(sharedCtx.destination);
    return sharedCtx;
  } catch {
    return null;
  }
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

async function loadSample(url: string): Promise<AudioBuffer | null> {
  if (sampleCache.has(url)) return sampleCache.get(url) ?? null;
  const ctx = ensureCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    sampleCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function playTone(spec: ToneSpec, when: number) {
  const ctx = ensureCtx();
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, when);
  if (spec.freq2 !== undefined) {
    osc.frequency.linearRampToValueAtTime(spec.freq2, when + spec.dur);
  }
  const attack = spec.attack ?? 0.005;
  const release = spec.release ?? Math.max(0.02, spec.dur - attack);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(spec.gain, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(when);
  osc.stop(when + spec.dur + 0.05);
}

export function playGameSound(name: GameSoundName) {
  if (muted) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  const spec = SOUND_LIBRARY[name];
  if (!spec) return;

  if (spec.url) {
    void loadSample(spec.url).then((buf) => {
      if (!buf || !sharedCtx || !masterGain) return playToneFallback(spec, sharedCtx?.currentTime ?? 0);
      const src = sharedCtx.createBufferSource();
      src.buffer = buf;
      src.connect(masterGain);
      src.start();
    });
    return;
  }

  playToneFallback(spec, ctx.currentTime);
}

function playToneFallback(spec: SoundSpec, baseTime: number) {
  for (const tone of spec.tones) {
    playTone(tone, baseTime + (tone.delay ?? 0));
  }
}

export function setGameVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (masterGain && !muted) masterGain.gain.value = volume;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_VOLUME, String(volume)); } catch { /* ignore */ }
  }
  notify();
}

export function setGameMuted(m: boolean) {
  muted = m;
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_MUTED, m ? "1" : "0"); } catch { /* ignore */ }
  }
  notify();
}

export function getGameVolume() { return volume; }
export function getGameMuted() { return muted; }

export function subscribeGameAudio(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resumeAudioContext() {
  const ctx = ensureCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

let unlockBound = false;
/**
 * Install a one-time first-gesture handler that creates + resumes the AudioContext.
 * Required for iOS Safari and other autoplay-restricted browsers where the very
 * first sound can otherwise drop. Safe to call multiple times.
 */
export function installAudioGestureUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  const handler = () => {
    const ctx = ensureCtx();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    events.forEach((evt) => window.removeEventListener(evt, handler));
  };
  events.forEach((evt) => window.addEventListener(evt, handler, { once: false, passive: true }));
}
