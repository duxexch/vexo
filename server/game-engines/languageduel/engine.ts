import type { ApplyMoveResult, GameEngine, GameEvent, GameStatus, MoveData, PlayerView, ValidationResult } from "../types";

type LanguageDuelMode = "typed" | "spoken" | "mixed";

interface LanguageDuelPrompt {
    id: string;
    word: string;
    accepted: string[];
}

interface LanguageDuelSubmission {
    answerText: string;
    normalizedAnswer: string;
    accuracy: number;
    responseMs: number;
    timedOut: boolean;
    submittedAt: number;
}

interface LanguageDuelLastRound {
    winnerId?: string;
    isDraw: boolean;
    promptWord: string;
    submissions: Record<string, LanguageDuelSubmission>;
}

interface LanguageDuelState {
    gameType: "languageduel";
    players: {
        player1: string;
        player2: string;
    };
    config: {
        nativeLanguageCode: string;
        targetLanguageCode: string;
        mode: LanguageDuelMode;
        pointsToWin: number;
        turnSeconds: number;
    };
    prompts: LanguageDuelPrompt[];
    promptCursor: number;
    currentPrompt: LanguageDuelPrompt;
    roundNumber: number;
    currentTurn: string;
    roundSubmissions: Record<string, LanguageDuelSubmission>;
    scores: Record<string, number>;
    gameOver: boolean;
    winner?: string;
    reason?: string;
    lastRound?: LanguageDuelLastRound;
    lastMoveAt: number;
}

const DEFAULT_PROMPTS: LanguageDuelPrompt[] = [
    { id: "hello", word: "hello", accepted: ["hello"] },
    { id: "world", word: "world", accepted: ["world"] },
    { id: "friend", word: "friend", accepted: ["friend"] },
    { id: "language", word: "language", accepted: ["language"] },
    { id: "challenge", word: "challenge", accepted: ["challenge"] },
    { id: "practice", word: "practice", accepted: ["practice"] },
    { id: "future", word: "future", accepted: ["future"] },
    { id: "success", word: "success", accepted: ["success"] },
    { id: "victory", word: "victory", accepted: ["victory"] },
    { id: "learning", word: "learning", accepted: ["learning"] },
];

const PROMPTS_BY_LANGUAGE: Record<string, LanguageDuelPrompt[]> = {
    en: DEFAULT_PROMPTS,
    ar: [
        { id: "marhaba", word: "مرحبا", accepted: ["مرحبا", "marhaba"] },
        { id: "sadiq", word: "صديق", accepted: ["صديق", "sadiq"] },
        { id: "lugha", word: "لغة", accepted: ["لغة", "lugha"] },
        { id: "tahadde", word: "تحدي", accepted: ["تحدي", "ta7adi", "tahaddi"] },
        { id: "najah", word: "نجاح", accepted: ["نجاح", "najah"] },
        { id: "mustaqbal", word: "مستقبل", accepted: ["مستقبل", "mustaqbal"] },
    ],
    fr: [
        { id: "bonjour", word: "bonjour", accepted: ["bonjour"] },
        { id: "ami", word: "ami", accepted: ["ami"] },
        { id: "langue", word: "langue", accepted: ["langue"] },
        { id: "defi", word: "defi", accepted: ["defi", "défi"] },
        { id: "succes", word: "succes", accepted: ["succes", "succes", "succès"] },
        { id: "avenir", word: "avenir", accepted: ["avenir"] },
    ],
    es: [
        { id: "hola", word: "hola", accepted: ["hola"] },
        { id: "amigo", word: "amigo", accepted: ["amigo"] },
        { id: "idioma", word: "idioma", accepted: ["idioma"] },
        { id: "reto", word: "reto", accepted: ["reto"] },
        { id: "exito", word: "exito", accepted: ["exito", "éxito"] },
        { id: "futuro", word: "futuro", accepted: ["futuro"] },
    ],
};

function normalizeLanguageCode(value: unknown, fallback = "en"): string {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) {
        return fallback;
    }
    return raw;
}

function normalizeMode(value: unknown): LanguageDuelMode {
    if (value === "typed" || value === "spoken" || value === "mixed") {
        return value;
    }
    return "mixed";
}

function normalizePointsToWin(value: unknown): number {
    const points = Number(value);
    if (!Number.isFinite(points)) {
        return 10;
    }
    return Math.max(3, Math.min(30, Math.round(points)));
}

function normalizeResponseMs(value: unknown): number {
    const ms = Number(value);
    if (!Number.isFinite(ms)) {
        return 30_000;
    }
    return Math.max(0, Math.min(30_000, Math.round(ms)));
}

