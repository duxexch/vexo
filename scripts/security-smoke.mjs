const baseUrl = (process.env.SECURITY_BASE_URL || process.env.BASE_URL || "http://localhost:3011").replace(/\/$/, "");

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[security:smoke] ${message}`, details);
    } else {
        console.error(`[security:smoke] ${message}`);
    }
    process.exit(1);
}

async function readBody(res) {
    const text = await res.text();
    try {
        return { text, json: JSON.parse(text) };
    } catch {
        return { text, json: null };
    }
}

async function assertEndpoint({
    name,
    method,
    path,
    body,
    expectedStatus,
    expectErrorIncludes,
}) {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await readBody(res);

    if (res.status !== expectedStatus) {
        fail(`${name}: expected status ${expectedStatus}, got ${res.status}`, payload.text);
    }

    if (expectErrorIncludes) {
        const message = payload.json?.error;
        if (typeof message !== "string" || !message.includes(expectErrorIncludes)) {
            fail(`${name}: expected error to include "${expectErrorIncludes}"`, payload.text);
        }
    }

    console.log(`[security:smoke] PASS ${name}`);
}

async function main() {
    const health = await fetch(`${baseUrl}/`);
    if (!health.ok) {
        fail(`health check failed at ${baseUrl}/ with status ${health.status}`);
    }
    console.log(`[security:smoke] PASS health (${health.status})`);

    await assertEndpoint({
        name: "oauth exchange missing code",
        method: "POST",
        path: "/api/auth/social/exchange",
        body: {},
        expectedStatus: 400,
        expectErrorIncludes: "Exchange code is required",
    });

    await assertEndpoint({
        name: "user 2FA rejects legacy payload",
        method: "POST",
        path: "/api/auth/2fa/verify",
        body: { userId: "legacy", code: "123456" },
        expectedStatus: 400,
        expectErrorIncludes: "Challenge token is required",
    });

    await assertEndpoint({
        name: "admin 2FA requires challenge token",
        method: "POST",
        path: "/api/admin/verify-2fa",
        body: {},
        expectedStatus: 400,
        expectErrorIncludes: "Code and challenge token are required",
    });

    console.log("[security:smoke] All checks passed.");
}

main().catch((error) => {
    fail("Unexpected error during security smoke test", error instanceof Error ? error.message : String(error));
});
