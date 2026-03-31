import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '@shared/schema';
import type { GameEngine, GameStatus, MoveData } from '../game-engines/types';
import { logger } from './logger';
import { aiMonitor } from './ai-monitor';
import { chooseMoveFromAiAgent, sendAiAgentLearningEvent } from './ai-agent-client';

export type AdaptiveDifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface AdaptiveDifficultyAssessment {
    level: AdaptiveDifficultyLevel;
    score: number;
    confidence: number;
    reasons: string[];
}

export interface AdaptiveAISessionConfig {
    sessionId: string;
    gameType: string;
    enabled: boolean;
    humanPlayerIds: string[];
    botPlayerIds: string[];
    difficultyLevel: AdaptiveDifficultyLevel;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

interface AdaptiveAIGameModelBucket {
    gameType: string;
    difficulty: AdaptiveDifficultyLevel;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    explorationBias: number;
    riskBias: number;
    humanDelayFactor: number;
    moveTypeWeights: Record<string, number>;
    updatedAt: string;
}

interface AdaptiveAIModel {
    version: number;
    updatedAt: string;
    buckets: Record<string, AdaptiveAIGameModelBucket>;
}

interface PlayerGameBehaviorProfile {
    totalMoves: number;
    moveTypes: Record<string, number>;
    aggressionIndex: number;
    defensiveIndex: number;
    averageThinkMs: number;
    lastMoveAt?: string;
    // Outcomes vs bot — tracked per user/game for anti-boredom adaptation
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDraw: number;
    abandonedGames: number;
    recentOutcomes: Array<'win' | 'loss' | 'draw' | 'abandon'>;
    estimatedDifficulty: AdaptiveDifficultyLevel;
    engagementScore: number; // 0-100; drops on abandons/streak losses
    totalMovesPerGame: number; // running average; low = frustration signal
}

interface PlayerBehaviorProfile {
    userId: string;
    createdAt: string;
    updatedAt: string;
    games: Record<string, PlayerGameBehaviorProfile>;
}

export interface AdaptiveAIDecision {
    move: MoveData;
    thinkMs: number;
    confidence: number;
    consideredMoves: number;
}

export interface AdaptiveAIReport {
    reportId: string;
    generatedAt: string;
    filters: {
        userId?: string;
        gameType?: string;
    };
    summary: {
        totalProfiles: number;
        totalTrackedMoves: number;
        gamesCoverage: Record<string, number>;
        topMoveTypes: Array<{ moveType: string; count: number }>;
    };
    players: Array<{
        userId: string;
        gameType: string;
        totalMoves: number;
        aggressionIndex: number;
        defensiveIndex: number;
        averageThinkMs: number;
        favoriteMoveType: string;
    }>;
    modelSnapshot: {
        version: number;
        buckets: Array<{
            key: string;
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            explorationBias: number;
            riskBias: number;
        }>;
    };
}

export interface AdaptiveAiHealthSnapshot {
    generatedAt: string;
    modelUpdatedAt?: string;
    modelStale: boolean;
    dominantGames: Array<{
        gameType: string;
        difficulty: AdaptiveDifficultyLevel;
        gamesPlayed: number;
        aiWinRate: number;
    }>;
    highAbandonGames: Array<{
        gameType: string;
        gamesPlayed: number;
        abandonRate: number;
    }>;
}

const AI_ROOT_DIR = path.resolve(process.cwd(), 'logs', 'ai-learning');
const AI_PROFILES_DIR = path.join(AI_ROOT_DIR, 'profiles');
const AI_EVENTS_DIR = path.join(AI_ROOT_DIR, 'events');
const AI_REPORTS_DIR = path.join(AI_ROOT_DIR, 'reports');
const AI_MODEL_FILE = path.join(AI_ROOT_DIR, 'model.json');
const AI_SESSIONS_FILE = path.join(AI_ROOT_DIR, 'session-configs.json');

let cachedSessionConfigs: Record<string, AdaptiveAISessionConfig> | null = null;

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

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function nowIso(): string {
    return new Date().toISOString();
}

function bucketKey(gameType: string, difficulty: AdaptiveDifficultyLevel): string {
    return `${gameType}:${difficulty}`;
}

function defaultModelBucket(gameType: string, difficulty: AdaptiveDifficultyLevel): AdaptiveAIGameModelBucket {
    return {
        gameType,
        difficulty,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        explorationBias: 0.24,
        riskBias: 0.0,
        humanDelayFactor: 1.0,
        moveTypeWeights: {},
        updatedAt: nowIso(),
    };
}

function defaultModel(): AdaptiveAIModel {
    return {
        version: 1,
        updatedAt: nowIso(),
        buckets: {},
    };
}

function defaultGameProfile(): PlayerGameBehaviorProfile {
    return {
        totalMoves: 0,
        moveTypes: {},
        aggressionIndex: 0,
        defensiveIndex: 0,
        averageThinkMs: 0,
        lastMoveAt: undefined,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDraw: 0,
        abandonedGames: 0,
        recentOutcomes: [],
        estimatedDifficulty: 'easy',
        engagementScore: 50,
        totalMovesPerGame: 0,
    };
}

/**
 * Anti-boredom algorithm: compute optimal difficulty from per-user game history.
 *
 * Target: human wins ~45-55% of the time (engaged zone).
 * Signals that the bot is too hard (→ lower difficulty):
 *   - Recent win rate < 30%
 *   - High abandonment rate (> 30%)
 *   - Avg moves per game < 8 (user quits early)
 * Signals that the bot is too easy (→ raise difficulty):
 *   - Recent win rate > 68%
 */
function computeOptimalDifficultyFromProfile(
    gameProfile: PlayerGameBehaviorProfile,
    accountBasedLevel: AdaptiveDifficultyLevel,
): AdaptiveDifficultyLevel {
    const { recentOutcomes, gamesPlayed, abandonedGames, totalMovesPerGame } = gameProfile;

    // Not enough history — trust account-based assessment
    if (gamesPlayed < 3 || recentOutcomes.length < 3) {
        return accountBasedLevel;
    }

    const window = recentOutcomes.slice(-10);
    const wins = window.filter((o) => o === 'win').length;
    const total = window.filter((o) => o !== 'abandon').length;
    const winRate = total > 0 ? wins / total : 0.5;

    // Abandonment rate (overall)
    const abandonRate = gamesPlayed > 0 ? abandonedGames / gamesPlayed : 0;

    // Frustration signals → lower difficulty
    const frustrationSignal = winRate < 0.30 || abandonRate > 0.30 || (totalMovesPerGame > 0 && totalMovesPerGame < 8);

    // Too easy → raise difficulty
    const tooEasySignal = winRate > 0.68 && abandonRate < 0.15;

    const levels: AdaptiveDifficultyLevel[] = ['easy', 'medium', 'hard', 'expert'];
    const currentIdx = levels.indexOf(accountBasedLevel);

    if (frustrationSignal) {
        return levels[Math.max(0, currentIdx - 1)];
    }
    if (tooEasySignal) {
        return levels[Math.min(levels.length - 1, currentIdx + 1)];
    }

    // In target zone (30-68%) — keep current
    return accountBasedLevel;
}

/**
 * Recompute engagement score (0-100) from recent outcomes.
 * High engagement = playing often and in the 40-60% win rate zone.
 */
function recomputeEngagementScore(gameProfile: PlayerGameBehaviorProfile): number {
    const { recentOutcomes, abandonedGames, gamesPlayed } = gameProfile;
    if (recentOutcomes.length === 0) return 50;

    const window = recentOutcomes.slice(-10);
    const wins = window.filter((o) => o === 'win').length;
    const total = window.filter((o) => o !== 'abandon').length;
    const winRate = total > 0 ? wins / total : 0.5;
    const abandonRate = gamesPlayed > 0 ? abandonedGames / gamesPlayed : 0;

    // Distance from ideal 0.50 win rate (max engagement when near 50%)
    const winRateScore = 100 - Math.abs(winRate - 0.50) * 200;
    // Penalty for abandonment
    const abandonPenalty = abandonRate * 80;

    return Math.max(0, Math.min(100, winRateScore - abandonPenalty));
}

function defaultPlayerProfile(userId: string): PlayerBehaviorProfile {
    return {
        userId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        games: {},
    };
}

async function ensureAdaptiveAiDirs(): Promise<void> {
    await Promise.all([
        fs.mkdir(AI_ROOT_DIR, { recursive: true }),
        fs.mkdir(AI_PROFILES_DIR, { recursive: true }),
        fs.mkdir(AI_EVENTS_DIR, { recursive: true }),
        fs.mkdir(AI_REPORTS_DIR, { recursive: true }),
    ]);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch {
        return fallback;
    }
}

async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
    await ensureAdaptiveAiDirs();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
}

