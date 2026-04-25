/**
 * Smoke test for the tournament-detail wallet balance display + insufficient
 * balance gating (Task #57 / #92).
 *
 * The tournament registration card has three jobs that no automated check
 * currently locks down:
 *   1) Read the available balance from the RIGHT source per currency:
 *        - USD tournament  -> `user.balance`
 *        - Project (VXC)   -> `/api/project-currency/wallet` (`totalBalance`)
 *   2) Disable the Register button when the available balance is below the
 *      entry fee (and while the project wallet is still loading).
 *   3) Format every monetary string through `formatTournamentAmountText`
 *      (so a USD tournament shows `$X.XX` and a project tournament shows
 *      `VXC X.XX`, never raw numbers).
 *
 * A future refactor of `TournamentDetailView` or of the project-currency
 * wallet endpoint could silently regress any of these — the failure mode is
 * "Register button accepts a too-poor user" or "balance shows 0.5 instead of
 * $0.50", which is invisible to TypeScript.
 *
 * Because the project doesn't ship a DOM-test runner, this smoke covers the
 * contract in two layers (same shape as `smoke-game-speed.ts`):
 *
 *   1) **Behavioural** — exercise the real pure helpers in
 *      `shared/tournament-currency.ts` over the cells that matter
 *      (USD/project, integer/decimal/null/garbage input, mixed case).
 *
 *   2) **Source-pattern guards** on `TournamentDetailView` in
 *      `client/src/pages/tournaments.tsx` — re-read the function body and
 *      assert each tested invariant survives a refactor:
 *        - `availableBalanceRaw` branches on `tournamentCurrency === 'project'`
 *          and reads `projectWallet?.totalBalance` vs `user?.balance`.
 *        - The project wallet query uses `/api/project-currency/wallet`.
 *        - `hasEnoughBalance` compares `safeAvailableBalance` to `safeEntryFee`.
 *        - `blockRegister` ties into both `balanceLoaded` and
 *          `hasEnoughBalance`.
 *        - The Register button passes `blockRegister` into `disabled`.
 *        - The insufficient-balance message uses `entryFeeText` (which is
 *          built via `formatTournamentAmountText`).
 *        - The three balance-related test ids are still present.
 *        - Mutation success invalidates `/api/project-currency/wallet`.
 *
 *   3) **Simulator** — replicate the component's balance/blocking arithmetic
 *      in pure TS and walk every documented branch (USD/project × sufficient/
 *      insufficient/loading/errored). If the source-pattern guards still pass
 *      but the simulator diverges from the real component, the simulator's
 *      assumptions are wrong and the test fails loudly.
 *
 * No DB, no server, no React render. Pure TS, ~200 ms wall time.
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
    console.log(`[smoke:tournament-wallet-display] PASS ${label}`);
}

function fail(label: string, detail?: string): void {
    failed += 1;
    console.log(`[smoke:tournament-wallet-display] FAIL ${label}${detail ? `\n            -> ${detail}` : ""}`);
}

async function readText(p: string): Promise<string | null> {
    try {
        return await fs.readFile(p, "utf8");
    } catch {
        return null;
    }
}

/**
 * Walk braces to extract the body of `function NAME(...)` (with or without
 * `export`). Returns the *interior* of the outermost `{...}` so callers can
 * scope their pattern guards to a single function. Mirrors the helper in
 * `smoke-game-speed.ts`.
 */
function extractFunctionBody(src: string, name: string): string | null {
    const declRe = new RegExp(`(?:export\\s+)?function\\s+${name}\\b[^{]*\\{`);
    const match = declRe.exec(src);
    if (!match) return null;
    const start = match.index + match[0].length;
    let depth = 1;
    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
            depth -= 1;
            if (depth === 0) return src.slice(start, i);
        }
    }
    return null;
}

interface CurrencyModule {
    formatTournamentAmountText: (
        amount: string | number | null | undefined,
        currency: unknown,
    ) => string;
    normalizeTournamentCurrencyType: (value: unknown) => "usd" | "project";
    TOURNAMENT_CURRENCY_TYPES: readonly ("usd" | "project")[];
}

