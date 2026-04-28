#!/usr/bin/env tsx

import { DominoEngine } from "../server/game-engines/domino/engine";
import { SmokeScriptError, createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers("SmokeError");

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

    const opponentHand = mustDrawState.hands[otherPlayer] || [];
    const boardStarter = opponentHand[0];
    assertCondition(Boolean(boardStarter), "Expected opponent tile to seed must-draw board state");

    mustDrawState.hands[otherPlayer] = opponentHand.slice(1);
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
        const fallbackTileIndex = mustDrawState.boneyard.findIndex((tile) =>
            tile.left !== mustDrawState.leftEnd
            && tile.right !== mustDrawState.leftEnd
            && tile.left !== mustDrawState.rightEnd
            && tile.right !== mustDrawState.rightEnd,
        );
        const fallbackTile = fallbackTileIndex >= 0 ? mustDrawState.boneyard[fallbackTileIndex] : undefined;
        assertCondition(fallbackTile, "Expected a non-playable tile for must-draw scenario");
        mustDrawState.boneyard.splice(fallbackTileIndex, 1);
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

    // ---------------------------------------------------------------------------
    // Pure domino-out scoring rule
    // ---------------------------------------------------------------------------

    type SmokeTile = { left: number; right: number; id: string };
    type SmokeState = {
        board: SmokeTile[];
        leftEnd: number;
        rightEnd: number;
        hands: Record<string, SmokeTile[]>;
        boneyard: SmokeTile[];
        currentPlayer: string;
        playerOrder: string[];
        passCount: number;
        drawsThisTurn: number;
        drewThisRound: string[];
        gameOver: boolean;
        targetScore: number;
        roundNumber: number;
        scores: Record<string, number>;
        winner?: string | null;
        winningTeam?: number;
        isDraw?: boolean;
        reason?: string;
        lastAction?: { type: string; playerId: string; tile?: SmokeTile; end?: string };
    };

    const allTiles: SmokeTile[] = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            allTiles.push({ left: i, right: j, id: `${i}-${j}` });
        }
    }

    function takeTile(pool: SmokeTile[], id: string): SmokeTile {
        const idx = pool.findIndex((t) => t.id === id);
        assertCondition(idx !== -1, `Fixture missing tile ${id}`);
        return pool.splice(idx, 1)[0];
    }

    function buildScoringFixture(opts: {
        players: string[];
        winner: string;
        winningTile: SmokeTile;
        drewThisRound: string[];
        targetScore?: number;
    }): SmokeState {
        const pool = allTiles.map((t) => ({ ...t }));
        // Board with a single spinner so winningTile attaches cleanly via a matching pip.
        const seedId = `${opts.winningTile.left}-${opts.winningTile.left}`;
        const seed = takeTile(pool, seedId);
        const winnerHandTile = takeTile(pool, opts.winningTile.id);
        const hands: Record<string, SmokeTile[]> = {};
        for (const pid of opts.players) {
            hands[pid] = [];
        }
        hands[opts.winner] = [winnerHandTile];
        // Distribute six tiles to each opponent so opponent pip totals are non-trivial.
        const opponents = opts.players.filter((p) => p !== opts.winner);
        for (const pid of opponents) {
            for (let n = 0; n < 6; n++) {
                hands[pid].push(pool.shift()!);
            }
        }
        const boneyard = pool;
        return {
            board: [seed],
            leftEnd: seed.left,
            rightEnd: seed.right,
            hands,
            boneyard,
            currentPlayer: opts.winner,
            playerOrder: opts.players,
            passCount: 0,
            drawsThisTurn: 0,
            drewThisRound: opts.drewThisRound,
            gameOver: false,
            targetScore: opts.targetScore ?? 101,
            roundNumber: 1,
            scores: Object.fromEntries(opts.players.map((p) => [p, 0])),
        };
    }

    function sumPips(tiles: SmokeTile[]): number {
        return tiles.reduce((s, t) => s + t.left + t.right, 0);
    }

    // Scenario A: 2-player clean domino-out — winner never drew, scores full opponent pips.
    {
        const players = ["smoke-p1", "smoke-p2"];
        const winner = "smoke-p1";
        const opponent = "smoke-p2";
        const winningTile: SmokeTile = { left: 3, right: 5, id: "3-5" };
        const fixture = buildScoringFixture({
            players,
            winner,
            winningTile,
            drewThisRound: [],
        });
        const opponentPips = sumPips(fixture.hands[opponent]);
        const result = engine.applyMove(JSON.stringify(fixture), winner, {
            type: "play",
            tile: { left: winningTile.left, right: winningTile.right, id: winningTile.id },
            end: "left",
        });
        assertCondition(result.success, "Clean domino-out apply must succeed", result.error);
        const scoreEvent = result.events.find((e) => e.type === "score" || e.type === "game_over");
        assertCondition(scoreEvent, "Expected score or game_over event for clean domino-out");
        assertEqual(scoreEvent!.data.reason, "domino", "Clean win reason must be 'domino'");
        assertEqual(scoreEvent!.data.score, opponentPips, "Clean win scores full opponent pips");
        logPass("clean domino-out scores full opponent pips with reason 'domino'");
    }

    // Scenario B: 2-player drawn-then-closed — winner drew earlier, scores pip difference only.
    {
        const players = ["smoke-p1", "smoke-p2"];
        const winner = "smoke-p1";
        const opponent = "smoke-p2";
        const winningTile: SmokeTile = { left: 4, right: 6, id: "4-6" };
        const fixture = buildScoringFixture({
            players,
            winner,
            winningTile,
            drewThisRound: [winner],
        });
        const opponentPips = sumPips(fixture.hands[opponent]);
        const expectedDelta = Math.max(0, opponentPips - 0); // winner hand is empty after play
        const result = engine.applyMove(JSON.stringify(fixture), winner, {
            type: "play",
            tile: { left: winningTile.left, right: winningTile.right, id: winningTile.id },
            end: "left",
        });
        assertCondition(result.success, "Drawn domino-out apply must succeed", result.error);
        const scoreEvent = result.events.find((e) => e.type === "score" || e.type === "game_over");
        assertCondition(scoreEvent, "Expected score or game_over event for drawn domino-out");
        assertEqual(scoreEvent!.data.reason, "domino_drawn", "Drawn win reason must be 'domino_drawn'");
        assertEqual(scoreEvent!.data.score, expectedDelta, "Drawn win scores pip difference (opp - winner)");
        logPass("drawn domino-out scores pip difference with reason 'domino_drawn'");
    }

    // Scenario C: 4-player team mode — drawn winner credits team via blocked-style scoring.
    {
        const players = ["smoke-t-a1", "smoke-t-b1", "smoke-t-a2", "smoke-t-b2"];
        const winner = "smoke-t-a1";
        const teammate = "smoke-t-a2";
        const winningTile: SmokeTile = { left: 2, right: 6, id: "2-6" };
        const fixture = buildScoringFixture({
            players,
            winner,
            winningTile,
            drewThisRound: [winner],
        });
        // 4p has zero boneyard; rebalance hands so all 28 tiles land in hands/board.
        const remainder = fixture.boneyard.splice(0);
        // Spread leftover tiles across opponents to keep total at 28 without growing winner hand.
        const opponents = players.filter((p) => p !== winner);
        let cursor = 0;
        for (const tile of remainder) {
            fixture.hands[opponents[cursor % opponents.length]].push(tile);
            cursor += 1;
        }
        const teamB = [players[1], players[3]];
        // Winner hand becomes empty after play, so teamA pips post-play equals teammate pips only.
        const teamApipsAfter = sumPips(fixture.hands[teammate]);
        const teamBpipsAfter = teamB.reduce((s, p) => s + sumPips(fixture.hands[p]), 0);
        const expectedTeamDelta = Math.max(0, teamBpipsAfter - teamApipsAfter);
        const result = engine.applyMove(JSON.stringify(fixture), winner, {
            type: "play",
            tile: { left: winningTile.left, right: winningTile.right, id: winningTile.id },
            end: "left",
        });
        assertCondition(result.success, "4p drawn domino-out apply must succeed", result.error);
        const scoreEvent = result.events.find((e) => e.type === "score" || e.type === "game_over");
        assertCondition(scoreEvent, "Expected score event for 4p drawn domino-out");
        assertEqual(scoreEvent!.data.reason, "domino_drawn", "4p drawn win reason must be 'domino_drawn'");
        assertEqual(scoreEvent!.data.score, expectedTeamDelta, "4p drawn win uses team pip difference");
        const newScores = scoreEvent!.data.scores as Record<string, number>;
        assertEqual(newScores[winner], expectedTeamDelta, "Winner credited team delta");
        assertEqual(newScores[teammate], expectedTeamDelta, "Teammate credited team delta");
        logPass("4p drawn domino-out uses blocked-style team scoring with reason 'domino_drawn'");
    }

    // Scenario D: round reset — drewThisRound clears when a new round begins.
    {
        const players = ["smoke-p1", "smoke-p2"];
        const winner = "smoke-p1";
        const winningTile: SmokeTile = { left: 1, right: 2, id: "1-2" };
        const fixture = buildScoringFixture({
            players,
            winner,
            winningTile,
            drewThisRound: [winner, "smoke-p2"],
            targetScore: 201, // ensure game does not end so a new round starts.
        });
        const result = engine.applyMove(JSON.stringify(fixture), winner, {
            type: "play",
            tile: { left: winningTile.left, right: winningTile.right, id: winningTile.id },
            end: "left",
        });
        assertCondition(result.success, "Round-reset apply must succeed", result.error);
        const after = JSON.parse(result.newState) as SmokeState;
        assertCondition(!after.gameOver, "Round-reset scenario should not end the game");
        assertEqual(after.roundNumber, 2, "Round number should advance");
        assertCondition(Array.isArray(after.drewThisRound), "drewThisRound must remain an array after reset");
        assertEqual(after.drewThisRound.length, 0, "drewThisRound must be empty in the new round");
        logPass("drewThisRound resets to [] on new round");
    }

    // Scenario E: hydrate sanitizes malformed drewThisRound rather than corrupting the round.
    {
        const baseState = JSON.parse(initialState) as SmokeState;
        baseState.drewThisRound = ["not-a-real-player", baseState.currentPlayer, baseState.currentPlayer];
        const validation = engine.validateMove(JSON.stringify(baseState), baseState.currentPlayer, { type: "pass" });
        // Sanitized to [currentPlayer] only → integrity passes → cannotPass fires (current player has playable tiles).
        assertCondition(!validation.valid, "Sanitized state should still validate moves");
        assertEqual(validation.errorKey, "domino.cannotPass", "Sanitized drewThisRound must reach cannotPass, not invalidState");
        const view = engine.getPlayerView(JSON.stringify(baseState), baseState.currentPlayer);
        assertCondition(view.gamePhase !== "error", "Sanitized state must produce a non-error player view");
        logPass("hydrate strips unknown ids and dedupes drewThisRound");
    }

    {
        const baseState = JSON.parse(initialState) as SmokeState;
        // @ts-expect-error intentionally non-array; hydrate must coerce to [].
        baseState.drewThisRound = "not-an-array";
        const validation = engine.validateMove(JSON.stringify(baseState), baseState.currentPlayer, { type: "pass" });
        assertCondition(!validation.valid, "Coerced state should still validate moves");
        assertEqual(validation.errorKey, "domino.cannotPass", "Non-array drewThisRound must coerce to [] then surface cannotPass");
        logPass("hydrate coerces non-array drewThisRound to empty array");
    }

    // Scenario F: legacy persisted states without drewThisRound stay playable (hydrate backfills []).
    {
        const legacyState = JSON.parse(initialState) as SmokeState & { drewThisRound?: unknown };
        delete (legacyState as { drewThisRound?: unknown }).drewThisRound;
        const validation = engine.validateMove(JSON.stringify(legacyState), legacyState.currentPlayer, { type: "pass" });
        // Legacy state with playable tiles still rejects pass via cannotPass — that proves hydrate ran past integrity.
        assertCondition(!validation.valid, "Legacy state should still validate moves");
        assertEqual(validation.errorKey, "domino.cannotPass", "Legacy state must hydrate then surface cannotPass (not invalidState)");
        const view = engine.getPlayerView(JSON.stringify(legacyState), legacyState.currentPlayer);
        assertCondition(view.gamePhase !== "error", "Legacy state must produce a non-error player view");
        logPass("legacy states without drewThisRound hydrate cleanly and remain playable");
    }

    // Scenario G: auto-draw via autoPassUnplayableTurns also marks the player in drewThisRound.
    {
        const players = ["smoke-p1", "smoke-p2"];
        const playFirst = "smoke-p1";
        const autoDrawer = "smoke-p2";
        const pool = allTiles.map((t) => ({ ...t }));
        const seed = takeTile(pool, "0-0");
        const playFirstTile = takeTile(pool, "0-1"); // plays on seed → ends become 0/1
        const playFirstSpare = takeTile(pool, "5-5"); // keeps round alive
        const autoDrawerHandTile = takeTile(pool, "6-6"); // no match for 0 or 1
        // Boneyard keeps every other tile; some match 0 or 1 so autoDrawer eventually becomes playable.
        const fixture: SmokeState = {
            board: [seed],
            leftEnd: seed.left,
            rightEnd: seed.right,
            hands: {
                [playFirst]: [playFirstTile, playFirstSpare],
                [autoDrawer]: [autoDrawerHandTile],
            },
            boneyard: pool,
            currentPlayer: playFirst,
            playerOrder: players,
            passCount: 0,
            drawsThisTurn: 0,
            drewThisRound: [],
            gameOver: false,
            targetScore: 201,
            roundNumber: 1,
            scores: { [playFirst]: 0, [autoDrawer]: 0 },
        };
        const result = engine.applyMove(JSON.stringify(fixture), playFirst, {
            type: "play",
            tile: { left: playFirstTile.left, right: playFirstTile.right, id: playFirstTile.id },
            end: "right",
        });
        assertCondition(result.success, "AutoPass-trigger play must succeed", result.error);
        const after = JSON.parse(result.newState) as SmokeState;
        const drawEvents = result.events.filter(
            (e) => e.type === "move" && (e.data as { action?: string }).action === "draw" && (e.data as { playerId?: string }).playerId === autoDrawer
        );
        assertCondition(drawEvents.length > 0, "Expected at least one auto-draw event for autoDrawer");
        assertCondition(after.drewThisRound.includes(autoDrawer), "autoDrawer must appear in drewThisRound after autoPass forced draws");
        const occurrences = after.drewThisRound.filter((p) => p === autoDrawer).length;
        assertEqual(occurrences, 1, "drewThisRound must dedupe even when autoPass draws several tiles");
        assertCondition(!after.drewThisRound.includes(playFirst), "playFirst did not draw — must stay out of drewThisRound");
        logPass("autoPass forced draws record drewThisRound (deduped)");
    }

    console.log("[smoke:domino-contract] All checks passed.");
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof SmokeScriptError && error.name === "SmokeError" ? error.details : undefined;
    console.error("[smoke:domino-contract] FAIL", message, details ?? "");
    process.exit(1);
}
