import { useEffect, useRef, useState } from "react";
import { playGameSound } from "@/lib/game-audio";

export interface UseGameTimerOpts {
  /** Initial milliseconds when timer is active for this side. */
  initialMs: number;
  /** Whether the timer should be ticking right now (e.g. it is this player's turn). */
  active: boolean;
  /** Called when the timer reaches zero. */
  onTimeout?: () => void;
  /** Threshold in ms below which `low=true` (default 10_000). */
  lowMs?: number;
  /** Play a tick sound every second when low. Defaults to true. */
  audibleLowTick?: boolean;
  /** Tick interval in ms. Default 200ms (smooth UI without burning CPU). */
  intervalMs?: number;
}

export interface GameTimerState {
  remainingMs: number;
  remainingSec: number;
  display: string; // mm:ss
  low: boolean;
  expired: boolean;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Drift-resistant per-side game clock.
 * Pauses when `active=false`. Calls `onTimeout` exactly once when reaching 0.
 */
export function useGameTimer(opts: UseGameTimerOpts): GameTimerState {
  const {
    initialMs,
    active,
    onTimeout,
    lowMs = 10_000,
    audibleLowTick = true,
    intervalMs = 200,
  } = opts;

  const [remainingMs, setRemainingMs] = useState(initialMs);
  const remainingRef = useRef(initialMs);
  const lastTickRef = useRef<number | null>(null);
  const firedTimeoutRef = useRef(false);
  const lastBeepSecRef = useRef<number>(-1);

  useEffect(() => {
    remainingRef.current = initialMs;
    setRemainingMs(initialMs);
    firedTimeoutRef.current = false;
    lastBeepSecRef.current = -1;
  }, [initialMs]);

  useEffect(() => {
    if (!active) {
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const last = lastTickRef.current ?? now;
      const dt = now - last;
      lastTickRef.current = now;
      const next = Math.max(0, remainingRef.current - dt);
      remainingRef.current = next;
      setRemainingMs(next);

      if (next <= lowMs && next > 0 && audibleLowTick) {
        const sec = Math.ceil(next / 1000);
        if (sec !== lastBeepSecRef.current) {
          lastBeepSecRef.current = sec;
          playGameSound("turnWarn");
        }
      }

      if (next <= 0 && !firedTimeoutRef.current) {
        firedTimeoutRef.current = true;
        playGameSound("timeout");
        onTimeout?.();
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, lowMs, audibleLowTick, intervalMs, onTimeout]);

  return {
    remainingMs,
    remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
    display: formatClock(remainingMs),
    low: remainingMs > 0 && remainingMs <= lowMs,
    expired: remainingMs <= 0,
  };
}
