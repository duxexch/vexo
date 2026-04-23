import { useCallback, useEffect, useState } from "react";
import {
  playGameSound,
  setGameVolume,
  setGameMuted,
  getGameVolume,
  getGameMuted,
  subscribeGameAudio,
  resumeAudioContext,
  type GameSoundName,
} from "@/lib/game-audio";

export type { GameSoundName } from "@/lib/game-audio";

export function useGameAudio() {
  const [volume, setVolumeState] = useState(getGameVolume());
  const [muted, setMutedState] = useState(getGameMuted());

  useEffect(() => {
    const unsub = subscribeGameAudio(() => {
      setVolumeState(getGameVolume());
      setMutedState(getGameMuted());
    });
    return () => { unsub(); };
  }, []);

  const play = useCallback((name: GameSoundName) => {
    resumeAudioContext();
    playGameSound(name);
  }, []);

  const setVolume = useCallback((v: number) => setGameVolume(v), []);
  const setMuted = useCallback((m: boolean) => setGameMuted(m), []);
  const toggleMute = useCallback(() => setGameMuted(!getGameMuted()), []);

  return { play, volume, muted, setVolume, setMuted, toggleMute };
}
