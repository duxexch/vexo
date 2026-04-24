/**
 * Shared room-chat (challenge / game-room) broadcast + suppression
 * helpers used by every transport that fans a room chat message out.
 *
 * Today the only outbound path is the realtime Socket.IO bridge in
 * `server/socketio/challenge-chat-bridge.ts`. Centralizing the
 * broadcast assembly + per-recipient suppression rule here means:
 *
 *   1. Adding a second transport later (e.g. an HTTP fallback / push
 *      notification) automatically inherits identical payload shape
 *      and suppression semantics.
 *   2. Regressions to the suppression rule are catchable by a tiny
 *      pure-logic test instead of needing a live socket fixture.
 *
 * Task #30: this is the room-chat counterpart to
 * `server/lib/dm-notification-payload.ts`. The high-impact case is
 * fan-out: a single sender can flood (or silently disappear from) an
 * entire game lobby, so the suppression rule must be byte-for-byte
 * the same on every transport that routes through here.
 */

import type { ChatBroadcast } from "../../shared/socketio-events";

export interface RoomChatBroadcastArgs {
  roomId: string;
  senderId: string;
  senderUsername: string;
  text: string;
  /** Persisted-message timestamp (ms since epoch). */
  ts: number;
  clientMsgId?: string;
  isSpectator: boolean;
  isQuickMessage: boolean;
  quickMessageKey?: string;
  /** True when the server's word filter scrubbed the original text. */
  wasFiltered: boolean;
}

/**
 * Build the canonical `ChatBroadcast` payload that every recipient in
 * the room sees. Optional fields default to `undefined` (not `false`)
 * so the wire payload exactly matches the legacy bridge output and
 * downstream clients can keep using `?? defaults`.
 */
export function buildRoomChatBroadcast(
  args: RoomChatBroadcastArgs,
): ChatBroadcast {
  return {
    roomId: args.roomId,
    fromUserId: args.senderId,
    fromUsername: args.senderUsername,
    text: args.text,
    ts: args.ts,
    clientMsgId: args.clientMsgId,
    isSpectator: args.isSpectator,
    isQuickMessage: args.isQuickMessage || undefined,
    quickMessageKey: args.quickMessageKey,
    wasFiltered: args.wasFiltered || undefined,
  };
}

/**
 * Inputs for the per-recipient suppression rule. Keep this struct
 * narrow so the rule can be exercised against a 4-line stub without
 * wiring real storage / cache.
 *
 * Semantics (kept identical to the realtime bridge's existing
 * behavior so the refactor is a pure structural extraction):
 *   - The sender always receives their own echo (the rule is only
 *     consulted for non-sender recipients).
 *   - A "block" or "mute" on EITHER side suppresses the message.
 *     The legacy DM `mutedUsers` list is treated as a soft-block on
 *     room chat too — a regression that drops it would silently
 *     start delivering messages from blocked/muted users.
 */
export interface RoomChatRecipientCheckInputs {
  /** The recipient's id (room peer being decided). */
  recipientId: string;
  /** The sender's id (constant per delivery). */
  senderId: string;
  /** Sender's blocked-users list (NOT muted — sender mute is a UI-only filter). */
  senderBlockedUsers: readonly string[];
  /** Recipient's blocked-users list. */
  recipientBlockedUsers: readonly string[];
  /** Recipient's muted-users list (legacy soft-block). */
  recipientMutedUsers: readonly string[];
}

export function shouldDeliverRoomChatToRecipient(
  inputs: RoomChatRecipientCheckInputs,
): boolean {
  if (inputs.recipientId === inputs.senderId) return true;
  if (inputs.senderBlockedUsers.includes(inputs.recipientId)) return false;
  if (inputs.recipientBlockedUsers.includes(inputs.senderId)) return false;
  if (inputs.recipientMutedUsers.includes(inputs.senderId)) return false;
  return true;
}
