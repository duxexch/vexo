export interface DominoTile {
    left: number;
    right: number;
    id?: string;
}

export interface DominoBoardMoveInput {
    tileLeft: number;
    tileRight: number;
    placedEnd: "left" | "right";
    isPassed: boolean;
}

export type DominoEngineMove =
    | { type: "draw" }
    | { type: "pass" }
    | { type: "play"; tile: DominoTile; end: "left" | "right" };

export interface DominoBoardTilePlacement {
    tile: DominoTile;
    rotation: number;
}

export interface DominoChallengeBoardState {
    myHand: DominoTile[];
    opponentTileCount: number;
    opponentTileCounts: Record<string, number>;
    boardTiles: DominoBoardTilePlacement[];
    leftEnd: number;
    rightEnd: number;
    boneyard: number;
    lastAction?: unknown;
    scores?: unknown;
    canDraw: boolean;
    playerOrder: string[];
    validMoves: Array<Record<string, unknown>>;
    passCount: number;
    playerCount: number;
    drawsThisTurn: number;
    maxDraws: number;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isDominoTile(value: unknown): value is DominoTile {
    if (!value || typeof value !== "object") {
        return false;
    }

    const tile = value as Partial<DominoTile>;
    return isFiniteNumber(tile.left) && isFiniteNumber(tile.right);
}

export function extractDominoHandFromPlayerView(
    playerView: Record<string, unknown> | null | undefined,
): DominoTile[] {
    if (!playerView) {
        return [];
    }

    const raw = playerView.hand;
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.filter(isDominoTile);
}

export function adaptDominoBoardMoveToEngine(
    move: DominoBoardMoveInput,
    hand: DominoTile[] = [],
): DominoEngineMove {
    const isDraw = move.tileLeft === -1 && move.tileRight === -1;
    if (isDraw) {
        return { type: "draw" };
    }

    if (move.isPassed) {
        return { type: "pass" };
    }

    const matched = hand.find((tile) =>
        (tile.left === move.tileLeft && tile.right === move.tileRight)
        || (tile.left === move.tileRight && tile.right === move.tileLeft),
    );

    return {
        type: "play",
        tile: {
            left: move.tileLeft,
            right: move.tileRight,
            ...(matched?.id ? { id: matched.id } : {}),
        },
        end: move.placedEnd,
    };
}

export function normalizeDominoChallengePlayerView(
    playerView: Record<string, unknown> | null | undefined,
): DominoChallengeBoardState | undefined {
    if (!playerView) {
        return undefined;
    }

    const boardRaw = Array.isArray(playerView.board)
        ? playerView.board.filter(isDominoTile)
        : [];
    const handRaw = extractDominoHandFromPlayerView(playerView);

    const otherCountsRaw = (playerView.otherHandCounts && typeof playerView.otherHandCounts === "object")
        ? playerView.otherHandCounts as Record<string, unknown>
        : {};

    const opponentTileCounts = Object.fromEntries(
        Object.entries(otherCountsRaw)
            .filter(([, value]) => isFiniteNumber(value))
            .map(([pid, value]) => [pid, value as number]),
    ) as Record<string, number>;

    const playerOrder = Array.isArray(playerView.playerOrder)
        ? playerView.playerOrder.filter((value): value is string => typeof value === "string")
        : [];

    const playerCount = Math.max(2, playerOrder.length || 2);

    return {
        myHand: handRaw,
        opponentTileCount: Object.values(opponentTileCounts).reduce((sum, count) => sum + count, 0),
        opponentTileCounts,
        boardTiles: boardRaw.map((tile) => ({
            tile,
            rotation: tile.left === tile.right ? 0 : 90,
        })),
        leftEnd: isFiniteNumber(playerView.leftEnd) ? playerView.leftEnd : -1,
        rightEnd: isFiniteNumber(playerView.rightEnd) ? playerView.rightEnd : -1,
        boneyard: isFiniteNumber(playerView.boneyardCount) ? playerView.boneyardCount : 0,
        lastAction: playerView.lastAction,
        scores: playerView.scores,
        canDraw: typeof playerView.canDraw === "boolean" ? playerView.canDraw : false,
        playerOrder,
        validMoves: Array.isArray(playerView.validMoves)
            ? playerView.validMoves.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
            : [],
        passCount: isFiniteNumber(playerView.passCount) ? playerView.passCount : 0,
        playerCount,
        drawsThisTurn: isFiniteNumber(playerView.drawsThisTurn) ? playerView.drawsThisTurn : 0,
        maxDraws: Math.max(28 - playerCount * 7, 0),
    };
}
