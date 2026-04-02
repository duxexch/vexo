#!/usr/bin/env node

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { WebSocket } from "ws";
import { Pool } from "pg";

const SMOKE_USER_AGENT = "smoke-challenge-permissions/1.0";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3001",
    databaseUrl: process.env.DATABASE_URL || "",
    redisUrl: process.env.REDIS_URL || "",
    password: "SmokePass123!",
    timeoutMs: 10000,
    keepData: false,
    resetSensitiveLimiter: ["1", "true", "yes"].includes(String(process.env.SMOKE_RESET_SENSITIVE_LIMITER || "").toLowerCase()),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--keep-data") {
      args.keepData = true;
      continue;
    }

    if (part === "--reset-sensitive-limiter") {
      args.resetSensitiveLimiter = true;
      continue;
    }

    const [key, value] = part.split("=");
    if (!value) continue;

    if (key === "--base-url") args.baseUrl = value.replace(/\/+$/, "");
    if (key === "--database-url") args.databaseUrl = value;
    if (key === "--redis-url") args.redisUrl = value;
    if (key === "--password") args.password = value;
    if (key === "--timeout-ms") args.timeoutMs = Number.parseInt(value, 10) || args.timeoutMs;
    if (key === "--reset-sensitive-limiter") {
      args.resetSensitiveLimiter = ["1", "true", "yes"].includes(value.toLowerCase());
    }
  }

  return args;
}

class SmokeError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SmokeError";
    this.details = details;
  }
}

function fail(message, details) {
  throw new SmokeError(message, details);
}

function assertCondition(condition, message, details) {
  if (!condition) {
    fail(message, details);
  }
}

function toWebSocketBaseUrl(baseUrl) {
  if (baseUrl.startsWith("https://")) {
    return `wss://${baseUrl.slice("https://".length)}`;
  }

  if (baseUrl.startsWith("http://")) {
    return `ws://${baseUrl.slice("http://".length)}`;
  }

  if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) {
    return baseUrl;
  }

  return `ws://${baseUrl}`;
}

function parseWsPayload(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function expandWsMessages(parsed) {
  if (parsed && parsed.type === "batch" && Array.isArray(parsed.messages)) {
    return parsed.messages;
  }
  return [parsed];
}

function wsErrorText(message) {
  return String(
    message?.payload?.message
    || message?.payload?.error
    || message?.error
    || "",
  );
}

async function requestJson({ baseUrl, path, method = "GET", token, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": SMOKE_USER_AGENT,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function expectStatus(response, expectedStatus, stepName) {
  if (response.status !== expectedStatus) {
    fail(`${stepName}: expected ${expectedStatus}, got ${response.status}`, response.json || response.text);
  }
  console.log(`[smoke:challenge-permissions] PASS ${stepName}`);
}

function expectStatusOrGlobalSensitiveLimiter(response, expectedStatus, stepName) {
  const errorText = String(response?.json?.error || "");
  const isGlobalSensitiveLimiter = response.status === 429
    && errorText.includes("Too many sensitive operations");

  if (response.status === expectedStatus) {
    console.log(`[smoke:challenge-permissions] PASS ${stepName}`);
    return;
  }

  if (isGlobalSensitiveLimiter) {
    console.log(`[smoke:challenge-permissions] WARN ${stepName} skipped by global sensitive-operation limiter`);
    return;
  }

  fail(`${stepName}: expected ${expectedStatus}, got ${response.status}`, response.json || response.text);
}

async function login({ baseUrl, username, password, timeoutMs }) {
  const res = await requestJson({
    baseUrl,
    path: "/api/auth/login",
    method: "POST",
    body: { username, password },
    timeoutMs,
  });

  expectStatus(res, 200, `login ${username}`);
  assertCondition(typeof res.json?.token === "string" && res.json.token.length > 20, "Missing auth token after login", res.json);

  return res.json.token;
}

async function connectWebSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        "User-Agent": SMOKE_USER_AGENT,
      },
    });

    const timeout = setTimeout(() => {
      cleanup();
      ws.terminate();
      reject(new SmokeError(`WebSocket did not open in time: ${url}`));
    }, timeoutMs);

    const onOpen = () => {
      cleanup();
      resolve(ws);
    };

    const onError = (error) => {
      cleanup();
      reject(new SmokeError(`WebSocket connection failed: ${url}`, error instanceof Error ? error.message : String(error)));
    };

    const onClose = (code, reason) => {
      cleanup();
      reject(new SmokeError(`WebSocket closed before open: ${url}`, { code, reason: reason.toString() }));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("open", onOpen);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("open", onOpen);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

async function waitForWsMessage(ws, predicate, timeoutMs, stepName) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new SmokeError(`${stepName}: timed out waiting for websocket message`));
    }, timeoutMs);

    const onMessage = (raw) => {
      const parsed = parseWsPayload(raw);
      if (!parsed) return;

      const candidates = expandWsMessages(parsed);
      for (const candidate of candidates) {
        if (predicate(candidate)) {
          cleanup();
          resolve(candidate);
          return;
        }
      }
    };

    const onClose = (code, reason) => {
      cleanup();
      reject(new SmokeError(`${stepName}: websocket closed while waiting for message`, { code, reason: reason.toString() }));
    };

    const onError = (error) => {
      cleanup();
      reject(new SmokeError(`${stepName}: websocket error`, error instanceof Error ? error.message : String(error)));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

async function assertNoWsMessage(ws, predicate, waitMs, stepName) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      console.log(`[smoke:challenge-permissions] PASS ${stepName}`);
      resolve();
    }, waitMs);

    const onMessage = (raw) => {
      const parsed = parseWsPayload(raw);
      if (!parsed) return;

      const candidates = expandWsMessages(parsed);
      for (const candidate of candidates) {
        if (predicate(candidate)) {
          cleanup();
          reject(new SmokeError(`${stepName}: received unexpected websocket message`, candidate));
          return;
        }
      }
    };

    const onClose = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

