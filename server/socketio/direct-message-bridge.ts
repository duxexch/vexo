/**
 * Realtime DM delivery for the Socket.IO `/chat` namespace.
 *
 * Task #16: brings DM `chat:send` to feature parity with the challenge
 * chat bridge (Task #9):
 *   1. Sanitize + word-filter the text.
 *   2. Persist into `chat_messages` so users can scroll history back
 *      after rejoining (and so the existing HTTP inbox sees realtime
 *      messages too).
 *   3. Resolve sender + recipient block/mute lists from the cached
 *      view used elsewhere on this namespace.
 *   4. Emit `chat:message` to every IO socket in the room — sender
 *      always gets the echo; the peer is filtered out if either side
 *      blocked or muted the other.
 *
 * The peer id is derived from the canonical `dm:<a>:<b>` room id
 * (chat:join already enforces the sorted form), not from client input,
 * so a sender cannot redirect a DM to a third party.
 */

import type { Namespace } from "socket.io";
import { storage } from "../storage";
import { filterMessage } from "../lib/word-filter";
import { sanitizePlainText } from "../lib/input-security";
import { getCachedUserBlockLists } from "../lib/redis";
import { sendNotification } from "../websocket/notifications";
import { logger } from "../lib/logger";
import type {
  ChatBroadcast,
  ChatClientToServerEvents,
  ChatErrorCode,
  ChatServerToClientEvents,
} from "../../shared/socketio-events";

interface AuthedSocketData {
  userId: string;
  username: string;
}

export type ChatNamespace = Namespace<
  ChatClientToServerEvents,
  ChatServerToClientEvents,
  Record<string, never>,
  AuthedSocketData
>;

export interface DeliverDirectMessageResult {
  ok: boolean;
  /**
   * Machine-readable failure reason. Constrained to the centralized
   * `ChatErrorCode` union via `Extract<>` so adding a new bridge
   * failure mode requires extending the shared union first.
   */
  reason?: Extract<ChatErrorCode, "empty" | "invalid">;
}

interface DeliverArgs {
  roomId: string;
  senderId: string;
  /** Username from the socket's auth payload — used if the DB lookup fails. */
  senderUsernameFallback: string;
  text: string;
  clientMsgId?: string;
  chatNs: ChatNamespace;
}

/**
 * Resolve the peer user id from a canonical `dm:<a>:<b>` room id given
 * the sender. Returns null if `roomId` is malformed or `senderId` is
 * not one of the two participants — both are caller bugs (chat:join
 * authz should have rejected the join long before chat:send).
 */
function resolveDmPeer(roomId: string, senderId: string): string | null {
  if (!roomId.startsWith("dm:")) return null;
  const parts = roomId.slice("dm:".length).split(":");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b) return null;
  if (senderId === a) return b;
  if (senderId === b) return a;
  return null;
}

