/**
 * Task #189 — config-drift guard for native plugin settings whose value
 * is load-bearing for code in the JS layer.
 *
 * The companion file `keyboard-config-contract.test.ts` already pins
 * `Keyboard.resize`. This file pins the rest. If any of these drift,
 * the app degrades visually on real phones in ways the web-only smoke
 * tests cannot catch.
 *
 * Contracts pinned here:
 *   - SplashScreen.launchAutoHide = true            (consumer: client/src/main.tsx — splash hand-off)
 *   - SplashScreen.launchShowDuration <= 2000       (consumer: client/src/main.tsx — JS-side budget)
 *   - StatusBar.overlaysWebView    = false          (consumer: client/src/components/games/GameLayout.tsx,
 *                                                    client/src/components/PermissionsBanner.tsx)
 *   - Keyboard.style               = 'dark'         (consumer: light/dark theme parity for keyboard chrome)
 *   - server.url                   = 'https://vixo.click'  (Task #200 — production backend the
 *                                                    mobile app loads. Drift here ships the
 *                                                    store build pointing at the wrong host.)
 *   - ios.scheme                   = 'vexapp'       (Task #200 — custom URL scheme every OAuth
 *                                                    provider calls back into. Consumer:
 *                                                    `appUrlOpen` listener in client/src/main.tsx
 *                                                    which trusts `parsed.protocol === 'vexapp:'`.)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function readCapacitorConfigSource(): string {
  return readFileSync(resolve(REPO_ROOT, "capacitor.config.ts"), "utf8");
}

function pluginBlock(source: string, pluginName: string): string {
  const re = new RegExp(`${pluginName}:\\s*{([\\s\\S]*?)\\n\\s*}`);
  const match = source.match(re);
  expect(
    match,
    `capacitor.config.ts is missing a \`${pluginName}:\` plugin block`,
  ).not.toBeNull();
  return match![1];
}

describe("Task #189: capacitor.config.ts SplashScreen contract", () => {
  it("pins SplashScreen.launchAutoHide to true so the OS guarantees the splash drops", () => {
    const block = pluginBlock(readCapacitorConfigSource(), "SplashScreen");
    expect(
      block,
      "SplashScreen.launchAutoHide MUST be true. " +
        "client/src/main.tsx (Task #179) calls SplashScreen.hide() after first " +
        "React paint, but the native auto-hide is the fail-safe path if the JS " +
        "bundle never loads or the WebView crashes during boot. Disabling auto-hide " +
        "would leave the splash up forever in those failure modes.",
    ).toMatch(/launchAutoHide:\s*true/);
    expect(block, "SplashScreen.launchAutoHide must NOT be set to false").not.toMatch(
      /launchAutoHide:\s*false/,
    );
  });

  it("pins SplashScreen.launchShowDuration to <= 2000 ms (the JS hand-off budget)", () => {
    const block = pluginBlock(readCapacitorConfigSource(), "SplashScreen");
    const match = block.match(/launchShowDuration:\s*(\d+)/);
    expect(
      match,
      "SplashScreen.launchShowDuration MUST be present and numeric — " +
        "client/src/main.tsx (Task #179) was written against the 2 s budget below it.",
    ).not.toBeNull();
    const ms = Number(match![1]);
    expect(
      ms,
      `SplashScreen.launchShowDuration was ${ms}, must stay <= 2000. ` +
        "If you raise the OS auto-hide window, the splash will linger past " +
        "the JS hand-off on slow devices and look like a hang.",
    ).toBeLessThanOrEqual(2000);
  });
});

describe("Task #189: capacitor.config.ts StatusBar contract", () => {
  it("pins StatusBar.overlaysWebView to false so sticky surfaces own the top inset", () => {
    const block = pluginBlock(readCapacitorConfigSource(), "StatusBar");
    expect(
      block,
      "StatusBar.overlaysWebView MUST be false. " +
        "client/src/components/games/GameLayout.tsx (sticky game header) and " +
        "client/src/components/PermissionsBanner.tsx (top-of-screen banner) both " +
        "lay themselves out assuming the WebView starts BELOW the status bar. If " +
        "the status bar is allowed to overlay the WebView, the game header and the " +
        "permissions banner will both render UNDER the system clock/icons on Android.",
    ).toMatch(/overlaysWebView:\s*false/);
    expect(block, "StatusBar.overlaysWebView must NOT be set to true").not.toMatch(
      /overlaysWebView:\s*true/,
    );
  });
});

describe("Task #189: capacitor.config.ts Keyboard.style contract", () => {
  it("pins Keyboard.style to 'dark' so the native keyboard chrome matches the app shell", () => {
    const block = pluginBlock(readCapacitorConfigSource(), "Keyboard");
    expect(
      block,
      "Keyboard.style MUST be 'dark'. The app shell is dark-by-default and the " +
        "in-match chat composer (client/src/components/games/GameChat.tsx) sits flush " +
        "with the keyboard, so a 'light' keyboard would create a visible seam under " +
        "the composer on iOS.",
    ).toMatch(/style:\s*['"]dark['"]/);
    expect(block, "Keyboard.style must NOT be set to 'light'").not.toMatch(
      /style:\s*['"]light['"]/,
    );
  });
});

describe("Task #200: capacitor.config.ts server.url contract", () => {
  it("pins server.url to https://vixo.click so the mobile build never silently ships against staging", () => {
    const source = readCapacitorConfigSource();
    const block = pluginBlock(source, "server");
    expect(
      block,
      "server.url MUST be 'https://vixo.click'. This is the production backend " +
        "the mobile app loads at startup. If this value drifts (e.g. accidentally " +
        "swapped for a staging or preview URL during a refactor), the App Store / " +
        "Play Store build silently ships pointing at the wrong host and every login, " +
        "every wallet call, every socket connection from real phones hits the wrong " +
        "backend with no warning at build time.",
    ).toMatch(/url:\s*['"]https:\/\/vixo\.click['"]/);
    // Also guard against accidentally enabling cleartext, which would
    // make a future drift to an http:// URL silently work in dev.
    expect(
      block,
      "server.cleartext must remain false so an accidental http:// URL " +
        "is rejected by the platform instead of silently shipping.",
    ).toMatch(/cleartext:\s*false/);
  });
});

describe("Task #200: capacitor.config.ts ios.scheme contract", () => {
  it("pins ios.scheme to 'vexapp' — every OAuth provider calls back into vexapp:// on iOS", () => {
    const source = readCapacitorConfigSource();
    // ios is a top-level config key, not a plugin block, so we pull the
    // ios: { … } object directly.
    const iosMatch = source.match(/\n\s*ios:\s*{([\s\S]*?)\n\s*},/);
    expect(
      iosMatch,
      "capacitor.config.ts is missing the top-level `ios: { … }` block",
    ).not.toBeNull();
    const iosBlock = iosMatch![1];
    expect(
      iosBlock,
      "ios.scheme MUST be 'vexapp'. The OAuth providers (Google, Facebook, Apple, " +
        "Discord, GitHub, Twitter, Telegram) are each registered in their developer " +
        "consoles to redirect to vexapp://auth/callback on iOS. The `appUrlOpen` " +
        "listener in client/src/main.tsx (around line 448) trusts the deep-link only " +
        "when `parsed.protocol === 'vexapp:'`. If this scheme drifts, iOS opens the " +
        "callback URL in Safari instead of the app, every OAuth login on iOS fails " +
        "silently, and there is no build-time warning — the regression only surfaces " +
        "in store review or in production.",
    ).toMatch(/scheme:\s*['"]vexapp['"]/);
  });
});
