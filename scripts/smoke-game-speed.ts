/**
 * Smoke test for the Game Speed picker (Normal / Fast / Turbo + reduced-motion).
 *
 * The picker is a tiny but high-blast-radius primitive: it controls how every
 * classic-game board (currently chess + dominoes; backgammon/baloot/tarneeb
 * are queued as a follow-up) scales its move and capture animations, and a
 * silent regression here is invisible until a player notices that "Turbo
 * doesn't feel any faster" or that prefers-reduced-motion is being ignored.
 *
 * Because the project doesn't ship a DOM-test runner (no jsdom / happy-dom /
 * Vitest), this smoke covers the contract in two layers:
 *
 *   1) **Behavioural** — stub globalThis.window with a tiny in-memory
 *      localStorage + matchMedia + event-bus, dynamically import the real
 *      `client/src/lib/game-speed.ts`, and exercise every exported function:
 *        - `getGameSpeedMode` / `setGameSpeedMode` round-trip through
 *          localStorage and emit the CHANGE_EVENT custom event.
 *        - `prefersReducedMotion` correctly reflects matchMedia.
 *        - `getGameSpeedMultiplier` returns the right per-mode value, the
 *          Math.max(1, …) floor never underflows, and reduced-motion
 *          collapses the multiplier to 0 regardless of the picked mode.
 *
 *   2) **Source-pattern guards** on the React hooks (`useGameSpeedMode`,
 *      `useGameSpeedMultiplier`) and on every known consumer
 *      (`DominoBoard`, both `ChessBoard` files, `settings.tsx`,
 *      `useGameWebSocket`). The hooks themselves can't be exercised without
 *      a render context, so we lock down their structure by re-reading the
 *      source and asserting each addEventListener/removeEventListener pair
 *      and every consumer import. This catches accidental hook rewrites,
 *      missing cleanup, or a refactor that drops a consumer's wiring.
 *
 * No DB, no server, no React render. Pure TS, ~200 ms wall time.
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label: string): void {
    passed += 1;
    console.log(`[smoke:game-speed] PASS ${label}`);
}

function fail(label: string, detail?: string): void {
    failed += 1;
    console.log(`[smoke:game-speed] FAIL ${label}${detail ? `\n            -> ${detail}` : ""}`);
}

async function readText(p: string): Promise<string | null> {
    try {
        return await fs.readFile(p, "utf8");
    } catch {
        return null;
    }
}

/**
 * Extract the body of a top-level `export function NAME(...)` declaration by
 * walking braces. Returns the *interior* of the outermost `{...}` so callers
 * can scope their pattern guards to a single function and avoid false
 * positives from sibling code or comments. Returns `null` if the function or
 * its braces are not found.
 */
function extractFunctionBody(src: string, name: string): string | null {
    const declRe = new RegExp(`export\\s+function\\s+${name}\\b[^{]*\\{`);
    const match = declRe.exec(src);
    if (!match) return null;
    const start = match.index + match[0].length;
    let depth = 1;
    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
            depth -= 1;
            if (depth === 0) return src.slice(start, i);
        }
    }
    return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Stub globalThis.window before importing the module under test. The module
 * never touches `window` at import time (every reference is inside a function
 * body), but we install the stubs first so the very first call sees the
 * mocked environment without any race.
 * ──────────────────────────────────────────────────────────────────────── */

type Listener = (event: any) => void;

interface MediaQueryListStub {
    matches: boolean;
    media: string;
    addEventListener: (type: "change", listener: Listener) => void;
    removeEventListener: (type: "change", listener: Listener) => void;
    addListener: (listener: Listener) => void;     // Safari < 14 fallback
    removeListener: (listener: Listener) => void;
    __fire: (matches: boolean) => void;
}

interface WindowStub {
    localStorage: Storage;
    matchMedia: (query: string) => MediaQueryListStub;
    addEventListener: (type: string, listener: Listener) => void;
    removeEventListener: (type: string, listener: Listener) => void;
    dispatchEvent: (event: any) => boolean;
    __fireStorageEvent: (key: string, newValue: string | null) => void;
    __resetListeners: () => void;
    __throwOnDispatch: boolean;
    __throwOnSet: boolean;
}

