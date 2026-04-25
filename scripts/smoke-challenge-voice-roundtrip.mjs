#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const TOOL = "smoke-challenge-voice-roundtrip";

function fail(message, details) {
    console.error(`[${TOOL}] FAIL ${message}`, details ? `\n  -> ${details}` : "");
    process.exit(1);
}

function pass(stepName) {
    console.log(`[${TOOL}] PASS ${stepName}`);
}

function read(filePath) {
    if (!fs.existsSync(filePath)) {
        fail("File not found", filePath);
    }
    return fs.readFileSync(filePath, "utf8");
}

function expectContains(source, expected, stepName) {
    if (!source.includes(expected)) {
        fail(`Missing expected pattern for ${stepName}`, expected);
    }
    pass(stepName);
}

function expectAll(source, patterns, stepPrefix) {
    for (const pattern of patterns) {
        expectContains(source, pattern, `${stepPrefix}: ${pattern}`);
    }
}

function checkServerWiring(repoRoot) {
    const filePath = path.join(repoRoot, "server", "websocket", "voice.ts");
    const source = read(filePath);

    expectAll(
        source,
        [
            "rejectedNotParticipant: number",
            "rejectedPricingGate: number",
            "rejectedSignalingError: number",
            "rejectedNotParticipant: 0",
            "rejectedPricingGate: 0",
            "rejectedSignalingError: 0",
            "+ counters.rejectedNotParticipant",
            "+ counters.rejectedPricingGate",
            "+ counters.rejectedSignalingError",
        ],
        "server: telemetry counters wired",
    );

    expectAll(
        source,
        [
            "if (normalized.includes(\"insufficient project currency balance\")) return \"rejectedPricingGate\"",
            "if (normalized.includes(\"not authorized for this match\")) return \"rejectedNotParticipant\"",
            "if (normalized.includes(\"voice peer is not available\")) return \"rejectedSignalingError\"",
        ],
        "server: classifyVoiceError mapping",
    );

    expectAll(
        source,
        [
            "options?: { code?: string; details?: Record<string, unknown> }",
            "if (options?.code) payload.code = options.code",
            "if (options?.details) payload.details = options.details",
        ],
        "server: sendVoiceError attaches structured code/details",
    );

    expectAll(
        source,
        [
            "code: \"not_participant\"",
            "code: \"pricing_gate\"",
            "requiredRate: pricingGate.requiredRate",
            "walletBalance: pricingGate.walletBalance",
        ],
        "server: pricing-gate + not-participant rejections include client code",
    );
}

function checkClientWiring(repoRoot) {
    const filePath = path.join(repoRoot, "client", "src", "components", "games", "VoiceChat.tsx");
    const source = read(filePath);

    expectContains(
        source,
        "import { ensureCallRationale } from \"@/lib/call-permission-rationale\"",
        "client: imports rationale helper",
    );

    expectContains(
        source,
        "const rationaleDecision = await ensureCallRationale(\"voice\")",
        "client: ensureCallRationale runs before getUserMedia",
    );

    expectContains(
        source,
        "if (rationaleDecision === \"dismiss\")",
        "client: rationale dismissal short-circuits before media access",
    );

    expectAll(
        source,
        [
            "code?: string",
            "requiredRate?: number",
            "walletBalance?: number",
        ],
        "client: VoiceWsMessage carries pricing-gate metadata",
    );

    expectAll(
        source,
        [
            "data.code === \"pricing_gate\"",
            "challenge.voicePricingGateTitle",
            "challenge.voicePricingGateHint",
            "challenge.voicePricingGateHintFallback",
            "data.code === \"not_participant\"",
            "challenge.voiceNotParticipantTitle",
            "challenge.voiceNotParticipantHint",
        ],
        "client: pricing-gate + not-participant render localized toasts",
    );

    expectContains(
        source,
        "t(\"challenge.voicePricingGateHint\", { price: requiredRate })",
        "client: pricing-gate hint interpolates {price} from server",
    );
}

function checkLocaleStrings(repoRoot) {
    const enSource = read(path.join(repoRoot, "client", "src", "locales", "en.ts"));
    const arSource = read(path.join(repoRoot, "client", "src", "locales", "ar.ts"));

    const requiredKeys = [
        "challenge.voicePricingGateTitle",
        "challenge.voicePricingGateHint",
        "challenge.voicePricingGateHintFallback",
        "challenge.voiceNotParticipantTitle",
        "challenge.voiceNotParticipantHint",
    ];

    for (const key of requiredKeys) {
        const needle = `'${key}':`;
        if (!enSource.includes(needle)) {
            fail("Missing EN translation key", key);
        }
        if (!arSource.includes(needle)) {
            fail("Missing AR translation key", key);
        }
    }

    pass("locales: pricing-gate + not-participant strings present in EN and AR");

    if (!enSource.includes("{price}")) {
        fail("EN pricing-gate hint missing {price} placeholder");
    }
    if (!arSource.includes("{price}")) {
        fail("AR pricing-gate hint missing {price} placeholder");
    }

    pass("locales: {price} placeholder present in both EN and AR pricing-gate hints");
}

function checkExistingRoundtripSmoke(repoRoot) {
    const filePath = path.join(repoRoot, "scripts", "smoke-voice-signaling-load.mjs");
    const source = read(filePath);

    expectAll(
        source,
        [
            "voice_join",
            "voice_joined",
            "voice_offer",
            "voice_answer",
            "voice_ice_candidate",
            "voice_peer_joined",
            "voice_peer_left",
        ],
        "runtime: existing voice-signaling-load smoke covers offer/answer/ICE round-trip",
    );
}

function main() {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

    checkServerWiring(repoRoot);
    checkClientWiring(repoRoot);
    checkLocaleStrings(repoRoot);
    checkExistingRoundtripSmoke(repoRoot);

    console.log(`[${TOOL}] All checks passed.`);
}

main();
