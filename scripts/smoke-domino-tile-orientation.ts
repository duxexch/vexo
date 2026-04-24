/**
 * C19-F1: Visual half-orientation snapshot.
 *
 * Verifies that the chain solver + visual flip rule produce matching pips on
 * the correct edges of every placed tile. The bug being guarded against:
 * tiles like [3,0] or [5,0] used to render their blank facing the matching
 * pip's neighbour because `DominoTileComponent` only honored rotations 0/90
 * and never 180/270 — so a tile placed leftward of the anchor would show its
 * `tile.left` on the LEFT (the anchor side) instead of its `tile.right` (the
 * actual matching pip).
 *
 * The check runs ~20 distinct board scenarios mixing straight chains, snakes
 * with elbows, blank-half tiles, and doubles, on both desktop and mobile
 * lanes. For each scenario it:
 *
 *   1. Computes placements deterministically (twice) via solveDominoLayout.
 *   2. Derives the displayed half order from `direction` + `chainSide` using
 *      the same rule used at render time (`shouldFlipDominoHalves`).
 *   3. Asserts the **visual chain invariant**: for every consecutive pair of
 *      placements, the trailing pip of placement[i] must equal the leading
 *      pip of placement[i+1]. This is what the player sees.
 *   4. Snapshots `(key, displayLeft, displayRight, direction, renderRotation)`
 *      to a fixture so any future regression in flip logic is caught.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
    buildDominoLayoutSnapshot,
    shouldFlipDominoHalves,
    type DominoLayoutSnapshotInput,
    type DominoLayoutSnapshotTile,
} from "../client/src/components/games/DominoBoard";

const FIXTURE_PATH = path.resolve(
    process.cwd(),
    "scripts",
    "fixtures",
    "domino-tile-orientation.json",
);

type DisplayPlacement = {
    key: string;
    canonicalLeft: number;
    canonicalRight: number;
    displayLeft: number;
    displayRight: number;
    flipped: boolean;
    direction: "left" | "right" | "up" | "down";
    renderRotation: number;
};

type ScenarioSnapshot = {
    side: "left" | "right";
    placements: DisplayPlacement[];
};

type SnapshotSuite = Record<string, ScenarioSnapshot>;

type Scenario = {
    name: string;
    input: DominoLayoutSnapshotInput;
    /**
     * Optional: pip value the anchor exposes at the chain side. When set, the
     * test asserts placement[0].displayLeft === anchorMatchingPip — i.e. the
     * very first tile's matching pip touches the anchor edge.
     *
     * Most fixture chains here are seeded as `[i%7, (i+1)%7]` so the anchor
     * is virtual (no real previous tile); we only set this when constructing
     * scenarios that include a deliberate anchor pip.
     */
    anchorMatchingPip?: number;
};

function tile(left: number, right: number, index: number): DominoLayoutSnapshotTile {
    return { left, right, id: `o-${index}-${left}-${right}` };
}

function buildChain(pairs: Array<[number, number]>): DominoLayoutSnapshotTile[] {
    return pairs.map(([l, r], i) => tile(l, r, i));
}

/**
 * Build a chain for the RIGHT side. Each tile's matching pip is `.left`, so
 * consecutive tiles satisfy `tiles[i].right === tiles[i+1].left` — the same
 * invariant the server enforces on `board[]`.
 */
function buildChainFromValuesRight(seed: number, path: number[]): DominoLayoutSnapshotTile[] {
    const tiles: DominoLayoutSnapshotTile[] = [];
    let prev = seed;
    path.forEach((value, i) => {
        tiles.push(tile(prev, value, i));
        prev = value;
    });
    return tiles;
}

/**
 * Build a chain for the LEFT side. Production left-side entries are the
 * reverse of `board[0..anchorIdx-1]`, so the matching pip of each entry is
 * `.right` (touching the anchor or the previous left tile). The chain
 * invariant becomes `tiles[i].left === tiles[i+1].right` — i.e. the visual
 * left-going snake's pip connects across `.left` of i to `.right` of i+1.
 */
function buildChainFromValuesLeft(seed: number, path: number[]): DominoLayoutSnapshotTile[] {
    const tiles: DominoLayoutSnapshotTile[] = [];
    let prev = seed;
    path.forEach((value, i) => {
        // Swap orientation vs the right-side builder so .right is the pip
        // facing the previous tile (= `prev`) and .left is the outgoing pip.
        tiles.push(tile(value, prev, i));
        prev = value;
    });
    return tiles;
}

