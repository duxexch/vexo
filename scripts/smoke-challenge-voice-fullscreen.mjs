#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message, details) {
    console.error("[smoke:challenge-voice-fullscreen] FAIL", message, details || "");
    process.exit(1);
}

function pass(stepName) {
    console.log(`[smoke:challenge-voice-fullscreen] PASS ${stepName}`);
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

function runChallengeGameChecks(repoRoot) {
    const filePath = path.join(repoRoot, "client", "src", "pages", "challenge-game.tsx");
    const source = read(filePath);

    expectAll(
        source,
        [
            "const challengeVoiceTargets = useMemo(",
            "id: \"voice-self-mic\"",
            "id: `voice-peer-${target.id}`",
            "peerAudioMutedOverride={voicePeerMutedMap}",
            "onConnectedPeersChange={setConnectedVoicePeers}",
            "if (shouldRenderPlayerVoiceChat)",
            "GameFullscreenActionDock",
            "actions={fullscreenPlayActions}",
        ],
        "challenge-game fullscreen voice controls",
    );

    expectContains(
        source,
        "</header>\n\n          {shouldRenderPlayerVoiceChat && (",
        "challenge-game voice mount outside hidden header",
    );
}

function runChallengeWatchChecks(repoRoot) {
    const filePath = path.join(repoRoot, "client", "src", "pages", "challenge-watch.tsx");
    const source = read(filePath);

    expectAll(
        source,
        [
            "const challengeVoiceTargets = useMemo(",
            "id: `voice-peer-${target.id}`",
            "peerAudioMutedOverride={voicePeerMutedMap}",
            "onConnectedPeersChange={setConnectedVoicePeers}",
            "GameFullscreenActionDock",
            "actions={fullscreenWatchActions}",
        ],
        "challenge-watch fullscreen voice controls",
    );

    expectContains(
        source,
        "</header>\n\n          <VoiceChat",
        "challenge-watch voice mount outside hidden header",
    );
}

function runVoiceReliabilityChecks(repoRoot) {
    const voiceClientPath = path.join(repoRoot, "client", "src", "components", "games", "VoiceChat.tsx");
    const voiceServerPath = path.join(repoRoot, "server", "websocket", "voice.ts");

    const clientSource = read(voiceClientPath);
    const serverSource = read(voiceServerPath);

    expectAll(
        clientSource,
        [
            "const HEARTBEAT_INTERVAL_MS = 10_000;",
            "type: \"voice_ping\"",
            "case \"voice_pong\":",
            "suppressReconnectOnCloseRef.current = isFatalVoiceError(data.type, data.error);",
        ],
        "voice client resilience",
    );

    expectAll(
        serverSource,
        [
            "if (data.type === \"voice_ping\" && ws.userId)",
            "type: \"voice_pong\"",
        ],
        "voice server heartbeat",
    );
}

function main() {
    const repoRoot = process.cwd();

    runChallengeGameChecks(repoRoot);
    runChallengeWatchChecks(repoRoot);
    runVoiceReliabilityChecks(repoRoot);

    console.log("[smoke:challenge-voice-fullscreen] All checks passed.");
}

main();
