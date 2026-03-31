import { useCallback, useRef } from "react";

type SoundName =
  | "move"        // chess piece moved, domino placed
  | "capture"     // chess capture, backgammon hit
  | "check"       // chess check
  | "cardPlay"    // card played in tarneeb/baloot
  | "diceRoll"    // backgammon dice
  | "trickWin"    // trick taken
  | "gameWin"     // you won the game
  | "gameLose"    // you lost
  | "turnStart"   // your turn notification
  | "timer"       // low time warning
  | "draw"        // draw offered/accepted
  | "double";     // doubling cube

const SOUND_CONFIGS: Record<SoundName, { freq: number; dur: number; type: OscillatorType; gain: number; freq2?: number }> = {
  move:     { freq: 400, dur: 0.08, type: "sine", gain: 0.3 },
  capture:  { freq: 200, dur: 0.15, type: "sawtooth", gain: 0.25 },
  check:    { freq: 600, dur: 0.12, type: "square", gain: 0.2, freq2: 800 },
  cardPlay: { freq: 300, dur: 0.06, type: "triangle", gain: 0.25 },
  diceRoll: { freq: 150, dur: 0.25, type: "sawtooth", gain: 0.15 },
  trickWin: { freq: 500, dur: 0.2, type: "sine", gain: 0.3, freq2: 700 },
  gameWin:  { freq: 400, dur: 0.5, type: "sine", gain: 0.35, freq2: 800 },
  gameLose: { freq: 300, dur: 0.4, type: "sine", gain: 0.25, freq2: 150 },
  turnStart:{ freq: 440, dur: 0.1, type: "sine", gain: 0.2, freq2: 550 },
  timer:    { freq: 800, dur: 0.08, type: "square", gain: 0.15 },
  draw:     { freq: 350, dur: 0.15, type: "triangle", gain: 0.2, freq2: 350 },
  double:   { freq: 500, dur: 0.15, type: "square", gain: 0.2, freq2: 400 },
};

export function useGameSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback((name: SoundName) => {
    if (mutedRef.current) return;
    try {
      const ctx = getCtx();
      const cfg = SOUND_CONFIGS[name];
      if (!cfg) return;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = cfg.type;
      osc.frequency.setValueAtTime(cfg.freq, ctx.currentTime);
      if (cfg.freq2) {
        osc.frequency.linearRampToValueAtTime(cfg.freq2, ctx.currentTime + cfg.dur);
      }

      gainNode.gain.setValueAtTime(cfg.gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + cfg.dur);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + cfg.dur + 0.05);
    } catch {
      // Audio not available
    }
  }, [getCtx]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
  }, []);

  return { play, setMuted, isMuted: mutedRef.current };
}
