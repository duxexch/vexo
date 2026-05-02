import type { ApplyMoveResult, GameEngine, GameEvent, GameStatus, MoveData, PlayerView, ValidationResult } from "../types";

type LudoColor = "r" | "g" | "y" | "b";
type LudoPhase = "waiting" | "setup" | "rolling" | "moving" | "finished";
type SeatType = "human" | "ai" | "off";

interface LudoTokenState {
    tokenId: string;
    position: number;
    finished: boolean;
}

interface LudoPlayerState {
    playerId: string;
    color: LudoColor;
    seat: SeatType;
    tokens: LudoTokenState[];
    finishedCount: number;
    score: number;
    isBot: boolean;
}

interface LudoState {
    gameType: "ludo";
    phase: LudoPhase;
    playerOrder: string[];
    currentTurnIndex: number;
    currentTurnPlayerId: string;
    currentDice: number | null;
    lastDice: number | null;
    diceRolledAtMs: number | null;
    moveSequence: number;
    winnerId: string | null;
    isDraw: boolean;
    players: Record<string, LudoPlayerState>;
    turnHistory: Array<{
        playerId: string;
        dice: number;
        movedTokenId?: string;
        from?: number;
        to?: number;
        capturedTokenId?: string;
        extraTurn: boolean;
        createdAtMs: number;
    }>;
    updatedAtMs: number;
    startedAtMs: number;
}

const COLORS: LudoColor[] = ["r", "g", "y", "b"];
const START_INDEX: Record<LudoColor, number> = { r: 0, g: 13, y: 26, b: 39 };
const SAFE_PATH_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
const HOME_LENGTH = 6;
const BOARD_LENGTH = 52;
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const DEFAULT_TOKENS_PER_PLAYER = 4;
const ENTRY_SCORE_PER_TOKEN = 25;

function createTokenState(tokenId: string): LudoTokenState {
    return { tokenId, position: -1, finished: false };
}

function createPlayerState(playerId: string, color: LudoColor, seat: SeatType): LudoPlayerState {
    return {
        playerId,
        color,
        seat,
        tokens: Array.from({ length: DEFAULT_TOKENS_PER_PLAYER }, (_, index) => createTokenState(`${color}_${index}`)),
        finishedCount: 0,
        score: 0,
        isBot: seat === "ai",
    };
}

function buildDefaultPlayerOrder(playerCount: number): string[] {
    return Array.from({ length: Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, playerCount)) }, (_, index) => `player${index + 1}`);
}

function createInitialPlayers(playerIds: string[] = []): Record<string, LudoPlayerState> {
    const normalizedIds = playerIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_PLAYERS);
    const order = normalizedIds.length > 0 ? normalizedIds : buildDefaultPlayerOrder(4);
    return order.reduce<Record<string, LudoPlayerState>>((acc, playerId, index) => {
        acc[playerId] = createPlayerState(playerId, COLORS[index] ?? COLORS[index % COLORS.length], "human");
        return acc;
    }, {});
}

function createInitialState(playerIds: string[] = []): LudoState {
    const players = createInitialPlayers(playerIds);
    const playerOrder = Object.keys(players);
    const firstPlayerId = playerOrder[0] ?? "";
    const now = Date.now();
    return {
        gameType: "ludo",
        phase: playerOrder.length > 0 ? "rolling" : "waiting",
        playerOrder,
        currentTurnIndex: 0,
        currentTurnPlayerId: firstPlayerId,
        currentDice: null,
        lastDice: null,
        diceRolledAtMs: null,
        moveSequence: 0,
        winnerId: null,
        isDraw: false,
        players,
        turnHistory: [],
        updatedAtMs: now,
        startedAtMs: now,
    };
}