function normalizeText(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
        .trim()
        .toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) {
        matrix[i][0] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    return matrix[a.length][b.length];
}

function scoreAccuracy(answer: string, accepted: string[]): number {
    if (!answer) {
        return 0;
    }

    const normalizedAccepted = accepted.map((candidate) => normalizeText(candidate)).filter(Boolean);
    if (normalizedAccepted.includes(answer)) {
        return 100;
    }

    let best = 0;
    for (const candidate of normalizedAccepted) {
        const maxLength = Math.max(candidate.length, answer.length);
        if (maxLength === 0) {
            continue;
        }

        const distance = levenshteinDistance(answer, candidate);
        const similarity = Math.max(0, 1 - distance / maxLength);
        best = Math.max(best, Math.round(similarity * 100));
    }

    return best;
}

function buildPromptSet(targetLanguageCode: string): LanguageDuelPrompt[] {
    const shortCode = targetLanguageCode.split("-")[0] || "en";
    const prompts = PROMPTS_BY_LANGUAGE[targetLanguageCode] || PROMPTS_BY_LANGUAGE[shortCode] || DEFAULT_PROMPTS;
    return prompts.map((prompt) => ({ ...prompt, accepted: [...prompt.accepted] }));
}

function parseState(stateJson: string): LanguageDuelState {
    const parsed = JSON.parse(stateJson) as Partial<LanguageDuelState>;

    const player1 = String(parsed.players?.player1 || "");
    const player2 = String(parsed.players?.player2 || "");
    const targetLanguageCode = normalizeLanguageCode(parsed.config?.targetLanguageCode, "en");
    const prompts = Array.isArray(parsed.prompts) && parsed.prompts.length > 0
        ? parsed.prompts
        : buildPromptSet(targetLanguageCode);
    const promptCursor = Number.isInteger(parsed.promptCursor)
        ? Math.max(0, Number(parsed.promptCursor)) % prompts.length
        : 0;
    const currentPrompt = parsed.currentPrompt || prompts[promptCursor] || prompts[0];

    return {
        gameType: "languageduel",
        players: {
            player1,
            player2,
        },
        config: {
            nativeLanguageCode: normalizeLanguageCode(parsed.config?.nativeLanguageCode, "en"),
            targetLanguageCode,
            mode: normalizeMode(parsed.config?.mode),
            pointsToWin: normalizePointsToWin(parsed.config?.pointsToWin),
            turnSeconds: 30,
        },
        prompts,
        promptCursor,
        currentPrompt,
        roundNumber: Math.max(1, Number(parsed.roundNumber || 1)),
        currentTurn: String(parsed.currentTurn || player1),
        roundSubmissions: parsed.roundSubmissions && typeof parsed.roundSubmissions === "object"
            ? parsed.roundSubmissions
            : {},
        scores: {
            [player1]: Number((parsed.scores as Record<string, unknown> | undefined)?.[player1] || 0),
            [player2]: Number((parsed.scores as Record<string, unknown> | undefined)?.[player2] || 0),
        },
        gameOver: Boolean(parsed.gameOver),
        winner: parsed.winner,
        reason: parsed.reason,
        lastRound: parsed.lastRound,
        lastMoveAt: Number(parsed.lastMoveAt || Date.now()),
    };
}

function cloneState(state: LanguageDuelState): LanguageDuelState {
    return JSON.parse(JSON.stringify(state)) as LanguageDuelState;
}

function resolveRoundWinner(
    player1Id: string,
    player2Id: string,
    first: LanguageDuelSubmission,
    second: LanguageDuelSubmission,
): { winnerId?: string; isDraw: boolean } {
    if (first.accuracy > second.accuracy) {
        return { winnerId: player1Id, isDraw: false };
    }
    if (second.accuracy > first.accuracy) {
        return { winnerId: player2Id, isDraw: false };
    }

    if (first.responseMs < second.responseMs) {
        return { winnerId: player1Id, isDraw: false };
    }
    if (second.responseMs < first.responseMs) {
        return { winnerId: player2Id, isDraw: false };
    }

    return { isDraw: true };
}

