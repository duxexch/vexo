#!/usr/bin/env node

/**
 * Runtime smoke for challenge voice chat.
 *
 * Spins up authenticated WebSocket clients against a running server and:
 *   1. Confirms two players in the SAME challenge can both `voice_join`,
 *      receive `voice_joined`, and round-trip a `voice_offer` →
 *      `voice_answer` → `voice_ice_candidate` exchange (smoke for the
 *      signaling mesh required by Task #87).
 *   2. (Optional) Asserts that a pre-paid challenge join with a low-balance
 *      user receives `voice_error { code: "pricing_gate", details: { requiredRate } }`.
 *      Because the server grants a free first-attempt per (matchId, user),
 *      the scenario must mark the user as already-consumed (e.g. by joining
 *      and leaving once) before this assertion runs — see README in the
 *      scenarios JSON.
 *   3. (Optional) Asserts that a non-participant token receives
 *      `voice_error { code: "not_participant" }` when joining the same room.
 *
 * Usage:
 *   node scripts/smoke-challenge-voice-roundtrip.mjs \
 *     --base-url=http://localhost:3001 \
 *     --scenarios=path/to/scenarios.json
 *
 * Scenarios JSON format (array of objects):
 *   {
 *     "name": "challenge-roundtrip",
 *     "matchId": "<challenge-id>",
 *     "tokenA": "<player A jwt>",
 *     "tokenB": "<player B jwt>",
 *     "tokenInsufficient": "<low-balance jwt for the same challenge>",  // optional
 *     "expectedRequiredRate": 15,                                       // optional, asserted in details
 *     "tokenNonParticipant": "<jwt for user not in challenge>"          // optional
 *   }
 */

import fs from "node:fs/promises";
import path from "node:path";
import { WebSocket } from "ws";

const TOOL = "smoke-challenge-voice-roundtrip";
const SMOKE_USER_AGENT = `${TOOL}/1.0`;
const DEFAULT_TIMEOUT_MS = 9000;

class SmokeFailure extends Error {
    constructor(message, details) {
        super(details !== undefined ? `${message}: ${details}` : message);
        this.name = "SmokeFailure";
    }
}

function parseArgs(argv) {
    const options = {
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        scenariosFile: process.env.VOICE_SCENARIOS_FILE || "",
        timeoutMs: Number.parseInt(process.env.VOICE_RT_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS,
        icePerSide: Number.parseInt(process.env.VOICE_RT_ICE_PER_SIDE || "", 10) || 3,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const part = argv[i];
        const [key, rawValue] = part.split("=");
        if (!rawValue) continue;
        if (key === "--base-url") options.baseUrl = rawValue;
        if (key === "--scenarios") options.scenariosFile = rawValue;
        if (key === "--timeout-ms") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = parsed;
        }
        if (key === "--ice-per-side") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.icePerSide = parsed;
        }
    }

    options.baseUrl = options.baseUrl.replace(/\/+$/, "");
    return options;
}

function toWebSocketUrl(baseUrl) {
    if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
    if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
    if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) return baseUrl;
    return `ws://${baseUrl}`;
}

function expandWsMessages(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw.toString());
    } catch {
        return [];
    }
    if (parsed?.type === "batch" && Array.isArray(parsed.messages)) {
        return parsed.messages;
    }
    return [parsed];
}