export async function deliverRealtimeDirectMessage(
  args: DeliverArgs,
): Promise<DeliverDirectMessageResult> {
  const {
    roomId,
    senderId,
    senderUsernameFallback,
    clientMsgId,
    chatNs,
  } = args;

  const peerId = resolveDmPeer(roomId, senderId);
  if (!peerId) return { ok: false, reason: "invalid" };

  const safeMessage = sanitizePlainText(args.text, { maxLength: 500 });
  if (!safeMessage.trim()) return { ok: false, reason: "empty" };

  const filterResult = filterMessage(safeMessage);
  const finalText = filterResult.filteredMessage;

  // ---- Persist BEFORE emit so a successful delivery is recoverable
  //      from history even if the recipient socket disconnects mid-emit.
  const saved = await storage.createDirectMessage({
    senderId,
    receiverId: peerId,
    content: finalText,
  });

  const ts = saved.createdAt
    ? new Date(saved.createdAt).getTime()
    : Date.now();

  // ---- Sender username (fall back to handshake value) ----
  const senderRow = await storage.getUser(senderId);
  const senderUsername = senderRow?.username || senderUsernameFallback;

  // ---- Block/mute lists (cached) ----
  const [senderLists, peerLists] = await Promise.all([
    getCachedUserBlockLists(senderId, async (id) => {
      const u = await storage.getUser(id);
      return u
        ? {
            blockedUsers: u.blockedUsers || [],
            mutedUsers: u.mutedUsers || [],
          }
        : null;
    }),
    getCachedUserBlockLists(peerId, async (id) => {
      const u = await storage.getUser(id);
      return u
        ? {
            blockedUsers: u.blockedUsers || [],
            mutedUsers: u.mutedUsers || [],
            notificationMutedUsers: u.notificationMutedUsers || [],
          }
        : null;
    }),
  ]);

  const senderBlocksPeer =
    senderLists.blockedUsers?.includes(peerId) ||
    senderLists.mutedUsers?.includes(peerId);
  const peerBlocksSender =
    peerLists.blockedUsers?.includes(senderId) ||
    peerLists.mutedUsers?.includes(senderId);

  const broadcast: ChatBroadcast = {
    roomId,
    fromUserId: senderId,
    fromUsername: senderUsername,
    text: finalText,
    ts,
    clientMsgId,
    wasFiltered: !filterResult.isClean || undefined,
  };

  // ---- Per-socket emit so we can apply per-recipient filtering. The
  //      sender always gets the echo (so their UI confirms the send);
  //      the peer is suppressed if either side has blocked/muted the
  //      other. The message remains persisted regardless — exactly
  //      mirroring the legacy HTTP DM behavior.
  const sockets = await chatNs.in(roomId).fetchSockets();
  for (const s of sockets) {
    const rid = s.data?.userId;
    if (!rid) continue;
    if (rid === senderId) {
      s.emit("chat:message", broadcast);
      continue;
    }
    if (senderBlocksPeer || peerBlocksSender) continue;
    s.emit("chat:message", broadcast);
  }

  // ---- Task #21/#22: parity with the HTTP DM path — fan out a "new
  //      message" notification (push + bell + WS broadcast) so a
  //      recipient whose inbox tab is closed still gets a heads-up.
  //      Suppressed when:
  //        - the peer has blocked or muted the sender (Task #21), OR
  //        - the peer added the sender to their per-conversation
  //          notification mute list (Task #22) — message still
  //          arrives, only the bell/push is silenced.
  //      Failures are logged and swallowed: the message is already
  //      persisted and delivered.
  const peerSilencedNotifications =
    peerLists.notificationMutedUsers?.includes(senderId) ?? false;
  if (!peerBlocksSender && !peerSilencedNotifications) {
    void notifyDirectMessageRecipient({
      senderId,
      senderRow,
      senderUsernameFallback: senderUsername,
      receiverId: peerId,
      messageId: saved.id,
      previewText: finalText,
    }).catch((err) => {
      logger.warn?.(
        `[socket.io] DM notification failed: ${(err as Error).message}`,
      );
    });
  }

  return { ok: true };
}

interface NotifyArgs {
  senderId: string;
  senderRow:
    | {
        username?: string | null;
        firstName?: string | null;
      }
    | null
    | undefined;
  senderUsernameFallback: string;
  receiverId: string;
  messageId: string;
  previewText: string;
}

/**
 * Mirrors the notification payload produced by the legacy HTTP DM path
 * (`server/routes/chat/chat-messaging.ts`) so a recipient sees the
 * same bell entry / push title regardless of which transport the
 * sender used. Realtime DMs are text-only, so the preview is just a
 * truncated copy of the message body.
 */
async function notifyDirectMessageRecipient(args: NotifyArgs): Promise<void> {
  const senderDisplayName =
    args.senderRow?.firstName ||
    args.senderRow?.username ||
    args.senderUsernameFallback ||
    "User";

  const trimmed = args.previewText.trim();
  const preview = trimmed.length > 0 ? trimmed.slice(0, 120) : "Sent a message";
  const previewAr = trimmed.length > 0 ? trimmed.slice(0, 120) : "أرسل رسالة";

  await sendNotification(args.receiverId, {
    type: "system",
    priority: "normal",
    title: `${senderDisplayName} sent you a message`,
    titleAr: `رسالة جديدة من ${senderDisplayName}`,
    message: preview,
    messageAr: previewAr,
    link: `/chat?user=${encodeURIComponent(args.senderId)}`,
    metadata: JSON.stringify({
      event: "chat_message",
      senderId: args.senderId,
      messageType: "text",
      messageId: args.messageId,
      transport: "socketio",
    }),
  });
}
