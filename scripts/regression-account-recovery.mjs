// @ts-nocheck
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const baseUrl = (process.env.SECURITY_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const dbContainer = process.env.AUTH_SMOKE_DB_CONTAINER || "vex-db";
const dbUser = process.env.AUTH_SMOKE_DB_USER || "vex_user";
const dbName = process.env.AUTH_SMOKE_DB_NAME || "vex_db";
const redisContainer = process.env.AUTH_SMOKE_REDIS_CONTAINER || "vex-redis";
const appContainer = process.env.AUTH_SMOKE_APP_CONTAINER || "vex-app";

const BASE_PASSWORD = "AuthRecovery!123";
const REACTIVATE_NEW_PASSWORD = "AuthRecoveryReactivate!123";
const RESTORE_NEW_PASSWORD = "AuthRecoveryRestore!123";
const RESET_NEW_PASSWORD = "AuthRecoveryReset!123";

const REACTIVATE_CODE = "A1B2C3";
const RESTORE_CODE = "D4E5F6";
const RESET_CODE = "G7H8I9";

const REACTIVATE_USER = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c011",
    accountId: "900100011",
    username: "auth_recovery_reactivate",
    email: "auth.recovery.reactivate@example.test",
};

const RESTORE_USER = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c012",
    accountId: "900100012",
    username: "auth_recovery_restore",
    phone: "+15555550112",
};

const SOCIAL_RESET_USER = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c013",
    accountId: "900100013",
    username: "auth_recovery_social_reset",
    email: "auth.recovery.social.reset@example.test",
    phone: "+15555550113",
};

const UNVERIFIED_RECOVERY_USER = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c014",
    accountId: "900100014",
    username: "auth_recovery_unverified_inactive",
    email: "auth.recovery.unverified.inactive@example.test",
};

const UNVERIFIED_RESET_USER = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c015",
    accountId: "900100015",
    username: "auth_recovery_unverified_active",
    email: "auth.recovery.unverified.active@example.test",
};

const ALL_USER_IDS = [
    REACTIVATE_USER.id,
    RESTORE_USER.id,
    SOCIAL_RESET_USER.id,
    UNVERIFIED_RECOVERY_USER.id,
    UNVERIFIED_RESET_USER.id,
];

let requestCounter = 0;

function nextForwardedIp() {
    requestCounter += 1;
    const octet = ((requestCounter - 1) % 200) + 1;
    return `198.51.100.${octet}`;
}

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[auth:recovery] ${message}`, details);
    } else {
        console.error(`[auth:recovery] ${message}`);
    }
    process.exit(1);
}

function ok(message) {
    console.log(`[auth:recovery] PASS ${message}`);
}

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizePsqlOutput(output) {
    return (output || "").trim();
}

function runPsql(sql) {
    try {
        return normalizePsqlOutput(
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
        const message = error instanceof Error ? error.message : String(error);
        fail("Failed to execute SQL in dockerized PostgreSQL", message);
    }
}

function runRedisEval(pattern) {
    const authArgs = resolveRedisAuthArgs();
    try {
        return normalizePsqlOutput(
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
        const message = error instanceof Error ? error.message : String(error);
        fail("Failed to clear Redis rate-limit keys", message);
    }
}

function resolveRedisAuthArgs() {
    const directPassword = process.env.AUTH_SMOKE_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
    if (directPassword) {
        return ["-a", directPassword];
    }

    try {
        const redisUrl = normalizePsqlOutput(execFileSync("docker", ["exec", appContainer, "printenv", "REDIS_URL"], { encoding: "utf8" }));
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

function clearAuthRateLimitBuckets() {
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
    ok("rate-limit buckets cleared");
}

function toInt(value, name) {
    const parsed = Number.parseInt(String(value).trim(), 10);
    if (!Number.isFinite(parsed)) {
        fail(`${name}: expected integer output`, value);
    }
    return parsed;
}

function hashScopedCode(channel, code) {
    return crypto.createHash("sha256").update(`${channel}:${code}`).digest("hex");
}

async function readBody(res) {
    const text = await res.text();
    try {
        return { text, json: JSON.parse(text) };
    } catch {
        return { text, json: null };
    }
}

async function postJson(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": nextForwardedIp(),
        },
        body: JSON.stringify(body),
    });

    const payload = await readBody(res);
    return { res, payload };
}

function assertStatus(name, res, payload, expectedStatus) {
    if (res.status !== expectedStatus) {
        fail(`${name}: expected status ${expectedStatus}, got ${res.status}`, payload.text);
    }
}

function assertGenericResponse(name, payload, expectedMessage) {
    const body = payload.json;
    if (!body || body.success !== true || body.message !== expectedMessage) {
        fail(`${name}: unexpected generic response`, payload.text);
    }
}

async function ensureHealth() {
    const res = await fetch(`${baseUrl}/`);
    if (!res.ok) {
        fail(`Health check failed at ${baseUrl}/`, `status=${res.status}`);
    }
    ok(`health (${res.status})`);
}

function ensurePasswordMatches(name, plain, hash) {
    return bcrypt.compare(plain, hash).then((isMatch) => {
        if (!isMatch) {
            fail(`${name}: password hash mismatch`);
        }
    });
}

async function setupFixtures() {
    const passwordHash = await bcrypt.hash(BASE_PASSWORD, 12);
    const ids = ALL_USER_IDS.map(sqlQuote).join(", ");

    runPsql(`
