import type { ApplyMoveResult, GameEngine, GameStatus, MoveData, PlayerView, ValidationResult } from "./types";

interface ArcadeScorePlayerState {
    playerId: string;
    score: number;
    submittedAtMs?: number;
}

interface ArcadeScoreState {
    gameType: string;
    playerIds: string[];
    currentTurnIndex: number;
    currentTurn: string;
    phase: "waiting" | "active" | "finished";
    submitted: Record<string, ArcadeScorePlayerState>;
    scores: Record<string, number>;
    turnOrder: string[];
    winner?: string;
    winningTeam?: number;
    isDraw?: boolean;
    resultReason?: string;
    submittedCount: number;
    startedAtMs: number;
    updatedAtMs: number;
}

function createState(playerIds: string[], gameType = "arcade"): ArcadeScoreState {
    const normalizedPlayerIds = playerIds.filter(Boolean);
    const firstPlayerId = normalizedPlayerIds[0] || "";
    const now = Date.now();

    return {
        gameType,
        playerIds: normalizedPlayerIds,
        currentTurnIndex: 0,
        currentTurn: firstPlayerId,
        phase: normalizedPlayerIds.length > 0 ? "active" : "waiting",
        submitted: {},
        scores: {},
        turnOrder: normalizedPlayerIds,
        submittedCount: 0,
        startedAtMs: now,
        updatedAtMs: now,
    };
}

function getSubmissionScore(move: MoveData): number {
    const rawScore = typeof move.score === "number"
        ? move.score
        : typeof move.score === "string"
            ? Number(move.score)
            : Number.NaN;

    if (Number.isFinite(rawScore) && rawScore >= 0) {
        return Math.floor(rawScore);
    }

    const fallbackFromMetrics =
        typeof move.hits === "number"
            ? move.hits
            : typeof move.points === "number"
                ? move.points
                : typeof move.timeMs === "number"
                    ? Math.max(0, Math.floor(10_000 - Number(move.timeMs)))
                    : 0;

    return Math.max(0, Math.floor(fallbackFromMetrics));
}

function getResultReason(gameType: string): string {
    return `arcade_score_submit:${gameType}`;
}

function toWinner(state: ArcadeScoreState): string | undefined {
    const entries = Object.entries(state.scores).filter(([, score]) => Number.isFinite(score));
    if (entries.length === 0) return undefined;

    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const [topId, topScore] = sorted[0];
    const secondScore = sorted[1]?.[1];

    if (typeof secondScore === "number" && secondScore === topScore) {
        state.isDraw = true;
        return undefined;
    }

    return topId;
}

function buildPlayerView(state: ArcadeScoreState, playerId: string): Record<string, unknown> {
    return {
        gameType: state.gameType,
        phase: state.phase,
        currentTurn: state.currentTurn,
        turnOrder: state.turnOrder,
        playerId,
        submittedCount: state.submittedCount,
        totalPlayers: state.playerIds.length,
        myScore: state.scores[playerId] ?? 0,
        mySubmitted: Boolean(state.submitted[playerId]),
        submitted: state.submitted,
        scores: state.scores,
        winner: state.winner,
        isDraw: state.isDraw ?? false,
        resultReason: state.resultReason,
        startedAtMs: state.startedAtMs,
        updatedAtMs: state.updatedAtMs,
    };
}

function normalizeState(stateJson: string): ArcadeScoreState | null {
    try {
        const parsed = JSON.parse(stateJson) as Partial<ArcadeScoreState>;
        if (!parsed || typeof parsed !== "object") return null;

        return {
            gameType: typeof parsed.gameType === "string" ? parsed.gameType : "arcade",
            playerIds: Array.isArray(parsed.playerIds) ? parsed.playerIds.filter((id): id is string => typeof id === "string") : [],
            currentTurnIndex: typeof parsed.currentTurnIndex === "number" ? parsed.currentTurnIndex : 0,
            currentTurn: typeof parsed.currentTurn === "string" ? parsed.currentTurn : "",
            phase: parsed.phase === "waiting" || parsed.phase === "active" || parsed.phase === "finished" ? parsed.phase : "waiting",
            submitted: parsed.submitted && typeof parsed.submitted === "object" ? parsed.submitted as Record<string, ArcadeScorePlayerState> : {},
            scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores as Record<string, number> : {},
            turnOrder: Array.isArray(parsed.turnOrder) ? parsed.turnOrder.filter((id): id is string => typeof id === "string") : [],
            winner: typeof parsed.winner === "string" ? parsed.winner : undefined,
            winningTeam: typeof parsed.winningTeam === "number" ? parsed.winningTeam : undefined,
            isDraw: typeof parsed.isDraw === "boolean" ? parsed.isDraw : false,
            resultReason: typeof parsed.resultReason === "string" ? parsed.resultReason : undefined,
            submittedCount: typeof parsed.submittedCount === "number" ? parsed.submittedCount : 0,
            startedAtMs: typeof parsed.startedAtMs === "number" ? parsed.startedAtMs : Date.now(),
            updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Date.now(),
        };
    } catch {
        return null;
    }
}

