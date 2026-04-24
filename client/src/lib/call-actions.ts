/**
 * Cross-manager bridge for incoming-call accept / decline actions that
 * originate outside the in-app modal (e.g. push-notification action
 * buttons, system tray buttons). Each call manager registers a handler;
 * the service-worker bridge in `CallSessionProvider` dispatches actions
 * by walking the registry until one manager claims the call.
 *
 * Why a registry: the DM call lives inside `usePrivateCallLayer` and the
 * challenge call lives inside `useCallSession`. Neither knows about the
 * other, but both need to react when the user taps "Accept" / "Decline"
 * on a notification while the app is backgrounded.
 *
 * Handlers return `true` if they handled the action (i.e. they own the
 * call identified by `callId` / `conversationId`), otherwise `false` so
 * the dispatcher can try the next manager.
 */

export type CallAction = "accept" | "decline" | "hangup";

export interface CallActionContext {
    action: CallAction;
    callId?: string;
    conversationId?: string;
}

export type CallActionHandler = (ctx: CallActionContext) => boolean | Promise<boolean>;

const handlers = new Set<CallActionHandler>();

export function registerCallActionHandler(handler: CallActionHandler): () => void {
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
}

/**
 * Dispatch a call action to every registered handler in registration
 * order until one returns `true`. Always awaits handlers so async
 * accept/decline flows finish before the caller continues.
 */
export async function dispatchCallAction(ctx: CallActionContext): Promise<boolean> {
    for (const handler of handlers) {
        try {
            const handled = await handler(ctx);
            if (handled) return true;
        } catch {
            // Continue to next handler — a single broken manager must not
            // swallow the action.
        }
    }
    return false;
}

/** Test-only: clear all registered handlers. */
export function __resetCallActionRegistry(): void {
    handlers.clear();
}
