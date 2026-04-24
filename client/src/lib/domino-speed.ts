import { useEffect, useState } from "react";

export type DominoSpeedMode = "normal" | "fast" | "turbo";

const STORAGE_KEY = "vex.dominoSpeedMode";
const CHANGE_EVENT = "vex:domino-speed-change";

export const DOMINO_SPEED_MODES: DominoSpeedMode[] = ["normal", "fast", "turbo"];

export const DOMINO_SPEED_MULTIPLIERS: Record<DominoSpeedMode, number> = {
    normal: 1,
    fast: 0.65,
    turbo: 0.4,
};

function isSpeedMode(value: unknown): value is DominoSpeedMode {
    return value === "normal" || value === "fast" || value === "turbo";
}

export function getDominoSpeedMode(): DominoSpeedMode {
    if (typeof window === "undefined") return "normal";
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (isSpeedMode(raw)) return raw;
    } catch {
        // localStorage may be unavailable (private browsing, SSR shell, etc.)
    }
    return "normal";
}

export function setDominoSpeedMode(mode: DominoSpeedMode): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // Ignore write failures — UI will still update via the event below.
    }
    try {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
    } catch {
        // Older runtimes may not support CustomEvent — listeners simply
        // wait for the next storage event instead.
    }
}

export function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getDominoSpeedMultiplier(mode: DominoSpeedMode = getDominoSpeedMode()): number {
    if (prefersReducedMotion()) return 0;
    return DOMINO_SPEED_MULTIPLIERS[mode] ?? 1;
}

export function useDominoSpeedMode(): DominoSpeedMode {
    const [mode, setMode] = useState<DominoSpeedMode>(() => getDominoSpeedMode());

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleChange = (event: Event) => {
            const detail = (event as CustomEvent<unknown>).detail;
            if (isSpeedMode(detail)) {
                setMode(detail);
            } else {
                setMode(getDominoSpeedMode());
            }
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY) {
                setMode(getDominoSpeedMode());
            }
        };

        window.addEventListener(CHANGE_EVENT, handleChange as EventListener);
        window.addEventListener("storage", handleStorage);
        return () => {
            window.removeEventListener(CHANGE_EVENT, handleChange as EventListener);
            window.removeEventListener("storage", handleStorage);
        };
    }, []);

    return mode;
}

export function useDominoSpeedMultiplier(): number {
    const mode = useDominoSpeedMode();
    const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        const handle = () => setReduced(mql.matches);
        if (typeof mql.addEventListener === "function") {
            mql.addEventListener("change", handle);
            return () => mql.removeEventListener("change", handle);
        }
        // Safari < 14 fallback
        mql.addListener(handle);
        return () => mql.removeListener(handle);
    }, []);

    if (reduced) return 0;
    return DOMINO_SPEED_MULTIPLIERS[mode] ?? 1;
}
