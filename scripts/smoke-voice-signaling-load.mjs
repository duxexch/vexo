#!/usr/bin/env node

import fs from "node:fs/promises";
import { WebSocket } from "ws";

const SMOKE_USER_AGENT = "smoke-voice-signaling-load/1.0";
const DEFAULT_TIMEOUT_MS = 9000;

function parseArgs(argv) {
    const options = {
        baseUrl: process.env.BASE_URL || "http://localhost:3001",
        scenariosFile: process.env.VOICE_SCENARIOS_FILE || "",
        rounds: Number.parseInt(process.env.VOICE_LOAD_ROUNDS || "", 10) || 3,
        timeoutMs: Number.parseInt(process.env.VOICE_LOAD_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS,
        icePerRound: Number.parseInt(process.env.VOICE_LOAD_ICE_PER_ROUND || "", 10) || 6,
        parallel: Number.parseInt(process.env.VOICE_LOAD_PARALLEL || "", 10) || 2,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const part = argv[i];
        const [key, rawValue] = part.split("=");
        if (!rawValue) continue;

        if (key === "--base-url") options.baseUrl = rawValue;
        if (key === "--scenarios") options.scenariosFile = rawValue;
        if (key === "--rounds") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.rounds = parsed;
        }
        if (key === "--timeout-ms") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = parsed;
        }
        if (key === "--ice-per-round") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.icePerRound = parsed;
        }
        if (key === "--parallel") {
            const parsed = Number.parseInt(rawValue, 10);
            if (Number.isFinite(parsed) && parsed > 0) options.parallel = parsed;
        }
    }

    options.baseUrl = options.baseUrl.replace(/\/+$/, "");
    return options;
}

function fail(message, details) {
    if (details !== undefined) {
        console.error("[smoke:voice-signaling-load]", message, details);
    } else {
        console.error("[smoke:voice-signaling-load]", message);
    }
    process.exit(1);
}

function toWebSocketUrl(baseUrl) {
    if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
    if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
    if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) return baseUrl;
    return `ws://${baseUrl}`;
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
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
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            await this.close();
        }

        this.ws = new WebSocket(this.wsUrl, {
            headers: {
                "User-Agent": SMOKE_USER_AGENT,
            },
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

            const onOpen = () => {
                cleanup();
                resolve();
            };

            const onClose = (code, reason) => {
                cleanup();
                reject(new Error(`${this.name}: websocket closed before open (${code}) ${reason.toString()}`));
            };

            const onError = (error) => {
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };

            this.ws.on("open", onOpen);
            this.ws.on("close", onClose);
            this.ws.on("error", onError);
        });

        this.ws.on("message", (raw) => {
            const messages = expandWsMessages(raw);
            for (const message of messages) {
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
                resolve: (message) => {
                    cleanup();
                    resolve(message);
                },
                reject,
            };

            const cleanup = () => {
                clearTimeout(timeout);
                const idx = this.waiters.indexOf(waiter);
                if (idx >= 0) {
                    this.waiters.splice(idx, 1);
                }
            };

            this.waiters.push(waiter);
        });
    }

    waitForType(type, matchId, timeoutMs = this.timeoutMs) {
        return this.waitFor(
            (message) => message?.type === type && (matchId ? message?.matchId === matchId : true),
            `${type}${matchId ? `(${matchId})` : ""}`,
            timeoutMs,
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

    async close(code = 1000, reason = "smoke-close") {
        if (!this.ws) return;

        const current = this.ws;
        if (current.readyState === WebSocket.CLOSED) {
            this.ws = null;
            return;
        }

        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                current.terminate();
                resolve();
            }, 800);

            current.once("close", () => {
                clearTimeout(timeout);
                resolve();
            });

            try {
                current.close(code, reason);
            } catch {
                clearTimeout(timeout);
                current.terminate();
                resolve();
            }
        });

        this.ws = null;
        this.messageQueue = [];
        this.waiters = [];
    }
}

