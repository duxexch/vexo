#!/usr/bin/env node

/**
 * Task #117 — Playwright mobile-web smoke that proves the chat composer
 * stays above the on-screen keyboard.
 *
 * Closes the gap between:
 *
 *   - Task #43 (the production fix: `useKeyboardInset` drives a
 *     `--keyboard-inset-bottom` CSS variable from `window.visualViewport`,
 *     and the chat page's outer wrapper consumes it via
 *     `pb-[max(calc(4.5rem_+_env(safe-area-inset-bottom)),var(--keyboard-inset-bottom,0px))]`).
 *
 *   - Task #81 (the unit tests in `tests/dm-load-older-strip.test.tsx`'s
 *     sibling files that lock the listener attach/detach mechanics under
 *     React StrictMode + ref-counting, but cannot prove the user-visible
 *     bounding-box outcome on a real DOM).
 *
 *   - Task #82 (the manual real-device Capacitor checklist at
 *     `docs/device-tests/android-keyboard-composer-2026-04.md`, which is
 *     slow and easy to skip on a release).
 *
 * For every CI build this smoke:
 *
 *   1. Spins up two seeded users in the live database (one viewer who
 *      logs in, one peer the chat page will preselect via `?user=...`).
 *   2. Opens a fresh Chromium context for each mobile profile we care
 *      about (iPhone 14 — 390x844 portrait, Pixel 7 — 412x915 portrait)
 *      with `isMobile: true` + `hasTouch: true` + the matching mobile
 *      User-Agent so the chat page renders its mobile layout.
 *   3. Seeds the JWT into the `vex_token` cookie + `pwm_token`
 *      localStorage + `pwm_token_backup` sessionStorage slots
 *      (matching the auth-rehydration contract used by the
 *      tournament-register-disabled e2e), navigates to
 *      `/chat?user=<peerId>`, and waits for the chat composer
 *      (`[data-testid="input-chat-message"]`) to mount.
 *   4. Captures the composer's bounding-box bottom in the *baseline*
 *      state (no keyboard) — sanity-checks it sits inside the layout
 *      viewport.
 *   5. Simulates a mobile-keyboard appearance by overriding
 *      `window.visualViewport.height` (and `offsetTop`) to a smaller
 *      value via `Object.defineProperty`, then dispatching a `resize`
 *      event on `visualViewport` — exactly the signal mobile Safari /
 *      Chrome fire when the OS keyboard slides up. Waits a couple of
 *      animation frames for `useKeyboardInset`'s `requestAnimationFrame`
 *      to flush the new value into `--keyboard-inset-bottom`.
 *   6. Asserts:
 *        a) `--keyboard-inset-bottom` on `<html>` is now > 0 (proves
 *           the hook fired and recomputed the inset).
 *        b) The composer's `getBoundingClientRect().bottom` is at or
 *           above the new `visualViewport.height` (within a small
 *           sub-pixel rounding tolerance) — i.e. the composer is no
 *           longer hidden behind the simulated keyboard.
 *
 * If a future refactor breaks the wrapper's `pb-[max(...)]` consumer
 * or strips the hook's `visualViewport` listener registration, the
 * composer will sit below the simulated viewport and this smoke will
 * fail before the regression reaches a real device.
 *
 * Usage (against a live dev server):
 *
 *   DATABASE_URL=... BASE_URL=http://localhost:3001 \
 *     node tests/playwright/chat-keyboard-inset.spec.mjs
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { chromium } from "playwright";

const args = Object.fromEntries(
    process.argv.slice(2)
        .map((item) => item.split("="))
        .filter((pair) => pair.length === 2),
);

const baseUrl = String(args["--base-url"] || process.env.BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const databaseUrl = String(args["--database-url"] || process.env.DATABASE_URL || "");
const password = String(args["--password"] || process.env.SMOKE_PASSWORD || "SmokePass123!");

if (!databaseUrl) {
    console.error("[smoke:chat-keyboard-inset] DATABASE_URL is required");
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const runTag = crypto.randomBytes(4).toString("hex");

const TOKEN_STORAGE_KEY = "pwm_token";
const TOKEN_BACKUP_KEY = "pwm_token_backup";

// Mobile profiles we exercise. We deliberately hard-code the
// dimensions (rather than spreading `devices["iPhone 14"]`) because:
//   - Playwright's bundled "iPhone 14" profile defaults to webkit, but
//     this project's existing smokes all run on chromium. Using
//     chromium with an iOS UA + iOS viewport is enough to hit the
//     mobile responsive layout in chat.tsx (the `md:` breakpoints in
//     Tailwind are media-query based, not UA-sniffing).
//   - We want to lock the *exact* portrait dimensions so a future
//     Playwright bump can't silently shift the device descriptor and
//     break the assertion's tolerance budget.
const MOBILE_PROFILES = [
    {
        name: "iPhone 14 portrait",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        // Roughly what mobile Safari leaves for the layout when the
        // keyboard slides up on a 390x844 device — well under half the
        // screen. The exact value doesn't matter, only that the
        // computed inset is > 0 AND the composer's bottom shifts to
        // sit inside `keyboardOpenHeight`.
        keyboardOpenHeight: 460,
    },
    {
        name: "Pixel 7 portrait",
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        userAgent:
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
        keyboardOpenHeight: 520,
    },
];

const checks = [];
function pass(label) { checks.push({ label, ok: true }); console.log(`  ✓ ${label}`); }
function fail(label, details) {
    const suffix = details === undefined ? "" : ` | ${typeof details === "string" ? details : JSON.stringify(details)}`;
    checks.push({ label, ok: false, details });
    throw new Error(`${label}${suffix}`);
}
function assert(condition, label, details) {
    if (condition) { pass(label); return; }
    fail(label, details);
}

async function requestJson({ method = "GET", path, token, body }) {
    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "smoke-chat-keyboard-inset/1.0",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = null;
    if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
    }
    return { status: res.status, ok: res.ok, json, text };
}

async function login(username) {
    const res = await requestJson({
        method: "POST",
        path: "/api/auth/login",
        body: { username, password },
    });
    if (res.status !== 200 || typeof res.json?.token !== "string") {
        throw new Error(`login failed for ${username}: ${res.text}`);
    }
    return res.json.token;
}

async function safeDelete(sql, values) {
    try {
        await pool.query(sql, values);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("does not exist")) return;
        throw error;
    }
}

const viewerId = crypto.randomUUID();
const viewerUsername = `kbsmoke_viewer_${runTag}`;
const peerId = crypto.randomUUID();
const peerUsername = `kbsmoke_peer_${runTag}`;
const userIds = [viewerId, peerId];

async function createUser({ id, username }) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance, username_selected_at)
         VALUES ($1, $2, $3, 'player', 'active', 'username', '0.00', NOW())`,
        [id, username, passwordHash],
    );
}

async function cleanup() {
    await safeDelete(`DELETE FROM messages WHERE sender_id = ANY($1::text[]) OR receiver_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM notifications WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM active_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM user_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM login_history WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
}

async function openLoggedInMobilePage(browser, profile, token) {
    const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        userAgent: profile.userAgent,
        isMobile: true,
        hasTouch: true,
    });

    const cookieUrl = new URL(baseUrl);
    await context.addCookies([
        {
            name: "vex_token",
            value: token,
            domain: cookieUrl.hostname,
            path: "/",
            httpOnly: true,
            secure: cookieUrl.protocol === "https:",
            sameSite: "Strict",
        },
    ]);

    await context.addInitScript(
        ({ key, backupKey, value }) => {
            try {
                window.localStorage.setItem(key, value);
                window.sessionStorage.setItem(backupKey, value);
            } catch {
                /* storage may be blocked by some browsers; ignored */
            }
        },
        { key: TOKEN_STORAGE_KEY, backupKey: TOKEN_BACKUP_KEY, value: token },
    );

    const page = await context.newPage();
    return { context, page };
}

