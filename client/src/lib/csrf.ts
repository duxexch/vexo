const CSRF_HEADER_NAME = "x-csrf-token";
const INVALID_CSRF_PATTERN = /invalid csrf token/i;

let csrfTokenCache: string | null = null;
let csrfTokenPromise: Promise<string | null> | null = null;

function isStateChangingMethod(method: string | undefined): boolean {
    const upperMethod = (method || "GET").toUpperCase();
    return upperMethod !== "GET" && upperMethod !== "HEAD" && upperMethod !== "OPTIONS";
}

function hasBypassAuth(headers: Headers): boolean {
    const authorization = headers.get("Authorization") || "";
    const hasBearer = authorization.startsWith("Bearer ");
    const hasAdmin = (headers.get("x-admin-token") || "").length > 0;
    return hasBearer || hasAdmin;
}

async function requestCsrfToken(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh && csrfTokenCache) {
        return csrfTokenCache;
    }

    if (!forceRefresh && csrfTokenPromise) {
        return csrfTokenPromise;
    }

    csrfTokenPromise = (async () => {
        const res = await fetch("/api/auth/csrf-token", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        });

        if (!res.ok) {
            return null;
        }

        const data = await res.json().catch(() => null) as { csrfToken?: string } | null;
        const token = typeof data?.csrfToken === "string" && data.csrfToken.length > 0 ? data.csrfToken : null;
        csrfTokenCache = token;
        return token;
    })();

    try {
        return await csrfTokenPromise;
    } finally {
        csrfTokenPromise = null;
    }
}

async function buildHeadersWithCsrf(init: RequestInit, forceRefresh = false): Promise<Headers> {
    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type") && init.body) {
        headers.set("Content-Type", "application/json");
    }

    if (!isStateChangingMethod(init.method) || hasBypassAuth(headers) || headers.has(CSRF_HEADER_NAME)) {
        return headers;
    }

    const csrfToken = await requestCsrfToken(forceRefresh);
    if (csrfToken) {
        headers.set(CSRF_HEADER_NAME, csrfToken);
    }

    return headers;
}

export async function fetchWithCsrf(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const baseInit: RequestInit = {
        ...init,
        credentials: init.credentials ?? "include",
    };

    const headers = await buildHeadersWithCsrf(baseInit, false);
    const firstResponse = await fetch(input, { ...baseInit, headers });

    if (!isStateChangingMethod(baseInit.method)) {
        return firstResponse;
    }

    if (firstResponse.status !== 403) {
        return firstResponse;
    }

    const responseBody = await firstResponse.clone().text();
    if (!INVALID_CSRF_PATTERN.test(responseBody)) {
        return firstResponse;
    }

    const retriedHeaders = await buildHeadersWithCsrf(baseInit, true);
    return fetch(input, { ...baseInit, headers: retriedHeaders });
}
