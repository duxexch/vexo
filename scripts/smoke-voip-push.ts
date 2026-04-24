/**
 * Static smoke covering the VoIP push wiring.
 *
 * The actual APNs/FCM gateways need real credentials and a physical
 * device, so this smoke focuses on the contract surface that future
 * regressions are most likely to break:
 *   1. The server module exists with the expected exports.
 *   2. The JWT signer produces a real ES256 token (not a stub).
 *   3. APNs / FCM payload builders contain the right channel keys.
 *   4. The chat-call invite path actually invokes sendCallVoipPush.
 *   5. The /api/devices/voip-token route is registered.
 *   6. The drizzle schema includes device_push_tokens.
 *   7. The Capacitor plugin ships PushKitDelegate + CallFcmService
 *      sources at the locations declared in package.json / Package.swift.
 *
 * No network calls. No DB calls. ~80 ms wall time.
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";

import {
  buildApnsCallPayload,
  buildApnsJwt,
  buildFcmCallMessage,
  hashCallPayload,
  _resetApnsTokenCacheForTests,
  type CallVoipPushPayload,
} from "../server/lib/voip-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label: string): void {
  passed += 1;
  console.log(`[smoke:voip-push] PASS ${label}`);
}

function fail(label: string, detail?: string): void {
  failed += 1;
  console.log(`[smoke:voip-push] FAIL ${label}${detail ? `\n            -> ${detail}` : ""}`);
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

async function main(): Promise<void> {
  const samplePayload: CallVoipPushPayload = {
    sessionId: "00000000-0000-4000-8000-000000000001",
    callerId: "user-caller",
    callerUsername: "alice",
    receiverId: "user-receiver",
    callType: "voice",
    ratePerMinute: 0.05,
    conversationId: "user-caller",
  };

  // ── 1. APNs payload shape
  const apnsPayload = buildApnsCallPayload(samplePayload);
  const aps = (apnsPayload as Record<string, unknown>).aps as Record<string, unknown> | undefined;
  if (aps && aps["content-available"] === 1 && !("alert" in aps) && !("sound" in aps)) {
    pass("APNs payload is a content-available VoIP wake (no alert/sound)");
  } else {
    fail(
      "APNs payload is a content-available VoIP wake",
      `Got: ${JSON.stringify(aps)} — must include content-available:1 and must NOT include alert/sound (otherwise PushKit silently downgrades to a plain notification).`,
    );
  }
  if (
    apnsPayload.sessionId === samplePayload.sessionId
    && apnsPayload.callerId === samplePayload.callerId
    && apnsPayload.callType === samplePayload.callType
    && apnsPayload.type === "call"
  ) {
    pass("APNs payload includes sessionId/callerId/callType/type=call for plugin dispatch");
  } else {
    fail("APNs payload includes session metadata", JSON.stringify(apnsPayload));
  }

  // ── 2. FCM payload shape
  const fcmMessage = buildFcmCallMessage("fcm-token-abc", samplePayload);
  const message = (fcmMessage as Record<string, unknown>).message as Record<string, unknown>;
  const data = message.data as Record<string, unknown>;
  const android = message.android as Record<string, unknown>;
  if (
    data.type === "call"
    && data.sessionId === samplePayload.sessionId
    && android.priority === "HIGH"
    && android.ttl === "60s"
    && !("notification" in message)
  ) {
    pass("FCM message is data-only with android.priority=HIGH and 60s TTL");
  } else {
    fail(
      "FCM message is data-only with high priority",
      `Got: ${JSON.stringify(fcmMessage)} — must be data-only (no 'notification' block) and use android.priority=HIGH so the FirebaseMessagingService runs while killed.`,
    );
  }

  // ── 3. APNs JWT signing — round-trip with a fresh ES256 key
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  _resetApnsTokenCacheForTests();
  const jwt = buildApnsJwt({
    keyId: "TESTKID42",
    teamId: "TESTTEAM42",
    bundleId: "click.vixo.test",
    privateKeyPem,
    host: "https://api.push.apple.com",
  });
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    fail("APNs JWT has 3 dot-separated parts", `Got: ${parts.length}`);
  } else {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as Record<string, unknown>;
    if (header.alg === "ES256" && header.kid === "TESTKID42" && header.typ === "JWT") {
      pass("APNs JWT header uses ES256 + kid + typ=JWT (Apple-required shape)");
    } else {
      fail("APNs JWT header uses ES256 + kid + typ=JWT", JSON.stringify(header));
    }
    if (payload.iss === "TESTTEAM42" && typeof payload.iat === "number") {
      pass("APNs JWT payload has iss=teamId and numeric iat");
    } else {
      fail("APNs JWT payload has iss=teamId and numeric iat", JSON.stringify(payload));
    }
    // Verify the signature actually validates against the public key
    // — guards against a future refactor that accidentally drops the
    // ieee-p1363 dsaEncoding (Node's default DER encoding is rejected
    // by APNs / any standard JWT verifier).
    const verifier = createVerify("SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const sigBytes = base64UrlDecode(parts[2]);
    if (sigBytes.length !== 64) {
      fail(
        "APNs JWT signature is 64 raw bytes (IEEE P1363 r||s)",
        `Got ${sigBytes.length} bytes — Apple's gateway requires the raw r||s pair, not DER.`,
      );
    } else {
      pass("APNs JWT signature is 64 raw bytes (IEEE P1363 r||s, the format Apple requires)");
    }
    const verified = verifier.verify(
      { key: createPublicKey(publicKey.export({ format: "pem", type: "spki" }) as string), dsaEncoding: "ieee-p1363" },
      sigBytes,
    );
    if (verified) {
      pass("APNs JWT signature verifies against the matching public key");
    } else {
      fail("APNs JWT signature verifies against the matching public key");
    }
  }

  // ── 4. JWT cache reuse — second call within TTL returns the SAME token.
  const reused = buildApnsJwt({
    keyId: "TESTKID42",
    teamId: "TESTTEAM42",
    bundleId: "click.vixo.test",
    privateKeyPem,
    host: "https://api.push.apple.com",
  });
  if (reused === jwt) {
    pass("APNs JWT cache returns the same token on subsequent calls within TTL");
  } else {
    fail("APNs JWT cache returns the same token on subsequent calls within TTL");
  }

  // ── 5. hashCallPayload is stable + 12 chars
  const h1 = hashCallPayload(samplePayload);
  const h2 = hashCallPayload(samplePayload);
  if (h1 === h2 && /^[0-9a-f]{12}$/.test(h1)) {
    pass("hashCallPayload returns a stable 12-char hex digest");
  } else {
    fail("hashCallPayload returns a stable 12-char hex digest", `${h1} vs ${h2}`);
  }

  // ── 6. chat-call invite path actually publishes the VoIP push
  const callsSrc = await readText(path.join(REPO_ROOT, "server/routes/chat-features/calls.ts"));
  if (!callsSrc) {
    fail("server/routes/chat-features/calls.ts is readable");
  } else if (
    /import\s*\{\s*sendCallVoipPush\s*\}\s*from\s*["']\.\.\/\.\.\/lib\/voip-push["']/.test(callsSrc)
    && /sendCallVoipPush\s*\(\s*\{[\s\S]{0,400}sessionId:\s*createdSession\.id/.test(callsSrc)
  ) {
    pass("calls.ts imports sendCallVoipPush and invokes it with the new session id");
  } else {
    fail(
      "calls.ts imports sendCallVoipPush and invokes it with the new session id",
      "After notifyUsers([receiverId], ...) the invite flow must publish a VoIP wake or background/killed devices won't ring.",
    );
  }

  // ── 7. /api/devices/voip-token route is registered
  const routesIndex = await readText(path.join(REPO_ROOT, "server/routes/index.ts"));
  const voipRoute = await readText(path.join(REPO_ROOT, "server/routes/devices/voip-tokens.ts"));
  if (
    routesIndex
    && voipRoute
    && /registerVoipTokenRoutes/.test(routesIndex)
    && /\/api\/devices\/voip-token/.test(voipRoute)
  ) {
    pass("/api/devices/voip-token register + delete routes are wired into the routes index");
  } else {
    fail("/api/devices/voip-token routes are wired into the routes index");
  }

  // ── 7b. The DELETE handler must be user-scoped, not global. A delayed
  // logout from User A on a shared device must NOT deactivate the same
  // physical token after User B has just registered it. The route uses
  // `deactivateDevicePushTokenForUser(req.user!.id, ...)`; the global
  // `deactivateDevicePushToken(token, kind)` is reserved for the
  // gateway-driven dead-token path inside voip-push.ts.
  if (
    voipRoute
    && /deactivateDevicePushTokenForUser\s*\(\s*req\.user!\.id/.test(voipRoute)
    && !/[^F]deactivateDevicePushToken\s*\(/.test(voipRoute)
  ) {
    pass("DELETE /api/devices/voip-token uses the user-scoped deactivation (account-switch race fix)");
  } else {
    fail(
      "DELETE /api/devices/voip-token uses the user-scoped deactivation (account-switch race fix)",
      "If the route calls the global deactivateDevicePushToken(token, kind), a logout request from User A can disable a token that has just been re-registered to User B on the same physical device, silently breaking B's lock-screen ringer.",
    );
  }

  // ── 7c. The user-scoped helper exists, filters on userId, and the
  // global helper documents that it is gateway-only.
  const storageSrc = await readText(path.join(REPO_ROOT, "server/storage/notifications.ts"));
  if (
    storageSrc
    && /export\s+async\s+function\s+deactivateDevicePushTokenForUser\s*\(/.test(storageSrc)
    && /eq\s*\(\s*devicePushTokens\.userId\s*,\s*userId\s*\)[\s\S]{0,200}eq\s*\(\s*devicePushTokens\.token/.test(storageSrc)
  ) {
    pass("storage exposes deactivateDevicePushTokenForUser scoped on userId+token+kind");
  } else {
    fail("storage exposes deactivateDevicePushTokenForUser scoped on userId+token+kind");
  }

  // ── 8. Schema includes device_push_tokens with the right kinds
  const schemaSrc = await readText(path.join(REPO_ROOT, "shared/schema.ts"));
  if (
    schemaSrc
    && /pgTable\(\s*"device_push_tokens"/.test(schemaSrc)
    && /idx_device_push_tokens_token_kind_unique/.test(schemaSrc)
  ) {
    pass("shared/schema.ts defines device_push_tokens with a (token, kind) unique index");
  } else {
    fail("shared/schema.ts defines device_push_tokens with a (token, kind) unique index");
  }

  // ── 9. iOS plugin sources land at the path Package.swift declares
  const iosBase = path.join(
    REPO_ROOT,
    "native-plugins/capacitor-native-call-ui/ios/Sources/NativeCallUIPlugin",
  );
  const pushKitSrc = await readText(path.join(iosBase, "PushKitDelegate.swift"));
  const callKitSrc = await readText(path.join(iosBase, "CallKitProvider.swift"));
  if (
    pushKitSrc
    && callKitSrc
    && /PKPushRegistry/.test(pushKitSrc)
    && /didReceiveIncomingPushWith/.test(pushKitSrc)
    && /CallKitProvider\.shared\.reportIncomingCall/.test(pushKitSrc)
    && /static let shared/.test(callKitSrc)
    && /reportNewIncomingCall/.test(callKitSrc)
  ) {
    pass(
      "iOS plugin ships PushKitDelegate.swift wiring PKPushRegistry → CallKitProvider.shared.reportIncomingCall",
    );
  } else {
    fail(
      "iOS plugin ships PushKitDelegate.swift wiring PKPushRegistry → CallKitProvider.shared.reportIncomingCall",
      "AppDelegate's VoIP push handler must be able to call CallKitProvider.shared.reportIncomingCall(...) from the plugin.",
    );
  }

  // ── 10. Android FCM service forwards type=call to the foreground service
  const fcmServiceSrc = await readText(
    path.join(
      REPO_ROOT,
      "native-plugins/capacitor-native-call-ui/android/src/main/java/click/vixo/nativecallui/CallFcmService.kt",
    ),
  );
  const foregroundSrc = await readText(
    path.join(
      REPO_ROOT,
      "native-plugins/capacitor-native-call-ui/android/src/main/java/click/vixo/nativecallui/IncomingCallForegroundService.kt",
    ),
  );
  if (
    fcmServiceSrc
    && foregroundSrc
    && /FirebaseMessagingService/.test(fcmServiceSrc)
    && /data\["type"\]\s*!=\s*"call"/.test(fcmServiceSrc)
    && /IncomingCallForegroundService/.test(fcmServiceSrc)
    && /startForegroundService\(intent\)/.test(fcmServiceSrc)
    && /startForeground\(/.test(foregroundSrc)
  ) {
    pass(
      "Android plugin's FCM service starts a foreground service for type=call within the 5s budget",
    );
  } else {
    fail(
      "Android plugin's FCM service starts a foreground service for type=call within the 5s budget",
      "CallFcmService must filter on type=call, then startForegroundService(IncomingCallForegroundService), which itself calls startForeground in onCreate to satisfy Android 12+ background-start limits.",
    );
  }

  // ── 11. AndroidManifest snippet declares the Telecom + FCM services
  const manifestSnippet = await readText(
    path.join(REPO_ROOT, "native-plugins/capacitor-native-call-ui/examples/AndroidManifest-snippet.xml"),
  );
  if (
    manifestSnippet
    && /CallConnectionService/.test(manifestSnippet)
    && /android\.telecom\.ConnectionService/.test(manifestSnippet)
    && /CallFcmService/.test(manifestSnippet)
    && /com\.google\.firebase\.MESSAGING_EVENT/.test(manifestSnippet)
    && /MANAGE_OWN_CALLS/.test(manifestSnippet)
  ) {
    pass(
      "AndroidManifest snippet declares CallConnectionService, CallFcmService, and the MANAGE_OWN_CALLS permission",
    );
  } else {
    fail(
      "AndroidManifest snippet declares CallConnectionService, CallFcmService, and the MANAGE_OWN_CALLS permission",
    );
  }

  // ── 12. AppDelegate snippet bootstraps PushKit and forwards the token
  const appDelegateSnippet = await readText(
    path.join(REPO_ROOT, "native-plugins/capacitor-native-call-ui/examples/AppDelegate-snippet.swift"),
  );
  if (
    appDelegateSnippet
    && /PushKitDelegate\.shared\.bootstrap\(\)/.test(appDelegateSnippet)
    && /onTokenChanged/.test(appDelegateSnippet)
    && /\/api\/devices\/voip-token/.test(appDelegateSnippet)
  ) {
    pass("AppDelegate snippet bootstraps PushKit and documents the /api/devices/voip-token upload");
  } else {
    fail("AppDelegate snippet bootstraps PushKit and documents the /api/devices/voip-token upload");
  }

  // ── 13. APNs payload uses the .voip topic in voip-push.ts (not the
  // bundle id directly — Apple requires a separate VoIP topic).
  const voipModuleSrc = await readText(path.join(REPO_ROOT, "server/lib/voip-push.ts"));
  if (
    voipModuleSrc
    && /apns-topic.*\$\{.*bundleId\}\.voip/.test(voipModuleSrc)
    && /apns-push-type.*voip/.test(voipModuleSrc)
    && /apns-priority.*10/.test(voipModuleSrc)
  ) {
    pass("voip-push.ts sends APNs requests with apns-topic=<bundle>.voip + apns-push-type=voip + priority 10");
  } else {
    fail(
      "voip-push.ts sends APNs requests with apns-topic=<bundle>.voip + apns-push-type=voip + priority 10",
      "These three headers are mandatory or APNs returns BadTopic / TopicDisallowed and the device never wakes.",
    );
  }

  // ── 14. voip-push.ts deactivates dead tokens (410 Unregistered)
  if (
    voipModuleSrc
    && /Unregistered/.test(voipModuleSrc)
    && /deactivateDevicePushToken/.test(voipModuleSrc)
  ) {
    pass("voip-push.ts deactivates tokens that the gateway reports as dead");
  } else {
    fail(
      "voip-push.ts deactivates tokens that the gateway reports as dead",
      "Without this, every incoming call retries thousands of dead tokens and Apple rate-limits the gateway.",
    );
  }

  // ── 15. Plugin podspec exposes PushKit + CallKit frameworks
  const podspec = await readText(
    path.join(REPO_ROOT, "native-plugins/capacitor-native-call-ui/CapacitorNativeCallUI.podspec"),
  );
  if (podspec && /CallKit/.test(podspec) && /PushKit/.test(podspec)) {
    pass("Plugin podspec links CallKit + PushKit frameworks");
  } else {
    fail("Plugin podspec links CallKit + PushKit frameworks");
  }

  // ── 16. Plugin sources actually exist at the file paths package.json declares
  const packageJson = JSON.parse(
    (await readText(path.join(REPO_ROOT, "native-plugins/capacitor-native-call-ui/package.json"))) ?? "{}",
  ) as { files?: string[] };
  const declaredFiles = packageJson.files ?? [];
  const expectations: Array<{ glob: string; mustExist: string }> = [
    { glob: "ios/Sources", mustExist: "ios/Sources/NativeCallUIPlugin/PushKitDelegate.swift" },
    { glob: "android/src/main/", mustExist: "android/src/main/java/click/vixo/nativecallui/CallFcmService.kt" },
  ];
  let allExist = true;
  for (const exp of expectations) {
    const declared = declaredFiles.some((f) => exp.mustExist.startsWith(f.replace(/\/$/, "")));
    const exists = await fileExists(
      path.join(REPO_ROOT, "native-plugins/capacitor-native-call-ui", exp.mustExist),
    );
    if (!declared || !exists) {
      allExist = false;
      fail(`${exp.mustExist} exists and is covered by package.json "files"`);
    }
  }
  if (allExist) {
    pass("Plugin package.json files[] covers ios/Sources + android/src/main and the sources exist on disk");
  }

  // ── Result
  const total = passed + failed;
  if (failed === 0) {
    console.log(`[smoke:voip-push] OK — all ${total} check(s) passed`);
    process.exit(0);
  } else {
    console.log(`[smoke:voip-push] FAIL — ${failed}/${total} check(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke:voip-push] unexpected error", err);
  process.exit(1);
});
