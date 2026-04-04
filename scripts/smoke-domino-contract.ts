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

    const brokenChainState = JSON.parse(initialState) as {
        board: Array<{ left: number; right: number; id?: string }>;
        leftEnd: number;
        rightEnd: number;
        currentPlayer: string;
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
    };
    brokenChainState.currentPlayer = currentPlayer;
    brokenChainState.board = [
        { left: 6, right: 4, id: "4-6" },
        { left: 2, right: 1, id: "1-2" },
    ];
    brokenChainState.leftEnd = 6;
    brokenChainState.rightEnd = 1;

    const brokenChainValidation = engine.validateMove(JSON.stringify(brokenChainState), currentPlayer, { type: "pass" });
    assertCondition(!brokenChainValidation.valid, "Expected invalid state for broken board chain");
    assertEqual(brokenChainValidation.errorKey, "domino.invalidState", "Expected domino.invalidState for broken chain");
    logPass("broken board chain is rejected as domino.invalidState");

    const duplicatedTileState = JSON.parse(initialState) as {
        currentPlayer: string;
        board: Array<{ left: number; right: number; id?: string }>;
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
    };
    duplicatedTileState.currentPlayer = currentPlayer;
    const duplicatedTile = duplicatedTileState.hands[currentPlayer][0];
    duplicatedTileState.board = [{ ...duplicatedTile }];

    const duplicateTileValidation = engine.validateMove(JSON.stringify(duplicatedTileState), currentPlayer, { type: "pass" });
    assertCondition(!duplicateTileValidation.valid, "Expected invalid state for duplicated tile");
    assertEqual(duplicateTileValidation.errorKey, "domino.invalidState", "Expected domino.invalidState for duplicate tile");
    logPass("duplicate tile across hand/board is rejected as domino.invalidState");

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

    mustDrawState.currentPlayer = currentPlayer;
    mustDrawState.drawsThisTurn = 0;

    const boardStarter = mustDrawState.boneyard.find((tile) => tile.left === 6 && tile.right === 6)
        || mustDrawState.boneyard[0];
    assertCondition(boardStarter, "Expected boneyard tile to seed must-draw board state");
    mustDrawState.boneyard = mustDrawState.boneyard.filter((tile) => tile.id !== boardStarter.id);
    mustDrawState.board = [{ ...boardStarter }];
    mustDrawState.leftEnd = boardStarter.left;
    mustDrawState.rightEnd = boardStarter.right;

    const playerHand = mustDrawState.hands[currentPlayer] || [];
    let chosenTile = playerHand.find((tile) =>
        tile.left !== mustDrawState.leftEnd
        && tile.right !== mustDrawState.leftEnd
        && tile.left !== mustDrawState.rightEnd
        && tile.right !== mustDrawState.rightEnd,
    );

    if (chosenTile) {
        mustDrawState.hands[currentPlayer] = [{ ...chosenTile }];
        const movedToBoneyard = playerHand.filter((tile) => tile.id !== chosenTile!.id);
        mustDrawState.boneyard.push(...movedToBoneyard);
    } else {
        const fallbackTile = mustDrawState.boneyard.find((tile) =>
            tile.left !== mustDrawState.leftEnd
            && tile.right !== mustDrawState.leftEnd
            && tile.left !== mustDrawState.rightEnd
            && tile.right !== mustDrawState.rightEnd,
        );
        assertCondition(fallbackTile, "Expected a non-playable tile for must-draw scenario");
        mustDrawState.boneyard = mustDrawState.boneyard.filter((tile) => tile.id !== fallbackTile.id);
        mustDrawState.boneyard.push(...playerHand);
        mustDrawState.hands[currentPlayer] = [{ ...fallbackTile }];
        chosenTile = fallbackTile;
    }

    assertCondition(Boolean(chosenTile), "Expected must-draw fixture tile");

    const mustDrawPassValidation = engine.validateMove(JSON.stringify(mustDrawState), currentPlayer, { type: "pass" });
    assertCondition(!mustDrawPassValidation.valid, "Expected must-draw validation failure");
    assertEqual(mustDrawPassValidation.errorKey, "domino.mustDraw", "Expected domino.mustDraw error key");
    logPass("pass with empty playable set and non-empty boneyard returns domino.mustDraw");

    const boneyardEmptyState = JSON.parse(JSON.stringify(mustDrawState)) as {
        boneyard: Array<{ left: number; right: number; id?: string }>;
        hands: Record<string, Array<{ left: number; right: number; id?: string }>>;
    };
    boneyardEmptyState.hands[otherPlayer] = [
        ...(boneyardEmptyState.hands[otherPlayer] || []),
        ...boneyardEmptyState.boneyard,
    ];
    boneyardEmptyState.boneyard = [];
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
