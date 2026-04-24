import { useCallback, useEffect, useRef, useState } from "react";
import { getChatSocket } from "@/lib/socket-io-client";
import type { ChatBroadcast } from "@shared/socketio-events";

interface UseSocketChatOptions {
  /** Logical room id (e.g. `challenge:<id>`) — null disables the hook */
  roomId: string | null;
  /** Limit of messages kept in memory */
  historyLimit?: number;
}

export interface UseSocketChatReturn {
  connected: boolean;
  joined: boolean;
  members: number;
  messages: ChatBroadcast[];
  send: (
    text: string,
    opts?: { isQuickMessage?: boolean; quickMessageKey?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Subscribes to a Socket.IO chat room. Auto-joins when a roomId is supplied
 * and auto-leaves on cleanup. Buffers received messages locally.
 */
export function useSocketChat({ roomId, historyLimit = 100 }: UseSocketChatOptions): UseSocketChatReturn {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState(0);
  const [messages, setMessages] = useState<ChatBroadcast[]>([]);
  const limitRef = useRef(historyLimit);
  limitRef.current = historyLimit;

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

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.on("chat:message", onMessage);
    sock.on("chat:joined", onJoined);

    if (sock.connected) onConnect();

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("chat:message", onMessage);
      sock.off("chat:joined", onJoined);
      if (sock.connected) sock.emit("chat:leave", { roomId });
      setJoined(false);
    };
  }, [roomId]);

  const send = useCallback(
    (
      text: string,
      opts?: { isQuickMessage?: boolean; quickMessageKey?: string },
    ) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
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
          (res) => resolve(res),
        );
      }),
    [roomId],
  );

  return { connected, joined, members, messages, send };
}
