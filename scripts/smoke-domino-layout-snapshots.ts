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

// Realistic-game scenarios MUST place all tiles. Stress scenarios are
// allowed to degrade gracefully (some tiles dropped) but still must remain
// deterministic. This guards against silent regressions where the solver
// returns an empty layout that still hashes consistently.
const REALISTIC_SCENARIOS = new Set<string>([
    "desktop-straight-right",
    "desktop-realistic-left",
    "mobile-realistic-right",
]);

async function buildSuite(): Promise<SnapshotSuite> {
    const desktopLeftBounds = { left: -352, right: -24, top: -230, bottom: 230 };
    const desktopRightBounds = { left: 24, right: 352, top: -230, bottom: 230 };
    const mobileRightBounds = { left: 18, right: 152, top: -170, bottom: 170 };

    return {
        // Realistic single-hand chain (~14 tiles) — must lay out completely.
        "desktop-straight-right": await runScenario("desktop-straight-right", {
            side: "right",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "up",
            safeBounds: desktopRightBounds,
            tiles: buildStraightTiles(14),
        }),
        // Realistic full two-hand chain (~20 tiles) on left side.
        "desktop-realistic-left": await runScenario("desktop-realistic-left", {
            side: "left",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: desktopLeftBounds,
            tiles: buildHeavyDoublesTiles(20),
        }),
        // Compact mobile lane — full hand should still fit with folding.
        "mobile-realistic-right": await runScenario("mobile-realistic-right", {
            side: "right",
            compact: true,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: mobileRightBounds,
            tiles: buildZigZagTiles(10),
        }),
        // Stress scenarios — verify the solver degrades deterministically when
        // chain length is genuinely beyond what the lane can hold.
        "desktop-heavy-doubles-right": await runScenario("desktop-heavy-doubles-right", {
            side: "right",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: desktopRightBounds,
            tiles: buildHeavyDoublesTiles(52),
        }),
        "desktop-zigzag-left": await runScenario("desktop-zigzag-left", {
            side: "left",
            compact: false,
            anchorRenderRotation: 90,
            verticalStart: "up",
            safeBounds: desktopLeftBounds,
            tiles: buildZigZagTiles(64),
        }),
        "mobile-stress-right": await runScenario("mobile-stress-right", {
            side: "right",
            compact: true,
            anchorRenderRotation: 90,
            verticalStart: "down",
            safeBounds: mobileRightBounds,
            tiles: buildStressTiles(220),
        }),
    };
}

function assertRealisticScenariosPlaceAllTiles(suite: SnapshotSuite) {
    for (const [name, snapshot] of Object.entries(suite)) {
        if (!REALISTIC_SCENARIOS.has(name)) continue;
        const expected = snapshot.telemetry.tilesCount;
        const actual = snapshot.placements.length;
        assert.equal(
            actual,
            expected,
            `Realistic scenario "${name}" only placed ${actual}/${expected} tiles — solver regression.`,
        );
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
    assertRealisticScenariosPlaceAllTiles(suite);

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
