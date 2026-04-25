import { useCallback, useEffect, useRef, useState } from "react";
import { getChatSocket } from "@/lib/socket-io-client";
import type {
  ChatBroadcast,
  ChatErrorCode,
  ChatSendAck,
  ChatViewerListPayload,
  ChatViewerSummary,
} from "@shared/socketio-events";

interface UseSocketChatOptions {
  /** Logical room id (e.g. `challenge:<id>`) — null disables the hook */
  roomId: string | null;
  /** Limit of messages kept in memory */
  historyLimit?: number;
  /**
   * Invoked when the server emits `chat:error` for this room or when a
   * `send()` ack returns `{ ok: false }`. Use this to show a toast so
   * rate-limit / spectator-not-seated / no_session etc. surface to the
   * user instead of silently dropping the message. `code` is a member of
   * the centralized `ChatErrorCode` union — adding a new server code
   * without extending the union is a compile error here.
   */
  onError?: (info: { code: ChatErrorCode; reason?: string }) => void;
}

export interface UseSocketChatReturn {
  connected: boolean;
  joined: boolean;
  members: number;
  messages: ChatBroadcast[];
  /**
   * Task #26: live count of spectator sockets currently in this chat room.
   * Updated via the `chat:viewer_count` event whenever a spectator joins,
   * leaves, or disconnects. `0` means no viewers — the chat header should
   * hide the pill in that case. Resets to 0 on room change so a stale
   * count from the previous room never leaks across.
   */
  viewerCount: number;
  /**
   * Task #26: `true` once the server has emitted at least one
   * `chat:viewer_count` for the current room. Consumers can use this to
   * decide whether `viewerCount` is authoritative — before the first
   * broadcast arrives a UI may want to fall back to a legacy count
   * source (e.g. WS spectator presence). After the first broadcast the
   * realtime value is authoritative even when it transitions to 0.
   * Resets to `false` whenever the room changes.
   */
  viewerCountReceived: boolean;
  /**
   * Task #75: identities of the spectators currently in this room,
   * filtered server-side against the viewer's blocked-users list. May
   * be shorter than `viewerCount` when blocks hide some entries or the
   * payload cap is hit; `viewerCount` remains the authoritative total.
   * Resets to `[]` whenever the room changes.
   */
  viewers: ChatViewerSummary[];
  send: (
    text: string,
    opts?: { isQuickMessage?: boolean; quickMessageKey?: string },
  ) => Promise<ChatSendAck>;
}

/**
 * Subscribes to a Socket.IO chat room. Auto-joins when a roomId is supplied
 * and auto-leaves on cleanup. Buffers received messages locally.
 */
export function useSocketChat({ roomId, historyLimit = 100, onError }: UseSocketChatOptions): UseSocketChatReturn {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewerCountReceived, setViewerCountReceived] = useState(false);
  const [viewers, setViewers] = useState<ChatViewerSummary[]>([]);
  const [messages, setMessages] = useState<ChatBroadcast[]>([]);
  const limitRef = useRef(historyLimit);
  limitRef.current = historyLimit;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!roomId) return;
    const sock = getChatSocket();

    const onConnect = () => {
      setConnected(true);
      sock.emit("chat:join", { roomId }, (ok) => setJoined(Boolean(ok)));
    };
    const onDisconnect = () => {
      setConnected(false);
      setJoined(false);
    };
    const onMessage = (msg: ChatBroadcast) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > limitRef.current) next.splice(0, next.length - limitRef.current);
        return next;
      });
    };
    const onJoined = (p: { roomId: string; members: number }) => {
      if (p.roomId === roomId) {
        setJoined(true);
        setMembers(p.members);
      }
    };
    // Task #26: pick up live spectator-count broadcasts for this room.
    // Server emits on every spectator join / leave / disconnect, so the
    // chat header pill stays in sync without polling.
    const onViewerCount = (p: { roomId: string; count: number }) => {
      if (p.roomId === roomId) {
        setViewerCount(p.count);
        setViewerCountReceived(true);
      }
    };
    // Task #75: pick up the per-recipient viewer-list broadcast emitted
    // alongside `chat:viewer_count`. The server has already block-list
    // filtered the entries, so the hook just stores the array as-is.
    const onViewerList = (p: ChatViewerListPayload) => {
      if (p.roomId === roomId) setViewers(p.viewers || []);
    };

    const onChatError = (info: {
      code?: ChatErrorCode;
      message?: string;
      roomId?: string;
    }) => {
      // Only surface errors targeted at this room (server may include roomId).
      // If server omits roomId, surface anyway — the user just attempted a send.
      if (info.roomId && info.roomId !== roomId) return;
      onErrorRef.current?.({
        code: info.code ?? "server",
        reason: info.message,
      });
    };

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.on("chat:message", onMessage);
    sock.on("chat:joined", onJoined);
    sock.on("chat:viewer_count", onViewerCount);
    sock.on("chat:viewer_list", onViewerList);
    sock.on("chat:error", onChatError);

    if (sock.connected) onConnect();

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("chat:message", onMessage);
      sock.off("chat:joined", onJoined);
      sock.off("chat:viewer_count", onViewerCount);
      sock.off("chat:viewer_list", onViewerList);
      sock.off("chat:error", onChatError);
      if (sock.connected) sock.emit("chat:leave", { roomId });
      setJoined(false);
      // Task #26: drop any cached viewer count from the previous room so
      // the next room never inherits a stale "N watching" pill, and
      // clear the "received" flag so consumers fall back to their
      // legacy count source until the new room emits its first
      // broadcast.
      setViewerCount(0);
      setViewerCountReceived(false);
      // Task #75: drop the viewer list too so the avatar stack doesn't
      // momentarily show people from the previous room.
      setViewers([]);
    };
  }, [roomId]);

  const send = useCallback(
    (
      text: string,
      opts?: { isQuickMessage?: boolean; quickMessageKey?: string },
    ) =>
      new Promise<ChatSendAck>((resolve) => {
        if (!roomId) return resolve({ ok: false, error: "no_room" });
        const sock = getChatSocket();
        if (!sock.connected) return resolve({ ok: false, error: "disconnected" });
        const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sock.emit(
          "chat:send",
          {
            roomId,
            text,
            clientMsgId,
            isQuickMessage: opts?.isQuickMessage,
            quickMessageKey: opts?.quickMessageKey,
          },
          (res) => {
            // Mirror ack failures into the same onError pipeline so callers
            // only need to wire one toast handler. The transport doesn't
            // re-emit chat:error for ack-only failures.
            if (!res?.ok) {
              onErrorRef.current?.({
                code: res?.error || "server",
              });
            }
            resolve(res);
          },
        );
      }),
    [roomId],
  );

  return {
    connected,
    joined,
    members,
    messages,
    viewerCount,
    viewerCountReceived,
    viewers,
    send,
  };
}