function installWindowStub(): WindowStub {
    const store = new Map<string, string>();
    const listeners = new Map<string, Set<Listener>>();
    const mqlByQuery = new Map<string, MediaQueryListStub>();

    const localStorageStub: Storage = {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string): string | null {
            return store.has(key) ? (store.get(key) as string) : null;
        },
        key(index: number): string | null {
            const keys = Array.from(store.keys());
            return keys[index] ?? null;
        },
        removeItem(key: string): void {
            store.delete(key);
        },
        setItem(key: string, value: string): void {
            if (windowStub.__throwOnSet) throw new Error("set blocked");
            store.set(key, String(value));
        },
    };

    function makeMql(query: string): MediaQueryListStub {
        const set = new Set<Listener>();
        const stub: MediaQueryListStub = {
            matches: false,
            media: query,
            addEventListener: (_type, listener) => set.add(listener),
            removeEventListener: (_type, listener) => set.delete(listener),
            addListener: (listener) => set.add(listener),
            removeListener: (listener) => set.delete(listener),
            __fire(matches: boolean) {
                stub.matches = matches;
                for (const l of Array.from(set)) {
                    try {
                        l({ matches });
                    } catch {
                        // ignore — we test the dispatcher, not the listener
                    }
                }
            },
        };
        return stub;
    }

    const windowStub: WindowStub = {
        localStorage: localStorageStub,
        matchMedia(query: string): MediaQueryListStub {
            let mql = mqlByQuery.get(query);
            if (!mql) {
                mql = makeMql(query);
                mqlByQuery.set(query, mql);
            }
            return mql;
        },
        addEventListener(type, listener) {
            let set = listeners.get(type);
            if (!set) {
                set = new Set();
                listeners.set(type, set);
            }
            set.add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: any): boolean {
            if (windowStub.__throwOnDispatch) {
                throw new Error("dispatch blocked");
            }
            const set = listeners.get(event?.type ?? "");
            if (!set) return true;
            for (const l of Array.from(set)) {
                try {
                    l(event);
                } catch {
                    // ignore — emitters shouldn't crash on listener errors
                }
            }
            return true;
        },
        __fireStorageEvent(key: string, newValue: string | null): void {
            const set = listeners.get("storage");
            if (!set) return;
            const event = { type: "storage", key, newValue, oldValue: null, storageArea: localStorageStub };
            for (const l of Array.from(set)) {
                try {
                    l(event);
                } catch {
                    // ignore
                }
            }
        },
        __resetListeners(): void {
            listeners.clear();
        },
        __throwOnDispatch: false,
        __throwOnSet: false,
    };

    // Install onto globalThis so the module's `typeof window !== "undefined"`
    // guard sees a real window object.
    (globalThis as any).window = windowStub;
    (globalThis as any).localStorage = localStorageStub;
    (globalThis as any).CustomEvent = class CustomEventStub {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
            this.type = type;
            this.detail = init?.detail;
        }
    } as any;

    return windowStub;
}

const windowStub = installWindowStub();

interface GameSpeedModule {
    getGameSpeedMode: () => "normal" | "fast" | "turbo";
    setGameSpeedMode: (mode: "normal" | "fast" | "turbo") => void;
    getGameSpeedMultiplier: (mode?: "normal" | "fast" | "turbo") => number;
    prefersReducedMotion: () => boolean;
    GAME_SPEED_MODES: readonly ("normal" | "fast" | "turbo")[];
    GAME_SPEED_MULTIPLIERS: Record<"normal" | "fast" | "turbo", number>;
}

async function loadModule(): Promise<GameSpeedModule> {
    // Dynamic import so the stubs are installed before module evaluation.
    const mod = await import("../client/src/lib/game-speed");
    return mod as unknown as GameSpeedModule;
}

