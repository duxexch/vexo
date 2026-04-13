interface SmokeHttpRequestOptions {
    baseUrl: string;
    path: string;
    timeoutMs: number;
    method?: string;
    body?: unknown;
    token?: string;
    userAgent?: string;
}

interface SmokeHttpResponse {
    status: number;
    ok: boolean;
    json: unknown;
    text: string;
}

export async function requestJson(options: SmokeHttpRequestOptions): Promise<SmokeHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (options.userAgent) {
            headers["User-Agent"] = options.userAgent;
        }

        if (options.token) {
            headers.Authorization = `Bearer ${options.token}`;
        }

        const response = await fetch(`${options.baseUrl}${options.path}`, {
            method: options.method || "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
        });

        const text = await response.text();
        let json: unknown = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = { raw: text };
            }
        }

        return { status: response.status, ok: response.ok, json, text };
    } finally {
        clearTimeout(timeout);
    }
}