function eventLogFilePath(date: Date = new Date()): string {
    const day = date.toISOString().slice(0, 10);
    return path.join(AI_EVENTS_DIR, `${day}.jsonl`);
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
    await ensureAdaptiveAiDirs();
    const filePath = eventLogFilePath();
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf-8');
}

async function loadModel(): Promise<AdaptiveAIModel> {
    await ensureAdaptiveAiDirs();
    const model = await readJsonFile<AdaptiveAIModel>(AI_MODEL_FILE, defaultModel());
    if (!model.buckets) {
        model.buckets = {};
    }
    return model;
}

async function saveModel(model: AdaptiveAIModel): Promise<void> {
    model.updatedAt = nowIso();
    await writeJsonFileAtomic(AI_MODEL_FILE, model);
}

async function loadSessionConfigs(): Promise<Record<string, AdaptiveAISessionConfig>> {
    if (cachedSessionConfigs) {
        return cachedSessionConfigs;
    }
    await ensureAdaptiveAiDirs();
    cachedSessionConfigs = await readJsonFile<Record<string, AdaptiveAISessionConfig>>(AI_SESSIONS_FILE, {});
    return cachedSessionConfigs;
}

async function saveSessionConfigs(configs: Record<string, AdaptiveAISessionConfig>): Promise<void> {
    cachedSessionConfigs = configs;
    await writeJsonFileAtomic(AI_SESSIONS_FILE, configs);
}

function profilePath(userId: string): string {
    return path.join(AI_PROFILES_DIR, `${userId}.json`);
}

async function loadProfile(userId: string): Promise<PlayerBehaviorProfile> {
    await ensureAdaptiveAiDirs();
    return readJsonFile<PlayerBehaviorProfile>(profilePath(userId), defaultPlayerProfile(userId));
}

async function saveProfile(profile: PlayerBehaviorProfile): Promise<void> {
    profile.updatedAt = nowIso();
    await writeJsonFileAtomic(profilePath(profile.userId), profile);
}

function normalizeDifficulty(value: string | undefined): AdaptiveDifficultyLevel | 'auto' {
    const normalized = String(value || 'auto').toLowerCase();
    if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard' || normalized === 'expert') {
        return normalized;
    }
    return 'auto';
}

function getGameStatFieldNames(gameType: string): { played: string; won: string } {
    const normalized = gameType.toLowerCase();
    if (normalized === 'chess') return { played: 'chessPlayed', won: 'chessWon' };
    if (normalized === 'backgammon') return { played: 'backgammonPlayed', won: 'backgammonWon' };
    if (normalized === 'domino') return { played: 'dominoPlayed', won: 'dominoWon' };
    if (normalized === 'tarneeb') return { played: 'tarneebPlayed', won: 'tarneebWon' };
    if (normalized === 'baloot') return { played: 'balootPlayed', won: 'balootWon' };
    return { played: 'gamesPlayed', won: 'gamesWon' };
}

