/**
 * Smoke test for the wallet-aware tournament "Insufficient balance"
 * UX contract (Task #93 / #120).
 *
 * Background
 * ----------
 * Task #93 split the generic `Insufficient balance` toast into wallet
 * -aware variants:
 *
 *   - Server (`server/routes/tournaments/registration.ts`) throws an
 *     `InsufficientBalanceError` and the catch block returns a 400 with
 *     a structured payload — `{ error, walletKind, currency, required,
 *     available }` — for both the project-wallet branch (`!wallet` and
 *     `totalBefore < entryFee`) and the cash/USD branch
 *     (`balanceBeforeValue < entryFee`, plus the `!userRow` guard and
 *     the catch-block `Insufficient` rethrow from
 *     `adjustUserCurrencyBalance`).
 *
 *   - Client (`client/src/pages/tournaments.tsx`) parses that payload
 *     via `parseTournamentInsufficientBalance` and renders the
 *     wallet-specific en+ar copy through `formatTournamentAmountText`,
 *     so the user sees "Need X, you have Y" in the right currency
 *     instead of a generic "Insufficient balance".
 *
 * Why this smoke exists
 * ---------------------
 * Nothing in the existing test surface locks down this contract. A
 * future refactor that:
 *
 *   - drops one of the structured 400 fields (`walletKind`,
 *     `currency`, `required`, `available`),
 *   - replaces `parseTournamentInsufficientBalance` with a regex that
 *     no longer matches the `\d{3}\s*:\s*{...}` envelope shape, or
 *   - rewrites the toast copy in en/ar without re-applying
 *     `formatTournamentAmountText`,
 *
 * would silently regress the player back to the ambiguous
 * "Insufficient balance" toast — invisible to TypeScript, invisible
 * to lint. This script asserts the contract in three layers, mirroring
 * the proven shape of `smoke-tournament-wallet-display.ts` and
 * `smoke-game-speed.ts`:
 *
 *   1) **Behavioural** — exercise `formatTournamentAmountText` over
 *      both wallet kinds (USD + project) so the toast formatter we
 *      depend on still produces "$X.YY" / "VXC X.YY" strings.
 *
 *   2) **Source-pattern guards** on the actual server route and
 *      client page — re-read each file and assert every required
 *      throw site, the catch-block 400 envelope, the parser
 *      validation, and the en+ar toast copy.
 *
 *   3) **Simulator** — re-implement the client-side
 *      `parseTournamentInsufficientBalance` regex + validation in
 *      pure TS and walk every documented branch (valid cash, valid
 *      project, malformed envelope, wrong walletKind, wrong currency,
 *      garbage JSON) so the source-pattern guards stay in sync with
 *      the real parser's semantics.
 *
 * No DB, no server, no React render — pure TS, ~200 ms wall time.
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label: string): void {
    passed += 1;
    console.log(`[smoke:tournament-insufficient-error] PASS ${label}`);
}

function fail(label: string, detail?: string): void {
    failed += 1;
    console.log(
        `[smoke:tournament-insufficient-error] FAIL ${label}${detail ? `\n            -> ${detail}` : ""}`,
    );
}

async function readText(p: string): Promise<string | null> {
    try {
        return await fs.readFile(p, "utf8");
    } catch {
        return null;
    }
}

interface CurrencyModule {
    formatTournamentAmountText: (
        amount: string | number | null | undefined,
        currency: unknown,
    ) => string;
}

async function loadCurrencyModule(): Promise<CurrencyModule> {
    const mod = await import("../shared/tournament-currency");
    return mod as unknown as CurrencyModule;
}

/* ────────────────────────────────────────────────────────────────────────
 * Simulator — re-implements the client's
 * `parseTournamentInsufficientBalance` so we can walk every branch
 * without mounting React. The source-pattern guards below ensure the
 * real parser still matches this shape.
 * ──────────────────────────────────────────────────────────────────── */

interface SimulatedPayload {
    walletKind: "cash" | "project";
    currency: "usd" | "project";
    required: string;
    available: string;
}

