import crypto from 'node:crypto';
import type { MoveData } from '../game-engines/types';
import { logger } from './logger';

const rawAiAgentBaseUrl = (process.env.AI_AGENT_BASE_URL || 'http://vex-ai-agent:3100').trim();
const AI_AGENT_BASE_URL = rawAiAgentBaseUrl.replace(/\/+$/, '');
const AI_AGENT_TOKEN = process.env.AI_AGENT_SHARED_TOKEN || '';
const AI_AGENT_PAYLOAD_SALT = process.env.AI_AGENT_PAYLOAD_SALT || AI_AGENT_TOKEN || 'sam9-server-side-salt';
const AI_AGENT_ENABLED = String(process.env.AI_AGENT_ENABLED || 'true').toLowerCase() !== 'false';
const AI_AGENT_TIMEOUT_MS = Math.max(150, toNumber(process.env.AI_AGENT_TIMEOUT_MS, 900));
const UNAVAILABLE_LOG_THROTTLE_MS = 60_000;
const SENSITIVE_KEY_RE = /(password|passcode|secret|token|email|phone|mobile|address|national|ssn|iban|card|cvv|otp|cookie|authorization|auth)/i;
const IDENTIFIER_KEY_RE = /(^|_)(user|admin|player|bot|session).*id(s)?$/i;

let lastUnavailableLogAt = 0;
let warnedDisabled = false;

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}

