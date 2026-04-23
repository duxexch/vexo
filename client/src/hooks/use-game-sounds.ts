import { useCallback } from "react";
import { useGameAudio, type GameSoundName } from "./use-game-audio";

type LegacySoundName =
  | "move"
  | "capture"
  | "check"
  | "cardPlay"
  | "diceRoll"
  | "trickWin"
  | "gameWin"
  | "gameLose"
  | "turnStart"
  | "timer"
  | "draw"
  | "double";

const LEGACY_TO_NEW: Record<LegacySoundName, GameSoundName> = {
  move: "move",
  capture: "capture",
  check: "check",
  cardPlay: "cardPlay",
  diceRoll: "diceRoll",
  trickWin: "trickWin",
  gameWin: "gameWin",
  gameLose: "gameLose",
  turnStart: "turnStart",
  timer: "timer",
  draw: "drawOffer",
  double: "double",
};

/**
 * @deprecated Use `useGameAudio` from `@/hooks/use-game-audio` instead.
 * Kept for backwards-compat with existing callers.
 */
export function useGameSounds() {
  const { play, muted, setMuted } = useGameAudio();

  const playLegacy = useCallback((name: LegacySoundName) => {
    const mapped = LEGACY_TO_NEW[name];
    if (mapped) play(mapped);
  }, [play]);

  return { play: playLegacy, setMuted, isMuted: muted };
}
