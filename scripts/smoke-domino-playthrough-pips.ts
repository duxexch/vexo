/**
 * Play-by-play UI smoke test for visible domino pip values on the board.
 *
 * Mounts the actual <DominoBoard /> React component inside a standalone
 * Vite-served harness page, then drives a real Chromium browser via
 * Playwright through chains that include the historically-troublesome
 * blank-half tiles ([3,0], [5,0]) and a chain elbow (a double).
 *
 * For each scenario we read every rendered tile's two halves, count the
 * pip <span> elements in each, and assert two invariants:
 *
 *   1. Half-multiset invariant. The two pip counts on a tile must equal
 *      its canonical {left, right} pip values (taken from the tile's
 *      data-testid). This catches a tile rendering nothing, the same
 *      half twice, or a wrong pip count entirely.
 *
 *   2. Visual chain continuity. For every consecutive pair of tiles in
 *      chain order, the half of tile[i] whose center is closest to
 *      tile[i+1] must have the same pip count as the half of tile[i+1]
 *      whose center is closest to tile[i]. This is what the player sees
 *      and is exactly the regression the C19-F1 flip fix targets — a
 *      broken flipHalves rule renders a [3,0] with the blank facing the
 *      matching pip's neighbour, so the trailing half count diverges
 *      from the leading half count of the next tile.
 *
 * The smoke runs on BOTH the desktop viewport and the compact mobile
 * lane. Originally mobile was skipped because the harness mounted the
 * full chain on a single side of the anchor, which forced the layout
 * solver to wrap into a tight C-shape on the narrow mobile lane and
 * defeated the spatially-closest-half assumption. Task #61 fixed this
 * by extending the harness with an `anchorIndex` URL param, which
 * splits the chain around the requested anchor exactly like a real
 * game (where the first played tile is anchored and subsequent tiles
 * grow out on both sides). With balanced chain halves around the
 * anchor, the compact lane no longer wraps and the same per-tile
 * pip-value assertions used on desktop catch wrong-pip board renders
 * on phone screens too.
 *
 * Mobile DOM lane containment (separate from pip values) is still
 * covered independently by smoke-domino-playthrough-bounds.ts, and
 * the flip rule is independently verified at the solver level by
 * smoke-domino-tile-orientation.ts.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

interface ViewportConfig {
    name: "desktop" | "mobile";
    compact: boolean;
    width: number;
    height: number;
}

// Mobile coverage requires the per-scenario `mobileAnchorIndex` (see
// SCENARIOS) so the harness can split the chain around a middle anchor
// like a real game and avoid forcing the layout solver to wrap into a
// tight C-shape on the narrow compact lane.
const VIEWPORTS: ViewportConfig[] = [
    { name: "desktop", compact: false, width: 1280, height: 720 },
    { name: "mobile", compact: true, width: 414, height: 896 },
];

interface ChainScenario {
    name: string;
    chain: Array<[number, number]>;
    // Index in `chain` to use as the on-screen anchor when rendering the
    // compact mobile lane. Splitting the chain around a middle anchor
    // mirrors a real game (chain grows out from the first played tile on
    // both sides) and stops the narrow mobile lane from being forced into
    // a C-shape wrap that would defeat the spatially-closest-half
    // assertion. The chosen index must keep at least one of [3,0] and
    // [5,0] on each side (or as the anchor itself) so both blank-half
    // tiles still get exercised end-to-end.
    mobileAnchorIndex: number;
    /**
     * Optional explicit anchor index for the desktop viewport. Originally
     * the desktop case relied on the harness defaulting the anchor to
     * `boardTiles[0]` so the entire chain unrolled on a single side, but
     * the viewport-aware tile footprint fix (tablet/desktop tiles render
     * at 48×96 above the `sm:` breakpoint, not 40×80) means the snake now
     * folds at desktop widths too. Splitting the chain around a real
     * mid-chain anchor mirrors how a real game looks and keeps every
     * non-anchor tile inside the spatially-closest-half assertion.
     */
    desktopAnchorIndex?: number;
}

