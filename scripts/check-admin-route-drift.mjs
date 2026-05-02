import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ADMIN_ROUTE_PATHS = [
    "/admin/dashboard",
    "/admin/users",
    "/admin/transactions",
    "/admin/games",
    "/admin/game-sections",
    "/admin/challenges",
    "/admin/challenge-settings",
    "/admin/p2p",
    "/admin/support-settings",
    "/admin/id-verification",
    "/admin/support",
    "/admin/anti-cheat",
    "/admin/payment-security",
    "/admin/chat-management",
    "/admin/sam9",
    "/admin/analytics",
    "/admin/disputes",
    "/admin/free-play",
    "/admin/marketers",
    "/admin/gifts",
    "/admin/investments",
    "/admin/finance",
    "/admin/agents",
    "/admin/tournaments",
    "/admin/audit-logs",
    "/admin/app-settings",
    "/admin/currency",
    "/admin/seo",
    "/admin/sections",
    "/admin/social-platforms",
    "/admin/languages",
    "/admin/badges",
    "/admin/notifications",
    "/admin/payment-methods",
    "/admin/integrations",
    "/admin/announcements",
];

async function main() {
    const filesToCheck = [
        "client/src/private-routes.tsx",
        "client/src/pages/admin/admin-layout.tsx",
        "server/routes/index.ts",
        "server/admin-routes/index.ts",
        "server/routes/investments.ts",
        "server/admin-routes/admin-currency/marketer-program.ts",
    ];

    const missing = [];

    for (const filePath of filesToCheck) {
        const content = await readFile(resolve(filePath), "utf8");
        for (const routePath of ADMIN_ROUTE_PATHS) {
            if (!content.includes(routePath)) {
                missing.push(`${filePath} -> ${routePath}`);
            }
        }
    }

    if (missing.length > 0) {
        console.error("Admin route drift detected:");
        for (const line of missing) {
            console.error(`- ${line}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log("Admin route drift check passed.");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
