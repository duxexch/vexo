/**
 * Call permission rationale (Android "Don't ask again" UX).
 *
 * Single-threaded in-memory dispatcher used by <CallPermissionPrompt />.
 * Production call entrypoints call `ensureCallRationale(...)`, which
 * fans out a `RationaleRequest` to all registered listeners.
 *
 * Test expectations:
 *  - ensureCallRationale(kind, { force: true, permanentlyDenied: true })
 *    must be invoked by call entrypoints when the native plugin reports
 *    `microphonePermanentlyDenied`.
 *  - CallPermissionPrompt registers via `registerRationaleListener(...)`.
 */

export type CallPermissionKind = "voice" | "video";

export type RationaleResult = "allow" | "dismiss";

export interface RationaleRequest {
    kind: CallPermissionKind;
    /**
     * True when the caller wants to force the rationale UI (one-shot).
     * The wording/UI differs for the "soft denial" state.
     */
    forced?: boolean;
    /**
     * True when the OS will no longer show its permission dialog.
     * CTA layout hides "Allow" in this state.
     */
    permanentlyDenied?: boolean;
    /**
     * Resolve back to the dispatcher.
     */
    resolve: (result: RationaleResult) => void;
}

export interface EnsureCallRationaleOptions {
    force?: boolean;
    permanentlyDenied?: boolean;
}

/**
 * In-memory listener registry.
 * We intentionally keep this module framework-agnostic: the UI registers
 * via registerRationaleListener, and entrypoints trigger via ensureCallRationale.
 */
const listeners = new Set<(req: RationaleRequest) => void>();

/**
 * Persistent-ish contract for "have we already shown this rationale?".
 * For the hard security/availability properties here we only need
 * deterministic behavior in tests, so we keep it in-memory.
 */
const seenByKind = new Map<CallPermissionKind, boolean>();

export function hasSeenCallRationale(kind: CallPermissionKind): boolean {
    return seenByKind.get(kind) === true;
}

export function markCallRationaleSeen(kind: CallPermissionKind): void {
    seenByKind.set(kind, true);
}

export function clearCallRationale(kind?: CallPermissionKind): void {
    if (!kind) {
        seenByKind.clear();
        return;
    }
    seenByKind.delete(kind);
}

export function registerRationaleListener(listener: (req: RationaleRequest) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export async function ensureCallRationale(
    kind: CallPermissionKind,
    opts: EnsureCallRationaleOptions,
): Promise<RationaleResult> {
    // This module is intentionally "best-effort":
    // if no listeners are mounted, resolve to "dismiss" so the caller
    // can recover/fallback (e.g. text-only chat).
    const permanentlyDenied = !!opts.permanentlyDenied;
    const forced = !!opts.force;

    return await new Promise<RationaleResult>((resolve) => {
        const req: RationaleRequest = {
            kind,
            forced,
            permanentlyDenied,
            resolve,
        };

        if (listeners.size === 0) {
            resolve("dismiss");
            return;
        }

        // Fan-out. A single prompt may call resolve multiple times; the
        // first one wins naturally because resolve is idempotent from
        // the Promise perspective.
        for (const l of listeners) {
            try {
                l(req);
            } catch {
                // Ignore listener faults; resolve so the caller doesn't hang.
            }
        }
    });
}
