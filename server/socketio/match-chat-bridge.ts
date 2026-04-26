import type { Namespace } from "socket.io";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  gameMatches,
  gameplayMessages,
  gameplayEmojis,
} from "../../shared/schema";
import { storage } from "../storage";
import { filterMessage } from "../lib/word-filter";
import { sanitizePlainText } from "../lib/input-security";
import { getCachedUserBlockLists } from "../lib/redis";
import {
  buildRoomChatBroadcast,
  shouldDeliverRoomChatToRecipient,
} from "../lib/room-chat-payload";
import { logger } from "../lib/logger";
import type {
  ChatBroadcast,
  ChatClientToServerEvents,
  ChatServerToClientEvents,
} from "../../shared/socketio-events";

interface AuthedSocketData {
  userId: string;
  username: string;
}

export type MatchChatNamespace = Namespace<
  ChatClientToServerEvents,
  ChatServerToClientEvents,
  Record<string, never>,
  AuthedSocketData
>;

/**
 * Task #139: realtime delivery for casual `match:` rooms.
 *
 * Mirrors `deliverRealtimeChallengeChat` (challenge-chat-bridge.ts) but
 * persists into `gameplay_messages` (the table the legacy
 * `/api/gameplay/messages` REST endpoint already used) instead of
 * `challenge_chat_messages`. That keeps `GET /api/gameplay/messages/:matchId`
 * — still the source of truth for chat history — working unchanged for
 * page-reload / first-render history hydration.
 *
 * Pipeline (identical to the challenge bridge):
 *   1. Sanitize + word-filter the text.
 *   2. Persist into `gameplay_messages` so history endpoints see it.
 *   3. Resolve sender + per-recipient block/mute lists.
 *   4. Emit `chat:message` to every IO socket in the room — sender always
 *      gets an echo, recipients filtered by block/mute.
 *
 * Casual matches have no spectator concept (only player1Id / player2Id
 * exist on `game_matches`), so `isSpectator` is always false here and
 * the spectator-readonly gate does not apply — the chat:send handler in
 * `server/socketio/index.ts` already routes spectators away from this
 * branch by the time we get here.
 */
export interface DeliverMatchChatArgs {
  matchId: string;
  roomId: string;
  senderId: string;
  senderUsernameFallback?: string;
  text: string;
  clientMsgId?: string;
  isQuickMessage?: boolean;
  quickMessageKey?: string;
  chatNs: MatchChatNamespace;
}

export type DeliverMatchChatResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "no_match" | "server" };