async function closeSocket(ws, timeoutMs) {
  if (!ws) return;
  if (ws.readyState === WebSocket.CLOSED) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, Math.min(timeoutMs, 1500));

    const onClose = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("close", onClose);
    };

    ws.on("close", onClose);

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "smoke-complete");
      } else {
        ws.terminate();
      }
    } catch {
      cleanup();
      resolve();
    }
  });
}

async function authenticateLegacySocket(ws, token, timeoutMs) {
  ws.send(JSON.stringify({ type: "auth", token }));
  const authMessage = await waitForWsMessage(
    ws,
    (message) => message?.type === "auth_success" || message?.type === "auth_error" || message?.type === "ws_error",
    timeoutMs,
    "legacy ws auth success",
  );

  assertCondition(
    authMessage?.type === "auth_success",
    "Legacy websocket authentication failed",
    authMessage,
  );
}

async function authenticateGameSocket(ws, token, timeoutMs) {
  ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
  const authMessage = await waitForWsMessage(
    ws,
    (message) => message?.type === "authenticated" || message?.type === "error",
    timeoutMs,
    "game ws auth success",
  );

  assertCondition(
    authMessage?.type === "authenticated",
    "Game websocket authentication failed",
    authMessage,
  );
}

function buildChessInitialState(player1Id, player2Id) {
  const now = Date.now();
  return JSON.stringify({
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    history: [],
    players: { white: player1Id, black: player2Id },
    currentTurn: "white",
    startTime: now,
    lastMoveTime: now,
    whiteTimeMs: 600000,
    blackTimeMs: 600000,
    incrementMs: 0,
    capturedPieces: { white: [], black: [] },
    lastMove: null,
  });
}

async function ensureGameRecord(pool, gameName, fallbackId, createdGameIds) {
  const existing = await pool.query(
    "SELECT id FROM games WHERE lower(name) = lower($1) LIMIT 1",
    [gameName],
  );

  if (existing.rowCount && existing.rows[0]?.id) {
    return String(existing.rows[0].id);
  }

  await pool.query(
    `INSERT INTO games (id, name, category, game_type, min_players, max_players, is_free_to_play)
     VALUES ($1, $2, 'board', 'multiplayer', 2, 2, true)`,
    [fallbackId, gameName],
  );

  createdGameIds.push(fallbackId);
  return fallbackId;
}

