#!/usr/bin/env node

/**
 * VoIP push diagnostic CLI.
 *
 * Verifies the Apple PushKit (APNs) and Firebase (FCM HTTP v1) credentials
 * required by `server/lib/voip-push.ts` are present, well-formed, and (with
 * `--ping-gateways`) actually accepted by the upstream gateways — without
 * ever sending a real push or needing a physical device.
 *
 * Intended usage on the production VPS once the env vars from .env.example
 * have been populated:
 *
 *   # Quick offline check (no network):
 *   node scripts/voip-push-doctor.mjs
 *
 *   # Full check including auth handshake with Apple + Google:
 *   node scripts/voip-push-doctor.mjs --ping-gateways
 *
 * Exit code is 0 if every configured transport passes its checks, 1 if
 * any check fails. Either transport may be intentionally left
 * unconfigured (e.g. iOS-only deployments) — in that case the missing
 * transport is reported as SKIP and does not fail the run.
 */

import { createSign, createPrivateKey } from "node:crypto";
import process from "node:process";

const PING_GATEWAYS = process.argv.includes("--ping-gateways");

let totalFailed = 0;
let totalPassed = 0;
let totalSkipped = 0;

function check(label, ok, detail) {
    if (ok) {
        totalPassed += 1;
        console.log(`  PASS  ${label}`);
        return true;
    }
    totalFailed += 1;
    const suffix = detail ? `\n        ${detail}` : "";
    console.log(`  FAIL  ${label}${suffix}`);
    return false;
}

function skip(label, reason) {
    totalSkipped += 1;
    console.log(`  SKIP  ${label}${reason ? ` — ${reason}` : ""}`);
}