function parseState(stateJson: string): LudoState | null {
    try {
        const parsed = JSON.parse(stateJson) as Partial<LudoState>;
        if (!parsed || typeof parsed !== "object") return null;
        const players = parsed.players && typeof parsed.players === "object"
            ? Object.fromEntries(Object.entries(parsed.players as Record<string, Partial<LudoPlayerState>>).map(([playerId, player]) => {
                const color = (player.color && COLORS.includes(player.color as LudoColor) ? player.color : "r") as LudoColor;
                const tokens = Array.isArray(player.tokens)
                    ? player.tokens.map((token, index) => ({
                        tokenId: typeof token?.tokenId === "string" ? token.tokenId : `${color}_${index}`,
                        position: typeof token?.position === "number" ? token.position : -1,
                        finished: Boolean(token?.finished),
                    }))
                    : Array.from({ length: DEFAULT_TOKENS_PER_PLAYER }, (_, index) => createTokenState(`${color}_${index}`));
                return [playerId, {
                    playerId,
                    color,
                    seat: player.seat === "ai" || player.seat === "off" ? player.seat : "human",
                    tokens,
                    finishedCount: typeof player.finishedCount === "number" ? player.finishedCount : tokens.filter((token) => token.finished).length,
                    score: typeof player.score === "number" ? player.score : 0,
                    isBot: Boolean(player.isBot),
                } satisfies LudoPlayerState];
            }))
            : {};
        const playerOrder = Array.isArray(parsed.playerOrder) ? parsed.playerOrder.filter((id): id is string => typeof id === "string") : Object.keys(players);
        return {
            gameType: "ludo",
            phase: parsed.phase === "waiting" || parsed.phase === "setup" || parsed.phase === "rolling" || parsed.phase === "moving" || parsed.phase === "finished" ? parsed.phase : "waiting",
            playerOrder,
            currentTurnIndex: typeof parsed.currentTurnIndex === "number" ? parsed.currentTurnIndex : 0,
            currentTurnPlayerId: typeof parsed.currentTurnPlayerId === "string" ? parsed.currentTurnPlayerId : (playerOrder[0] ?? ""),
            currentDice: typeof parsed.currentDice === "number" ? parsed.currentDice : null,
            lastDice: typeof parsed.lastDice === "number" ? parsed.lastDice : null,
            diceRolledAtMs: typeof parsed.diceRolledAtMs === "number" ? parsed.diceRolledAtMs : null,
            moveSequence: typeof parsed.moveSequence === "number" ? parsed.moveSequence : 0,
            winnerId: typeof parsed.winnerId === "string" ? parsed.winnerId : null,
            isDraw: Boolean(parsed.isDraw),
            players,
            turnHistory: Array.isArray(parsed.turnHistory) ? parsed.turnHistory as LudoState["turnHistory"] : [],
            updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Date.now(),
            startedAtMs: typeof parsed.startedAtMs === "number" ? parsed.startedAtMs : Date.now(),
        };
    } catch {
        return null;
    }
}

function getPlayerById(state: LudoState, playerId: string): LudoPlayerState | null {
    return state.players[playerId] ?? null;
}

function getPlayerColor(state: LudoState, playerId: string): LudoColor | null {
    return getPlayerById(state, playerId)?.color ?? null;
}

function getPlayerStartIndex(state: LudoState, playerId: string): number {
    const color = getPlayerColor(state, playerId);
    return color ? START_INDEX[color] : 0;
}

function getAbsolutePathIndex(state: LudoState, playerId: string, relativePosition: number): number {
    return (getPlayerStartIndex(state, playerId) + relativePosition) % BOARD_LENGTH;
}

function isSafeSquare(state: LudoState, playerId: string, position: number): boolean {
    if (position < 0 || position >= BOARD_LENGTH) return false;
    return SAFE_PATH_INDICES.has(getAbsolutePathIndex(state, playerId, position));
}

function canMoveToken(_state: LudoState, _playerId: string, token: LudoTokenState, dice: number): boolean {
    if (!Number.isInteger(dice) || dice < 1 || dice > 6) return false;
    if (token.finished) return false;
    if (token.position === -1) return dice === 6;
    return token.position + dice <= BOARD_LENGTH + HOME_LENGTH;
}

function getMovableTokens(state: LudoState, playerId: string, dice: number): LudoTokenState[] {
    const player = getPlayerById(state, playerId);
    if (!player) return [];
    return player.tokens.filter((token) => canMoveToken(state, playerId, token, dice));
}

function captureTokens(state: LudoState, currentPlayerId: string, landingPosition: number): string[] {
    const captured: string[] = [];
    const currentAbsolute = getAbsolutePathIndex(state, currentPlayerId, landingPosition);

    for (const [playerId, player] of Object.entries(state.players)) {
        if (playerId === currentPlayerId) continue;
        for (const token of player.tokens) {
            if (token.finished || token.position < 0 || token.position >= BOARD_LENGTH) continue;
            const opponentAbsolute = getAbsolutePathIndex(state, playerId, token.position);
            if (opponentAbsolute === currentAbsolute && !SAFE_PATH_INDICES.has(opponentAbsolute)) {
                token.position = -1;
                token.finished = false;
                captured.push(token.tokenId);
            }
        }
    }

    return captured;
}

function advanceTurn(state: LudoState): void {
    if (state.phase === "finished") {
        state.currentTurnPlayerId = "";
        return;
    }
    const nextIndex = (state.currentTurnIndex + 1) % Math.max(1, state.playerOrder.length);
    state.currentTurnIndex = nextIndex;
    state.currentTurnPlayerId = state.playerOrder[nextIndex] ?? "";
    state.currentDice = null;
    state.diceRolledAtMs = null;
    state.phase = "rolling";
}

