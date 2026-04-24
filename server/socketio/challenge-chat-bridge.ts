import type { Namespace } from "socket.io";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  challengeGameSessions,
  challengeChatMessages,
} from "../../shared/schema";
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

export interface DeliverResult {
  ok: boolean;
  /**
   * Machine-readable reason when ok=false. Constrained to the centralized
   * `ChatErrorCode` union via `Extract<>` so adding a new bridge failure
   * mode requires extending the shared union first.
   */
  reason?: Extract<ChatErrorCode, "no_session" | "empty">;
}

interface DeliverArgs {
  challengeId: string;
  roomId: string;
  senderId: string;
  /** Username from the socket's auth payload — used if the DB lookup fails. */
  senderUsernameFallback: string;
  text: string;
  isQuickMessage: boolean;
  quickMessageKey?: string;
  isSpectator: boolean;
  clientMsgId?: string;
  chatNs: ChatNamespace;
}

/**
 * Full feature-parity replacement for the legacy `handleChallengeChat` path
 * when the message originates on the realtime Socket.IO `/chat` channel.
 *
 * Responsibilities (mirrors server/websocket/challenge-games/chat-gifts.ts):
 *   1. Sanitize + word-filter the text.
 *   2. Persist into `challenge_chat_messages` so history endpoints see it.
 *   3. Resolve sender + per-recipient block/mute lists.
 *   4. Emit `chat:message` to every IO socket in the room — sender always
 *      gets an echo, recipients filtered by block/mute.
 *
 * Task #9: this is the SOLE outbound chat path for challenge rooms. The
 * legacy WS `challenge_chat` handler has been removed; clients receive
 * via the IO `chat:message` event only.
 */
export async function deliverRealtimeChallengeChat(
  args: DeliverArgs,
): Promise<DeliverResult> {
  const {
    challengeId,
    roomId,
    senderId,
    senderUsernameFallback,
    isQuickMessage,
    quickMessageKey,
    isSpectator,
    clientMsgId,
    chatNs,
  } = args;

  const safeMessage = sanitizePlainText(args.text, { maxLength: 500 });
  if (!safeMessage.trim()) return { ok: false, reason: "empty" };

  const filterResult = filterMessage(safeMessage);
  const finalText = filterResult.filteredMessage;

  const [session] = await db
    .select({ id: challengeGameSessions.id })
    .from(challengeGameSessions)
    .where(eq(challengeGameSessions.challengeId, challengeId))
    .limit(1);
  if (!session) return { ok: false, reason: "no_session" };

  const [sender] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.profilePicture,
    })
    .from(users)
    .where(eq(users.id, senderId));
  const senderUsername = sender?.username || senderUsernameFallback;

  const safeQuickKey = quickMessageKey
    ? String(quickMessageKey).slice(0, 50)
    : undefined;

  const [savedMessage] = await db
    .insert(challengeChatMessages)
    .values({
      sessionId: session.id,
      senderId,
      message: finalText,
      isQuickMessage: isQuickMessage || false,
      quickMessageKey: safeQuickKey,
      isSpectator,
    })
    .returning();

  const ts = savedMessage.createdAt
    ? new Date(savedMessage.createdAt).getTime()
    : Date.now();

  // ---- Sender block list (cached) ----
  const { blockedUsers: senderBlocked } = await getCachedUserBlockLists(
    senderId,
    async (id) => {
      const u = await storage.getUser(id);
      return u
        ? {
            blockedUsers: u.blockedUsers || [],
            mutedUsers: u.mutedUsers || [],
          }
        : null;
    },
  );

  // ---- Collect IO recipients ----
  const ioSockets = await chatNs.in(roomId).fetchSockets();

  // ---- Per-recipient block/mute resolution ----
  const recipientIds = new Set<string>();
  for (const s of ioSockets) {
    const rid = s.data?.userId;
    if (!rid || rid === senderId) continue;
    if (senderBlocked.includes(rid)) continue;
    recipientIds.add(rid);
  }

  const checks =
    recipientIds.size === 0
      ? []
      : await Promise.all(
          Array.from(recipientIds).map(async (rid) => {
            const c = await getCachedUserBlockLists(rid, async (id) => {
              const u = await storage.getUser(id);
              return u
                ? {
                    blockedUsers: u.blockedUsers || [],
                    mutedUsers: u.mutedUsers || [],
                  }
                : null;
            });
            return {
              rid,
              blocked:
                c.blockedUsers?.includes(senderId) ||
                c.mutedUsers?.includes(senderId),
            };
          }),
        );
  const blockedRecipients = new Set(
    checks.filter((c) => c.blocked).map((c) => c.rid),
  );

  // ---- Realtime IO emit (per-socket so we can apply filtering) ----
  const broadcast: ChatBroadcast = {
    roomId,
    fromUserId: senderId,
    fromUsername: senderUsername,
    text: finalText,
    ts,
    clientMsgId,
    isSpectator,
    isQuickMessage: isQuickMessage || undefined,
    quickMessageKey: safeQuickKey,
    wasFiltered: !filterResult.isClean || undefined,
  };

  for (const s of ioSockets) {
    const rid = s.data?.userId;
    if (!rid) continue;
    if (rid !== senderId) {
      // sender always gets the echo; everyone else is filtered
      if (senderBlocked.includes(rid)) continue;
      if (blockedRecipients.has(rid)) continue;
    }
    s.emit("chat:message", broadcast);
  }

  return { ok: true };
}
