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

describe("Task #212: capacitor.config.ts server.allowNavigation OAuth domains", () => {
  // Each entry pairs a domain that MUST stay in `server.allowNavigation`
  // with the OAuth provider that depends on it. If you remove a domain
  // here you are also removing the only path the WebView has to that
  // provider's authorization page on real phones — every login button
  // for that provider then hangs on a blocked navigation with no
  // build-time warning. The button on `client/src/pages/login.tsx` is
  // the user-facing consumer in every case.
  const OAUTH_DOMAINS: Array<{ domain: string; provider: string }> = [
    { domain: "accounts.google.com", provider: "Google" },
    { domain: "www.facebook.com", provider: "Facebook" },
    { domain: "appleid.apple.com", provider: "Apple" },
    { domain: "discord.com", provider: "Discord" },
    { domain: "github.com", provider: "GitHub" },
    { domain: "api.twitter.com", provider: "Twitter / X" },
    { domain: "telegram.org", provider: "Telegram" },
  ];

  function readAllowNavigation(): string {
    const source = readCapacitorConfigSource();
    const block = pluginBlock(source, "server");
    const match = block.match(/allowNavigation:\s*\[([\s\S]*?)\]/);
    expect(
      match,
      "capacitor.config.ts `server` block is missing an `allowNavigation: [ … ]` array. " +
        "That array is the only path the WebView has to OAuth provider domains on real phones; " +
        "removing it breaks every social login.",
    ).not.toBeNull();
    return match![1];
  }

  for (const { domain, provider } of OAUTH_DOMAINS) {
    it(`keeps ${domain} in server.allowNavigation so ${provider} OAuth works on mobile`, () => {
      const allowList = readAllowNavigation();
      // Match the domain as a quoted string entry to avoid false
      // positives from substrings (e.g. a comment that happens to
      // mention the domain). The entry must be present verbatim.
      const entryRe = new RegExp(`['"]${domain.replace(/\./g, "\\.")}['"]`);
      expect(
        allowList,
        `server.allowNavigation MUST include '${domain}'. ` +
          `That domain is the OAuth authorization host for ${provider}; ` +
          "removing it makes the corresponding login button on " +
          "client/src/pages/login.tsx hang on a blocked navigation in the " +
          "Capacitor WebView with no error surfaced to the user. " +
          "If you are intentionally dropping support for this provider, " +
          "delete the provider button on the login page in the same change " +
          "and update this contract test.",
      ).toMatch(entryRe);
    });
  }
});

