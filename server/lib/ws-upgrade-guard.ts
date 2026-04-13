import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { redisRateLimit } from "./redis";

const ALLOWED_ORIGINS_PROD = new Set(["https://vixo.click", "https://www.vixo.click"]);
const ALLOWED_ORIGINS_DEV = new Set(["http://localhost:3001", "http://localhost:3000", "http://127.0.0.1:3001"]);

export function isWsOriginAllowed(origin: string | undefined): boolean {
    // Some websocket clients omit Origin; enforce allowlist only when Origin is present.
    if (!origin) {
        return true;
    }

    const allowed = process.env.NODE_ENV === "production" ? ALLOWED_ORIGINS_PROD : ALLOWED_ORIGINS_DEV;
    return allowed.has(origin);
}

export async function checkWsUpgradeRateLimit(
    request: IncomingMessage,
    keyPrefix: string,
    maxRequests = 20,
    windowMs = 10_000,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const forwardedHeader = request.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
    const forwardedIp = typeof forwardedValue === "string"
        ? forwardedValue.split(",")[0]?.trim()
        : undefined;
    const clientIp = forwardedIp || request.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${clientIp}`;
    const result = await redisRateLimit(key, maxRequests, windowMs);

    return {
        allowed: result.allowed,
        retryAfterMs: result.retryAfterMs,
    };
}

export function rejectWsUpgrade(socket: Duplex, statusCode: 403 | 429): void {
    if (statusCode === 403) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    } else {
        socket.write("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 10\r\n\r\n");
    }
    socket.destroy();
}