function recomputeWinner(state: LudoState): void {
    for (const playerId of state.playerOrder) {
        const player = state.players[playerId];
        if (player?.tokens.every((token) => token.finished)) {
            state.winnerId = playerId;
            state.phase = "finished";
            state.currentTurnPlayerId = "";
            return;
        }
    }
}

function applyMoveInternal(state: LudoState, playerId: string, move: MoveData): ApplyMoveResult {
    const dice = state.currentDice;
    const player = getPlayerById(state, playerId);
    if (!player || dice === null) {
        return { success: false, newState: JSON.stringify(state), events: [], error: "No active dice roll" };
    }
    const tokenId = typeof move.tokenId === "string" ? move.tokenId : null;
    if (!tokenId) return { success: false, newState: JSON.stringify(state), events: [], error: "tokenId is required" };

    const token = player.tokens.find((item) => item.tokenId === tokenId);
    if (!token) return { success: false, newState: JSON.stringify(state), events: [], error: "Unknown token" };
    if (!canMoveToken(state, playerId, token, dice)) {
        return { success: false, newState: JSON.stringify(state), events: [], error: "Token cannot move with this dice" };
    }

    const oldPosition = token.position;
    const newPosition = token.position === -1 ? 0 : token.position + dice;
    const events: GameEvent[] = [{
        type: "move",
        data: { playerId, tokenId, from: oldPosition, to: newPosition, dice, gameType: "ludo" },
    }];

    token.position = newPosition;
    let capturedTokenIds: string[] = [];
    if (newPosition >= 0 && newPosition < BOARD_LENGTH) {
        capturedTokenIds = captureTokens(state, playerId, newPosition);
    }
    if (capturedTokenIds.length > 0) {
        events.push({ type: "capture", data: { playerId, tokenId, capturedTokenIds } });
    }

    if (newPosition >= BOARD_LENGTH) {
        token.finished = newPosition >= BOARD_LENGTH + HOME_LENGTH - 1;
        if (token.finished) {
            player.finishedCount += 1;
            player.score += ENTRY_SCORE_PER_TOKEN;
            events.push({ type: "score", data: { playerId, tokenId, score: player.score, finishedCount: player.finishedCount } });
        }
    }

    const extraTurn = dice === 6 || capturedTokenIds.length > 0 || token.finished;
    state.turnHistory.push({ playerId, dice, movedTokenId: tokenId, from: oldPosition, to: newPosition, capturedTokenId: capturedTokenIds[0], extraTurn, createdAtMs: Date.now() });
    state.lastDice = dice;
    state.currentDice = null;
    state.moveSequence += 1;
    state.updatedAtMs = Date.now();

    recomputeWinner(state);
    if (state.phase !== "finished") advanceTurn(state);
    if (extraTurn && state.phase !== "finished") {
        state.currentTurnIndex = (state.currentTurnIndex + state.playerOrder.length - 1) % Math.max(1, state.playerOrder.length);
        state.currentTurnPlayerId = playerId;
        state.phase = "rolling";
    }

    if (state.phase === "finished" && state.winnerId) {
        events.push({ type: "game_over", data: { winner: state.winnerId, reason: "all_tokens_finished", playerId } });
    }

    return { success: true, newState: JSON.stringify(state), events };
}

function buildBoardView(state: LudoState): Record<string, unknown> {
    return {
        boardLength: BOARD_LENGTH,
        safeSquares: [...SAFE_PATH_INDICES],
        players: state.playerOrder.map((playerId) => {
            const player = state.players[playerId];
            return {
                playerId,
                color: player?.color ?? null,
                startIndex: getPlayerStartIndex(state, playerId),
                tokens: player?.tokens ?? [],
            };
        }),
    };
}

function buildPlayerView(state: LudoState, playerId: string): PlayerView {
    const player = getPlayerById(state, playerId);
    const currentPlayer = state.players[state.currentTurnPlayerId] ?? null;
    const validMoves = playerId === state.currentTurnPlayerId ? thisEngineMoves(state, playerId) : [];
    return {
        gameType: "ludo",
        phase: state.phase,
        playerId,
        myColor: player?.color ?? null,
        currentTurnPlayerId: state.currentTurnPlayerId,
        currentTurn: state.currentTurnPlayerId,
        currentDice: state.currentDice,
        lastDice: state.lastDice,
        currentPlayerColor: currentPlayer?.color ?? null,
        scores: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.score])),
        players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, {
            playerId: id,
            color: p.color,
            seat: p.seat,
            finishedCount: p.finishedCount,
            score: p.score,
            isBot: p.isBot,
            tokens: p.tokens.map((token) => ({ tokenId: token.tokenId, position: token.position, finished: token.finished })),
        }])),
        board: buildBoardView(state),
        validMoves,
        movableTokens: state.phase === "moving" || state.phase === "rolling" ? getMovableTokens(state, playerId, state.currentDice ?? 0).map((token) => token.tokenId) : [],
        turnHistory: state.turnHistory.slice(-20),
        winnerId: state.winnerId,
        isDraw: state.isDraw,
        updatedAtMs: state.updatedAtMs,
        gamePhase: state.phase,
    };
}

