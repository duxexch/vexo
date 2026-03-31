import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const AGENT_NAME = String(process.env.AI_AGENT_NAME || 'sam9').trim() || 'sam9';
const PORT = Number(process.env.PORT || 3100);
const DATA_DIR = process.env.AI_AGENT_DATA_DIR || path.resolve(process.cwd(), 'data');
const MODEL_FILE = path.join(DATA_DIR, 'ai-agent-model.json');
const SHARED_TOKEN = process.env.AI_AGENT_SHARED_TOKEN || '';
const PRIVACY_SALT = process.env.AI_AGENT_PRIVACY_SALT || process.env.AI_AGENT_SHARED_TOKEN || 'sam9-privacy-salt';
const MAX_RAW_EVENTS = Math.max(500, Number(process.env.AI_AGENT_MAX_RAW_EVENTS || 5000));
const MAX_PROJECT_SNAPSHOTS = Math.max(50, Number(process.env.AI_AGENT_MAX_PROJECT_SNAPSHOTS || 300));

const DEFENSIVE_MOVE_TYPES = new Set(['pass', 'draw', 'decline_double', 'offer_draw', 'respond_draw']);
const AGGRESSIVE_MOVE_TYPES = new Set(['move', 'play', 'playCard', 'double', 'bid', 'choose', 'setTrump']);

const SENSITIVE_KEY_RE = /(password|passcode|secret|token|email|phone|mobile|address|national|ssn|iban|card|cvv|otp|cookie|authorization|auth)/i;
const ID_KEY_RE = /(^|_)(user|admin|player|bot|session).*id(s)?$/i;
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeMapKey(value, fallback = 'unknown') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (BLOCKED_OBJECT_KEYS.has(raw)) return `${fallback}_key`;

  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);
    const isAlphaNum = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    out += (isAlphaNum || ch === '_' || ch === '-' || ch === '.') ? ch : '_';
  }

  return out || fallback;
}

function isSafeEmailAddress(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 254) return false;

  const at = text.indexOf('@');
  if (at <= 0 || at !== text.lastIndexOf('@') || at >= text.length - 3) return false;

  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (!local || !domain || !domain.includes('.')) return false;
  if (local.length > 64 || local[0] === '.' || local[local.length - 1] === '.') return false;

  const localAllowed = "!#$%&'*+/=?^_`{|}~-";
  for (let i = 0; i < local.length; i += 1) {
    const ch = local[i];
    const code = local.charCodeAt(i);
    const isAlphaNum = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (isAlphaNum || ch === '.' || localAllowed.includes(ch)) continue;
    return false;
  }

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    const first = label.charCodeAt(0);
    const last = label.charCodeAt(label.length - 1);
    const firstOk = (first >= 48 && first <= 57) || (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
    const lastOk = (last >= 48 && last <= 57) || (last >= 65 && last <= 90) || (last >= 97 && last <= 122);
    if (!firstOk || !lastOk) return false;

    for (let i = 0; i < label.length; i += 1) {
      const ch = label[i];
      const code = label.charCodeAt(i);
      const isAlphaNum = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      if (isAlphaNum || ch === '-') continue;
      return false;
    }
  }

  return labels[labels.length - 1].length >= 2;
}

function trimTokenPunctuation(token) {
  const punctuation = new Set(['(', ')', '[', ']', '{', '}', '<', '>', '"', "'", ',', ';', ':', '!']);
  let start = 0;
  let end = token.length;
  while (start < end && punctuation.has(token[start])) start += 1;
  while (end > start && punctuation.has(token[end - 1])) end -= 1;
  return {
    prefix: token.slice(0, start),
    core: token.slice(start, end),
    suffix: token.slice(end),
  };
}

function redactEmails(text) {
  const tokens = String(text || '').split(' ');
  for (let i = 0; i < tokens.length; i += 1) {
    const parts = trimTokenPunctuation(tokens[i]);
    if (isSafeEmailAddress(parts.core)) {
      tokens[i] = `${parts.prefix}[redacted-email]${parts.suffix}`;
    }
  }
  return tokens.join(' ');
}

function isPhoneLikeChar(ch) {
  return (ch >= '0' && ch <= '9') || ch === '+' || ch === ' ' || ch === '-' || ch === '(' || ch === ')';
}

function looksLikePhoneSegment(text) {
  if (!text) return false;
  let digits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      digits += 1;
      continue;
    }
    if (!isPhoneLikeChar(ch)) return false;
  }
  return digits >= 7;
}

function redactPhoneSequences(text) {
  let out = '';
  let segment = '';

  const flush = () => {
    if (!segment) return;
    out += looksLikePhoneSegment(segment) ? '[redacted-phone]' : segment;
    segment = '';
  };

  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (isPhoneLikeChar(ch)) {
      segment += ch;
      continue;
    }
    flush();
    out += ch;
  }

  flush();
  return out;
}

function randomInt(min, max) {
  if (max <= min) return min;
  return crypto.randomInt(min, max + 1);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function hashStable(value) {
  const raw = String(value || '');
  const digest = crypto.createHmac('sha256', PRIVACY_SALT).update(raw).digest('hex');
  return `anon_${digest.slice(0, 16)}`;
}

function redactString(text) {
  if (!text) return '';
  let value = String(text).trim();

  if (!value) return value;
  value = redactEmails(value);
  value = redactPhoneSequences(value);

  // Truncate any long payload to avoid leaking too much context.
  if (value.length > 240) {
    value = `${value.slice(0, 240)}...`;
  }

  return value;
}

function sanitizeDeep(input, keyPath = '', depth = 0) {
  if (depth > 8) return '[depth-limited]';

  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    const keyName = keyPath.split('.').pop() || '';
    if (SENSITIVE_KEY_RE.test(keyName)) return '[redacted]';
    if (ID_KEY_RE.test(keyName)) return hashStable(input);
    return redactString(input);
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0;
    return input;
  }

  if (typeof input === 'boolean') return input;

  if (Array.isArray(input)) {
    const keyName = keyPath.split('.').pop() || '';
    if (ID_KEY_RE.test(keyName)) {
      return input.map((item) => hashStable(item));
    }
    return input.slice(0, 120).map((item, index) => sanitizeDeep(item, `${keyPath}[${index}]`, depth + 1));
  }

  if (isPlainObject(input)) {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = '[redacted]';
        continue;
      }

      if (ID_KEY_RE.test(key)) {
        if (Array.isArray(value)) {
          out[key] = value.slice(0, 120).map((item) => hashStable(item));
        } else {
          out[key] = hashStable(value);
        }
        continue;
      }

      out[key] = sanitizeDeep(value, keyPath ? `${keyPath}.${key}` : key, depth + 1);
    }
    return out;
  }

  return String(input);
}

