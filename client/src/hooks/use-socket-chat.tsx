import { useCallback, useEffect, useRef, useState } from "react";
import { getChatSocket } from "@/lib/socket-io-client";
import type {
  ChatBroadcast,
  ChatErrorCode,
  ChatSendAck,
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
    sock.on("chat:error", onChatError);

    if (sock.connected) onConnect();

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("chat:message", onMessage);
      sock.off("chat:joined", onJoined);
      sock.off("chat:error", onChatError);
      if (sock.connected) sock.emit("chat:leave", { roomId });
      setJoined(false);
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

  return { connected, joined, members, messages, send };
}
