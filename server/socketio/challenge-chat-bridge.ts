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
  ChatViewerSummary,
} from "../../shared/socketio-events";
import { MAX_VIEWER_LIST_PAYLOAD_SIZE } from "../../shared/socketio-events";
import { inArray } from "drizzle-orm";

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

/**
 * Task #75: pure dedup + cap helper used by `broadcastChallengeViewerList`.
 * Filters out viewers blocked by the recipient (or who have blocked the
 * recipient — we hide the relationship symmetrically) and caps the result
 * at `MAX_VIEWER_LIST_PAYLOAD_SIZE`. The recipient is intentionally left in
 * the list so a spectator sees themselves in their own popover, which
 * matches the legacy "you are watching" affordance on the spectator panel.
 *
 * Exported for unit testing only — production callers should use
 * `broadcastChallengeViewerList`.
 */
export function pickViewerListForRecipient(
  viewers: ChatViewerSummary[],
  opts: {
    recipientBlockedUserIds: readonly string[];
    /** Set of viewer IDs that have themselves blocked the recipient. */
    blockingRecipientUserIds?: readonly string[];
    max?: number;
  },
): ChatViewerSummary[] {
  const recipientBlocks = new Set(opts.recipientBlockedUserIds);
  const reverseBlocks = new Set(opts.blockingRecipientUserIds ?? []);
  const cap = opts.max ?? MAX_VIEWER_LIST_PAYLOAD_SIZE;
  const out: ChatViewerSummary[] = [];
  const seen = new Set<string>();
  for (const v of viewers) {
    if (out.length >= cap) break;
    if (!v.userId || !v.username) continue;
    if (seen.has(v.userId)) continue;
    if (recipientBlocks.has(v.userId)) continue;
    if (reverseBlocks.has(v.userId)) continue;
    seen.add(v.userId);
    out.push(v);
  }
  return out;
}

interface SpectatorSocketSnapshot {
  userId: string;
  spectator: boolean;
}

/**
 * Task #75: companion to `broadcastChallengeViewerCount` that emits a
 * `chat:viewer_list` PER RECIPIENT so each socket only sees viewer
 * identities it is allowed to see (bidirectional block-list filtered).
 *
 * Privacy contract — fail CLOSED: if any block-list resolution throws
 * we cannot guarantee the visibility check, so the recipient receives
 * an empty `viewers` array (the public `totalCount` is still emitted
 * so the count badge stays correct). We never fall back to an
 * unfiltered room-wide identity list, because the spectator panel
 * already exposes those identities only with the same privacy gate.
 *
 * Performance: block lists for the union of recipients ∪ viewers are
 * fetched once via `Promise.all`, so cost is O(R + V) cache hits per
 * broadcast instead of O(R × V), and there is no per-recipient async
 * fan-out window where later join/leave broadcasts can interleave.
 *
 * Idempotent and best-effort overall — viewer_list is a presence
 * affordance, never a gating signal, so the outer try/catch swallows
 * unexpected errors without disturbing the chat pipeline.
 */
