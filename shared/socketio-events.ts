/**
 * Strongly-typed Socket.IO event contracts shared between client and server.
 * Two namespaces:
 *  - /chat : lightweight realtime chat in challenge / DM rooms
 *  - /rtc  : WebRTC signaling for voice / video calls
 *
 * Auth: every Socket.IO connection re-uses the existing `vex_token` JWT cookie
 * (or Authorization Bearer header during the handshake). No new auth surface.
 */

/* ============================================================================
 *  Common
 * ========================================================================== */

export type CallType = "voice" | "video";

/** 3-tier WebRTC fallback the client orchestrator may settle on */
export type CallTier = "p2p" | "relay" | "text-only";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  /** Seconds until the TURN credential expires; 0 if no TURN configured */
  ttlSeconds: number;
  /** Whether a TURN relay is actually available (false → only public STUN) */
  hasRelay: boolean;
}

/* ============================================================================
 *  /chat namespace
 * ========================================================================== */

export interface ChatJoinPayload {
  /** Logical room id; e.g. `challenge:<id>`, `dm:<userA>:<userB>` */
  roomId: string;
}

export interface ChatMessagePayload {
  roomId: string;
  /** Plain text, max 500 chars */
  text: string;
  /** Optional client-generated id for de-dup / ack */
  clientMsgId?: string;
  /**
   * Optional quick-message metadata. When the user picks a canned phrase from
   * the GameChat quick-bar instead of typing free text, the client sets these
   * so other clients can render the message with the special "quick message"
   * styling (avatar bubble, accent color).
   */
  isQuickMessage?: boolean;
  quickMessageKey?: string;
}

export interface ChatBroadcast {
  roomId: string;
  fromUserId: string;
  fromUsername: string;
  text: string;
  ts: number;
  /** Echo of clientMsgId if provided */
  clientMsgId?: string;
  /** True when the sender was acting as a spectator (read-only seat). */
  isSpectator?: boolean;
  /** Mirrors the sender's quick-message metadata so styling survives transport. */
  isQuickMessage?: boolean;
  quickMessageKey?: string;
  /** True when the server's word filter scrubbed the original text. */
  wasFiltered?: boolean;
  /**
   * Task #139 (architect follow-up): persisted DB id of the message
   * that produced this broadcast, when the bridge persisted one.
   * Currently set ONLY by the casual `match:` text bridge so the
   * client can dedupe a realtime bubble against the history row that
   * a reconnect catch-up refetch will return for the same message.
   * Other bridges (challenge / DM / voice) leave this undefined and
   * keep using `clientMsgId` as their dedup key.
   */
  messageId?: string;
  /**
   * Task #139: optional gameplay-emoji metadata, set ONLY on broadcasts
   * fanned out from the `/api/gameplay/messages` REST endpoint after a
   * successful balance-deducted emoji send. `text` is empty in that
   * case and clients render the emoji bubble using these fields.
   * Undefined for normal text broadcasts (challenge / DM / match text).
   * Optional + additive so existing consumers keep working unchanged.
   */
  gameplayEmoji?: {
    /** Persisted `gameplay_messages.id` — used as the dedup key. */
    messageId: string;
    /** Reference id for the emoji catalog row. */
    emojiId: string;
    /** Display glyph (e.g. "🔥"). */
    emoji: string;
    /** Decimal-as-string price the sender paid (mirrors REST shape). */
    price: string;
  };
}

/**
 * Centralized union of every chat error code the client may observe — either
 * via a `chat:send` ack failure, a server-emitted `chat:error` event, or a
 * client-side transport failure raised inside `useSocketChat.send` itself.
 *
 * Single source of truth so client and server cannot drift. Adding a new
 * server-side error string without extending this union is a compile error
 * on every consumer (server emit site, hook ack signature, page onError map).
 */
