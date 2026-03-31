export interface WebSocketEnvelope {
    type: string;
    [key: string]: unknown;
}

export interface WebSocketProtocolError {
    message: string;
    code: string;
}

type ValidationResult =
    | { ok: true; data: WebSocketEnvelope }
    | { ok: false; error: WebSocketProtocolError };

export function createWsProtocolError(message: string, code: string): WebSocketProtocolError {
    return { message, code };
}

export function validateWebSocketEnvelope(input: unknown): ValidationResult {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            ok: false,
            error: createWsProtocolError("Invalid message: expected object payload", "invalid_envelope"),
        };
    }

    const envelope = input as Record<string, unknown>;
    const type = envelope.type;

    if (typeof type !== "string") {
        return {
            ok: false,
            error: createWsProtocolError("Invalid message.type: expected string", "invalid_type"),
        };
    }

    const normalizedType = type.trim();
    if (!normalizedType) {
        return {
            ok: false,
            error: createWsProtocolError("Invalid message.type: cannot be empty", "invalid_type"),
        };
    }

    if (normalizedType.length > 64) {
        return {
            ok: false,
            error: createWsProtocolError("Invalid message.type: exceeds max length", "invalid_type"),
        };
    }

    return {
        ok: true,
        data: {
            ...envelope,
            type: normalizedType,
        },
    };
}