function base64UrlEncode(input) {
    const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizePem(raw) {
    return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

// --------------------------------------------------------------------------
// APNs (iOS)
// --------------------------------------------------------------------------

async function checkApns() {
    console.log("\nApple Push Notifications service (iOS, PushKit / VoIP)");
    console.log("-------------------------------------------------------");

    const keyId = process.env.APNS_KEY_ID?.trim();
    const teamId = process.env.APNS_TEAM_ID?.trim();
    const bundleId = (process.env.APNS_BUNDLE_ID?.trim()
        || process.env.IOS_BUNDLE_ID?.trim());
    const privateKeyRaw = process.env.APNS_PRIVATE_KEY?.trim();

    const allMissing = !keyId && !teamId && !bundleId && !privateKeyRaw;
    if (allMissing) {
        skip("APNs configuration", "no APNS_* env vars set — iOS lock-screen ringing will be disabled");
        return;
    }

    check("APNS_KEY_ID is set", !!keyId, "Apple Developer → Keys lists this as the 10-character Key ID.");
    check("APNS_TEAM_ID is set", !!teamId, "Apple Developer → Membership shows this as your 10-character Team ID.");
    check("APNS_BUNDLE_ID is set", !!bundleId, "The plain iOS bundle id (the server appends `.voip` automatically).");
    check("APNS_PRIVATE_KEY is set", !!privateKeyRaw, "Full contents of the .p8 file (BEGIN/END PRIVATE KEY block, `\\n` literals OK).");

    if (!keyId || !teamId || !bundleId || !privateKeyRaw) {
        return;
    }

    if (keyId.length !== 10) {
        check("APNS_KEY_ID length is 10 characters", false, `Got ${keyId.length} characters. Apple key ids are exactly 10 characters.`);
    } else {
        check("APNS_KEY_ID length is 10 characters", true);
    }
    if (teamId.length !== 10) {
        check("APNS_TEAM_ID length is 10 characters", false, `Got ${teamId.length} characters. Apple team ids are exactly 10 characters.`);
    } else {
        check("APNS_TEAM_ID length is 10 characters", true);
    }

    const privateKeyPem = normalizePem(privateKeyRaw);
    if (!privateKeyPem.includes("BEGIN PRIVATE KEY")) {
        check("APNS_PRIVATE_KEY is a PEM block", false, "Expected `-----BEGIN PRIVATE KEY-----` header. Did you paste the .p8 contents in full?");
        return;
    }
    check("APNS_PRIVATE_KEY is a PEM block", true);

    let keyObject;
    try {
        keyObject = createPrivateKey({ key: privateKeyPem, format: "pem" });
    } catch (err) {
        check("APNS_PRIVATE_KEY parses as a private key", false, `node:crypto rejected the PEM: ${err?.message ?? err}`);
        return;
    }
    check("APNS_PRIVATE_KEY parses as a private key", true);

    if (keyObject.asymmetricKeyType !== "ec") {
        check("APNS_PRIVATE_KEY is an ECDSA key (Apple .p8 keys are P-256 EC)", false, `Got key type ${keyObject.asymmetricKeyType}. Apple .p8 keys are always EC.`);
        return;
    }
    check("APNS_PRIVATE_KEY is an ECDSA key (Apple .p8 keys are P-256 EC)", true);

    const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
    const payload = base64UrlEncode(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
    const signingInput = `${header}.${payload}`;
    let signature;
    try {
        const signer = createSign("SHA256");
        signer.update(signingInput);
        signer.end();
        signature = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
    } catch (err) {
        check("Build APNs ES256 JWT", false, `Signing failed: ${err?.message ?? err}`);
        return;
    }
    if (signature.length !== 64) {
        check("Build APNs ES256 JWT", false, `Expected 64-byte raw r||s signature, got ${signature.length}.`);
        return;
    }
    const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
    check("Build APNs ES256 JWT", true, `${jwt.length} chars`);

    if (!PING_GATEWAYS) {
        skip("Auth handshake with Apple gateway", "re-run with --ping-gateways to verify Apple accepts the JWT");
        return;
    }

    // Send a request with an obviously-invalid device token. Apple
    // returns 400 BadDeviceToken when the JWT is accepted but the
    // device token is malformed — that's exactly the signal we want
    // (proves the credentials are valid without delivering a real push).
    // 403 InvalidProviderToken means the credentials themselves are
    // rejected — that's the failure path we report.
    const host = process.env.APNS_HOST?.trim()
        || (process.env.APNS_USE_SANDBOX === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
    const fakeDeviceToken = "0".repeat(64);

    let outcome;
    try {
        outcome = await sendApnsProbe(host, jwt, bundleId, fakeDeviceToken);
    } catch (err) {
        check(`APNs HTTP/2 reachable at ${host}`, false, err?.message ?? String(err));
        return;
    }
    check(`APNs HTTP/2 reachable at ${host}`, true, `gateway responded with status ${outcome.status}`);

    if (outcome.status === 400 && (outcome.reason === "BadDeviceToken" || outcome.reason === "DeviceTokenNotForTopic")) {
        check("Apple accepts the provider JWT (BadDeviceToken on probe is the expected signal)", true);
    } else if (outcome.status === 403 && (outcome.reason === "InvalidProviderToken" || outcome.reason === "ExpiredProviderToken")) {
        check("Apple accepts the provider JWT", false, `Apple rejected the JWT: status=403 reason=${outcome.reason}. Check APNS_KEY_ID + APNS_TEAM_ID + .p8 match.`);
    } else if (outcome.status === 403 && outcome.reason === "MissingTopic") {
        check("Apple accepts the provider JWT", false, "Gateway returned MissingTopic — APNS_BUNDLE_ID may be wrong.");
    } else if (outcome.status === 410) {
        // Unregistered means the token slot is gone — also indicates
        // the JWT was accepted (Apple wouldn't tell us otherwise).
        check("Apple accepts the provider JWT (410 Unregistered on probe also indicates accepted JWT)", true);
    } else {
        check("Apple accepts the provider JWT", false, `Unexpected APNs response: status=${outcome.status} reason=${outcome.reason ?? "<none>"}.`);
    }
}

async function sendApnsProbe(host, jwt, bundleId, deviceToken) {
    const { connect } = await import("node:http2");
    return await new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };
        const client = connect(host);
        client.on("error", (err) => {
            settle(reject, err);
            try { client.close(); } catch { /* ignore */ }
        });
        const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${deviceToken}`,
            "authorization": `bearer ${jwt}`,
            "apns-topic": `${bundleId}.voip`,
            "apns-push-type": "voip",
            "apns-priority": "10",
            "apns-expiration": "0",
            "content-type": "application/json",
        });
        let status = 0;
        let body = "";
        req.on("response", (headers) => { status = Number(headers[":status"]) || 0; });
        req.on("data", (chunk) => { body += chunk.toString("utf8"); });
        req.on("end", () => {
            let reason;
            if (status >= 400 && body) {
                try { reason = JSON.parse(body)?.reason; } catch { /* ignore */ }
            }
            try { client.close(); } catch { /* ignore */ }
            settle(resolve, { status, reason });
        });
        req.on("error", (err) => {
            try { client.close(); } catch { /* ignore */ }
            settle(reject, err);
        });
        req.setTimeout(10_000, () => {
            try { req.close(); } catch { /* ignore */ }
            try { client.close(); } catch { /* ignore */ }
            settle(reject, new Error("APNs probe timed out after 10s"));
        });
        req.end(JSON.stringify({ aps: { "content-available": 1 } }));
    });
}

// --------------------------------------------------------------------------
// FCM (Android)
// --------------------------------------------------------------------------

async function checkFcm() {
    console.log("\nFirebase Cloud Messaging (Android, HTTP v1)");
    console.log("-------------------------------------------");

    const projectId = (process.env.FIREBASE_PROJECT_ID?.trim()
        || process.env.FCM_PROJECT_ID?.trim());
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL?.trim()
        || process.env.FCM_CLIENT_EMAIL?.trim());
    const privateKeyRaw = (process.env.FIREBASE_PRIVATE_KEY?.trim()
        || process.env.FCM_PRIVATE_KEY?.trim());

    const allMissing = !projectId && !clientEmail && !privateKeyRaw;
    if (allMissing) {
        skip("FCM configuration", "no FIREBASE_*/FCM_* env vars set — Android background-call wake will be disabled");
        return;
    }

    check("FIREBASE_PROJECT_ID is set", !!projectId, "GCP project id (e.g. `my-app-prod`).");
    check("FIREBASE_CLIENT_EMAIL is set", !!clientEmail, "Service account email — usually `<name>@<project>.iam.gserviceaccount.com`.");
    check("FIREBASE_PRIVATE_KEY is set", !!privateKeyRaw, "Service account private key (BEGIN/END PRIVATE KEY block, `\\n` literals OK).");

    if (!projectId || !clientEmail || !privateKeyRaw) {
        return;
    }

    if (!clientEmail.endsWith(".iam.gserviceaccount.com")) {
        check("FIREBASE_CLIENT_EMAIL looks like a service-account email", false, "Expected suffix `.iam.gserviceaccount.com`. Did you paste a user email by mistake?");
    } else {
        check("FIREBASE_CLIENT_EMAIL looks like a service-account email", true);
    }

    const privateKeyPem = normalizePem(privateKeyRaw);
    if (!privateKeyPem.includes("BEGIN PRIVATE KEY")) {
        check("FIREBASE_PRIVATE_KEY is a PEM block", false, "Expected `-----BEGIN PRIVATE KEY-----` header. Use the `private_key` field from the service-account JSON.");
        return;
    }
    check("FIREBASE_PRIVATE_KEY is a PEM block", true);

    let keyObject;
    try {
        keyObject = createPrivateKey({ key: privateKeyPem, format: "pem" });
    } catch (err) {
        check("FIREBASE_PRIVATE_KEY parses as a private key", false, `node:crypto rejected the PEM: ${err?.message ?? err}`);
        return;
    }
    check("FIREBASE_PRIVATE_KEY parses as a private key", true);
    if (keyObject.asymmetricKeyType !== "rsa") {
        check("FIREBASE_PRIVATE_KEY is an RSA key (service-account keys are RSA)", false, `Got key type ${keyObject.asymmetricKeyType}.`);
        return;
    }
    check("FIREBASE_PRIVATE_KEY is an RSA key (service-account keys are RSA)", true);

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64UrlEncode(JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    }));
    const signingInput = `${header}.${payload}`;
    let signature;
    try {
        const signer = createSign("RSA-SHA256");
        signer.update(signingInput);
        signer.end();
        signature = signer.sign(privateKeyPem);
    } catch (err) {
        check("Sign FCM service-account JWT", false, `Signing failed: ${err?.message ?? err}`);
        return;
    }
    const assertion = `${signingInput}.${base64UrlEncode(signature)}`;
    check("Sign FCM service-account JWT", true, `${assertion.length} chars`);

    if (!PING_GATEWAYS) {
        skip("OAuth handshake with Google", "re-run with --ping-gateways to exchange the JWT for an access token");
        return;
    }

    // Exchange the JWT for an OAuth2 access token. This is the same
    // call sendCallVoipPush does on its first send and proves the
    // service-account credentials are valid. We don't actually send a
    // push (no device token to send to).
    let response;
    try {
        response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }).toString(),
        });
    } catch (err) {
        check("Google OAuth endpoint reachable", false, err?.message ?? String(err));
        return;
    }
    check("Google OAuth endpoint reachable", true);

    if (!response.ok) {
        let detail = "";
        try { detail = JSON.stringify(await response.json()); } catch { /* ignore */ }
        check("Google accepts the service-account JWT", false, `OAuth refused with status ${response.status}: ${detail}`);
        return;
    }
    const json = await response.json().catch(() => null);
    if (!json?.access_token) {
        check("Google accepts the service-account JWT", false, "OAuth response missing access_token field.");
        return;
    }
    check("Google accepts the service-account JWT", true, `received ${String(json.access_token).length}-char access token (kept in-memory only)`);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
    console.log("VoIP push doctor — verifies the env contract from server/lib/voip-push.ts");
    console.log(`Mode: ${PING_GATEWAYS ? "online (will hit Apple + Google auth endpoints)" : "offline (local checks only — re-run with --ping-gateways for the auth handshake)"}`);

    await checkApns();
    await checkFcm();

    console.log("\nSummary");
    console.log("-------");
    console.log(`  Passed:  ${totalPassed}`);
    console.log(`  Failed:  ${totalFailed}`);
    console.log(`  Skipped: ${totalSkipped}`);

    if (totalFailed > 0) {
        console.log("\nResult: FAIL — fix the issues above before relying on VoIP wake-pushes in production.");
        process.exit(1);
    }
    if (totalPassed === 0) {
        console.log("\nResult: NO TRANSPORTS CONFIGURED — set the APNS_* and/or FIREBASE_* env vars to enable lock-screen ringing.");
        process.exit(1);
    }
    console.log("\nResult: OK — every configured transport passed its checks.");
}

main().catch((err) => {
    console.error("\nUnexpected error:", err);
    process.exit(1);
});
