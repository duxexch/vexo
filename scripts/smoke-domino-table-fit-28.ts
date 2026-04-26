/**
 * 28-tile fit smoke test for the domino board.
 *
 * Sibling to `smoke-domino-playthrough-bounds.ts`, this guards the
 * end-of-round case where both players have played all 28 tiles. We mount
 * the real <DominoBoard /> in the existing harness with `length=28` across
 * the four supported viewports (360, 414, 768, 1280 wide) and assert:
 *
 *   1. Exactly 28 tile elements rendered (no silent drops by the
 *      partial-best fallback).
 *   2. Every tile rect lives fully inside the lane rect (epsilon 1.5px).
 *   3. No two tile rects overlap each other (epsilon 1.5px).
 *
 * This is the smoke that proves the lane is actually wide enough for a
 * full real-world round, not just the play-by-play assertion bundle.
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
    name: string;
    compact: boolean;
    width: number;
    height: number;
    /**
     * Inner harness container (where DominoBoard renders). We size this
     * close to the realistic on-page area a player gets on each device:
     * the phone viewport minus a header/banner/keyboard buffer. The
     * harness's `?harnessWidth=` / `?harnessHeight=` overrides exist for
     * exactly this reason.
     */
    harnessWidth: number;
    harnessHeight: number;
}

const VIEWPORTS: ViewportConfig[] = [
    {
        name: "mobile-360",
        compact: true,
        width: 360,
        height: 640,
        harnessWidth: 360,
        harnessHeight: 540,
    },
    {
        name: "mobile-414",
        compact: true,
        width: 414,
        height: 896,
        harnessWidth: 414,
        harnessHeight: 760,
    },
    {
        name: "tablet-768",
        compact: false,
        width: 768,
        height: 1024,
        harnessWidth: 740,
        harnessHeight: 920,
    },
    {
        name: "desktop-1280",
        compact: false,
        width: 1280,
        height: 800,
        harnessWidth: 1100,
        harnessHeight: 720,
    },
];

const FULL_ROUND_LENGTH = 28;
const BOUNDS_EPSILON_PX = 1.5;
const OVERLAP_EPSILON_PX = 1.5;