class VoiceWsClient {
    constructor(name, wsUrl, token, timeoutMs) {
        this.name = name;
        this.wsUrl = wsUrl;
        this.token = token;
        this.timeoutMs = timeoutMs;
        this.ws = null;
        this.messageQueue = [];
        this.waiters = [];
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl, {
            headers: { "User-Agent": SMOKE_USER_AGENT },
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`${this.name}: websocket open timeout`));
            }, this.timeoutMs);
            const cleanup = () => {
                clearTimeout(timeout);
                this.ws?.off("open", onOpen);
                this.ws?.off("close", onClose);
                this.ws?.off("error", onError);
            };
            const onOpen = () => { cleanup(); resolve(); };
            const onClose = (code, reason) => {
                cleanup();
                reject(new Error(`${this.name}: closed before open (${code}) ${reason.toString()}`));
            };
            const onError = (error) => { cleanup(); reject(error); };
            this.ws.on("open", onOpen);
            this.ws.on("close", onClose);
            this.ws.on("error", onError);
        });

        this.ws.on("message", (raw) => {
            for (const message of expandWsMessages(raw)) {
                this._pushMessage(message);
            }
        });
    }

    _pushMessage(message) {
        for (let i = 0; i < this.waiters.length; i += 1) {
            const waiter = this.waiters[i];
            if (waiter.predicate(message)) {
                this.waiters.splice(i, 1);
                waiter.resolve(message);
                return;
            }
        }
        this.messageQueue.push(message);
    }

    send(payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error(`${this.name}: websocket is not open`);
        }
        this.ws.send(JSON.stringify(payload));
    }

    waitFor(predicate, label, timeoutMs = this.timeoutMs) {
        for (let i = 0; i < this.messageQueue.length; i += 1) {
            const message = this.messageQueue[i];
            if (predicate(message)) {
                this.messageQueue.splice(i, 1);
                return Promise.resolve(message);
            }
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`${this.name}: timeout waiting for ${label}`));
            }, timeoutMs);
            const waiter = {
                predicate,
                resolve: (message) => { cleanup(); resolve(message); },
                reject,
            };
            const cleanup = () => {
                clearTimeout(timeout);
                const idx = this.waiters.indexOf(waiter);
                if (idx >= 0) this.waiters.splice(idx, 1);
            };
            this.waiters.push(waiter);
        });
    }

    waitForType(type, matchId) {
        return this.waitFor(
            (message) => message?.type === type && (matchId ? message?.matchId === matchId : true),
            `${type}${matchId ? `(${matchId})` : ""}`,
        );
    }

    async authenticate() {
        this.send({ type: "auth", token: this.token });
        const response = await this.waitFor(
            (message) => message?.type === "auth_success" || message?.type === "auth_error",
            "auth_success",
        );
        if (response?.type !== "auth_success") {
            throw new Error(`${this.name}: auth failed: ${response?.error || "unknown"}`);
        }
    }

    async close() {
        if (!this.ws) return;
        const current = this.ws;
        if (current.readyState === WebSocket.CLOSED) {
            this.ws = null;
            return;
        }
        await new Promise((resolve) => {
            const timeout = setTimeout(() => { current.terminate(); resolve(); }, 800);
            current.once("close", () => { clearTimeout(timeout); resolve(); });
            try { current.close(1000, "smoke-close"); }
            catch { clearTimeout(timeout); current.terminate(); resolve(); }
        });
        this.ws = null;
        this.messageQueue = [];
        this.waiters = [];
    }
}

async function loadScenarios(filePath) {
    if (!filePath) {
        throw new SmokeFailure("Missing --scenarios file");
    }
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new SmokeFailure("Scenarios file must contain a non-empty array");
    }
    return parsed.map((entry, index) => {
        const scenario = entry || {};
        const name = typeof scenario.name === "string" && scenario.name.length > 0 ? scenario.name : `scenario-${index + 1}`;
        if (typeof scenario.matchId !== "string" || scenario.matchId.length === 0) {
            throw new SmokeFailure(`Scenario ${name} missing matchId`);
        }
        if (typeof scenario.tokenA !== "string" || scenario.tokenA.length < 20) {
            throw new SmokeFailure(`Scenario ${name} missing tokenA`);
        }
        if (typeof scenario.tokenB !== "string" || scenario.tokenB.length < 20) {
            throw new SmokeFailure(`Scenario ${name} missing tokenB`);
        }
        return {
            name,
            matchId: scenario.matchId,
            tokenA: scenario.tokenA,
            tokenB: scenario.tokenB,
            tokenInsufficient: typeof scenario.tokenInsufficient === "string" ? scenario.tokenInsufficient : null,
            expectedRequiredRate: typeof scenario.expectedRequiredRate === "number" ? scenario.expectedRequiredRate : null,
            tokenNonParticipant: typeof scenario.tokenNonParticipant === "string" ? scenario.tokenNonParticipant : null,
        };
    });
}

function createOfferSdp() {
    return [
        "v=0",
        `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
        "s=vex-roundtrip-offer",
        "t=0 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "c=IN IP4 0.0.0.0",
        "a=rtpmap:111 opus/48000/2",
        "a=sendrecv",
    ].join("\r\n");
}

function createAnswerSdp() {
    return [
        "v=0",
        `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
        "s=vex-roundtrip-answer",
        "t=0 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "c=IN IP4 0.0.0.0",
        "a=rtpmap:111 opus/48000/2",
        "a=sendrecv",
    ].join("\r\n");
}