// Each chain satisfies the server's invariant `chain[i][1] === chain[i+1][0]`,
// includes at least one [3,0] and one [5,0] (the original bug-report tiles),
// and contains a double (which forces the layout solver to elbow). Canonical
// (left,right) pairs are unique within each chain so the data-testid
// `domino-tile-{l}-{r}` uniquely identifies each rendered tile.
const SCENARIOS: ChainScenario[] = [
    {
        // 7 tiles: blank halves at positions 1 ([3,0]) and 4 ([5,0]) with a
        // [5,5] elbow in the middle. Touches both the right-going and
        // left-going branches of the layout (after the solver folds the chain).
        name: "blanks-with-double-elbow",
        chain: [
            [0, 3],
            [3, 0],
            [0, 5],
            [5, 5],
            [5, 0],
            [0, 4],
            [4, 1],
        ],
        // Anchor on the [5,5] double — left side carries [3,0],
        // right side carries [5,0], 3 tiles per side keeps the
        // compact lane from wrapping.
        mobileAnchorIndex: 3,
        desktopAnchorIndex: 3,
    },
    {
        // 8 tiles starting on a [6,6] double (immediate elbow) with two
        // distinct blank-half tiles ([3,0] and [5,0]) further along.
        name: "leading-double-then-blanks",
        chain: [
            [6, 6],
            [6, 3],
            [3, 0],
            [0, 5],
            [5, 0],
            [0, 2],
            [2, 4],
            [4, 1],
        ],
        // Anchor on [5,0] itself (the original blank-half regression
        // case acting as the table center) so the assertion still
        // covers it via the half-multiset check; left side carries
        // [3,0] + the [6,6] double, right side carries the rest.
        mobileAnchorIndex: 4,
        desktopAnchorIndex: 4,
    },
];

interface HalfMeasurement {
    pipCount: number;
    centerX: number;
    centerY: number;
}

interface TileMeasurement {
    canonicalLeft: number;
    canonicalRight: number;
    centerX: number;
    centerY: number;
    halves: [HalfMeasurement, HalfMeasurement];
}

async function startHarnessServer(): Promise<ViteDevServer> {
    const server = await createServer({
        configFile: path.join(PROJECT_ROOT, "vite.config.ts"),
        root: path.join(PROJECT_ROOT, "client"),
        server: {
            port: 0,
            host: "127.0.0.1",
            strictPort: false,
        },
        appType: "mpa",
        logLevel: "warn",
    });

    await server.listen();
    return server;
}

function resolveServerUrl(server: ViteDevServer): string {
    const urls = server.resolvedUrls;
    if (urls && urls.local && urls.local.length > 0) {
        return urls.local[0].replace(/\/$/, "");
    }

    const address = server.httpServer?.address();
    if (address && typeof address === "object") {
        return `http://127.0.0.1:${address.port}`;
    }

    throw new Error("Unable to determine harness server URL");
}

