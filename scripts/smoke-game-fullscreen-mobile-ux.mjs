#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message, details) {
    console.error("[smoke:game-fullscreen-mobile-ux] FAIL", message, details || "");
    process.exit(1);
}

function pass(stepName) {
    console.log(`[smoke:game-fullscreen-mobile-ux] PASS ${stepName}`);
}

function read(filePath) {
    if (!fs.existsSync(filePath)) {
        fail("File not found", filePath);
    }
    return fs.readFileSync(filePath, "utf8");
}

function expectContains(source, expected, stepName) {
    if (!source.includes(expected)) {
        fail(`Missing expected pattern for ${stepName}`, expected);
    }
    pass(stepName);
}

function expectAll(source, patterns, stepPrefix) {
    for (const pattern of patterns) {
        expectContains(source, pattern, `${stepPrefix}: ${pattern}`);
    }
}

function runPageChecks(repoRoot) {
    const pages = [
        {
            key: "chess",
            file: path.join(repoRoot, "client", "src", "pages", "games", "ChessGame.tsx"),
            specificChecks: [
                "!isGameFullscreen && (",
                "GameFullscreenActionDock",
            ],
        },
        {
            key: "domino",
            file: path.join(repoRoot, "client", "src", "pages", "games", "DominoGame.tsx"),
            specificChecks: [
                "${isGameFullscreen ? 'hidden' : ''}",
                "GameFullscreenActionDock",
            ],
        },
        {
            key: "backgammon",
            file: path.join(repoRoot, "client", "src", "pages", "games", "BackgammonGame.tsx"),
            specificChecks: [
                "!isGameFullscreen && (",
                "GameFullscreenActionDock",
            ],
        },
        {
            key: "tarneeb",
            file: path.join(repoRoot, "client", "src", "pages", "games", "TarneebGame.tsx"),
            specificChecks: [
                "${isGameFullscreen ? 'hidden' : ''}",
                "GameFullscreenActionDock",
            ],
        },
        {
            key: "baloot",
            file: path.join(repoRoot, "client", "src", "pages", "games", "BalootGame.tsx"),
            specificChecks: [
                "${isGameFullscreen ? 'hidden' : ''}",
                "GameFullscreenActionDock",
            ],
        },
    ];

    for (const page of pages) {
        const source = read(page.file);

        expectAll(
            source,
            [
                "useGameFullscreen",
                "GameFullscreenActionDock",
                "isGameFullscreen",
                "toggleFullscreen",
                "data-testid=\"button-toggle-fullscreen\"",
                "min-h-[44px] min-w-[44px]",
                "vex-game-fullscreen-shell",
                "exitLabel={t('common.close')}",
            ],
            `${page.key} fullscreen mobile essentials`,
        );

        for (const check of page.specificChecks) {
            expectContains(source, check, `${page.key} specific fullscreen behavior`);
        }
    }
}

function runSharedChecks(repoRoot) {
    const cssPath = path.join(repoRoot, "client", "src", "index.css");
    const css = read(cssPath);

    expectAll(
        css,
        [
            ".vex-game-fullscreen-shell",
            "padding-bottom: calc(env(safe-area-inset-bottom)",
            "scroll-padding-bottom: calc(env(safe-area-inset-bottom)",
            "overscroll-behavior: contain",
            ".vex-game-fullscreen-dock",
            "max-width: min(96vw, 34rem)",
            "body[data-vex-game-fullscreen=\"on\"]",
        ],
        "shared css fullscreen mobile safeguards",
    );

    const dockPath = path.join(repoRoot, "client", "src", "components", "games", "GameFullscreenActionDock.tsx");
    const dockSource = read(dockPath);

    expectAll(
        dockSource,
        [
            "h-11 w-11",
            "overflow-x-auto",
            "button-game-fullscreen-exit",
            "button-game-fullscreen-action-",
        ],
        "fullscreen dock touch targets and overflow handling",
    );

    const hookPath = path.join(repoRoot, "client", "src", "hooks", "use-game-fullscreen.ts");
    const hookSource = read(hookPath);

    expectAll(
        hookSource,
        [
            "window.addEventListener(\"keydown\"",
            "event.key === \"Escape\"",
            "data-vex-game-fullscreen",
        ],
        "fullscreen hook fallback exit and body lock",
    );
}

function main() {
    const repoRoot = process.cwd();

    runPageChecks(repoRoot);
    runSharedChecks(repoRoot);

    console.log("[smoke:game-fullscreen-mobile-ux] All checks passed.");
}

main();
