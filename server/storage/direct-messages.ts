/**
 * Direct-message persistence + history queries used by the realtime
 * Socket.IO `/chat` DM channel (Task #16).
 *
 * Reuses the existing `chat_messages` table — the same one used by the
 * legacy HTTP `/api/chat/:userId/messages` endpoint — so a single
 * conversation timeline backs both transports. We deliberately stick to
 * the plain text-message subset of that table (content / messageType
 * "text") because the realtime channel is a lightweight chat surface;
 * media, payments, E2EE, and disappearing-message handling stay in the
 * existing HTTP routes.
 */

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { chatMessages } from "../../shared/schema";

export interface CreateDirectMessageArgs {
  senderId: string;
  receiverId: string;
  content: string;
}

export interface DirectMessageRow {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  messageType: string;
  createdAt: Date | null;
}

export async function createDirectMessage(
  args: CreateDirectMessageArgs,
): Promise<DirectMessageRow> {
  const [row] = await db
    .insert(chatMessages)
    .values({
      senderId: args.senderId,
      receiverId: args.receiverId,
      content: args.content,
      messageType: "text",
    })
    .returning({
      id: chatMessages.id,
      senderId: chatMessages.senderId,
      receiverId: chatMessages.receiverId,
      content: chatMessages.content,
      messageType: chatMessages.messageType,
      createdAt: chatMessages.createdAt,
    });
  return row;
}

export interface GetDirectMessageHistoryArgs {
  userId: string;
  peerId: string;
  /** Page size, clamped to [1, 200]; default 50. */
  limit?: number;
  /** When provided, only messages strictly older than this are returned. */
  before?: Date;
}

/**
 * Result of a paged history fetch. `messages` is in ascending
 * chronological order (oldest → newest) so the inbox UI can prepend
 * the page directly to its scroll buffer. `hasMore` is the definitive
 * "is anything older than this page?" flag — true means at least one
 * more row exists strictly older than `messages[0].createdAt`, false
 * means this page reached the very start of the conversation.
 */
export interface DirectMessageHistoryPage {
  messages: DirectMessageRow[];
  hasMore: boolean;
}

/**
 * Returns the most recent N text messages exchanged between `userId` and
 * `peerId`, in ascending chronological order (oldest → newest) so the
 * inbox UI can append them directly to its scroll buffer.
 *
 * To produce a definitive `hasMore` flag (Task #28 — fixes the case
 * where the last page is exactly `limit` rows but really *is* the
 * start of history), we over-fetch by one: ask the DB for `limit + 1`
 * rows, return `limit` of them, and report `hasMore = true` iff that
 * extra row existed. This is one extra row read per scroll-back —
 * cheaper than a separate "is anything older?" probe round-trip and
 * always accurate, regardless of whether the page came back full.
 */
export async function getDirectMessageHistory(
  args: GetDirectMessageHistoryArgs,
): Promise<DirectMessageHistoryPage> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  // Constrain to the realtime text-only projection. The shared
  // `chat_messages` table also stores media / voice / payment-attached
  // variants written by the legacy HTTP path; the realtime DM inbox
  // scrolls plain text only and treats anything else as out-of-band.
  const conversation = and(
    eq(chatMessages.messageType, "text"),
    // Hide messages soft-deleted globally OR per-user. The
    // `deleted_for_users` array tracks "delete for me" recipients;
    // `deleted_at` is the global hard-delete tombstone used by
    // disappearing/auto-delete sweeps.
    isNull(chatMessages.deletedAt),
    sql`NOT (COALESCE(${chatMessages.deletedForUsers}, ARRAY[]::text[]) @> ARRAY[${args.userId}]::text[])`,
    or(
      and(
        eq(chatMessages.senderId, args.userId),
        eq(chatMessages.receiverId, args.peerId),
      ),
      and(
        eq(chatMessages.senderId, args.peerId),
        eq(chatMessages.receiverId, args.userId),
      ),
    ),
  );

  const where = args.before
    ? and(conversation, lt(chatMessages.createdAt, args.before))
    : conversation;

  // Over-fetch by one to detect "anything older?" without a probe.
  const rows = await db
    .select({
      id: chatMessages.id,
      senderId: chatMessages.senderId,
      receiverId: chatMessages.receiverId,
      content: chatMessages.content,
      messageType: chatMessages.messageType,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(where)
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  // Trim the sentinel row (if any) before returning. The remaining
  // rows are still in DESC order from the query, so reverse for ASC.
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { messages: page.reverse(), hasMore };
}
