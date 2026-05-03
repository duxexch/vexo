import { readFile } from "fs/promises";
import { resolve } from "path";

const FILES_TO_CHECK = [
    "client/src/pages/p2p.tsx",
];

const FORBIDDEN_PATTERNS: Array<{ label: string; regex: RegExp }> = [
    { label: "direct activeTrade.status usage", regex: /\bactiveTrade\.status\b/ },
    { label: "direct offer.status usage", regex: /\boffer\.status\b/ },
    { label: "direct trade.status usage", regex: /\btrade\.status\b/ },
    { label: "direct tradeUiState.status usage", regex: /\btradeUiState\.status\b/ },
    { label: "direct offerUiState.status usage", regex: /\bofferUiState\.status\b/ },
    {
        label: "status-based branching",
        regex: /\bstatus\s*===\s*"(pending|paid|confirmed|completed|cancelled|disputed|active|rejected|inactive|pending_approval)"/,
    },
];

async function main() {
    const violations: Array<{ filePath: string; label: string; matches: number }> = [];

    for (const filePath of FILES_TO_CHECK) {
        const content = await readFile(resolve(filePath), "utf8");
        for (const rule of FORBIDDEN_PATTERNS) {
            const matches = content.match(new RegExp(rule.regex.source, "g"))?.length ?? 0;
            if (matches > 0) {
                violations.push({ filePath, label: rule.label, matches });
            }
        }
    }

    if (violations.length > 0) {
        console.error("P2P abstraction leakage detected:");
        for (const violation of violations) {
            console.error(`- ${violation.filePath}: ${violation.label} (${violation.matches})`);
        }
        process.exit(1);
    }

    console.log("P2P abstraction boundary check passed.");
}

void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
});
