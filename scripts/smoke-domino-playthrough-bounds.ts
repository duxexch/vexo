/**
 * Play-by-play UI smoke test for the domino board.
 *
 * Mounts the actual <DominoBoard /> React component inside a standalone
 * Vite-served harness page, then drives a real Chromium browser via
 * Playwright through progressively longer chains (5, 10, 14, 20 tiles)
 * across desktop and mobile viewports.
 *
 * For each scenario we read every tile's getBoundingClientRect() and
 * assert it stays fully inside the lane container's bounding rect. This
 * catches regressions where the layout solver passes its own math test
 * but tiles still spill outside the lane due to CSS, container sizing,
 * or render-time transform changes.
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
    // Maximum chain length the lane should fit completely. Beyond this
    // length the solver is allowed to gracefully drop trailing tiles
    // (matches the contract used by smoke-domino-layout-snapshots.ts,
    // where mobile lanes accept partial placement for very long chains).
    // Regardless of length, every tile that IS rendered must still stay
    // fully inside the lane — that is the regression this test guards.
    fullFitUpTo: number;
}

const VIEWPORTS: ViewportConfig[] = [
    {
        name: "desktop",
        compact: false,
        width: 1280,
        height: 720,
        fullFitUpTo: 20,
    },
    {
        name: "mobile",
        compact: true,
        width: 414,
        height: 800,
        fullFitUpTo: 14,
    },
];

const CHAIN_LENGTHS = [5, 10, 14, 20] as const;

// Allow a tiny amount of subpixel slop for getBoundingClientRect rounding.
const BOUNDS_EPSILON_PX = 1.5;

interface TileMeasurement {
    testId: string;
    rect: { left: number; right: number; top: number; bottom: number };
}

interface SceneMeasurement {
    laneRect: { left: number; right: number; top: number; bottom: number };
    tiles: TileMeasurement[];
}

async function startHarnessServer(): Promise<ViteDevServer> {
    const server = await createServer({
        configFile: path.join(PROJECT_ROOT, "vite.config.ts"),
        root: path.join(PROJECT_ROOT, "client"),
        server: {
            port: 0, // ephemeral
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
    length: number,
): Promise<SceneMeasurement> {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
    });

    try {
        const page = await context.newPage();
        const url = `${baseUrl}/test-harness.html?length=${length}&compact=${viewport.compact}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => {
            return (
                (window as Window & { __HARNESS_READY__?: boolean })
                    .__HARNESS_READY__ === true
            );
        });
        // Wait for the lane to mount (boardTiles populated -> lane appears).
        await page.waitForSelector(".domino-board-lane", { timeout: 5000 });
        // Wait at least one tile to render.
        await page.waitForSelector('[data-testid^="domino-tile-"]', {
            timeout: 5000,
        });
        // Allow the layout solver's resize observer + any rAF passes to
        // settle so tile transforms reflect the final layoutScale.
        await page.waitForTimeout(150);

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
                        rect: {
                            left: r.left,
                            right: r.right,
                            top: r.top,
                            bottom: r.bottom,
                        },
                    };
                }),
            };
        });

        return measurement;
    } finally {
        await context.close();
    }
}

function assertTilesInsideLane(
    label: string,
    scene: SceneMeasurement,
    viewport: ViewportConfig,
    requestedTileCount: number,
) {
    const expectedPlaced = Math.min(requestedTileCount, viewport.fullFitUpTo);

    assert.ok(
        scene.tiles.length >= expectedPlaced,
        `[${label}] expected at least ${expectedPlaced} tiles to be rendered, ` +
            `got ${scene.tiles.length}. The lane should comfortably hold the ` +
            `play-by-play chain up to ${viewport.fullFitUpTo} tiles.`,
    );

    for (const tile of scene.tiles) {
        const insideHorizontally =
            tile.rect.left >= scene.laneRect.left - BOUNDS_EPSILON_PX &&
            tile.rect.right <= scene.laneRect.right + BOUNDS_EPSILON_PX;
        const insideVertically =
            tile.rect.top >= scene.laneRect.top - BOUNDS_EPSILON_PX &&
            tile.rect.bottom <= scene.laneRect.bottom + BOUNDS_EPSILON_PX;

        assert.ok(
            insideHorizontally && insideVertically,
            `[${label}] tile ${tile.testId} rendered outside the lane. ` +
                `tile=(${tile.rect.left.toFixed(1)}, ${tile.rect.top.toFixed(1)}) -> ` +
                `(${tile.rect.right.toFixed(1)}, ${tile.rect.bottom.toFixed(1)}); ` +
                `lane=(${scene.laneRect.left.toFixed(1)}, ${scene.laneRect.top.toFixed(1)}) -> ` +
                `(${scene.laneRect.right.toFixed(1)}, ${scene.laneRect.bottom.toFixed(1)}).`,
        );
    }
}

async function main() {
    const server = await startHarnessServer();
    const baseUrl = resolveServerUrl(server);
    console.log(
        `[smoke:domino-playthrough-bounds] Harness server ready at ${baseUrl}`,
    );

    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({ headless: true });

        for (const viewport of VIEWPORTS) {
            for (const length of CHAIN_LENGTHS) {
                const label = `${viewport.name}@${length}`;
                const scene = await measureScene(
                    browser,
                    baseUrl,
                    viewport,
                    length,
                );
                assertTilesInsideLane(label, scene, viewport, length);
                console.log(
                    `[smoke:domino-playthrough-bounds] PASS ${label} ` +
                        `(rendered ${scene.tiles.length} tiles inside lane).`,
                );
            }
        }

        console.log(
            `[smoke:domino-playthrough-bounds] All chain lengths ` +
                `(${CHAIN_LENGTHS.join(", ")}) stayed inside the lane across ` +
                `${VIEWPORTS.length} viewports.`,
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