export async function deliverRealtimeMatchChat(
  args: DeliverMatchChatArgs,
): Promise<DeliverMatchChatResult> {
  const {
    matchId,
    roomId,
    senderId,
    senderUsernameFallback,
    text,
    clientMsgId,
    isQuickMessage,
    quickMessageKey,
    chatNs,
  } = args;

  const safeMessage = sanitizePlainText(text, { maxLength: 500 });
  if (!safeMessage.trim()) return { ok: false, reason: "empty" };

  const filterResult = filterMessage(safeMessage);
  const finalText = filterResult.filteredMessage;

  // Match must still exist. The chat:join authz already checked this on
  // join, but the row could be deleted mid-match (e.g. admin cleanup);
  // failing closed here keeps the persisted-message FK from blowing up.
  const [match] = await db
    .select({ id: gameMatches.id })
    .from(gameMatches)
    .where(eq(gameMatches.id, matchId))
    .limit(1);
  if (!match) return { ok: false, reason: "no_match" };

  const safeQuickKey = quickMessageKey
    ? String(quickMessageKey).slice(0, 50)
    : undefined;

  let saved: { id: string; createdAt: Date | null };
  try {
    const [row] = await db
      .insert(gameplayMessages)
      .values({
        matchId,
        senderId,
        message: finalText,
        emojiId: null,
        isEmoji: false,
        emojiCost: null,
      })
      .returning({ id: gameplayMessages.id, createdAt: gameplayMessages.createdAt });
    saved = row;
  } catch (err) {
    logger.warn?.(
      `[match-chat-bridge] insert gameplayMessages failed: ${(err as Error).message}`,
    );
    return { ok: false, reason: "server" };
  }

  const ts = saved.createdAt ? new Date(saved.createdAt).getTime() : Date.now();

  const [sender] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, senderId));
  const senderUsername = sender?.username || senderUsernameFallback || "";

  // Per-recipient block/mute filtering (same shared helper the challenge
  // bridge uses, so the rule is identical across transports).
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

  const ioSockets = await chatNs.in(roomId).fetchSockets();

  const recipientIds = new Set<string>();
  for (const s of ioSockets) {
    const rid = s.data?.userId;
    if (!rid || rid === senderId) continue;
    recipientIds.add(rid);
  }

  const recipientLists = new Map<
    string,
    { blockedUsers: readonly string[]; mutedUsers: readonly string[] }
  >();
  await Promise.all(
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
      recipientLists.set(rid, {
        blockedUsers: c.blockedUsers || [],
        mutedUsers: c.mutedUsers || [],
      });
    }),
  );

  const broadcast = buildRoomChatBroadcast({
    roomId,
    senderId,
    senderUsername,
    text: finalText,
    ts,
    clientMsgId,
    isSpectator: false,
    isQuickMessage: Boolean(isQuickMessage),
    quickMessageKey: safeQuickKey,
    wasFiltered: !filterResult.isClean,
  });
  // Task #139 (architect follow-up): stamp the persisted DB id onto
  // the broadcast so the casual-match client can dedupe a realtime
  // bubble against the same `gameplay_messages` row that its
  // reconnect-catch-up history refetch will return. Without this the
  // realtime path keys on `clientMsgId`/fallback while history keys
  // on the row id, and a brief socket disconnect → refetch would
  // double-render the bubble.
  broadcast.messageId = saved.id;

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

/**
 * Task #139: emoji-send REST endpoint still owns the balance debit (it
 * runs in a row-locked transaction). To keep peers from missing those
 * messages now that the 2s polling is gone, the REST handler calls into
 * this helper after a successful insert to fan out a `chat:message`
 * broadcast carrying the emoji metadata via `gameplayEmoji`.
 *
 * Mirrors the same per-recipient block/mute filtering as the text
 * bridge above so a blocked peer never sees the broadcast even if the
 * REST insert succeeded for the sender.
 */
export interface BroadcastMatchEmojiArgs {
  matchId: string;
  senderId: string;
  emojiId: string;
  messageId: string;
  /** ms-since-epoch — should be the persisted-message createdAt. */
  ts: number;
}

export async function broadcastMatchEmoji(
  args: BroadcastMatchEmojiArgs,
  chatNs: MatchChatNamespace,
): Promise<void> {
  const { matchId, senderId, emojiId, messageId, ts } = args;
  const roomId = `match:${matchId}`;

  const [sender] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, senderId));
  const senderUsername = sender?.username || "";

  const [emoji] = await db
    .select({
      id: gameplayEmojis.id,
      emoji: gameplayEmojis.emoji,
      price: gameplayEmojis.price,
    })
    .from(gameplayEmojis)
    .where(eq(gameplayEmojis.id, emojiId));
  if (!emoji) return;

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

  const ioSockets = await chatNs.in(roomId).fetchSockets();

  const recipientLists = new Map<
    string,
    { blockedUsers: readonly string[]; mutedUsers: readonly string[] }
  >();
  await Promise.all(
    ioSockets
      .map((s) => s.data?.userId)
      .filter((id): id is string => Boolean(id) && id !== senderId)
      .map(async (rid) => {
        const c = await getCachedUserBlockLists(rid, async (id) => {
          const u = await storage.getUser(id);
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

  const broadcast: ChatBroadcast = {
    roomId,
    fromUserId: senderId,
    fromUsername: senderUsername,
    text: "",
    ts,
    clientMsgId: messageId,
    isSpectator: false,
    gameplayEmoji: {
      messageId,
      emojiId: emoji.id,
      emoji: emoji.emoji,
      price: emoji.price,
    },
  };

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
}