async function measureScene(
    browser: Browser,
    baseUrl: string,
    viewport: ViewportConfig,
    chain: Array<[number, number]>,
    anchorIndex: number | null,
): Promise<TileMeasurement[]> {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
    });

    try {
        const page = await context.newPage();
        const chainParam = encodeURIComponent(JSON.stringify(chain));
        const queryParts = [
            `compact=${viewport.compact}`,
            `chain=${chainParam}`,
        ];
        if (anchorIndex !== null) {
            queryParts.push(`anchorIndex=${anchorIndex}`);
        }
        const url = `${baseUrl}/test-harness.html?${queryParts.join("&")}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => {
            return (
                (window as Window & { __HARNESS_READY__?: boolean })
                    .__HARNESS_READY__ === true
            );
        });
        await page.waitForSelector(".domino-board-lane", { timeout: 5000 });
        await page.waitForSelector('[data-testid^="domino-tile-"]', {
            timeout: 5000,
        });
        // Allow the layout solver's resize observer + rAF passes to settle so
        // tile transforms reflect the final layoutScale.
        await page.waitForTimeout(200);

        const measurements = await page.evaluate(() => {
            const tileNodes = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-testid^="domino-tile-"]',
                ),
            );

            return tileNodes.map((node) => {
                const testId = node.getAttribute("data-testid") ?? "";
                const match = testId.match(/^domino-tile-(\d+)-(\d+)$/);
                const canonicalLeft = match ? Number(match[1]) : -1;
                const canonicalRight = match ? Number(match[2]) : -1;
                const tileRect = node.getBoundingClientRect();

                // The two half-divs are the only direct children with the
                // `flex-1` class — the other children (sheen, divider, bevels)
                // are absolutely-positioned decorations.
                const halfNodes = Array.from(node.children).filter((child) =>
                    child instanceof HTMLElement
                    && child.classList.contains("flex-1"),
                ) as HTMLElement[];

                const halves = halfNodes.map((half) => {
                    const r = half.getBoundingClientRect();
                    // Pip <span>s use a radial-gradient background; the blank
                    // value's single decorative line span uses a flat color
                    // (bg-[#2f2a22]/35) — filter by class so blanks count as 0.
                    const pipSpans = Array.from(
                        half.querySelectorAll<HTMLSpanElement>("span"),
                    ).filter((span) => span.className.includes("radial-gradient"));
                    return {
                        pipCount: pipSpans.length,
                        centerX: (r.left + r.right) / 2,
                        centerY: (r.top + r.bottom) / 2,
                    };
                });

                return {
                    testId,
                    canonicalLeft,
                    canonicalRight,
                    halfCount: halves.length,
                    centerX: (tileRect.left + tileRect.right) / 2,
                    centerY: (tileRect.top + tileRect.bottom) / 2,
                    halves,
                };
            });
        });

        const result: TileMeasurement[] = [];
        for (const m of measurements) {
            assert.equal(
                m.halfCount,
                2,
                `Tile ${m.testId} rendered ${m.halfCount} half-divs, expected 2.`,
            );
            result.push({
                canonicalLeft: m.canonicalLeft,
                canonicalRight: m.canonicalRight,
                centerX: m.centerX,
                centerY: m.centerY,
                halves: [m.halves[0], m.halves[1]],
            });
        }
        return result;
    } finally {
        await context.close();
    }
}

function assertHalfMultiset(
    label: string,
    chainIndex: number,
    measurement: TileMeasurement,
) {
    const observed = [
        measurement.halves[0].pipCount,
        measurement.halves[1].pipCount,
    ].sort((a, b) => a - b);
    const expected = [
        measurement.canonicalLeft,
        measurement.canonicalRight,
    ].sort((a, b) => a - b);

    assert.deepStrictEqual(
        observed,
        expected,
        `[${label}] tile #${chainIndex} (canonical [${measurement.canonicalLeft},` +
            `${measurement.canonicalRight}]) rendered halves with pip counts ` +
            `[${observed.join(", ")}], expected multiset [${expected.join(", ")}].`,
    );
}

function distance(
    a: { centerX: number; centerY: number },
    b: { centerX: number; centerY: number },
): number {
    const dx = a.centerX - b.centerX;
    const dy = a.centerY - b.centerY;
    return Math.sqrt(dx * dx + dy * dy);
}

function pickClosestHalf(
    tile: TileMeasurement,
    other: TileMeasurement,
): HalfMeasurement {
    const d0 = distance(tile.halves[0], other);
    const d1 = distance(tile.halves[1], other);
    return d0 <= d1 ? tile.halves[0] : tile.halves[1];
}

function assertVisualChainContinuity(
    label: string,
    chain: Array<[number, number]>,
    tilesByChainIndex: TileMeasurement[],
) {
    for (let i = 0; i + 1 < tilesByChainIndex.length; i += 1) {
        const current = tilesByChainIndex[i];
        const next = tilesByChainIndex[i + 1];
        const expectedMatchingPip = chain[i][1];
        // Sanity: chain definition itself must satisfy the invariant.
        assert.equal(
            chain[i + 1][0],
            expectedMatchingPip,
            `[${label}] chain definition broken at index ${i}: ` +
                `chain[${i}][1]=${expectedMatchingPip} but ` +
                `chain[${i + 1}][0]=${chain[i + 1][0]}.`,
        );

        const trailingHalf = pickClosestHalf(current, next);
        const leadingHalf = pickClosestHalf(next, current);

        assert.equal(
            trailingHalf.pipCount,
            expectedMatchingPip,
            `[${label}] visual chain break at index ${i}: tile #${i} ` +
                `(canonical [${current.canonicalLeft},${current.canonicalRight}]) ` +
                `shows pip count ${trailingHalf.pipCount} on the half facing ` +
                `tile #${i + 1}, expected ${expectedMatchingPip}.`,
        );
        assert.equal(
            leadingHalf.pipCount,
            expectedMatchingPip,
            `[${label}] visual chain break at index ${i + 1}: tile #${i + 1} ` +
                `(canonical [${next.canonicalLeft},${next.canonicalRight}]) ` +
                `shows pip count ${leadingHalf.pipCount} on the half facing ` +
                `tile #${i}, expected ${expectedMatchingPip}.`,
        );
    }
}

