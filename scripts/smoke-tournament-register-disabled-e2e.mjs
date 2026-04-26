#!/usr/bin/env node

/**
 * Tournament register-button "really disabled" end-to-end smoke (real browser).
 *
 * Closes the CSS-regression gap left by source-pattern smokes
 * (smoke-tournament-wallet-display, smoke-tournament-insufficient-error)
 * by rendering the live React tree in a headless Chromium browser and
 * proving:
 *
 *   - A funded user (VXC balance >= entry fee) sees the active
 *     `tournament-detail-register` button (NOT disabled) and the
 *     balance pill is in the muted-foreground branch.
 *
 *   - A poor user (VXC balance < entry fee) sees the same button rendered
 *     but with the HTML `disabled` attribute set, the
 *     `tournament-detail-insufficient-balance` paragraph is visible, the
 *     balance pill is in the destructive-color branch, AND clicking the
 *     button does NOT fire any POST to /api/tournaments/:id/register
 *     (network spy).
 *
 * Usage (against a live dev server):
 *
 *   DATABASE_URL=... BASE_URL=http://localhost:3001 \
 *     node scripts/smoke-tournament-register-disabled-e2e.mjs
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
    console.error("[smoke:tournament-register-disabled] DATABASE_URL is required");
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const runTag = crypto.randomBytes(4).toString("hex");

const ENTRY_FEE = 10;
const RICH_BALANCE = 100;

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
        "User-Agent": "smoke-tournament-register-disabled/1.0",
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

async function adminLogin(username) {
    const res = await requestJson({
        method: "POST",
        path: "/api/admin/login",
        body: { username, password },
    });
    if (res.status !== 200 || typeof res.json?.token !== "string") {
        throw new Error(`admin login failed for ${username}: ${res.text}`);
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

const adminId = crypto.randomUUID();
const adminUsername = `trdsmoke_admin_${runTag}`;
const richId = crypto.randomUUID();
const richUsername = `trdsmoke_rich_${runTag}`;
const poorId = crypto.randomUUID();
const poorUsername = `trdsmoke_poor_${runTag}`;
const userIds = [adminId, richId, poorId];
const tournamentIds = [];

async function createUser({ id, username, role = "player", balance = "0.00" }) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance, username_selected_at)
     VALUES ($1, $2, $3, $4, 'active', 'username', $5, NOW())`,
        [id, username, passwordHash, role, balance],
    );
}

async function seedProjectWallet(userId, amount) {
    await pool.query(
        `INSERT INTO project_currency_wallets (
        user_id, purchased_balance, earned_balance, total_balance,
        total_converted, total_spent, total_earned, locked_balance
      ) VALUES ($1, '0.00', $2, $2, '0.00', '0.00', $2, '0.00')
      ON CONFLICT (user_id) DO UPDATE SET
        earned_balance = EXCLUDED.earned_balance,
        total_balance  = EXCLUDED.total_balance,
        total_earned   = EXCLUDED.total_earned`,
        [userId, amount.toFixed(2)],
    );
}

async function createTournament(adminToken) {
    const payload = {
        name: `RegBlock T ${runTag}`,
        nameAr: `RegBlock T ${runTag} (AR)`,
        gameType: "domino",
        format: "single_elimination",
        minPlayers: 2,
        maxPlayers: 8,
        entryFee: ENTRY_FEE.toFixed(2),
        prizePool: "0.00",
        currency: "project",
        prizeDistributionMethod: "winner_take_all",
        autoStartOnFull: false,
        isPublished: true,
    };
    const res = await requestJson({
        method: "POST",
        path: "/api/admin/tournaments",
        token: adminToken,
        body: payload,
    });
    if (res.status !== 200 || !res.json?.id) {
        throw new Error(`tournament create failed: ${res.text}`);
    }
    tournamentIds.push(res.json.id);
    return res.json;
}

async function cleanup() {
    if (tournamentIds.length) {
        await safeDelete(`DELETE FROM tournament_matches WHERE tournament_id = ANY($1::text[])`, [tournamentIds]);
        await safeDelete(`DELETE FROM tournament_participants WHERE tournament_id = ANY($1::text[])`, [tournamentIds]);
        await safeDelete(`DELETE FROM tournaments WHERE id = ANY($1::text[])`, [tournamentIds]);
    }
    await safeDelete(`DELETE FROM project_currency_ledger WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM transactions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM notifications WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM admin_audit_logs WHERE admin_id = $1`, [adminId]);
    await safeDelete(`DELETE FROM audit_logs WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM active_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM user_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM login_history WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
}

const TOKEN_STORAGE_KEY = "pwm_token";
const TOKEN_BACKUP_KEY = "pwm_token_backup";

async function openLoggedInPage(browser, token, registerUrlPattern) {
    const context = await browser.newContext();
    const registerCalls = [];

    // Spy on POST /api/tournaments/:id/register so we can prove the
    // disabled UI did not just look disabled while still firing the
    // mutation. We continue every request — only record matches.
    await context.route(registerUrlPattern, (route, request) => {
        if (request.method() === "POST") {
            registerCalls.push({ url: request.url(), method: request.method() });
        }
        return route.continue();
    });

    // The server's auth middleware accepts BOTH `Authorization: Bearer …`
    // (used by `apiRequest` in the React tree) AND the httpOnly `vex_token`
    // cookie set by /api/auth/login. The wallet fetch in
    // `client/src/pages/tournaments.tsx` uses raw `fetch(...)` with
    // `credentials: "include"` and no Authorization header, so we have to
    // seed the cookie too — otherwise the wallet pill stays in the
    // 'loading' state forever and `blockRegister` keeps the button
    // disabled even for the funded user, defeating the test.
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

    // Inject the JWT into both storage slots BEFORE any client script runs
    // so AuthProvider rehydrates an authenticated session on first paint.
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
    return { context, page, registerCalls };
}

async function main() {
    console.log(`\n[smoke:tournament-register-disabled] runTag=${runTag} baseUrl=${baseUrl}`);

    // ---- Provision admin + 2 players ----
    await createUser({ id: adminId, username: adminUsername, role: "admin" });
    await createUser({ id: richId, username: richUsername });
    await createUser({ id: poorId, username: poorUsername });

    // Rich gets a funded VXC wallet; poor gets nothing (no row → 0).
    await seedProjectWallet(richId, RICH_BALANCE);

    const adminToken = await adminLogin(adminUsername);
    pass("admin login succeeded");

    const richToken = await login(richUsername);
    pass("rich player login succeeded");

    const poorToken = await login(poorUsername);
    pass("poor player login succeeded");

    const tournament = await createTournament(adminToken);
    pass(`VXC tournament created (id=${tournament.id}, entryFee=${ENTRY_FEE})`);

    const registerUrlPattern = new RegExp(
        `/api/tournaments/${tournament.id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}/register$`,
    );

    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });

        // ====== Rich user: button enabled, balance pill is muted ======
        console.log("\n--- Rich user: register button must be enabled ---");
        const rich = await openLoggedInPage(browser, richToken, registerUrlPattern);
        try {
            await rich.page.goto(`${baseUrl}/tournaments/${tournament.id}`, {
                waitUntil: "networkidle",
                timeout: 30000,
            });

            const registerBtn = rich.page.locator('[data-testid="tournament-detail-register"]');
            await registerBtn.waitFor({ state: "visible", timeout: 20000 });
            assert(await registerBtn.count() === 1,
                "rich: tournament-detail-register button is rendered");

            // Wait for the React-Query wallet fetch to settle before
            // checking the button — `blockRegister` is true while
            // `balanceLoaded` is false, so a too-early read can race the
            // CSS transition from disabled → enabled.
            const balancePill = rich.page.locator('[data-testid="tournament-detail-user-balance"]');
            await balancePill.waitFor({ state: "visible", timeout: 10000 });
            await rich.page.waitForFunction(
                () => {
                    const el = document.querySelector('[data-testid="tournament-detail-user-balance"]');
                    return el && el.getAttribute("data-balance-state") === "ready";
                },
                undefined,
                { timeout: 10000 },
            );
            const richBalanceState = await balancePill.getAttribute("data-balance-state");
            assert(richBalanceState === "ready",
                "rich: balance pill data-balance-state === 'ready'", { state: richBalanceState });

            // Strictly assert the *native* HTMLButtonElement.disabled
            // semantics. Accepting only `aria-disabled` would let a
            // future "soft-disabled" rewrite (CSS + JS guard) keep this
            // test green while losing the regression coverage we care
            // about: that the real <button disabled> attribute is wired
            // when blockRegister is true.
            const richState = await registerBtn.evaluate((el) => ({
                tag: el.tagName,
                hasDisabledAttr: el.hasAttribute("disabled"),
                domDisabled: /** @type {HTMLButtonElement} */ (el).disabled === true,
            }));
            assert(richState.tag === "BUTTON",
                "rich: register control is a native <button>", richState);
            assert(richState.hasDisabledAttr === false && richState.domDisabled === false,
                "rich: native button has NO disabled attribute and disabled prop is false",
                richState);
            assert(await registerBtn.isEnabled(),
                "rich: register button reports isEnabled() === true");

            const richBalanceClass = await balancePill.getAttribute("class");
            assert(typeof richBalanceClass === "string" && richBalanceClass.includes("text-muted-foreground"),
                "rich: balance pill uses muted-foreground (NOT destructive)",
                { class: richBalanceClass });
            assert(typeof richBalanceClass === "string" && !richBalanceClass.includes("text-destructive"),
                "rich: balance pill class does not include text-destructive",
                { class: richBalanceClass });

            // Lock the visible amount too — `formatTournamentAmountText`
            // for VXC produces `VXC 100.00` for the seeded balance, so a
            // regression that flips the formatter or wires the wrong
            // wallet field would surface here.
            const richBalanceText = (await balancePill.innerText()).trim();
            const expectedRichAmount = `VXC ${RICH_BALANCE.toFixed(2)}`;
            assert(richBalanceText.includes(expectedRichAmount),
                `rich: balance pill text contains "${expectedRichAmount}"`,
                { text: richBalanceText });

            const insufficient = rich.page.locator('[data-testid="tournament-detail-insufficient-balance"]');
            assert(await insufficient.count() === 0,
                "rich: insufficient-balance paragraph is NOT rendered");

            const disabledFallback = rich.page.locator('[data-testid="tournament-detail-register-disabled"]');
            assert(await disabledFallback.count() === 0,
                "rich: register-disabled fallback button is NOT rendered");
        } finally {
            await rich.context.close();
        }

        // ====== Poor user: button must really be disabled ======
        console.log("\n--- Poor user: register button must be truly disabled ---");
        const poor = await openLoggedInPage(browser, poorToken, registerUrlPattern);
        try {
            await poor.page.goto(`${baseUrl}/tournaments/${tournament.id}`, {
                waitUntil: "networkidle",
                timeout: 30000,
            });

            const registerBtn = poor.page.locator('[data-testid="tournament-detail-register"]');
            await registerBtn.waitFor({ state: "visible", timeout: 20000 });
            assert(await registerBtn.count() === 1,
                "poor: tournament-detail-register button is rendered (canRegister branch)");

            // The wallet query may resolve a tick after first paint. Wait
            // for the balance pill to settle into its 'ready' state so we
            // assert the post-load disabled CSS, not the loading shimmer.
            const balancePill = poor.page.locator('[data-testid="tournament-detail-user-balance"]');
            await balancePill.waitFor({ state: "visible", timeout: 10000 });
            await poor.page.waitForFunction(
                () => {
                    const el = document.querySelector('[data-testid="tournament-detail-user-balance"]');
                    return el && el.getAttribute("data-balance-state") === "ready";
                },
                undefined,
                { timeout: 10000 },
            );

            // Same strict native-button assertion as the rich path
            // (see comment above) — the regression we are guarding
            // against is a future refactor that drops `disabled={…}`
            // and replaces it with aria-disabled + a JS click guard, so
            // we deliberately reject any non-native fallback even if
            // semantically equivalent.
            const poorState = await registerBtn.evaluate((el) => ({
                tag: el.tagName,
                hasDisabledAttr: el.hasAttribute("disabled"),
                domDisabled: /** @type {HTMLButtonElement} */ (el).disabled === true,
            }));
            assert(poorState.tag === "BUTTON",
                "poor: register control is a native <button>", poorState);
            assert(poorState.hasDisabledAttr === true && poorState.domDisabled === true,
                "poor: native button HAS disabled attribute and disabled prop is true",
                poorState);
            assert(!(await registerBtn.isEnabled()),
                "poor: register button reports isEnabled() === false");

            const poorBalanceClass = await balancePill.getAttribute("class");
            assert(typeof poorBalanceClass === "string" && poorBalanceClass.includes("text-destructive"),
                "poor: balance pill uses destructive color (insufficient state)",
                { class: poorBalanceClass });

            // Lock the visible amount: a brand-new poor user has no
            // wallet row and the API zero-defaults to "VXC 0.00", so a
            // future regression that wires the wrong wallet field or
            // formatter would show up as a text mismatch here.
            const poorBalanceText = (await balancePill.innerText()).trim();
            assert(poorBalanceText.includes("VXC 0.00"),
                'poor: balance pill text contains "VXC 0.00"',
                { text: poorBalanceText });

            const insufficient = poor.page.locator('[data-testid="tournament-detail-insufficient-balance"]');
            await insufficient.waitFor({ state: "visible", timeout: 5000 });
            assert(await insufficient.isVisible(),
                "poor: tournament-detail-insufficient-balance paragraph is visible");

            // Force-click bypasses Playwright's actionability checks so
            // that even if the underlying React handler tried to fire we
            // would catch it on the network spy. A truly-disabled native
            // <button disabled> still must NOT dispatch onClick.
            poor.registerCalls.length = 0;
            await registerBtn.click({ force: true, trial: false }).catch(() => {
                // Some Playwright versions throw on force-click of a
                // disabled element; either way we only care that no POST
                // landed on the spy.
            });
            // Give the React event loop + any in-flight mutation a tick.
            await poor.page.waitForTimeout(750);
            assert(poor.registerCalls.length === 0,
                "poor: no POST /api/tournaments/:id/register fired after clicking disabled button",
                { calls: poor.registerCalls });
        } finally {
            await poor.context.close();
        }
    } finally {
        if (browser) await browser.close();
    }
}

let exitCode = 0;
try {
    await main();
    console.log(`\n[smoke:tournament-register-disabled] OK — ${checks.length} checks passed`);
} catch (error) {
    exitCode = 1;
    console.error(`\n[smoke:tournament-register-disabled] FAIL — ${error?.message || error}`);
} finally {
    try { await cleanup(); } catch (cleanupError) {
        console.error(`[smoke:tournament-register-disabled] cleanup error: ${cleanupError?.message || cleanupError}`);
    }
    await pool.end().catch(() => {});
    process.exit(exitCode);
}
