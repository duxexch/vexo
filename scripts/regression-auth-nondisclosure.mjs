import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";

const baseUrl = (process.env.SECURITY_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const dbContainer = process.env.AUTH_SMOKE_DB_CONTAINER || "vex-db";
const dbUser = process.env.AUTH_SMOKE_DB_USER || "vex_user";
const dbName = process.env.AUTH_SMOKE_DB_NAME || "vex_db";
const runMatrix = process.argv.includes("--matrix");
let ipCounter = 11;

const FIXTURE_PASSWORD = "AuthSmoke!123";
const FIXTURE_OTP = "246810";

const MULTI_FIXTURE = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c001",
    accountId: "900100001",
    username: "auth_smoke_multi",
    email: "auth.smoke.multi@example.test",
    phone: "+15555550101",
};

const EMAIL_ONLY_FIXTURE = {
    id: "31f3cd4a-9d56-4ad3-9d1a-32ca9821c002",
    accountId: "900100002",
    username: "auth_smoke_email_only",
    email: "auth.smoke.email.only@example.test",
};

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[auth:regression] ${message}`, details);
    } else {
        console.error(`[auth:regression] ${message}`);
    }
    process.exit(1);
}

function ok(message) {
    console.log(`[auth:regression] PASS ${message}`);
}

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function runPsql(sql) {
    try {
        return execFileSync(
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
        ).trim();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail("Failed to execute SQL in dockerized PostgreSQL", message);
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

async function postJson(path, body) {
    const syntheticIp = `198.51.100.${ipCounter}`;
    ipCounter += 1;
    if (ipCounter > 220) {
        ipCounter = 11;
    }

    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": syntheticIp,
        },
        body: JSON.stringify(body),
    });
    const payload = await readBody(res);
    return { res, payload };
}

function assertStatus(name, res, payload, expected) {
    if (res.status !== expected) {
        fail(`${name}: expected status ${expected}, got ${res.status}`, payload.text);
    }
}

function assertNoDisclosureFields(name, json) {
    if (!json || typeof json !== "object") {
        fail(`${name}: response is not JSON object`, json);
    }

    const blockedFields = ["correctMethod", "maskedHint", "attemptsRemaining", "lockedUntil", "remainingMinutes"];
    for (const field of blockedFields) {
        if (Object.prototype.hasOwnProperty.call(json, field)) {
            fail(`${name}: leaked protected field '${field}'`, json);
        }
    }
}

function assertInvalidCredentials(name, res, payload) {
    assertStatus(name, res, payload, 401);
    const body = payload.json;
    if (!body || body.errorCode !== "INVALID_CREDENTIALS") {
        fail(`${name}: expected INVALID_CREDENTIALS`, payload.text);
    }
    assertNoDisclosureFields(name, body);
}

function assertOtpChallenge(name, res, payload) {
    assertStatus(name, res, payload, 200);
    const body = payload.json;
    if (!body || body.requiresIdentifierOtp !== true || typeof body.challengeToken !== "string") {
        fail(`${name}: expected OTP challenge response`, payload.text);
    }
    if (!Array.isArray(body.availableMethods)) {
        fail(`${name}: availableMethods missing`, payload.text);
    }
    return body;
}

async function ensureHealth() {
    const res = await fetch(`${baseUrl}/`);
    if (!res.ok) {
        fail(`Health check failed at ${baseUrl}/`, `status=${res.status}`);
    }
    ok(`health (${res.status})`);
}

async function setupFixtures() {
    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 12);

    const cleanupSql = `
DELETE FROM otp_verifications
WHERE user_id IN (${sqlQuote(MULTI_FIXTURE.id)}, ${sqlQuote(EMAIL_ONLY_FIXTURE.id)});
`;
    runPsql(cleanupSql);

    const insertSql = `
