import assert from "node:assert/strict";

import {
    buildDominoLayoutSnapshot,
    type DominoLayoutSnapshotInput,
    type DominoLayoutSnapshotOutput,
    type DominoLayoutSnapshotTile,
    type DominoRect,
} from "../client/src/components/games/DominoBoard";

type ElbowDirection = "up" | "down";

function createTile(left: number, right: number, index: number): DominoLayoutSnapshotTile {
    return {
        left,
        right,
        id: `tile-${index}-${left}-${right}`,
    };
}

function buildStraightTiles(length: number): DominoLayoutSnapshotTile[] {
    return Array.from({ length }, (_, index) => {
        const left = index % 7;
        const right = (index + 1) % 7;
        return createTile(left, right, index);
    });
}

function findFirstVerticalDirection(
    snapshot: DominoLayoutSnapshotOutput,
): ElbowDirection | null {
    for (const placement of snapshot.placements) {
        if (placement.direction === "up" || placement.direction === "down") {
            return placement.direction;
        }
    }
    return null;
}

function runMirrorScenario(
    label: string,
    options: {
        side: "left" | "right";
        verticalStart: "up" | "down";
        compact: boolean;
        anchorRenderRotation: number;
        safeBounds: DominoRect;
        tiles: DominoLayoutSnapshotTile[];
    },
): { snapshot: DominoLayoutSnapshotOutput; firstVertical: ElbowDirection } {
    const input: DominoLayoutSnapshotInput = {
        side: options.side,
        compact: options.compact,
        anchorRenderRotation: options.anchorRenderRotation,
        verticalStart: options.verticalStart,
        safeBounds: options.safeBounds,
        tiles: options.tiles,
    };

    const snapshot = buildDominoLayoutSnapshot(input);

    assert.ok(
        snapshot.placements.length >= 2,
        `[${label}] expected the snake fold scenario to place >=2 tiles, got ${snapshot.placements.length}.`,
    );

    const firstVertical = findFirstVerticalDirection(snapshot);
    assert.ok(
        firstVertical !== null,
        `[${label}] expected the chain to perform at least one vertical elbow ` +
            `(direction "up" or "down"). Without an elbow this test is vacuous and ` +
            `cannot detect the per-side mirror regression.`,
    );

    return { snapshot, firstVertical: firstVertical as ElbowDirection };
}

function assertOppositeElbow(
    scenarioLabel: string,
    rightFirstVertical: ElbowDirection,
    leftFirstVertical: ElbowDirection,
): void {
    assert.notEqual(
        leftFirstVertical,
        rightFirstVertical,
        `[${scenarioLabel}] the left and right halves elbowed in the SAME ` +
            `vertical direction ("${leftFirstVertical}"). The per-side mirror in ` +
            `getAdaptiveDirectionPriority is missing — both halves will eventually ` +
            `snake back into each other and collide (regression of #86).`,
    );

    const expectedPair = new Set<ElbowDirection>(["up", "down"]);
    const actualPair = new Set<ElbowDirection>([rightFirstVertical, leftFirstVertical]);
    assert.deepStrictEqual(
        actualPair,
        expectedPair,
        `[${scenarioLabel}] expected the two halves to elbow into opposite ` +
            `verticals (one "up", one "down"). Got right="${rightFirstVertical}", ` +
            `left="${leftFirstVertical}".`,
    );
}

function main(): void {
    const desktopRightBounds: DominoRect = { left: 24, right: 352, top: -230, bottom: 230 };
    const desktopLeftBounds: DominoRect = { left: -352, right: -24, top: -230, bottom: 230 };
    const tiles = buildStraightTiles(14);

    // Scenario A — both halves receive verticalStart="up".
    // Expected: side="right" elbows up (its preferred vertical),
    //           side="left"  elbows down (mirror of preferred vertical).
    {
        const right = runMirrorScenario("verticalStart=up | side=right", {
            side: "right",
            verticalStart: "up",
            compact: false,
            anchorRenderRotation: 90,
            safeBounds: desktopRightBounds,
            tiles,
        });
        const left = runMirrorScenario("verticalStart=up | side=left", {
            side: "left",
            verticalStart: "up",
            compact: false,
            anchorRenderRotation: 90,
            safeBounds: desktopLeftBounds,
            tiles,
        });

        assertOppositeElbow(
            "verticalStart=up",
            right.firstVertical,
            left.firstVertical,
        );
        assert.equal(
            right.firstVertical,
            "up",
            `[verticalStart=up | side=right] expected the right half to honor ` +
                `verticalStart="up" directly, got "${right.firstVertical}".`,
        );
        assert.equal(
            left.firstVertical,
            "down",
            `[verticalStart=up | side=left] expected the left half to mirror ` +
                `verticalStart="up" into "down", got "${left.firstVertical}".`,
        );

        console.log(
            `[smoke:domino-elbow-mirror] PASS verticalStart=up: right elbow=` +
                `${right.firstVertical}, left elbow=${left.firstVertical}`,
        );
    }

    // Scenario B — both halves receive verticalStart="down".
    // Expected: side="right" elbows down (its preferred vertical),
    //           side="left"  elbows up   (mirror of preferred vertical).
    {
        const right = runMirrorScenario("verticalStart=down | side=right", {
            side: "right",
            verticalStart: "down",
            compact: false,
            anchorRenderRotation: 90,
            safeBounds: desktopRightBounds,
            tiles,
        });
        const left = runMirrorScenario("verticalStart=down | side=left", {
            side: "left",
            verticalStart: "down",
            compact: false,
            anchorRenderRotation: 90,
            safeBounds: desktopLeftBounds,
            tiles,
        });

        assertOppositeElbow(
            "verticalStart=down",
            right.firstVertical,
            left.firstVertical,
        );
        assert.equal(
            right.firstVertical,
            "down",
            `[verticalStart=down | side=right] expected the right half to honor ` +
                `verticalStart="down" directly, got "${right.firstVertical}".`,
        );
        assert.equal(
            left.firstVertical,
            "up",
            `[verticalStart=down | side=left] expected the left half to mirror ` +
                `verticalStart="down" into "up", got "${left.firstVertical}".`,
        );

        console.log(
            `[smoke:domino-elbow-mirror] PASS verticalStart=down: right elbow=` +
                `${right.firstVertical}, left elbow=${left.firstVertical}`,
        );
    }

    console.log(
        "[smoke:domino-elbow-mirror] PASS the two halves always elbow into " +
            "opposite verticals — per-side mirror in getAdaptiveDirectionPriority " +
            "is preserved.",
    );
}

main();
