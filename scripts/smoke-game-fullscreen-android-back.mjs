#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message, details) {
    console.error("[smoke:game-fullscreen-android-back] FAIL", message, details || "");
    process.exit(1);
}

function pass(stepName) {
    console.log(`[smoke:game-fullscreen-android-back] PASS ${stepName}`);
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

function runHookChecks(repoRoot) {
    const hookPath = path.join(repoRoot, "client", "src", "hooks", "use-game-fullscreen.ts");
    const hookSource = read(hookPath);

    expectAll(
        hookSource,
        [
            "FULLSCREEN_HISTORY_GUARD_KEY",
            "window.history.pushState",
            "window.addEventListener(\"popstate\"",
            "window.history.back()",
            "skipNextPopstateRef.current",
            "void exitFullscreen();",
        ],
        "fullscreen hook android back guard",
    );
}

function runSurfaceChecks(repoRoot) {
    const pages = [
        {
            key: "challenge-game",
            file: path.join(repoRoot, "client", "src", "pages", "challenge-game.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock"],
        },
        {
            key: "challenge-watch",
            file: path.join(repoRoot, "client", "src", "pages", "challenge-watch.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock"],
        },
        {
            key: "chess",
            file: path.join(repoRoot, "client", "src", "pages", "games", "ChessGame.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock", "button-toggle-fullscreen"],
        },
        {
            key: "domino",
            file: path.join(repoRoot, "client", "src", "pages", "games", "DominoGame.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock", "button-toggle-fullscreen"],
        },
        {
            key: "backgammon",
            file: path.join(repoRoot, "client", "src", "pages", "games", "BackgammonGame.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock", "button-toggle-fullscreen"],
        },
        {
            key: "tarneeb",
            file: path.join(repoRoot, "client", "src", "pages", "games", "TarneebGame.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock", "button-toggle-fullscreen"],
        },
        {
            key: "baloot",
            file: path.join(repoRoot, "client", "src", "pages", "games", "BalootGame.tsx"),
            expected: ["useGameFullscreen()", "toggleFullscreen", "GameFullscreenActionDock", "button-toggle-fullscreen"],
        },
    ];

    for (const page of pages) {
        const source = read(page.file);
        expectAll(source, page.expected, `${page.key} fullscreen integration for android back`);
    }
}

function main() {
    const repoRoot = process.cwd();

    runHookChecks(repoRoot);
    runSurfaceChecks(repoRoot);

    console.log("[smoke:game-fullscreen-android-back] All checks passed.");
}

main();