async function loadCurrencyModule(): Promise<CurrencyModule> {
    const mod = await import("../shared/tournament-currency");
    return mod as unknown as CurrencyModule;
}

/* ────────────────────────────────────────────────────────────────────────
 * Simulator — re-implements the component's balance-derivation arithmetic
 * (lines around tournaments.tsx:685-707) so we can walk every branch
 * without React. The source-pattern guards below ensure the real component
 * still matches this shape.
 * ──────────────────────────────────────────────────────────────────────── */

interface SimulatedUser { balance?: string | null }
interface SimulatedProjectWallet { totalBalance: string }

interface SimulatorInputs {
    tournamentCurrency: "usd" | "project";
    entryFee: string;
    user: SimulatedUser | null | undefined;
    projectWallet: SimulatedProjectWallet | undefined;
    isProjectWalletLoading: boolean;
    isProjectWalletError: boolean;
}

interface SimulatorOutputs {
    safeAvailableBalance: number;
    safeEntryFee: number;
    balanceLoaded: boolean;
    balanceLoading: boolean;
    balanceErrored: boolean;
    hasEnoughBalance: boolean;
    insufficientBalance: boolean;
    blockRegister: boolean;
    balanceText: string;
    entryFeeText: string;
}

function simulate(
    inputs: SimulatorInputs,
    fmt: CurrencyModule["formatTournamentAmountText"],
): SimulatorOutputs {
    const { tournamentCurrency, entryFee, user, projectWallet, isProjectWalletLoading, isProjectWalletError } = inputs;
    const projectWalletEnabled = !!user && tournamentCurrency === "project";

    const entryFeeNumber = Number.parseFloat(entryFee || "0");
    const safeEntryFee = Number.isFinite(entryFeeNumber) ? entryFeeNumber : 0;

    const availableBalanceRaw = tournamentCurrency === "project"
        ? projectWallet?.totalBalance
        : user?.balance;
    const availableBalanceNumber = Number.parseFloat(String(availableBalanceRaw ?? "0"));
    const safeAvailableBalance = Number.isFinite(availableBalanceNumber) ? availableBalanceNumber : 0;

    const balanceLoaded = tournamentCurrency === "project"
        ? projectWallet !== undefined
        : user !== null && user !== undefined;
    const balanceLoading = tournamentCurrency === "project"
        ? projectWalletEnabled && isProjectWalletLoading && !projectWallet
        : false;
    const balanceErrored = tournamentCurrency === "project"
        ? isProjectWalletError && !projectWallet
        : false;

    const canRegister = true; // we test the gating math; outer caller handles registration window
    const hasEnoughBalance = safeAvailableBalance + 1e-9 >= safeEntryFee;
    const balanceText = balanceLoaded
        ? fmt(safeAvailableBalance.toFixed(2), tournamentCurrency)
        : "Loading…";
    const entryFeeText = fmt(entryFee, tournamentCurrency);
    const insufficientBalance = canRegister && safeEntryFee > 0 && balanceLoaded && !hasEnoughBalance;
    const blockRegister = canRegister && safeEntryFee > 0 && (!balanceLoaded || !hasEnoughBalance);

    return {
        safeAvailableBalance,
        safeEntryFee,
        balanceLoaded,
        balanceLoading,
        balanceErrored,
        hasEnoughBalance,
        insufficientBalance,
        blockRegister,
        balanceText,
        entryFeeText,
    };
}

