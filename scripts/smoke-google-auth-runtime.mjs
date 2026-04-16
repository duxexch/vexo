#!/usr/bin/env node

const args = process.argv.slice(2);

function parseArgs(argv) {
    const parsed = {
        baseUrl: process.env.BASE_URL || "https://vixo.click",
        requireNativeGoogle: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];
        if (current === "--base-url") {
            parsed.baseUrl = argv[index + 1] || parsed.baseUrl;
            index += 1;
            continue;
        }

        if (current === "--allow-missing-native-google") {
            parsed.requireNativeGoogle = false;
        }
    }

    return parsed;
}

function normalizeBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed) {
        throw new Error("Missing base URL");
    }

    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

async function fetchJson(baseUrl, path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal: controller.signal,
        });

        const text = await response.text();
        const json = text ? JSON.parse(text) : {};

        return {
            status: response.status,
            ok: response.ok,
            json,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function run() {
    const options = parseArgs(args);
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    console.log("[smoke] starting google auth runtime checks");

    const authSettings = await fetchJson(baseUrl, "/api/auth/settings");
    assert(authSettings.ok, `Auth settings request failed with ${authSettings.status}`);
    assert(typeof authSettings.json.oneClickEnabled === "boolean", "Auth settings payload is missing oneClickEnabled");

    console.log("[smoke] /api/auth/settings: OK");

    const socialPlatforms = await fetchJson(baseUrl, "/api/social-platforms");
    assert(socialPlatforms.ok, `Social platforms request failed with ${socialPlatforms.status}`);
    assert(Array.isArray(socialPlatforms.json), "Social platforms payload is not an array");

    const googlePlatform = socialPlatforms.json.find((platform) => platform && platform.name === "google");
    assert(Boolean(googlePlatform), "Google platform is not exposed by /api/social-platforms");
    assert(
        typeof googlePlatform.runtime?.oauthLoginEnabled === "boolean",
        "Google runtime is missing oauthLoginEnabled",
    );

    console.log("[smoke] /api/social-platforms (google runtime): OK");

    const googleOAuthStart = await fetchJson(baseUrl, "/api/auth/social/google?redirect=%2F&popup=1");
    assert(googleOAuthStart.ok, `Google OAuth initiation failed with ${googleOAuthStart.status}`);
    assert(typeof googleOAuthStart.json.url === "string" && googleOAuthStart.json.url.length > 0, "Google OAuth initiation did not return url");

    const authUrlHost = new URL(googleOAuthStart.json.url).hostname;
    assert(authUrlHost === "accounts.google.com", `Google OAuth URL host is unexpected: ${authUrlHost}`);

    console.log("[smoke] /api/auth/social/google (browser OAuth): OK");

    const googleNativeConfig = await fetchJson(baseUrl, "/api/auth/social/google/native/config");

    if (!options.requireNativeGoogle) {
        if (googleNativeConfig.ok) {
            console.log("[smoke] /api/auth/social/google/native/config: OK (native configured)");
        } else {
            console.log(`[smoke] /api/auth/social/google/native/config: SKIPPED (status ${googleNativeConfig.status})`);
        }

        return;
    }

    assert(googleNativeConfig.ok, `Google native config failed with ${googleNativeConfig.status}`);
    assert(
        typeof googleNativeConfig.json.clientId === "string" && googleNativeConfig.json.clientId.length > 0,
        "Google native config is missing clientId",
    );
    assert(googleNativeConfig.json.loginMode === "sdk-only", "Google native loginMode must be sdk-only in production");

    console.log("[smoke] /api/auth/social/google/native/config (native SDK): OK");
    console.log("[smoke] google auth runtime checks passed");
}

run().catch(() => {
    console.error("[smoke] failed");
    process.exit(1);
});