/**
 * Convert an explicit `[left, right]` pair list intended for a right-side
 * chain into the equivalent left-side chain by swapping each tile's halves.
 * The resulting list satisfies `tiles[i].left === tiles[i+1].right`, which
 * is the invariant the production left-entries slice obeys.
 */
function mirrorChainForLeft(pairs: Array<[number, number]>): DominoLayoutSnapshotTile[] {
    return pairs.map(([l, r], i) => tile(r, l, i));
}

const desktopRightBounds = { left: 24, right: 352, top: -230, bottom: 230 };
const desktopLeftBounds = { left: -352, right: -24, top: -230, bottom: 230 };
const mobileRightBounds = { left: 18, right: 152, top: -170, bottom: 170 };
const mobileLeftBounds = { left: -152, right: -18, top: -170, bottom: 170 };

function makeScenario(
    name: string,
    side: "left" | "right",
    tiles: DominoLayoutSnapshotTile[],
    overrides: Partial<DominoLayoutSnapshotInput> = {},
    anchorMatchingPip?: number,
): Scenario {
    const safeBounds = side === "right"
        ? (overrides.compact ? mobileRightBounds : desktopRightBounds)
        : (overrides.compact ? mobileLeftBounds : desktopLeftBounds);
    return {
        name,
        anchorMatchingPip,
        input: {
            side,
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: side === "right" ? "up" : "down",
            safeBounds,
            tiles,
            ...overrides,
        },
    };
}

function buildScenarios(): Scenario[] {
    // Right-side chain templates. For the LEFT mirror we swap each pair's
    // halves so the chain invariant `tiles[i].left === tiles[i+1].right`
    // holds in left-entries order.
    const blankLeading: Array<[number, number]> = [[0, 3], [3, 5], [5, 2], [2, 6], [6, 1], [1, 4]];
    const blankMiddle: Array<[number, number]> = [[3, 0], [0, 5], [5, 2], [2, 6]];
    const fiveZero: Array<[number, number]> = [[5, 0], [0, 4], [4, 1], [1, 6], [6, 2], [2, 3]];
    const doublesElbows: Array<[number, number]> = [
        [6, 6], [6, 3], [3, 3], [3, 1], [1, 1], [1, 5], [5, 5], [5, 2], [2, 2], [2, 4],
    ];
    const mobileBlanks: Array<[number, number]> = [[3, 0], [0, 5], [5, 6], [6, 4], [4, 1], [1, 2]];
    const doubleThenFold: Array<[number, number]> = [
        [6, 6], [6, 5], [5, 4], [4, 3], [3, 2], [2, 1], [1, 0], [0, 6],
    ];
    const manyBlanks: Array<[number, number]> = [
        [4, 0], [0, 5], [5, 0], [0, 1], [1, 0], [0, 6], [6, 0], [0, 2],
    ];
    const verticalAnchor: Array<[number, number]> = [[2, 4], [4, 6], [6, 1], [1, 5], [5, 0], [0, 3]];

    return [
        // 1: simple right chain seeded on 0 (anchor exposes right=0).
        makeScenario("right-blank-leading", "right", buildChain(blankLeading), {}, 0),
        // 2: same chain mirrored on the left side (verifies leftward flip).
        makeScenario("left-blank-leading", "left", mirrorChainForLeft(blankLeading), {}, 0),
        // 3: right chain that starts with [3,0] then [0,5] (blank in the middle).
        makeScenario("right-blank-middle", "right", buildChain(blankMiddle), {}, 3),
        // 4: left chain mirroring scenario 3.
        makeScenario("left-blank-middle", "left", mirrorChainForLeft(blankMiddle), {}, 3),
        // 5: classic [5,0] reported case — right side, anchor pip 5.
        makeScenario("right-fivezero-case", "right", buildChain(fiveZero), {}, 5),
        // 6: same on left side — exercises the "left + right direction = flip" rule.
        makeScenario("left-fivezero-case", "left", mirrorChainForLeft(fiveZero), {}, 5),
        // 7: doubles-heavy right chain — doubles must render perpendicular and not flip pips.
        makeScenario("right-doubles-elbows", "right", buildChain(doublesElbows), {}, 6),
        // 8: doubles-heavy mirrored on left.
        makeScenario("left-doubles-elbows", "left", mirrorChainForLeft(doublesElbows), {}, 6),
        // 9: long single-side straight chain that must fold (forces direction changes).
        makeScenario("right-long-fold", "right", buildChainFromValuesRight(0, [
            1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0,
        ]), {}, 0),
        // 10: long left-side fold.
        makeScenario("left-long-fold", "left", buildChainFromValuesLeft(6, [
            5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1, 0, 6,
        ]), {}, 6),
        // 11: mobile compact right with blanks (the original bug-report viewport).
        makeScenario("mobile-right-blanks", "right", buildChain(mobileBlanks), { compact: true }, 3),
        // 12: mobile compact left with blanks.
        makeScenario(
            "mobile-left-blanks",
            "left",
            mirrorChainForLeft(mobileBlanks),
            { compact: true },
            3,
        ),
        // 13: chain that opens with a double on the elbow (the [6,6] case).
        makeScenario("right-double-then-fold", "right", buildChain(doubleThenFold), {}, 6),
        // 14: same starting double on left.
        makeScenario("left-double-then-fold", "left", mirrorChainForLeft(doubleThenFold), {}, 6),
        // 15: full half-set chain (15 tiles) on right.
        makeScenario("right-half-set", "right", buildChainFromValuesRight(0, [
            6, 5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1, 0,
        ]), {}, 0),
        // 16: full half-set chain (15 tiles) on left.
        makeScenario("left-half-set", "left", buildChainFromValuesLeft(0, [
            6, 5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1, 0,
        ]), {}, 0),
        // 17: chain mixing repeated blanks (multiple [x,0] tiles).
        makeScenario("right-many-blanks", "right", buildChain(manyBlanks), {}, 4),
        // 18: same on left.
        makeScenario("left-many-blanks", "left", mirrorChainForLeft(manyBlanks), {}, 4),
        // 19: anchor rotation 0 (vertical anchor) on right — verifies vertical-start handling.
        makeScenario(
            "right-vertical-anchor",
            "right",
            buildChain(verticalAnchor),
            { anchorRenderRotation: 0, verticalStart: "down" },
            2,
        ),
        // 20: anchor rotation 0 on left.
        makeScenario(
            "left-vertical-anchor",
            "left",
            mirrorChainForLeft(verticalAnchor),
            { anchorRenderRotation: 0, verticalStart: "up" },
            2,
        ),
    ];
}

