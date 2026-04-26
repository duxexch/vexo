import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages } from "@shared/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { getLegacyChatHistoryPage } from "../../storage/legacy-chat-history";
import { isLegacyChatHistoryEnabled } from "../../lib/legacy-chat-flags";

/**
 * Handle paginated chat history retrieval over the legacy WebSocket
 * `chat_history` event.
 *
 * Task #115 — every in-app surface now backfills from
 * `GET /api/dm/:peerId/history` (the realtime DM transport, Tasks
 * #16 / #20 / #28). The handler is therefore gated behind
 * `LEGACY_CHAT_HISTORY_ENABLED`: when the flag is on, behaviour is
 * unchanged from Task #80 (definitive `hasMore` via the shared
 * over-fetch-by-one helper, soft-delete filters in SQL); when the
 * flag is off, the request is rejected with a `chat_error` envelope
 * carrying the `legacy_chat_history_disabled` code so a stale client
 * knows to switch to the realtime DM endpoint instead of silently
 * timing out.
 *
 * Background on the helper-driven path that runs while the flag is
 * on (kept here for the deprecation window): the pre-Task-#80
 * implementation computed `hasMore = allMessages.length === limit`
 * and also did the per-user "delete for me" filtering in JavaScript
 * *after* the SQL `limit/offset` fetch, which both (a) broke
 * `hasMore` (a filtered row inside the over-fetch window could fool
 * the math) and (b) yielded artificially short pages whenever the
 * SQL window happened to include rows the viewer had hidden. The
 * helper pushes that filter into SQL and over-fetches by one row.
 */
export async function handleGetChatHistory(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  if (!isLegacyChatHistoryEnabled()) {
    ws.send(JSON.stringify({
      type: "chat_error",
      code: "legacy_chat_history_disabled",
      message:
        "The legacy chat_history WebSocket event has been retired. " +
        "Use GET /api/dm/:peerId/history instead.",
      // Echo the request peer id so a buggy client can correlate the
      // failure to the conversation it tried to load.
      otherUserId: typeof data?.otherUserId === "string" ? data.otherUserId : undefined,
    }));
    return;
  }

  const { otherUserId, append } = data;
  // SECURITY: Bound limit and offset to prevent excessive queries
  const limit = Math.min(Math.max(1, parseInt(data.limit) || 50), 100);
  const offset = Math.max(0, parseInt(data.offset) || 0);

  const page = await getLegacyChatHistoryPage({
    userId: ws.userId,
    peerId: otherUserId,
    limit,
    offset,
    applyDeletionFilters: true,
  });

  ws.send(JSON.stringify({
    type: "chat_history",
    data: {
      otherUserId,
      messages: page.messages,
      append: !!append,
      hasMore: page.hasMore,
      // Echo the limit so the client can keep its existing logging /
      // diagnostics shape; the value is no longer used to compute
      // hasMore on the client side.
      limit,
    },
  }));
}

/**
 * Handle marking a single message as read (with disappearing message support).
 */
export async function handleMessageRead(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { messageId } = data;

  const [updated] = await db.update(chatMessages)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(chatMessages.id, messageId),
      eq(chatMessages.receiverId, ws.userId)
    ))
    .returning();

  if (updated) {
    // If message should disappear after being read, mark it as deleted
    if (updated.disappearAfterRead) {
      await db.update(chatMessages)
        .set({ deletedAt: new Date() })
        .where(eq(chatMessages.id, messageId));
    }

    // Notify sender that message was read
    const senderSockets = clients.get(updated.senderId);
    if (senderSockets) {
      const outgoing = JSON.stringify({
        type: "message_read_receipt",
        data: { messageId, readAt: updated.readAt, disappeared: updated.disappearAfterRead }
      });
      senderSockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(outgoing);
        }
      });
    }
  }
}

/**
 * Handle marking all messages from a user as read.
 */
export async function handleMarkChatRead(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { otherUserId } = data;

  await db.update(chatMessages)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(chatMessages.senderId, otherUserId),
      eq(chatMessages.receiverId, ws.userId),
      eq(chatMessages.isRead, false)
    ));

  // Notify the other user
  const otherSockets = clients.get(otherUserId);
  if (otherSockets) {
    const outgoing = JSON.stringify({
      type: "messages_marked_read",
      data: { byUserId: ws.userId }
    });
    otherSockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(outgoing);
      }
    });
  }
}

/**
 * Handle searching messages by content.
 */
export async function handleSearchMessages(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

  const { query, otherUserId } = data;
  if (!query || typeof query !== 'string' || !otherUserId) return;

  const searchTerm = `%${String(query).slice(0, 200).replace(/%/g, '')}%`;

  const results = await db.select()
    .from(chatMessages)
    .where(
      and(
        or(
          and(eq(chatMessages.senderId, ws.userId), eq(chatMessages.receiverId, otherUserId)),
          and(eq(chatMessages.senderId, otherUserId), eq(chatMessages.receiverId, ws.userId))
        ),
        sql`${chatMessages.deletedAt} IS NULL`,
        sql`${chatMessages.content} ILIKE ${searchTerm}`
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(50);

  ws.send(JSON.stringify({ type: "search_results", data: { results: results.reverse(), query } }));
}
