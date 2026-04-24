/**
 * VoIP push notifications.
 *
 * Native call UI surfaces (CallKit on iOS, ConnectionService on Android)
 * can only ring the phone from the killed/background state when the OS is
 * woken by a special push:
 *   - iOS: Apple PushKit / VoIP push, delivered via APNs HTTP/2 with the
 *     bundle's `.voip` topic. Bypasses Notification Center entirely and
 *     wakes the app's PushKit delegate, which must immediately call
 *     `CallKitProvider.shared.reportIncomingCall(...)` (Apple kills the
 *     app within ~5 seconds otherwise).
 *   - Android: high-priority FCM data message (no `notification` block)
 *     so the FirebaseMessagingService runs while the app is backgrounded
 *     / killed. The service starts a foreground service that calls
 *     `presentIncomingCall(...)` on the native plugin within the same
 *     ~5-second window enforced by Android Telecom.
 *
 * This module is the SERVER end of that flow. Both transports are
 * optional: when the relevant credentials are not configured we log once
 * and return `{ sent: 0 }` instead of throwing, so VoIP push deployment
 * can be staged independently of the rest of the call experience.
 */

import { createHash, createSign } from "node:crypto";
import { logger } from "./logger";
import {
  deactivateDevicePushToken,
  getActiveDevicePushTokens,
  touchDevicePushToken,
} from "../storage/notifications";

export interface CallVoipPushPayload {
  /** UUID of the chat call session — round-trips back via plugin events. */
  sessionId: string;
  callerId: string;
  callerUsername: string;
  receiverId: string;
  callType: "voice" | "video";
  /** Per-minute price in display units (USD or VXC), informational only. */
  ratePerMinute: number;
  /** Conversation key used by the JS layer to route the answer/decline. */
  conversationId?: string;
}

export interface SendCallVoipPushResult {
  /** How many devices we actually published a wake-push to. */
  sent: number;
  /** How many devices we removed because the gateway said the token is dead. */
  deactivated: number;
  /** Per-platform breakdown for the smoke + admin diagnostics. */
  perPlatform: { ios: number; android: number };
  /** Whether the iOS APNs gateway is configured (for diagnostics). */
  iosConfigured: boolean;
  /** Whether the Android FCM gateway is configured (for diagnostics). */
  androidConfigured: boolean;
}

interface ApnsConfig {
  /** Path to the Apple `.p8` ES256 key (populated by ops, kept off the repo). */
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
  /** `https://api.push.apple.com` (prod) or `https://api.sandbox.push.apple.com`. */
  host: string;
}

interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKeyPem: string;
}

let warnedMissingApns = false;
let warnedMissingFcm = false;

function getApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || process.env.IOS_BUNDLE_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !bundleId || !privateKey) {
    return null;
  }
  const host = process.env.APNS_HOST?.trim()
    || (process.env.APNS_USE_SANDBOX === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
  // Allow newline-encoded keys from env (`\n` literals).
  const privateKeyPem = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  return { keyId, teamId, bundleId, privateKeyPem, host };
}

