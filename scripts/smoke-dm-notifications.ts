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

import {
  buildDmNotificationPayload,
  buildDmNotificationPreview,
  shouldNotifyDmRecipient,
} from "../server/lib/dm-notification-payload";
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

function main(): void {
  testSuppressionRules();
  testPayloadParity();
  testPreviewRules();
  console.log("[smoke:dm-notifications] OK — all checks passed");
}

main();