INSERT INTO users (
  id, account_id, username, password, role, status, registration_type,
  email, phone, email_verified, phone_verified,
  two_factor_enabled, two_factor_secret,
  failed_login_attempts, locked_until, account_deleted_at
) VALUES (
  ${sqlQuote(MULTI_FIXTURE.id)},
  ${sqlQuote(MULTI_FIXTURE.accountId)},
  ${sqlQuote(MULTI_FIXTURE.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'email',
  ${sqlQuote(MULTI_FIXTURE.email)},
  ${sqlQuote(MULTI_FIXTURE.phone)},
  true,
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
  ${sqlQuote(EMAIL_ONLY_FIXTURE.id)},
  ${sqlQuote(EMAIL_ONLY_FIXTURE.accountId)},
  ${sqlQuote(EMAIL_ONLY_FIXTURE.username)},
  ${sqlQuote(passwordHash)},
  'player',
  'active',
  'email',
  ${sqlQuote(EMAIL_ONLY_FIXTURE.email)},
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
`;

    runPsql(insertSql);
    ok("fixture users prepared");
}

function assertNondisclosureParity(name, aBody, bBody) {
    const pick = (body) => ({ error: body?.error, errorCode: body?.errorCode });
    const a = JSON.stringify(pick(aBody));
    const b = JSON.stringify(pick(bBody));
    if (a !== b) {
        fail(`${name}: response shape mismatch between existing and unknown identifiers`, { existing: aBody, unknown: bBody });
    }
}

async function runNonDisclosureRegression() {
    const wrongPassword = "WrongPass!123";

    const accountWrong = await postJson("/api/auth/login-by-account", {
        accountId: MULTI_FIXTURE.accountId,
        password: wrongPassword,
    });
    assertInvalidCredentials("account wrong password", accountWrong.res, accountWrong.payload);

    const accountUnknown = await postJson("/api/auth/login-by-account", {
        accountId: "999999999",
        password: wrongPassword,
    });
    assertInvalidCredentials("account unknown identifier", accountUnknown.res, accountUnknown.payload);
    assertNondisclosureParity("account nondisclosure parity", accountWrong.payload.json, accountUnknown.payload.json);

    const phoneWrong = await postJson("/api/auth/login-by-phone", {
        phone: MULTI_FIXTURE.phone,
        password: wrongPassword,
    });
    assertInvalidCredentials("phone wrong password", phoneWrong.res, phoneWrong.payload);

    const phoneUnknown = await postJson("/api/auth/login-by-phone", {
        phone: "+15555559999",
        password: wrongPassword,
    });
    assertInvalidCredentials("phone unknown identifier", phoneUnknown.res, phoneUnknown.payload);
    assertNondisclosureParity("phone nondisclosure parity", phoneWrong.payload.json, phoneUnknown.payload.json);

    const emailWrong = await postJson("/api/auth/login-by-email", {
        email: MULTI_FIXTURE.email,
        password: wrongPassword,
    });
    assertInvalidCredentials("email wrong password", emailWrong.res, emailWrong.payload);

    const emailUnknown = await postJson("/api/auth/login-by-email", {
        email: "unknown.auth.smoke@example.test",
        password: wrongPassword,
    });
    assertInvalidCredentials("email unknown identifier", emailUnknown.res, emailUnknown.payload);
    assertNondisclosureParity("email nondisclosure parity", emailWrong.payload.json, emailUnknown.payload.json);

    ok("non-disclosure regression checks");
}

async function updateOtpToKnownCode(userId, method, otpCode) {
    const otpHash = await bcrypt.hash(otpCode, 12);
    const sql = `
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
`;

    const output = runPsql(sql);
    if (!output.includes("UPDATE 1")) {
        fail("Failed to patch OTP code for deterministic verification", output);
    }
}

async function runMatrixFlow() {
    const accountLogin = await postJson("/api/auth/login-by-account", {
        accountId: MULTI_FIXTURE.accountId,
        password: FIXTURE_PASSWORD,
    });
    const accountBody = assertOtpChallenge("matrix login by account", accountLogin.res, accountLogin.payload);
    if (!accountBody.availableMethods.includes("email") || !accountBody.availableMethods.includes("phone")) {
        fail("matrix login by account: expected both email and phone methods", accountBody);
    }

    const phoneLogin = await postJson("/api/auth/login-by-phone", {
        phone: MULTI_FIXTURE.phone,
        password: FIXTURE_PASSWORD,
    });
    const phoneBody = assertOtpChallenge("matrix login by phone", phoneLogin.res, phoneLogin.payload);
    if (!phoneBody.availableMethods.includes("email") || !phoneBody.availableMethods.includes("phone")) {
        fail("matrix login by phone: expected both email and phone methods", phoneBody);
    }

    const emailLogin = await postJson("/api/auth/login-by-email", {
        email: MULTI_FIXTURE.email,
        password: FIXTURE_PASSWORD,
    });
    const emailBody = assertOtpChallenge("matrix login by email", emailLogin.res, emailLogin.payload);
    if (!emailBody.availableMethods.includes("email") || !emailBody.availableMethods.includes("phone")) {
        fail("matrix login by email: expected both email and phone methods", emailBody);
    }

    const emailOnlyLogin = await postJson("/api/auth/login-by-email", {
        email: EMAIL_ONLY_FIXTURE.email,
        password: FIXTURE_PASSWORD,
    });
    const emailOnlyBody = assertOtpChallenge("matrix login email-only user", emailOnlyLogin.res, emailOnlyLogin.payload);

    if (emailOnlyBody.availableMethods.length !== 1 || emailOnlyBody.availableMethods[0] !== "email") {
        fail("matrix email-only user: expected only email method", emailOnlyBody);
    }

    const disallowedResend = await postJson("/api/auth/login-otp/resend", {
        challengeToken: emailOnlyBody.challengeToken,
        method: "phone",
    });
    assertStatus("matrix resend disallowed method", disallowedResend.res, disallowedResend.payload, 200);

    const disallowedBody = disallowedResend.payload.json;
    if (!disallowedBody || disallowedBody.success !== true || typeof disallowedBody.message !== "string") {
        fail("matrix resend disallowed method: expected generic success response", disallowedResend.payload.text);
    }

    if (Object.prototype.hasOwnProperty.call(disallowedBody, "availableMethods") || Object.prototype.hasOwnProperty.call(disallowedBody, "preferredMethod")) {
        fail("matrix resend disallowed method: leaked method metadata", disallowedBody);
    }

    const allowedResend = await postJson("/api/auth/login-otp/resend", {
        challengeToken: emailOnlyBody.challengeToken,
        method: "email",
    });
    assertStatus("matrix resend allowed method", allowedResend.res, allowedResend.payload, 200);
    if (!allowedResend.payload.json || allowedResend.payload.json.success !== true) {
        fail("matrix resend allowed method failed", allowedResend.payload.text);
    }

    await updateOtpToKnownCode(EMAIL_ONLY_FIXTURE.id, "email", FIXTURE_OTP);

    const verifyRes = await postJson("/api/auth/login-otp/verify", {
        challengeToken: emailOnlyBody.challengeToken,
        code: FIXTURE_OTP,
    });
    assertStatus("matrix verify OTP", verifyRes.res, verifyRes.payload, 200);

    const verifyBody = verifyRes.payload.json;
    if (!verifyBody || typeof verifyBody !== "object") {
        fail("matrix verify OTP: invalid response body", verifyRes.payload.text);
    }

    if (verifyBody.requires2FA === true) {
        if (typeof verifyBody.challengeToken !== "string") {
            fail("matrix verify OTP: 2FA challenge missing token", verifyBody);
        }
    } else {
        if (typeof verifyBody.token !== "string" || !verifyBody.user) {
            fail("matrix verify OTP: expected authenticated response", verifyBody);
        }
    }

    ok("matrix flows (account/phone/email + resend + verify)");
}

async function main() {
    await ensureHealth();
    await setupFixtures();
    await runNonDisclosureRegression();

    if (runMatrix) {
        await runMatrixFlow();
    }

    console.log(`[auth:regression] Completed ${runMatrix ? "regression + matrix" : "regression"} checks.`);
}

main().catch((error) => {
    fail("Unexpected error during auth regression", error instanceof Error ? error.message : String(error));
});
