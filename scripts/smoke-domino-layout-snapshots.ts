import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
    buildDominoLayoutSnapshot,
    hashDominoLayoutTiles,
    type DominoLayoutSnapshotInput,
    type DominoLayoutSnapshotTile,
} from "../client/src/components/games/DominoBoard";

type ScenarioSnapshot = ReturnType<typeof buildDominoLayoutSnapshot> & { layoutHash: string };
type SnapshotSuite = Record<string, ScenarioSnapshot>;

const FIXTURE_PATH = path.resolve(process.cwd(), "scripts", "fixtures", "domino-layout-snapshots.json");

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

function buildHeavyDoublesTiles(length: number): DominoLayoutSnapshotTile[] {
    return Array.from({ length }, (_, index) => {
        if (index % 3 === 0) {
            const value = index % 7;
            return createTile(value, value, index);
        }

        const left = (index * 2) % 7;
        const right = (index * 3 + 1) % 7;
        return createTile(left, right, index);
    });
}

function buildZigZagTiles(length: number): DominoLayoutSnapshotTile[] {
    return Array.from({ length }, (_, index) => {
        const left = index % 2 === 0 ? (index % 7) : ((index + 4) % 7);
        const right = index % 2 === 0 ? ((index + 3) % 7) : ((index + 1) % 7);
        return createTile(left, right, index);
    });
}

function buildStressTiles(length: number): DominoLayoutSnapshotTile[] {
    let seed = 20260422;
    const next = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed;
    };

    return Array.from({ length }, (_, index) => {
        const left = next() % 7;
        const right = next() % 7;
        return createTile(left, right, index);
    });
}

async function runScenario(name: string, input: DominoLayoutSnapshotInput): Promise<ScenarioSnapshot> {
    const first = buildDominoLayoutSnapshot(input);
    const second = buildDominoLayoutSnapshot(input);
    assert.deepStrictEqual(second, first, `Determinism failed for scenario ${name}`);

    const firstHash = await hashDominoLayoutTiles(first.placements);
    const secondHash = await hashDominoLayoutTiles(second.placements);
    assert.equal(secondHash, firstHash, `Hash determinism failed for scenario ${name}`);

    return {
        ...first,
        layoutHash: firstHash,
    };
}

// Per-scenario invariants. Used to catch regressions that a hash-only
// snapshot test cannot, e.g. a solver that silently returns empty
// placements while keeping its output deterministic.
type ScenarioInvariants = {
    safeBounds: { left: number; right: number; top: number; bottom: number };
    compact: boolean;
    // Minimum tiles that must be placed. For realistic scenarios this is the
    // full chain length; for long/stress scenarios it's a degradation floor.
    minPlaced: number;
    // Minimum scale the layout must use. Guards against the solver shrinking
    // tiles all the way down for chains that should still be readable.
    minScale: number;
    // Minimum number of direction changes (elbows) we expect. Verifies the
    // chain actually folds into a snake instead of a long straight line that
    // overflows the lane.
    minFolds: number;
};

const SCENARIO_INVARIANTS: Record<string, ScenarioInvariants> = {};

async function buildSuite(): Promise<SnapshotSuite> {
    const desktopLeftBounds = { left: -352, right: -24, top: -230, bottom: 230 };
    const desktopRightBounds = { left: 24, right: 352, top: -230, bottom: 230 };
    const mobileRightBounds = { left: 18, right: 152, top: -170, bottom: 170 };

    const register = (
        name: string,
        invariants: ScenarioInvariants,
    ): ScenarioInvariants => {
        SCENARIO_INVARIANTS[name] = invariants;
        return invariants;
    };

    return {
        // Realistic single-hand chain (~14 tiles) — must lay out completely.
        "desktop-straight-right": await runScenario("desktop-straight-right", {
            side: "right",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "up",
            safeBounds: register("desktop-straight-right", {
                safeBounds: desktopRightBounds,
                compact: false,
                minPlaced: 14,
                minScale: 0.7,
                minFolds: 1,
            }).safeBounds,
            tiles: buildStraightTiles(14),
        }),
        // Realistic full two-hand chain (~20 tiles) on left side.
        "desktop-realistic-left": await runScenario("desktop-realistic-left", {
            side: "left",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: register("desktop-realistic-left", {
                safeBounds: desktopLeftBounds,
                compact: false,
                minPlaced: 20,
                minScale: 0.65,
                minFolds: 2,
            }).safeBounds,
            tiles: buildHeavyDoublesTiles(20),
        }),
        // Long chain (28 tiles). The solver should fold the chain enough to
        // place a substantial portion at a readable scale instead of giving
        // up. Allows partial placement when the lane truly cannot fit all 28.
        "desktop-long-right": await runScenario("desktop-long-right", {
            side: "right",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "up",
            safeBounds: register("desktop-long-right", {
                safeBounds: desktopRightBounds,
                compact: false,
                minPlaced: 18,
                minScale: 0.55,
                minFolds: 2,
            }).safeBounds,
            tiles: buildStraightTiles(28),
        }),
        // Compact mobile lane — full hand should still fit with folding.
        "mobile-realistic-right": await runScenario("mobile-realistic-right", {
            side: "right",
            compact: true,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: register("mobile-realistic-right", {
                safeBounds: mobileRightBounds,
                compact: true,
                minPlaced: 10,
                minScale: 0.55,
                minFolds: 1,
            }).safeBounds,
            tiles: buildZigZagTiles(10),
        }),
        // Stress scenarios — verify the solver degrades deterministically when
        // chain length is genuinely beyond what the lane can hold.
        "desktop-heavy-doubles-right": await runScenario("desktop-heavy-doubles-right", {
            side: "right",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: register("desktop-heavy-doubles-right", {
                safeBounds: desktopRightBounds,
                compact: false,
                minPlaced: 0,
                minScale: 0.38,
                minFolds: 0,
            }).safeBounds,
            tiles: buildHeavyDoublesTiles(52),
        }),
        "desktop-zigzag-left": await runScenario("desktop-zigzag-left", {
            side: "left",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "up",
            safeBounds: register("desktop-zigzag-left", {
                safeBounds: desktopLeftBounds,
                compact: false,
                minPlaced: 0,
                minScale: 0.38,
                minFolds: 0,
            }).safeBounds,
            tiles: buildZigZagTiles(64),
        }),
        "mobile-stress-right": await runScenario("mobile-stress-right", {
            side: "right",
            compact: true,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: register("mobile-stress-right", {
                safeBounds: mobileRightBounds,
                compact: true,
                minPlaced: 0,
                minScale: 0.38,
                minFolds: 0,
            }).safeBounds,
            tiles: buildStressTiles(220),
        }),
    };
}

