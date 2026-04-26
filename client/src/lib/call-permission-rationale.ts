export type CallMediaKind = "voice" | "video";

const STORAGE_KEY = "vex_call_permission_rationale_v1";

interface RationaleStorage {
    voiceShownAt?: string;
    videoShownAt?: string;
}

function readStorage(): RationaleStorage {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as RationaleStorage) : {};
    } catch {
        return {};
    }
}

function writeStorage(value: RationaleStorage): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Ignore quota / privacy-mode storage errors.
    }
}

/**
 * Returns true when the rationale has already been shown for the given media
 * kind. Voice covers voice-only calls; video implies the user has already
 * acknowledged camera + mic so it also satisfies voice rationale.
 */
export function hasSeenCallRationale(kind: CallMediaKind): boolean {
    const storage = readStorage();
    if (kind === "voice") {
        return !!(storage.voiceShownAt || storage.videoShownAt);
    }
    return !!storage.videoShownAt;
}

export function markCallRationaleSeen(kind: CallMediaKind): void {
    const storage = readStorage();
    const now = new Date().toISOString();
    if (kind === "voice") {
        storage.voiceShownAt = now;
    } else {
        storage.videoShownAt = now;
        // Acknowledging video also satisfies voice rationale.
        storage.voiceShownAt = storage.voiceShownAt || now;
    }
    writeStorage(storage);
}

export function clearCallRationale(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore.
    }
}

/* ------------------------------------------------------------------ */
/* Cross-component request bus                                         */
/* ------------------------------------------------------------------ */

export type RationaleResolution = "allow" | "dismiss";

export interface RationaleRequest {
    kind: CallMediaKind;
    /**
     * `forced` requests are shown even if the rationale was previously
     * acknowledged — used after the OS denies the permission to give the
     * user a clear path to the system settings.
     */
    forced?: boolean;
    /**
     * `permanentlyDenied` is set when the OS will no longer surface the
     * runtime dialog (Android: user ticked "Don't ask again", or device
     * policy hard-blocked the permission). The modal uses this to swap
     * its primary CTA from "Allow" — which would be a silent no-op —
     * to "Open Settings", and to hide the Allow button entirely so the
     * user is steered onto the path that can actually unblock them.
     */
    permanentlyDenied?: boolean;
    resolve: (decision: RationaleResolution) => void;
}

type Listener = (request: RationaleRequest) => void;

let listener: Listener | null = null;
const pending: RationaleRequest[] = [];

export function registerRationaleListener(next: Listener): () => void {
    listener = next;
    if (pending.length > 0) {
        const queued = pending.splice(0, pending.length);
        queued.forEach((req) => next(req));
    }
    return () => {
        if (listener === next) {
            listener = null;
        }
    };
}

/**
 * Ensure the rationale has been acknowledged for the given media kind. If a
 * UI listener is registered the modal will be shown; otherwise the call is
 * allowed through (so headless callers do not deadlock).
 *
 * `permanentlyDenied: true` forces the modal open regardless of prior
 * acknowledgement, because the only path forward is the system Settings
 * deep-link the modal exposes when this flag is set.
 */
export function ensureCallRationale(
    kind: CallMediaKind,
    options: { force?: boolean; permanentlyDenied?: boolean } = {},
): Promise<RationaleResolution> {
    const force = options.force === true || options.permanentlyDenied === true;
    if (!force && hasSeenCallRationale(kind)) {
        return Promise.resolve("allow");
    }

    if (!listener) {
        // No UI bound — fall back to "allow" so the underlying getUserMedia
        // call surfaces the native permission prompt directly.
        markCallRationaleSeen(kind);
        return Promise.resolve("allow");
    }

    return new Promise<RationaleResolution>((resolve) => {
        const request: RationaleRequest = {
            kind,
            forced: force,
            permanentlyDenied: options.permanentlyDenied === true,
            resolve: (decision) => {
                if (decision === "allow") {
                    markCallRationaleSeen(kind);
                }
                resolve(decision);
            },
        };
        if (listener) {
            listener(request);
        } else {
            pending.push(request);
        }
    });
}