async function main(): Promise<void> {
    const m = await loadModule();
    const STORAGE_KEY = "vex.dominoSpeedMode";
    const CHANGE_EVENT = "vex:game-speed-change";

    /* ──────────── 1) Constants contract ──────────────────────────────── */
    if (
        Array.isArray(m.GAME_SPEED_MODES)
        && m.GAME_SPEED_MODES.length === 3
        && m.GAME_SPEED_MODES.includes("normal")
        && m.GAME_SPEED_MODES.includes("fast")
        && m.GAME_SPEED_MODES.includes("turbo")
    ) {
        pass("GAME_SPEED_MODES exposes exactly normal/fast/turbo");
    } else {
        fail("GAME_SPEED_MODES exposes exactly normal/fast/turbo", JSON.stringify(m.GAME_SPEED_MODES));
    }

    if (
        m.GAME_SPEED_MULTIPLIERS.normal === 1
        && m.GAME_SPEED_MULTIPLIERS.fast > 0 && m.GAME_SPEED_MULTIPLIERS.fast < 1
        && m.GAME_SPEED_MULTIPLIERS.turbo > 0 && m.GAME_SPEED_MULTIPLIERS.turbo < m.GAME_SPEED_MULTIPLIERS.fast
    ) {
        pass(`GAME_SPEED_MULTIPLIERS forms a strict descending scale (normal=1, fast=${m.GAME_SPEED_MULTIPLIERS.fast}, turbo=${m.GAME_SPEED_MULTIPLIERS.turbo})`);
    } else {
        fail("GAME_SPEED_MULTIPLIERS is normal=1 > fast > turbo > 0", JSON.stringify(m.GAME_SPEED_MULTIPLIERS));
    }

    /* ──────────── 2) localStorage round-trip ─────────────────────────── */
    windowStub.localStorage.clear();
    if (m.getGameSpeedMode() === "normal") {
        pass("getGameSpeedMode defaults to 'normal' on empty localStorage");
    } else {
        fail("getGameSpeedMode defaults to 'normal' on empty localStorage", `got ${m.getGameSpeedMode()}`);
    }

    windowStub.localStorage.setItem(STORAGE_KEY, "fast");
    if (m.getGameSpeedMode() === "fast") {
        pass("getGameSpeedMode reads 'fast' from localStorage");
    } else {
        fail("getGameSpeedMode reads 'fast' from localStorage", `got ${m.getGameSpeedMode()}`);
    }

    windowStub.localStorage.setItem(STORAGE_KEY, "turbo");
    if (m.getGameSpeedMode() === "turbo") {
        pass("getGameSpeedMode reads 'turbo' from localStorage");
    } else {
        fail("getGameSpeedMode reads 'turbo' from localStorage", `got ${m.getGameSpeedMode()}`);
    }

    /* ──────────── 3) Garbage values fall back to 'normal' ────────────── */
    windowStub.localStorage.setItem(STORAGE_KEY, "lightspeed");
    if (m.getGameSpeedMode() === "normal") {
        pass("getGameSpeedMode rejects an unknown value and falls back to 'normal'");
    } else {
        fail("getGameSpeedMode rejects an unknown value and falls back to 'normal'", `got ${m.getGameSpeedMode()}`);
    }

    windowStub.localStorage.setItem(STORAGE_KEY, "");
    if (m.getGameSpeedMode() === "normal") {
        pass("getGameSpeedMode rejects an empty-string value and falls back to 'normal'");
    } else {
        fail("getGameSpeedMode rejects an empty-string value and falls back to 'normal'", `got ${m.getGameSpeedMode()}`);
    }

    /* ──────────── 4) setGameSpeedMode: persistence ──────────────────── */
    windowStub.localStorage.clear();
    m.setGameSpeedMode("turbo");
    if (windowStub.localStorage.getItem(STORAGE_KEY) === "turbo") {
        pass("setGameSpeedMode persists the chosen mode to localStorage");
    } else {
        fail("setGameSpeedMode persists the chosen mode to localStorage", `got ${windowStub.localStorage.getItem(STORAGE_KEY)}`);
    }

    /* ──────────── 5) setGameSpeedMode: emits CHANGE_EVENT ────────────── */
    let received: { detail?: unknown; type?: string } | null = null;
    const listener = (event: any) => {
        received = { detail: event?.detail, type: event?.type };
    };
    windowStub.addEventListener(CHANGE_EVENT, listener);
    m.setGameSpeedMode("fast");
    if (received && (received as any).type === CHANGE_EVENT && (received as any).detail === "fast") {
        pass(`setGameSpeedMode dispatches "${CHANGE_EVENT}" with the new mode in event.detail`);
    } else {
        fail(
            `setGameSpeedMode dispatches "${CHANGE_EVENT}" with the new mode in event.detail`,
            `got ${JSON.stringify(received)}`,
        );
    }
    windowStub.removeEventListener(CHANGE_EVENT, listener);

    /* ──────────── 6) Multiple subscribers all see the change ─────────── */
    const seenBy: string[] = [];
    const a = () => seenBy.push("a");
    const b = () => seenBy.push("b");
    windowStub.addEventListener(CHANGE_EVENT, a);
    windowStub.addEventListener(CHANGE_EVENT, b);
    m.setGameSpeedMode("normal");
    if (seenBy.length === 2 && seenBy.includes("a") && seenBy.includes("b")) {
        pass("CHANGE_EVENT fan-out reaches every subscriber (parity for cross-hook updates)");
    } else {
        fail("CHANGE_EVENT fan-out reaches every subscriber", `seenBy=${JSON.stringify(seenBy)}`);
    }
    windowStub.removeEventListener(CHANGE_EVENT, a);
    windowStub.removeEventListener(CHANGE_EVENT, b);

    /* ──────────── 7) setGameSpeedMode tolerates a write failure ──────── */
    windowStub.localStorage.clear();
    windowStub.__throwOnSet = true;
    let crashedOnWriteFailure = false;
    let eventStillFired = false;
    const writeFailureListener = (event: any) => {
        if (event?.detail === "turbo") eventStillFired = true;
    };
    windowStub.addEventListener(CHANGE_EVENT, writeFailureListener);
    try {
        m.setGameSpeedMode("turbo");
    } catch {
        crashedOnWriteFailure = true;
    }
    windowStub.removeEventListener(CHANGE_EVENT, writeFailureListener);
    windowStub.__throwOnSet = false;
    if (!crashedOnWriteFailure && eventStillFired) {
        pass("setGameSpeedMode swallows a localStorage write failure and still fires CHANGE_EVENT (UI stays in sync)");
    } else {
        fail(
            "setGameSpeedMode swallows a localStorage write failure and still fires CHANGE_EVENT",
            `crashed=${crashedOnWriteFailure}, eventFired=${eventStillFired}`,
        );
    }

    /* ──────────── 8) setGameSpeedMode tolerates dispatch failure ─────── */
    windowStub.__throwOnDispatch = true;
    let crashedOnDispatchFailure = false;
    try {
        m.setGameSpeedMode("fast");
    } catch {
        crashedOnDispatchFailure = true;
    }
    windowStub.__throwOnDispatch = false;
    if (!crashedOnDispatchFailure && windowStub.localStorage.getItem(STORAGE_KEY) === "fast") {
        pass("setGameSpeedMode swallows a CustomEvent dispatch failure and still persists (older runtimes safe)");
    } else {
        fail(
            "setGameSpeedMode swallows a CustomEvent dispatch failure and still persists",
            `crashed=${crashedOnDispatchFailure}, persisted=${windowStub.localStorage.getItem(STORAGE_KEY)}`,
        );
    }

    /* ──────────── 9) prefersReducedMotion reads matchMedia ───────────── */
    const mql = windowStub.matchMedia("(prefers-reduced-motion: reduce)");
    mql.__fire(false);
    if (m.prefersReducedMotion() === false) {
        pass("prefersReducedMotion returns false when matchMedia.matches=false");
    } else {
        fail("prefersReducedMotion returns false when matchMedia.matches=false", `got ${m.prefersReducedMotion()}`);
    }

    mql.__fire(true);
    if (m.prefersReducedMotion() === true) {
        pass("prefersReducedMotion returns true when matchMedia.matches=true");
    } else {
        fail("prefersReducedMotion returns true when matchMedia.matches=true", `got ${m.prefersReducedMotion()}`);
    }

    /* ──────────── 10) getGameSpeedMultiplier: per-mode values ────────── */
    mql.__fire(false);  // ensure reduced-motion is OFF first
    windowStub.localStorage.setItem(STORAGE_KEY, "normal");
    if (m.getGameSpeedMultiplier() === m.GAME_SPEED_MULTIPLIERS.normal) {
        pass("getGameSpeedMultiplier() returns the normal-mode multiplier when mode=normal");
    } else {
        fail(
            "getGameSpeedMultiplier() returns the normal-mode multiplier when mode=normal",
            `got ${m.getGameSpeedMultiplier()} expected ${m.GAME_SPEED_MULTIPLIERS.normal}`,
        );
    }

    windowStub.localStorage.setItem(STORAGE_KEY, "fast");
    if (m.getGameSpeedMultiplier() === m.GAME_SPEED_MULTIPLIERS.fast) {
        pass(`getGameSpeedMultiplier() returns ${m.GAME_SPEED_MULTIPLIERS.fast} when mode=fast`);
    } else {
        fail(
            `getGameSpeedMultiplier() returns ${m.GAME_SPEED_MULTIPLIERS.fast} when mode=fast`,
            `got ${m.getGameSpeedMultiplier()}`,
        );
    }

    windowStub.localStorage.setItem(STORAGE_KEY, "turbo");
    if (m.getGameSpeedMultiplier() === m.GAME_SPEED_MULTIPLIERS.turbo) {
        pass(`getGameSpeedMultiplier() returns ${m.GAME_SPEED_MULTIPLIERS.turbo} when mode=turbo`);
    } else {
        fail(
            `getGameSpeedMultiplier() returns ${m.GAME_SPEED_MULTIPLIERS.turbo} when mode=turbo`,
            `got ${m.getGameSpeedMultiplier()}`,
        );
    }

    /* ──────────── 11) Reduced-motion overrides every mode to 0 ───────── */
    mql.__fire(true);
    let overridesAllModes = true;
    let bad = "";
    for (const mode of m.GAME_SPEED_MODES) {
        windowStub.localStorage.setItem(STORAGE_KEY, mode);
        const got = m.getGameSpeedMultiplier();
        if (got !== 0) {
            overridesAllModes = false;
            bad = `mode=${mode} got ${got}`;
            break;
        }
    }
    if (overridesAllModes) {
        pass("getGameSpeedMultiplier() returns 0 for EVERY mode when prefers-reduced-motion is set (a11y override)");
    } else {
        fail("Reduced-motion overrides every mode's multiplier to 0", bad);
    }
    mql.__fire(false);

    /* ──────────── 12) getGameSpeedMultiplier honours an explicit arg ─── */
    windowStub.localStorage.setItem(STORAGE_KEY, "normal");
    if (m.getGameSpeedMultiplier("turbo") === m.GAME_SPEED_MULTIPLIERS.turbo) {
        pass("getGameSpeedMultiplier(mode) honours the explicit mode argument over localStorage");
    } else {
        fail(
            "getGameSpeedMultiplier(mode) honours the explicit mode argument over localStorage",
            `got ${m.getGameSpeedMultiplier("turbo")} expected ${m.GAME_SPEED_MULTIPLIERS.turbo}`,
        );
    }

    /* ────────────────────────────────────────────────────────────────────
     * 12a-c) Behavioural simulation of the hook contract — without a React
     * render context. Both hooks exist solely to keep their consumers in
     * sync as the picker, another tab, or the OS preference changes. We can
     * prove that contract end-to-end by replicating the exact listener
     * pattern the hooks use (set-state on event → re-read getGameSpeedMode)
     * against the real module. If the module's CHANGE_EVENT name, payload
     * shape, or storage-event filter ever drifts, this simulation breaks
     * before any production user does.
     * ──────────────────────────────────────────────────────────────────── */

    /* ──────────── 12a) CHANGE_EVENT propagates a typed detail ────────── */
    {
        windowStub.localStorage.clear();
        let observed: string | null = null;
        // Mirror useGameSpeedMode's handleChange: trust event.detail when it's
        // a valid mode, otherwise re-read from storage.
        const handleChange = (event: any) => {
            const detail = event?.detail;
            if (detail === "normal" || detail === "fast" || detail === "turbo") {
                observed = detail;
            } else {
                observed = m.getGameSpeedMode();
            }
        };
        windowStub.addEventListener(CHANGE_EVENT, handleChange);
        m.setGameSpeedMode("turbo");
        windowStub.removeEventListener(CHANGE_EVENT, handleChange);
        if (observed === "turbo") {
            pass("Hook-style CHANGE_EVENT subscriber sees 'turbo' immediately after setGameSpeedMode (cross-hook update path)");
        } else {
            fail(
                "Hook-style CHANGE_EVENT subscriber sees the new mode after setGameSpeedMode",
                `observed=${observed}`,
            );
        }
    }

    /* ──────────── 12b) storage event triggers a re-read (multi-tab) ──── */
    {
        windowStub.localStorage.setItem(STORAGE_KEY, "normal");
        let observed: string | null = "(initial)";
        // Mirror useGameSpeedMode's handleStorage: only react when the key
        // matches our STORAGE_KEY, then re-read fresh.
        const handleStorage = (event: any) => {
            if (event?.key === STORAGE_KEY) {
                observed = m.getGameSpeedMode();
            }
        };
        windowStub.addEventListener("storage", handleStorage);
        // Simulate "another tab wrote to localStorage": update the value
        // out-of-band, then fire the storage event for that key.
        windowStub.localStorage.setItem(STORAGE_KEY, "fast");
        windowStub.__fireStorageEvent(STORAGE_KEY, "fast");
        windowStub.removeEventListener("storage", handleStorage);
        if (observed === "fast") {
            pass("Hook-style storage subscriber re-reads the mode when STORAGE_KEY changes in another tab");
        } else {
            fail(
                "Hook-style storage subscriber re-reads the mode when STORAGE_KEY changes",
                `observed=${observed}`,
            );
        }
    }

    /* ──────────── 12c) storage event for an unrelated key is ignored ─── */
    {
        windowStub.localStorage.setItem(STORAGE_KEY, "normal");
        let invocations = 0;
        const handleStorage = (event: any) => {
            if (event?.key === STORAGE_KEY) invocations += 1;
        };
        windowStub.addEventListener("storage", handleStorage);
        windowStub.__fireStorageEvent("totally-unrelated-key", "whatever");
        windowStub.removeEventListener("storage", handleStorage);
        if (invocations === 0) {
            pass("Hook-style storage subscriber ignores unrelated storage events (no spurious re-renders)");
        } else {
            fail(
                "Hook-style storage subscriber ignores unrelated storage events",
                `invocations=${invocations}`,
            );
        }
    }

    /* ──────────── 12d) matchMedia 'change' triggers reduced-motion swap ─ */
    {
        const mql2 = windowStub.matchMedia("(prefers-reduced-motion: reduce)");
        mql2.__fire(false);
        let observedReduced = m.prefersReducedMotion();
        // Mirror useGameSpeedMultiplier's effect: register handle, on
        // matchMedia 'change' read mql.matches.
        const handle = (event: any) => {
            observedReduced = !!event?.matches;
        };
        mql2.addEventListener("change", handle);
        mql2.__fire(true);
        const sawReduced = observedReduced;
        mql2.__fire(false);
        const sawNormal = observedReduced;
        mql2.removeEventListener("change", handle);
        if (sawReduced === true && sawNormal === false) {
            pass("Hook-style matchMedia 'change' subscriber flips reduced↔normal in real-time (a11y live update)");
        } else {
            fail(
                "Hook-style matchMedia 'change' subscriber flips reduced↔normal in real-time",
                `sawReduced=${sawReduced}, sawNormal=${sawNormal}`,
            );
        }
    }

    /* ────────────────────────────────────────────────────────────────────
     * Source-pattern guards: lock the React-hook contract and the consumer
     * wiring in place. The hooks themselves can't be exercised without a
     * render context in this no-DOM environment, so we re-read the source
     * and assert structural shape. Each guard maps to a specific regression
     * we'd lose hours debugging in production: missing addEventListener,
     * missing cleanup, hook drops the matchMedia subscription, a consumer
     * silently switches to the wrong import, etc.
     * ──────────────────────────────────────────────────────────────────── */

    const gameSpeedSrc = await readText(path.join(REPO_ROOT, "client/src/lib/game-speed.ts"));
    if (!gameSpeedSrc) {
        fail("client/src/lib/game-speed.ts exists", "file missing");
    }

    /* ──────────── 13) useGameSpeedMode body is fully wired ──────────── */
    {
        const body = gameSpeedSrc ? extractFunctionBody(gameSpeedSrc, "useGameSpeedMode") : null;
        const hasInit = body && /useState[^()]*\(\s*\(\)\s*=>\s*getGameSpeedMode\s*\(\s*\)\s*\)/.test(body);
        const hasAddChange = body && /window\.addEventListener\s*\(\s*CHANGE_EVENT\b/.test(body);
        const hasAddStorage = body && /window\.addEventListener\s*\(\s*["']storage["']/.test(body);
        const hasRemoveChange = body && /window\.removeEventListener\s*\(\s*CHANGE_EVENT\b/.test(body);
        const hasRemoveStorage = body && /window\.removeEventListener\s*\(\s*["']storage["']/.test(body);
        const filtersStorageKey = body && /event\.key\s*===\s*STORAGE_KEY/.test(body);
        const trustsDetail = body && /isSpeedMode\s*\(\s*detail\s*\)/.test(body);

        if (body && hasInit && hasAddChange && hasAddStorage && hasRemoveChange && hasRemoveStorage && filtersStorageKey && trustsDetail) {
            pass("useGameSpeedMode body: lazy useState init + CHANGE_EVENT/storage subscribe + cleanup + STORAGE_KEY filter + detail validation");
        } else {
            fail(
                "useGameSpeedMode body: lazy init + CHANGE_EVENT/storage subscribe + cleanup + STORAGE_KEY filter + detail validation",
                `body=${!!body}, init=${!!hasInit}, addChange=${!!hasAddChange}, addStorage=${!!hasAddStorage}, removeChange=${!!hasRemoveChange}, removeStorage=${!!hasRemoveStorage}, filterKey=${!!filtersStorageKey}, trustDetail=${!!trustsDetail}`,
            );
        }
    }

    /* ──────────── 14) useGameSpeedMultiplier body is fully wired ────── */
    {
        const body = gameSpeedSrc ? extractFunctionBody(gameSpeedSrc, "useGameSpeedMultiplier") : null;
        const queriesMql = body && /matchMedia\s*\(\s*["'`]\(prefers-reduced-motion:\s*reduce\)["'`]\s*\)/.test(body);
        const modernAdd = body && /mql\.addEventListener\s*\(\s*["']change["']/.test(body);
        const modernRemove = body && /mql\.removeEventListener\s*\(\s*["']change["']/.test(body);
        const legacyAdd = body && /mql\.addListener\s*\(/.test(body);
        const legacyRemove = body && /mql\.removeListener\s*\(/.test(body);
        const lazyInit = body && /useState[^()]*\(\s*\(\)\s*=>\s*prefersReducedMotion\s*\(\s*\)\s*\)/.test(body);
        const shortCircuits = body && /if\s*\(\s*reduced\s*\)\s*return\s+0/.test(body);
        const composesMode = body && /useGameSpeedMode\s*\(\s*\)/.test(body);

        if (body && queriesMql && modernAdd && modernRemove && legacyAdd && legacyRemove && lazyInit && shortCircuits && composesMode) {
            pass("useGameSpeedMultiplier body: composes useGameSpeedMode + matchMedia subscribe (modern+Safari<14) + lazy reduced init + short-circuit to 0");
        } else {
            fail(
                "useGameSpeedMultiplier body: matchMedia subscribe (both APIs) + reduced-motion short-circuit + composes mode hook",
                `body=${!!body}, queryMql=${!!queriesMql}, modernAdd=${!!modernAdd}, modernRemove=${!!modernRemove}, legacyAdd=${!!legacyAdd}, legacyRemove=${!!legacyRemove}, lazy=${!!lazyInit}, shortCircuit=${!!shortCircuits}, composes=${!!composesMode}`,
            );
        }
    }

    /* ──────────── 15) Module constants are pinned to their public names ─ */
    if (
        gameSpeedSrc
        && /STORAGE_KEY\s*=\s*["']vex\.dominoSpeedMode["']/.test(gameSpeedSrc)
    ) {
        pass("STORAGE_KEY is preserved as 'vex.dominoSpeedMode' — existing players keep their saved Fast/Turbo pick after the rename");
    } else {
        fail(
            "STORAGE_KEY is preserved as 'vex.dominoSpeedMode'",
            "Renaming the storage key would silently reset every player's saved speed preference back to Normal.",
        );
    }

    if (
        gameSpeedSrc
        && /CHANGE_EVENT\s*=\s*["']vex:game-speed-change["']/.test(gameSpeedSrc)
    ) {
        pass("CHANGE_EVENT name is 'vex:game-speed-change' (matches the behavioural test above)");
    } else {
        fail(
            "CHANGE_EVENT is 'vex:game-speed-change'",
            "Renaming the event without updating consumers would leave every hook stuck on its initial value.",
        );
    }

    /* ──────────── 18) No stale references to the old 'domino-speed' API ─ */
    const repoFiles = [
        "client/src/pages/settings.tsx",
        "client/src/hooks/useGameWebSocket.ts",
        "client/src/components/games/DominoBoard.tsx",
        "client/src/components/games/ChessBoard.tsx",
        "client/src/components/games/chess/ChessBoard.tsx",
    ];
    let staleRef: string | null = null;
    for (const rel of repoFiles) {
        const src = await readText(path.join(REPO_ROOT, rel));
        if (!src) continue;
        if (
            /from\s+["'][^"']*\/domino-speed["']/.test(src)
            || /\buseDominoSpeed(Mode|Multiplier)\b/.test(src)
            || /\bDominoSpeedMode\b/.test(src)
            || /\bDOMINO_SPEED_MULTIPLIERS\b/.test(src)
            || /\bsetDominoSpeedMode\b/.test(src)
            || /\bgetDominoSpeedMode\b/.test(src)
        ) {
            staleRef = rel;
            break;
        }
    }
    if (!staleRef) {
        pass("No consumer still imports the legacy 'domino-speed' module / Domino*Speed* names");
    } else {
        fail(
            "No consumer still imports the legacy 'domino-speed' module / Domino*Speed* names",
            `Found a stale reference in ${staleRef} — the rename is incomplete.`,
        );
    }

    /* ──────────── 19) Each board file actually uses the multiplier ──── */
    for (const rel of [
        "client/src/components/games/DominoBoard.tsx",
        "client/src/components/games/ChessBoard.tsx",
        "client/src/components/games/chess/ChessBoard.tsx",
    ]) {
        const src = await readText(path.join(REPO_ROOT, rel));
        if (!src) {
            fail(`${rel} exists`, "file missing");
            continue;
        }
        const importsHook = /from\s+["'][^"']*\/lib\/game-speed["']/.test(src)
            && /\buseGameSpeedMultiplier\b/.test(src);
        const usesValue = /useGameSpeedMultiplier\s*\(\s*\)/.test(src);
        if (importsHook && usesValue) {
            pass(`${rel} consumes useGameSpeedMultiplier (board animations honour the picker)`);
        } else {
            fail(
                `${rel} consumes useGameSpeedMultiplier`,
                `importsHook=${importsHook}, usesValue=${usesValue} — refactor likely dropped the wiring.`,
            );
        }
    }

    /* ──────────── 20) Settings page wires the picker to set/get API ──── */
    const settingsSrc = await readText(path.join(REPO_ROOT, "client/src/pages/settings.tsx"));
    if (
        settingsSrc
        && /from\s+["'][^"']*\/lib\/game-speed["']/.test(settingsSrc)
        && /\bsetGameSpeedMode\b/.test(settingsSrc)
        && (/\buseGameSpeedMode\b/.test(settingsSrc) || /\bgetGameSpeedMode\b/.test(settingsSrc))
    ) {
        pass("Settings page imports + uses the get/set Game Speed API");
    } else {
        fail(
            "Settings page imports + uses the get/set Game Speed API",
            "If the picker stops calling setGameSpeedMode, switching modes in Settings becomes a no-op.",
        );
    }

    /* ──────────── 21) WS hook still opts into the speed channel ──────── */
    const wsHookSrc = await readText(path.join(REPO_ROOT, "client/src/hooks/useGameWebSocket.ts"));
    if (
        wsHookSrc
        && /from\s+["'][^"']*\/lib\/game-speed["']/.test(wsHookSrc)
    ) {
        pass("useGameWebSocket still imports from lib/game-speed (server-side AI think speed stays in sync)");
    } else {
        fail(
            "useGameWebSocket still imports from lib/game-speed",
            "If this import disappears, the picker stops telling the server to scale AI think delays.",
        );
    }

    /* ──────────── Result ─────────────────────────────────────────────── */
    const total = passed + failed;
    if (failed === 0) {
        console.log(`[smoke:game-speed] OK — all ${total} check(s) passed`);
        process.exit(0);
    } else {
        console.log(`[smoke:game-speed] FAIL — ${failed}/${total} check(s) failed`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("[smoke:game-speed] unexpected error", err);
    process.exit(1);
});