function indexTilesByChainOrder(
    label: string,
    chain: Array<[number, number]>,
    measurements: TileMeasurement[],
): TileMeasurement[] {
    const byTestId = new Map<string, TileMeasurement>();
    for (const measurement of measurements) {
        const key = `${measurement.canonicalLeft}-${measurement.canonicalRight}`;
        assert.ok(
            !byTestId.has(key),
            `[${label}] duplicate canonical tile [${key}] rendered. ` +
                `Scenario chains must use unique (left,right) pairs so we can ` +
                `align rendered tiles with the chain definition.`,
        );
        byTestId.set(key, measurement);
    }

    return chain.map(([left, right], index) => {
        const measurement = byTestId.get(`${left}-${right}`);
        assert.ok(
            measurement,
            `[${label}] chain tile #${index} ([${left},${right}]) was not ` +
                `rendered to the DOM (looked for data-testid=domino-tile-${left}-${right}).`,
        );
        return measurement;
    });
}

function assertScenarioCoversBlanksAndElbow(
    label: string,
    chain: Array<[number, number]>,
) {
    // Tasks #41/#49: the reported bug specifically involves [3,0] and [5,0].
    const has30 = chain.some(([l, r]) => l === 3 && r === 0);
    const has50 = chain.some(([l, r]) => l === 5 && r === 0);
    const hasDouble = chain.some(([l, r]) => l === r);
    assert.ok(
        has30,
        `[${label}] scenario must contain a [3,0] tile (the original blank-half regression case).`,
    );
    assert.ok(
        has50,
        `[${label}] scenario must contain a [5,0] tile (the original blank-half regression case).`,
    );
    assert.ok(
        hasDouble,
        `[${label}] scenario must contain a double (forces the layout solver to elbow).`,
    );
    assert.ok(
        chain.length >= 6 && chain.length <= 8,
        `[${label}] scenario chain length ${chain.length} outside 6-8 range required by task #49.`,
    );
}

async function main() {
    const server = await startHarnessServer();
    const baseUrl = resolveServerUrl(server);
    console.log(
        `[smoke:domino-playthrough-pips] Harness server ready at ${baseUrl}`,
    );

    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({ headless: true });

        for (const scenario of SCENARIOS) {
            assertScenarioCoversBlanksAndElbow(scenario.name, scenario.chain);

            for (const viewport of VIEWPORTS) {
                const label = `${scenario.name}@${viewport.name}`;
                // Both viewports now use a real mid-chain anchor split.
                // After the viewport-aware tile footprint fix, even the
                // desktop lane folds the snake — so the anchor must split
                // the chain to mirror how real games render the table.
                const anchorIndex = viewport.compact
                    ? scenario.mobileAnchorIndex
                    : (scenario.desktopAnchorIndex ?? scenario.mobileAnchorIndex);
                const measurements = await measureScene(
                    browser,
                    baseUrl,
                    viewport,
                    scenario.chain,
                    anchorIndex,
                );

                assert.equal(
                    measurements.length,
                    scenario.chain.length,
                    `[${label}] expected all ${scenario.chain.length} tiles to ` +
                        `render but DOM contained ${measurements.length}. The lane ` +
                        `should comfortably hold a 6-8 tile play-by-play chain.`,
                );

                const ordered = indexTilesByChainOrder(
                    label,
                    scenario.chain,
                    measurements,
                );

                for (let i = 0; i < ordered.length; i += 1) {
                    assertHalfMultiset(label, i, ordered[i]);
                }

                assertVisualChainContinuity(label, scenario.chain, ordered);

                console.log(
                    `[smoke:domino-playthrough-pips] PASS ${label} ` +
                        `(${ordered.length} tiles, halves and visual chain continuity OK).`,
                );
            }
        }

        console.log(
            `[smoke:domino-playthrough-pips] All ${SCENARIOS.length} scenarios ` +
                `passed across ${VIEWPORTS.length} viewports.`,
        );
    } finally {
        if (browser) {
            await browser.close();
        }
        await server.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