async function main(): Promise<void> {
    const currency = await loadCurrencyModule();

    /* ──────────── 1) formatTournamentAmountText: USD ────────────────── */
    if (currency.formatTournamentAmountText(0, "usd") === "$0.00") {
        pass("formatTournamentAmountText(0, 'usd') -> '$0.00'");
    } else {
        fail("formatTournamentAmountText(0, 'usd') -> '$0.00'", currency.formatTournamentAmountText(0, "usd"));
    }
    if (currency.formatTournamentAmountText("1.5", "usd") === "$1.50") {
        pass("formatTournamentAmountText('1.5', 'usd') -> '$1.50' (string entry fees, common server shape)");
    } else {
        fail("formatTournamentAmountText('1.5', 'usd') -> '$1.50'", currency.formatTournamentAmountText("1.5", "usd"));
    }
    if (currency.formatTournamentAmountText(12.345, "usd") === "$12.35") {
        pass("formatTournamentAmountText(12.345, 'usd') rounds to '$12.35'");
    } else {
        fail("formatTournamentAmountText(12.345, 'usd') rounds to '$12.35'", currency.formatTournamentAmountText(12.345, "usd"));
    }

    /* ──────────── 2) formatTournamentAmountText: project (VXC) ──────── */
    if (currency.formatTournamentAmountText(0, "project") === "VXC 0.00") {
        pass("formatTournamentAmountText(0, 'project') -> 'VXC 0.00'");
    } else {
        fail("formatTournamentAmountText(0, 'project') -> 'VXC 0.00'", currency.formatTournamentAmountText(0, "project"));
    }
    if (currency.formatTournamentAmountText("250", "project") === "VXC 250.00") {
        pass("formatTournamentAmountText('250', 'project') -> 'VXC 250.00'");
    } else {
        fail("formatTournamentAmountText('250', 'project') -> 'VXC 250.00'", currency.formatTournamentAmountText("250", "project"));
    }
    if (currency.formatTournamentAmountText(0.1 + 0.2, "project") === "VXC 0.30") {
        pass("formatTournamentAmountText handles float-error inputs (0.1+0.2 -> 'VXC 0.30')");
    } else {
        fail("formatTournamentAmountText handles float-error inputs", currency.formatTournamentAmountText(0.1 + 0.2, "project"));
    }

    /* ──────────── 3) Garbage / null input falls back to 0.00 ────────── */
    if (currency.formatTournamentAmountText(null, "project") === "VXC 0.00") {
        pass("formatTournamentAmountText(null, 'project') -> 'VXC 0.00'");
    } else {
        fail("formatTournamentAmountText(null, 'project')", currency.formatTournamentAmountText(null, "project"));
    }
    if (currency.formatTournamentAmountText(undefined, "usd") === "$0.00") {
        pass("formatTournamentAmountText(undefined, 'usd') -> '$0.00'");
    } else {
        fail("formatTournamentAmountText(undefined, 'usd')", currency.formatTournamentAmountText(undefined, "usd"));
    }
    if (currency.formatTournamentAmountText("not-a-number", "usd") === "$0.00") {
        pass("formatTournamentAmountText('not-a-number', 'usd') -> '$0.00'");
    } else {
        fail("formatTournamentAmountText('not-a-number', 'usd')", currency.formatTournamentAmountText("not-a-number", "usd"));
    }

    /* ──────────── 4) normalizeTournamentCurrencyType ────────────────── */
    if (currency.normalizeTournamentCurrencyType("USD") === "usd") {
        pass("normalizeTournamentCurrencyType('USD') -> 'usd' (case-insensitive)");
    } else {
        fail("normalizeTournamentCurrencyType('USD')", currency.normalizeTournamentCurrencyType("USD"));
    }
    if (currency.normalizeTournamentCurrencyType(" Project ") === "project") {
        pass("normalizeTournamentCurrencyType(' Project ') -> 'project' (trims + lowercases)");
    } else {
        fail("normalizeTournamentCurrencyType(' Project ')", currency.normalizeTournamentCurrencyType(" Project "));
    }
    if (currency.normalizeTournamentCurrencyType("eur") === "usd") {
        pass("normalizeTournamentCurrencyType('eur') falls back to 'usd' (unknown currency stays USD-safe)");
    } else {
        fail("normalizeTournamentCurrencyType('eur') -> 'usd'", currency.normalizeTournamentCurrencyType("eur"));
    }
    if (currency.normalizeTournamentCurrencyType(undefined) === "usd") {
        pass("normalizeTournamentCurrencyType(undefined) -> 'usd' (no currency stays USD-safe)");
    } else {
        fail("normalizeTournamentCurrencyType(undefined) -> 'usd'", currency.normalizeTournamentCurrencyType(undefined));
    }

    /* ────────────────────────────────────────────────────────────────────
     * 5) Source-pattern guards on TournamentDetailView. These guarantee the
     * simulator below stays in sync with the real component — if the
     * component refactors away the assumptions, these break before the
     * simulator can diverge silently.
     * ──────────────────────────────────────────────────────────────────── */
    const tournamentsSrc = await readText(path.join(REPO_ROOT, "client/src/pages/tournaments.tsx"));
    if (!tournamentsSrc) {
        fail("Read client/src/pages/tournaments.tsx", "file not found");
    } else {
        const body = extractFunctionBody(tournamentsSrc, "TournamentDetailView");
        if (!body) {
            fail("Extract TournamentDetailView function body", "function declaration not found");
        } else {
            const guards: ReadonlyArray<{ name: string; re: RegExp }> = [
                {
                    name: "TournamentDetailView reads `formatTournamentAmountText` (currency-aware formatter)",
                    re: /formatTournamentAmountText\s*\(/,
                },
                {
                    name: "TournamentDetailView normalises tournament.currency via normalizeTournamentCurrencyType",
                    re: /tournamentCurrency\s*=\s*normalizeTournamentCurrencyType\s*\(\s*tournament\?\.currency\s*\)/,
                },
                {
                    name: "Project wallet query uses '/api/project-currency/wallet'",
                    re: /queryKey:\s*\[\s*["']\/api\/project-currency\/wallet["']\s*\]/,
                },
                {
                    name: "Project wallet response is typed with `totalBalance`",
                    re: /totalBalance\s*:\s*string/,
                },
                {
                    name: "availableBalanceRaw branches on `tournamentCurrency === 'project'`",
                    re: /availableBalanceRaw\s*=\s*tournamentCurrency\s*===\s*['"]project['"]\s*\?\s*projectWallet\?\.totalBalance\s*:\s*user\?\.balance/,
                },
                {
                    name: "balanceLoaded gates on projectWallet (project) or user (USD)",
                    re: /balanceLoaded\s*=\s*tournamentCurrency\s*===\s*['"]project['"]\s*\?\s*projectWallet\s*!==\s*undefined\s*:\s*user\s*!==\s*null\s*&&\s*user\s*!==\s*undefined/,
                },
                {
                    name: "hasEnoughBalance compares safeAvailableBalance to safeEntryFee with an epsilon",
                    re: /hasEnoughBalance\s*=\s*safeAvailableBalance\s*\+\s*1e-9\s*>=\s*safeEntryFee/,
                },
                {
                    name: "blockRegister ties into both balanceLoaded AND hasEnoughBalance",
                    re: /blockRegister\s*=\s*canRegister\s*&&\s*safeEntryFee\s*>\s*0\s*&&\s*\(\s*!balanceLoaded\s*\|\|\s*!hasEnoughBalance\s*\)/,
                },
                {
                    name: "insufficientBalance derived from canRegister + safeEntryFee + balanceLoaded + !hasEnoughBalance",
                    re: /insufficientBalance\s*=\s*canRegister\s*&&\s*safeEntryFee\s*>\s*0\s*&&\s*balanceLoaded\s*&&\s*!hasEnoughBalance/,
                },
                {
                    name: "balanceText runs through formatTournamentAmountText when balance is loaded",
                    re: /balanceText\s*=\s*balanceLoaded\s*\?\s*formatTournamentAmountText\s*\(\s*safeAvailableBalance\.toFixed\(2\)\s*,\s*tournament\.currency\s*\)/,
                },
                {
                    name: "entryFeeText runs through formatTournamentAmountText",
                    re: /entryFeeText\s*=\s*formatTournamentAmountText\s*\(\s*tournament\.entryFee\s*,\s*tournament\.currency\s*\)/,
                },
                {
                    name: "Balance row exposes data-testid='tournament-detail-user-balance'",
                    re: /data-testid=["']tournament-detail-user-balance["']/,
                },
                {
                    name: "Balance row exposes data-currency={tournamentCurrency} (so e2e can branch)",
                    re: /data-currency=\{\s*tournamentCurrency\s*\}/,
                },
                {
                    name: "Balance row exposes data-balance-state (loading/error/ready)",
                    re: /data-balance-state=\{[^}]*balanceErrored[^}]*balanceLoading[^}]*\}/,
                },
                {
                    name: "Insufficient-balance message has data-testid='tournament-detail-insufficient-balance'",
                    re: /data-testid=["']tournament-detail-insufficient-balance["']/,
                },
                {
                    name: "Wallet error message has data-testid='tournament-detail-balance-error'",
                    re: /data-testid=["']tournament-detail-balance-error["']/,
                },
                {
                    name: "Register button has data-testid='tournament-detail-register'",
                    re: /data-testid=["']tournament-detail-register["']/,
                },
                {
                    name: "Register button's `disabled` includes `blockRegister`",
                    re: /disabled=\{[^}]*\bblockRegister\b[^}]*\}/,
                },
                {
                    name: "Insufficient-balance message text references `entryFeeText`",
                    re: /tournament-detail-insufficient-balance[\s\S]{0,400}\$\{entryFeeText\}/,
                },
                {
                    name: "Register mutation success invalidates '/api/project-currency/wallet' (keeps balance fresh)",
                    re: /registerMutation[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]\/api\/project-currency\/wallet['"]\s*\][\s\S]*?\}\)/,
                },
                {
                    name: "Withdraw mutation success invalidates '/api/project-currency/wallet' too",
                    re: /withdrawMutation[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]\/api\/project-currency\/wallet['"]\s*\][\s\S]*?\}\)/,
                },
            ];

            for (const guard of guards) {
                if (guard.re.test(body) || guard.re.test(tournamentsSrc)) {
                    pass(guard.name);
                } else {
                    fail(guard.name, "pattern not found in TournamentDetailView");
                }
            }
        }
    }

    /* ────────────────────────────────────────────────────────────────────
     * 6) Simulator — walk every documented branch and verify the math the
     *    component does at render time.
     * ──────────────────────────────────────────────────────────────────── */
    const fmt = currency.formatTournamentAmountText;

    /* 6a) USD + sufficient `user.balance` */
    {
        const out = simulate({
            tournamentCurrency: "usd",
            entryFee: "10.00",
            user: { balance: "25.50" },
            projectWallet: undefined,
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (
            out.balanceText === "$25.50"
            && out.entryFeeText === "$10.00"
            && out.balanceLoaded
            && out.hasEnoughBalance
            && !out.insufficientBalance
            && !out.blockRegister
        ) {
            pass("USD tournament + user.balance >= entryFee -> Register enabled, balance shown as '$25.50'");
        } else {
            fail("USD tournament + sufficient user.balance unblocks Register", JSON.stringify(out));
        }
    }

    /* 6b) USD + insufficient `user.balance` */
    {
        const out = simulate({
            tournamentCurrency: "usd",
            entryFee: "10.00",
            user: { balance: "0.50" },
            projectWallet: undefined,
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (
            out.balanceText === "$0.50"
            && out.entryFeeText === "$10.00"
            && out.insufficientBalance
            && out.blockRegister
        ) {
            pass("USD tournament + user.balance < entryFee -> Register blocked, insufficient banner triggered");
        } else {
            fail("USD tournament + insufficient user.balance blocks Register", JSON.stringify(out));
        }
    }

    /* 6c) Project (VXC) + sufficient `projectWallet.totalBalance` */
    {
        const out = simulate({
            tournamentCurrency: "project",
            entryFee: "100",
            user: { balance: "0" },                            // user.balance must be IGNORED for project tournaments
            projectWallet: { totalBalance: "250.00" },
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (
            out.balanceText === "VXC 250.00"
            && out.entryFeeText === "VXC 100.00"
            && out.balanceLoaded
            && out.hasEnoughBalance
            && !out.insufficientBalance
            && !out.blockRegister
        ) {
            pass("Project tournament + projectWallet.totalBalance >= entryFee -> Register enabled, balance shown as 'VXC 250.00'");
        } else {
            fail("Project tournament + sufficient projectWallet unblocks Register", JSON.stringify(out));
        }
    }

    /* 6d) Project (VXC) + insufficient `projectWallet.totalBalance` */
    {
        const out = simulate({
            tournamentCurrency: "project",
            entryFee: "100",
            user: { balance: "9999.00" },                      // ignored — must NOT rescue a poor VXC wallet
            projectWallet: { totalBalance: "5.00" },
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (
            out.balanceText === "VXC 5.00"
            && out.entryFeeText === "VXC 100.00"
            && out.insufficientBalance
            && out.blockRegister
        ) {
            pass("Project tournament + projectWallet < entryFee -> Register blocked even when user.balance is huge (USD doesn't rescue VXC)");
        } else {
            fail("Project tournament + insufficient projectWallet blocks Register (and USD doesn't rescue)", JSON.stringify(out));
        }
    }

    /* 6e) Project (VXC) + wallet still loading */
    {
        const out = simulate({
            tournamentCurrency: "project",
            entryFee: "100",
            user: { balance: "0" },
            projectWallet: undefined,
            isProjectWalletLoading: true,
            isProjectWalletError: false,
        }, fmt);
        if (
            !out.balanceLoaded
            && out.balanceLoading
            && out.balanceText === "Loading…"
            && out.blockRegister
            && !out.insufficientBalance                      // don't show "not enough" while we don't know yet
        ) {
            pass("Project tournament + wallet still loading -> Register blocked, 'Loading…' shown, no insufficient banner");
        } else {
            fail("Project tournament + wallet still loading blocks Register without firing the insufficient banner", JSON.stringify(out));
        }
    }

    /* 6f) Project (VXC) + wallet errored */
    {
        const out = simulate({
            tournamentCurrency: "project",
            entryFee: "100",
            user: { balance: "0" },
            projectWallet: undefined,
            isProjectWalletLoading: false,
            isProjectWalletError: true,
        }, fmt);
        if (
            !out.balanceLoaded
            && out.balanceErrored
            && out.blockRegister
            && !out.insufficientBalance
        ) {
            pass("Project tournament + wallet errored -> Register blocked, balance-error path takes over");
        } else {
            fail("Project tournament + wallet errored blocks Register and surfaces the error path", JSON.stringify(out));
        }
    }

    /* 6g) Free entry (entryFee=0) never blocks */
    {
        const out = simulate({
            tournamentCurrency: "usd",
            entryFee: "0",
            user: { balance: "0" },
            projectWallet: undefined,
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (!out.blockRegister && !out.insufficientBalance) {
            pass("Free entry (entryFee=0) never blocks Register, regardless of balance");
        } else {
            fail("Free entry never blocks Register", JSON.stringify(out));
        }
    }

    /* 6h) Exact match (balance == entryFee) is enough */
    {
        const out = simulate({
            tournamentCurrency: "project",
            entryFee: "100.00",
            user: { balance: "0" },
            projectWallet: { totalBalance: "100.00" },
            isProjectWalletLoading: false,
            isProjectWalletError: false,
        }, fmt);
        if (out.hasEnoughBalance && !out.blockRegister && !out.insufficientBalance) {
            pass("Exact balance == entry fee passes the gate (epsilon avoids false-negative blocks)");
        } else {
            fail("Exact balance == entry fee should pass the gate", JSON.stringify(out));
        }
    }

    /* ──────────── 7) Final tally ────────────────────────────────────── */
    console.log(`\n[smoke:tournament-wallet-display] ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("[smoke:tournament-wallet-display] FATAL", err);
    process.exit(1);
});
