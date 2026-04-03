#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message, details) {
    console.error("[smoke:domino-mobile-check] FAIL", message, details || "");
    process.exit(1);
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
    console.log(`[smoke:domino-mobile-check] PASS ${stepName}`);
}

function main() {
    const repoRoot = process.cwd();
    const challengePagePath = path.join(repoRoot, "client", "src", "pages", "challenge-game.tsx");
    const dominoContainerPath = path.join(repoRoot, "client", "src", "components", "games", "DominoChallengeContainer.tsx");
    const dominoBoardPath = path.join(repoRoot, "client", "src", "components", "games", "DominoBoard.tsx");

    const challengePage = read(challengePagePath);
    const dominoContainer = read(dominoContainerPath);
    const dominoBoard = read(dominoBoardPath);

    expectContains(challengePage, "window.addEventListener(\"popstate\"", "android back handler hook exists");
    expectContains(challengePage, "dominoChallengeId", "domino back guard state exists");
    expectContains(challengePage, "window.confirm", "leave confirmation exists for active domino match");

    expectContains(dominoContainer, "grid-cols-1", "mobile-first single-column layout exists");
    expectContains(dominoContainer, "lg:grid-cols-2", "desktop two-column upgrade layout exists");
    expectContains(dominoContainer, "max-w-5xl", "responsive max width wrapper exists");

    expectContains(dominoBoard, "touchAction: 'manipulation'", "touch optimization exists on board root");

    console.log("[smoke:domino-mobile-check] All checks passed.");
}

main();