async function loadScenarios(filePath) {
    if (!filePath) {
        fail("Missing scenarios file. Use --scenarios=path/to/scenarios.json");
    }

    let raw;
    try {
        raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
        fail("Failed to read scenarios file", error instanceof Error ? error.message : String(error));
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        fail("Scenarios file is not valid JSON", error instanceof Error ? error.message : String(error));
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        fail("Scenarios file must contain a non-empty array");
    }

    return parsed.map((entry, index) => {
        const scenario = entry || {};
        const name = typeof scenario.name === "string" && scenario.name.length > 0 ? scenario.name : `scenario-${index + 1}`;

        if (typeof scenario.matchId !== "string" || scenario.matchId.length === 0) {
            fail(`Scenario ${name} missing matchId`);
        }
        if (typeof scenario.tokenA !== "string" || scenario.tokenA.length < 20) {
            fail(`Scenario ${name} missing tokenA`);
        }
        if (typeof scenario.tokenB !== "string" || scenario.tokenB.length < 20) {
            fail(`Scenario ${name} missing tokenB`);
        }

        return {
            name,
            matchId: scenario.matchId,
            tokenA: scenario.tokenA,
            tokenB: scenario.tokenB,
        };
    });
}

function createOfferSdp(round) {
    return [
        "v=0",
        `o=- ${Date.now()} ${round} IN IP4 127.0.0.1`,
        "s=vex-voice-load",
        "t=0 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "c=IN IP4 0.0.0.0",
        "a=rtpmap:111 opus/48000/2",
        "a=sendrecv",
    ].join("\r\n");
}

function createAnswerSdp(round) {
    return [
        "v=0",
        `o=- ${Date.now()} ${round} IN IP4 127.0.0.1`,
        "s=vex-voice-load-answer",
        "t=0 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "c=IN IP4 0.0.0.0",
        "a=rtpmap:111 opus/48000/2",
        "a=sendrecv",
    ].join("\r\n");
}

function createIceCandidate(round, direction, index) {
    return {
        candidate: `candidate:${round}${index} 1 UDP 2122252543 192.0.2.${(index % 200) + 1} ${50000 + index} typ host generation 0`,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: `${direction}${round}${index}`,
    };
}