function getFcmConfig(): FcmConfig | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY?.trim() || process.env.FCM_PRIVATE_KEY?.trim()) ?? "";
  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }
  const privateKeyPem = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  return { projectId, clientEmail, privateKeyPem };
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Build an ES256 JWT for APNs token-based auth. Apple's spec
 * (https://developer.apple.com/documentation/usernotifications) requires:
 *   header.alg = ES256, header.kid = APNS_KEY_ID
 *   payload.iss = APNS_TEAM_ID, payload.iat = unix-seconds
 * APNs caches the JWT for ~1 hour, so we cache ours for slightly less.
 */
let apnsTokenCache: { token: string; issuedAt: number; keyId: string; teamId: string } | null = null;
const APNS_TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min < Apple's 60 min cap

export function buildApnsJwt(config: ApnsConfig, nowMs: number = Date.now()): string {
  if (
    apnsTokenCache
    && apnsTokenCache.keyId === config.keyId
    && apnsTokenCache.teamId === config.teamId
    && nowMs - apnsTokenCache.issuedAt < APNS_TOKEN_TTL_MS
  ) {
    return apnsTokenCache.token;
  }
  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({ iss: config.teamId, iat: Math.floor(nowMs / 1000) }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // P-256 ECDSA — `dsaEncoding: "ieee-p1363"` produces the raw r||s
  // 64-byte signature that JWT/JOSE expects (rather than DER).
  const signature = signer.sign({ key: config.privateKeyPem, dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${base64UrlEncode(signature)}`;
  apnsTokenCache = { token, issuedAt: nowMs, keyId: config.keyId, teamId: config.teamId };
  return token;
}

/**
 * For tests — wipe cached APNs JWT so a config change is picked up.
 */
export function _resetApnsTokenCacheForTests(): void {
  apnsTokenCache = null;
}

/** Build the APNs payload for an incoming-call VoIP wake. */
export function buildApnsCallPayload(payload: CallVoipPushPayload): Record<string, unknown> {
  return {
    aps: {
      // VoIP pushes intentionally have no `alert`/`sound`: the only job
      // is to wake PushKit so the app can hand the call to CallKit.
      "content-available": 1,
    },
    sessionId: payload.sessionId,
    callerId: payload.callerId,
    callerUsername: payload.callerUsername,
    receiverId: payload.receiverId,
    callType: payload.callType,
    ratePerMinute: payload.ratePerMinute,
    conversationId: payload.conversationId ?? null,
    type: "call",
  };
}

/** Build the FCM HTTP v1 message body for an incoming-call wake. */
export function buildFcmCallMessage(token: string, payload: CallVoipPushPayload): Record<string, unknown> {
  return {
    message: {
      token,
      // Critical: data-only message (no `notification` block) so the
      // FirebaseMessagingService runs even when the app is killed.
      data: {
        type: "call",
        sessionId: payload.sessionId,
        callerId: payload.callerId,
        callerUsername: payload.callerUsername,
        receiverId: payload.receiverId,
        callType: payload.callType,
        ratePerMinute: String(payload.ratePerMinute),
        conversationId: payload.conversationId ?? "",
      },
      android: {
        priority: "HIGH" as const,
        ttl: "60s",
      },
    },
  };
}

interface ApnsSendOutcome {
  status: number;
  reason?: string;
}

/**
 * Send a single VoIP push to APNs over HTTP/2. Returns the gateway
 * status code so the caller can deactivate dead tokens (status 410 with
 * reason `BadDeviceToken` / `Unregistered`).
 */
async function sendApnsPush(
  config: ApnsConfig,
  deviceToken: string,
  payload: Record<string, unknown>,
): Promise<ApnsSendOutcome> {
  // Dynamic import so callers (and the smoke) can stub `node:http2`.
  const { connect } = await import("node:http2");
  return await new Promise<ApnsSendOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: ApnsSendOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const client = connect(config.host);
    client.on("error", (err: Error) => {
      logger.warn("[voip-push] APNs HTTP/2 connection error", { error: err.message });
      settle({ status: 0, reason: err.message });
      try { client.close(); } catch { /* ignore */ }
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${buildApnsJwt(config)}`,
      "apns-topic": `${config.bundleId}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
    req.on("end", () => {
      let reason: string | undefined;
      if (status >= 400 && body) {
        try { reason = JSON.parse(body)?.reason; } catch { /* ignore */ }
      }
      try { client.close(); } catch { /* ignore */ }
      settle({ status, reason });
    });
    req.on("error", (err: Error) => {
      logger.warn("[voip-push] APNs request error", { error: err.message });
      try { client.close(); } catch { /* ignore */ }
      settle({ status: 0, reason: err.message });
    });
    req.setTimeout(10_000, () => {
      logger.warn("[voip-push] APNs request timed out");
      try { req.close(); } catch { /* ignore */ }
      try { client.close(); } catch { /* ignore */ }
      settle({ status: 0, reason: "timeout" });
    });
    req.end(JSON.stringify(payload));
  });
}

/**
 * FCM HTTP v1 access-token cache. The Google OAuth2 endpoint returns a
 * 1-hour token; we cache for 50 minutes to be safe.
 */
let fcmAccessTokenCache: { token: string; issuedAt: number; clientEmail: string } | null = null;
const FCM_TOKEN_TTL_MS = 50 * 60 * 1000;

async function getFcmAccessToken(config: FcmConfig): Promise<string | null> {
  const now = Date.now();
  if (
    fcmAccessTokenCache
    && fcmAccessTokenCache.clientEmail === config.clientEmail
    && now - fcmAccessTokenCache.issuedAt < FCM_TOKEN_TTL_MS
  ) {
    return fcmAccessTokenCache.token;
  }
  // RS256 service-account JWT exchanged for an OAuth2 access token.
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  let signature: Buffer;
  try {
    signature = signer.sign(config.privateKeyPem);
  } catch (err) {
    logger.warn("[voip-push] FCM JWT signing failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
  } catch (err) {
    logger.warn("[voip-push] FCM OAuth fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
  if (!response.ok) {
    logger.warn("[voip-push] FCM OAuth refused", { status: response.status });
    return null;
  }
  const json = (await response.json().catch(() => null)) as { access_token?: string } | null;
  const token = json?.access_token;
  if (!token) return null;
  fcmAccessTokenCache = { token, issuedAt: now, clientEmail: config.clientEmail };
  return token;
}

export function _resetFcmAccessTokenCacheForTests(): void {
  fcmAccessTokenCache = null;
}

interface FcmSendOutcome {
  status: number;
  errorCode?: string;
}

async function sendFcmPush(
  config: FcmConfig,
  message: Record<string, unknown>,
): Promise<FcmSendOutcome> {
  const accessToken = await getFcmAccessToken(config);
  if (!accessToken) return { status: 0, errorCode: "no_access_token" };
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    logger.warn("[voip-push] FCM send fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return { status: 0, errorCode: "fetch_failed" };
  }
  if (response.ok) return { status: response.status };
  let errorCode: string | undefined;
  try {
    const body = (await response.json()) as { error?: { details?: Array<{ errorCode?: string }> } };
    errorCode = body?.error?.details?.[0]?.errorCode;
  } catch { /* ignore */ }
  return { status: response.status, errorCode };
}

/**
 * Public entry point: publish an incoming-call VoIP wake to every active
 * native device the receiver has registered. Safe to call alongside the
 * existing in-app WebSocket invite + alert push — the OS dedupes by
 * `sessionId` (passed through to the plugin's `reportIncomingCall`).
 */
export async function sendCallVoipPush(payload: CallVoipPushPayload): Promise<SendCallVoipPushResult> {
  const result: SendCallVoipPushResult = {
    sent: 0,
    deactivated: 0,
    perPlatform: { ios: 0, android: 0 },
    iosConfigured: false,
    androidConfigured: false,
  };

  const apnsConfig = getApnsConfig();
  const fcmConfig = getFcmConfig();
  result.iosConfigured = !!apnsConfig;
  result.androidConfigured = !!fcmConfig;

  if (!apnsConfig && !warnedMissingApns) {
    warnedMissingApns = true;
    logger.info(
      "[voip-push] APNs not configured — iOS lock-screen ringing disabled until APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID/APNS_PRIVATE_KEY are set.",
    );
  }
  if (!fcmConfig && !warnedMissingFcm) {
    warnedMissingFcm = true;
    logger.info(
      "[voip-push] FCM not configured — Android background-call wake disabled until FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY are set.",
    );
  }

  if (!apnsConfig && !fcmConfig) return result;

  const tokens = await getActiveDevicePushTokens(payload.receiverId).catch((err: unknown) => {
    logger.warn("[voip-push] failed to load device tokens", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [] as Awaited<ReturnType<typeof getActiveDevicePushTokens>>;
  });

  if (tokens.length === 0) return result;

  const apnsPayload = buildApnsCallPayload(payload);

  await Promise.all(tokens.map(async (row) => {
    if (row.platform === "ios" && row.kind === "voip" && apnsConfig) {
      const outcome = await sendApnsPush(apnsConfig, row.token, apnsPayload);
      if (outcome.status === 200) {
        result.sent += 1;
        result.perPlatform.ios += 1;
        await touchDevicePushToken(row.token, row.kind).catch(() => { /* best-effort */ });
        return;
      }
      // Apple returns 410 Unregistered when the token has been
      // permanently invalidated (app uninstalled, user reset). 400
      // BadDeviceToken means the token is malformed for this gateway
      // (sandbox vs prod mismatch). Both should deactivate the token.
      if (outcome.status === 410 || outcome.reason === "BadDeviceToken" || outcome.reason === "Unregistered") {
        await deactivateDevicePushToken(row.token, row.kind).catch(() => { /* ignore */ });
        result.deactivated += 1;
      }
      return;
    }
    if (row.platform === "android" && row.kind === "fcm" && fcmConfig) {
      const message = buildFcmCallMessage(row.token, payload);
      const outcome = await sendFcmPush(fcmConfig, message);
      if (outcome.status >= 200 && outcome.status < 300) {
        result.sent += 1;
        result.perPlatform.android += 1;
        await touchDevicePushToken(row.token, row.kind).catch(() => { /* best-effort */ });
        return;
      }
      // Per FCM HTTP v1 docs, UNREGISTERED + INVALID_ARGUMENT (with
      // INVALID_REGISTRATION_TOKEN detail) mean the token is dead.
      if (
        outcome.status === 404
        || outcome.errorCode === "UNREGISTERED"
        || outcome.errorCode === "INVALID_ARGUMENT"
      ) {
        await deactivateDevicePushToken(row.token, row.kind).catch(() => { /* ignore */ });
        result.deactivated += 1;
      }
    }
  }));

  return result;
}

/** Stable hash of payload for log dedupe / diagnostics. */
export function hashCallPayload(payload: CallVoipPushPayload): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}
