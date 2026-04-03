#!/usr/bin/env tsx

import { DominoEngine } from "../server/game-engines/domino/engine";

class SmokeError extends Error {
    details?: unknown;

    constructor(message: string, details?: unknown) {
        super(message);
        this.name = "SmokeError";
        this.details = details;
    }
}

function fail(message: string, details?: unknown): never {
    throw new SmokeError(message, details);
}

function assertCondition(condition: unknown, message: string, details?: unknown): asserts condition {
    if (!condition) {
        fail(message, details);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        fail(message, { actual, expected });
    }
}

function logPass(step: string): void {
    console.log(`[smoke:domino-contract] PASS ${step}`);
}

function main(): void {
    const engine = new DominoEngine();
    const players = ["smoke-p1", "smoke-p2"];
    const initialState = engine.initializeWithPlayers(players);
    const parsedInitial = JSON.parse(initialState) as {
        currentPlayer: string;
        playerOrder: string[];
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
    };

    const currentPlayer = parsedInitial.currentPlayer;
    const otherPlayer = parsedInitial.playerOrder.find((id) => id !== currentPlayer);
    assertCondition(otherPlayer, "Unable to determine non-current player", parsedInitial);

    const invalidStateValidation = engine.validateMove("{bad-json", currentPlayer, { type: "pass" });
    assertCondition(!invalidStateValidation.valid, "Expected invalid state validation failure");
    assertEqual(invalidStateValidation.errorKey, "domino.invalidState", "Expected domino.invalidState error key");
    logPass("invalid state returns domino.invalidState");

    const notYourTurnValidation = engine.validateMove(initialState, otherPlayer, { type: "pass" });
    assertCondition(!notYourTurnValidation.valid, "Expected not-your-turn validation failure");
    assertEqual(notYourTurnValidation.errorKey, "domino.notYourTurn", "Expected domino.notYourTurn error key");
    logPass("not your turn returns domino.notYourTurn");

    const invalidTypeValidation = engine.validateMove(initialState, currentPlayer, { type: "invalid_type" });
    assertCondition(!invalidTypeValidation.valid, "Expected invalid move type failure");
    assertEqual(invalidTypeValidation.errorKey, "domino.invalidMoveType", "Expected domino.invalidMoveType error key");
    logPass("invalid type returns domino.invalidMoveType");

    const cannotPassValidation = engine.validateMove(initialState, currentPlayer, { type: "pass" });
    assertCondition(!cannotPassValidation.valid, "Expected cannot-pass validation failure");
    assertEqual(cannotPassValidation.errorKey, "domino.cannotPass", "Expected domino.cannotPass error key");
    logPass("pass with playable tiles returns domino.cannotPass");

    const cannotDrawValidation = engine.validateMove(initialState, currentPlayer, { type: "draw" });
    assertCondition(!cannotDrawValidation.valid, "Expected cannot-draw validation failure");
    assertEqual(cannotDrawValidation.errorKey, "domino.cannotDraw", "Expected domino.cannotDraw error key");
    logPass("draw with playable tiles returns domino.cannotDraw");

    const impossibleTileValidation = engine.validateMove(initialState, currentPlayer, {
        type: "play",
        tile: { left: 7, right: 7 },
        end: "left",
    });
    assertCondition(!impossibleTileValidation.valid, "Expected tile-not-in-hand failure");
    assertEqual(impossibleTileValidation.errorKey, "domino.tileNotInHand", "Expected domino.tileNotInHand error key");
    logPass("unknown tile returns domino.tileNotInHand");

    const mustDrawState = JSON.parse(initialState) as {
        board: Array<{ left: number; right: number; id?: string }>;
        leftEnd: number;
        rightEnd: number;
        currentPlayer: string;
        drawsThisTurn: number;
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
        boneyard: Array<{ left: number; right: number; id?: string }>;
    };

    mustDrawState.board = [{ left: 6, right: 6, id: "6-6" }];
    mustDrawState.leftEnd = 6;
    mustDrawState.rightEnd = 6;
    mustDrawState.currentPlayer = currentPlayer;
    mustDrawState.drawsThisTurn = 0;
    mustDrawState.hands[currentPlayer] = [{ left: 0, right: 1, id: "0-1" }];
    mustDrawState.boneyard = [{ left: 2, right: 3, id: "2-3" }];

    const mustDrawPassValidation = engine.validateMove(JSON.stringify(mustDrawState), currentPlayer, { type: "pass" });
    assertCondition(!mustDrawPassValidation.valid, "Expected must-draw validation failure");
    assertEqual(mustDrawPassValidation.errorKey, "domino.mustDraw", "Expected domino.mustDraw error key");
    logPass("pass with empty playable set and non-empty boneyard returns domino.mustDraw");

    const boneyardEmptyState = {
        ...mustDrawState,
        boneyard: [] as Array<{ left: number; right: number; id?: string }>,
    };
    const boneyardEmptyValidation = engine.validateMove(JSON.stringify(boneyardEmptyState), currentPlayer, { type: "draw" });
    assertCondition(!boneyardEmptyValidation.valid, "Expected boneyard-empty validation failure");
    assertEqual(boneyardEmptyValidation.errorKey, "domino.boneyardEmpty", "Expected domino.boneyardEmpty error key");
    logPass("draw with empty boneyard returns domino.boneyardEmpty");

    const maxDrawsState = {
        ...mustDrawState,
        drawsThisTurn: 14,
    };
    const maxDrawsValidation = engine.validateMove(JSON.stringify(maxDrawsState), currentPlayer, { type: "draw" });
    assertCondition(!maxDrawsValidation.valid, "Expected max-draws validation failure");
    assertEqual(maxDrawsValidation.errorKey, "domino.maxDrawsReached", "Expected domino.maxDrawsReached error key");
    logPass("draw after max draws returns domino.maxDrawsReached");

    const validMoves = engine.getValidMoves(initialState, currentPlayer);
    assertCondition(validMoves.length > 0, "Expected at least one valid move for current player");

    const preferredMove = validMoves.find((m) => m.type === "play") || validMoves[0];
    const applyResult = engine.applyMove(initialState, currentPlayer, preferredMove);
    assertCondition(applyResult.success, "Expected applyMove success for valid move", { preferredMove, error: applyResult.error });

    const parsedAfter = JSON.parse(applyResult.newState) as {
        currentPlayer: string;
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
    };

    assertCondition(typeof parsedAfter.currentPlayer === "string" && parsedAfter.currentPlayer.length > 0, "Expected next currentPlayer after move");

    if (preferredMove.type === "play") {
        const handAfter = parsedAfter.hands[currentPlayer] || [];
        const playedTile = preferredMove.tile as { left: number; right: number; id?: string };
        const stillHasPlayedTile = handAfter.some((tile) =>
            (tile.left === playedTile.left && tile.right === playedTile.right)
            || (tile.left === playedTile.right && tile.right === playedTile.left)
        );
        assertCondition(!stillHasPlayedTile, "Played tile should be removed from player hand", { preferredMove, handAfter });
    }

    logPass("valid move applies and advances state");
    console.log("[smoke:domino-contract] All checks passed.");
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof SmokeError ? error.details : undefined;
    console.error("[smoke:domino-contract] FAIL", message, details ?? "");
    process.exit(1);
}