export function inferAdaptiveDifficultyFromAccount(account: Record<string, unknown>, gameType: string): AdaptiveDifficultyAssessment {
    const fields = getGameStatFieldNames(gameType);

    const gamePlayed = toNumber(account[fields.played], 0);
    const gameWon = toNumber(account[fields.won], 0);
    const totalPlayed = toNumber(account.gamesPlayed, gamePlayed);
    const totalWon = toNumber(account.gamesWon, gameWon);
    const longestStreak = toNumber(account.longestWinStreak, 0);
    const vipLevel = toNumber(account.vipLevel, 0);

    const gameWinRate = gamePlayed > 0 ? (gameWon / gamePlayed) * 100 : (totalPlayed > 0 ? (totalWon / totalPlayed) * 100 : 50);
    const experienceScore = clamp(
        gamePlayed * 2.2 +
        totalPlayed * 0.25 +
        gameWinRate * 0.55 +
        longestStreak * 1.1 +
        vipLevel * 2.5,
        0,
        100,
    );

    let level: AdaptiveDifficultyLevel = 'easy';
    if (experienceScore >= 80) {
        level = 'expert';
    } else if (experienceScore >= 58) {
        level = 'hard';
    } else if (experienceScore >= 34) {
        level = 'medium';
    }

    const reasons: string[] = [
        `gamePlayed=${gamePlayed}`,
        `gameWinRate=${gameWinRate.toFixed(1)}%`,
        `longestStreak=${longestStreak}`,
        `vipLevel=${vipLevel}`,
    ];

    const confidence = clamp((gamePlayed + totalPlayed * 0.3) / 120, 0.2, 1);
    return { level, score: experienceScore, confidence, reasons };
}

export async function ensureAdaptiveBotUsers(
    gameType: string,
    count: number,
    difficulty: AdaptiveDifficultyLevel,
): Promise<Array<{ id: string; username: string }>> {
    const normalizedGame = gameType.toLowerCase();
    const safeCount = Math.max(0, Math.min(3, count));
    const result: Array<{ id: string; username: string }> = [];

    for (let i = 1; i <= safeCount; i++) {
        const username = `ai_${normalizedGame}_${difficulty}_${i}`;
        const [existing] = await db.select({ id: users.id, username: users.username })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

        if (existing) {
            result.push(existing);
            continue;
        }

        const password = `ai-bot-${crypto.randomBytes(18).toString('hex')}`;
        const [created] = await db.insert(users)
            .values({
                username,
                nickname: `AI ${normalizedGame.toUpperCase()} ${difficulty.toUpperCase()} ${i}`,
                accountId: `AI-${normalizedGame.toUpperCase()}-${difficulty.toUpperCase()}-${i}`,
                password,
                role: 'player',
                status: 'active',
                balance: '0.00',
            })
            .returning({ id: users.id, username: users.username });

        result.push(created);
    }

    return result;
}

export async function registerAdaptiveAiSession(config: Omit<AdaptiveAISessionConfig, 'createdAt' | 'updatedAt'>): Promise<AdaptiveAISessionConfig> {
    const all = await loadSessionConfigs();
    const timestamp = nowIso();
    const existing = all[config.sessionId];

    const merged: AdaptiveAISessionConfig = {
        ...config,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
    };

    all[config.sessionId] = merged;
    await saveSessionConfigs(all);

    await appendEvent({
        type: 'ai_session_registered',
        at: timestamp,
        sessionId: config.sessionId,
        gameType: config.gameType,
        humanPlayerIds: config.humanPlayerIds,
        botPlayerIds: config.botPlayerIds,
        difficultyLevel: config.difficultyLevel,
    });

    return merged;
}

export async function getAdaptiveAiSessionConfig(sessionId: string): Promise<AdaptiveAISessionConfig | undefined> {
    const all = await loadSessionConfigs();
    return all[sessionId];
}

export function isAdaptiveAiPlayer(config: AdaptiveAISessionConfig | undefined, playerId: string | null | undefined): boolean {
    if (!config || !playerId) return false;
    return config.enabled && config.botPlayerIds.includes(playerId);
}

export function resolveCurrentPlayerFromState(
    gameType: string,
    stateJson: string,
    fallback?: {
        player1Id?: string | null;
        player2Id?: string | null;
        player3Id?: string | null;
        player4Id?: string | null;
        playerOrder?: Array<string | null | undefined>;
    },
): string | null {
    const fallbackOrder = [
        fallback?.player1Id,
        fallback?.player2Id,
        fallback?.player3Id,
        fallback?.player4Id,
        ...(fallback?.playerOrder || []),
    ].filter((playerId): playerId is string => typeof playerId === 'string' && playerId.length > 0);

    const resolveIndexedPlayer = (index: unknown, order: unknown): string | null => {
        if (!Number.isInteger(index) || !Array.isArray(order) || order.length === 0) {
            return null;
        }

        const safeIndex = (index as number) % order.length;
        const normalizedIndex = safeIndex < 0 ? safeIndex + order.length : safeIndex;
        const candidate = order[normalizedIndex];
        return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    };

    try {
        const parsed = JSON.parse(stateJson) as Record<string, unknown>;

        if (typeof parsed.currentPlayer === 'string' && parsed.currentPlayer) {
            return parsed.currentPlayer;
        }

        const indexedCurrentPlayer = resolveIndexedPlayer(parsed.currentPlayerIndex, parsed.playerOrder);
        if (indexedCurrentPlayer) {
            return indexedCurrentPlayer;
        }

        if (typeof parsed.currentTurn === 'string' && parsed.currentTurn) {
            const currentTurn = parsed.currentTurn;
            if (gameType === 'chess') {
                const players = (parsed.players || {}) as Record<string, string>;
                if (currentTurn === 'white') return players.white || fallback?.player1Id || null;
                if (currentTurn === 'black') return players.black || fallback?.player2Id || null;
            }
            if (gameType === 'backgammon') {
                const players = (parsed.players || {}) as Record<string, string>;
                if (currentTurn === 'white') return players.white || fallback?.player1Id || null;
                if (currentTurn === 'black') return players.black || fallback?.player2Id || null;
            }

            if (currentTurn === 'player1') return fallback?.player1Id || null;
            if (currentTurn === 'player2') return fallback?.player2Id || null;
            if (currentTurn === 'player3') return fallback?.player3Id || null;
            if (currentTurn === 'player4') return fallback?.player4Id || null;

            return currentTurn;
        }

        const indexedTurnPlayer = resolveIndexedPlayer(parsed.currentTurnIndex, parsed.playerOrder);
        if (indexedTurnPlayer) {
            return indexedTurnPlayer;
        }

        return fallbackOrder[0] || null;
    } catch {
        return fallbackOrder[0] || null;
    }
}

