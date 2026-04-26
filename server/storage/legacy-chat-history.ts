/**
 * Legacy chat-history pagination shared between the HTTP fallback
 * route (`GET /api/chat/:userId/messages`) and the legacy WebSocket
 * `chat_history` event handler.
 *
 * Task #28 fixed the realtime DM history endpoint
 * (`GET /api/dm/:peerId/history`) so the client never has to guess
 * "is this the start of the conversation?" from the row count of the
 * last page. Task #80 brings the same definitive `hasMore` flag to
 * the legacy paths so a stale client (mobile cache, fallback when
 * the WS bridge is down) gets identical end-of-history behaviour.
 *
 * The trick is identical to `getDirectMessageHistory`: ask the DB
 * for `limit + 1` rows, return at most `limit`, and report
 * `hasMore = true` iff the extra "sentinel" row came back. One row
 * cheaper than a separate "is anything older?" probe and accurate
 * regardless of whether the page is exactly full.
 *
 * Two filter modes are offered. Both production callers
 * (`GET /api/chat/:userId/messages` after Task #116, and the WS
 * `chat_history` handler) now opt into `applyDeletionFilters: true`;
 * the `false` mode is kept only as the unfiltered default for
 * non-production probes and historical-behaviour tests:
 *
 *   - The HTTP route `/api/chat/:userId/messages` historically
 *     returned every row (no soft-delete filtering), which let the
 *     fallback / sync surfaces that still call it resurrect deleted
 *     messages on refresh. Task #116 flipped it to
 *     `applyDeletionFilters: true` so it matches the realtime DM
 *     endpoint and the WS handler.
 *
 *   - The WS `chat_history` handler historically filtered globally-
 *     deleted rows (`deleted_at IS NULL`) at the SQL layer and
 *     per-user "delete for me" rows in JavaScript *after* the SQL
 *     limit/offset fetch. The post-fetch JS trim breaks the
 *     over-fetch math (a filtered row inside the over-fetch window
 *     can fool `hasMore`), so we push that filter into SQL alongside
 *     the existing one.
 *
 *     This is an intentional behaviour correction, not a pure
 *     refactor: the same `(limit, offset)` request now returns a
 *     *full* page of visible rows even when several rows in the
 *     pre-Task-#80 SQL window happened to be "deleted for me" and
 *     would have been silently trimmed (yielding a short page). The
 *     visible-row union across all pages is unchanged — no row
 *     becomes newly visible or hidden — but each individual page is
 *     no longer artificially short. The `applyDeletionFilters=true`
 *     boundary tests in `__tests__/legacy-chat-history.test.ts` lock
 *     this corrected page-composition contract.
 */

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { chatMessages } from "../../shared/schema";

export interface LegacyChatHistoryArgs {
  /** Authenticated viewer (one side of the conversation). */
  userId: string;
  /** The other participant of the conversation. */
  peerId: string;
  /** Page size; clamped to [1, 200]. */
  limit?: number;
  /** Offset into the DESC-by-createdAt timeline; clamped to >= 0. */
  offset?: number;
  /**
   * When true, hide rows that are globally tombstoned
   * (`deleted_at IS NOT NULL`) or marked "deleted for me" by the
   * viewer (`deleted_for_users` contains `userId`). Matches the WS
   * `chat_history` handler's pre-Task #80 behaviour but moves both
   * filters into SQL so over-fetch math stays accurate.
   *
   * Defaults to `false`. Both production callers
   * (`GET /api/chat/:userId/messages` after Task #116, and the WS
   * `chat_history` handler) opt in to `true`; the `false` default
   * is retained only so historical-behaviour probes / tests can
   * still ask for the unfiltered set.
   */
  applyDeletionFilters?: boolean;
}

export interface LegacyChatHistoryRow {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  encryptedContent: string | null;
  senderPublicKey: string | null;
  nonce: string | null;
  isEncrypted: boolean;
  messageType: string;
  attachmentUrl: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  mediaSize: number | null;
  mediaMimeType: string | null;
  mediaOriginalName: string | null;
  isRead: boolean;
  readAt: Date | null;
  isDisappearing: boolean;
  disappearAfterRead: boolean;
  autoDeleteAt: Date | null;
  deletedAt: Date | null;
  replyToId: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  reactions: Record<string, string[]> | null;
  deletedForUsers: string[] | null;
  createdAt: Date | null;
}

export interface LegacyChatHistoryPage {
  /** Page rows in ASC chronological order (oldest → newest). */
  messages: LegacyChatHistoryRow[];
  /**
   * Definitive end-of-history flag (Task #80). `true` iff at least
   * one row exists strictly older than `messages[0]` once filters
   * are applied; `false` means this page reached the start of the
   * conversation (or the conversation is empty).
   */
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function getLegacyChatHistoryPage(
  args: LegacyChatHistoryArgs,
): Promise<LegacyChatHistoryPage> {
  const limit = Math.min(
    Math.max(args.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(args.offset ?? 0, 0);

  const conversation = or(
    and(
      eq(chatMessages.senderId, args.userId),
      eq(chatMessages.receiverId, args.peerId),
    ),
    and(
      eq(chatMessages.senderId, args.peerId),
      eq(chatMessages.receiverId, args.userId),
    ),
  );

  const where = args.applyDeletionFilters
    ? and(
        conversation,
        isNull(chatMessages.deletedAt),
        // `deleted_for_users` is a text[] of viewer ids that asked
        // to "delete for me". Hide the row when the array contains
        // the current viewer. COALESCE handles legacy NULLs.
        sql`NOT (COALESCE(${chatMessages.deletedForUsers}, ARRAY[]::text[]) @> ARRAY[${args.userId}]::text[])`,
      )
    : conversation;

  // Over-fetch by one to detect "anything older?" without a probe.
  const rows = await db
    .select()
    .from(chatMessages)
    .where(where)
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: page.reverse() as LegacyChatHistoryRow[],
    hasMore,
  };
}
