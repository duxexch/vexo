interface WsErrorLike {
    type?: unknown;
    message?: unknown;
    error?: unknown;
    code?: unknown;
    payload?: {
        message?: unknown;
        error?: unknown;
        code?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface WsErrorInfo {
    message: string | null;
    code?: string;
}

export const WS_ERROR_TYPES = new Set([
    "ws_error",
    "error",
    "challenge_error",
    "move_error",
    "move_rejected",
]);

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isWsErrorType(type: unknown): boolean {
    return typeof type === "string" && WS_ERROR_TYPES.has(type);
}

export function extractWsErrorInfo(data: unknown): WsErrorInfo {
    const candidate = (data ?? {}) as WsErrorLike;
    const payload = candidate.payload ?? {};

    const message =
        asNonEmptyString(payload.message)
        || asNonEmptyString(candidate.message)
        || asNonEmptyString(payload.error)
        || asNonEmptyString(candidate.error);

    const code = asNonEmptyString(payload.code) || asNonEmptyString(candidate.code) || undefined;

    return { message, code };
}