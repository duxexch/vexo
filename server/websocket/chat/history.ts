import { WebSocket } from "ws";
import { db } from "../../db";
import { chatMessages } from "@shared/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import type { AuthenticatedSocket } from "../shared";
import { clients } from "../shared";
import { getLegacyChatHistoryPage } from "../../storage/legacy-chat-history";

/**
 * Handle paginated chat history retrieval over the legacy WebSocket
 * `chat_history` event.
 *
 * Task #80 — switched to the shared `getLegacyChatHistoryPage` helper
 * so this path now reports the same definitive `hasMore` flag as the
 * realtime `GET /api/dm/:peerId/history` endpoint (Task #28). The
 * old code computed `hasMore = allMessages.length === limit`, which
 * lit up "load older" even when the page happened to be exactly full
 * but really was the start of the conversation. The helper's
 * over-fetch-by-one trick makes this exact case correct.
 *
 * The pre-Task-#80 implementation also did the per-user "delete for
 * me" filtering in JavaScript *after* the SQL `limit/offset` fetch,
 * which both (a) broke `hasMore` (a filtered row inside the
 * over-fetch window could fool the math) and (b) yielded
 * artificially short pages whenever the SQL window happened to
 * include rows the viewer had hidden. The helper now pushes that
 * filter into SQL. The visible-row union across all pages is
 * unchanged — no row is newly visible or newly hidden — but each
 * individual page now reaches its requested size when enough
 * visible rows exist. The legacy storage tests
 * (`server/storage/__tests__/legacy-chat-history.test.ts`) lock
 * this corrected page-composition contract.
 */
export async function handleGetChatHistory(ws: AuthenticatedSocket, data: any): Promise<void> {
  if (!ws.userId) return;

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