function simulateParse(errorMessage: string): SimulatedPayload | null {
    const match = /^\s*\d{3}\s*:\s*(\{[\s\S]*\})\s*$/.exec(errorMessage);
    if (!match) return null;
    let body: unknown;
    try {
        body = JSON.parse(match[1]);
    } catch {
        return null;
    }
    if (!body || typeof body !== "object") return null;
    const obj = body as Record<string, unknown>;
    if (obj.walletKind !== "cash" && obj.walletKind !== "project") return null;
    if (obj.currency !== "usd" && obj.currency !== "project") return null;
    return {
        walletKind: obj.walletKind,
        currency: obj.currency,
        required:
            typeof obj.required === "string"
                ? obj.required
                : String(obj.required ?? "0"),
        available:
            typeof obj.available === "string"
                ? obj.available
                : String(obj.available ?? "0"),
    };
}

async function main(): Promise<void> {
    const currency = await loadCurrencyModule();
    const fmt = currency.formatTournamentAmountText;

    /* ────────────────────────────────────────────────────────────────
     * 1) Behavioural — `formatTournamentAmountText` for both wallet
     *    kinds. The toast copy stitches required + available through
     *    this formatter, so a regression here cascades into a
     *    misleading "$NaN" / "VXC undefined" toast for the player.
     * ──────────────────────────────────────────────────────────────── */
    if (fmt("10.00", "usd") === "$10.00") {
        pass("formatTournamentAmountText('10.00', 'usd') -> '$10.00'");
    } else {
        fail(
            "formatTournamentAmountText('10.00', 'usd') -> '$10.00'",
            fmt("10.00", "usd"),
        );
    }
    if (fmt("0.50", "usd") === "$0.50") {
        pass(
            "formatTournamentAmountText('0.50', 'usd') -> '$0.50' (typical 'available' value)",
        );
    } else {
        fail(
            "formatTournamentAmountText('0.50', 'usd') -> '$0.50'",
            fmt("0.50", "usd"),
        );
    }
    if (fmt("100", "project") === "VXC 100.00") {
        pass("formatTournamentAmountText('100', 'project') -> 'VXC 100.00'");
    } else {
        fail(
            "formatTournamentAmountText('100', 'project') -> 'VXC 100.00'",
            fmt("100", "project"),
        );
    }
    if (fmt("5.00", "project") === "VXC 5.00") {
        pass(
            "formatTournamentAmountText('5.00', 'project') -> 'VXC 5.00' (typical 'available' value)",
        );
    } else {
        fail(
            "formatTournamentAmountText('5.00', 'project') -> 'VXC 5.00'",
            fmt("5.00", "project"),
        );
    }

    /* ────────────────────────────────────────────────────────────────
     * 2) Server source-pattern guards on
     *    `server/routes/tournaments/registration.ts`.
     * ──────────────────────────────────────────────────────────────── */
    const serverSrc = await readText(
        path.join(REPO_ROOT, "server/routes/tournaments/registration.ts"),
    );
    if (!serverSrc) {
        fail("Read server/routes/tournaments/registration.ts", "file not found");
    } else {
        const serverGuards: ReadonlyArray<{ name: string; re: RegExp }> = [
            {
                name: "Server defines `class InsufficientBalanceError extends Error`",
                re: /class\s+InsufficientBalanceError\s+extends\s+Error\b/,
            },
            {
                name: "InsufficientBalanceError carries `walletKind`, `currency`, `required`, `available` fields",
                re: /InsufficientBalanceError[\s\S]{0,400}readonly\s+walletKind[\s\S]{0,200}readonly\s+currency[\s\S]{0,200}readonly\s+required[\s\S]{0,200}readonly\s+available/,
            },
            {
                name: 'InsufficientBalanceError super() branches: project -> "Insufficient project balance"',
                re: /args\.walletKind\s*===\s*["']project["'][\s\S]{0,80}["']Insufficient project balance["']/,
            },
            {
                name: 'InsufficientBalanceError super() branches: cash -> "Insufficient cash balance"',
                re: /["']Insufficient cash balance["']/,
            },
            {
                name: "Project-wallet path throws `InsufficientBalanceError({ walletKind: 'project' })` when wallet row is missing",
                re: /if\s*\(\s*!wallet\s*\)\s*\{[\s\S]{0,120}throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}walletKind\s*:\s*["']project["']/,
            },
            {
                name: "Project-wallet path throws `InsufficientBalanceError({ walletKind: 'project' })` when totalBefore < entryFee",
                re: /totalBefore\s*<\s*normalizedEntryFee[\s\S]{0,200}throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}walletKind\s*:\s*["']project["']/,
            },
            {
                name: "Cash-wallet path throws `InsufficientBalanceError({ walletKind: 'cash' })` when user row is missing",
                re: /if\s*\(\s*!userRow\s*\)\s*\{[\s\S]{0,120}throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}walletKind\s*:\s*["']cash["']/,
            },
            {
                name: "Cash-wallet path throws `InsufficientBalanceError({ walletKind: 'cash' })` when balanceBeforeValue < entryFee",
                re: /balanceBeforeValue\s*<\s*normalizedEntryFee[\s\S]{0,200}throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}walletKind\s*:\s*["']cash["']/,
            },
            {
                name: "Cash-wallet path rethrows `InsufficientBalanceError({ walletKind: 'cash' })` when adjustUserCurrencyBalance reports `Insufficient`",
                re: /msg\.startsWith\(\s*["']Insufficient["']\s*\)[\s\S]{0,200}throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}walletKind\s*:\s*["']cash["']/,
            },
            {
                name: "InsufficientBalanceError throws always carry `required` and `available` numbers",
                re: /throw\s+new\s+InsufficientBalanceError\(\s*\{[\s\S]{0,200}required\s*:\s*[\s\S]{0,80}available\s*:/,
            },
            {
                name: "Catch block detects `error instanceof InsufficientBalanceError`",
                re: /error\s+instanceof\s+InsufficientBalanceError/,
            },
            {
                name: "Catch block returns 400 with `error`, `walletKind`, `currency`, `required`, `available` fields",
                re: /res\s*\.status\(\s*400\s*\)\s*\.json\(\s*\{[\s\S]{0,400}error\s*:\s*error\.message[\s\S]{0,400}walletKind\s*:\s*error\.walletKind[\s\S]{0,400}currency\s*:\s*error\.currency[\s\S]{0,400}required\s*:\s*error\.required\.toFixed\(\s*2\s*\)[\s\S]{0,400}available\s*:\s*error\.available\.toFixed\(\s*2\s*\)/,
            },
        ];

        for (const guard of serverGuards) {
            if (guard.re.test(serverSrc)) {
                pass(guard.name);
            } else {
                fail(guard.name, "pattern not found in registration.ts");
            }
        }
    }

    /* ────────────────────────────────────────────────────────────────
     * 3) Client source-pattern guards on
     *    `client/src/pages/tournaments.tsx`.
     * ──────────────────────────────────────────────────────────────── */
    const clientSrc = await readText(
        path.join(REPO_ROOT, "client/src/pages/tournaments.tsx"),
    );
    if (!clientSrc) {
        fail("Read client/src/pages/tournaments.tsx", "file not found");
    } else {
        const clientGuards: ReadonlyArray<{ name: string; re: RegExp }> = [
            {
                name: "Client declares the TournamentInsufficientBalancePayload shape (cash|project + usd|project + required + available)",
                re: /interface\s+TournamentInsufficientBalancePayload\s*\{[\s\S]{0,400}walletKind\s*:\s*['"]cash['"]\s*\|\s*['"]project['"][\s\S]{0,200}currency\s*:\s*['"]usd['"]\s*\|\s*['"]project['"][\s\S]{0,200}required\s*:\s*string[\s\S]{0,80}available\s*:\s*string/,
            },
            {
                name: "parseTournamentInsufficientBalance() exists with the documented signature",
                re: /function\s+parseTournamentInsufficientBalance\s*\(\s*errorMessage\s*:\s*string\s*,?\s*\)\s*:\s*TournamentInsufficientBalancePayload\s*\|\s*null/,
            },
            {
                name: "Parser matches the `^\\d{3}\\s*:\\s*{...}` envelope produced by apiRequest()",
                re: /\/\^\\s\*\\d\{3\}\\s\*:\\s\*\(\\\{\[\\s\\S\]\*\\\}\)\\s\*\$\//,
            },
            {
                name: "Parser rejects payloads where walletKind is not 'cash'/'project'",
                re: /obj\.walletKind\s*!==\s*['"]cash['"]\s*&&\s*obj\.walletKind\s*!==\s*['"]project['"]/,
            },
            {
                name: "Parser rejects payloads where currency is not 'usd'/'project'",
                re: /obj\.currency\s*!==\s*['"]usd['"]\s*&&\s*obj\.currency\s*!==\s*['"]project['"]/,
            },
            {
                name: "Parser surfaces required/available as strings (so toFixed-formatted server values pass through unchanged)",
                re: /required\s*:\s*typeof\s+obj\.required\s*===\s*['"]string['"][\s\S]{0,200}available\s*:\s*typeof\s+obj\.available\s*===\s*['"]string['"]/,
            },
            {
                name: "registerMutation.onError calls parseTournamentInsufficientBalance(err.message)",
                re: /registerMutation[\s\S]{0,800}onError[\s\S]{0,400}parseTournamentInsufficientBalance\(\s*err\.message\s*\)/,
            },
            {
                name: "Toast formats `required` through formatTournamentAmountText with the parsed currency",
                re: /requiredText\s*=\s*formatTournamentAmountText\(\s*insufficient\.required\s*,\s*insufficient\.currency\s*\)/,
            },
            {
                name: "Toast formats `available` through formatTournamentAmountText with the parsed currency",
                re: /availableText\s*=\s*formatTournamentAmountText\(\s*insufficient\.available\s*,\s*insufficient\.currency\s*\)/,
            },
            {
                name: "Toast branches on insufficient.walletKind === 'project' for the VXC variant",
                re: /insufficient\.walletKind\s*===\s*['"]project['"]/,
            },
            {
                name: "English VXC toast copy: 'Not enough VXC balance. Need ${requiredText}, you have ${availableText}.'",
                re: /Not enough VXC balance\. Need \$\{requiredText\}, you have \$\{availableText\}\./,
            },
            {
                name: "Arabic VXC toast copy: 'رصيد VXC غير كافٍ. تحتاج ${requiredText}، لديك ${availableText}.'",
                re: /رصيد VXC غير كافٍ\. تحتاج \$\{requiredText\}، لديك \$\{availableText\}\./,
            },
            {
                name: "English cash toast copy: 'Not enough cash balance. Need ${requiredText}, you have ${availableText}.'",
                re: /Not enough cash balance\. Need \$\{requiredText\}, you have \$\{availableText\}\./,
            },
            {
                name: "Arabic cash toast copy: 'رصيد النقود غير كافٍ. تحتاج ${requiredText}، لديك ${availableText}.'",
                re: /رصيد النقود غير كافٍ\. تحتاج \$\{requiredText\}، لديك \$\{availableText\}\./,
            },
        ];

        for (const guard of clientGuards) {
            if (guard.re.test(clientSrc)) {
                pass(guard.name);
            } else {
                fail(guard.name, "pattern not found in tournaments.tsx");
            }
        }
    }

    /* ────────────────────────────────────────────────────────────────
     * 4) Simulator — walk every documented parser branch.
     * ──────────────────────────────────────────────────────────────── */

    /* 4a) Cash/USD payload — the most common server response. */
    {
        const result = simulateParse(
            '400: {"error":"Insufficient cash balance","walletKind":"cash","currency":"usd","required":"10.00","available":"0.50"}',
        );
        if (
            result
            && result.walletKind === "cash"
            && result.currency === "usd"
            && result.required === "10.00"
            && result.available === "0.50"
        ) {
            pass(
                "Parser returns cash/USD payload for a 400 envelope (Need $10.00, you have $0.50)",
            );
        } else {
            fail(
                "Parser returns cash/USD payload for a 400 envelope",
                JSON.stringify(result),
            );
        }
    }

    /* 4b) Project/VXC payload — exercised whenever the project wallet is
     *     short (the new code path Task #93 added). */
    {
        const result = simulateParse(
            '400: {"error":"Insufficient project balance","walletKind":"project","currency":"project","required":"100.00","available":"5.00"}',
        );
        if (
            result
            && result.walletKind === "project"
            && result.currency === "project"
            && result.required === "100.00"
            && result.available === "5.00"
        ) {
            pass(
                "Parser returns project/VXC payload for a 400 envelope (Need VXC 100.00, you have VXC 5.00)",
            );
        } else {
            fail(
                "Parser returns project/VXC payload for a 400 envelope",
                JSON.stringify(result),
            );
        }
    }

    /* 4c) Numeric required/available — server `toFixed(2)` guarantees
     *     strings, but we still tolerate a stray number so a future
     *     server tweak doesn't silently fall back to the generic toast. */
    {
        const result = simulateParse(
            '400: {"walletKind":"cash","currency":"usd","required":10,"available":0.5}',
        );
        if (
            result
            && result.required === "10"
            && result.available === "0.5"
        ) {
            pass(
                "Parser stringifies numeric required/available fields (10 -> '10', 0.5 -> '0.5')",
            );
        } else {
            fail(
                "Parser stringifies numeric required/available fields",
                JSON.stringify(result),
            );
        }
    }

    /* 4d) Generic "Insufficient balance" message (no envelope) — falls
     *     through to the original toast so the player still sees an
     *     error, just without the wallet-aware copy. */
    {
        const result = simulateParse("Insufficient balance");
        if (result === null) {
            pass(
                "Parser returns null for a bare 'Insufficient balance' message (graceful fallback)",
            );
        } else {
            fail(
                "Parser returns null for a bare 'Insufficient balance' message",
                JSON.stringify(result),
            );
        }
    }

    /* 4e) Wrong walletKind — must reject so we don't render a misleading
     *     copy when a future field value drifts. */
    {
        const result = simulateParse(
            '400: {"walletKind":"crypto","currency":"usd","required":"1","available":"0"}',
        );
        if (result === null) {
            pass(
                "Parser rejects unknown walletKind ('crypto' is not 'cash'/'project')",
            );
        } else {
            fail(
                "Parser rejects unknown walletKind",
                JSON.stringify(result),
            );
        }
    }

    /* 4f) Wrong currency — same reasoning as 4e but on the currency field. */
    {
        const result = simulateParse(
            '400: {"walletKind":"cash","currency":"eur","required":"1","available":"0"}',
        );
        if (result === null) {
            pass(
                "Parser rejects unknown currency ('eur' is not 'usd'/'project')",
            );
        } else {
            fail(
                "Parser rejects unknown currency",
                JSON.stringify(result),
            );
        }
    }

    /* 4g) Garbage JSON inside the envelope — must not throw, must fall
     *     back to null. */
    {
        const result = simulateParse("400: {not valid json");
        if (result === null) {
            pass(
                "Parser returns null for a malformed JSON body (does not throw)",
            );
        } else {
            fail(
                "Parser returns null for malformed JSON",
                JSON.stringify(result),
            );
        }
    }

    /* 4h) Server returns a 500 envelope by mistake — parser must still
     *     refuse it cleanly so the client falls back to the raw error. */
    {
        const result = simulateParse(
            '500: {"walletKind":"cash","currency":"usd","required":"1","available":"0"}',
        );
        // The current parser intentionally accepts ANY 3-digit prefix —
        // the 500 envelope passes through too. We pin that behaviour so
        // a future stricter parser does not accidentally regress on
        // server-side error rewrites.
        if (
            result
            && result.walletKind === "cash"
            && result.currency === "usd"
        ) {
            pass(
                "Parser accepts any 3-digit status prefix (locks current behaviour against accidental tightening)",
            );
        } else {
            fail(
                "Parser accepts any 3-digit status prefix",
                JSON.stringify(result),
            );
        }
    }

    /* ────────────────────────────────────────────────────────────────
     * 5) Wiring — ensure the smoke is actually picked up by
     *    package.json so `quality:gate:tournaments` exercises it.
     * ──────────────────────────────────────────────────────────────── */
    const pkgSrc = await readText(path.join(REPO_ROOT, "package.json"));
    if (!pkgSrc) {
        fail("Read package.json", "file not found");
    } else {
        if (
            /"quality:smoke:tournament-insufficient-error"\s*:\s*"tsx scripts\/smoke-tournament-insufficient-error\.ts"/.test(
                pkgSrc,
            )
        ) {
            pass(
                "package.json exposes a `quality:smoke:tournament-insufficient-error` script",
            );
        } else {
            fail(
                "package.json exposes a `quality:smoke:tournament-insufficient-error` script",
                "script entry missing",
            );
        }
        if (
            /"quality:gate:tournaments"\s*:\s*"[^"]*quality:smoke:tournament-insufficient-error[^"]*"/.test(
                pkgSrc,
            )
        ) {
            pass(
                "`quality:gate:tournaments` runs `quality:smoke:tournament-insufficient-error`",
            );
        } else {
            fail(
                "`quality:gate:tournaments` runs `quality:smoke:tournament-insufficient-error`",
                "gate entry missing",
            );
        }
    }

    console.log(
        `\n[smoke:tournament-insufficient-error] ${passed} passed, ${failed} failed`,
    );
    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(
        "[smoke:tournament-insufficient-error] uncaught error",
        err,
    );
    process.exitCode = 1;
});