function finalizeIfComplete(state: ArcadeScoreState): ArcadeScoreState {
    if (state.submittedCount < state.playerIds.length || state.playerIds.length === 0) {
        return state;
    }

    const winner = toWinner(state);
    state.winner = winner;
    state.phase = "finished";
    state.currentTurn = "";
    state.currentTurnIndex = Math.max(0, state.playerIds.length - 1);
    state.resultReason = getResultReason(state.gameType);

    if (!winner) {
        state.isDraw = true;
    }

    return state;
}

function advanceTurn(state: ArcadeScoreState): ArcadeScoreState {
    const nextIndex = state.playerIds.findIndex((playerId) => !state.submitted[playerId]);
    if (nextIndex >= 0) {
        state.currentTurnIndex = nextIndex;
        state.currentTurn = state.playerIds[nextIndex] || "";
        return state;
    }

    state.currentTurn = "";
    return state;
}

export class ArcadeScoreEngine implements GameEngine {
    gameType: string;
    minPlayers: number;
    maxPlayers: number;

    constructor(gameType: string, minPlayers: number, maxPlayers: number) {
        this.gameType = gameType;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
    }

    createInitialState(): string {
        return JSON.stringify(createState([], this.gameType));
    }

    initializeWithPlayers(...args: unknown[]): string {
        const [playerIdsArg] = args;
        const playerIds = Array.isArray(playerIdsArg)
            ? playerIdsArg.filter((id): id is string => typeof id === "string")
            : [];
        return JSON.stringify(createState(playerIds, this.gameType));
    }

    validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
        const state = normalizeState(stateJson);
        if (!state) {
            return { valid: false, error: "Invalid game state", errorKey: "arcade.invalidState" };
        }

        if (state.phase === "finished") {
            return { valid: false, error: "Game is already over", errorKey: "arcade.gameOver" };
        }

        if (typeof move?.type !== "string") {
            return { valid: false, error: "Invalid move type", errorKey: "arcade.invalidMoveType" };
        }

        if (move.type !== "submit_score") {
            return { valid: false, error: "Unsupported move type", errorKey: "arcade.invalidMoveType" };
        }

        if (!state.playerIds.includes(playerId)) {
            return { valid: false, error: "Player not seated in this match", errorKey: "arcade.notSeated" };
        }

        if (state.submitted[playerId]) {
            return { valid: false, error: "Score already submitted", errorKey: "arcade.alreadySubmitted" };
        }

        if (state.currentTurn && state.currentTurn !== playerId) {
            return { valid: false, error: "Not your turn", errorKey: "arcade.notYourTurn" };
        }

        const score = getSubmissionScore(move);
        if (!Number.isFinite(score) || score < 0) {
            return { valid: false, error: "Invalid score", errorKey: "arcade.invalidScore" };
        }

        return { valid: true };
    }

    applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
        const state = normalizeState(stateJson);
        if (!state) {
            return { success: false, newState: stateJson, events: [], error: "Invalid game state" };
        }

        const validation = this.validateMove(stateJson, playerId, move);
        if (!validation.valid) {
            return { success: false, newState: stateJson, events: [], error: validation.error || "Invalid move" };
        }

        const score = getSubmissionScore(move);
        let nextState = structuredClone(state);

        nextState.submitted[playerId] = {
            playerId,
            score,
            submittedAtMs: Date.now(),
        };
        nextState.scores[playerId] = score;
        nextState.submittedCount = Object.keys(nextState.submitted).length;
        nextState.updatedAtMs = Date.now();

        const events: Array<{ type: "score" | "game_over"; data: Record<string, unknown> }> = [
            {
                type: "score",
                data: {
                    playerId,
                    score,
                    gameType: this.gameType,
                },
            },
        ];

        nextState = advanceTurn(nextState);
        nextState = finalizeIfComplete(nextState);

        if (nextState.phase === "finished") {
            const winner = nextState.winner;
            events.push({
                type: "game_over",
                data: {
                    winner,
                    isDraw: Boolean(nextState.isDraw),
                    reason: nextState.resultReason || getResultReason(this.gameType),
                    scores: nextState.scores,
                },
            });
        }

        return {
            success: true,
            newState: JSON.stringify(nextState),
            events: events as ApplyMoveResult["events"],
        };
    }

    getGameStatus(stateJson: string): GameStatus {
        const state = normalizeState(stateJson);
        if (!state) {
            return { isOver: false };
        }

        const isOver = state.phase === "finished" || state.submittedCount >= state.playerIds.length;
        const winner = state.winner || (!state.isDraw ? toWinner(state) : undefined);

        return {
            isOver,
            winner,
            isDraw: state.isDraw,
            reason: state.resultReason || (isOver ? getResultReason(this.gameType) : undefined),
            scores: state.scores,
        };
    }

    getValidMoves(stateJson: string, playerId: string): MoveData[] {
        const state = normalizeState(stateJson);
        if (!state || state.phase === "finished") {
            return [];
        }

        if (state.playerIds.includes(playerId) && !state.submitted[playerId] && (!state.currentTurn || state.currentTurn === playerId)) {
            return [{ type: "submit_score" }];
        }

        return [];
    }

    getPlayerView(stateJson: string, playerId: string): PlayerView {
        const state = normalizeState(stateJson);
        if (!state) {
            return { gamePhase: "loading" };
        }

        return buildPlayerView(state, playerId);
    }
}