function scoreMoveType(move: MoveData): number {
    switch (move.type) {
        case 'move':
        case 'play':
        case 'playCard':
            return 8;
        case 'bid':
        case 'choose':
        case 'setTrump':
            return 6;
        case 'roll':
        case 'draw':
            return 3;
        case 'double':
            return 5;
        case 'accept_double':
            return 4;
        case 'decline_double':
        case 'pass':
            return -6;
        default:
            return 1;
    }
}

function scoreEvents(botPlayerId: string, status: GameStatus, events: Array<{ type: string }>): number {
    let score = 0;

    for (const event of events) {
        if (event.type === 'capture') score += 5;
        if (event.type === 'check') score += 4;
        if (event.type === 'checkmate') score += 18;
        if (event.type === 'score') score += 8;
        if (event.type === 'game_over') score += 20;
    }

    if (status.isOver) {
        if (status.winner === botPlayerId) score += 120;
        else if (status.isDraw) score += 24;
        else score -= 120;
    }

    return score;
}

function topWindowByDifficulty(level: AdaptiveDifficultyLevel): number {
    if (level === 'easy') return 0.62;
    if (level === 'medium') return 0.38;
    if (level === 'hard') return 0.22;
    return 0.12;
}

function mistakeRateByDifficulty(level: AdaptiveDifficultyLevel): number {
    if (level === 'easy') return 0.32;
    if (level === 'medium') return 0.18;
    if (level === 'hard') return 0.09;
    return 0.04;
}

function thinkRangeByDifficulty(level: AdaptiveDifficultyLevel): { min: number; max: number } {
    if (level === 'easy') return { min: 900, max: 2300 };
    if (level === 'medium') return { min: 700, max: 1900 };
    if (level === 'hard') return { min: 520, max: 1450 };
    return { min: 360, max: 1080 };
}