function thisEngineMoves(state: LudoState, playerId: string): MoveData[] {
    if (state.phase === "finished" || state.currentTurnPlayerId !== playerId) return [];
    if (state.currentDice === null) return [{ type: "roll_dice" }];
    return getMovableTokens(state, playerId, state.currentDice).map((token) => ({ type: "move_token", tokenId: token.tokenId }));
}

export class LudoEngine implements GameEngine {
    gameType = "ludo";
    minPlayers = MIN_PLAYERS;
    maxPlayers = MAX_PLAYERS;

    createInitialState(): string {
        return JSON.stringify(createInitialState([]));
    }

    initializeWithPlayers(...args: unknown[]): string {
        const playerIdsArg = Array.isArray(args[0]) ? args[0] : [];
        const playerIds = playerIdsArg.filter((id): id is string => typeof id === "string");
        return JSON.stringify(createInitialState(playerIds));
    }

    validateMove(stateJson: string, playerId: string, move: MoveData): ValidationResult {
        const state = parseState(stateJson);
        if (!state) return { valid: false, error: "Invalid game state", errorKey: "ludo.invalidState" };
        if (state.phase === "finished") return { valid: false, error: "Game is already finished", errorKey: "ludo.gameOver" };
        if (state.currentTurnPlayerId !== playerId) return { valid: false, error: "It is not your turn", errorKey: "ludo.notYourTurn" };

        if (move?.type === "roll_dice") {
            if (state.currentDice !== null) return { valid: false, error: "Dice already rolled", errorKey: "ludo.diceAlreadyRolled" };
            return { valid: true };
        }

        if (move?.type !== "move_token") {
            return { valid: false, error: "Invalid move type", errorKey: "ludo.invalidMoveType" };
        }

        if (state.currentDice === null) return { valid: false, error: "You must roll dice first", errorKey: "ludo.rollFirst" };
        const player = getPlayerById(state, playerId);
        if (!player) return { valid: false, error: "Player not seated in this game", errorKey: "ludo.notSeated" };

        const tokenId = typeof move.tokenId === "string" ? move.tokenId : null;
        if (!tokenId) return { valid: false, error: "tokenId is required", errorKey: "ludo.missingTokenId" };
        const token = player.tokens.find((item) => item.tokenId === tokenId);
        if (!token) return { valid: false, error: "Unknown token", errorKey: "ludo.unknownToken" };
        if (!canMoveToken(state, playerId, token, state.currentDice)) return { valid: false, error: "Token cannot move with this dice", errorKey: "ludo.invalidTokenMove" };
        return { valid: true };
    }

    applyMove(stateJson: string, playerId: string, move: MoveData): ApplyMoveResult {
        const state = parseState(stateJson);
        if (!state) return { success: false, newState: stateJson, events: [], error: "Invalid game state" };

        const validation = this.validateMove(stateJson, playerId, move);
        if (!validation.valid) return { success: false, newState: stateJson, events: [], error: validation.error || "Invalid move" };

        if (move.type === "roll_dice") {
            const dice = 1 + Math.floor(Math.random() * 6);
            state.currentDice = dice;
            state.lastDice = dice;
            state.diceRolledAtMs = Date.now();
            state.phase = "moving";
            state.updatedAtMs = Date.now();
            return {
                success: true,
                newState: JSON.stringify(state),
                events: [{
                    type: "turn_change",
                    data: { playerId, dice, gameType: "ludo" },
                }],
            };
        }

        return applyMoveInternal(state, playerId, move);
    }

    getGameStatus(stateJson: string): GameStatus {
        const state = parseState(stateJson);
        if (!state) return { isOver: false };
        if (state.phase === "finished") {
            return { isOver: true, winner: state.winnerId ?? undefined, isDraw: state.isDraw, reason: "all_tokens_finished" };
        }
        return {
            isOver: false,
            winner: state.winnerId ?? undefined,
            scores: Object.fromEntries(Object.entries(state.players).map(([playerId, player]) => [playerId, player.score])),
        };
    }

    getValidMoves(stateJson: string, playerId: string): MoveData[] {
        const state = parseState(stateJson);
        if (!state) return [];
        return thisEngineMoves(state, playerId);
    }

    getPlayerView(stateJson: string, playerId: string): PlayerView {
        const state = parseState(stateJson);
        if (!state) return { gamePhase: "loading" };
        return buildPlayerView(state, playerId);
    }
}

export const ludoEngine = new LudoEngine();