function hashStable(value: unknown): string {
    const digest = crypto
        .createHmac('sha256', AI_AGENT_PAYLOAD_SALT)
        .update(String(value ?? ''))
        .digest('hex');
    return `anon_${digest.slice(0, 16)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeString(value: string): string {
    let sanitized = value.trim();
    sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
    sanitized = sanitized.replace(/\+?\d[\d\s\-()]{7,}\d/g, '[redacted-phone]');
    if (sanitized.length > 240) {
        sanitized = `${sanitized.slice(0, 240)}...`;
    }
    return sanitized;
}

function sanitizeLearningPayload(value: unknown, keyPath = '', depth = 0): unknown {
    if (depth > 8) return '[depth-limited]';
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        const keyName = keyPath.split('.').pop() || '';
        if (SENSITIVE_KEY_RE.test(keyName)) return '[redacted]';
        if (IDENTIFIER_KEY_RE.test(keyName)) return hashStable(value);
        return sanitizeString(value);
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        const keyName = keyPath.split('.').pop() || '';
        if (IDENTIFIER_KEY_RE.test(keyName)) {
            return value.slice(0, 120).map((item) => hashStable(item));
        }
        return value.slice(0, 120).map((item, index) => sanitizeLearningPayload(item, `${keyPath}[${index}]`, depth + 1));
    }

    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            if (SENSITIVE_KEY_RE.test(key)) {
                out[key] = '[redacted]';
                continue;
            }
            if (IDENTIFIER_KEY_RE.test(key)) {
                if (Array.isArray(entry)) {
                    out[key] = entry.slice(0, 120).map((item) => hashStable(item));
                } else {
                    out[key] = hashStable(entry);
                }
                continue;
            }

            out[key] = sanitizeLearningPayload(entry, keyPath ? `${keyPath}.${key}` : key, depth + 1);
        }
        return out;
    }

    return String(value);
}

function anonymizeIdentifier(value: string): string {
    return hashStable(value);
}

function canUseAiAgent(): boolean {
    if (!AI_AGENT_ENABLED) {
        if (!warnedDisabled) {
            warnedDisabled = true;
            logger.info('[AI Agent] External AI service disabled by AI_AGENT_ENABLED=false');
        }
        return false;
    }

    if (!AI_AGENT_BASE_URL) {
        return false;
    }

    return true;
}

function logAiAgentUnavailable(message: string, context?: Record<string, unknown>, force = false): void {
    if (!force) {
        const now = Date.now();
        if (now - lastUnavailableLogAt < UNAVAILABLE_LOG_THROTTLE_MS) {
            return;
        }
        lastUnavailableLogAt = now;
    }

    logger.warn(message, context);
}

interface AiAgentRequestOptions {
    timeoutMs?: number;
    suppressUnavailableLog?: boolean;
}

async function requestAiAgentJson<T>(
    endpoint: string,
    init: RequestInit,
    options: AiAgentRequestOptions = {},
): Promise<T | null> {
    if (!canUseAiAgent()) {
        return null;
    }

    const timeoutMs = Math.max(100, options.timeoutMs || AI_AGENT_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers || undefined);

    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (AI_AGENT_TOKEN) {
        headers.set('x-ai-agent-token', AI_AGENT_TOKEN);
    }

    const url = `${AI_AGENT_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...init,
            headers,
            signal: controller.signal,
        });

        const responseText = await response.text();
        const parsedJson = responseText ? JSON.parse(responseText) : null;

        if (!response.ok) {
            if (!options.suppressUnavailableLog) {
                logAiAgentUnavailable(
                    '[AI Agent] Request failed, falling back to local adaptive AI',
                    {
                        status: response.status,
                        endpoint,
                    },
                );
            }
            return null;
        }

        return parsedJson as T;
    } catch (error) {
        if (!options.suppressUnavailableLog) {
            logAiAgentUnavailable(
                '[AI Agent] Service unavailable, falling back to local adaptive AI',
                {
                    endpoint,
                    error: toErrorMessage(error),
                },
            );
        }
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export function getAiAgentConnectionConfig(): {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
} {
    return {
        enabled: AI_AGENT_ENABLED,
        baseUrl: AI_AGENT_BASE_URL,
        timeoutMs: AI_AGENT_TIMEOUT_MS,
    };
}

export interface AiAgentMoveDecision {
    move: MoveData;
    thinkMs: number;
    confidence: number;
}

export async function chooseMoveFromAiAgent(params: {
    sessionId: string;
    gameType: string;
    difficultyLevel: string;
    validMoves: MoveData[];
    humanAggressionRate?: number;
}): Promise<AiAgentMoveDecision | null> {
    const anonymizedSessionId = anonymizeIdentifier(params.sessionId);

    const response = await requestAiAgentJson<{ decision?: { move?: MoveData; thinkMs?: number; confidence?: number } }>(
        '/v1/bot/choose-move',
        {
            method: 'POST',
            body: JSON.stringify({
                sessionId: anonymizedSessionId,
                gameType: params.gameType,
                difficultyLevel: params.difficultyLevel,
                validMoves: params.validMoves,
                humanAggressionRate: clamp(toNumber(params.humanAggressionRate, 0), 0, 1),
            }),
        },
    );

    const decision = response?.decision;
    if (!decision || typeof decision !== 'object' || !decision.move || typeof decision.move !== 'object') {
        return null;
    }

    return {
        move: decision.move,
        thinkMs: Math.max(220, Math.floor(toNumber(decision.thinkMs, 700))),
        confidence: clamp(toNumber(decision.confidence, 0.5), 0, 1),
    };
}

export async function sendAiAgentLearningEvent(eventType: string, payload: Record<string, unknown>): Promise<boolean> {
    const sanitizedPayload = sanitizeLearningPayload(payload) as Record<string, unknown>;

    const response = await requestAiAgentJson<{ success?: boolean }>(
        '/v1/learning/event',
        {
            method: 'POST',
            body: JSON.stringify({
                type: eventType,
                payload: sanitizedPayload,
            }),
        },
        {
            timeoutMs: Math.min(1200, AI_AGENT_TIMEOUT_MS),
            suppressUnavailableLog: true,
        },
    );

    return Boolean(response?.success);
}

export interface AiAgentAdminReportResponse {
    generatedAt?: string;
    report?: Record<string, unknown>;
}

export async function getAiAgentAdminReport(): Promise<AiAgentAdminReportResponse | null> {
    return requestAiAgentJson<AiAgentAdminReportResponse>(
        '/v1/admin/report',
        { method: 'GET' },
        { timeoutMs: Math.min(1500, AI_AGENT_TIMEOUT_MS) },
    );
}

export interface AiAgentAdminChatResponse {
    generatedAt?: string;
    reply?: string;
    summary?: Record<string, unknown>;
}

export async function chatWithAiAgentAdmin(message: string): Promise<AiAgentAdminChatResponse | null> {
    return requestAiAgentJson<AiAgentAdminChatResponse>(
        '/v1/admin/chat',
        {
            method: 'POST',
            body: JSON.stringify({ message: sanitizeString(message) }),
        },
        { timeoutMs: Math.max(600, AI_AGENT_TIMEOUT_MS) },
    );
}

export async function getAiAgentHealth(): Promise<Record<string, unknown> | null> {
    return requestAiAgentJson<Record<string, unknown>>(
        '/health',
        { method: 'GET' },
        {
            timeoutMs: Math.min(900, AI_AGENT_TIMEOUT_MS),
            suppressUnavailableLog: true,
        },
    );
}

export interface AiAgentCapabilitiesResponse {
    generatedAt?: string;
    capabilities?: Record<string, unknown>;
}

export async function getAiAgentCapabilities(): Promise<AiAgentCapabilitiesResponse | null> {
    return requestAiAgentJson<AiAgentCapabilitiesResponse>(
        '/v1/admin/capabilities',
        { method: 'GET' },
        { timeoutMs: Math.min(1200, AI_AGENT_TIMEOUT_MS) },
    );
}

export interface AiAgentRuntimeResponse {
    generatedAt?: string;
    agentName?: string;
    runtime?: {
        enabled?: boolean;
        changedAt?: string;
        changedBy?: string;
        reason?: string;
    };
}

export async function getAiAgentRuntimeStatus(): Promise<AiAgentRuntimeResponse | null> {
    return requestAiAgentJson<AiAgentRuntimeResponse>(
        '/v1/admin/runtime',
        { method: 'GET' },
        { timeoutMs: Math.min(1200, AI_AGENT_TIMEOUT_MS) },
    );
}

export async function setAiAgentRuntimeStatus(params: {
    enabled?: boolean;
    action?: 'start' | 'stop';
    reason?: string;
    requestedBy?: string;
}): Promise<AiAgentRuntimeResponse | null> {
    const payload: Record<string, unknown> = {
        reason: sanitizeString(String(params.reason || '')),
        requestedBy: sanitizeString(String(params.requestedBy || 'admin')),
    };

    if (typeof params.enabled === 'boolean') {
        payload.enabled = params.enabled;
    } else if (params.action) {
        payload.action = params.action;
    }

    return requestAiAgentJson<AiAgentRuntimeResponse>(
        '/v1/admin/runtime',
        {
            method: 'POST',
            body: JSON.stringify(payload),
        },
        { timeoutMs: Math.max(1000, AI_AGENT_TIMEOUT_MS) },
    );
}

export interface AiAgentSelfTuneResponse {
    success?: boolean;
    tunedStrategies?: number;
    trigger?: string;
    generatedAt?: string;
    agentName?: string;
}

export async function runAiAgentSelfTune(trigger = 'admin'): Promise<AiAgentSelfTuneResponse | null> {
    return requestAiAgentJson<AiAgentSelfTuneResponse>(
        '/v1/admin/learn/self-tune',
        {
            method: 'POST',
            body: JSON.stringify({ trigger: sanitizeString(trigger) }),
        },
        { timeoutMs: Math.max(1000, AI_AGENT_TIMEOUT_MS) },
    );
}

export interface AiAgentDataSummaryResponse {
    generatedAt?: string;
    summary?: Record<string, unknown>;
    insights?: Record<string, unknown>;
    decisionAverages?: Record<string, unknown>;
}

export async function getAiAgentDataSummary(): Promise<AiAgentDataSummaryResponse | null> {
    return requestAiAgentJson<AiAgentDataSummaryResponse>(
        '/v1/admin/data/summary',
        { method: 'GET' },
        { timeoutMs: Math.min(1500, AI_AGENT_TIMEOUT_MS) },
    );
}

export interface AiAgentDataQueryResponse {
    generatedAt?: string;
    data?: Record<string, unknown>;
    query?: Record<string, unknown>;
}

export async function queryAiAgentData(query: Record<string, unknown>): Promise<AiAgentDataQueryResponse | null> {
    const sanitized = sanitizeLearningPayload(query) as Record<string, unknown>;

    return requestAiAgentJson<AiAgentDataQueryResponse>(
        '/v1/admin/data/query',
        {
            method: 'POST',
            body: JSON.stringify(sanitized),
        },
        { timeoutMs: Math.max(1000, AI_AGENT_TIMEOUT_MS) },
    );
}
