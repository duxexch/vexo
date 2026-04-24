/**
 * Shared "new direct message" notification payload + suppression
 * helpers used by both DM transports:
 *   - HTTP path: server/routes/chat/chat-messaging.ts
 *   - Realtime (Socket.IO) path: server/socketio/direct-message-bridge.ts
 *
 * Centralizing the construction here guarantees that the bell entry,
 * push title, deep-link, and metadata.event a recipient sees are
 * identical regardless of which transport the sender used. Task #23
 * leans on this for its parity test.
 */

export interface DmNotificationPayloadArgs {
  senderId: string;
  /**
   * Display name shown in title — already resolved by caller from
   * `firstName || username || "User"` so this helper stays sync.
   */
  senderDisplayName: string;
  /**
   * Realtime DM is text-only; the HTTP path may pass "image" / "video"
   * / "voice" / "text" so we can produce a media-aware preview when
   * `content` is empty.
   */
  messageType: string;
  /** Sanitized message content (caller responsible for sanitization). */
  content: string;
  messageId: string;
  /**
   * Free-form transport tag (e.g. "socketio") added to metadata so
   * downstream analytics can tell where the message came from. The
   * HTTP path leaves this undefined, matching its prior payload.
   */
  transport?: string;
}

export interface DmNotificationPayload {
  type: "system";
  priority: "normal";
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  link: string;
  metadata: string;
}

export function buildDmNotificationPreview(
  messageType: string,
  content: string,
): { en: string; ar: string } {
  const trimmed = (content ?? "").trim();
  if (trimmed.length > 0) {
    const preview = trimmed.slice(0, 120);
    return { en: preview, ar: preview };
  }
  if (messageType === "image") return { en: "Sent a photo", ar: "أرسل صورة" };
  if (messageType === "video") return { en: "Sent a video", ar: "أرسل فيديو" };
  if (messageType === "voice") {
    return { en: "Sent a voice message", ar: "أرسل رسالة صوتية" };
  }
  return { en: "Sent a message", ar: "أرسل رسالة" };
}

export function buildDmNotificationPayload(
  args: DmNotificationPayloadArgs,
): DmNotificationPayload {
  const preview = buildDmNotificationPreview(args.messageType, args.content);
  const metadata: Record<string, unknown> = {
    event: "chat_message",
    senderId: args.senderId,
    messageType: args.messageType,
    messageId: args.messageId,
  };
  if (args.transport) metadata.transport = args.transport;

  return {
    type: "system",
    priority: "normal",
    title: `${args.senderDisplayName} sent you a message`,
    titleAr: `رسالة جديدة من ${args.senderDisplayName}`,
    message: preview.en,
    messageAr: preview.ar,
    link: `/chat?user=${encodeURIComponent(args.senderId)}`,
    metadata: JSON.stringify(metadata),
  };
}

/**
 * Whether a "new DM" notification should reach `peerId`. The HTTP
 * path additionally short-circuits the whole request on a hard block
 * (returns 403), so by the time it gets to "should I notify?" the
 * predicate reduces to `!silenced`. The realtime path persists the
 * message in either case, so the block check still needs to happen
 * before fanning out the bell.
 */
export interface DmNotificationSuppressionInputs {
  peerBlockedSender: boolean;
  /**
   * Per-conversation "notifications-only" mute (Task #22). The
   * message itself is still delivered; only the bell/push is silenced.
   */
  peerSilencedNotifications: boolean;
}

export function shouldNotifyDmRecipient(
  inputs: DmNotificationSuppressionInputs,
): boolean {
  if (inputs.peerBlockedSender) return false;
  if (inputs.peerSilencedNotifications) return false;
  return true;
}

/**
 * Task #23: HTTP-side dispatch helper. The HTTP DM route already
 * short-circuits on a hard block (returns 403 long before this
 * function is reached), so the only suppression gate left is the
 * per-conversation notification-mute (Task #22). Centralizing this
 * lets the smoke suite invoke the exact runtime path with a stub
 * `send`, instead of relying on a regex over the route source.
 */
export interface DispatchHttpDmNotificationArgs {
  recipientSilencedNotifications: boolean;
  receiverId: string;
  senderId: string;
  senderDisplayName: string;
  messageType: string;
  sanitizedContent: string;
  messageId: string;
}

export type SendNotificationFn = (
  receiverId: string,
  payload: DmNotificationPayload,
) => Promise<unknown> | unknown;

export function dispatchHttpDmNotification(
  args: DispatchHttpDmNotificationArgs,
  send: SendNotificationFn,
): { sent: boolean; payload?: DmNotificationPayload } {
  if (args.recipientSilencedNotifications) {
    return { sent: false };
  }
  const payload = buildDmNotificationPayload({
    senderId: args.senderId,
    senderDisplayName: args.senderDisplayName,
    messageType: args.messageType,
    content: args.sanitizedContent,
    messageId: args.messageId,
  });
  void Promise.resolve(send(args.receiverId, payload)).catch(() => {
    // Notification failures must not break the REST send flow.
  });
  return { sent: true, payload };
}