function createIceCandidate(direction, index) {
    return {
        candidate: `candidate:${index} 1 UDP 2122252543 192.0.2.${(index % 200) + 1} ${50000 + index} typ host generation 0`,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: `${direction}${index}`,
    };
}

async function runRoundtrip(wsUrl, scenario, options) {
    const clientA = new VoiceWsClient(`${scenario.name}:A`, wsUrl, scenario.tokenA, options.timeoutMs);
    const clientB = new VoiceWsClient(`${scenario.name}:B`, wsUrl, scenario.tokenB, options.timeoutMs);

    try {
        await Promise.all([clientA.connect(), clientB.connect()]);
        await Promise.all([clientA.authenticate(), clientB.authenticate()]);

        // A joins first — its voice_joined.peers will be empty.
        clientA.send({ type: "voice_join", matchId: scenario.matchId });
        const joinedA = await clientA.waitForType("voice_joined", scenario.matchId);
        if (joinedA?.type !== "voice_joined") {
            throw new SmokeFailure(`${scenario.name}: A did not receive voice_joined`);
        }

        // B joins second. A learns B's userId via voice_peer_joined.peerUserId.
        // B learns A's userId via voice_joined.peers[0].userId.
        const aLearnsBPromise = clientA.waitForType("voice_peer_joined", scenario.matchId);
        clientB.send({ type: "voice_join", matchId: scenario.matchId });
        const joinedB = await clientB.waitForType("voice_joined", scenario.matchId);
        if (joinedB?.type !== "voice_joined") {
            throw new SmokeFailure(`${scenario.name}: B did not receive voice_joined`);
        }
        const peerJoined = await aLearnsBPromise;

        const bUserId = typeof peerJoined?.peerUserId === "string" ? peerJoined.peerUserId : null;
        const aUserId = Array.isArray(joinedB?.peers) && joinedB.peers.length > 0 && typeof joinedB.peers[0]?.userId === "string"
            ? joinedB.peers[0].userId
            : null;

        if (!bUserId) {
            throw new SmokeFailure(`${scenario.name}: did not receive B's userId via voice_peer_joined`);
        }
        if (!aUserId) {
            throw new SmokeFailure(`${scenario.name}: did not receive A's userId via voice_joined.peers`);
        }

        // Round-trip: A → B (offer), B → A (answer), then ICE both ways. The
        // server requires targetUserId for offer/answer/ICE forwarding.
        clientA.send({
            type: "voice_offer",
            matchId: scenario.matchId,
            targetUserId: bUserId,
            offer: { type: "offer", sdp: createOfferSdp() },
        });
        const offerOnB = await clientB.waitForType("voice_offer", scenario.matchId);
        if (!offerOnB?.offer?.sdp) {
            throw new SmokeFailure(`${scenario.name}: voice_offer arrived without sdp`);
        }
        if (offerOnB?.fromUserId !== aUserId) {
            throw new SmokeFailure(`${scenario.name}: voice_offer fromUserId mismatch (expected ${aUserId}, got ${offerOnB?.fromUserId})`);
        }

        clientB.send({
            type: "voice_answer",
            matchId: scenario.matchId,
            targetUserId: aUserId,
            answer: { type: "answer", sdp: createAnswerSdp() },
        });
        const answerOnA = await clientA.waitForType("voice_answer", scenario.matchId);
        if (!answerOnA?.answer?.sdp) {
            throw new SmokeFailure(`${scenario.name}: voice_answer arrived without sdp`);
        }
        if (answerOnA?.fromUserId !== bUserId) {
            throw new SmokeFailure(`${scenario.name}: voice_answer fromUserId mismatch (expected ${bUserId}, got ${answerOnA?.fromUserId})`);
        }

        for (let i = 0; i < options.icePerSide; i += 1) {
            clientA.send({
                type: "voice_ice_candidate",
                matchId: scenario.matchId,
                targetUserId: bUserId,
                candidate: createIceCandidate("a", i),
            });
            await clientB.waitForType("voice_ice_candidate", scenario.matchId);
        }
        for (let i = 0; i < options.icePerSide; i += 1) {
            clientB.send({
                type: "voice_ice_candidate",
                matchId: scenario.matchId,
                targetUserId: aUserId,
                candidate: createIceCandidate("b", i),
            });
            await clientA.waitForType("voice_ice_candidate", scenario.matchId);
        }

        clientA.send({ type: "voice_leave", matchId: scenario.matchId });
        clientB.send({ type: "voice_leave", matchId: scenario.matchId });
    } finally {
        await Promise.all([clientA.close(), clientB.close()]);
    }
}