async function runScenarioRound({ wsUrl, scenario, round, timeoutMs, icePerRound }) {
    const clientA = new VoiceWsClient(`${scenario.name}:A:r${round}`, wsUrl, scenario.tokenA, timeoutMs);
    const clientB = new VoiceWsClient(`${scenario.name}:B:r${round}`, wsUrl, scenario.tokenB, timeoutMs);

    const timings = {
        offerMs: 0,
        answerMs: 0,
        reconnectMs: 0,
    };

    try {
        await Promise.all([clientA.connect(), clientB.connect()]);
        await Promise.all([clientA.authenticate(), clientB.authenticate()]);

        clientA.send({ type: "voice_join", matchId: scenario.matchId });
        await clientA.waitForType("voice_joined", scenario.matchId);

        const peerJoinedWait = clientA.waitForType("voice_peer_joined", scenario.matchId);
        clientB.send({ type: "voice_join", matchId: scenario.matchId });
        await clientB.waitForType("voice_joined", scenario.matchId);
        await peerJoinedWait;

        const offerSentAt = Date.now();
        clientA.send({
            type: "voice_offer",
            matchId: scenario.matchId,
            offer: {
                type: "offer",
                sdp: createOfferSdp(round),
            },
        });
        await clientB.waitForType("voice_offer", scenario.matchId);
        timings.offerMs = Date.now() - offerSentAt;

        const answerSentAt = Date.now();
        clientB.send({
            type: "voice_answer",
            matchId: scenario.matchId,
            answer: {
                type: "answer",
                sdp: createAnswerSdp(round),
            },
        });
        await clientA.waitForType("voice_answer", scenario.matchId);
        timings.answerMs = Date.now() - answerSentAt;

        for (let i = 0; i < icePerRound; i += 1) {
            clientA.send({
                type: "voice_ice_candidate",
                matchId: scenario.matchId,
                candidate: createIceCandidate(round, "a", i),
            });
            await clientB.waitForType("voice_ice_candidate", scenario.matchId);
        }

        for (let i = 0; i < icePerRound; i += 1) {
            clientB.send({
                type: "voice_ice_candidate",
                matchId: scenario.matchId,
                candidate: createIceCandidate(round, "b", i),
            });
            await clientA.waitForType("voice_ice_candidate", scenario.matchId);
        }

        const peerLeftWait = clientB.waitForType("voice_peer_left", scenario.matchId, timeoutMs + 2000);
        await clientA.close(1000, "reconnect-check");
        await peerLeftWait;

        const reconnectStartedAt = Date.now();
        await clientA.connect();
        await clientA.authenticate();
        const peerJoinedAgainWait = clientB.waitForType("voice_peer_joined", scenario.matchId, timeoutMs + 2000);
        clientA.send({ type: "voice_join", matchId: scenario.matchId });
        await clientA.waitForType("voice_joined", scenario.matchId, timeoutMs + 2000);
        await peerJoinedAgainWait;
        timings.reconnectMs = Date.now() - reconnectStartedAt;

        clientA.send({ type: "voice_leave", matchId: scenario.matchId });
        clientB.send({ type: "voice_leave", matchId: scenario.matchId });

        await Promise.all([clientA.close(), clientB.close()]);
        return { ok: true, timings };
    } catch (error) {
        await Promise.all([clientA.close(1001, "round-failed"), clientB.close(1001, "round-failed")]);
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function runScenario(options, scenario, wsUrl) {
    const result = {
        name: scenario.name,
        attemptedRounds: options.rounds,
        passedRounds: 0,
        failedRounds: 0,
        offerLatencies: [],
        answerLatencies: [],
        reconnectLatencies: [],
        errors: [],
    };

    for (let round = 1; round <= options.rounds; round += 1) {
        const roundResult = await runScenarioRound({
            wsUrl,
            scenario,
            round,
            timeoutMs: options.timeoutMs,
            icePerRound: options.icePerRound,
        });

        if (roundResult.ok) {
            result.passedRounds += 1;
            result.offerLatencies.push(roundResult.timings.offerMs);
            result.answerLatencies.push(roundResult.timings.answerMs);
            result.reconnectLatencies.push(roundResult.timings.reconnectMs);
        } else {
            result.failedRounds += 1;
            result.errors.push(`round-${round}: ${roundResult.error}`);
        }
    }

    return result;
}

async function runWithConcurrency(items, parallel, worker) {
    const results = new Array(items.length);
    let currentIndex = 0;

    async function workerLoop() {
        while (true) {
            const idx = currentIndex;
            currentIndex += 1;
            if (idx >= items.length) {
                return;
            }
            results[idx] = await worker(items[idx], idx);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(parallel, items.length); i += 1) {
        workers.push(workerLoop());
    }

    await Promise.all(workers);
    return results;
}

async function main() {
    const options = parseArgs(process.argv);
    const scenarios = await loadScenarios(options.scenariosFile);

    const health = await fetch(`${options.baseUrl}/`);
    if (!health.ok) {
        fail(`Health endpoint returned ${health.status} at ${options.baseUrl}/`);
    }

    const wsUrl = `${toWebSocketUrl(options.baseUrl)}/ws`;

    console.log("[smoke:voice-signaling-load] Starting run", {
        baseUrl: options.baseUrl,
        scenarios: scenarios.length,
        rounds: options.rounds,
        icePerRound: options.icePerRound,
        parallel: options.parallel,
    });

    const startedAt = Date.now();
    const scenarioResults = await runWithConcurrency(scenarios, options.parallel, (scenario) => runScenario(options, scenario, wsUrl));
    const durationMs = Date.now() - startedAt;

    let totalAttempted = 0;
    let totalPassed = 0;
    const offerLatencies = [];
    const answerLatencies = [];
    const reconnectLatencies = [];

    for (const result of scenarioResults) {
        totalAttempted += result.attemptedRounds;
        totalPassed += result.passedRounds;
        offerLatencies.push(...result.offerLatencies);
        answerLatencies.push(...result.answerLatencies);
        reconnectLatencies.push(...result.reconnectLatencies);

        console.log("[smoke:voice-signaling-load] Scenario result", {
            name: result.name,
            attemptedRounds: result.attemptedRounds,
            passedRounds: result.passedRounds,
            failedRounds: result.failedRounds,
            p95OfferMs: percentile(result.offerLatencies, 95),
            p95AnswerMs: percentile(result.answerLatencies, 95),
            p95ReconnectMs: percentile(result.reconnectLatencies, 95),
            errors: result.errors.slice(0, 5),
        });
    }

    const passRate = totalAttempted > 0 ? Number(((totalPassed / totalAttempted) * 100).toFixed(2)) : 0;
    const summary = {
        durationMs,
        scenarios: scenarios.length,
        totalAttempted,
        totalPassed,
        totalFailed: totalAttempted - totalPassed,
        passRate,
        p95OfferMs: percentile(offerLatencies, 95),
        p95AnswerMs: percentile(answerLatencies, 95),
        p95ReconnectMs: percentile(reconnectLatencies, 95),
    };

    console.log("[smoke:voice-signaling-load] Summary", summary);

    if (totalPassed !== totalAttempted) {
        process.exit(1);
    }
}

main().catch((error) => {
    fail("Unexpected error", error instanceof Error ? error.message : String(error));
});