function difficultyThinkRange(level) {
  if (level === 'easy') return { min: 900, max: 2200 };
  if (level === 'medium') return { min: 700, max: 1800 };
  if (level === 'hard') return { min: 500, max: 1300 };
  return { min: 350, max: 1000 };
}

function strategyKey(gameType, difficultyLevel) {
  const safeGame = normalizeMapKey(gameType, 'unknown');
  const safeDifficulty = normalizeMapKey(difficultyLevel, 'medium');
  return `${safeGame}:${safeDifficulty}`;
}

function defaultModel() {
  return {
    version: 2,
    agent: {
      name: AGENT_NAME,
      mode: 'production',
      privacyMode: 'strict',
    },
    runtime: {
      enabled: true,
      changedAt: nowIso(),
      changedBy: 'bootstrap',
      reason: '',
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
    summary: {
      totalEvents: 0,
      eventCounts: Object.create(null),
      botDecisions: 0,
      adminChats: 0,
      selfTuneRuns: 0,
      lastSelfTuneAt: null,
    },
    strategies: Object.create(null),
    users: Object.create(null),
    games: Object.create(null),
    sessions: Object.create(null),
    projectSnapshots: [],
    rawEvents: [],
    analytics: {
      eventsByDay: Object.create(null),
      resultsByDay: Object.create(null),
      moveTypeByGame: Object.create(null),
      decisionTotals: {
        count: 0,
        totalConfidence: 0,
        totalThinkMs: 0,
        totalConsideredMoves: 0,
        consideredSamples: 0,
      },
    },
  };
}

let model = defaultModel();
let flushTimer = null;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function migrateModel(parsed) {
  const base = defaultModel();

  const merged = {
    ...base,
    ...parsed,
    agent: {
      ...base.agent,
      ...(isPlainObject(parsed?.agent) ? parsed.agent : {}),
      name: AGENT_NAME,
      privacyMode: 'strict',
    },
    summary: {
      ...base.summary,
      ...(isPlainObject(parsed?.summary) ? parsed.summary : {}),
    },
    runtime: {
      ...base.runtime,
      ...(isPlainObject(parsed?.runtime) ? parsed.runtime : {}),
    },
    analytics: {
      ...base.analytics,
      ...(isPlainObject(parsed?.analytics) ? parsed.analytics : {}),
      decisionTotals: {
        ...base.analytics.decisionTotals,
        ...(isPlainObject(parsed?.analytics?.decisionTotals) ? parsed.analytics.decisionTotals : {}),
      },
    },
    strategies: isPlainObject(parsed?.strategies) ? parsed.strategies : Object.create(null),
    users: isPlainObject(parsed?.users) ? parsed.users : Object.create(null),
    games: isPlainObject(parsed?.games) ? parsed.games : Object.create(null),
    sessions: isPlainObject(parsed?.sessions) ? parsed.sessions : Object.create(null),
    projectSnapshots: Array.isArray(parsed?.projectSnapshots) ? parsed.projectSnapshots : [],
    rawEvents: Array.isArray(parsed?.rawEvents) ? parsed.rawEvents : [],
  };

  merged.version = 2;
  merged.agent.name = AGENT_NAME;
  merged.agent.mode = 'production';
  merged.agent.privacyMode = 'strict';
  merged.runtime.enabled = merged.runtime.enabled !== false;
  merged.runtime.changedAt = String(merged.runtime.changedAt || nowIso());
  merged.runtime.changedBy = String(merged.runtime.changedBy || 'migration');
  merged.runtime.reason = String(merged.runtime.reason || '');
  merged.rawEvents = merged.rawEvents.slice(-MAX_RAW_EVENTS);
  merged.projectSnapshots = merged.projectSnapshots.slice(-MAX_PROJECT_SNAPSHOTS);

  return merged;
}

async function loadModel() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(MODEL_FILE, 'utf8');
    const parsed = safeJsonParse(raw, defaultModel());
    model = migrateModel(parsed);
  } catch {
    model = defaultModel();
  }
}

