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

    const impossibleTileValidation = engine.validateMove(initialState, currentPlayer, {
        type: "play",
        tile: { left: 7, right: 7 },
        end: "left",
    });
    assertCondition(!impossibleTileValidation.valid, "Expected tile-not-in-hand failure");
    assertEqual(impossibleTileValidation.errorKey, "domino.tileNotInHand", "Expected domino.tileNotInHand error key");
    logPass("unknown tile returns domino.tileNotInHand");

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