export async function broadcastChallengeViewerList(
  chatNs: ChatNamespace,
  roomId: string,
): Promise<void> {
  if (!roomId.startsWith("challenge:")) return;
  try {
    const sockets = await chatNs.in(roomId).fetchSockets();

    // Snapshot socket -> {userId, isSpectator} so we can compute spectator
    // identities AND iterate recipients in a single pass.
    const snapshots: SpectatorSocketSnapshot[] = [];
    const spectatorIds = new Set<string>();
    for (const s of sockets) {
      const data = s.data as
        | (AuthedSocketData & { spectatorRoomIds?: string[] })
        | undefined;
      const userId = data?.userId;
      if (!userId) continue;
      const isSpectator = !!data?.spectatorRoomIds?.includes(roomId);
      snapshots.push({ userId, spectator: isSpectator });
      if (isSpectator) spectatorIds.add(userId);
    }

    const totalCount = spectatorIds.size > 0
      ? Array.from(spectatorIds).reduce((acc, id) => {
          // Count by SOCKET, not by user — matches the chat:viewer_count
          // semantics where each spectator socket consumes one slot.
          let n = 0;
          for (const snap of snapshots) {
            if (snap.spectator && snap.userId === id) n++;
          }
          return acc + n;
        }, 0)
      : 0;

    if (spectatorIds.size === 0) {
      // No viewers — clear any stale lists on every recipient.
      chatNs.to(roomId).emit("chat:viewer_list", {
        roomId,
        viewers: [],
        totalCount: 0,
      });
      return;
    }

    // ---- Resolve viewer summaries (capped) ----
    const idsToFetch = Array.from(spectatorIds).slice(
      0,
      MAX_VIEWER_LIST_PAYLOAD_SIZE * 2, // small over-fetch buffer for filtering
    );
    let userRows: Array<{
      id: string;
      username: string | null;
      profilePicture: string | null;
    }> = [];
    try {
      userRows = await db
        .select({
          id: users.id,
          username: users.username,
          profilePicture: users.profilePicture,
        })
        .from(users)
        .where(inArray(users.id, idsToFetch));
    } catch {
      // DB lookup failure → degrade to count-only; do not block.
      return;
    }

    const summaries: ChatViewerSummary[] = userRows
      .map((u) => ({
        userId: u.id,
        username: u.username || u.id.slice(0, 8),
        avatarUrl: u.profilePicture,
      }))
      // Stable order (alphabetical by username) so the avatar stack
      // doesn't shuffle on every join/leave broadcast.
      .sort((a, b) => a.username.localeCompare(b.username));

    // ---- Snapshot all relevant block lists ONCE per broadcast ----
    // Without this we end up doing recipients × viewers cache lookups
    // and the per-recipient async fan-out can interleave with later
    // join/leave broadcasts, causing stale lists to land out of order.
    // Precomputing fixes both the N×M cost and the race window.
    const fetchBlockList = async (id: string): Promise<readonly string[]> => {
      const lists = await getCachedUserBlockLists(id, async (uid) => {
        const u = await storage.getUser(uid);
        return u
          ? {
              blockedUsers: u.blockedUsers || [],
              mutedUsers: u.mutedUsers || [],
            }
          : null;
      });
      return lists.blockedUsers || [];
    };

    const recipientIds = Array.from(
      new Set(
        sockets
          .map((s) => (s.data as AuthedSocketData | undefined)?.userId)
          .filter((x): x is string => !!x),
      ),
    );
    const viewerIds = summaries.map((v) => v.userId);
    const allIds = Array.from(new Set([...recipientIds, ...viewerIds]));

    const blockListByUser = new Map<string, readonly string[]>();
    let blockListsResolved = true;
    await Promise.all(
      allIds.map(async (id) => {
        try {
          blockListByUser.set(id, await fetchBlockList(id));
        } catch {
          // A single failure means we cannot guarantee the privacy
          // contract for this user's relationships → flip the flag
          // so we fail CLOSED instead of leaking unfiltered identities.
          blockListsResolved = false;
        }
      }),
    );

    // ---- Per-recipient emit with precomputed block-list filtering ----
    for (const s of sockets) {
      const recipientId = (s.data as AuthedSocketData | undefined)?.userId;
      if (!recipientId) continue;

      // Fail-closed: when block-list resolution had ANY error, send an
      // empty list rather than risk leaking a viewer that this recipient
      // (or that viewer) has blocked. The count is still authoritative
      // and matches what chat:viewer_count broadcasts publicly.
      if (!blockListsResolved) {
        s.emit("chat:viewer_list", {
          roomId,
          viewers: [],
          totalCount,
        });
        continue;
      }

      const recipientBlocked = blockListByUser.get(recipientId) ?? [];
      // Reverse direction: viewers who have blocked THIS recipient.
      const blockingRecipient = viewerIds.filter((vid) =>
        (blockListByUser.get(vid) ?? []).includes(recipientId),
      );

      const visibleViewers = pickViewerListForRecipient(summaries, {
        recipientBlockedUserIds: recipientBlocked,
        blockingRecipientUserIds: blockingRecipient,
      });
      s.emit("chat:viewer_list", {
        roomId,
        viewers: visibleViewers,
        totalCount,
      });
    }
  } catch {
    // intentionally swallow — viewer list is non-critical
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
