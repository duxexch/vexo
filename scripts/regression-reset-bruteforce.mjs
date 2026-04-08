// @ts-nocheck
import { execFileSync } from "node:child_process";

const baseUrl = (process.env.SECURITY_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const appContainer = process.env.AUTH_SMOKE_APP_CONTAINER || "vex-app";
const redisContainer = process.env.AUTH_SMOKE_REDIS_CONTAINER || "vex-redis";
const dbContainer = process.env.AUTH_SMOKE_DB_CONTAINER || "vex-db";
const dbUser = process.env.AUTH_SMOKE_DB_USER || "vex_user";
const dbName = process.env.AUTH_SMOKE_DB_NAME || "vex_db";

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[auth:bruteforce] ${message}`, details);
    } else {
        console.error(`[auth:bruteforce] ${message}`);
    }
    process.exit(1);
}

function ok(message) {
    console.log(`[auth:bruteforce] PASS ${message}`);
}

function normalizeOutput(value) {
    return (value || "").trim();
}

function runRedisEval(pattern) {
    const authArgs = resolveRedisAuthArgs();
    try {
        return normalizeOutput(
            execFileSync(
                "docker",
                [
                    "exec",
                    redisContainer,
                    "redis-cli",
                    ...authArgs,
                    "--raw",
                    "EVAL",
                    "local c=0; for _,k in ipairs(redis.call('keys', ARGV[1])) do c=c+redis.call('del',k) end; return c",
                    "0",
                    pattern,
                ],
                { encoding: "utf8" },
            ),
        );
    } catch (error) {
        fail("Failed to clear Redis keys", error instanceof Error ? error.message : String(error));
    }
}

function resolveRedisAuthArgs() {
    const directPassword = process.env.AUTH_SMOKE_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
    if (directPassword) {
        return ["-a", directPassword];
    }

    try {
        const redisUrl = normalizeOutput(execFileSync("docker", ["exec", appContainer, "printenv", "REDIS_URL"], { encoding: "utf8" }));
        const match = redisUrl.match(/^redis:\/\/:([^@]+)@/);
        if (!match || !match[1]) {
            return [];
        }

        const rawPassword = match[1].startsWith(":") ? match[1].slice(1) : match[1];
        const decodedPassword = decodeURIComponent(rawPassword);
        return decodedPassword ? ["-a", decodedPassword] : [];
    } catch {
        return [];
    }
}

function runPsql(sql) {
    try {
        return normalizeOutput(
            execFileSync(
                "docker",
                [
                    "exec",
                    dbContainer,
                    "psql",
                    "-U",
                    dbUser,
                    "-d",
                    dbName,
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-t",
                    "-A",
                    "-c",
                    sql,
                ],
                { encoding: "utf8" },
            ),
        );
    } catch (error) {
        fail("Failed to run SQL", error instanceof Error ? error.message : String(error));
    }
}

function clearResetProtectionKeys() {
    const patterns = [
        "rl:pwreset-ip:*",
        "rl:pwreset-id:*",
        "rl:pwreset-confirm:*",
        "rl:recovery-confirm:*",
        "auth:reset:bf:*",
        "auth:reset:alert:*",
    ];

    for (const pattern of patterns) {
        runRedisEval(pattern);
    }

    ok("reset protection redis keys cleared");
}

async function ensureHealth() {
    const res = await fetch(`${baseUrl}/`);
    if (!res.ok) {
        fail("Health check failed", `status=${res.status}`);
    }
    ok(`health (${res.status})`);
}

async function postJson(path, body, forwardedIp) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": forwardedIp,
        },
        body: JSON.stringify(body),
    });

    return {
        status: res.status,
        text: await res.text(),
    };
}

async function runResetConfirmBruteforceProbe() {
    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
        const response = await postJson(
            "/api/auth/reset-password",
            {
                token: `INVALID-RESET-${i}`,
                newPassword: "StrongPassReset!123",
            },
            "198.51.100.210",
        );
        statuses.push(response.status);
    }

    const has429 = statuses.includes(429);
    if (!has429) {
        fail("reset-password brute-force probe did not trigger blocking", statuses);
    }

    ok(`reset-password brute-force probe (${statuses.join(",")})`);
}

async function runRecoveryConfirmBruteforceProbe() {
    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
        const response = await postJson(
            "/api/auth/account/recovery/confirm",
            {
                code: `BAD${String(i).padStart(3, "0")}`,
                action: "reactivate",
                newPassword: "StrongPassRecover!123",
            },
            "198.51.100.211",
        );
        statuses.push(response.status);
    }

    const has429 = statuses.includes(429);
    if (!has429) {
        fail("recovery-confirm brute-force probe did not trigger blocking", statuses);
    }

    ok(`recovery-confirm brute-force probe (${statuses.join(",")})`);
}

function assertAlertsWereCreated() {
    const countRaw = runPsql(`
SELECT COUNT(*)
FROM admin_alerts
WHERE type = 'system_alert'
  AND entity_type = 'auth_reset_protection'
  AND created_at >= NOW() - INTERVAL '15 minutes';
`);

    const count = Number.parseInt(String(countRaw).trim(), 10);
    if (!Number.isFinite(count) || count < 1) {
        fail("Expected at least one live auth_reset_protection alert", countRaw);
    }

    ok(`live alert emission (${count})`);
}

async function main() {
    await ensureHealth();
    clearResetProtectionKeys();

    await runResetConfirmBruteforceProbe();
    await runRecoveryConfirmBruteforceProbe();
    assertAlertsWereCreated();

    console.log("[auth:bruteforce] Completed brute-force + live alert regression checks.");
}

main().catch((error) => {
    fail("Unexpected brute-force regression error", error instanceof Error ? error.message : String(error));
});