async function runPricingGateAssertion(wsUrl, scenario, options) {
    const client = new VoiceWsClient(`${scenario.name}:lowBalance`, wsUrl, scenario.tokenInsufficient, options.timeoutMs);
    try {
        await client.connect();
        await client.authenticate();
        client.send({ type: "voice_join", matchId: scenario.matchId });
        const message = await client.waitFor(
            (m) => m?.type === "voice_error" || m?.type === "voice_joined",
            "voice_error or voice_joined",
        );

        if (message?.type !== "voice_error") {
            throw new SmokeFailure(
                `${scenario.name}: expected voice_error pricing_gate, got ${message?.type} `
                + `(if scenario user has not consumed their first-attempt-free, they will be admitted instead — `
                + `mark them consumed before running this assertion)`,
            );
        }
        if (message?.code !== "pricing_gate") {
            throw new SmokeFailure(`${scenario.name}: expected code "pricing_gate", got "${message?.code}"`);
        }
        if (typeof message?.details?.requiredRate !== "number") {
            throw new SmokeFailure(`${scenario.name}: voice_error.details.requiredRate is missing or not a number`);
        }
        if (scenario.expectedRequiredRate !== null && Math.abs(message.details.requiredRate - scenario.expectedRequiredRate) > 0.01) {
            throw new SmokeFailure(
                `${scenario.name}: requiredRate mismatch — expected ${scenario.expectedRequiredRate}, got ${message.details.requiredRate}`,
            );
        }
    } finally {
        await client.close();
    }
}

async function runNotParticipantAssertion(wsUrl, scenario, options) {
    const client = new VoiceWsClient(`${scenario.name}:nonParticipant`, wsUrl, scenario.tokenNonParticipant, options.timeoutMs);
    try {
        await client.connect();
        await client.authenticate();
        client.send({ type: "voice_join", matchId: scenario.matchId });
        const message = await client.waitFor(
            (m) => m?.type === "voice_error" || m?.type === "voice_joined",
            "voice_error or voice_joined",
        );
        if (message?.type !== "voice_error") {
            throw new SmokeFailure(`${scenario.name}: expected voice_error not_participant, got ${message?.type}`);
        }
        if (message?.code !== "not_participant") {
            throw new SmokeFailure(`${scenario.name}: expected code "not_participant", got "${message?.code}"`);
        }
    } finally {
        await client.close();
    }
}

async function runScenario(wsUrl, scenario, options) {
    console.log(`[${TOOL}] Running scenario: ${scenario.name}`);

    await runRoundtrip(wsUrl, scenario, options);
    console.log(`[${TOOL}] PASS ${scenario.name}: round-trip (offer/answer/ICE) completed`);

    if (scenario.tokenInsufficient) {
        await runPricingGateAssertion(wsUrl, scenario, options);
        console.log(`[${TOOL}] PASS ${scenario.name}: pricing-gate code "pricing_gate" + requiredRate detail`);
    } else {
        console.log(`[${TOOL}] SKIP ${scenario.name}: no tokenInsufficient — pricing-gate assertion skipped`);
    }

    if (scenario.tokenNonParticipant) {
        await runNotParticipantAssertion(wsUrl, scenario, options);
        console.log(`[${TOOL}] PASS ${scenario.name}: non-participant code "not_participant"`);
    } else {
        console.log(`[${TOOL}] SKIP ${scenario.name}: no tokenNonParticipant — not-participant assertion skipped`);
    }
}

async function main() {
    const options = parseArgs(process.argv);
    const scenarios = await loadScenarios(options.scenariosFile);

    const health = await fetch(`${options.baseUrl}/`);
    if (!health.ok) {
        throw new SmokeFailure(`Health endpoint returned ${health.status} at ${options.baseUrl}/`);
    }

    const wsUrl = `${toWebSocketUrl(options.baseUrl)}/ws`;
    console.log(`[${TOOL}] Starting`, { baseUrl: options.baseUrl, scenarios: scenarios.length });

    for (const scenario of scenarios) {
        await runScenario(wsUrl, scenario, options);
    }

    console.log(`[${TOOL}] All scenarios passed.`);
}

main().catch((error) => {
    console.error(`[${TOOL}] FAIL`, error instanceof Error ? error.message : String(error));
    process.exit(1);
});
