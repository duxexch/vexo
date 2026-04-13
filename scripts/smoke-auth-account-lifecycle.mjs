import bcrypt from "bcryptjs";
import { Client } from "pg";

const baseUrl = (process.env.SECURITY_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const dbHost = process.env.AUTH_SMOKE_DB_HOST || process.env.PGHOST || "127.0.0.1";
const dbPort = Number.parseInt(process.env.AUTH_SMOKE_DB_PORT || process.env.PGPORT || "5432", 10);
const dbUser = process.env.AUTH_SMOKE_DB_USER || process.env.PGUSER || "vex_user";
const dbPassword = process.env.AUTH_SMOKE_DB_PASSWORD || process.env.PGPASSWORD || "VexLocal2026SecurePass!";
const dbName = process.env.AUTH_SMOKE_DB_NAME || process.env.PGDATABASE || "vex_db";

const FIXTURE_PASSWORD = "AuthMatrix!123";
const WRONG_PASSWORD = "WrongMatrix!123";
const FIXTURE_OTP = "246810";

const MATRIX_FIXTURE = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c101",
    accountId: "900200101",
    username: "auth_matrix_multi",
    email: "auth.matrix.multi@example.test",
    phone: "+15555551101",
};

const LOCKOUT_FIXTURE = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c102",
    username: "auth_matrix_lockout",
};

const RACE_FIXTURE = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c103",
    username: "auth_matrix_race",
};

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[auth:lifecycle] ${message}`, details);
    } else {
        console.error(`[auth:lifecycle] ${message}`);
    }
    process.exit(1);
}

function ok(message) {
    console.log(`[auth:lifecycle] PASS ${message}`);
}

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function runPsql(sql) {
    const client = new Client({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
    });

    try {
        await client.connect();
        const result = await client.query(sql);

        if (!result.rows || result.rows.length === 0) {
            return `COMMAND ${result.command}`;
        }

        return Object.values(result.rows[0]).map((value) => String(value ?? "")).join(":");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail("Failed to execute SQL in PostgreSQL", message);
    } finally {
        await client.end().catch(() => { });
    }
}

async function readBody(res) {
    const text = await res.text();
    try {
        return { text, json: JSON.parse(text) };
    } catch {
        return { text, json: null };
    }
}

async function postJson(path, body, headers) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(headers || {}),
        },
        body: JSON.stringify(body || {}),
    });
    const payload = await readBody(res);
    return { res, payload };
}

function assertStatus(name, res, payload, expected) {
    if (res.status !== expected) {
        fail(`${name}: expected status ${expected}, got ${res.status}`, payload.text);
    }
}

function assertOneOfStatus(name, res, payload, expectedStatuses) {
    if (!expectedStatuses.includes(res.status)) {
        fail(`${name}: expected status in [${expectedStatuses.join(", ")}], got ${res.status}`, payload.text);
    }
}

async function ensureHealth() {
    const res = await fetch(`${baseUrl}/`);
    if (!res.ok) {
        fail(`Health check failed at ${baseUrl}/`, `status=${res.status}`);
    }
    ok(`health (${res.status})`);
}

async function prepareFixtures() {
    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 12);

    const sql = `
DELETE FROM otp_verifications
WHERE user_id IN (
  ${sqlQuote(MATRIX_FIXTURE.id)},
  ${sqlQuote(LOCKOUT_FIXTURE.id)},
  ${sqlQuote(RACE_FIXTURE.id)}
);

INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at, account_disabled_at
) VALUES (
  ${sqlQuote(MATRIX_FIXTURE.id)},
  ${sqlQuote(MATRIX_FIXTURE.accountId)},
  ${sqlQuote(MATRIX_FIXTURE.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'account',
  ${sqlQuote(MATRIX_FIXTURE.email)},
  ${sqlQuote(MATRIX_FIXTURE.phone)},
  true,
  true,
  false,
  NULL,
  0,
  NULL,
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
  account_disabled_at = EXCLUDED.account_disabled_at,
  updated_at = NOW();

INSERT INTO users (
  id, username, password, role, status, registration_type,
  failed_login_attempts, locked_until, account_deleted_at, account_disabled_at
) VALUES (
  ${sqlQuote(LOCKOUT_FIXTURE.id)},
  ${sqlQuote(LOCKOUT_FIXTURE.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'username',
  0,
  NULL,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  failed_login_attempts = 0,
  locked_until = NULL,
  account_deleted_at = NULL,
  account_disabled_at = NULL,
  updated_at = NOW();

INSERT INTO users (
  id, username, password, role, status, registration_type,
  failed_login_attempts, locked_until, account_deleted_at, account_disabled_at
) VALUES (
  ${sqlQuote(RACE_FIXTURE.id)},
  ${sqlQuote(RACE_FIXTURE.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'username',
  0,
  NULL,
  NULL,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  registration_type = EXCLUDED.registration_type,
  failed_login_attempts = 0,
  locked_until = NULL,
  account_deleted_at = NULL,
  account_disabled_at = NULL,
  updated_at = NOW();
`;

    await runPsql(sql);
    ok("fixtures prepared");
}

async function verifyRegisterEndpointPolicy() {
    const registration = await postJson("/api/auth/register", {
        username: `policy_${Date.now()}`,
        password: FIXTURE_PASSWORD,
        email: "should.not.pass@example.test",
    });

    assertStatus("register policy", registration.res, registration.payload, 400);
    if (registration.payload.json?.errorCode !== "IDENTIFIER_SIGNUP_REQUIRED") {
        fail("register policy: expected IDENTIFIER_SIGNUP_REQUIRED", registration.payload.text);
    }

    ok("username register endpoint rejects direct identifier signup");
}

async function verifyIdentifierLoginMatrix() {
    const accountLogin = await postJson("/api/auth/login-by-account", {
        accountId: MATRIX_FIXTURE.accountId,
        password: FIXTURE_PASSWORD,
    });
    assertOneOfStatus("matrix login by account", accountLogin.res, accountLogin.payload, [200, 503]);

    const phoneLogin = await postJson("/api/auth/login-by-phone", {
        phone: MATRIX_FIXTURE.phone,
        password: FIXTURE_PASSWORD,
    });
    assertOneOfStatus("matrix login by phone", phoneLogin.res, phoneLogin.payload, [200, 503]);

    const emailLogin = await postJson("/api/auth/login-by-email", {
        email: MATRIX_FIXTURE.email,
        password: FIXTURE_PASSWORD,
    });
    assertOneOfStatus("matrix login by email", emailLogin.res, emailLogin.payload, [200, 503]);

    ok("account/email/phone matrix routes reachable");
}

async function verifySocialRouteHealth() {
    const res = await fetch(`${baseUrl}/api/auth/social/google/native/config`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    if (res.status === 500) {
        const payload = await readBody(res);
        fail("social route health: unexpected 500", payload.text);
    }

    ok(`social google native config status ${res.status}`);
}

async function verifyLockoutFlow() {
    for (let i = 0; i < 6; i += 1) {
        const attempt = await postJson("/api/auth/login", {
            username: LOCKOUT_FIXTURE.username,
            password: WRONG_PASSWORD,
        });
        assertStatus(`lockout attempt ${i + 1}`, attempt.res, attempt.payload, 401);
    }

    const state = await runPsql(`
SELECT failed_login_attempts || ':' || COALESCE((locked_until > NOW())::text, 'false')
FROM users
WHERE id = ${sqlQuote(LOCKOUT_FIXTURE.id)};
`);

    if (!state) {
        fail("lockout flow: fixture user state missing");
    }

    const [attemptsRaw, lockedRaw] = state.split(":");
    const attempts = Number.parseInt(attemptsRaw || "0", 10);
    if (!Number.isFinite(attempts) || attempts < 5 || lockedRaw !== "true") {
        fail("lockout flow: expected locked account after repeated failures", state);
    }

    ok("lockout protections");
}

async function verifyForgotPasswordNondisclosure() {
    const existing = await postJson("/api/auth/forgot-password", {
        accountId: MATRIX_FIXTURE.accountId,
    });
    const unknown = await postJson("/api/auth/forgot-password", {
        accountId: "900299999",
    });

    assertStatus("forgot existing", existing.res, existing.payload, 200);
    assertStatus("forgot unknown", unknown.res, unknown.payload, 200);

    const existingBody = JSON.stringify(existing.payload.json || {});
    const unknownBody = JSON.stringify(unknown.payload.json || {});
    if (existingBody !== unknownBody) {
        fail("forgot-password nondisclosure parity failed", {
            existing: existing.payload.json,
            unknown: unknown.payload.json,
        });
    }

    ok("forgot-password nondisclosure parity");
}

async function patchOtpForUser(userId, method, otpCode) {
    const otpHash = await bcrypt.hash(otpCode, 12);
    const result = await runPsql(`
UPDATE otp_verifications
SET
  code_hash = ${sqlQuote(otpHash)},
  attempts = 0,
  max_attempts = 5,
  consumed_at = NULL,
  expires_at = NOW() + INTERVAL '10 minutes'
WHERE id = (
  SELECT id
  FROM otp_verifications
  WHERE user_id = ${sqlQuote(userId)}
    AND contact_type = ${sqlQuote(method)}
  ORDER BY created_at DESC
  LIMIT 1
);
`);

    if (!result.includes("COMMAND UPDATE")) {
        fail("Failed to patch OTP for deterministic verification", result);
    }
}

async function verifyOneClickRecoveryPolicy() {
    const oneClick = await postJson("/api/auth/one-click-register", {});
    assertStatus("one-click register", oneClick.res, oneClick.payload, 200);

    const accountId = oneClick.payload.json?.credentials?.accountId;
    const password = oneClick.payload.json?.credentials?.password;
    const userId = oneClick.payload.json?.user?.id;

    if (!accountId || !password || !userId) {
        fail("one-click register: missing credentials payload", oneClick.payload.text);
    }

    await runPsql(`
UPDATE users
SET
  created_at = NOW() - INTERVAL '72 hours',
  updated_at = NOW(),
  email = NULL,
  phone = NULL,
  email_verified = false,
  phone_verified = false
WHERE id = ${sqlQuote(userId)};
`);

    const blockedLogin = await postJson("/api/auth/login-by-account", {
        accountId,
        password,
    });

    assertStatus("one-click recovery enforcement", blockedLogin.res, blockedLogin.payload, 403);
    if (blockedLogin.payload.json?.errorCode !== "RECOVERY_CHANNEL_REQUIRED") {
        fail("one-click recovery enforcement: expected RECOVERY_CHANNEL_REQUIRED", blockedLogin.payload.text);
    }

    const bootstrap = await postJson("/api/auth/account/recovery/bootstrap", {
        accountId,
        password,
        channel: "email",
        target: `oneclick.recovery.${Date.now()}@example.test`,
    });

    assertStatus("one-click recovery bootstrap", bootstrap.res, bootstrap.payload, 200);
    const challengeToken = bootstrap.payload.json?.challengeToken;
    if (!challengeToken || typeof challengeToken !== "string") {
        fail("one-click recovery bootstrap: missing challenge token", bootstrap.payload.text);
    }

    await patchOtpForUser(userId, "email", FIXTURE_OTP);

    const verify = await postJson("/api/auth/account/recovery/bootstrap/verify", {
        challengeToken,
        code: FIXTURE_OTP,
    });

    assertStatus("one-click recovery verify", verify.res, verify.payload, 200);

    const postBootstrapLogin = await postJson("/api/auth/login-by-account", {
        accountId,
        password,
    });

    if (postBootstrapLogin.res.status === 403 && postBootstrapLogin.payload.json?.errorCode === "RECOVERY_CHANNEL_REQUIRED") {
        fail("one-click recovery policy: account remained blocked after verified bootstrap", postBootstrapLogin.payload.text);
    }

    ok("one-click recovery policy enforcement and bootstrap path");
}

async function verifyDisableDeleteRaceGuard() {
    const login = await postJson("/api/auth/login", {
        username: RACE_FIXTURE.username,
        password: FIXTURE_PASSWORD,
    });
    assertStatus("race fixture login", login.res, login.payload, 200);

    const token = login.payload.json?.token;
    if (!token || typeof token !== "string") {
        fail("race fixture login: missing token", login.payload.text);
    }

    const headers = { Authorization: `Bearer ${token}` };

    const [disableRes, deleteRes] = await Promise.all([
        postJson("/api/user/account/disable", { password: FIXTURE_PASSWORD }, headers),
        postJson("/api/user/account/delete", {
            password: FIXTURE_PASSWORD,
            confirmation: "DELETE",
        }, headers),
    ]);

    const disableOk = disableRes.res.status === 200;
    const deleteOk = deleteRes.res.status === 200;

    if (disableOk && deleteOk) {
        fail("disable/delete race guard failed: both operations succeeded", {
            disable: disableRes.payload.json,
            delete: deleteRes.payload.json,
        });
    }

    if (!disableOk && !deleteOk) {
        fail("disable/delete race guard unexpected: both operations failed", {
            disable: disableRes.payload.text,
            delete: deleteRes.payload.text,
        });
    }

    const state = await runPsql(`
SELECT
  CASE WHEN account_disabled_at IS NULL THEN '0' ELSE '1' END || ':' ||
  CASE WHEN account_deleted_at IS NULL THEN '0' ELSE '1' END
FROM users
WHERE id = ${sqlQuote(RACE_FIXTURE.id)};
`);

    if (state !== "1:0" && state !== "0:1") {
        fail("disable/delete race guard: unexpected terminal account state", state);
    }

    ok("disable/delete race guard");
}

async function main() {
    await ensureHealth();
    await prepareFixtures();
    await verifyRegisterEndpointPolicy();
    await verifyIdentifierLoginMatrix();
    await verifySocialRouteHealth();
    await verifyLockoutFlow();
    await verifyForgotPasswordNondisclosure();
    await verifyOneClickRecoveryPolicy();
    await verifyDisableDeleteRaceGuard();
    console.log("[auth:lifecycle] All checks passed.");
}

main().catch((error) => {
    fail("Unexpected error during auth lifecycle smoke suite", error instanceof Error ? error.message : String(error));
});
