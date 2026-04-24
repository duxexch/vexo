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
import {
  buildRoomChatBroadcast,
  shouldDeliverRoomChatToRecipient,
} from "../lib/room-chat-payload";
import type {
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

/**
 * Task #26: count spectator sockets currently in `roomId` and broadcast
 * the live total to everyone in the room as `chat:viewer_count`. Players
 * are excluded — only sockets whose `spectatorRoomIds` mirror includes
 * the room contribute (so a player tab joined from the same user does
 * not inflate the count). The mirror is the same array the spectator
 * cap check uses, so this stays consistent with the per-room role
 * stamped at `chat:join` time and survives the Redis adapter round
 * trip across cluster nodes (Maps do not).
 *
 * Idempotent and safe to call from any handler that may have changed
 * the spectator set (chat:join / chat:leave / disconnecting). Failures
 * are logged but never thrown — viewer count is purely informational
 * and must not block message delivery or join handling.
 */
export async function broadcastChallengeViewerCount(
  chatNs: ChatNamespace,
  roomId: string,
): Promise<void> {
  if (!roomId.startsWith("challenge:")) return;
  try {
    const sockets = await chatNs.in(roomId).fetchSockets();
    let count = 0;
    for (const s of sockets) {
      const data = s.data as
        | (AuthedSocketData & { spectatorRoomIds?: string[] })
        | undefined;
      if (data?.spectatorRoomIds?.includes(roomId)) count++;
    }
    chatNs.to(roomId).emit("chat:viewer_count", { roomId, count });
  } catch {
    // intentionally swallow — viewer count is non-critical
  }
}

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
 * Test-only seam (Task #30). Lets `scripts/smoke-room-notifications.ts`
 * call this entry point with stubbed deps so it can verify per-recipient
 * suppression + payload assembly across a multi-socket room without
 * booting Express, the real DB, Redis, or push services. Production
 * never sets this — every field has a real-import default.
 */
type ChallengeSessionLookupResult = { id: string } | undefined;
type SenderLookupResult =
  | { id: string; username: string | null; avatarUrl?: string | null }
  | undefined;

export interface ChallengeChatDeps {
  fetchChallengeSession: (challengeId: string) => Promise<ChallengeSessionLookupResult>;
  fetchSender: (senderId: string) => Promise<SenderLookupResult>;
  insertChallengeChatMessage: (row: {
    sessionId: string;
    senderId: string;
    message: string;
    isQuickMessage: boolean;
    quickMessageKey?: string;
    isSpectator: boolean;
  }) => Promise<{ id: string; createdAt: Date | null }>;
  getCachedUserBlockLists: typeof getCachedUserBlockLists;
  getUser: typeof storage.getUser;
}

const defaultDeps: ChallengeChatDeps = {
  fetchChallengeSession: async (challengeId) => {
    const [session] = await db
      .select({ id: challengeGameSessions.id })
      .from(challengeGameSessions)
      .where(eq(challengeGameSessions.challengeId, challengeId))
      .limit(1);
    return session;
  },
  fetchSender: async (senderId) => {
    const [sender] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.profilePicture,
      })
      .from(users)
      .where(eq(users.id, senderId));
    return sender;
  },
  insertChallengeChatMessage: async (row) => {
    const [saved] = await db
      .insert(challengeChatMessages)
      .values(row)
      .returning();
    return { id: saved.id, createdAt: saved.createdAt };
  },
  getCachedUserBlockLists,
  getUser: storage.getUser.bind(storage),
};

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
  deps: ChallengeChatDeps = defaultDeps,
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

  const session = await deps.fetchChallengeSession(challengeId);
  if (!session) return { ok: false, reason: "no_session" };

  const sender = await deps.fetchSender(senderId);
  const senderUsername = sender?.username || senderUsernameFallback;

  const safeQuickKey = quickMessageKey
    ? String(quickMessageKey).slice(0, 50)
    : undefined;

  const savedMessage = await deps.insertChallengeChatMessage({
    sessionId: session.id,
    senderId,
    message: finalText,
    isQuickMessage: isQuickMessage || false,
    quickMessageKey: safeQuickKey,
    isSpectator,
  });

  const ts = savedMessage.createdAt
    ? new Date(savedMessage.createdAt).getTime()
    : Date.now();

  // ---- Sender block list (cached) ----
  const { blockedUsers: senderBlocked } = await deps.getCachedUserBlockLists(
    senderId,
    async (id) => {
      const u = await deps.getUser(id);
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
    recipientIds.add(rid);
  }

  // Pre-fetch every distinct recipient's lists in parallel so the
  // suppression rule (in `room-chat-payload.ts`) can be applied
  // synchronously per socket below.
  const recipientLists = new Map<
    string,
    { blockedUsers: readonly string[]; mutedUsers: readonly string[] }
  >();
  await Promise.all(
    Array.from(recipientIds).map(async (rid) => {
      const c = await deps.getCachedUserBlockLists(rid, async (id) => {
        const u = await deps.getUser(id);
        return u
          ? {
              blockedUsers: u.blockedUsers || [],
              mutedUsers: u.mutedUsers || [],
            }
          : null;
      });
      recipientLists.set(rid, {
        blockedUsers: c.blockedUsers || [],
        mutedUsers: c.mutedUsers || [],
      });
    }),
  );

  // ---- Realtime IO emit (per-socket so we can apply filtering via
  //      the shared suppression helper). Task #30: every recipient
  //      goes through `shouldDeliverRoomChatToRecipient` so the rule
  //      is identical to whatever future transport (HTTP fallback,
  //      push) routes through here.
  const broadcast = buildRoomChatBroadcast({
    roomId,
    senderId,
    senderUsername,
    text: finalText,
    ts,
    clientMsgId,
    isSpectator,
    isQuickMessage,
    quickMessageKey: safeQuickKey,
    wasFiltered: !filterResult.isClean,
  });

  for (const s of ioSockets) {
    const rid = s.data?.userId;
    if (!rid) continue;
    const lists = recipientLists.get(rid) ?? {
      blockedUsers: [],
      mutedUsers: [],
    };
    if (
      !shouldDeliverRoomChatToRecipient({
        recipientId: rid,
        senderId,
        senderBlockedUsers: senderBlocked,
        recipientBlockedUsers: lists.blockedUsers,
        recipientMutedUsers: lists.mutedUsers,
      })
    ) {
      continue;
    }
    s.emit("chat:message", broadcast);
  }

  return { ok: true };
}