async function runProfile(browser, profile, viewerToken) {
    console.log(`\n--- ${profile.name} (${profile.viewport.width}x${profile.viewport.height}) ---`);

    const { context, page } = await openLoggedInMobilePage(browser, profile, viewerToken);
    try {
        await page.goto(`${baseUrl}/chat?user=${peerId}`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });

        // The composer only renders once `activeConversation` is set. With
        // `?user=<peerId>` the page calls `selectConversation(peerId)` in
        // an effect and resolves the peer profile via `/api/users/batch`,
        // so we just wait for the input testid to appear.
        const composer = page.locator('[data-testid="input-chat-message"]');
        await composer.waitFor({ state: "visible", timeout: 30000 });
        assert(await composer.count() === 1,
            `${profile.name}: chat composer input is rendered`);

        // Confirm the visualViewport API is actually wired up on the
        // emulated mobile context — without it the hook falls back to
        // setting the inset to 0 unconditionally and the test would
        // give a false green (no signal that the override below
        // actually drove the hook).
        const hasVisualViewport = await page.evaluate(() => Boolean(window.visualViewport));
        assert(hasVisualViewport,
            `${profile.name}: window.visualViewport is available on the emulated mobile context`);

        // Wait for the hook's first paint to settle the CSS var to its
        // baseline value ("0px" when the layout viewport === visual
        // viewport). The hook attaches in a useEffect, schedules an rAF,
        // and writes the var on the next frame.
        await page.waitForFunction(
            () => {
                const v = getComputedStyle(document.documentElement)
                    .getPropertyValue("--keyboard-inset-bottom").trim();
                return v.length > 0; // any value, including "0px"
            },
            undefined,
            { timeout: 5000 },
        );

        const baseline = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="input-chat-message"]');
            const rect = /** @type {HTMLElement} */ (el).getBoundingClientRect();
            const vv = window.visualViewport;
            return {
                composerBottom: rect.bottom,
                innerHeight: window.innerHeight,
                vvHeight: vv ? vv.height : null,
                cssVar: getComputedStyle(document.documentElement)
                    .getPropertyValue("--keyboard-inset-bottom").trim(),
            };
        });
        console.log(`    baseline: ${JSON.stringify(baseline)}`);

        assert(baseline.composerBottom <= baseline.innerHeight + 4,
            `${profile.name}: baseline composer bottom (${baseline.composerBottom}) is inside layout viewport (${baseline.innerHeight})`,
            baseline);

        // Baseline `--keyboard-inset-bottom` should be effectively zero
        // (no keyboard up). We allow up to a tiny non-zero value because
        // some future emulation/runtime combos may report a small
        // `visualViewport.offsetTop` (e.g. virtual UI bars) while the
        // composer is still demonstrably docked to the viewport bottom.
        // The point of this baseline check is only to confirm we are
        // *starting* in a closed-keyboard state — the strong assertion
        // is the post-shrink one further down.
        const baselineCssVarPx = parseFloat(baseline.cssVar);
        assert(!Number.isFinite(baselineCssVarPx) || baselineCssVarPx <= 8,
            `${profile.name}: baseline --keyboard-inset-bottom is at most 8px (got "${baseline.cssVar}")`,
            { cssVar: baseline.cssVar });

        // ----- Simulate the on-screen keyboard sliding up -----
        //
        // Mobile Safari + Chrome shrink `window.visualViewport.height`
        // (and bump `offsetTop` for the floating-keyboard case on iPad)
        // when the OS keyboard appears, then fire a `resize` event on
        // `visualViewport`. We replay that exact signal so the hook's
        // listener fires the same code path it would on a physical
        // device — no Playwright `page.keyboard` involvement, because
        // chromium doesn't actually shrink the visual viewport in
        // headless mode when an <input> is focused.
        const targetHeight = profile.keyboardOpenHeight;
        await page.evaluate((newHeight) => {
            const vv = window.visualViewport;
            if (!vv) throw new Error("no visualViewport");
            // Use defineProperty so the override survives across the
            // hook's reads. Browsers expose these as configurable
            // accessor properties on the prototype, so a per-instance
            // override is safe and reversible.
            Object.defineProperty(vv, "height", {
                configurable: true,
                get: () => newHeight,
            });
            Object.defineProperty(vv, "offsetTop", {
                configurable: true,
                get: () => 0,
            });
            vv.dispatchEvent(new Event("resize"));
        }, targetHeight);

        // Wait for the hook's rAF to flush the new value into the CSS
        // var. We poll on the var becoming non-zero (rather than a
        // fixed timeout) so a slow CI machine still gets a stable read.
        await page.waitForFunction(
            () => {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue("--keyboard-inset-bottom").trim();
                const px = parseFloat(raw);
                return Number.isFinite(px) && px > 0;
            },
            undefined,
            { timeout: 5000 },
        );

        const opened = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="input-chat-message"]');
            const rect = /** @type {HTMLElement} */ (el).getBoundingClientRect();
            const vv = window.visualViewport;
            return {
                composerBottom: rect.bottom,
                composerTop: rect.top,
                innerHeight: window.innerHeight,
                vvHeight: vv ? vv.height : null,
                cssVar: getComputedStyle(document.documentElement)
                    .getPropertyValue("--keyboard-inset-bottom").trim(),
            };
        });
        console.log(`    keyboard-open: ${JSON.stringify(opened)}`);

        const cssVarPx = parseFloat(opened.cssVar);
        assert(Number.isFinite(cssVarPx) && cssVarPx > 0,
            `${profile.name}: --keyboard-inset-bottom is positive after visualViewport shrink (got "${opened.cssVar}")`,
            opened);

        // The expected inset is `innerHeight - vvHeight - offsetTop`,
        // rounded to the nearest pixel by the hook. Allow a 2px slop
        // for sub-pixel rounding and any environment-specific
        // `innerHeight` jitter.
        const expectedInset = Math.round(opened.innerHeight - (opened.vvHeight ?? 0));
        assert(Math.abs(cssVarPx - expectedInset) <= 2,
            `${profile.name}: --keyboard-inset-bottom (${cssVarPx}px) matches expected innerHeight - vvHeight (${expectedInset}px)`,
            { cssVarPx, expectedInset, opened });

        // ----- The user-visible assertion -----
        //
        // The composer's bottom edge MUST sit at or above the new
        // visual viewport's bottom. Without the Task #43 wrapper
        // (`pb-[max(..., var(--keyboard-inset-bottom,0px))]`) the
        // composer would stay glued to `innerHeight` and end up
        // hidden behind the simulated keyboard — which is the
        // user-visible regression this smoke is designed to catch.
        const tolerancePx = 2;
        assert(opened.composerBottom <= (opened.vvHeight ?? 0) + tolerancePx,
            `${profile.name}: composer bottom (${opened.composerBottom}) is inside the visible viewport (${opened.vvHeight}, tolerance ${tolerancePx}px)`,
            opened);

        // And it must have actually MOVED relative to the baseline —
        // a wrapper that hard-codes `pb-0` on mobile would still pass
        // the bounded-by-vvHeight check above by coincidence on
        // certain viewports, but its baseline and keyboard-open
        // composer bottoms would be identical. Require a real shift.
        const shift = baseline.composerBottom - opened.composerBottom;
        assert(shift > 10,
            `${profile.name}: composer rose by >10px when the simulated keyboard opened (shift=${shift.toFixed(2)}px)`,
            { baseline: baseline.composerBottom, opened: opened.composerBottom, shift });
    } finally {
        await context.close();
    }
}

async function main() {
    console.log(`\n[smoke:chat-keyboard-inset] runTag=${runTag} baseUrl=${baseUrl}`);

    await createUser({ id: viewerId, username: viewerUsername });
    await createUser({ id: peerId, username: peerUsername });
    pass("seeded viewer + peer users");

    const viewerToken = await login(viewerUsername);
    pass("viewer login succeeded");

    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        for (const profile of MOBILE_PROFILES) {
            await runProfile(browser, profile, viewerToken);
        }
    } finally {
        if (browser) await browser.close();
    }
}

let exitCode = 0;
try {
    await main();
    console.log(`\n[smoke:chat-keyboard-inset] OK — ${checks.length} checks passed`);
} catch (error) {
    exitCode = 1;
    console.error(`\n[smoke:chat-keyboard-inset] FAIL — ${error?.message || error}`);
} finally {
    try { await cleanup(); } catch (cleanupError) {
        console.error(`[smoke:chat-keyboard-inset] cleanup error: ${cleanupError?.message || cleanupError}`);
    }
    await pool.end().catch(() => {});
    process.exit(exitCode);
}