async function flushModel() {
  try {
    model.updatedAt = nowIso();
    await ensureDataDir();
    const tempFile = `${MODEL_FILE}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(model, null, 2), 'utf8');
    await fs.rename(tempFile, MODEL_FILE);
  } catch (error) {
    console.error('[sam9] flush failed:', error);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushModel();
  }, 500);
}

function getRuntimeState() {
  if (!isPlainObject(model.runtime)) {
    model.runtime = {
      enabled: true,
      changedAt: nowIso(),
      changedBy: 'repair',
      reason: '',
    };
  }

  return {
    enabled: model.runtime.enabled !== false,
    changedAt: String(model.runtime.changedAt || ''),
    changedBy: String(model.runtime.changedBy || ''),
    reason: String(model.runtime.reason || ''),
  };
}

function isRuntimeEnabled() {
  return getRuntimeState().enabled;
}

function setRuntimeEnabled(nextEnabled, requestedBy = 'admin-api', reason = '', trigger = 'admin_control') {
  const runtime = getRuntimeState();
  const enabled = Boolean(nextEnabled);

  if (runtime.enabled === enabled) {
    return runtime;
  }

  model.runtime.enabled = enabled;
  model.runtime.changedAt = nowIso();
  model.runtime.changedBy = String(requestedBy || 'admin-api').slice(0, 120);
  model.runtime.reason = String(reason || '').slice(0, 180);

  trackRawEvent('runtime_state_changed', {
    enabled,
    requestedBy: model.runtime.changedBy,
    reason: model.runtime.reason,
    trigger,
  });

  scheduleFlush();
  return getRuntimeState();
}

function getOrCreateStrategy(gameType, difficultyLevel) {
  const key = strategyKey(gameType, difficultyLevel);
  if (!isPlainObject(model.strategies)) {
    model.strategies = Object.create(null);
  }
  if (!model.strategies[key]) {
    const safeGameType = normalizeMapKey(gameType, 'unknown');
    const safeDifficultyLevel = normalizeMapKey(difficultyLevel, 'medium');
    model.strategies[key] = {
      gameType: safeGameType,
      difficultyLevel: safeDifficultyLevel,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      explorationRate: 0.18,
      learningRate: 0.05,
      riskBias: 0,
      confidenceBias: 0.65,
      targetWinRate: 0.52,
      selfTuneRuns: 0,
      selfTuneScore: 0.5,
      moveTypeWeights: {
        move: 1.2,
        play: 1.2,
        playCard: 1.2,
        pass: -0.8,
        draw: -0.3,
        bid: 0.5,
        choose: 0.4,
        setTrump: 0.5,
      },
      gamesPlayed: 0,
      aiWins: 0,
      humanWins: 0,
      draws: 0,
      abandons: 0,
      lastSelfTuneAt: null,
    };
  }
  return model.strategies[key];
}

function getOrCreateGameStats(gameType) {
  const key = normalizeMapKey(gameType, 'unknown');
  if (!isPlainObject(model.games)) {
    model.games = Object.create(null);
  }
  if (!model.games[key]) {
    model.games[key] = {
      gameType: key,
      matches: 0,
      aiWins: 0,
      humanWins: 0,
      draws: 0,
      abandons: 0,
      lastUpdated: nowIso(),
    };
  }
  return model.games[key];
}

function getOrCreateUserStats(userId) {
  const key = hashStable(String(userId || 'unknown'));
  if (!isPlainObject(model.users)) {
    model.users = Object.create(null);
  }
  if (!model.users[key]) {
    model.users[key] = {
      userId: key,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      abandons: 0,
      aggressiveMoves: 0,
      defensiveMoves: 0,
      totalMoves: 0,
      engagement: 50,
      lastSeen: nowIso(),
    };
  }
  return model.users[key];
}

function getSessionKey(sessionId) {
  return hashStable(String(sessionId || 'unknown-session'));
}

function trackRawEvent(type, payload) {
  const sanitized = sanitizeDeep(payload);
  model.rawEvents.push({
    at: nowIso(),
    type,
    payload: sanitized,
  });

  if (model.rawEvents.length > MAX_RAW_EVENTS) {
    model.rawEvents = model.rawEvents.slice(-MAX_RAW_EVENTS);
  }
}

function incrementDayCounter(collection, day, key) {
  if (!collection[day]) {
    collection[day] = {
      total: 0,
      byType: Object.create(null),
      matches: 0,
      aiWins: 0,
      humanWins: 0,
      draws: 0,
      abandons: 0,
    };
  }

  collection[day].total += 1;
  const safeType = normalizeMapKey(key, 'event');
  collection[day].byType[safeType] = (collection[day].byType[safeType] || 0) + 1;
}

function updateMoveTypeAnalytics(gameType, moveType, count = 1) {
  const game = normalizeMapKey(gameType, 'unknown');
  const safeMoveType = normalizeMapKey(moveType, 'unknown');
  if (!isPlainObject(model.analytics.moveTypeByGame)) {
    model.analytics.moveTypeByGame = Object.create(null);
  }
  if (!model.analytics.moveTypeByGame[game]) {
    model.analytics.moveTypeByGame[game] = Object.create(null);
  }
  model.analytics.moveTypeByGame[game][safeMoveType] = (model.analytics.moveTypeByGame[game][safeMoveType] || 0) + count;
}

function indexDecision(confidence, thinkMs, consideredMoves = 0) {
  model.analytics.decisionTotals.count += 1;
  model.analytics.decisionTotals.totalConfidence += clamp(toNumber(confidence, 0.5), 0, 1);
  model.analytics.decisionTotals.totalThinkMs += Math.max(0, Math.floor(toNumber(thinkMs, 0)));

  const considered = Math.max(0, Math.floor(toNumber(consideredMoves, 0)));
  if (considered > 0) {
    model.analytics.decisionTotals.totalConsideredMoves += considered;
    model.analytics.decisionTotals.consideredSamples += 1;
  }
}

function computeDecisionAverages() {
  const count = Math.max(1, toNumber(model.analytics.decisionTotals.count, 0));
  const consideredSamples = Math.max(1, toNumber(model.analytics.decisionTotals.consideredSamples, 0));
  return {
    avgConfidence: Number((model.analytics.decisionTotals.totalConfidence / count).toFixed(4)),
    avgThinkMs: Math.round(model.analytics.decisionTotals.totalThinkMs / count),
    avgConsideredMoves: Number((toNumber(model.analytics.decisionTotals.totalConsideredMoves, 0) / consideredSamples).toFixed(2)),
  };
}

function scoreMove(move, strategy, humanAggressionRate = 0) {
  const type = String(move?.type || 'unknown');
  const learned = toNumber(strategy.moveTypeWeights[type], 0);

  let heuristic = 0;
  if (AGGRESSIVE_MOVE_TYPES.has(type)) heuristic += 1.6 + toNumber(strategy.riskBias, 0) * 0.4;
  if (DEFENSIVE_MOVE_TYPES.has(type)) heuristic -= 0.5 - toNumber(strategy.riskBias, 0) * 0.2;

  if (humanAggressionRate > 0.62 && DEFENSIVE_MOVE_TYPES.has(type)) heuristic += 1.8;
  if (humanAggressionRate < 0.35 && AGGRESSIVE_MOVE_TYPES.has(type)) heuristic += 0.7;

  const noiseAmplitude = clamp(toNumber(strategy.explorationRate, 0.18), 0.04, 0.55);
  const noise = randomInt(-4, 4) * (0.06 + noiseAmplitude * 0.3);

  return learned + heuristic + noise;
}

function chooseMove(payload) {
  const validMoves = Array.isArray(payload?.validMoves)
    ? payload.validMoves.filter((m) => m && typeof m === 'object')
    : [];

  if (validMoves.length === 0) return null;

  const gameType = String(payload?.gameType || 'unknown').toLowerCase();
  const difficultyLevel = String(payload?.difficultyLevel || 'medium').toLowerCase();
  const sessionId = String(payload?.sessionId || crypto.randomUUID());
  const humanAggressionRate = clamp(toNumber(payload?.humanAggressionRate, 0), 0, 1);

  const strategy = getOrCreateStrategy(gameType, difficultyLevel);
  const scored = validMoves.map((move) => ({
    move,
    score: scoreMove(move, strategy, humanAggressionRate),
    moveType: String(move?.type || 'unknown'),
  }));

  scored.sort((a, b) => b.score - a.score);

  const epsilon = clamp(toNumber(strategy.explorationRate, 0.18), 0.04, 0.55);
  const topWindow = Math.max(1, Math.ceil(scored.length * clamp(0.14 + epsilon * 0.45, 0.1, 0.75)));

  let selected = scored[0];
  let explorationUsed = false;

  if (Math.random() < epsilon && scored.length > 1) {
    explorationUsed = true;
    selected = scored[randomInt(0, scored.length - 1)];
  } else if (topWindow > 1) {
    selected = scored[randomInt(0, topWindow - 1)];
  }

  const thinkRange = difficultyThinkRange(difficultyLevel);
  const thinkMs = randomInt(thinkRange.min, thinkRange.max);

  const confidenceBase = 0.92 - (scored.indexOf(selected) / Math.max(1, scored.length)) * 0.5;
  const confidenceBias = clamp(toNumber(strategy.confidenceBias, 0.65), 0.2, 0.95);
  const confidence = clamp(confidenceBase * 0.6 + confidenceBias * 0.4, 0.08, 0.99);

  const sessionKey = getSessionKey(sessionId);
  model.sessions[sessionKey] = {
    sessionId: sessionKey,
    gameType,
    difficultyLevel,
    lastMoveType: selected.moveType,
    lastDecisionAt: nowIso(),
    humanAggressionRate,
  };

  strategy.updatedAt = nowIso();
  model.summary.botDecisions += 1;
  indexDecision(confidence, thinkMs, scored.length);
  updateMoveTypeAnalytics(gameType, selected.moveType, 1);
  scheduleFlush();

  return {
    sessionId,
    move: selected.move,
    moveType: selected.moveType,
    thinkMs,
    confidence,
    rationale: {
      strategy: strategyKey(gameType, difficultyLevel),
      topScore: Number(scored[0]?.score?.toFixed(3) || 0),
      selectedScore: Number(selected.score.toFixed(3)),
      explorationUsed,
      humanAggressionRate,
      modelName: AGENT_NAME,
    },
  };
}

function updateEngagement(userStats) {
  const played = Math.max(1, toNumber(userStats.gamesPlayed, 0));
  const wins = toNumber(userStats.wins, 0);
  const abandons = toNumber(userStats.abandons, 0);
  const winRate = wins / played;
  const abandonRate = abandons / played;
  const score = 100 - Math.abs(winRate - 0.5) * 200 - abandonRate * 80;
  userStats.engagement = clamp(Number(score.toFixed(2)), 0, 100);
}

function tuneWeightsForDrift(strategy, drift) {
  const adjust = clamp(Math.abs(drift) * 0.12, 0.01, 0.08);

  for (const type of Object.keys(strategy.moveTypeWeights || {})) {
    const current = toNumber(strategy.moveTypeWeights[type], 0);

    if (drift > 0.2) {
      // Agent is too strong: reduce aggressive bias, raise defensive options.
      if (AGGRESSIVE_MOVE_TYPES.has(type)) {
        strategy.moveTypeWeights[type] = Number((current * (1 - adjust)).toFixed(4));
      } else if (DEFENSIVE_MOVE_TYPES.has(type)) {
        strategy.moveTypeWeights[type] = Number((current * (1 + adjust * 0.7)).toFixed(4));
      }
    } else if (drift < -0.2) {
      // Agent is too weak: reinforce aggressive decision types.
      if (AGGRESSIVE_MOVE_TYPES.has(type)) {
        strategy.moveTypeWeights[type] = Number((current * (1 + adjust * 0.8)).toFixed(4));
      } else if (DEFENSIVE_MOVE_TYPES.has(type)) {
        strategy.moveTypeWeights[type] = Number((current * (1 - adjust * 0.6)).toFixed(4));
      }
    }
  }
}

function selfTuneStrategy(strategy, trigger = 'result-event') {
  const decisiveGames = toNumber(strategy.aiWins, 0) + toNumber(strategy.humanWins, 0);
  if (decisiveGames < 6) return;

  const winRate = decisiveGames > 0 ? toNumber(strategy.aiWins, 0) / decisiveGames : 0.5;
  const target = clamp(toNumber(strategy.targetWinRate, 0.52), 0.45, 0.58);
  const drift = winRate - target;
  const drawRate = toNumber(strategy.draws, 0) / Math.max(1, toNumber(strategy.gamesPlayed, 0));

  strategy.explorationRate = Number(clamp(
    toNumber(strategy.explorationRate, 0.18) + drift * 0.08 + (drawRate > 0.45 ? 0.01 : -0.002),
    0.04,
    0.55,
  ).toFixed(4));

  strategy.learningRate = Number(clamp(
    toNumber(strategy.learningRate, 0.05) + (Math.abs(drift) > 0.14 ? 0.01 : -0.003),
    0.01,
    0.2,
  ).toFixed(4));

  strategy.riskBias = Number(clamp(
    toNumber(strategy.riskBias, 0) + (drift < -0.2 ? 0.03 : drift > 0.2 ? -0.03 : 0),
    -0.9,
    0.9,
  ).toFixed(4));

  tuneWeightsForDrift(strategy, drift);

  const stabilityScore = 1 - Math.abs(drift);
  const drawPenalty = drawRate * 0.15;
  strategy.selfTuneScore = Number(clamp(stabilityScore - drawPenalty, 0, 1).toFixed(4));
  strategy.selfTuneRuns = toNumber(strategy.selfTuneRuns, 0) + 1;
  strategy.lastSelfTuneAt = nowIso();
  strategy.updatedAt = nowIso();

  model.summary.selfTuneRuns += 1;
  model.summary.lastSelfTuneAt = nowIso();

  trackRawEvent('self_tune', {
    trigger,
    strategy: strategyKey(strategy.gameType, strategy.difficultyLevel),
    drift,
    explorationRate: strategy.explorationRate,
    learningRate: strategy.learningRate,
    riskBias: strategy.riskBias,
    selfTuneScore: strategy.selfTuneScore,
  });
}

function runGlobalSelfTune(trigger = 'periodic') {
  let tuned = 0;

  for (const strategy of Object.values(model.strategies || {})) {
    if (toNumber(strategy.gamesPlayed, 0) < 8) continue;
    selfTuneStrategy(strategy, trigger);
    tuned += 1;
  }

  if (tuned > 0) {
    scheduleFlush();
  }

  return tuned;
}

function registerResultAnalytics(day, aiWon, draw) {
  if (!model.analytics.resultsByDay[day]) {
    model.analytics.resultsByDay[day] = {
      matches: 0,
      aiWins: 0,
      humanWins: 0,
      draws: 0,
      abandons: 0,
    };
  }

  model.analytics.resultsByDay[day].matches += 1;
  if (draw) model.analytics.resultsByDay[day].draws += 1;
  else if (aiWon) model.analytics.resultsByDay[day].aiWins += 1;
  else model.analytics.resultsByDay[day].humanWins += 1;
}

function registerAbandonAnalytics(day) {
  if (!model.analytics.resultsByDay[day]) {
    model.analytics.resultsByDay[day] = {
      matches: 0,
      aiWins: 0,
      humanWins: 0,
      draws: 0,
      abandons: 0,
    };
  }
  model.analytics.resultsByDay[day].abandons += 1;
}

function applyLearningEvent(body) {
  const type = String(body?.type || '').trim();
  const payload = isPlainObject(body?.payload) ? sanitizeDeep(body.payload) : {};
  if (!type) return { accepted: false, reason: 'missing event type' };

  const day = nowIso().slice(0, 10);
  model.summary.totalEvents += 1;
  const safeEventType = normalizeMapKey(type, 'event');
  model.summary.eventCounts[safeEventType] = (model.summary.eventCounts[safeEventType] || 0) + 1;
  incrementDayCounter(model.analytics.eventsByDay, day, type);

  trackRawEvent(type, payload);

  if (type === 'human_move') {
    const userId = String(payload.userId || 'unknown');
    const moveType = normalizeMapKey(payload.moveType, 'unknown');
    const gameType = String(payload.gameType || 'unknown').toLowerCase();
    const userStats = getOrCreateUserStats(userId);

    userStats.totalMoves += 1;
    if (AGGRESSIVE_MOVE_TYPES.has(moveType)) userStats.aggressiveMoves += 1;
    if (DEFENSIVE_MOVE_TYPES.has(moveType)) userStats.defensiveMoves += 1;
    userStats.lastSeen = nowIso();

    updateMoveTypeAnalytics(gameType, moveType, 1);
  } else if (type === 'ai_move') {
    const gameType = String(payload.gameType || 'unknown').toLowerCase();
    const difficultyLevel = String(payload.difficultyLevel || 'medium').toLowerCase();
    const moveType = normalizeMapKey(payload.moveType, 'unknown');
    const confidence = clamp(toNumber(payload.confidence, 0.5), 0, 1);
    const consideredMoves = Math.max(0, Math.floor(toNumber(payload.consideredMoves, 0)));

    const strategy = getOrCreateStrategy(gameType, difficultyLevel);
    const lr = clamp(toNumber(strategy.learningRate, 0.05), 0.01, 0.2);
    const prev = toNumber(strategy.moveTypeWeights[moveType], 0);
    strategy.moveTypeWeights[moveType] = Number((prev * (1 - lr) + confidence * lr).toFixed(4));
    strategy.updatedAt = nowIso();

    indexDecision(confidence, toNumber(payload.thinkMs, 0), consideredMoves);
    updateMoveTypeAnalytics(gameType, moveType, 1);
  } else if (type === 'game_result') {
    const gameType = String(payload.gameType || 'unknown').toLowerCase();
    const difficultyLevel = String(payload.difficultyLevel || 'medium').toLowerCase();
    const sessionId = String(payload.sessionId || '');
    const aiWon = Boolean(payload.aiWon);
    const draw = Boolean(payload.draw);
    const humanPlayerIds = Array.isArray(payload.humanPlayerIds) ? payload.humanPlayerIds.map(String) : [];

    const gameStats = getOrCreateGameStats(gameType);
    const strategy = getOrCreateStrategy(gameType, difficultyLevel);

    gameStats.matches += 1;
    strategy.gamesPlayed += 1;

    if (draw) {
      gameStats.draws += 1;
      strategy.draws += 1;
    } else if (aiWon) {
      gameStats.aiWins += 1;
      strategy.aiWins += 1;
    } else {
      gameStats.humanWins += 1;
      strategy.humanWins += 1;
    }

    const sessionInfo = sessionId ? model.sessions[getSessionKey(sessionId)] : null;
    const learnedMoveType = normalizeMapKey(sessionInfo?.lastMoveType, 'unknown');
    const reward = draw ? 0.01 : aiWon ? 0.07 : -0.07;
    strategy.moveTypeWeights[learnedMoveType] = Number((toNumber(strategy.moveTypeWeights[learnedMoveType], 0) + reward).toFixed(4));

    selfTuneStrategy(strategy, 'game_result');

    gameStats.lastUpdated = nowIso();
    strategy.updatedAt = nowIso();

    for (const userId of humanPlayerIds) {
      const userStats = getOrCreateUserStats(userId);
      userStats.gamesPlayed += 1;
      if (draw) userStats.draws += 1;
      else if (aiWon) userStats.losses += 1;
      else userStats.wins += 1;
      userStats.lastSeen = nowIso();
      updateEngagement(userStats);
    }

    registerResultAnalytics(day, aiWon, draw);
  } else if (type === 'game_abandoned') {
    const gameType = String(payload.gameType || 'unknown').toLowerCase();
    const humanPlayerIds = Array.isArray(payload.humanPlayerIds) ? payload.humanPlayerIds.map(String) : [];
    const gameStats = getOrCreateGameStats(gameType);

    gameStats.abandons += 1;
    gameStats.lastUpdated = nowIso();

    for (const userId of humanPlayerIds) {
      const userStats = getOrCreateUserStats(userId);
      userStats.gamesPlayed += 1;
      userStats.abandons += 1;
      userStats.lastSeen = nowIso();
      updateEngagement(userStats);
    }

    registerAbandonAnalytics(day);
  } else if (type === 'project_snapshot') {
    const snapshot = {
      at: nowIso(),
      ...payload,
    };
    model.projectSnapshots.push(snapshot);
    if (model.projectSnapshots.length > MAX_PROJECT_SNAPSHOTS) {
      model.projectSnapshots = model.projectSnapshots.slice(-MAX_PROJECT_SNAPSHOTS);
    }
  }

  if (model.summary.totalEvents % 25 === 0) {
    runGlobalSelfTune('event_batch');
  }

  scheduleFlush();
  return { accepted: true };
}

function summarizeModel() {
  const strategyList = Object.values(model.strategies || {});
  const totalGames = strategyList.reduce((sum, item) => sum + toNumber(item.gamesPlayed, 0), 0);
  const totalAiWins = strategyList.reduce((sum, item) => sum + toNumber(item.aiWins, 0), 0);
  const totalHumanWins = strategyList.reduce((sum, item) => sum + toNumber(item.humanWins, 0), 0);
  const totalDraws = strategyList.reduce((sum, item) => sum + toNumber(item.draws, 0), 0);

  const decisiveGames = totalAiWins + totalHumanWins;
  const aiWinRate = decisiveGames > 0 ? (totalAiWins / decisiveGames) * 100 : 0;
  const decisions = computeDecisionAverages();

  const topStrategies = strategyList
    .map((item) => ({
      key: strategyKey(item.gameType, item.difficultyLevel),
      gamesPlayed: toNumber(item.gamesPlayed, 0),
      selfTuneScore: toNumber(item.selfTuneScore, 0),
      explorationRate: toNumber(item.explorationRate, 0),
      learningRate: toNumber(item.learningRate, 0),
    }))
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, 6);

  return {
    modelVersion: model.version,
    agentName: AGENT_NAME,
    updatedAt: model.updatedAt,
    privacyMode: 'strict',
    learning: {
      totalEvents: model.summary.totalEvents,
      botDecisions: model.summary.botDecisions,
      adminChats: model.summary.adminChats,
      selfTuneRuns: model.summary.selfTuneRuns,
      lastSelfTuneAt: model.summary.lastSelfTuneAt,
      activeStrategies: strategyList.length,
      trackedUsers: Object.keys(model.users || {}).length,
      trackedGames: Object.keys(model.games || {}).length,
    },
    performance: {
      totalGames,
      aiWinRate: Number(aiWinRate.toFixed(2)),
      aiWins: totalAiWins,
      humanWins: totalHumanWins,
      draws: totalDraws,
      avgDecisionConfidence: decisions.avgConfidence,
      avgThinkMs: decisions.avgThinkMs,
      avgConsideredMoves: decisions.avgConsideredMoves,
    },
    eventCounts: model.summary.eventCounts,
    recentProjectSnapshots: (model.projectSnapshots || []).slice(-5),
    topStrategies,
  };
}

function getCapabilities() {
  const runtime = getRuntimeState();
  return {
    agentName: AGENT_NAME,
    mode: 'production',
    privacyMode: 'strict',
    runtimeControl: {
      enabled: true,
      currentState: runtime.enabled ? 'running' : 'stopped',
      endpoints: {
        status: '/v1/admin/runtime',
        control: '/v1/admin/runtime',
      },
    },
    autonomousLearning: {
      enabled: runtime.enabled,
      methods: [
        'adaptive move weighting',
        'confidence-weighted online updates',
        'drift-based self tuning',
        'batch periodic global tuning',
      ],
    },
    dataAnalyst: {
      enabled: true,
      supports: {
        groupBy: ['day', 'game', 'difficulty'],
        metrics: ['results', 'events', 'decisions', 'engagement'],
        formats: ['json'],
      },
      notes: 'All analytics are privacy-safe and use pseudonymized identifiers.',
    },
  };
}

function isDateInRange(day, from, to) {
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function aggregateByDifficulty() {
  const stats = {};

  for (const strategy of Object.values(model.strategies || {})) {
    const difficulty = String(strategy.difficultyLevel || 'unknown');
    if (!stats[difficulty]) {
      stats[difficulty] = {
        difficulty,
        strategies: 0,
        gamesPlayed: 0,
        aiWins: 0,
        humanWins: 0,
        draws: 0,
        avgExplorationRate: 0,
        avgLearningRate: 0,
      };
    }

    const item = stats[difficulty];
    item.strategies += 1;
    item.gamesPlayed += toNumber(strategy.gamesPlayed, 0);
    item.aiWins += toNumber(strategy.aiWins, 0);
    item.humanWins += toNumber(strategy.humanWins, 0);
    item.draws += toNumber(strategy.draws, 0);
    item.avgExplorationRate += toNumber(strategy.explorationRate, 0);
    item.avgLearningRate += toNumber(strategy.learningRate, 0);
  }

  for (const row of Object.values(stats)) {
    row.avgExplorationRate = Number((row.avgExplorationRate / Math.max(1, row.strategies)).toFixed(4));
    row.avgLearningRate = Number((row.avgLearningRate / Math.max(1, row.strategies)).toFixed(4));
    const decisive = row.aiWins + row.humanWins;
    row.aiWinRate = Number((decisive > 0 ? (row.aiWins / decisive) * 100 : 0).toFixed(2));
  }

  return Object.values(stats).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

function queryAnalytics(payload = {}) {
  const groupBy = String(payload.groupBy || 'game').toLowerCase();
  const metric = String(payload.metric || 'results').toLowerCase();
  const gameTypeFilter = payload.gameType ? String(payload.gameType).toLowerCase() : null;
  const difficultyFilter = payload.difficultyLevel ? String(payload.difficultyLevel).toLowerCase() : null;
  const from = payload.from ? String(payload.from).slice(0, 10) : null;
  const to = payload.to ? String(payload.to).slice(0, 10) : null;

  if (groupBy === 'day') {
    const dayKeys = Array.from(new Set([
      ...Object.keys(model.analytics.eventsByDay || {}),
      ...Object.keys(model.analytics.resultsByDay || {}),
    ])).sort();

    const rows = dayKeys
      .filter((day) => isDateInRange(day, from, to))
      .map((day) => {
        const events = model.analytics.eventsByDay[day] || { total: 0, byType: {} };
        const results = model.analytics.resultsByDay[day] || { matches: 0, aiWins: 0, humanWins: 0, draws: 0, abandons: 0 };
        const decisive = results.aiWins + results.humanWins;
        return {
          day,
          events: events.total || 0,
          matches: results.matches || 0,
          aiWins: results.aiWins || 0,
          humanWins: results.humanWins || 0,
          draws: results.draws || 0,
          abandons: results.abandons || 0,
          aiWinRate: Number((decisive > 0 ? (results.aiWins / decisive) * 100 : 0).toFixed(2)),
        };
      });

    return {
      groupBy,
      metric,
      rows,
      columns: ['day', 'events', 'matches', 'aiWins', 'humanWins', 'draws', 'abandons', 'aiWinRate'],
    };
  }

  if (groupBy === 'difficulty') {
    const rows = aggregateByDifficulty()
      .filter((row) => (!difficultyFilter || row.difficulty === difficultyFilter));

    return {
      groupBy,
      metric,
      rows,
      columns: ['difficulty', 'strategies', 'gamesPlayed', 'aiWins', 'humanWins', 'draws', 'aiWinRate', 'avgExplorationRate', 'avgLearningRate'],
    };
  }

  const rows = Object.values(model.games || {})
    .filter((row) => !gameTypeFilter || row.gameType === gameTypeFilter)
    .map((row) => {
      const decisive = toNumber(row.aiWins, 0) + toNumber(row.humanWins, 0);
      const matches = Math.max(1, toNumber(row.matches, 0));
      return {
        gameType: row.gameType,
        matches: toNumber(row.matches, 0),
        aiWins: toNumber(row.aiWins, 0),
        humanWins: toNumber(row.humanWins, 0),
        draws: toNumber(row.draws, 0),
        abandons: toNumber(row.abandons, 0),
        aiWinRate: Number((decisive > 0 ? (toNumber(row.aiWins, 0) / decisive) * 100 : 0).toFixed(2)),
        abandonRate: Number(((toNumber(row.abandons, 0) / matches) * 100).toFixed(2)),
        lastUpdated: row.lastUpdated || null,
      };
    })
    .sort((a, b) => b.matches - a.matches);

  return {
    groupBy: 'game',
    metric,
    rows,
    columns: ['gameType', 'matches', 'aiWins', 'humanWins', 'draws', 'abandons', 'aiWinRate', 'abandonRate', 'lastUpdated'],
  };
}

function buildFastInsights() {
  const summary = summarizeModel();
  const topGames = Object.values(model.games || {})
    .sort((a, b) => toNumber(b.matches, 0) - toNumber(a.matches, 0))
    .slice(0, 3)
    .map((g) => `${g.gameType}(${g.matches})`)
    .join(', ');

  const aiWinRate = toNumber(summary.performance.aiWinRate, 0);
  const riskLevel = aiWinRate > 75 ? 'high' : aiWinRate < 35 ? 'low' : 'balanced';

  return {
    riskLevel,
    topGames,
    recommendation:
      riskLevel === 'high'
        ? 'Reduce dominance by increasing exploration or lowering risk bias in overperforming strategies.'
        : riskLevel === 'low'
          ? 'Improve agent competitiveness by reducing exploration and reinforcing high-value move types.'
          : 'Maintain current balance and continue periodic self-tuning.',
  };
}

function buildChatReply(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const summary = summarizeModel();
  const insights = buildFastInsights();

  if (!text) {
    return {
      reply: `${AGENT_NAME} is online. Ask for performance report, trends, or strategy diagnostics.`,
      summary,
      insights,
    };
  }

  if (lower.includes('capabilities') || lower.includes('قدرات')) {
    const caps = getCapabilities();
    return {
      reply: `${AGENT_NAME} capabilities: autonomous self-tuning, privacy-safe event learning, analytics query engine (day/game/difficulty), and production-ready monitoring summaries.`,
      summary,
      insights,
      capabilities: caps,
    };
  }

  if (lower.includes('trend') || lower.includes('تحليل') || lower.includes('analysis') || lower.includes('data')) {
    const gameQuery = queryAnalytics({ groupBy: 'game', metric: 'results' });
    return {
      reply: `${AGENT_NAME} trend analysis ready. Top active games: ${insights.topGames || 'n/a'}. Current risk profile is ${insights.riskLevel}.`,
      summary,
      insights,
      data: {
        columns: gameQuery.columns,
        rows: gameQuery.rows.slice(0, 8),
      },
    };
  }

  if (lower.includes('report') || lower.includes('تقرير') || lower.includes('ملخص')) {
    return {
      reply:
        `${AGENT_NAME} report: ${summary.learning.totalEvents} learned events, ` +
        `${summary.performance.totalGames} tracked games, ` +
        `AI win rate ${summary.performance.aiWinRate}%, active strategies ${summary.learning.activeStrategies}.`,
      summary,
      insights,
    };
  }

  if (lower.includes('risk') || lower.includes('مخاطر') || lower.includes('anomaly') || lower.includes('شذوذ')) {
    return {
      reply: `${AGENT_NAME} risk profile is ${insights.riskLevel}. Recommendation: ${insights.recommendation}`,
      summary,
      insights,
    };
  }

  return {
    reply: `${AGENT_NAME} received your request. Supported intents: report, capabilities, trend analysis, risk diagnostics, and structured analytics queries.`,
    summary,
    insights,
  };
}

function authorize(req, res, next) {
  if (!SHARED_TOKEN) {
    next();
    return;
  }

  const token = req.headers['x-ai-agent-token'];
  if (token !== SHARED_TOKEN) {
    res.status(401).json({ error: 'Unauthorized AI agent request' });
    return;
  }

  next();
}

export async function startSam9Service() {
  await loadModel();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    const runtime = getRuntimeState();
    res.json({
      status: runtime.enabled ? 'ok' : 'stopped',
      service: AGENT_NAME,
      privacyMode: 'strict',
      runtime,
      updatedAt: model.updatedAt,
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  app.post('/v1/bot/choose-move', authorize, (req, res) => {
    try {
      if (!isRuntimeEnabled()) {
        return res.status(503).json({
          error: `${AGENT_NAME} runtime is stopped`,
          code: 'AGENT_STOPPED',
          runtime: getRuntimeState(),
        });
      }

      const decision = chooseMove(req.body || {});
      if (!decision) {
        return res.status(200).json({ decision: null, agentName: AGENT_NAME });
      }
      res.json({ decision, agentName: AGENT_NAME });
    } catch (error) {
      console.error(`[${AGENT_NAME}] choose-move failed:`, error);
      res.status(500).json({ error: 'Failed to choose move', agentName: AGENT_NAME });
    }
  });

  app.post('/v1/learning/event', authorize, (req, res) => {
    try {
      if (!isRuntimeEnabled()) {
        return res.status(503).json({
          error: `${AGENT_NAME} runtime is stopped`,
          code: 'AGENT_STOPPED',
          runtime: getRuntimeState(),
        });
      }

      const result = applyLearningEvent(req.body || {});
      if (!result.accepted) {
        return res.status(400).json(result);
      }
      res.json({ success: true, agentName: AGENT_NAME, privacyMode: 'strict' });
    } catch (error) {
      console.error(`[${AGENT_NAME}] learning event failed:`, error);
      res.status(500).json({ error: 'Failed to process learning event' });
    }
  });

  app.get('/v1/admin/report', authorize, (_req, res) => {
    res.json({
      generatedAt: nowIso(),
      agentName: AGENT_NAME,
      report: summarizeModel(),
      insights: buildFastInsights(),
    });
  });

  app.get('/v1/admin/capabilities', authorize, (_req, res) => {
    res.json({
      generatedAt: nowIso(),
      capabilities: getCapabilities(),
    });
  });

  app.get('/v1/admin/runtime', authorize, (_req, res) => {
    res.json({
      generatedAt: nowIso(),
      agentName: AGENT_NAME,
      runtime: getRuntimeState(),
    });
  });

  app.post('/v1/admin/runtime', authorize, (req, res) => {
    const body = isPlainObject(req.body) ? sanitizeDeep(req.body) : {};
    let enabled;

    if (typeof body.enabled === 'boolean') {
      enabled = body.enabled;
    } else {
      const action = String(body.action || '').toLowerCase();
      if (action === 'start') enabled = true;
      else if (action === 'stop') enabled = false;
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid runtime action. Provide enabled:boolean or action:start|stop',
      });
    }

    const requestedBy = typeof body.requestedBy === 'string'
      ? redactString(body.requestedBy)
      : 'admin';
    const reason = typeof body.reason === 'string' ? redactString(body.reason) : '';

    const runtime = setRuntimeEnabled(enabled, requestedBy, reason, 'admin_runtime_endpoint');

    res.json({
      success: true,
      generatedAt: nowIso(),
      agentName: AGENT_NAME,
      runtime,
    });
  });

  app.get('/v1/admin/data/summary', authorize, (_req, res) => {
    res.json({
      generatedAt: nowIso(),
      agentName: AGENT_NAME,
      summary: summarizeModel(),
      insights: buildFastInsights(),
      decisionAverages: computeDecisionAverages(),
    });
  });

  app.post('/v1/admin/data/query', authorize, (req, res) => {
    try {
      const query = isPlainObject(req.body) ? sanitizeDeep(req.body) : {};
      const result = queryAnalytics(query);
      res.json({
        generatedAt: nowIso(),
        agentName: AGENT_NAME,
        query: {
          groupBy: result.groupBy,
          metric: result.metric,
        },
        data: result,
      });
    } catch (error) {
      console.error(`[${AGENT_NAME}] data query failed:`, error);
      res.status(500).json({ error: 'Failed to execute data query' });
    }
  });

  app.post('/v1/admin/learn/self-tune', authorize, (req, res) => {
    try {
      const trigger = String(req.body?.trigger || 'manual-admin').slice(0, 64);
      const tuned = runGlobalSelfTune(trigger);
      scheduleFlush();
      res.json({
        success: true,
        tunedStrategies: tuned,
        trigger,
        generatedAt: nowIso(),
        agentName: AGENT_NAME,
      });
    } catch (error) {
      console.error(`[${AGENT_NAME}] manual self-tune failed:`, error);
      res.status(500).json({ error: 'Failed to run self-tune cycle' });
    }
  });

  app.post('/v1/admin/chat', authorize, (req, res) => {
    try {
      model.summary.adminChats += 1;
      const message = redactString(String(req.body?.message || ''));
      const answer = buildChatReply(message);
      trackRawEvent('admin_chat', {
        messageLength: message.length,
        hasDigits: /\d/.test(message),
        hasArabic: /[\u0600-\u06FF]/.test(message),
      });
      scheduleFlush();
      res.json({
        generatedAt: nowIso(),
        agentName: AGENT_NAME,
        ...answer,
      });
    } catch (error) {
      console.error(`[${AGENT_NAME}] admin chat failed:`, error);
      res.status(500).json({ error: 'Failed to process admin chat message' });
    }
  });

  setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [sessionId, session] of Object.entries(model.sessions || {})) {
      const t = Date.parse(String(session?.lastDecisionAt || ''));
      if (Number.isFinite(t) && t < cutoff) {
        delete model.sessions[sessionId];
      }
    }
  }, 5 * 60 * 1000);

  // Periodic autonomous tuning cycle.
  setInterval(() => {
    runGlobalSelfTune('periodic-interval');
  }, 10 * 60 * 1000);

  process.on('SIGTERM', async () => {
    await flushModel();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await flushModel();
    process.exit(0);
  });

  app.listen(PORT, () => {
    console.log(`[${AGENT_NAME}] running on :${PORT} (privacy=strict, mode=production)`);
  });
}
