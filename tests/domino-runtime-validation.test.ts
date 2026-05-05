import { describe, expect, it } from "vitest";
import { dominoEngine } from "../server/game-engines/domino/engine";

type DominoState = {
    board: Array<{ left: number; right: number; id: string }>;
    leftEnd: number;
    rightEnd: number;
    hands: Record<string, Array<{ left: number; right: number; id: string }>>;
    boneyard: Array<{ left: number; right: number; id: string }>;
    currentPlayer: string;
    playerOrder: string[];
    passCount: number;
    drawsThisTurn: number;
    drewThisRound: string[];
    gameOver: boolean;
    targetScore: number;
    roundNumber: number;
    scores: Record<string, number>;
    anchorTileId?: string;
};

function buildInitialState(playerIds: string[]) {
    return JSON.parse(dominoEngine.initializeWithPlayers(playerIds)) as DominoState;
}

describe("domino runtime validation", () => {
    it("rejects tampered state with duplicate tiles across collections", () => {
        const state = buildInitialState(["p1", "p2"]);
        const duplicateTile = state.hands.p1[0];
        state.board.push(duplicateTile);

        const result = dominoEngine.validateMove(JSON.stringify(state), "p1", { type: "pass" });

        expect(result.valid).toBe(false);
        expect(result.errorKey).toBe("domino.invalidState");
        expect(result.error).toContain("Invalid game state integrity");
    });

    it("rejects a broken board chain even if the state is otherwise well formed", () => {
        const state = buildInitialState(["p1", "p2"]);
        state.board = [
            { left: 6, right: 6, id: "6-6" },
            { left: 1, right: 2, id: "1-2" },
        ];
        state.leftEnd = 6;
        state.rightEnd = 2;
        state.anchorTileId = "6-6";

        const result = dominoEngine.getGameStatus(JSON.stringify(state));

        expect(result.isOver).toBe(false);
        expect(result.reason).toBe("invalid_state");
    });

    it("rejects a move that is valid-shaped but not actually in the player's hand", () => {
        const state = buildInitialState(["p1", "p2"]);
        const playerTile = state.hands.p1[0];
        const forgedTile = { left: playerTile.left, right: playerTile.right, id: "forged-id" };

        const validation = dominoEngine.validateMove(JSON.stringify(state), "p1", {
            type: "play",
            tile: forgedTile,
            end: "left",
        });

        expect(validation.valid).toBe(false);
        expect(validation.errorKey).toBe("domino.tileNotInHand");
    });

    it("applies only legal moves and preserves board integrity after a real play", () => {
        const state = buildInitialState(["p1", "p2"]);
        const currentPlayer = state.currentPlayer;
        const tile = state.hands[currentPlayer][0];

        const validation = dominoEngine.validateMove(JSON.stringify(state), currentPlayer, {
            type: "play",
            tile,
            end: "left",
        });

        expect(validation.valid).toBe(true);

        const applied = dominoEngine.applyMove(JSON.stringify(state), currentPlayer, {
            type: "play",
            tile,
            end: "left",
        });

        expect(applied.success).toBe(true);

        const nextState = JSON.parse(applied.newState) as typeof state;
        expect(nextState.board.length).toBe(1);
        expect(nextState.leftEnd).toBe(nextState.board[0].left);
        expect(nextState.rightEnd).toBe(nextState.board[0].right);
        expect(nextState.board[0].id).toBe(nextState.anchorTileId);
    });
});