// Approximate per-tile half-width/half-height matching DominoBoard's
// getTileFootprint defaults (mirrored here so the test stays self-contained).
function getApproximateHalfFootprint(
    rotation: number,
    compact: boolean,
    layoutScale: number,
): { halfWidth: number; halfHeight: number } {
    const longSide = (compact ? 56 : 80) * layoutScale;
    const shortSide = (compact ? 28 : 40) * layoutScale;
    const normalized = ((rotation % 360) + 360) % 360;
    const sideways = normalized === 90 || normalized === 270;
    return sideways
        ? { halfWidth: longSide / 2, halfHeight: shortSide / 2 }
        : { halfWidth: shortSide / 2, halfHeight: longSide / 2 };
}

function countDirectionChanges(
    placements: ScenarioSnapshot["placements"],
): number {
    if (placements.length < 2) return 0;
    let folds = 0;
    let lastDirection: "horizontal" | "vertical" | null = null;
    let prevX = 0;
    let prevY = 0;
    for (const p of placements) {
        const dx = p.x - prevX;
        const dy = p.y - prevY;
        const direction: "horizontal" | "vertical" = Math.abs(dx) >= Math.abs(dy)
            ? "horizontal"
            : "vertical";
        if (lastDirection !== null && direction !== lastDirection) {
            folds += 1;
        }
        lastDirection = direction;
        prevX = p.x;
        prevY = p.y;
    }
    return folds;
}

function assertScenarioInvariants(suite: SnapshotSuite) {
    for (const [name, snapshot] of Object.entries(suite)) {
        const inv = SCENARIO_INVARIANTS[name];
        if (!inv) {
            throw new Error(`Missing invariants for scenario ${name}`);
        }
        const placedCount = snapshot.placements.length;

        assert.ok(
            placedCount >= inv.minPlaced,
            `Scenario "${name}" placed ${placedCount} tiles, expected >= ${inv.minPlaced}.`,
        );
        assert.ok(
            snapshot.layoutScale >= inv.minScale - 1e-6,
            `Scenario "${name}" used scale ${snapshot.layoutScale}, expected >= ${inv.minScale}.`,
        );
        const folds = countDirectionChanges(snapshot.placements);
        assert.ok(
            folds >= inv.minFolds,
            `Scenario "${name}" folded ${folds} times, expected >= ${inv.minFolds}.`,
        );
        // Every placed tile must lie within the safe bounds — guards against
        // any future overflow regression where tiles silently render off-lane.
        for (const placement of snapshot.placements) {
            const fp = getApproximateHalfFootprint(
                placement.renderRotation,
                inv.compact,
                placement.layoutScale,
            );
            const tileEpsilon = 1.5;
            assert.ok(
                placement.x - fp.halfWidth >= inv.safeBounds.left - tileEpsilon &&
                    placement.x + fp.halfWidth <= inv.safeBounds.right + tileEpsilon &&
                    placement.y - fp.halfHeight >= inv.safeBounds.top - tileEpsilon &&
                    placement.y + fp.halfHeight <= inv.safeBounds.bottom + tileEpsilon,
                `Scenario "${name}" placed tile out of safe bounds at (${placement.x}, ${placement.y}).`,
            );
        }
    }
}

function loadFixture(): SnapshotSuite {
    if (!fs.existsSync(FIXTURE_PATH)) {
        throw new Error(`Missing snapshot fixture: ${FIXTURE_PATH}`);
    }

    return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as SnapshotSuite;
}

function saveFixture(suite: SnapshotSuite) {
    const dir = path.dirname(FIXTURE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
}

async function main() {
    const update = process.argv.includes("--update");
    const suite = await buildSuite();

    // Always check the realistic-scenario invariant — even when updating the
    // fixture — so we never freeze in a regressed state.
    assertScenarioInvariants(suite);

    if (update) {
        saveFixture(suite);
        console.log("[smoke:domino-layout-snapshots] Updated snapshot fixture.");
        return;
    }

    const fixture = loadFixture();
    assert.deepStrictEqual(
        suite,
        fixture,
        "Domino layout snapshot mismatch. Run `npm run quality:smoke:domino-layout-snapshots:update` after reviewing intended changes.",
    );

    console.log("[smoke:domino-layout-snapshots] PASS deterministic snapshots match fixture.");
}

void main();
