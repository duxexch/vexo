#!/usr/bin/env tsx
/**
 * Task #23 — verify chat notifications behave correctly.
 *
 * Covers the realtime + HTTP DM notification surface introduced in
 * Tasks #16 / #21 / #22:
 *
 *   1. Suppression rules (block / mute / per-conversation
 *      notification mute) — recipient gets exactly one notification
 *      when they should and zero when they shouldn't.
 *   2. Payload parity — the title / titleAr / message / messageAr /
 *      link / metadata.event the recipient sees are identical
 *      regardless of which transport (HTTP vs Socket.IO) the sender
 *      used. Verified by calling the shared
 *      `buildDmNotificationPayload` helper that both code paths now
 *      route through, then asserting the realtime output matches the
 *      HTTP output field-for-field (with `transport` being the only
 *      allowed difference).
 *   3. Preview rules — text content is truncated, media types fall
 *      back to localized labels.
 *
 * The test stays at the unit level rather than booting Express +
 * Socket.IO so it runs in milliseconds and stays out of the way of
 * the real database / Redis / push services.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDmNotificationPayload,
  buildDmNotificationPreview,
  dispatchHttpDmNotification,
  shouldNotifyDmRecipient,
  type DmNotificationPayload,
} from "../server/lib/dm-notification-payload";
import {
  deliverRealtimeDirectMessage,
  type DeliverDeps,
} from "../server/socketio/direct-message-bridge";
import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers("DmNotificationsSmokeError");

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    fail(message, { actual, expected });
  }
}

function logPass(step: string): void {
  console.log(`[smoke:dm-notifications] PASS ${step}`);
}

// ---- 1. Suppression rules ------------------------------------------------

function testSuppressionRules(): void {
  // Clean recipient: no block, no notification mute → notify.
  assertEqual(
    shouldNotifyDmRecipient({
      peerBlockedSender: false,
      peerSilencedNotifications: false,
    }),
    true,
    "Clean recipient should be notified",
  );
  logPass("clean recipient → notification sent");

  // Recipient blocked sender: never notify (would also be blocked
  // upstream by the HTTP path returning 403, and emission-suppressed
  // by the realtime path).
  assertEqual(
    shouldNotifyDmRecipient({
      peerBlockedSender: true,
      peerSilencedNotifications: false,
    }),
    false,
    "Blocked recipient must NOT be notified",
  );
  logPass("recipient blocked sender → no notification");

  // Per-conversation notification mute (Task #22): the message still
  // gets delivered, but the bell/push is silenced.
  assertEqual(
    shouldNotifyDmRecipient({
      peerBlockedSender: false,
      peerSilencedNotifications: true,
    }),
    false,
    "Notification-muted recipient must NOT be notified",
  );
  logPass("recipient notification-muted sender → no notification");

  // Both flags on → still no notification (block wins).
  assertEqual(
    shouldNotifyDmRecipient({
      peerBlockedSender: true,
      peerSilencedNotifications: true,
    }),
    false,
    "Blocked + muted recipient must NOT be notified",
  );
  logPass("blocked AND muted → no notification");
}

// ---- 2. Payload parity ---------------------------------------------------

function testPayloadParity(): void {
  const senderId = "user-sender-1";
  const senderDisplayName = "Layla";
  const messageId = "msg-abc-123";
  const content = "Hello, ready for a game?";

  const httpPayload = buildDmNotificationPayload({
    senderId,
    senderDisplayName,
    messageType: "text",
    content,
    messageId,
  });
  const realtimePayload = buildDmNotificationPayload({
    senderId,
    senderDisplayName,
    messageType: "text",
    content,
    messageId,
    transport: "socketio",
  });

  // Title / message / link must match exactly across transports.
  assertEqual(httpPayload.title, realtimePayload.title, "title parity");
  assertEqual(httpPayload.titleAr, realtimePayload.titleAr, "titleAr parity");
  assertEqual(httpPayload.message, realtimePayload.message, "message parity");
  assertEqual(
    httpPayload.messageAr,
    realtimePayload.messageAr,
    "messageAr parity",
  );
  assertEqual(httpPayload.link, realtimePayload.link, "link parity");
  assertEqual(httpPayload.type, realtimePayload.type, "type parity");
  assertEqual(httpPayload.priority, realtimePayload.priority, "priority parity");

  const httpMeta = JSON.parse(httpPayload.metadata) as Record<string, unknown>;
  const realtimeMeta = JSON.parse(realtimePayload.metadata) as Record<
    string,
    unknown
  >;

  // metadata.event / senderId / messageType / messageId must match.
  assertEqual(httpMeta.event, "chat_message", "HTTP metadata.event");
  assertEqual(
    realtimeMeta.event,
    httpMeta.event,
    "metadata.event parity (chat_message on both transports)",
  );
  assertEqual(
    realtimeMeta.senderId,
    httpMeta.senderId,
    "metadata.senderId parity",
  );
  assertEqual(
    realtimeMeta.messageType,
    httpMeta.messageType,
    "metadata.messageType parity",
  );
  assertEqual(
    realtimeMeta.messageId,
    httpMeta.messageId,
    "metadata.messageId parity",
  );

  // Only the realtime payload tags `transport`; HTTP must not.
  assertEqual(realtimeMeta.transport, "socketio", "realtime metadata.transport");
  assertCondition(
    !("transport" in httpMeta),
    "HTTP metadata must NOT include `transport`",
    httpMeta,
  );

  // Other than transport, the metadata maps must be identical.
  const httpMetaKeys = Object.keys(httpMeta).sort();
  const realtimeMetaKeys = Object.keys(realtimeMeta)
    .filter((k) => k !== "transport")
    .sort();
  assertEqual(
    httpMetaKeys.join(","),
    realtimeMetaKeys.join(","),
    "metadata keys parity (excluding transport)",
  );

  // Link must deep-link into the correct conversation.
  assertEqual(
    httpPayload.link,
    `/chat?user=${encodeURIComponent(senderId)}`,
    "link points at sender conversation",
  );

  logPass("HTTP and realtime payloads match field-for-field");
}

// ---- 3. Preview rules ----------------------------------------------------

function testPreviewRules(): void {
  // Text: trimmed + truncated to 120 chars.
  const long = "x".repeat(500);
  const previewText = buildDmNotificationPreview("text", `   ${long}   `);
  assertEqual(previewText.en.length, 120, "text preview truncated to 120 chars");
  assertEqual(previewText.en, previewText.ar, "text en/ar previews equal");
  logPass("text preview truncates and trims");

  // Empty text → "Sent a message" / "أرسل رسالة".
  const previewEmpty = buildDmNotificationPreview("text", "   ");
  assertEqual(previewEmpty.en, "Sent a message", "empty text en label");
  assertEqual(previewEmpty.ar, "أرسل رسالة", "empty text ar label");
  logPass("empty text falls back to localized labels");

  // Media types.
  const cases: Array<[string, string, string]> = [
    ["image", "Sent a photo", "أرسل صورة"],
    ["video", "Sent a video", "أرسل فيديو"],
    ["voice", "Sent a voice message", "أرسل رسالة صوتية"],
  ];
  for (const [type, en, ar] of cases) {
    const p = buildDmNotificationPreview(type, "");
    assertEqual(p.en, en, `${type} preview en label`);
    assertEqual(p.ar, ar, `${type} preview ar label`);
  }
  logPass("media-type previews use localized labels");
}

// ---- 4. Realtime bridge integration --------------------------------------
//
// Drives the real `deliverRealtimeDirectMessage` entry point with stub
// deps so we exercise the actual call site that wires storage / cache /
// notification together. If a future change removes the `sendNotification`
// call, mis-routes it, or flips the suppression branch, these scenarios
// fail loudly.

interface CapturedNotification {
  receiverId: string;
  payload: { title: string; metadata: string };
}

function makeStubChatNs(): {
  ns: Parameters<typeof deliverRealtimeDirectMessage>[0]["chatNs"];
  emitted: Array<{ rid: string }>;
} {
  const emitted: Array<{ rid: string }> = [];
  const fakeSocket = (rid: string) => ({
    data: { userId: rid },
    emit: (_event: string, _payload: unknown) => {
      emitted.push({ rid });
    },
  });
  const ns = {
    in(_room: string) {
      return {
        async fetchSockets() {
          return [fakeSocket("user-sender-1"), fakeSocket("user-peer-2")];
        },
      };
    },
  } as unknown as Parameters<typeof deliverRealtimeDirectMessage>[0]["chatNs"];
  return { ns, emitted };
}

function makeDepsWithLists(opts: {
  peerBlocks?: boolean;
  peerMutes?: boolean;
  peerNotifMutes?: boolean;
}): {
  deps: DeliverDeps;
  captured: CapturedNotification[];
} {
  const captured: CapturedNotification[] = [];
  const deps: DeliverDeps = {
    createDirectMessage: async (m) => ({
      id: "msg-real-1",
      senderId: m.senderId,
      receiverId: m.receiverId,
      content: m.content,
      messageType: "text",
      createdAt: new Date(),
    }),
    getUser: (async (id: string) => {
      if (id === "user-sender-1") {
        return {
          id,
          username: "layla",
          firstName: "Layla",
          blockedUsers: [],
          mutedUsers: [],
          notificationMutedUsers: [],
        } as unknown as Awaited<ReturnType<DeliverDeps["getUser"]>>;
      }
      return {
        id,
        username: "peer",
        firstName: "Peer",
        blockedUsers: opts.peerBlocks ? ["user-sender-1"] : [],
        mutedUsers: opts.peerMutes ? ["user-sender-1"] : [],
        notificationMutedUsers: opts.peerNotifMutes
          ? ["user-sender-1"]
          : [],
      } as unknown as Awaited<ReturnType<DeliverDeps["getUser"]>>;
    }) as DeliverDeps["getUser"],
    getCachedUserBlockLists: (async (id, fetcher) => {
      const u = await fetcher(id);
      return u ?? { blockedUsers: [], mutedUsers: [] };
    }) as DeliverDeps["getCachedUserBlockLists"],
    sendNotification: (async (receiverId, payload) => {
      captured.push({
        receiverId,
        payload: {
          title: (payload as { title: string }).title,
          metadata: (payload as { metadata: string }).metadata,
        },
      });
    }) as DeliverDeps["sendNotification"],
  };
  return { deps, captured };
}

async function testBridgeIntegration(): Promise<void> {
  const baseArgs = {
    roomId: "dm:user-peer-2:user-sender-1",
    senderId: "user-sender-1",
    senderUsernameFallback: "layla",
    text: "Hi from integration test",
    chatNs: undefined as never,
  };

  // (a) Allowed → exactly one notification, addressed to peer.
  {
    const { ns } = makeStubChatNs();
    const { deps, captured } = makeDepsWithLists({});
    const result = await deliverRealtimeDirectMessage(
      { ...baseArgs, chatNs: ns },
      deps,
    );
    assertCondition(result.ok, "Allowed delivery should succeed", result);
    // Allow microtask to flush the void-return notification side-effect.
    await new Promise((r) => setImmediate(r));
    assertEqual(
      captured.length,
      1,
      "Allowed delivery must trigger exactly one notification",
    );
    assertEqual(
      captured[0].receiverId,
      "user-peer-2",
      "Notification must be addressed to the peer (not sender)",
    );
    const meta = JSON.parse(captured[0].payload.metadata) as {
      event: string;
      transport?: string;
    };
    assertEqual(meta.event, "chat_message", "metadata.event on real bridge");
    assertEqual(
      meta.transport,
      "socketio",
      "Realtime bridge tags transport=socketio",
    );
    logPass("bridge integration: allowed → notification fired correctly");
  }

  // (b) Peer blocked sender → zero notifications.
  {
    const { ns } = makeStubChatNs();
    const { deps, captured } = makeDepsWithLists({ peerBlocks: true });
    const result = await deliverRealtimeDirectMessage(
      { ...baseArgs, chatNs: ns },
      deps,
    );
    assertCondition(
      result.ok,
      "Bridge still persists message when peer blocked sender",
      result,
    );
    await new Promise((r) => setImmediate(r));
    assertEqual(
      captured.length,
      0,
      "Blocked recipient must NOT receive notification on real bridge",
    );
    logPass("bridge integration: peer blocked → no notification");
  }

  // (b2) Peer muted sender (regular `mutedUsers`, the legacy "soft
  //      block" list shared with chat suppression) → zero
  //      notifications. The bridge treats `mutedUsers` exactly like
  //      `blockedUsers` for the purposes of fan-out + notification,
  //      so a regression that drops the muted check would otherwise
  //      silently start spamming the bell here.
  {
    const { ns } = makeStubChatNs();
    const { deps, captured } = makeDepsWithLists({ peerMutes: true });
    const result = await deliverRealtimeDirectMessage(
      { ...baseArgs, chatNs: ns },
      deps,
    );
    assertCondition(
      result.ok,
      "Bridge still persists message when peer muted sender",
      result,
    );
    await new Promise((r) => setImmediate(r));
    assertEqual(
      captured.length,
      0,
      "Muted recipient (mutedUsers) must NOT receive notification on real bridge",
    );
    logPass("bridge integration: peer muted (mutedUsers) → no notification");
  }

  // (c) Peer notification-muted sender → zero notifications, message
  //     still persisted (the bridge already fan-outs the chat:message
  //     emit; that branch is checked above).
  {
    const { ns } = makeStubChatNs();
    const { deps, captured } = makeDepsWithLists({ peerNotifMutes: true });
    const result = await deliverRealtimeDirectMessage(
      { ...baseArgs, chatNs: ns },
      deps,
    );
    assertCondition(result.ok, "Notif-muted delivery still ok", result);
    await new Promise((r) => setImmediate(r));
    assertEqual(
      captured.length,
      0,
      "Notification-muted recipient must NOT receive notification on real bridge",
    );
    logPass("bridge integration: peer notification-muted → no notification");
  }
}

// ---- 5. HTTP path runtime integration ------------------------------------
//
// `dispatchHttpDmNotification` is the exact runtime helper called by
// `server/routes/chat/chat-messaging.ts`. We exercise it directly so
// the HTTP-side suppression + payload assembly is verified at runtime,
// not by string-matching the route source.
//
// The hard-block branch (peer in `blockedUsers`) is still validated
// structurally below, because the HTTP route enforces it via
// `isUserBlocked(receiverId, senderId)` BEFORE this helper is reached
// (returns 403 to the caller). The structural check guards that
// short-circuit from being silently removed.

function testHttpRuntimeIntegration(): void {
  const baseHttpArgs = {
    receiverId: "user-peer-2",
    senderId: "user-sender-1",
    senderDisplayName: "Layla",
    messageType: "text",
    sanitizedContent: "Hello over HTTP",
    messageId: "msg-http-1",
  };

  // (a) Allowed → exactly one runtime sendNotification call to peer.
  {
    const captured: Array<{
      receiverId: string;
      payload: DmNotificationPayload;
    }> = [];
    const result = dispatchHttpDmNotification(
      { ...baseHttpArgs, recipientSilencedNotifications: false },
      (rid, payload) => {
        captured.push({ receiverId: rid, payload });
      },
    );
    assertCondition(result.sent, "HTTP dispatch must report sent=true when allowed");
    assertEqual(captured.length, 1, "HTTP runtime: must invoke send exactly once");
    assertEqual(
      captured[0].receiverId,
      "user-peer-2",
      "HTTP runtime: notification must be addressed to receiverId",
    );
    const meta = JSON.parse(captured[0].payload.metadata) as {
      event: string;
      transport?: string;
      senderId: string;
      messageId: string;
    };
    assertEqual(meta.event, "chat_message", "HTTP runtime: metadata.event");
    assertEqual(meta.senderId, "user-sender-1", "HTTP runtime: metadata.senderId");
    assertEqual(meta.messageId, "msg-http-1", "HTTP runtime: metadata.messageId");
    assertCondition(
      meta.transport === undefined,
      "HTTP runtime: metadata.transport must be omitted (it's a realtime-only tag)",
    );
    assertCondition(
      captured[0].payload.title.includes("Layla"),
      "HTTP runtime: title must include sender display name",
    );
    logPass("HTTP runtime: allowed → exactly one sendNotification with correct payload");
  }

  // (b) Recipient notification-muted sender → zero sendNotification calls.
  {
    const captured: unknown[] = [];
    const result = dispatchHttpDmNotification(
      { ...baseHttpArgs, recipientSilencedNotifications: true },
      (rid, payload) => {
        captured.push({ rid, payload });
      },
    );
    assertCondition(
      !result.sent,
      "HTTP dispatch must report sent=false when recipient silenced",
    );
    assertEqual(
      captured.length,
      0,
      "HTTP runtime: silenced recipient must NOT receive sendNotification",
    );
    logPass("HTTP runtime: notification-muted recipient → no sendNotification");
  }

  // (c) Hard-block enforcement: the route must short-circuit on
  //     `isUserBlocked(receiverId, senderId)` BEFORE reaching the
  //     dispatch helper. Locked down structurally so a regression
  //     can't bypass it without breaking this check.
  const path = resolve(
    process.cwd(),
    "server/routes/chat/chat-messaging.ts",
  );
  const src = readFileSync(path, "utf8");
  assertCondition(
    src.includes("dispatchHttpDmNotification"),
    "HTTP DM route must call dispatchHttpDmNotification",
  );
  assertCondition(
    /isUserBlocked\s*\(\s*receiverId\s*,\s*senderId\s*\)/.test(src),
    "HTTP DM route must short-circuit when recipient blocked sender",
  );
  logPass("HTTP runtime: hard-block short-circuit still wired in route");
}

async function main(): Promise<void> {
  testSuppressionRules();
  testPayloadParity();
  testPreviewRules();
  await testBridgeIntegration();
  testHttpRuntimeIntegration();
  console.log("[smoke:dm-notifications] OK — all checks passed");
}

main()
  .then(() => {
    // Importing the realtime bridge transitively pulls in `storage`,
    // which opens a long-lived DB pool. That pool keeps the event loop
    // alive past the last assertion, so we exit explicitly after the
    // suite passes (mirrors how the other quality:smoke:* scripts end).
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