export const CHAT_ERROR_CODES = [
  // ---- ack failures returned by `chat:send` ack ----
  "invalid",              // payload validation failed
  "not_in_room",          // sender hasn't joined the target room yet
  "rate_limit",           // per-user rate limiter tripped
  "spectator_not_seated", // sender is in a `challenge:*` room but not in spectator presence
  "spectator_readonly",   // Task #13: spectators may receive but never send on the new transport
  "spectator_full",       // Task #14: per-game spectator cap reached on the realtime chat channel
  "no_session",           // bridge couldn't find an active game session for the room
  "empty",                // message sanitized to empty string — silently dropped
  "failed",               // generic delivery failure
  "server",               // unhandled exception
  // ---- transport-level (client only — emitted by `useSocketChat.send`) ----
  "no_room",              // hook not configured with a roomId
  "disconnected",         // socket not connected at send time
  // ---- additional codes the server emits via `chat:error` event only ----
  "auth",                 // authentication required
  "forbidden",            // not allowed in this room (e.g. join rejected)
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/**
 * Subset of `ChatErrorCode` that indicates a transport-level failure — the
 * server was never reached (or never finished joining). Reserved for future
 * fallback gating logic; current `sendChatMessage` paths surface every
 * failure to the user via toast and do not auto-retry on any other transport.
 */
export const CHAT_TRANSPORT_ERROR_CODES = [
  "no_room",
  "disconnected",
  "not_in_room",
] as const satisfies readonly ChatErrorCode[];

export type ChatTransportErrorCode = (typeof CHAT_TRANSPORT_ERROR_CODES)[number];

/**
 * Type guard: true when the given chat error code represents a transport-level
 * failure (the server was never reached or the room was never joined). Use
 * this in send paths to distinguish "we never got there" from semantic
 * server-side rejections (rate_limit, no_session, spectator_not_seated, ...).
 *
 * Backed by `CHAT_TRANSPORT_ERROR_CODES` so the runtime list and the type
 * narrowing stay in sync via the `as const satisfies` constraint above.
 */
export function isChatTransportErrorCode(
  code: ChatErrorCode | undefined,
): code is ChatTransportErrorCode {
  return !!code && (CHAT_TRANSPORT_ERROR_CODES as readonly string[]).includes(code);
}

export interface ChatErrorPayload {
  code: ChatErrorCode;
  message: string;
  /** Optional room scoping so the client can ignore errors for other rooms. */
  roomId?: string;
}

export interface ChatSendAck {
  ok: boolean;
  error?: ChatErrorCode;
}

export interface ChatClientToServerEvents {
  "chat:join": (p: ChatJoinPayload, ack?: (ok: boolean) => void) => void;
  "chat:leave": (p: ChatJoinPayload) => void;
  "chat:send": (
    p: ChatMessagePayload,
    ack?: (res: ChatSendAck) => void,
  ) => void;
  "ping": (ack: (pong: { ts: number }) => void) => void;
}

export interface ChatServerToClientEvents {
  "chat:message": (msg: ChatBroadcast) => void;
  "chat:error": (err: ChatErrorPayload) => void;
  "chat:joined": (p: { roomId: string; members: number }) => void;
  /**
   * Task #26: live spectator count for a challenge chat room. Emitted by
   * the server whenever a spectator socket joins or leaves the room
   * (including disconnect). Players are excluded from the count — only
   * sockets stamped with `spectatorRoomIds.includes(roomId)` count. Sent
   * to every socket currently in the room so player and spectator clients
   * can render a "N watching" pill in the chat header without revealing
   * viewer identities.
   */
  "chat:viewer_count": (p: { roomId: string; count: number }) => void;
  /**
   * Task #75: companion to `chat:viewer_count` that exposes viewer
   * IDENTITIES so the chat header can render a "who's watching" avatar
   * stack + popover. Emitted per-recipient, not room-wide, so each
   * recipient's blocked-users list can filter the visible entries
   * before they leave the server. `totalCount` is the unfiltered live
   * spectator count (same value as `chat:viewer_count`) so the UI's
   * "+N" overflow chip reflects the true room population even when
   * some viewers are hidden by the recipient's block list. `viewers`
   * is also capped to a small ceiling (MAX_VIEWER_LIST_PAYLOAD_SIZE)
   * to bound payload size for very crowded matches.
   */
  "chat:viewer_list": (p: ChatViewerListPayload) => void;
}

/**
 * Task #75: minimal user summary for the "who's watching" UI. Includes
 * just enough to render an avatar + name + profile link without leaking
 * private fields. The server resolves these from the `users` table and
 * filters them per-recipient against the recipient's blocked-users
 * list before emitting `chat:viewer_list`.
 */
export interface ChatViewerSummary {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface ChatViewerListPayload {
  roomId: string;
  /** Up to `MAX_VIEWER_LIST_PAYLOAD_SIZE` viewers visible to THIS recipient
   *  after blocked-user filtering. May be shorter than `totalCount`. */
  viewers: ChatViewerSummary[];
  /** Authoritative live spectator count for the room (matches
   *  `chat:viewer_count`). May exceed `viewers.length` when the
   *  recipient has blocked some viewers or the payload cap was hit. */
  totalCount: number;
}

/**
 * Hard ceiling on how many viewer summaries the server includes in a
 * single `chat:viewer_list` payload. Prevents broadcasts from ballooning
 * for matches with very large spectator audiences. The UI only ever
 * renders the first ~3 in the avatar stack and a scrollable popover for
 * the rest, so a low cap is acceptable. The `totalCount` field still
 * carries the true population so the "+N" overflow chip is accurate.
 */
export const MAX_VIEWER_LIST_PAYLOAD_SIZE = 25;

/* ============================================================================
 *  /rtc namespace — WebRTC signaling
 * ========================================================================== */

export interface RtcInvitePayload {
  /** Logical call session id (UUID generated by initiator) */
  sessionId: string;
  /** Recipient user id */
  toUserId: string;
  callType: CallType;
  /** Optional context (e.g. challengeId so the callee knows the source) */
  context?: { challengeId?: string };
}

export interface RtcAnswerPayload {
  sessionId: string;
  accept: boolean;
}

export interface RtcSdpPayload {
  sessionId: string;
  toUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface RtcIcePayload {
  sessionId: string;
  toUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface RtcEndPayload {
  sessionId: string;
  /** Optional reason ('hangup', 'failed', 'fallback', etc.) */
  reason?: string;
  /**
   * Optional explicit recipient user id. Required when ending a call BEFORE
   * the SDP exchange (i.e. cancelling while ringing) because the callee
   * hasn't joined the per-call room yet — the server uses this to deliver
   * `rtc:ended` directly to the recipient's user-room.
   */
  toUserId?: string;
}

export interface RtcTierPayload {
  sessionId: string;
  tier: CallTier;
}

export interface RtcClientToServerEvents {
  "rtc:invite": (
    p: RtcInvitePayload,
    ack?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  "rtc:answer": (p: RtcAnswerPayload) => void;
  "rtc:sdp": (p: RtcSdpPayload) => void;
  "rtc:ice": (p: RtcIcePayload) => void;
  "rtc:end": (p: RtcEndPayload) => void;
  "rtc:tier": (p: RtcTierPayload) => void;
  "ping": (ack: (pong: { ts: number }) => void) => void;
}

export interface RtcServerToClientEvents {
  "rtc:incoming": (p: RtcInvitePayload & { fromUserId: string; fromUsername: string }) => void;
  "rtc:answered": (p: RtcAnswerPayload & { fromUserId: string }) => void;
  "rtc:sdp": (p: { sessionId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => void;
  "rtc:ice": (p: { sessionId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => void;
  "rtc:ended": (p: RtcEndPayload & { fromUserId: string }) => void;
  "rtc:tier": (p: RtcTierPayload & { fromUserId: string }) => void;
  "rtc:error": (p: { code: string; message: string; sessionId?: string }) => void;
}

/* ============================================================================
 *  Path constants (must match on both ends)
 * ========================================================================== */

export const SOCKETIO_PATH = "/socket.io";
export const SOCKETIO_NS_CHAT = "/chat";
export const SOCKETIO_NS_RTC = "/rtc";
