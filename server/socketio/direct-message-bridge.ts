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

  return { ok: true };
}