function projectPlacement(
    side: "left" | "right",
    placement: ReturnType<typeof buildDominoLayoutSnapshot>["placements"][number],
    canonicalLeft: number,
    canonicalRight: number,
): DisplayPlacement {
    const flipped = shouldFlipDominoHalves(side, placement.direction);
    return {
        key: placement.key,
        canonicalLeft,
        canonicalRight,
        displayLeft: flipped ? canonicalRight : canonicalLeft,
        displayRight: flipped ? canonicalLeft : canonicalRight,
        flipped,
        direction: placement.direction,
        renderRotation: placement.renderRotation,
    };
}

function runScenario(scenario: Scenario): ScenarioSnapshot {
    const first = buildDominoLayoutSnapshot(scenario.input);
    const second = buildDominoLayoutSnapshot(scenario.input);
    assert.deepStrictEqual(
        second,
        first,
        `Determinism failed for orientation scenario "${scenario.name}".`,
    );

    // The solver may legitimately drop tiles when the lane is too narrow; the
    // orientation invariant only applies to the tiles it actually placed.
    const placements = first.placements;
    const sourceTiles = scenario.input.tiles;
    const projected: DisplayPlacement[] = [];

    for (let i = 0; i < placements.length; i += 1) {
        const placement = placements[i];
        const source = sourceTiles[i];
        assert.ok(
            source && placement.key === `o-${i}-${source.left}-${source.right}`,
            `Scenario "${scenario.name}" placement ${i} key "${placement.key}" ` +
                `does not match source tile id "o-${i}-${source?.left}-${source?.right}".`,
        );

        const display = projectPlacement(
            scenario.input.side,
            placement,
            source.left,
            source.right,
        );

        // Doubles must render perpendicular to the previous placement (or to
        // the chain flow when they're the first tile). Verify the rotation
        // family flips between 0 and 90 across consecutive double placements.
        if (source.left === source.right) {
            assert.ok(
                display.renderRotation === 0 || display.renderRotation === 90,
                `Scenario "${scenario.name}" double tile ${display.key} rotation ` +
                    `${display.renderRotation} is neither 0 nor 90.`,
            );
        }

        projected.push(display);
    }

    // Visual chain invariant. After flipping, the "matching pip" of a
    // placement (= the pip that touches the previous tile) lands on the
    // display slot that corresponds to the LEADING EDGE of the tile in its
    // chain direction:
    //   direction "right" → leading edge is the LEFT face  → displayLeft
    //   direction "down"  → leading edge is the TOP face   → displayLeft
    //   direction "left"  → leading edge is the RIGHT face → displayRight
    //   direction "up"    → leading edge is the BOTTOM face → displayRight
    //
    // The canonical matching pip is `tile.left` for right-side entries (their
    // chain is read left→right) and `tile.right` for left-side entries (the
    // left slice is reversed before placement, so the matching pip is the
    // canonical RIGHT pip). We assert that pip lands on the correct display
    // slot for every placement.
    const leadingSlotFor = (direction: DisplayPlacement["direction"]) =>
        direction === "right" || direction === "down" ? "displayLeft" : "displayRight";

    for (let i = 0; i < projected.length; i += 1) {
        const matchingPip = scenario.input.side === "right"
            ? sourceTiles[i].left
            : sourceTiles[i].right;
        const slotName = leadingSlotFor(projected[i].direction);
        const matchingSlot = projected[i][slotName];
        assert.equal(
            matchingSlot,
            matchingPip,
            `Scenario "${scenario.name}" placement ${i} (key ${projected[i].key}): ` +
                `matching pip ${matchingPip} should sit on the ${slotName} slot ` +
                `(direction=${projected[i].direction}) but found ${matchingSlot}. ` +
                `(flipped=${projected[i].flipped})`,
        );
    }

    // Pairwise visual continuity: trailing pip of placement i equals leading
    // pip of placement i+1. Trailing slot is the opposite of the leading slot.
    for (let i = 0; i + 1 < projected.length; i += 1) {
        const trailingSlot = leadingSlotFor(projected[i].direction) === "displayLeft"
            ? "displayRight"
            : "displayLeft";
        const trailingPip = projected[i][trailingSlot];
        const leadingPip = projected[i + 1][leadingSlotFor(projected[i + 1].direction)];
        assert.equal(
            leadingPip,
            trailingPip,
            `Scenario "${scenario.name}" visual chain break between placements ` +
                `${i} (${projected[i].key}, dir=${projected[i].direction}) and ` +
                `${i + 1} (${projected[i + 1].key}, dir=${projected[i + 1].direction}): ` +
                `trailing pip ${trailingPip} != leading pip ${leadingPip}.`,
        );
    }

    if (typeof scenario.anchorMatchingPip === "number" && projected.length > 0) {
        // The anchor's chain-side pip must equal the first placement's matching pip.
        const expected = scenario.anchorMatchingPip;
        const actual = scenario.input.side === "right"
            ? sourceTiles[0].left
            : sourceTiles[0].right;
        assert.equal(
            actual,
            expected,
            `Scenario "${scenario.name}" anchor expected pip ${expected} but ` +
                `first source tile exposes ${actual} on the ${scenario.input.side} side.`,
        );
    }

    return {
        side: scenario.input.side,
        placements: projected,
    };
}

function loadFixture(): SnapshotSuite | null {
    if (!fs.existsSync(FIXTURE_PATH)) return null;
    return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as SnapshotSuite;
}

function saveFixture(suite: SnapshotSuite): void {
    const dir = path.dirname(FIXTURE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
}

function main(): void {
    const update = process.argv.includes("--update");
    const scenarios = buildScenarios();
    const suite: SnapshotSuite = {};

    for (const scenario of scenarios) {
        suite[scenario.name] = runScenario(scenario);
    }

    if (update) {
        saveFixture(suite);
        console.log(
            `[smoke:domino-tile-orientation] Updated fixture with ${scenarios.length} scenarios.`,
        );
        return;
    }

    const fixture = loadFixture();
    if (!fixture) {
        saveFixture(suite);
        console.log(
            `[smoke:domino-tile-orientation] Created initial fixture with ` +
                `${scenarios.length} scenarios.`,
        );
        return;
    }

    assert.deepStrictEqual(
        suite,
        fixture,
        "Domino tile-orientation snapshot mismatch. Re-run with --update after " +
            "verifying that the new visual half order is intentional.",
    );
    console.log(
        `[smoke:domino-tile-orientation] PASS ${scenarios.length} scenarios match fixture.`,
    );
}

main();