function createInitialStateInternal(player1 = "", player2 = "", options?: {
    nativeLanguageCode?: string;
    targetLanguageCode?: string;
    mode?: LanguageDuelMode;
    pointsToWin?: number;
}): LanguageDuelState {
    const targetLanguageCode = normalizeLanguageCode(options?.targetLanguageCode, "en");
    const prompts = buildPromptSet(targetLanguageCode);
    const currentPrompt = prompts[0] || DEFAULT_PROMPTS[0];

    return {
        gameType: "languageduel",
        players: {
            player1,
            player2,
        },
        config: {
            nativeLanguageCode: normalizeLanguageCode(options?.nativeLanguageCode, "en"),
            targetLanguageCode,
            mode: normalizeMode(options?.mode),
            pointsToWin: normalizePointsToWin(options?.pointsToWin),
            turnSeconds: 30,
        },
        prompts,
        promptCursor: 0,
        currentPrompt,
        roundNumber: 1,
        currentTurn: player1,
        roundSubmissions: {},
        scores: {
            [player1]: 0,
            [player2]: 0,
        },
        gameOver: false,
        lastMoveAt: Date.now(),
    };
}

export class LanguageDuelEngine implements GameEngine {
    gameType = "languageduel";
    minPlayers = 2;
    maxPlayers = 2;

    createInitialState(): string {
        return JSON.stringify(createInitialStateInternal());
    }

    initializeWithPlayers(player1Id: string, player2Id: string, options?: {
        nativeLanguageCode?: string;
        targetLanguageCode?: string;
        mode?: LanguageDuelMode;
        pointsToWin?: number;
    }): string {
        return JSON.stringify(createInitialStateInternal(player1Id, player2Id, options));
    }

    validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
        try {
            const state = parseState(stateJson);
            if (state.gameOver) {
                return { valid: false, error: "Game is already over", errorKey: "languageduel.gameOver" };
            }

            const isPlayer = playerId === state.players.player1 || playerId === state.players.player2;
            if (!isPlayer) {
                return { valid: false, error: "You are not a player in this match", errorKey: "languageduel.notPlayer" };
            }

            if (state.currentTurn !== playerId) {
                return { valid: false, error: "Not your turn", errorKey: "languageduel.notYourTurn" };
            }

            if (move.type !== "submit_answer" && move.type !== "timeout") {
                return { valid: false, error: "Invalid move type", errorKey: "languageduel.invalidMoveType" };
            }

            if (move.type === "submit_answer") {
                const answerText = typeof move.answerText === "string" ? move.answerText.trim() : "";
                if (!answerText) {
                    return { valid: false, error: "Answer is required", errorKey: "languageduel.answerRequired" };
                }
                if (answerText.length > 120) {
                    return { valid: false, error: "Answer is too long", errorKey: "languageduel.answerTooLong" };
                }
            }

            return { valid: true };
        } catch {
            return { valid: false, error: "Invalid game state", errorKey: "languageduel.invalidState" };
        }
    }

    applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
        try {
            const state = cloneState(parseState(stateJson));
            const events: GameEvent[] = [];
            const prompt = state.currentPrompt;

            if (!prompt) {
                return { success: false, newState: stateJson, events: [], error: "No active prompt" };
            }

            const responseMs = normalizeResponseMs(move.responseMs);

            if (move.type === "timeout") {
                state.roundSubmissions[playerId] = {
                    answerText: "",
                    normalizedAnswer: "",
                    accuracy: 0,
                    responseMs: 30_000,
                    timedOut: true,
                    submittedAt: Date.now(),
                };
                state.scores[playerId] = (state.scores[playerId] || 0) - 1;

                events.push({
                    type: "move",
                    data: {
                        action: "timeout",
                        playerId,
                        promptId: prompt.id,
                    },
                });

                events.push({
                    type: "score",
                    data: {
                        playerId,
                        delta: -1,
                        reason: "timeout",
                        scores: state.scores,
                    },
                });
            } else {
                const answerText = typeof move.answerText === "string" ? move.answerText.trim() : "";
                const normalizedAnswer = normalizeText(answerText);
                const accuracy = scoreAccuracy(normalizedAnswer, prompt.accepted);

                state.roundSubmissions[playerId] = {
                    answerText,
                    normalizedAnswer,
                    accuracy,
                    responseMs,
                    timedOut: false,
                    submittedAt: Date.now(),
                };

                events.push({
                    type: "move",
                    data: {
                        action: "submit_answer",
                        playerId,
                        promptId: prompt.id,
                        accuracy,
                        responseMs,
                    },
                });
            }

            state.lastMoveAt = Date.now();

            const opponentId = playerId === state.players.player1 ? state.players.player2 : state.players.player1;
            const currentSubmission = state.roundSubmissions[playerId];
            const opponentSubmission = state.roundSubmissions[opponentId];

            if (!opponentSubmission) {
                state.currentTurn = opponentId;
                events.push({ type: "turn_change", data: { nextPlayer: opponentId } });
                return {
                    success: true,
                    newState: JSON.stringify(state),
                    events,
                };
            }

            const player1Submission = state.roundSubmissions[state.players.player1];
            const player2Submission = state.roundSubmissions[state.players.player2];

            if (!player1Submission || !player2Submission || !currentSubmission) {
                return {
                    success: true,
                    newState: JSON.stringify(state),
                    events,
                };
            }

            const roundResult = resolveRoundWinner(
                state.players.player1,
                state.players.player2,
                player1Submission,
                player2Submission,
            );

            if (roundResult.winnerId) {
                state.scores[roundResult.winnerId] = (state.scores[roundResult.winnerId] || 0) + 1;
                events.push({
                    type: "score",
                    data: {
                        playerId: roundResult.winnerId,
                        delta: 1,
                        reason: "round_win",
                        scores: state.scores,
                    },
                });
            }

            state.lastRound = {
                winnerId: roundResult.winnerId,
                isDraw: roundResult.isDraw,
                promptWord: prompt.word,
                submissions: {
                    [state.players.player1]: player1Submission,
                    [state.players.player2]: player2Submission,
                },
            };

            const player1Score = state.scores[state.players.player1] || 0;
            const player2Score = state.scores[state.players.player2] || 0;

            if (player1Score >= state.config.pointsToWin || player2Score >= state.config.pointsToWin) {
                state.gameOver = true;
                state.winner = player1Score >= state.config.pointsToWin ? state.players.player1 : state.players.player2;
                state.reason = "points_target";

                events.push({
                    type: "game_over",
                    data: {
                        winner: state.winner,
                        reason: state.reason,
                        scores: state.scores,
                    },
                });

                return {
                    success: true,
                    newState: JSON.stringify(state),
                    events,
                };
            }

            state.promptCursor = (state.promptCursor + 1) % state.prompts.length;
            state.currentPrompt = state.prompts[state.promptCursor] || state.currentPrompt;
            state.roundNumber += 1;
            state.roundSubmissions = {};
            state.currentTurn = state.roundNumber % 2 === 1 ? state.players.player1 : state.players.player2;

            events.push({
                type: "turn_change",
                data: {
                    nextPlayer: state.currentTurn,
                    roundNumber: state.roundNumber,
                    promptWord: state.currentPrompt.word,
                },
            });

            return {
                success: true,
                newState: JSON.stringify(state),
                events,
            };
        } catch {
            return { success: false, newState: stateJson, events: [], error: "Failed to apply move" };
        }
    }

    getGameStatus(stateJson: string): GameStatus {
        try {
            const state = parseState(stateJson);
            return {
                isOver: state.gameOver,
                winner: state.winner,
                reason: state.reason,
                scores: state.scores,
            };
        } catch {
            return { isOver: false };
        }
    }

    getValidMoves(stateJson: string, playerId: string): MoveData[] {
        try {
            const state = parseState(stateJson);
            if (state.gameOver || state.currentTurn !== playerId) {
                return [];
            }

            // Keep timeout first so watchdogs can safely auto-select deterministic timeout behavior.
            return [
                { type: "timeout" },
                { type: "submit_answer" },
            ];
        } catch {
            return [];
        }
    }

    getPlayerView(stateJson: string, playerId: string): PlayerView {
        const state = parseState(stateJson);
        const isSpectator = playerId === "spectator";
        const isPlayer = playerId === state.players.player1 || playerId === state.players.player2;
        const opponentId = playerId === state.players.player1 ? state.players.player2 : state.players.player1;

        const mySubmission = isPlayer ? state.roundSubmissions[playerId] : undefined;
        const opponentSubmission = isPlayer ? state.roundSubmissions[opponentId] : undefined;
        const showOpponentSubmission = isSpectator || Boolean(mySubmission && opponentSubmission);

        return {
            gameType: "languageduel",
            gamePhase: state.gameOver ? "finished" : "playing",
            roundNumber: state.roundNumber,
            prompt: {
                id: state.currentPrompt.id,
                word: state.currentPrompt.word,
            },
            currentTurn: state.currentTurn,
            isMyTurn: isPlayer ? state.currentTurn === playerId : false,
            scores: state.scores,
            pointsToWin: state.config.pointsToWin,
            mode: state.config.mode,
            targetLanguageCode: state.config.targetLanguageCode,
            nativeLanguageCode: state.config.nativeLanguageCode,
            turnSeconds: state.config.turnSeconds,
            mySubmission,
            opponentSubmission: showOpponentSubmission ? opponentSubmission : undefined,
            roundSubmissions: isSpectator ? state.roundSubmissions : undefined,
            lastRound: state.lastRound,
            winner: state.winner,
            reason: state.reason,
            validMoves: isPlayer ? this.getValidMoves(stateJson, playerId) : [],
        };
    }
}

export const languageDuelEngine = new LanguageDuelEngine();
