import { readFile } from "fs/promises";
import { resolve } from "path";
import { ADMIN_ROUTE_PATHS } from "../shared/admin-routing";

async function main() {
    const filesToCheck = [
        "client/src/private-routes.tsx",
        "client/src/pages/admin/admin-layout.tsx",
        "server/routes/index.ts",
        "server/admin-routes/index.ts",
        "server/routes/investments.ts",
        "server/admin-routes/admin-currency/marketer-program.ts",
    ];

    const missing: string[] = [];

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

void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
});