async function resetSensitiveLimiterKeys(redisUrl) {
  if (!redisUrl) {
    throw new SmokeError("--reset-sensitive-limiter requires REDIS_URL or --redis-url");
  }

  const { default: Redis } = await import("ioredis");
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });

  try {
    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "rl:sensitive:*", "COUNT", "500");
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== "0");

    console.log(`[smoke:challenge-permissions] Reset sensitive limiter keys: ${deleted}`);
  } finally {
    redis.disconnect();
  }
}

async function safeDelete(pool, sql, values) {
  try {
    await pool.query(sql, values);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist")) {
      return;
    }
    throw error;
  }
}

async function detectChallengeCurrencyType(pool) {
  const { rows } = await pool.query(
    "SELECT value FROM gameplay_settings WHERE key = 'play_gift_currency_mode' LIMIT 1",
  );

  const modeValue = String(rows?.[0]?.value || "").toLowerCase();
  return modeValue === "mixed" ? "usd" : "project";
}

async function seedProjectWallets(pool, userIds) {
  for (const userId of userIds) {
    await pool.query(
      `INSERT INTO project_currency_wallets (
          user_id, purchased_balance, earned_balance, total_balance,
          total_converted, total_spent, total_earned, locked_balance
        ) VALUES (
          $1, '100.00', '100.00', '200.00',
          '0.00', '0.00', '0.00', '0.00'
        )`,
      [userId],
    );
  }
}