DELETE FROM active_sessions WHERE user_id IN (${ids});
DELETE FROM user_sessions WHERE user_id IN (${ids});
DELETE FROM account_recovery_tokens WHERE user_id IN (${ids});
DELETE FROM password_reset_tokens WHERE user_id IN (${ids});
DELETE FROM otp_verifications WHERE user_id IN (${ids});
`);

    runPsql(`
INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(REACTIVATE_USER.id)},
  ${sqlQuote(REACTIVATE_USER.accountId)},
  ${sqlQuote(REACTIVATE_USER.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'inactive',
  'email',
  ${sqlQuote(REACTIVATE_USER.email)},
  NULL,
  true,
  false,
  false,
  NULL,
  0,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_verified = EXCLUDED.email_verified,
  phone_verified = EXCLUDED.phone_verified,
  two_factor_enabled = EXCLUDED.two_factor_enabled,
  two_factor_secret = EXCLUDED.two_factor_secret,
  failed_login_attempts = EXCLUDED.failed_login_attempts,
  locked_until = EXCLUDED.locked_until,
  account_deleted_at = EXCLUDED.account_deleted_at,
  updated_at = NOW();

INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(RESTORE_USER.id)},
  ${sqlQuote(RESTORE_USER.accountId)},
  ${sqlQuote(RESTORE_USER.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'inactive',
  'phone',
  NULL,
  ${sqlQuote(RESTORE_USER.phone)},
  false,
  true,
  false,
  NULL,
  0,
  NULL,
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_verified = EXCLUDED.email_verified,
  phone_verified = EXCLUDED.phone_verified,
  two_factor_enabled = EXCLUDED.two_factor_enabled,
  two_factor_secret = EXCLUDED.two_factor_secret,
  failed_login_attempts = EXCLUDED.failed_login_attempts,
  locked_until = EXCLUDED.locked_until,
  account_deleted_at = EXCLUDED.account_deleted_at,
  updated_at = NOW();

INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(SOCIAL_RESET_USER.id)},
  ${sqlQuote(SOCIAL_RESET_USER.accountId)},
  ${sqlQuote(SOCIAL_RESET_USER.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'social_google',
  ${sqlQuote(SOCIAL_RESET_USER.email)},
  ${sqlQuote(SOCIAL_RESET_USER.phone)},
  false,
  true,
  false,
  NULL,
  0,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_verified = EXCLUDED.email_verified,
  phone_verified = EXCLUDED.phone_verified,
  two_factor_enabled = EXCLUDED.two_factor_enabled,
  two_factor_secret = EXCLUDED.two_factor_secret,
  failed_login_attempts = EXCLUDED.failed_login_attempts,
  locked_until = EXCLUDED.locked_until,
  account_deleted_at = EXCLUDED.account_deleted_at,
  updated_at = NOW();

INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(UNVERIFIED_RECOVERY_USER.id)},
  ${sqlQuote(UNVERIFIED_RECOVERY_USER.accountId)},
  ${sqlQuote(UNVERIFIED_RECOVERY_USER.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'inactive',
  'email',
  ${sqlQuote(UNVERIFIED_RECOVERY_USER.email)},
  NULL,
  false,
  false,
  false,
  NULL,
  0,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_verified = EXCLUDED.email_verified,
  phone_verified = EXCLUDED.phone_verified,
  two_factor_enabled = EXCLUDED.two_factor_enabled,
  two_factor_secret = EXCLUDED.two_factor_secret,
  failed_login_attempts = EXCLUDED.failed_login_attempts,
  locked_until = EXCLUDED.locked_until,
  account_deleted_at = EXCLUDED.account_deleted_at,
  updated_at = NOW();

INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(UNVERIFIED_RESET_USER.id)},
  ${sqlQuote(UNVERIFIED_RESET_USER.accountId)},
  ${sqlQuote(UNVERIFIED_RESET_USER.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'email',
  ${sqlQuote(UNVERIFIED_RESET_USER.email)},
  NULL,
  false,
  false,
  false,
  NULL,
  0,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_verified = EXCLUDED.email_verified,
  phone_verified = EXCLUDED.phone_verified,
  two_factor_enabled = EXCLUDED.two_factor_enabled,
  two_factor_secret = EXCLUDED.two_factor_secret,
  failed_login_attempts = EXCLUDED.failed_login_attempts,
  locked_until = EXCLUDED.locked_until,
  account_deleted_at = EXCLUDED.account_deleted_at,
  updated_at = NOW();
`);

    ok("fixture users prepared");
}

function assertNoFreshTokenForUser(tableName, userId, name) {
    const count = toInt(runPsql(`SELECT COUNT(*) FROM ${tableName} WHERE user_id = ${sqlQuote(userId)};`), `${name} token count`);
    if (count !== 0) {
        fail(`${name}: expected no token records for user`, { tableName, userId, count });
    }
}

function insertActiveSession(userId) {
    const sessionToken = crypto.randomBytes(24).toString("hex");
    const tokenFingerprint = crypto.randomBytes(16).toString("hex");
    runPsql(`
INSERT INTO user_sessions (user_id, session_token, expires_at, is_active)
VALUES (
  ${sqlQuote(userId)},
  ${sqlQuote(sessionToken)},
  NOW() + INTERVAL '30 days',
  true
);

INSERT INTO active_sessions (user_id, token_fingerprint, expires_at, is_active)
VALUES (
  ${sqlQuote(userId)},
  ${sqlQuote(tokenFingerprint)},
  NOW() + INTERVAL '30 days',
  true
);
`);
}

function assertNoActiveSessions(userId, name) {
    const userSessionCount = toInt(
        runPsql(`SELECT COUNT(*) FROM user_sessions WHERE user_id = ${sqlQuote(userId)} AND is_active = true;`),
        `${name} active user_sessions count`,
    );

    const activeTokenSessionCount = toInt(
        runPsql(`SELECT COUNT(*) FROM active_sessions WHERE user_id = ${sqlQuote(userId)} AND is_active = true;`),
        `${name} active token sessions count`,
    );

    if (userSessionCount !== 0 || activeTokenSessionCount !== 0) {
        fail(`${name}: expected all sessions to be revoked`, {
            userId,
            userSessionCount,
            activeTokenSessionCount,
        });
    }
}

function patchLatestRecoveryToken(userId, purpose, channel, code) {
    const tokenHash = hashScopedCode(channel, code);
    const output = runPsql(`
UPDATE account_recovery_tokens
SET
  token_hash = ${sqlQuote(tokenHash)},
  used_at = NULL,
  expires_at = NOW() + INTERVAL '20 minutes'
WHERE id = (
  SELECT id
  FROM account_recovery_tokens
  WHERE user_id = ${sqlQuote(userId)}
    AND purpose = ${sqlQuote(purpose)}
  ORDER BY created_at DESC
  LIMIT 1
);
`);

    if (!output.includes("UPDATE 1")) {
        fail("Failed to patch latest account recovery token", { userId, purpose, output });
    }
}

function patchLatestResetToken(userId, channel, code) {
    const tokenHash = hashScopedCode(channel, code);
    const output = runPsql(`
UPDATE password_reset_tokens
SET
  token_hash = ${sqlQuote(tokenHash)},
  used_at = NULL,
  expires_at = NOW() + INTERVAL '60 minutes'
WHERE id = (
  SELECT id
  FROM password_reset_tokens
  WHERE user_id = ${sqlQuote(userId)}
  ORDER BY created_at DESC
  LIMIT 1
);
`);

    if (!output.includes("UPDATE 1")) {
        fail("Failed to patch latest password reset token", { userId, output });
    }
}

function readUserSnapshot(userId, name) {
    const json = runPsql(`
SELECT row_to_json(t)
FROM (
  SELECT
    id,
    status,
    registration_type,
    email_verified,
    phone_verified,
    account_deleted_at,
    account_restored_at,
    failed_login_attempts,
    locked_until,
    password
  FROM users
  WHERE id = ${sqlQuote(userId)}
) t;
`);

    if (!json) {
        fail(`${name}: expected user snapshot`);
    }

    try {
        return JSON.parse(json);
    } catch {
        fail(`${name}: failed to parse user snapshot`, json);
    }
}

async function runGenericResponseChecks() {
    const unknownRecovery = await postJson("/api/auth/account/recovery/request", {
        identifier: "unknown.account.900100999",
        action: "reactivate",
    });
    assertStatus("unknown recovery request", unknownRecovery.res, unknownRecovery.payload, 200);
    assertGenericResponse(
        "unknown recovery request",
        unknownRecovery.payload,
        "If the account is eligible, verification instructions have been sent.",
    );

    const unknownForgot = await postJson("/api/auth/forgot-password", {
        email: "unknown.auth.recovery@example.test",
    });
    assertStatus("unknown forgot-password", unknownForgot.res, unknownForgot.payload, 200);
    assertGenericResponse(
        "unknown forgot-password",
        unknownForgot.payload,
        "If an account exists with this identifier, reset instructions have been sent",
    );

    ok("generic nondisclosure responses");
}

async function runVerifiedChannelGuards() {
    const recoveryReq = await postJson("/api/auth/account/recovery/request", {
        identifier: UNVERIFIED_RECOVERY_USER.accountId,
        action: "reactivate",
    });
    assertStatus("unverified recovery request", recoveryReq.res, recoveryReq.payload, 200);
    assertGenericResponse(
        "unverified recovery request",
        recoveryReq.payload,
        "If the account is eligible, verification instructions have been sent.",
    );
    assertNoFreshTokenForUser("account_recovery_tokens", UNVERIFIED_RECOVERY_USER.id, "unverified recovery request");

    const forgotReq = await postJson("/api/auth/forgot-password", {
        accountId: UNVERIFIED_RESET_USER.accountId,
    });
    assertStatus("unverified forgot-password request", forgotReq.res, forgotReq.payload, 200);
    assertGenericResponse(
        "unverified forgot-password request",
        forgotReq.payload,
        "If an account exists with this identifier, reset instructions have been sent",
    );
    assertNoFreshTokenForUser("password_reset_tokens", UNVERIFIED_RESET_USER.id, "unverified forgot-password request");

    ok("verified-channel-only guards");
}

async function runReactivateFlow() {
    insertActiveSession(REACTIVATE_USER.id);

    const requestRes = await postJson("/api/auth/account/recovery/request", {
        identifier: REACTIVATE_USER.accountId,
        action: "reactivate",
    });
    assertStatus("reactivate request", requestRes.res, requestRes.payload, 200);
    assertGenericResponse(
        "reactivate request",
        requestRes.payload,
        "If the account is eligible, verification instructions have been sent.",
    );

    patchLatestRecoveryToken(REACTIVATE_USER.id, "reactivate", "email", REACTIVATE_CODE);

    const confirmRes = await postJson("/api/auth/account/recovery/confirm", {
        code: REACTIVATE_CODE,
        action: "reactivate",
        newPassword: REACTIVATE_NEW_PASSWORD,
    });
    assertStatus("reactivate confirm", confirmRes.res, confirmRes.payload, 200);

    const body = confirmRes.payload.json;
    if (!body || body.success !== true) {
        fail("reactivate confirm: expected success payload", confirmRes.payload.text);
    }

    const user = readUserSnapshot(REACTIVATE_USER.id, "reactivate user");
    if (user.status !== "active") {
        fail("reactivate user: expected active status", user);
    }
    if (user.account_deleted_at !== null) {
        fail("reactivate user: account_deleted_at should remain null", user);
    }
    if (user.failed_login_attempts !== 0 || user.locked_until !== null) {
        fail("reactivate user: lockout counters not reset", user);
    }

    await ensurePasswordMatches("reactivate user", REACTIVATE_NEW_PASSWORD, user.password);
    assertNoActiveSessions(REACTIVATE_USER.id, "reactivate user");

    ok("reactivate flow with email-verified channel");
}

async function runRestoreFlow() {
    insertActiveSession(RESTORE_USER.id);

    const requestRes = await postJson("/api/auth/account/recovery/request", {
        identifier: RESTORE_USER.accountId,
        action: "restore",
    });
    assertStatus("restore request", requestRes.res, requestRes.payload, 200);
    assertGenericResponse(
        "restore request",
        requestRes.payload,
        "If the account is eligible, verification instructions have been sent.",
    );

    patchLatestRecoveryToken(RESTORE_USER.id, "restore_deleted", "phone", RESTORE_CODE);

    const confirmRes = await postJson("/api/auth/account/recovery/confirm", {
        code: RESTORE_CODE,
        action: "restore",
        newPassword: RESTORE_NEW_PASSWORD,
    });
    assertStatus("restore confirm", confirmRes.res, confirmRes.payload, 200);

    const body = confirmRes.payload.json;
    if (!body || body.success !== true) {
        fail("restore confirm: expected success payload", confirmRes.payload.text);
    }

    const user = readUserSnapshot(RESTORE_USER.id, "restore user");
    if (user.status !== "active") {
        fail("restore user: expected active status", user);
    }
    if (user.account_deleted_at !== null) {
        fail("restore user: account_deleted_at should be cleared", user);
    }
    if (!user.account_restored_at) {
        fail("restore user: account_restored_at should be set", user);
    }
    if (user.phone_verified !== true) {
        fail("restore user: phone should remain verified", user);
    }

    await ensurePasswordMatches("restore user", RESTORE_NEW_PASSWORD, user.password);
    assertNoActiveSessions(RESTORE_USER.id, "restore user");

    ok("restore flow with phone-verified channel");
}

async function runSocialResetMigrationFlow() {
    insertActiveSession(SOCIAL_RESET_USER.id);

    const forgotRes = await postJson("/api/auth/forgot-password", {
        accountId: SOCIAL_RESET_USER.accountId,
    });
    assertStatus("social reset forgot-password", forgotRes.res, forgotRes.payload, 200);
    assertGenericResponse(
        "social reset forgot-password",
        forgotRes.payload,
        "If an account exists with this identifier, reset instructions have been sent",
    );

    patchLatestResetToken(SOCIAL_RESET_USER.id, "phone", RESET_CODE);

    const resetRes = await postJson("/api/auth/reset-password", {
        token: RESET_CODE,
        newPassword: RESET_NEW_PASSWORD,
    });
    assertStatus("social reset confirm", resetRes.res, resetRes.payload, 200);

    const body = resetRes.payload.json;
    if (!body || body.success !== true) {
        fail("social reset confirm: expected success payload", resetRes.payload.text);
    }

    const user = readUserSnapshot(SOCIAL_RESET_USER.id, "social reset user");
    if (user.registration_type !== "phone") {
        fail("social reset user: expected registration_type to migrate to phone", user);
    }
    if (user.phone_verified !== true) {
        fail("social reset user: phone should be verified after successful phone-based reset", user);
    }

    await ensurePasswordMatches("social reset user", RESET_NEW_PASSWORD, user.password);
    assertNoActiveSessions(SOCIAL_RESET_USER.id, "social reset user");

    const unusedTokens = toInt(
        runPsql(`SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = ${sqlQuote(SOCIAL_RESET_USER.id)} AND used_at IS NULL;`),
        "social reset unused tokens",
    );
    if (unusedTokens !== 0) {
        fail("social reset user: expected all reset tokens to be consumed/invalidated", unusedTokens);
    }

    ok("social-only password reset migration flow");
}

async function main() {
    await ensureHealth();
    clearAuthRateLimitBuckets();
    await setupFixtures();

    await runGenericResponseChecks();
    await runVerifiedChannelGuards();
    await runReactivateFlow();
    await runRestoreFlow();
    await runSocialResetMigrationFlow();

    console.log("[auth:recovery] Completed recovery/reset hardening regression checks.");
}

main().catch((error) => {
    fail("Unexpected error during recovery regression", error instanceof Error ? error.message : String(error));
});