interface TileRect {
    testId: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface SceneMeasurement {
    laneRect: { left: number; right: number; top: number; bottom: number };
    tiles: TileRect[];
    telemetry?: unknown;
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
): Promise<SceneMeasurement> {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
    });

    try {
        const page = await context.newPage();
        // Anchor in the *middle* of the chain. The harness defaults the
        // anchor to index 0, which forces all 27 non-anchor tiles onto a
        // single side — wildly unrepresentative of real games where the
        // first-played tile splits the chain roughly in half. Splitting at
        // 14 mirrors the ~half/half snake every actual round produces.
        const anchorIndex = Math.floor(FULL_ROUND_LENGTH / 2);
        const url =
            `${baseUrl}/test-harness.html` +
            `?length=${FULL_ROUND_LENGTH}` +
            `&compact=${viewport.compact}` +
            `&anchorIndex=${anchorIndex}` +
            `&harnessWidth=${viewport.harnessWidth}` +
            `&harnessHeight=${viewport.harnessHeight}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => {
            return (
                (window as unknown as { __HARNESS_READY__?: boolean })
                    .__HARNESS_READY__ === true
            );
        });
        await page.waitForSelector(".domino-board-lane", { timeout: 5000 });
        await page.waitForSelector('[data-testid^="domino-tile-"]', {
            timeout: 5000,
        });
        // Allow the layout solver's resize observer + any rAF passes to
        // settle so tile transforms reflect the final layoutScale.
        await page.waitForTimeout(250);

        const measurement = await page.evaluate(() => {
            const lane = document.querySelector(".domino-board-lane");
            if (!lane) {
                throw new Error("Lane element missing");
            }
            const laneRect = lane.getBoundingClientRect();
            const tileNodes = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-testid^="domino-tile-"]',
                ),
            );
            const telemetry = (
                window as unknown as { __DOMINO_BOARD_TELEMETRY__?: unknown }
            ).__DOMINO_BOARD_TELEMETRY__;
            return {
                laneRect: {
                    left: laneRect.left,
                    right: laneRect.right,
                    top: laneRect.top,
                    bottom: laneRect.bottom,
                },
                tiles: tileNodes.map((node) => {
                    const r = node.getBoundingClientRect();
                    return {
                        testId: node.getAttribute("data-testid") ?? "",
                        left: r.left,
                        right: r.right,
                        top: r.top,
                        bottom: r.bottom,
                    };
                }),
                telemetry,
            };
        });

        return measurement;
    } finally {
        await context.close();
    }
}

function assertNoTileDropped(label: string, scene: SceneMeasurement) {
    assert.strictEqual(
        scene.tiles.length,
        FULL_ROUND_LENGTH,
        `[${label}] expected exactly ${FULL_ROUND_LENGTH} tiles to be rendered ` +
            `(full-round case where both players played every piece), got ` +
            `${scene.tiles.length}. The layout solver silently dropped trailing ` +
            `tiles — the lane is too small or the shrink-fit floor is too high.`,
    );
}

function assertAllTilesInsideLane(label: string, scene: SceneMeasurement) {
    for (const tile of scene.tiles) {
        const insideHorizontally =
            tile.left >= scene.laneRect.left - BOUNDS_EPSILON_PX &&
            tile.right <= scene.laneRect.right + BOUNDS_EPSILON_PX;
        const insideVertically =
            tile.top >= scene.laneRect.top - BOUNDS_EPSILON_PX &&
            tile.bottom <= scene.laneRect.bottom + BOUNDS_EPSILON_PX;

        assert.ok(
            insideHorizontally && insideVertically,
            `[${label}] tile ${tile.testId} rendered outside the lane. ` +
                `tile=(${tile.left.toFixed(1)}, ${tile.top.toFixed(1)}) -> ` +
                `(${tile.right.toFixed(1)}, ${tile.bottom.toFixed(1)}); ` +
                `lane=(${scene.laneRect.left.toFixed(1)}, ${scene.laneRect.top.toFixed(1)}) -> ` +
                `(${scene.laneRect.right.toFixed(1)}, ${scene.laneRect.bottom.toFixed(1)}).`,
        );
    }
}

function rectsOverlap(a: TileRect, b: TileRect): boolean {
    if (a.right <= b.left + OVERLAP_EPSILON_PX) return false;
    if (b.right <= a.left + OVERLAP_EPSILON_PX) return false;
    if (a.bottom <= b.top + OVERLAP_EPSILON_PX) return false;
    if (b.bottom <= a.top + OVERLAP_EPSILON_PX) return false;
    return true;
}

function assertNoTileOverlaps(label: string, scene: SceneMeasurement) {
    for (let i = 0; i < scene.tiles.length; i += 1) {
        for (let j = i + 1; j < scene.tiles.length; j += 1) {
            const a = scene.tiles[i];
            const b = scene.tiles[j];
            assert.ok(
                !rectsOverlap(a, b),
                `[${label}] tiles ${a.testId} and ${b.testId} overlap. ` +
                    `a=(${a.left.toFixed(1)}, ${a.top.toFixed(1)}) -> (${a.right.toFixed(1)}, ${a.bottom.toFixed(1)}); ` +
                    `b=(${b.left.toFixed(1)}, ${b.top.toFixed(1)}) -> (${b.right.toFixed(1)}, ${b.bottom.toFixed(1)}).`,
            );
        }
    }
}

async function main() {
    const server = await startHarnessServer();
    const baseUrl = resolveServerUrl(server);
    console.log(
        `[smoke:domino-table-fit-28] Harness server ready at ${baseUrl}`,
    );

    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless: true });

        for (const viewport of VIEWPORTS) {
            const label = `${viewport.name}@${viewport.width}x${viewport.height}`;
            const scene = await measureScene(browser, baseUrl, viewport);
            try {
                assertNoTileDropped(label, scene);
                assertAllTilesInsideLane(label, scene);
                assertNoTileOverlaps(label, scene);
            } catch (err) {
                console.error(
                    `[smoke:domino-table-fit-28] telemetry @ ${label}:`,
                    JSON.stringify(scene.telemetry),
                );
                throw err;
            }
            console.log(
                `[smoke:domino-table-fit-28] PASS ${label} ` +
                    `(${scene.tiles.length}/28 tiles, all inside lane, no overlaps).`,
            );
        }

        console.log(
            `[smoke:domino-table-fit-28] All ${VIEWPORTS.length} viewports fit the ` +
                `full ${FULL_ROUND_LENGTH}-tile round inside the lane with no ` +
                `overlaps.`,
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