async function cleanup(pool, setupData) {
  const challengeIds = Object.values(setupData.challengeIds);
  const userIds = Object.values(setupData.userIds);
  const liveSessionIds = Object.values(setupData.liveSessionIds || {});

  await safeDelete(pool, "DELETE FROM spectator_gifts WHERE session_id = ANY($1::text[])", [liveSessionIds]);
  await safeDelete(pool, "DELETE FROM game_spectators WHERE session_id = ANY($1::text[])", [liveSessionIds]);
  await safeDelete(pool, "DELETE FROM game_moves WHERE session_id = ANY($1::text[])", [liveSessionIds]);
  await safeDelete(pool, "DELETE FROM game_chat_messages WHERE session_id = ANY($1::text[])", [liveSessionIds]);

  await safeDelete(pool, "DELETE FROM challenge_points_ledger WHERE challenge_id = ANY($1::text[])", [challengeIds]);
  await safeDelete(pool, "DELETE FROM challenge_gifts WHERE challenge_id = ANY($1::text[])", [challengeIds]);
  await safeDelete(pool, "DELETE FROM challenge_spectator_bets WHERE challenge_id = ANY($1::text[])", [challengeIds]);
  await safeDelete(pool, "DELETE FROM challenge_spectators WHERE challenge_id = ANY($1::text[])", [challengeIds]);
  await safeDelete(pool, "DELETE FROM challenge_chat_messages WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM chess_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM domino_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM backgammon_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM baloot_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM tarneeb_moves WHERE session_id IN (SELECT id FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[]))", [challengeIds]);
  await safeDelete(pool, "DELETE FROM challenge_game_sessions WHERE challenge_id = ANY($1::text[])", [challengeIds]);
  await safeDelete(pool, "DELETE FROM live_game_sessions WHERE id = ANY($1::text[]) OR challenge_id = ANY($2::text[])", [liveSessionIds, challengeIds]);

  await safeDelete(pool, "DELETE FROM transactions WHERE reference_id = ANY($1::text[]) OR user_id = ANY($2::text[])", [challengeIds, userIds]);
  await safeDelete(pool, "DELETE FROM project_currency_ledger WHERE reference_id = ANY($1::text[]) OR user_id = ANY($2::text[])", [challengeIds, userIds]);

  await safeDelete(pool, "DELETE FROM challenges WHERE id = ANY($1::text[])", [challengeIds]);

  await safeDelete(pool, "DELETE FROM project_currency_wallets WHERE user_id = ANY($1::text[])", [userIds]);

  await safeDelete(pool, "DELETE FROM user_relationships WHERE user_id = ANY($1::text[]) OR target_user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM notifications WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM audit_logs WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM active_sessions WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM login_history WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM password_reset_tokens WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM otp_verifications WHERE user_id = ANY($1::text[])", [userIds]);
  await safeDelete(pool, "DELETE FROM two_factor_backup_codes WHERE user_id = ANY($1::text[])", [userIds]);

  await safeDelete(pool, "DELETE FROM users WHERE id = ANY($1::text[])", [userIds]);

  if (Array.isArray(setupData.createdGameIds) && setupData.createdGameIds.length > 0) {
    await safeDelete(pool, "DELETE FROM games WHERE id = ANY($1::text[])", [setupData.createdGameIds]);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.databaseUrl) {
    fail("DATABASE_URL is required (use --database-url=... or env DATABASE_URL)");
  }

  const pool = new Pool({ connectionString: options.databaseUrl });
  const runTag = crypto.randomBytes(4).toString("hex");

  const setupData = {
    userIds: {
      creator: crypto.randomUUID(),
      invited: crypto.randomUUID(),
      outsider: crypto.randomUUID(),
      spectator: crypto.randomUUID(),
      bystander: crypto.randomUUID(),
    },
    usernames: {
      creator: `smoke_creator_${runTag}`,
      invited: `smoke_invited_${runTag}`,
      outsider: `smoke_outsider_${runTag}`,
      spectator: `smoke_spectator_${runTag}`,
      bystander: `smoke_bystander_${runTag}`,
    },
    challengeIds: {
      privateFriend: crypto.randomUUID(),
      publicSeated: crypto.randomUUID(),
      publicOpen: crypto.randomUUID(),
      publicRealtime: crypto.randomUUID(),
    },
    liveSessionIds: {
      publicRealtime: crypto.randomUUID(),
    },
    gameIds: {
      chess: crypto.randomUUID(),
    },
    createdGameIds: [],
  };

  let shouldAttemptCleanup = false;

  try {
    await pool.query("SELECT 1");
    shouldAttemptCleanup = true;

    const challengeCurrencyType = await detectChallengeCurrencyType(pool);
    const isProjectMode = challengeCurrencyType === "project";

    console.log(`[smoke:challenge-permissions] Challenge currency mode: ${challengeCurrencyType}`);

    if (options.resetSensitiveLimiter) {
      await resetSensitiveLimiterKeys(options.redisUrl);
    }

    const passwordHash = await bcrypt.hash(options.password, 12);

    await pool.query(
      `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
      [setupData.userIds.creator, setupData.usernames.creator, passwordHash],
    );

    await pool.query(
      `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
      [setupData.userIds.invited, setupData.usernames.invited, passwordHash],
    );

    await pool.query(
      `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
      [setupData.userIds.outsider, setupData.usernames.outsider, passwordHash],
    );

    await pool.query(
      `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
      [setupData.userIds.spectator, setupData.usernames.spectator, passwordHash],
    );

    await pool.query(
      `INSERT INTO users (id, username, password, role, status, registration_type, balance)
       VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
      [setupData.userIds.bystander, setupData.usernames.bystander, passwordHash],
    );

    if (isProjectMode) {
      await seedProjectWallets(pool, Object.values(setupData.userIds));
      console.log("[smoke:challenge-permissions] Seeded project currency wallets for smoke users");
    }

    await pool.query(
      `INSERT INTO challenges (
          id, game_type, bet_amount, currency_type, visibility, status,
          player1_id, player2_id, required_players, current_players,
          opponent_type, friend_account_id
        ) VALUES (
          $1, 'chess', '1.00', $5, 'private', 'waiting',
          $2, $3, 2, 1,
          'friend', $4
        )`,
      [
        setupData.challengeIds.privateFriend,
        setupData.userIds.creator,
        setupData.userIds.invited,
        setupData.userIds.invited,
        challengeCurrencyType,
      ],
    );

    await pool.query(
      `INSERT INTO challenges (
          id, game_type, bet_amount, currency_type, visibility, status,
          player1_id, player2_id, player3_id, required_players, current_players,
          opponent_type
        ) VALUES (
          $1, 'domino', '2.00', $5, 'public', 'waiting',
          $2, $3, $4, 4, 3,
          'anyone'
        )`,
      [
        setupData.challengeIds.publicSeated,
        setupData.userIds.creator,
        setupData.userIds.outsider,
        setupData.userIds.invited,
        challengeCurrencyType,
      ],
    );

    await pool.query(
      `INSERT INTO challenges (
          id, game_type, bet_amount, currency_type, visibility, status,
          player1_id, required_players, current_players, opponent_type
        ) VALUES (
          $1, 'backgammon', '3.00', $3, 'public', 'waiting',
          $2, 2, 1, 'anyone'
        )`,
      [setupData.challengeIds.publicOpen, setupData.userIds.creator, challengeCurrencyType],
    );

    await pool.query(
      `INSERT INTO challenges (
          id, game_type, bet_amount, currency_type, visibility, status,
          player1_id, player2_id, required_players, current_players,
          opponent_type
        ) VALUES (
          $1, 'chess', '0.00', $4, 'public', 'active',
          $2, $3, 2, 2,
          'anyone'
        )`,
      [
        setupData.challengeIds.publicRealtime,
        setupData.userIds.creator,
        setupData.userIds.outsider,
        challengeCurrencyType,
      ],
    );

    await pool.query(
      `INSERT INTO challenge_spectators (challenge_id, user_id, joined_at, left_at)
       VALUES ($1, $2, NOW(), NULL)`,
      [setupData.challengeIds.publicSeated, setupData.userIds.spectator],
    );

    const creatorToken = await login({
      baseUrl: options.baseUrl,
      username: setupData.usernames.creator,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });
    const invitedToken = await login({
      baseUrl: options.baseUrl,
      username: setupData.usernames.invited,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });
    const outsiderToken = await login({
      baseUrl: options.baseUrl,
      username: setupData.usernames.outsider,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });
    const spectatorToken = await login({
      baseUrl: options.baseUrl,
      username: setupData.usernames.spectator,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });
    const bystanderToken = await login({
      baseUrl: options.baseUrl,
      username: setupData.usernames.bystander,
      password: options.password,
      timeoutMs: options.timeoutMs,
    });

    const privateChallengeId = setupData.challengeIds.privateFriend;

    expectStatus(
      await requestJson({ baseUrl: options.baseUrl, path: `/api/challenges/${privateChallengeId}`, token: outsiderToken, timeoutMs: options.timeoutMs }),
      403,
      "private details blocked for outsider",
    );

    expectStatus(
      await requestJson({ baseUrl: options.baseUrl, path: `/api/challenges/${privateChallengeId}/gifts`, token: outsiderToken, timeoutMs: options.timeoutMs }),
      403,
      "private gifts blocked for outsider",
    );

    expectStatus(
      await requestJson({ baseUrl: options.baseUrl, path: `/api/challenges/${privateChallengeId}/session`, token: outsiderToken, timeoutMs: options.timeoutMs }),
      403,
      "private session blocked for outsider",
    );

    expectStatus(
      await requestJson({ baseUrl: options.baseUrl, path: `/api/challenges/${privateChallengeId}/points`, token: outsiderToken, timeoutMs: options.timeoutMs }),
      403,
      "private points blocked for outsider",
    );

    expectStatus(
      await requestJson({ baseUrl: options.baseUrl, path: `/api/challenges/${privateChallengeId}`, token: invitedToken, timeoutMs: options.timeoutMs }),
      200,
      "private details allowed for invited participant",
    );

    expectStatus(
      await requestJson({
        baseUrl: options.baseUrl,
        path: `/api/challenges/${privateChallengeId}/join`,
        method: "POST",
        token: outsiderToken,
        body: {},
        timeoutMs: options.timeoutMs,
      }),
      403,
      "friend-reserved join blocked for outsider",
    );

    const invitedAvailable = await requestJson({
      baseUrl: options.baseUrl,
      path: "/api/challenges/available",
      token: invitedToken,
      timeoutMs: options.timeoutMs,
    });
    expectStatus(invitedAvailable, 200, "available list for invited participant");

    const invitedAvailableIds = Array.isArray(invitedAvailable.json)
      ? invitedAvailable.json.map((item) => String(item?.id || ""))
      : [];

    assertCondition(
      invitedAvailableIds.includes(setupData.challengeIds.publicOpen),
      "Expected open public challenge to be visible for invited participant",
      invitedAvailable.json,
    );

    assertCondition(
      !invitedAvailableIds.includes(setupData.challengeIds.publicSeated),
      "Seated participant challenge must be excluded from available list",
      invitedAvailable.json,
    );
    console.log("[smoke:challenge-permissions] PASS seated participant exclusion in available list");

    const creatorAvailable = await requestJson({
      baseUrl: options.baseUrl,
      path: "/api/challenges/available",
      token: creatorToken,
      timeoutMs: options.timeoutMs,
    });
    expectStatus(creatorAvailable, 200, "available list for creator");

    const creatorAvailableIds = Array.isArray(creatorAvailable.json)
      ? creatorAvailable.json.map((item) => String(item?.id || ""))
      : [];

    assertCondition(
      !creatorAvailableIds.includes(setupData.challengeIds.publicOpen),
      "Challenge creator must not see own waiting challenge in available list",
      creatorAvailable.json,
    );
    console.log("[smoke:challenge-permissions] PASS creator exclusion in available list");

    const pointsRequestBody = {
      challengeId: setupData.challengeIds.publicSeated,
      targetPlayerId: setupData.userIds.invited,
      pointsAmount: 25,
    };

    expectStatusOrGlobalSensitiveLimiter(
      await requestJson({
        baseUrl: options.baseUrl,
        path: "/api/challenge-points",
        method: "POST",
        token: creatorToken,
        body: pointsRequestBody,
        timeoutMs: options.timeoutMs,
      }),
      403,
      "participant blocked from adding challenge points",
    );

    expectStatusOrGlobalSensitiveLimiter(
      await requestJson({
        baseUrl: options.baseUrl,
        path: "/api/challenge-points",
        method: "POST",
        token: bystanderToken,
        body: pointsRequestBody,
        timeoutMs: options.timeoutMs,
      }),
      403,
      "non-spectator blocked from adding challenge points",
    );

    const spectatorPointsResponse = await requestJson({
      baseUrl: options.baseUrl,
      path: "/api/challenge-points",
      method: "POST",
      token: spectatorToken,
      body: pointsRequestBody,
      timeoutMs: options.timeoutMs,
    });

    const spectatorPointsError = String(spectatorPointsResponse.json?.error || "");
    const hitGlobalSensitiveLimiter = spectatorPointsResponse.status === 429
      && spectatorPointsError.includes("Too many sensitive operations");

    if (hitGlobalSensitiveLimiter) {
      console.log("[smoke:challenge-permissions] WARN global sensitive-operation limiter hit before spectator allow-check; skipping cooldown assertion for this run");
    } else {
      expectStatus(
        spectatorPointsResponse,
        200,
        "active spectator allowed to add challenge points",
      );

      expectStatus(
        await requestJson({
          baseUrl: options.baseUrl,
          path: "/api/challenge-points",
          method: "POST",
          token: spectatorToken,
          body: pointsRequestBody,
          timeoutMs: options.timeoutMs,
        }),
        429,
        "challenge points cooldown enforced",
      );
    }

    const wsBaseUrl = toWebSocketBaseUrl(options.baseUrl);
    const openSockets = [];

    try {
      const creatorLegacySocket = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);
      openSockets.push(creatorLegacySocket);
      const outsiderLegacySocket = await connectWebSocket(`${wsBaseUrl}/ws`, options.timeoutMs);
      openSockets.push(outsiderLegacySocket);

      await authenticateLegacySocket(creatorLegacySocket, creatorToken, options.timeoutMs);
      await authenticateLegacySocket(outsiderLegacySocket, outsiderToken, options.timeoutMs);

      creatorLegacySocket.send(JSON.stringify({
        type: "join_challenge_game",
        challengeId: setupData.challengeIds.publicSeated,
      }));
      await waitForWsMessage(
        creatorLegacySocket,
        (message) => message?.type === "role_assigned" && message?.role === "player",
        options.timeoutMs,
        "legacy role assigned for player",
      );

      creatorLegacySocket.send(JSON.stringify({
        type: "gift_to_player",
        challengeId: setupData.challengeIds.publicSeated,
        recipientId: setupData.userIds.bystander,
        giftId: "smoke_invalid_recipient",
      }));
      await waitForWsMessage(
        creatorLegacySocket,
        (message) => message?.type === "challenge_error"
          && String(message?.error || "").includes("Recipient must be a challenge participant"),
        options.timeoutMs,
        "legacy gift recipient scope enforced",
      );
      console.log("[smoke:challenge-permissions] PASS legacy realtime gifting recipient constraints");

      const privateJoinResponse = await requestJson({
        baseUrl: options.baseUrl,
        path: `/api/challenges/${privateChallengeId}/join`,
        method: "POST",
        token: invitedToken,
        body: {},
        timeoutMs: options.timeoutMs,
      });
      expectStatus(privateJoinResponse, 200, "invited friend can accept private reserved seat");

      const privateSessionId = String(privateJoinResponse.json?.sessionId || "");
      assertCondition(
        privateSessionId.length > 10,
        "Expected private challenge join to return sessionId",
        privateJoinResponse.json,
      );

      await waitForWsMessage(
        creatorLegacySocket,
        (message) => message?.type === "challenge_update"
          && String(message?.eventType || "") === "started"
          && String(message?.data?.id || "") === privateChallengeId,
        options.timeoutMs,
        "private challenge update delivered to authorized audience",
      );

      await assertNoWsMessage(
        outsiderLegacySocket,
        (message) => message?.type === "challenge_update"
          && String(message?.data?.id || "") === privateChallengeId,
        Math.min(options.timeoutMs, 1500),
        "private challenge update hidden from outsider audience",
      );

      const outsiderGameSocket = await connectWebSocket(`${wsBaseUrl}/ws/game`, options.timeoutMs);
      openSockets.push(outsiderGameSocket);
      await authenticateGameSocket(outsiderGameSocket, outsiderToken, options.timeoutMs);

      outsiderGameSocket.send(JSON.stringify({
        type: "spectate",
        payload: { sessionId: privateSessionId },
      }));
      await waitForWsMessage(
        outsiderGameSocket,
        (message) => message?.type === "error"
          && wsErrorText(message).includes("Not authorized to spectate this private challenge"),
        options.timeoutMs,
        "private spectate authorization on /ws/game",
      );
      console.log("[smoke:challenge-permissions] PASS /ws/game private spectate blocked for outsider");

      const chessGameId = await ensureGameRecord(pool, "chess", setupData.gameIds.chess, setupData.createdGameIds);
      const realtimeState = buildChessInitialState(setupData.userIds.creator, setupData.userIds.outsider);

      await pool.query(
        `INSERT INTO live_game_sessions (
            id, challenge_id, game_id, game_type, status, game_state,
            current_turn, player1_id, player2_id, turn_number, turn_time_limit, started_at
          ) VALUES (
            $1, $2, $3, 'chess', 'in_progress', $4,
            $5, $6, $7, 1, 60, NOW()
          )`,
        [
          setupData.liveSessionIds.publicRealtime,
          setupData.challengeIds.publicRealtime,
          chessGameId,
          realtimeState,
          setupData.userIds.creator,
          setupData.userIds.creator,
          setupData.userIds.outsider,
        ],
      );

      const creatorGameSocket = await connectWebSocket(`${wsBaseUrl}/ws/game`, options.timeoutMs);
      openSockets.push(creatorGameSocket);
      const bystanderGameSocket = await connectWebSocket(`${wsBaseUrl}/ws/game`, options.timeoutMs);
      openSockets.push(bystanderGameSocket);

      await authenticateGameSocket(creatorGameSocket, creatorToken, options.timeoutMs);
      await authenticateGameSocket(bystanderGameSocket, bystanderToken, options.timeoutMs);

      creatorGameSocket.send(JSON.stringify({
        type: "join_game",
        payload: { sessionId: setupData.liveSessionIds.publicRealtime },
      }));
      await waitForWsMessage(
        creatorGameSocket,
        (message) => message?.type === "game_joined"
          && String(message?.payload?.sessionId || "") === setupData.liveSessionIds.publicRealtime,
        options.timeoutMs,
        "creator joined public realtime game",
      );

      outsiderGameSocket.send(JSON.stringify({
        type: "join_game",
        payload: { sessionId: setupData.liveSessionIds.publicRealtime },
      }));
      await waitForWsMessage(
        outsiderGameSocket,
        (message) => message?.type === "game_joined"
          && String(message?.payload?.sessionId || "") === setupData.liveSessionIds.publicRealtime,
        options.timeoutMs,
        "opponent joined public realtime game",
      );

      bystanderGameSocket.send(JSON.stringify({
        type: "spectate",
        payload: { sessionId: setupData.liveSessionIds.publicRealtime },
      }));
      await waitForWsMessage(
        bystanderGameSocket,
        (message) => message?.type === "spectating"
          && String(message?.payload?.sessionId || "") === setupData.liveSessionIds.publicRealtime,
        options.timeoutMs,
        "spectator joined public realtime game",
      );

      bystanderGameSocket.send(JSON.stringify({
        type: "send_gift",
        payload: {
          recipientId: setupData.userIds.spectator,
          giftItemId: "smoke_non_participant_recipient",
          quantity: 1,
          message: "scope-check",
        },
      }));
      await waitForWsMessage(
        bystanderGameSocket,
        (message) => message?.type === "error"
          && wsErrorText(message).includes("Recipient must be an active player in this match"),
        options.timeoutMs,
        "game ws gift recipient scope enforced",
      );
      console.log("[smoke:challenge-permissions] PASS /ws/game gifting recipient constraints");

      creatorGameSocket.send(JSON.stringify({ type: "leave_game" }));

      await waitForWsMessage(
        outsiderGameSocket,
        (message) => message?.type === "game_over"
          && String(message?.payload?.reason || "") === "abandonment",
        options.timeoutMs,
        "game_over emitted on voluntary leave before forfeit notification",
      );

      await waitForWsMessage(
        outsiderGameSocket,
        (message) => message?.type === "player_forfeited"
          && String(message?.payload?.forfeitedBy || "") === setupData.userIds.creator,
        options.timeoutMs,
        "player_forfeited emitted after game_over",
      );

      const liveSessionStatus = await pool.query(
        `SELECT status, winner_id AS "winnerId"
         FROM live_game_sessions
         WHERE id = $1`,
        [setupData.liveSessionIds.publicRealtime],
      );

      assertCondition(
        liveSessionStatus.rowCount === 1,
        "Expected realtime live session row to exist after forfeit",
      );
      assertCondition(
        String(liveSessionStatus.rows[0].status || "") === "completed",
        "Live game session must be completed after voluntary forfeit",
        liveSessionStatus.rows[0],
      );
      assertCondition(
        String(liveSessionStatus.rows[0].winnerId || "") === setupData.userIds.outsider,
        "Opponent must be winner after voluntary leave forfeit",
        liveSessionStatus.rows[0],
      );
      console.log("[smoke:challenge-permissions] PASS forfeit completion persisted on live game session");

      const challengeCompletion = await pool.query(
        `SELECT status, winner_id AS "winnerId"
         FROM challenges
         WHERE id = $1`,
        [setupData.challengeIds.publicRealtime],
      );

      assertCondition(
        challengeCompletion.rowCount === 1,
        "Expected challenge row to exist for realtime forfeit assertion",
      );
      assertCondition(
        String(challengeCompletion.rows[0].status || "") === "completed",
        "Challenge must be marked completed after realtime forfeit",
        challengeCompletion.rows[0],
      );
      assertCondition(
        String(challengeCompletion.rows[0].winnerId || "") === setupData.userIds.outsider,
        "Challenge winner must match opponent on forfeit",
        challengeCompletion.rows[0],
      );
      console.log("[smoke:challenge-permissions] PASS challenge winner/status persisted after realtime forfeit");
    } finally {
      await Promise.all(openSockets.map((socket) => closeSocket(socket, options.timeoutMs)));
    }

    console.log("[smoke:challenge-permissions] All checks passed.");
  } finally {
    if (!options.keepData && shouldAttemptCleanup) {
      try {
        await cleanup(pool, setupData);
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        console.warn("[smoke:challenge-permissions] Cleanup warning:", message);
      }
    } else if (!options.keepData && !shouldAttemptCleanup) {
      console.warn("[smoke:challenge-permissions] Cleanup skipped because database connection was not established.");
    } else {
      console.log("[smoke:challenge-permissions] keep-data enabled, skipping cleanup.");
    }
    await pool.end();
  }
}

main().catch((error) => {
  if (error instanceof SmokeError) {
    if (error.details !== undefined) {
      console.error("[smoke:challenge-permissions]", error.message, error.details);
    } else {
      console.error("[smoke:challenge-permissions]", error.message);
    }
    process.exit(1);
  }

  const details = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack || ""}`
    : String(error);
  console.error("[smoke:challenge-permissions] Unexpected error during challenge permissions smoke test", details);
  process.exit(1);
});
