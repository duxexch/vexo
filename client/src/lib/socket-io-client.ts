import { io as createSocket, type Socket } from "socket.io-client";
import type { EventsMap } from "@socket.io/component-emitter";
import {
  SOCKETIO_PATH,
  SOCKETIO_NS_CHAT,
  SOCKETIO_NS_RTC,
  type ChatClientToServerEvents,
  type ChatServerToClientEvents,
  type RtcClientToServerEvents,
  type RtcServerToClientEvents,
} from "@shared/socketio-events";

const TOKEN_KEY = "pwm_token";

function readToken(): string | undefined {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      sessionStorage.getItem("pwm_token_backup") ||
      undefined
    );
  } catch {
    return undefined;
  }
}

function makeClient<S extends EventsMap, C extends EventsMap>(namespace: string): Socket<S, C> {
  // Same-origin connection — Vite dev server proxies via the existing host.
  // In production, Traefik forwards /socket.io to the app container.
  const url = `${window.location.protocol}//${window.location.host}${namespace}`;
  return createSocket(url, {
    path: SOCKETIO_PATH,
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
    autoConnect: false,
    auth: (cb) => cb({ token: readToken() }),
  }) as unknown as Socket<S, C>;
}

let chatClient: Socket<ChatServerToClientEvents, ChatClientToServerEvents> | null = null;
let rtcClient: Socket<RtcServerToClientEvents, RtcClientToServerEvents> | null = null;

export function getChatSocket(): Socket<ChatServerToClientEvents, ChatClientToServerEvents> {
  if (!chatClient) {
    chatClient = makeClient<ChatServerToClientEvents, ChatClientToServerEvents>(SOCKETIO_NS_CHAT);
  }
  if (!chatClient.connected && !chatClient.active) chatClient.connect();
  else if (!chatClient.connected) chatClient.connect();
  return chatClient;
}

export function getRtcSocket(): Socket<RtcServerToClientEvents, RtcClientToServerEvents> {
  if (!rtcClient) {
    rtcClient = makeClient<RtcServerToClientEvents, RtcClientToServerEvents>(SOCKETIO_NS_RTC);
  }
  if (!rtcClient.connected) rtcClient.connect();
  return rtcClient;
}

export function disconnectAllSockets(): void {
  chatClient?.disconnect();
  rtcClient?.disconnect();
}