describe("Task #213: capacitor.config.ts SocialLogin.providers contract", () => {
  // The native social-login plugin (`@capgo/capacitor-social-login`,
  // imported and `SocialLogin.initialize()`-d in client/src/pages/login.tsx)
  // only initialises the providers that are set to `true` here. If the
  // login page renders a provider button whose toggle below is `false`,
  // tapping it on iOS / Android is a SILENT NO-OP — the plugin never
  // loaded the SDK for that provider, so there is nothing to call. The
  // web build cannot detect this drift at compile time because
  // capacitor.config.ts is plain TypeScript data, not part of the React
  // bundle's type graph.
  //
  // Each entry below pins one provider's expected boolean and explains
  // what the corresponding state of client/src/pages/login.tsx must be.
  // If you flip a provider here, you MUST also update the login page in
  // the same change (and update this contract test). If you add or
  // remove a button on the login page, you MUST also update the
  // corresponding entry here. That is the entire point of the contract.
  type ProviderExpectation = {
    provider: "google" | "facebook" | "apple" | "twitter";
    expected: boolean;
    why: string;
  };

  const PROVIDER_EXPECTATIONS: ProviderExpectation[] = [
    {
      provider: "google",
      expected: true,
      why:
        "Google is the platform's primary OAuth provider. The login page " +
        "(client/src/pages/login.tsx) reads `authSettings.googleLoginEnabled` " +
        "and renders a Google button when admins enable it; the native " +
        "plugin must therefore initialise Google so taps on iOS / Android " +
        "actually open the Google sign-in flow instead of silently no-op-ing.",
    },
    {
      provider: "facebook",
      expected: false,
      why:
        "Facebook native sign-in is not currently shipped. The login page " +
        "(client/src/pages/login.tsx) does check `authSettings.facebookLoginEnabled` " +
        "but no Facebook OAuth app is wired through the @capgo/capacitor-social-login " +
        "plugin yet — flipping this to `true` without first registering the " +
        "Facebook app id and adding the SDK config to iOS Info.plist + " +
        "android/app/build.gradle would crash plugin init at first launch on " +
        "real phones with no warning during the web build.",
    },
    {
      provider: "apple",
      expected: false,
      why:
        "Apple Sign-In is not currently shipped. The login page " +
        "(client/src/pages/login.tsx) has no `appleLoginEnabled` flag in " +
        "DEFAULT_AUTH_SETTINGS and no `case \"apple\"` branch in " +
        "isSocialPlatformEnabledInAuthSettings, so no Apple button can render. " +
        "Flipping this to `true` without first adding the Apple capability in " +
        "Xcode and a server-side Apple OAuth client would make the plugin " +
        "advertise Apple sign-in to iOS at init time and Apple's review team " +
        "rejects builds that advertise capabilities they don't actually use.",
    },
    {
      provider: "twitter",
      expected: false,
      why:
        "Twitter / X native sign-in is not currently shipped. The login page " +
        "(client/src/pages/login.tsx) checks `authSettings.twitterLoginEnabled` " +
        "but no X app id / consumer secret is wired through the native plugin " +
        "yet — flipping this to `true` would make the plugin try to initialise " +
        "the X SDK with empty credentials and crash plugin init on real phones. " +
        "When you do wire it, also keep `api.twitter.com` in `server.allowNavigation` " +
        "(already pinned by Task #212 above).",
    },
  ];

  function readSocialLoginProvidersBlock(): string {
    // pluginBlock() can't be used for SocialLogin because the block has
    // a nested `providers: { … }` object and the helper's lazy regex
    // stops at the FIRST `\n}` it sees — i.e. the inner closing brace.
    // Match the providers map directly off the full source instead.
    const source = readCapacitorConfigSource();
    const match = source.match(
      /SocialLogin:\s*{[\s\S]*?providers:\s*{([\s\S]*?)\n\s*}/,
    );
    expect(
      match,
      "SocialLogin plugin is missing a `providers: { … }` map. The native " +
        "@capgo/capacitor-social-login plugin (imported in client/src/pages/login.tsx) " +
        "uses this map to decide which provider SDKs to initialise — without it, " +
        "every social login button on the page is a no-op on real phones.",
    ).not.toBeNull();
    return match![1];
  }

  it("declares the SocialLogin plugin block at all", () => {
    // Sanity check — if the SocialLogin block ever gets deleted from
    // capacitor.config.ts, every per-provider assertion below would
    // throw with a noisy "missing plugin block" error from
    // pluginBlock(). Failing fast with a clearer message here.
    const source = readCapacitorConfigSource();
    expect(
      source,
      "capacitor.config.ts is missing the `SocialLogin: { providers: { … } }` block. " +
        "client/src/pages/login.tsx imports @capgo/capacitor-social-login and calls " +
        "SocialLogin.initialize() / SocialLogin.login() unconditionally; without " +
        "this config block the plugin will boot with NO providers and every social " +
        "login button on iOS / Android becomes a silent no-op.",
    ).toMatch(/SocialLogin:\s*{[\s\S]*?providers:\s*{/);
  });

  it("rejects unknown SocialLogin.providers keys (catch-all for new providers)", () => {
    // The plugin's TypeScript types accept any string key, so a future
    // refactor could add e.g. `discord: true` here without anyone
    // remembering to also wire client/src/pages/login.tsx, the
    // server-side OAuth credentials, or the iOS / Android native SDK
    // config. Force an explicit decision: every key in the providers
    // map must appear in PROVIDER_EXPECTATIONS above.
    const block = readSocialLoginProvidersBlock();
    const knownKeys = new Set(PROVIDER_EXPECTATIONS.map((p) => p.provider));
    const allKeys = Array.from(block.matchAll(/\b([a-zA-Z]+)\s*:\s*(?:true|false)\b/g)).map(
      (m) => m[1],
    );
    const unknown = allKeys.filter((k) => !knownKeys.has(k as never));
    expect(
      unknown,
      `SocialLogin.providers contains unknown keys: ${unknown.join(", ")}. ` +
        "Add each new provider to PROVIDER_EXPECTATIONS in this file with its " +
        "expected boolean and a 'why' string that documents the corresponding " +
        "state of client/src/pages/login.tsx (button presence, AuthSettings flag, " +
        "switch case in isSocialPlatformEnabledInAuthSettings) and the native " +
        "config it depends on (Info.plist on iOS, build.gradle on Android).",
    ).toEqual([]);
  });

  for (const { provider, expected, why } of PROVIDER_EXPECTATIONS) {
    it(`pins SocialLogin.providers.${provider} = ${expected}`, () => {
      const block = readSocialLoginProvidersBlock();
      // Match `provider: true` or `provider: false` (with optional
      // trailing comma / whitespace) so partial substrings of another
      // value can't satisfy us.
      const entryRe = new RegExp(`\\b${provider}\\s*:\\s*(true|false)\\b`);
      const match = block.match(entryRe);
      expect(
        match,
        `SocialLogin.providers.${provider} is missing entirely. ${why} ` +
          "Flipping a provider on or off here without keeping client/src/pages/login.tsx " +
          "in sync is the regression this contract test prevents.",
      ).not.toBeNull();
      const actual = match![1] === "true";
      expect(
        actual,
        `SocialLogin.providers.${provider} drifted to ${actual} (expected ${expected}). ${why} ` +
          "If you intentionally flipped this toggle, update " +
          "client/src/pages/login.tsx in the same change (add/remove the provider's " +
          "AuthSettings flag and switch case) and update the expectation in this " +
          "contract test (capacitor-config-contract.test.ts).",
      ).toBe(expected);
    });
  }
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
