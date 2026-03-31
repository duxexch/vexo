/**
 * Game Start Cinematic Sound Effects — Web Audio API synthesized
 * Dramatic sounds for the VS intro, countdown, and game start.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch {}
}

function noise(dur: number, vol = 0.06) {
  try {
    const ctx = getCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, ctx.currentTime);
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start();
  } catch {}
}

export const cinematicSounds = {
  /** Dramatic whoosh for player card entrance */
  whoosh() {
    noise(0.25, 0.1);
    tone(200, 0.2, 'sine', 0.04);
    tone(800, 0.15, 'sine', 0.03);
  },

  /** VS impact — dramatic hit when VS appears */
  vsImpact() {
    noise(0.4, 0.15);
    tone(120, 0.3, 'triangle', 0.12);
    tone(60, 0.5, 'sine', 0.08);
    setTimeout(() => {
      tone(180, 0.2, 'triangle', 0.06);
    }, 100);
  },

  /** Countdown tick — 3, 2, 1 */
  countdownTick() {
    tone(800, 0.08, 'square', 0.06);
    tone(400, 0.06, 'sine', 0.04);
  },

  /** GO! — epic start fanfare */
  gameStartFanfare() {
    tone(440, 0.12, 'triangle', 0.1);
    setTimeout(() => tone(554, 0.12, 'triangle', 0.1), 80);
    setTimeout(() => tone(659, 0.12, 'triangle', 0.1), 160);
    setTimeout(() => {
      tone(880, 0.35, 'triangle', 0.14);
      tone(440, 0.35, 'sine', 0.06);
      noise(0.15, 0.08);
    }, 240);
  },

  /** Team formation sound for 4-player games */
  teamForm() {
    tone(330, 0.1, 'sine', 0.06);
    setTimeout(() => tone(440, 0.1, 'sine', 0.06), 60);
    setTimeout(() => tone(550, 0.12, 'sine', 0.08), 120);
  }
};
