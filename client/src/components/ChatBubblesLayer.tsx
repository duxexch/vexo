/**
 * Messenger-style floating chat bubbles for incoming direct messages.
 *
 * Two surfaces collaborate to deliver this feature:
 *   1. The native `ChatBubbles` Capacitor plugin handles Android (system
 *      Bubble API on 11+, WindowManager overlay on older). See
 *      `docs/CHAT_BUBBLES_PLAYBOOK.md`.
 *   2. This component is the in-app fallback used by the web build, the
 *      iOS build, and Android when the native surface isn't available
 *      (e.g. SYSTEM_ALERT_WINDOW not granted yet).
 *
 * It consumes the `vex-incoming-dm` window event dispatched by
 * NotificationProvider plus `SHOW_CHAT_BUBBLE` postMessages from the
 * service worker. State is per-peer; tapping a bubble expands an
 * inline mini chat with the latest 20 messages and a quick-reply
 * input. Suppression rules live below in `shouldShowBubbleFor`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Send, X, MessageCircle } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { usePrivateCallLayer } from "@/components/chat/private-call-layer";
import {
  getChatBubblesEnabled,
} from "@/lib/chat-bubbles-pref";
import {
  hideAllBubbles as nativeHideAllBubbles,
  hideBubble as nativeHideBubble,
  isBubblesSupported,
  showBubble as nativeShowBubble,
} from "@/lib/chat-bubbles";

const MAX_VISIBLE_BUBBLES = 4;
const MAX_PREVIEW_LENGTH = 80;

interface BubblePeerState {
  peerId: string;
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  unreadCount: number;
  expanded: boolean;
  position: { x: number; y: number };
}

interface MiniMessage {
  id: string;
  content: string;
  senderId: string;
  createdAt?: string;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function nowPosition(index: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 16, y: 120 };
  const margin = 16;
  const size = 56;
  const stride = size + 12;
  const top = Math.max(120, window.innerHeight / 2 - MAX_VISIBLE_BUBBLES * stride);
  return { x: window.innerWidth - size - margin, y: top + index * stride };
}

export default function ChatBubblesLayer() {
  const { user, token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const callLayer = usePrivateCallLayer();
  const hasActiveCall = callLayer?.hasActiveCall ?? false;

  const [bubbles, setBubbles] = useState<Record<string, BubblePeerState>>({});
  const [enabled, setEnabled] = useState<boolean>(() => getChatBubblesEnabled());
  const [nativeMode, setNativeMode] = useState<"bubble" | "overlay" | "none">("none");
  const [miniMessagesByPeer, setMiniMessagesByPeer] = useState<Record<string, MiniMessage[]>>({});
  const [draftByPeer, setDraftByPeer] = useState<Record<string, string>>({});
  const [sendingPeer, setSendingPeer] = useState<string | null>(null);

  const userRef = useRef(user);
  userRef.current = user;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // ── preference + native capability detection ────────────────────────
  useEffect(() => {
    const onPrefChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ enabled?: boolean }>).detail;
      setEnabled(typeof detail?.enabled === "boolean" ? detail.enabled : getChatBubblesEnabled());
    };
    window.addEventListener("vex-chat-bubbles-pref", onPrefChange);
    return () => window.removeEventListener("vex-chat-bubbles-pref", onPrefChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    isBubblesSupported().then((res) => {
      if (!cancelled) setNativeMode(res.mode);
    });
    return () => { cancelled = true; };
  }, []);

  // ── helpers ─────────────────────────────────────────────────────────
  const activeChatPeerId = useMemo(() => {
    if (!location.startsWith("/chat")) return null;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("user");
    } catch {
      return null;
    }
  }, [location]);

  const isPeerSuppressed = useCallback((peerId: string): boolean => {
    const u = userRef.current;
    if (!u) return true;
    if (Array.isArray(u.notificationMutedUsers) && u.notificationMutedUsers.includes(peerId)) return true;
    if (Array.isArray(u.mutedUsers) && u.mutedUsers.includes(peerId)) return true;
    return false;
  }, []);

  const shouldShowBubbleFor = useCallback((peerId: string): boolean => {
    if (!enabled) return false;
    if (!userRef.current || !tokenRef.current) return false;
    if (hasActiveCall) return false;
    if (isPeerSuppressed(peerId)) return false;
    if (peerId === activeChatPeerId && document.visibilityState === "visible") return false;
    return true;
  }, [enabled, hasActiveCall, isPeerSuppressed, activeChatPeerId]);

  // When the native plugin is rendering OS-level bubbles we still queue
  // them via `nativeShowBubble` below, but we MUST NOT also paint the
  // in-app web fallback over the WebView — otherwise Android users see
  // two bubbles for every incoming DM (the system bubble + this one).
  const shouldRenderWebFallback = nativeMode === "none";

  // ── peer info lookup (cached + in-flight dedupe) ────────────────────
  const peerInfoCache = useRef<Map<string, { name: string; avatarUrl?: string }>>(new Map());
  const peerInfoInFlight = useRef<Map<string, Promise<{ name: string; avatarUrl?: string }>>>(new Map());

  const fetchPeerInfo = useCallback((peerId: string, fallbackName: string): Promise<{ name: string; avatarUrl?: string }> => {
    const cached = peerInfoCache.current.get(peerId);
    if (cached) return Promise.resolve(cached);
    const inFlight = peerInfoInFlight.current.get(peerId);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<{ name: string; avatarUrl?: string }> => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(peerId)}`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        if (res.ok) {
          const data = await res.json();
          const name = (data?.firstName as string | undefined) || (data?.username as string | undefined) || fallbackName;
          const info: { name: string; avatarUrl?: string } = {
            name,
            avatarUrl: typeof data?.avatarUrl === "string" ? data.avatarUrl : undefined,
          };
          peerInfoCache.current.set(peerId, info);
          return info;
        }
      } catch {
        /* fallback below */
      }
      const info: { name: string; avatarUrl?: string } = { name: fallbackName };
      peerInfoCache.current.set(peerId, info);
      return info;
    })();

    peerInfoInFlight.current.set(peerId, promise);
    promise.finally(() => peerInfoInFlight.current.delete(peerId));
    return promise;
  }, []);

  // ── add / update bubble ─────────────────────────────────────────────
  const upsertBubble = useCallback(async (input: {
    peerId: string;
    fallbackName: string;
    body: string;
  }) => {
    if (!shouldShowBubbleFor(input.peerId)) return;

    const info = await fetchPeerInfo(input.peerId, input.fallbackName);

    setBubbles((prev) => {
      const existing = prev[input.peerId];
      const nextIndex = Object.keys(prev).length;
      const next: BubblePeerState = existing
        ? {
            ...existing,
            name: info.name,
            avatarUrl: info.avatarUrl,
            lastMessage: input.body,
            unreadCount: existing.expanded ? 0 : existing.unreadCount + 1,
          }
        : {
            peerId: input.peerId,
            name: info.name,
            avatarUrl: info.avatarUrl,
            lastMessage: input.body,
            unreadCount: 1,
            expanded: false,
            position: nowPosition(nextIndex),
          };
      const merged = { ...prev, [input.peerId]: next };
      // Cap visible bubbles — drop oldest non-expanded if over the cap.
      const ids = Object.keys(merged);
      if (ids.length > MAX_VISIBLE_BUBBLES) {
        const drop = ids.find((id) => !merged[id].expanded && id !== input.peerId);
        if (drop) {
          const { [drop]: _, ...rest } = merged;
          return rest;
        }
      }
      return merged;
    });

    // Best-effort native bubble. The web fallback above renders regardless.
    if (nativeMode !== "none") {
      void nativeShowBubble({
        peerId: input.peerId,
        name: info.name,
        avatarUrl: info.avatarUrl,
        body: truncate(input.body, MAX_PREVIEW_LENGTH),
        unreadCount: 1,
      });
    }
  }, [fetchPeerInfo, nativeMode, shouldShowBubbleFor]);

  // ── event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const onIncoming = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { senderId?: string; title?: string; message?: string }
        | undefined;
      if (!detail?.senderId) return;
      // Title format: "{display name} sent you a message"
      const fallbackName = (detail.title || "").split(" sent you")[0] || "Chat";
      void upsertBubble({
        peerId: detail.senderId,
        fallbackName,
        body: detail.message || "",
      });
    };
    window.addEventListener("vex-incoming-dm", onIncoming);

    const onSwMessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type?: string; senderId?: string; title?: string; body?: string }
        | undefined;
      if (data?.type !== "SHOW_CHAT_BUBBLE" || !data.senderId) return;
      const fallbackName = (data.title || "").split(" sent you")[0] || "Chat";
      void upsertBubble({
        peerId: data.senderId,
        fallbackName,
        body: data.body || "",
      });
    };
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      window.removeEventListener("vex-incoming-dm", onIncoming);
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [upsertBubble]);

  // ── auto-dismiss when user navigates into the active conversation ──
  useEffect(() => {
    if (!activeChatPeerId) return;
    setBubbles((prev) => {
      if (!prev[activeChatPeerId]) return prev;
      const { [activeChatPeerId]: _, ...rest } = prev;
      return rest;
    });
    void nativeHideBubble(activeChatPeerId);
  }, [activeChatPeerId]);

  // ── tear-down on signout / disable / call ───────────────────────────
  useEffect(() => {
    if (enabled && user && !hasActiveCall) return;
    setBubbles({});
    void nativeHideAllBubbles();
  }, [enabled, user, hasActiveCall]);

  // ── per-bubble actions ──────────────────────────────────────────────
  const dismissPeer = useCallback((peerId: string) => {
    setBubbles((prev) => {
      const { [peerId]: _, ...rest } = prev;
      return rest;
    });
    setMiniMessagesByPeer((prev) => {
      const { [peerId]: _, ...rest } = prev;
      return rest;
    });
    void nativeHideBubble(peerId);
  }, []);

  const loadMiniMessages = useCallback(async (peerId: string) => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(peerId)}/messages?limit=20&offset=0`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: MiniMessage[] = Array.isArray(data?.messages)
        ? data.messages.map((m: any) => ({
            id: String(m.id ?? Math.random()),
            content: typeof m.content === "string" ? m.content : "",
            senderId: String(m.senderId ?? ""),
            createdAt: m.createdAt,
          }))
        : Array.isArray(data)
          ? data.map((m: any) => ({
              id: String(m.id ?? Math.random()),
              content: typeof m.content === "string" ? m.content : "",
              senderId: String(m.senderId ?? ""),
              createdAt: m.createdAt,
            }))
          : [];
      setMiniMessagesByPeer((prev) => ({ ...prev, [peerId]: list }));
    } catch {
      /* swallow — mini chat just won't show history */
    }
  }, []);

  const togglePeerExpanded = useCallback((peerId: string) => {
    setBubbles((prev) => {
      const existing = prev[peerId];
      if (!existing) return prev;
      const expanded = !existing.expanded;
      return {
        ...prev,
        [peerId]: { ...existing, expanded, unreadCount: expanded ? 0 : existing.unreadCount },
      };
    });
    // Lazy-load history once.
    setMiniMessagesByPeer((prev) => {
      if (prev[peerId]) return prev;
      void loadMiniMessages(peerId);
      return prev;
    });
  }, [loadMiniMessages]);

  const sendQuickReply = useCallback(async (peerId: string) => {
    const draft = (draftByPeer[peerId] || "").trim();
    if (!draft || !tokenRef.current) return;
    setSendingPeer(peerId);
    try {
      const clientMessageId = `bubble-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch(`/api/chat/${encodeURIComponent(peerId)}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          clientMessageId,
          content: draft,
          messageType: "text",
        }),
      });
      if (res.ok) {
        const sent = await res.json().catch(() => ({} as any));
        const senderId = userRef.current?.id || "";
        setMiniMessagesByPeer((prev) => {
          const list = prev[peerId] || [];
          return {
            ...prev,
            [peerId]: [
              ...list,
              {
                id: String(sent?.message?.id ?? sent?.id ?? clientMessageId),
                content: draft,
                senderId,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        });
        setDraftByPeer((prev) => ({ ...prev, [peerId]: "" }));
      } else {
        // Surface the failure (e.g. 402 chat-unlock-required for stranger
        // DMs, 429 rate-limit) instead of silently leaving the input
        // hanging. We deliberately do NOT pop the heavier ChatUnlockDialog
        // here — quick-reply is meant to stay lightweight; the user can
        // tap "Open chat" to handle unlock flows.
        toast({
          variant: "destructive",
          description: t("chatBubbles.sendFailed"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        description: t("chatBubbles.sendFailed"),
      });
    } finally {
      setSendingPeer(null);
    }
  }, [draftByPeer, t, toast]);

  // ── render ─────────────────────────────────────────────────────────
  if (!user || !enabled) return null;
  if (!shouldRenderWebFallback) return null;
  const visible = Object.values(bubbles).slice(0, MAX_VISIBLE_BUBBLES);
  if (visible.length === 0) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[120]"
      data-testid="chat-bubbles-layer"
    >
      {visible.map((bubble, idx) => {
        const initials = (bubble.name || "?").trim().charAt(0).toUpperCase();
        const messages = miniMessagesByPeer[bubble.peerId] || [];
        const draft = draftByPeer[bubble.peerId] || "";
        const sending = sendingPeer === bubble.peerId;
        const top = bubble.position.y || 120 + idx * 68;
        return (
          <div
            key={bubble.peerId}
            className="absolute pointer-events-auto"
            style={{ top, right: 16 }}
            data-testid={`chat-bubble-${bubble.peerId}`}
          >
            {/* Floating circle */}
            <button
              type="button"
              onClick={() => togglePeerExpanded(bubble.peerId)}
              className="relative h-14 w-14 rounded-full bg-primary shadow-xl ring-2 ring-background overflow-hidden flex items-center justify-center text-primary-foreground hover:scale-105 transition-transform"
              aria-label={t("chatBubbles.openChat")}
              data-testid={`chat-bubble-toggle-${bubble.peerId}`}
            >
              {bubble.avatarUrl ? (
                <img
                  src={bubble.avatarUrl}
                  alt={bubble.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-lg font-semibold">{initials}</span>
              )}
              {bubble.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                  {bubble.unreadCount > 9 ? "9+" : bubble.unreadCount}
                </span>
              )}
            </button>

            {/* Mini chat panel */}
            {bubble.expanded && (
              <div
                className="absolute right-16 top-0 w-72 max-w-[calc(100vw-96px)] bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: "60vh" }}
                data-testid={`chat-bubble-panel-${bubble.peerId}`}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/chat?user=${encodeURIComponent(bubble.peerId)}`);
                    }}
                    className="flex items-center gap-2 text-sm font-medium hover:underline"
                    data-testid={`chat-bubble-open-${bubble.peerId}`}
                  >
                    <MessageCircle className="h-4 w-4 text-primary" />
                    <span className="truncate">{bubble.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissPeer(bubble.peerId)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t("chatBubbles.dismiss")}
                    data-testid={`chat-bubble-dismiss-${bubble.peerId}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-sm">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">
                      {truncate(bubble.lastMessage, MAX_PREVIEW_LENGTH)}
                    </p>
                  ) : (
                    messages.slice(-12).map((m) => {
                      const mine = m.senderId === userRef.current?.id;
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[85%] px-2.5 py-1.5 rounded-lg break-words ${
                            mine
                              ? "ms-auto bg-primary text-primary-foreground"
                              : "me-auto bg-muted"
                          }`}
                        >
                          {m.content}
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  className="flex items-center gap-2 border-t px-2 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendQuickReply(bubble.peerId);
                  }}
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraftByPeer((prev) => ({ ...prev, [bubble.peerId]: e.target.value }))}
                    placeholder={t("chatBubbles.placeholder")}
                    className="flex-1 bg-muted rounded-full px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    disabled={sending}
                    data-testid={`chat-bubble-input-${bubble.peerId}`}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="rounded-full bg-primary text-primary-foreground p-1.5 disabled:opacity-50"
                    aria-label={t("chatBubbles.send")}
                    data-testid={`chat-bubble-send-${bubble.peerId}`}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
