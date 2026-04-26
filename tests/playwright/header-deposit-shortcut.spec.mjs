#!/usr/bin/env node

/**
 * Smoke for the polished top-right header (Task #194).
 * Verifies the deposit shortcut deep-links to /wallet?modal=deposit and
 * that the cluster stays single-row + accessible at 1280/414/360.
 *
 * Usage: DATABASE_URL=... BASE_URL=http://localhost:3001 \
 *   node tests/playwright/header-deposit-shortcut.spec.mjs
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
    console.error("[smoke:header-deposit-shortcut] DATABASE_URL is required");
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const runTag = crypto.randomBytes(4).toString("hex");

const TOKEN_STORAGE_KEY = "pwm_token";
const TOKEN_BACKUP_KEY = "pwm_token_backup";

const VIEWPORTS = [
    { name: "desktop 1280x800",  width: 1280, height: 800, isMobile: false },
    { name: "mobile 414x896",    width: 414,  height: 896, isMobile: true  },
    { name: "mobile 360x780",    width: 360,  height: 780, isMobile: true  },
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
        "User-Agent": "smoke-header-deposit-shortcut/1.0",
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
const viewerUsername = `hdrsmoke_${runTag}`;
const userIds = [viewerId];

async function createUser({ id, username }) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance, username_selected_at)
         VALUES ($1, $2, $3, 'player', 'active', 'username', '0.00', NOW())`,
        [id, username, passwordHash],
    );
}

async function cleanup() {
    await safeDelete(`DELETE FROM notifications WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM active_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM user_sessions WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM login_history WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM audit_logs WHERE user_id = ANY($1::text[])`, [userIds]);
    await safeDelete(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
}

async function openLoggedInPage(browser, profile, token) {
    const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        isMobile: profile.isMobile,
        hasTouch: profile.isMobile,
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
            } catch { /* ignored */ }
        },
        { key: TOKEN_STORAGE_KEY, backupKey: TOKEN_BACKUP_KEY, value: token },
    );

    const page = await context.newPage();
    return { context, page };
}

async function runProfile(browser, profile, viewerToken) {
    console.log(`\n--- ${profile.name} ---`);

    const { context, page } = await openLoggedInPage(browser, profile, viewerToken);
    try {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });

        const sidebarTrigger = page.locator('[data-testid="button-sidebar-toggle"]');
        await sidebarTrigger.waitFor({ state: "visible", timeout: 30000 });
        assert(await sidebarTrigger.isVisible(), `${profile.name}: sidebar trigger renders`);

        const deposit = page.locator('[data-testid="button-header-deposit"]');
        await deposit.waitFor({ state: "visible", timeout: 10000 });
        const depositName = await deposit.getAttribute("aria-label");
        assert(
            typeof depositName === "string" && depositName.length > 0,
            `${profile.name}: deposit shortcut has accessible name`,
            { depositName },
        );

        const wallet = page.locator('[data-testid="button-header-wallet"]');
        assert(await wallet.isVisible(), `${profile.name}: legacy wallet icon still visible`);

        const tooledControls = [
            { testid: "button-theme-toggle",       name: "theme toggle" },
            { testid: "button-notification-bell",  name: "notification bell" },
            { testid: "button-language-switch",    name: "language switcher" },
        ];
        for (const control of tooledControls) {
            const locator = page.locator(`[data-testid="${control.testid}"]`);
            await locator.waitFor({ state: "visible", timeout: 10000 });
            const accessibleName =
                (await locator.getAttribute("aria-label"))
                || (await locator.getAttribute("title"))
                || (await locator.textContent());
            assert(
                typeof accessibleName === "string" && accessibleName.trim().length > 0,
                `${profile.name}: ${control.name} exposes an accessible name`,
                { accessibleName },
            );
        }

        const themeToggle = page.locator('[data-testid="button-theme-toggle"]');
        await themeToggle.hover();
        const tooltip = page.locator('[role="tooltip"]', { hasText: /Theme|السمة/ });
        await tooltip.first().waitFor({ state: "visible", timeout: 5000 });
        const tooltipText = (await tooltip.first().textContent() || "").trim();
        assert(
            /^(Theme|السمة)$/.test(tooltipText),
            `${profile.name}: theme toggle shows localized tooltip on hover`,
            { tooltipText },
        );
        await page.mouse.move(0, 0);
        await page.waitForTimeout(150);

        const rowMetrics = await deposit.evaluate((el) => {
            let node = el.parentElement;
            while (node && !(node.classList.contains("flex") && node.classList.contains("items-center"))) {
                node = node.parentElement;
            }
            const wrapper = node || el.parentElement;
            const rect = wrapper.getBoundingClientRect();
            return {
                height: rect.height,
                right: rect.right,
                left: rect.left,
                width: rect.width,
                viewportWidth: window.innerWidth,
            };
        });

        assert(
            rowMetrics.height <= 56,
            `${profile.name}: header cluster stays on a single row (height=${rowMetrics.height.toFixed(1)}px <= 56px)`,
            rowMetrics,
        );
        assert(
            rowMetrics.right <= rowMetrics.viewportWidth + 1,
            `${profile.name}: header cluster fits inside the viewport (right=${rowMetrics.right.toFixed(1)} <= ${rowMetrics.viewportWidth})`,
            rowMetrics,
        );

        await Promise.all([
            page.waitForURL((url) => {
                try {
                    const u = new URL(url);
                    return u.pathname === "/wallet" && u.searchParams.get("modal") === "deposit";
                } catch { return false; }
            }, { timeout: 15000 }),
            deposit.click(),
        ]);
        pass(`${profile.name}: deposit shortcut deep-links to /wallet?modal=deposit`);

        const landedPathname = await page.evaluate(() => window.location.pathname);
        assert(
            landedPathname === "/wallet",
            `${profile.name}: navigated to /wallet`,
            { landedPathname },
        );
    } finally {
        await context.close();
    }
}

async function main() {
    let exitCode = 0;
    let browser = null;
    try {
        await createUser({ id: viewerId, username: viewerUsername });
        pass("seeded viewer user");

        const viewerToken = await login(viewerUsername);
        pass("viewer login succeeded");

        browser = await chromium.launch({ headless: true });

        for (const profile of VIEWPORTS) {
            try {
                await runProfile(browser, profile, viewerToken);
            } catch (err) {
                exitCode = 1;
                console.error(`[smoke:header-deposit-shortcut] ${profile.name} failed: ${err?.message || err}`);
            }
        }
    } catch (err) {
        exitCode = 1;
        console.error(`[smoke:header-deposit-shortcut] fatal: ${err?.message || err}`);
    } finally {
        if (browser) {
            try { await browser.close(); } catch { /* ignored */ }
        }
        try { await cleanup(); } catch (cleanupError) {
            console.error(`[smoke:header-deposit-shortcut] cleanup error: ${cleanupError?.message || cleanupError}`);
        }
        await pool.end().catch(() => {});
    }

    const passed = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).length;
    if (exitCode === 0 && failed === 0) {
        console.log(`\n[smoke:header-deposit-shortcut] OK — ${passed} checks passed`);
    } else {
        console.log(`\n[smoke:header-deposit-shortcut] FAIL — ${passed} passed, ${failed} failed`);
        exitCode = 1;
    }
    process.exit(exitCode);
}

main();