function randomBetween(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

export async function chooseAdaptiveAIMove(params: {
    sessionId?: string;
    engine: GameEngine;
    gameType: string;
    stateJson: string;
    botPlayerId: string;
    difficultyLevel: AdaptiveDifficultyLevel;
    humanPlayerIds?: string[]; // optional: used to load human profile for counter-strategy
}): Promise<AdaptiveAIDecision | null> {
    const { sessionId, engine, gameType, stateJson, botPlayerId, difficultyLevel, humanPlayerIds } = params;
    const validMoves = engine.getValidMoves(stateJson, botPlayerId);

    if (!validMoves || validMoves.length === 0) {
        return null;
    }

    const model = await loadModel();
    const key = bucketKey(gameType, difficultyLevel);
    const bucket = model.buckets[key] || defaultModelBucket(gameType, difficultyLevel);

    // Load human player profile to counter their patterns (counter-strategy)
    let humanMoveWeights: Record<string, number> = {};
    if (humanPlayerIds && humanPlayerIds.length > 0) {
        try {
            for (const humanId of humanPlayerIds) {
                const profile = await loadProfile(humanId);
                const gameProfile = profile.games[gameType.toLowerCase()];
                if (gameProfile && gameProfile.totalMoves > 5) {
                    // Blend human move type weights to inform bot counter-play
                    for (const [moveType, count] of Object.entries(gameProfile.moveTypes)) {
                        humanMoveWeights[moveType] = (humanMoveWeights[moveType] || 0) + count;
                    }
                }
            }
        } catch (error) {
            aiMonitor.recordError('profile_error', {
                message: `Failed to load human profile weights: ${toErrorMessage(error)}`,
                gameType,
                severity: 'warning',
            });
        }
    }

    const totalHumanMoves = Object.values(humanMoveWeights).reduce((a, b) => a + b, 0);
    const humanAggressionWeight = (humanMoveWeights['move'] || 0) + (humanMoveWeights['play'] || 0) + (humanMoveWeights['playCard'] || 0);
    const humanAggressionRate = totalHumanMoves > 0 ? humanAggressionWeight / totalHumanMoves : 0;

    const externalDecision = await chooseMoveFromAiAgent({
        sessionId: sessionId || `fallback-${gameType}-${Date.now()}`,
        gameType,
        difficultyLevel,
        validMoves,
        humanAggressionRate,
    });

    if (externalDecision) {
        const validation = engine.validateMove(stateJson, botPlayerId, externalDecision.move);
        if (validation.valid) {
            return {
                move: externalDecision.move,
                thinkMs: clamp(Math.floor(toNumber(externalDecision.thinkMs, 700)), 220, 6000),
                confidence: clamp(toNumber(externalDecision.confidence, 0.5), 0, 1),
                consideredMoves: validMoves.length,
            };
        }

        aiMonitor.recordError('move_failure', {
            message: validation.error || 'AI service returned invalid move',
            sessionId,
            gameType,
            severity: 'warning',
        });
    }

    const scoredMoves = validMoves.map((move) => {
        const base = scoreMoveType(move);
        const weightBoost = bucket.moveTypeWeights[move.type] || 0;

        // Counter-strategy: if human plays many aggressive moves, bot scores defensive counters higher
        const counterBoost = humanAggressionRate > 0.6 && classifyMoveAsDefensive(move) ? 2.5 : 0;

        const simulated = engine.applyMove(stateJson, botPlayerId, move);
        let simulationScore = -999;

        if (simulated.success) {
            const status = engine.getGameStatus(simulated.newState);
            simulationScore = scoreEvents(botPlayerId, status, simulated.events as Array<{ type: string }>);
        }

        const jitter = randomBetween(-6, 6) * 0.25;
        const total = base + weightBoost + simulationScore + jitter + bucket.riskBias + counterBoost;

        return {
            move,
            score: total,
        };
    });

    scoredMoves.sort((a, b) => b.score - a.score);

    const topWindow = Math.max(1, Math.ceil(scoredMoves.length * topWindowByDifficulty(difficultyLevel)));
    const explorationBias = clamp(bucket.explorationBias, 0.05, 0.75);

    let pickIndex = 0;
    if (Math.random() < explorationBias) {
        pickIndex = randomBetween(0, Math.max(0, scoredMoves.length - 1));
    } else {
        pickIndex = randomBetween(0, topWindow - 1);
    }

    const mistakeRate = mistakeRateByDifficulty(difficultyLevel);
    if (Math.random() < mistakeRate && scoredMoves.length > 2) {
        pickIndex = clamp(pickIndex + randomBetween(1, Math.floor(scoredMoves.length / 2)), 0, scoredMoves.length - 1);
    }

    const selected = scoredMoves[pickIndex] || scoredMoves[0];
    const range = thinkRangeByDifficulty(difficultyLevel);
    const complexity = clamp(validMoves.length / 12, 0.6, 1.8);
    const rawThink = randomBetween(range.min, range.max);
    const thinkMs = Math.floor(rawThink * complexity * clamp(bucket.humanDelayFactor, 0.75, 1.45));

    return {
        move: selected.move,
        thinkMs,
        confidence: clamp(1 - pickIndex / Math.max(1, scoredMoves.length), 0, 1),
        consideredMoves: validMoves.length,
    };
}

function classifyMoveAsAggressive(move: MoveData): boolean {
    return ['move', 'play', 'playCard', 'double', 'bid', 'choose'].includes(move.type);
}

function classifyMoveAsDefensive(move: MoveData): boolean {
    return ['pass', 'draw', 'decline_double', 'respond_draw', 'offer_draw'].includes(move.type);
}

export async function recordAdaptiveHumanMove(params: {
    sessionId: string;
    userId: string;
    gameType: string;
    move: MoveData;
    turnNumber: number;
}): Promise<void> {
    try {
        const profile = await loadProfile(params.userId);
        const gameKey = params.gameType.toLowerCase();
        const gameProfile = profile.games[gameKey] || defaultGameProfile();

        const now = new Date();
        if (gameProfile.lastMoveAt) {
            const delta = Math.max(0, now.getTime() - new Date(gameProfile.lastMoveAt).getTime());
            if (gameProfile.totalMoves <= 0) {
                gameProfile.averageThinkMs = delta;
            } else {
                gameProfile.averageThinkMs = Math.round((gameProfile.averageThinkMs * gameProfile.totalMoves + delta) / (gameProfile.totalMoves + 1));
            }
        }

        gameProfile.totalMoves += 1;
        gameProfile.moveTypes[params.move.type] = (gameProfile.moveTypes[params.move.type] || 0) + 1;

        if (classifyMoveAsAggressive(params.move)) {
            gameProfile.aggressionIndex += 1;
        }
        if (classifyMoveAsDefensive(params.move)) {
            gameProfile.defensiveIndex += 1;
        }

        gameProfile.lastMoveAt = now.toISOString();
        profile.games[gameKey] = gameProfile;

        await saveProfile(profile);
        await appendEvent({
            type: 'human_move',
            at: now.toISOString(),
            sessionId: params.sessionId,
            userId: params.userId,
            gameType: gameKey,
            moveType: params.move.type,
            turnNumber: params.turnNumber,
        });

        void sendAiAgentLearningEvent('human_move', {
            sessionId: params.sessionId,
            userId: params.userId,
            gameType: gameKey,
            moveType: params.move.type,
            turnNumber: params.turnNumber,
        });
    } catch (error) {
        logger.error('[AdaptiveAI] Failed to record human move', error as Error);
        aiMonitor.recordError('profile_error', {
            message: `recordAdaptiveHumanMove failed: ${toErrorMessage(error)}`,
            sessionId: params.sessionId,
            gameType: params.gameType,
            severity: 'warning',
        });
    }
}

export async function recordAdaptiveAiMove(params: {
    sessionId: string;
    botPlayerId: string;
    gameType: string;
    difficultyLevel: AdaptiveDifficultyLevel;
    move: MoveData;
    turnNumber: number;
    confidence: number;
    consideredMoves?: number;
}): Promise<void> {
    try {
        const model = await loadModel();
        const key = bucketKey(params.gameType, params.difficultyLevel);
        const bucket = model.buckets[key] || defaultModelBucket(params.gameType, params.difficultyLevel);

        bucket.moveTypeWeights[params.move.type] = (bucket.moveTypeWeights[params.move.type] || 0) * 0.98 + params.confidence * 0.02;
        bucket.updatedAt = nowIso();

        model.buckets[key] = bucket;
        await saveModel(model);

        await appendEvent({
            type: 'ai_move',
            at: nowIso(),
            sessionId: params.sessionId,
            botPlayerId: params.botPlayerId,
            gameType: params.gameType,
            difficultyLevel: params.difficultyLevel,
            moveType: params.move.type,
            turnNumber: params.turnNumber,
            confidence: params.confidence,
            consideredMoves: params.consideredMoves,
        });

        void sendAiAgentLearningEvent('ai_move', {
            sessionId: params.sessionId,
            botPlayerId: params.botPlayerId,
            gameType: params.gameType,
            difficultyLevel: params.difficultyLevel,
            moveType: params.move.type,
            turnNumber: params.turnNumber,
            confidence: params.confidence,
            consideredMoves: params.consideredMoves,
        });
    } catch (error) {
        logger.error('[AdaptiveAI] Failed to record AI move', error as Error);
        aiMonitor.recordError('engine_error', {
            message: `recordAdaptiveAiMove failed: ${toErrorMessage(error)}`,
            sessionId: params.sessionId,
            gameType: params.gameType,
            severity: 'warning',
        });
    }
}

export async function recordAdaptiveGameResult(params: {
    sessionId: string;
    gameType: string;
    status: GameStatus;
    stateJson: string;
}): Promise<void> {
    try {
        const config = await getAdaptiveAiSessionConfig(params.sessionId);
        if (!config || !config.enabled) {
            return;
        }

        let aiWon = false;
        let aiDraw = Boolean(params.status.isDraw);

        if (!aiDraw && params.status.winner) {
            aiWon = config.botPlayerIds.includes(params.status.winner);
        }

        if (!aiDraw && params.status.winningTeam !== undefined) {
            try {
                const parsed = JSON.parse(params.stateJson) as { teams?: { team0: string[]; team1: string[] } };
                const teamPlayers = params.status.winningTeam === 0 ? parsed.teams?.team0 : parsed.teams?.team1;
                if (Array.isArray(teamPlayers)) {
                    aiWon = teamPlayers.some((playerId) => config.botPlayerIds.includes(playerId));
                }
            } catch {
                // Ignore parse failures and keep previous aiWon value
            }
        }

        // ── Update global model bucket ────────────────────────────────────────
        const model = await loadModel();
        const key = bucketKey(params.gameType, config.difficultyLevel);
        const bucket = model.buckets[key] || defaultModelBucket(params.gameType, config.difficultyLevel);

        bucket.gamesPlayed += 1;
        if (aiDraw) {
            bucket.draws += 1;
            bucket.humanDelayFactor = clamp(bucket.humanDelayFactor + 0.01, 0.75, 1.45);
        } else if (aiWon) {
            bucket.wins += 1;
            bucket.explorationBias = clamp(bucket.explorationBias - 0.015, 0.05, 0.75);
            bucket.riskBias = clamp(bucket.riskBias + 0.02, -0.5, 0.9);
        } else {
            bucket.losses += 1;
            bucket.explorationBias = clamp(bucket.explorationBias + 0.025, 0.05, 0.75);
            bucket.riskBias = clamp(bucket.riskBias - 0.02, -0.5, 0.9);
            bucket.humanDelayFactor = clamp(bucket.humanDelayFactor + 0.015, 0.75, 1.45);
        }

        bucket.updatedAt = nowIso();
        model.buckets[key] = bucket;
        await saveModel(model);

        // ── Update per-human-player profiles ─────────────────────────────────
        for (const humanId of config.humanPlayerIds) {
            try {
                const profile = await loadProfile(humanId);
                const gameKey = params.gameType.toLowerCase();
                const gameProfile = profile.games[gameKey] || defaultGameProfile();

                // Determine this human's outcome
                let humanOutcome: 'win' | 'loss' | 'draw';
                if (aiDraw) {
                    humanOutcome = 'draw';
                } else if (aiWon) {
                    humanOutcome = 'loss';
                } else {
                    humanOutcome = 'win';
                }

                gameProfile.gamesPlayed += 1;
                if (humanOutcome === 'win') gameProfile.gamesWon += 1;
                else if (humanOutcome === 'loss') gameProfile.gamesLost += 1;
                else gameProfile.gamesDraw += 1;

                // Keep sliding window of last 10 outcomes
                gameProfile.recentOutcomes.push(humanOutcome);
                if (gameProfile.recentOutcomes.length > 10) {
                    gameProfile.recentOutcomes.shift();
                }

                // Recompute engagement score and optimal difficulty for next session
                gameProfile.engagementScore = recomputeEngagementScore(gameProfile);
                const accountAssessment = inferAdaptiveDifficultyFromAccount(
                    { gamesPlayed: 0, gamesWon: 0, longestWinStreak: 0, vipLevel: 0 },
                    params.gameType,
                );
                gameProfile.estimatedDifficulty = computeOptimalDifficultyFromProfile(
                    gameProfile,
                    gameProfile.estimatedDifficulty || accountAssessment.level,
                );

                profile.games[gameKey] = gameProfile;
                await saveProfile(profile);
            } catch (profileError) {
                logger.error('[AdaptiveAI] Failed to update human profile for game result', profileError as Error);
                aiMonitor.recordError('profile_error', {
                    message: `Failed to update profile for game result: ${toErrorMessage(profileError)}`,
                    sessionId: params.sessionId,
                    gameType: params.gameType,
                    severity: 'warning',
                });
            }
        }

        await appendEvent({
            type: 'ai_game_result',
            at: nowIso(),
            sessionId: params.sessionId,
            gameType: params.gameType,
            difficultyLevel: config.difficultyLevel,
            aiWon,
            draw: aiDraw,
            winner: params.status.winner,
            winningTeam: params.status.winningTeam,
            reason: params.status.reason,
        });

        void sendAiAgentLearningEvent('game_result', {
            sessionId: params.sessionId,
            gameType: params.gameType,
            difficultyLevel: config.difficultyLevel,
            aiWon,
            draw: aiDraw,
            winner: params.status.winner,
            winningTeam: params.status.winningTeam,
            reason: params.status.reason,
            humanPlayerIds: config.humanPlayerIds,
        });
    } catch (error) {
        logger.error('[AdaptiveAI] Failed to record game result', error as Error);
        aiMonitor.recordError('session_error', {
            message: `recordAdaptiveGameResult failed: ${toErrorMessage(error)}`,
            sessionId: params.sessionId,
            gameType: params.gameType,
            severity: 'critical',
        });
    }
}

/**
 * Record an abandoned/forfeited game for a human player.
 * Called when a session ends due to disconnect timeout or explicit forfeit.
 * Abandonment is a frustration signal — the bot may need to lower difficulty.
 */
export async function recordAbandonedGame(params: {
    sessionId: string;
    gameType: string;
    humanPlayerIds: string[];
}): Promise<void> {
    try {
        const gameKey = params.gameType.toLowerCase();
        for (const humanId of params.humanPlayerIds) {
            const profile = await loadProfile(humanId);
            const gameProfile = profile.games[gameKey] || defaultGameProfile();

            gameProfile.gamesPlayed += 1;
            gameProfile.abandonedGames += 1;
            gameProfile.recentOutcomes.push('abandon');
            if (gameProfile.recentOutcomes.length > 10) {
                gameProfile.recentOutcomes.shift();
            }

            // Engagement drops on abandon — lower difficulty for next session
            gameProfile.engagementScore = recomputeEngagementScore(gameProfile);
            gameProfile.estimatedDifficulty = computeOptimalDifficultyFromProfile(
                gameProfile,
                gameProfile.estimatedDifficulty || 'easy',
            );

            profile.games[gameKey] = gameProfile;
            await saveProfile(profile);
        }

        await appendEvent({
            type: 'ai_game_abandoned',
            at: nowIso(),
            sessionId: params.sessionId,
            gameType: gameKey,
            humanPlayerIds: params.humanPlayerIds,
        });

        void sendAiAgentLearningEvent('game_abandoned', {
            sessionId: params.sessionId,
            gameType: gameKey,
            humanPlayerIds: params.humanPlayerIds,
        });
    } catch (error) {
        logger.error('[AdaptiveAI] Failed to record abandoned game', error as Error);
        aiMonitor.recordError('profile_error', {
            message: `recordAbandonedGame failed: ${toErrorMessage(error)}`,
            sessionId: params.sessionId,
            gameType: params.gameType,
            severity: 'warning',
        });
    }
}

export async function generateAdaptiveAiReport(options: {
    userId?: string;
    gameType?: string;
}): Promise<AdaptiveAIReport> {
    await ensureAdaptiveAiDirs();

    const allFiles = await fs.readdir(AI_PROFILES_DIR);
    const profileFiles = allFiles.filter((f) => f.endsWith('.json'));

    const gameTypeFilter = options.gameType?.toLowerCase();

    const profiles: PlayerBehaviorProfile[] = [];
    for (const fileName of profileFiles) {
        const userId = fileName.replace(/\.json$/i, '');
        if (options.userId && userId !== options.userId) {
            continue;
        }
        const profile = await readJsonFile<PlayerBehaviorProfile>(path.join(AI_PROFILES_DIR, fileName), defaultPlayerProfile(userId));
        profiles.push(profile);
    }

    const moveTypeCounter = new Map<string, number>();
    const gamesCoverage: Record<string, number> = {};
    const players: AdaptiveAIReport['players'] = [];
    let totalTrackedMoves = 0;

    for (const profile of profiles) {
        for (const [gameType, gameData] of Object.entries(profile.games)) {
            if (gameTypeFilter && gameType !== gameTypeFilter) {
                continue;
            }

            totalTrackedMoves += gameData.totalMoves;
            gamesCoverage[gameType] = (gamesCoverage[gameType] || 0) + gameData.totalMoves;

            for (const [moveType, count] of Object.entries(gameData.moveTypes)) {
                moveTypeCounter.set(moveType, (moveTypeCounter.get(moveType) || 0) + count);
            }

            const favoriteMoveType = Object.entries(gameData.moveTypes)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/a';

            players.push({
                userId: profile.userId,
                gameType,
                totalMoves: gameData.totalMoves,
                aggressionIndex: gameData.aggressionIndex,
                defensiveIndex: gameData.defensiveIndex,
                averageThinkMs: gameData.averageThinkMs,
                favoriteMoveType,
            });
        }
    }

    const topMoveTypes = Array.from(moveTypeCounter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([moveType, count]) => ({ moveType, count }));

    const model = await loadModel();

    const report: AdaptiveAIReport = {
        reportId: `ai-report-${Date.now()}`,
        generatedAt: nowIso(),
        filters: {
            userId: options.userId,
            gameType: gameTypeFilter,
        },
        summary: {
            totalProfiles: profiles.length,
            totalTrackedMoves,
            gamesCoverage,
            topMoveTypes,
        },
        players,
        modelSnapshot: {
            version: model.version,
            buckets: Object.entries(model.buckets).map(([key, bucket]) => ({
                key,
                gamesPlayed: bucket.gamesPlayed,
                wins: bucket.wins,
                losses: bucket.losses,
                draws: bucket.draws,
                explorationBias: bucket.explorationBias,
                riskBias: bucket.riskBias,
            })),
        },
    };

    const reportPath = path.join(AI_REPORTS_DIR, `${report.reportId}.json`);
    await writeJsonFileAtomic(reportPath, report);

    return report;
}

function escapeCsvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export function toAdaptiveAiReportCsv(report: AdaptiveAIReport): string {
    const header = [
        'userId',
        'gameType',
        'totalMoves',
        'aggressionIndex',
        'defensiveIndex',
        'averageThinkMs',
        'favoriteMoveType',
    ];

    const rows = report.players.map((player) => [
        player.userId,
        player.gameType,
        String(player.totalMoves),
        String(player.aggressionIndex),
        String(player.defensiveIndex),
        String(player.averageThinkMs),
        player.favoriteMoveType,
    ]);

    return [
        header.join(','),
        ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
    ].join('\n');
}

export async function getAdaptiveAiHealthSnapshot(): Promise<AdaptiveAiHealthSnapshot> {
    const generatedAt = nowIso();

    try {
        await ensureAdaptiveAiDirs();
        const model = await loadModel();

        const modelUpdatedAt = model.updatedAt;
        const parsedUpdatedAt = Date.parse(modelUpdatedAt || '');
        const modelStale = !Number.isFinite(parsedUpdatedAt) || (Date.now() - parsedUpdatedAt > 24 * 60 * 60 * 1000);

        const dominantGames: AdaptiveAiHealthSnapshot['dominantGames'] = [];
        for (const bucket of Object.values(model.buckets)) {
            const decisiveGames = bucket.wins + bucket.losses;
            if (bucket.gamesPlayed < 20 || decisiveGames < 10) {
                continue;
            }

            const aiWinRate = decisiveGames > 0 ? bucket.wins / decisiveGames : 0;
            if (aiWinRate >= 0.80) {
                dominantGames.push({
                    gameType: bucket.gameType,
                    difficulty: bucket.difficulty,
                    gamesPlayed: bucket.gamesPlayed,
                    aiWinRate,
                });
            }
        }

        const profileFiles = (await fs.readdir(AI_PROFILES_DIR)).filter((f) => f.endsWith('.json'));
        const abandonByGame = new Map<string, { gamesPlayed: number; abandonedGames: number }>();

        for (const fileName of profileFiles) {
            const userId = fileName.replace(/\.json$/i, '');
            const profile = await readJsonFile<PlayerBehaviorProfile>(path.join(AI_PROFILES_DIR, fileName), defaultPlayerProfile(userId));

            for (const [gameType, gameData] of Object.entries(profile.games)) {
                const current = abandonByGame.get(gameType) || { gamesPlayed: 0, abandonedGames: 0 };
                current.gamesPlayed += toNumber(gameData.gamesPlayed, 0);
                current.abandonedGames += toNumber(gameData.abandonedGames, 0);
                abandonByGame.set(gameType, current);
            }
        }

        const highAbandonGames = Array.from(abandonByGame.entries())
            .map(([gameType, totals]) => {
                const abandonRate = totals.gamesPlayed > 0 ? totals.abandonedGames / totals.gamesPlayed : 0;
                return {
                    gameType,
                    gamesPlayed: totals.gamesPlayed,
                    abandonRate,
                };
            })
            .filter((item) => item.gamesPlayed >= 15 && item.abandonRate >= 0.35)
            .sort((a, b) => b.abandonRate - a.abandonRate);

        return {
            generatedAt,
            modelUpdatedAt,
            modelStale,
            dominantGames,
            highAbandonGames,
        };
    } catch (error) {
        aiMonitor.recordError('session_error', {
            message: `getAdaptiveAiHealthSnapshot failed: ${toErrorMessage(error)}`,
            severity: 'warning',
        });

        return {
            generatedAt,
            modelUpdatedAt: undefined,
            modelStale: false,
            dominantGames: [],
            highAbandonGames: [],
        };
    }
}

export async function runAdaptiveAiHealthCheck(): Promise<AdaptiveAiHealthSnapshot> {
    const snapshot = await getAdaptiveAiHealthSnapshot();

    if (snapshot.modelStale) {
        aiMonitor.recordAnomaly({ anomalyType: 'stale_model' });
    }

    for (const item of snapshot.dominantGames) {
        aiMonitor.recordAnomaly({
            anomalyType: 'bot_dominant',
            gameType: item.gameType,
            value: item.aiWinRate * 100,
        });
    }

    for (const item of snapshot.highAbandonGames) {
        aiMonitor.recordAnomaly({
            anomalyType: 'mass_abandon',
            gameType: item.gameType,
            value: item.abandonRate * 100,
        });
    }

    return snapshot;
}

export async function resolveAdaptiveDifficultyForUser(params: {
    requestedDifficulty?: string;
    userId: string;
    gameType: string;
}): Promise<AdaptiveDifficultyAssessment> {
    const normalized = normalizeDifficulty(params.requestedDifficulty);

    if (normalized !== 'auto') {
        return {
            level: normalized,
            score: 0,
            confidence: 1,
            reasons: ['requested-explicitly'],
        };
    }

    const [userRow] = await db.select({
        id: users.id,
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        longestWinStreak: users.longestWinStreak,
        vipLevel: users.vipLevel,
        chessPlayed: users.chessPlayed,
        chessWon: users.chessWon,
        backgammonPlayed: users.backgammonPlayed,
        backgammonWon: users.backgammonWon,
        dominoPlayed: users.dominoPlayed,
        dominoWon: users.dominoWon,
        tarneebPlayed: users.tarneebPlayed,
        tarneebWon: users.tarneebWon,
        balootPlayed: users.balootPlayed,
        balootWon: users.balootWon,
    }).from(users).where(eq(users.id, params.userId)).limit(1);

    if (!userRow) {
        return {
            level: 'medium',
            score: 45,
            confidence: 0.25,
            reasons: ['fallback-user-not-found'],
        };
    }

    // Step 1: Account-based inference (baseline)
    const accountAssessment = inferAdaptiveDifficultyFromAccount(
        userRow as unknown as Record<string, unknown>,
        params.gameType,
    );

    // Step 2: Load the user's behavioral profile to refine with actual bot history
    const profile = await loadProfile(params.userId);
    const gameKey = params.gameType.toLowerCase();
    const gameProfile = profile.games[gameKey];

    // If no profile history yet, use account-based assessment as-is
    if (!gameProfile || gameProfile.gamesPlayed < 1) {
        return accountAssessment;
    }

    // Step 3: Apply anti-boredom algorithm using real game history
    const profileLevel = computeOptimalDifficultyFromProfile(gameProfile, accountAssessment.level);

    const reasons = [
        ...accountAssessment.reasons,
        `botGamesPlayed=${gameProfile.gamesPlayed}`,
        `botWinRate=${gameProfile.gamesPlayed > 0 ? ((gameProfile.gamesWon / gameProfile.gamesPlayed) * 100).toFixed(1) : 'n/a'}%`,
        `recentOutcomes=${gameProfile.recentOutcomes.slice(-5).join(',')}`,
        `engagementScore=${gameProfile.engagementScore.toFixed(0)}`,
    ];

    // Profile-based confidence increases with more games
    const profileConfidence = clamp(gameProfile.gamesPlayed / 10, 0.3, 1.0);

    return {
        level: profileLevel,
        score: accountAssessment.score,
        confidence: Math.max(accountAssessment.confidence, profileConfidence),
        reasons,
    };
}
