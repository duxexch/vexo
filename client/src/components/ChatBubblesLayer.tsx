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
 * input.
 *
 * Interaction model (matches Messenger chat-heads):
 *   • Each bubble is draggable via pointer events.
 *   • On release the bubble snaps to the nearest left/right edge.
 *   • While dragging, a centered bottom "X" target appears; dropping
 *     inside it dismisses the bubble (same as the dismiss button).
 *
 * Suppression rules live in `shouldShowBubbleFor`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Send, X, MessageCircle } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { usePrivateCallLayer } from "@/components/chat/private-call-layer";
import { getChatBubblesEnabled } from "@/lib/chat-bubbles-pref";
import {
  configureBubbles as nativeConfigureBubbles,
  hideAllBubbles as nativeHideAllBubbles,
  hideBubble as nativeHideBubble,
  isBubblesSupported,
  showBubble as nativeShowBubble,
} from "@/lib/chat-bubbles";

const MAX_VISIBLE_BUBBLES = 4;
const MAX_PREVIEW_LENGTH = 80;
const BUBBLE_SIZE = 56;
const EDGE_MARGIN = 16;
const TOP_GUARD = 96;
const DISMISS_ZONE_HEIGHT = 96;
const DISMISS_HIT_RADIUS = 80;

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

interface RawMessage {
  id?: unknown;
  content?: unknown;
  senderId?: unknown;
  createdAt?: unknown;
}

interface SendMessageResponse {
  message?: { id?: unknown };
  id?: unknown;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const maxX = viewportWidth - BUBBLE_SIZE - EDGE_MARGIN;
  const minX = EDGE_MARGIN;
  const snappedX = x + BUBBLE_SIZE / 2 < viewportWidth / 2 ? minX : maxX;
  const maxY = viewportHeight - BUBBLE_SIZE - EDGE_MARGIN;
  const minY = TOP_GUARD;
  return { x: snappedX, y: clamp(y, minY, maxY) };
}

function initialPosition(index: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: EDGE_MARGIN, y: 120 };
  const stride = BUBBLE_SIZE + 12;
  const top = Math.max(120, window.innerHeight / 2 - MAX_VISIBLE_BUBBLES * stride);
  return {
    x: window.innerWidth - BUBBLE_SIZE - EDGE_MARGIN,
    y: top + index * stride,
  };
}

function normaliseRawMessages(payload: unknown): MiniMessage[] {
  const list: RawMessage[] = Array.isArray(payload)
    ? (payload as RawMessage[])
    : Array.isArray((payload as { messages?: unknown })?.messages)
      ? ((payload as { messages: RawMessage[] }).messages)
      : [];
  return list.map((m) => ({
    id: m.id != null ? String(m.id) : `local-${Math.random().toString(36).slice(2, 10)}`,
    content: typeof m.content === "string" ? m.content : "",
    senderId: m.senderId != null ? String(m.senderId) : "",
    createdAt: typeof m.createdAt === "string" ? m.createdAt : undefined,
  }));
}

export default function ChatBubblesLayer() {
  const { user, token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const callLayer = usePrivateCallLayer();
  const hasActiveCall = callLayer?.hasActiveCall ?? false;

  const [bubbles, setBubbles] = useState<Record<string, BubblePeerState>>({});
  const userScopedId = user?.id ? String(user.id) : null;
  const [enabled, setEnabled] = useState<boolean>(() => getChatBubblesEnabled(userScopedId));
  const [nativeMode, setNativeMode] = useState<"bubble" | "overlay" | "none">("none");
  // Drives the foreground (in-app layer) vs background (native bubble) dispatch.
  const [isAppForeground, setIsAppForeground] = useState<boolean>(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );
  const [miniMessagesByPeer, setMiniMessagesByPeer] = useState<Record<string, MiniMessage[]>>({});
  const [draftByPeer, setDraftByPeer] = useState<Record<string, string>>({});
  const [sendingPeer, setSendingPeer] = useState<string | null>(null);
  const [draggingPeerId, setDraggingPeerId] = useState<string | null>(null);
  const [pointerOverDismiss, setPointerOverDismiss] = useState<boolean>(false);

  const userRef = useRef(user);
  userRef.current = user;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // Synchronous unread counter so we can forward an accurate per-peer
  // total to the native bubble plugin without waiting for React state.
  const unreadByPeerRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setIsAppForeground(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("blur", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, []);

  // ── preference + native capability detection ────────────────────────
  useEffect(() => {
    const onPrefChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ enabled?: boolean; userId?: string | null }>).detail;
      if (detail?.userId && detail.userId !== userScopedId) return;
      setEnabled(
        typeof detail?.enabled === "boolean" ? detail.enabled : getChatBubblesEnabled(userScopedId),
      );
    };
    window.addEventListener("vex-chat-bubbles-pref", onPrefChange);
    return () => window.removeEventListener("vex-chat-bubbles-pref", onPrefChange);
  }, [userScopedId]);

  useEffect(() => {
    setEnabled(getChatBubblesEnabled(userScopedId));
  }, [userScopedId]);

  useEffect(() => {
    let cancelled = false;
    isBubblesSupported().then((res) => {
      if (!cancelled) setNativeMode(res.mode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror auth + suppression state to the native plugin. `authToken`
  // is sent as `null` on logout so the native side wipes its cached
  // copy. Safe no-op on web/iOS.
  useEffect(() => {
    if (nativeMode === "none") return;
    const apiBaseUrl =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : undefined;
    const muted = new Set<string>();
    if (Array.isArray(user?.notificationMutedUsers)) {
      for (const id of user.notificationMutedUsers) muted.add(String(id));
    }
    if (Array.isArray(user?.mutedUsers)) {
      for (const id of user.mutedUsers) muted.add(String(id));
    }
    void nativeConfigureBubbles({
      apiBaseUrl,
      authToken: token ?? null,
      bubblesEnabled: enabled,
      mutedPeerIds: Array.from(muted),
      inActiveCall: hasActiveCall,
    });
  }, [
    nativeMode,
    token,
    enabled,
    user?.notificationMutedUsers,
    user?.mutedUsers,
    hasActiveCall,
  ]);

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

  const shouldShowBubbleFor = useCallback(
    (peerId: string): boolean => {
      if (!enabled) return false;
      if (!userRef.current || !tokenRef.current) return false;
      if (hasActiveCall) return false;
      if (isPeerSuppressed(peerId)) return false;
      if (peerId === activeChatPeerId && document.visibilityState === "visible") return false;
      return true;
    },
    [enabled, hasActiveCall, isPeerSuppressed, activeChatPeerId],
  );

  // Foreground → in-app layer; background → OS-level bubble. Web/iOS
  // (no native support) always uses the in-app layer.
  const shouldRenderWebFallback = nativeMode === "none" || isAppForeground;
  const shouldRouteToNativeBubble = nativeMode !== "none" && !isAppForeground;

  // ── peer info lookup (cached + in-flight dedupe) ────────────────────
  const peerInfoCache = useRef<Map<string, { name: string; avatarUrl?: string }>>(new Map());
  const peerInfoInFlight = useRef<Map<string, Promise<{ name: string; avatarUrl?: string }>>>(new Map());

  const fetchPeerInfo = useCallback(
    (peerId: string, fallbackName: string): Promise<{ name: string; avatarUrl?: string }> => {
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
            const data = (await res.json()) as {
              firstName?: string;
              username?: string;
              avatarUrl?: string;
            };
            const name = data.firstName || data.username || fallbackName;
            const info: { name: string; avatarUrl?: string } = {
              name,
              avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : undefined,
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
    },
    [],
  );

  // ── add / update bubble ─────────────────────────────────────────────
  const upsertBubble = useCallback(
    async (input: { peerId: string; fallbackName: string; body: string }) => {
      if (!shouldShowBubbleFor(input.peerId)) return;

      const info = await fetchPeerInfo(input.peerId, input.fallbackName);

      // Compute the new unread count synchronously so the native plugin
      // gets the real per-peer accumulated total (Messenger requirement).
      const previousUnread = unreadByPeerRef.current.get(input.peerId) ?? 0;
      const nextUnread = previousUnread + 1;
      unreadByPeerRef.current.set(input.peerId, nextUnread);

      setBubbles((prev) => {
        const existing = prev[input.peerId];
        const nextIndex = Object.keys(prev).length;
        const next: BubblePeerState = existing
          ? {
              ...existing,
              name: info.name,
              avatarUrl: info.avatarUrl,
              lastMessage: input.body,
              unreadCount: existing.expanded ? 0 : nextUnread,
            }
          : {
              peerId: input.peerId,
              name: info.name,
              avatarUrl: info.avatarUrl,
              lastMessage: input.body,
              unreadCount: 1,
              expanded: false,
              position: initialPosition(nextIndex),
            };
        const merged = { ...prev, [input.peerId]: next };
        // Cap visible bubbles — drop oldest non-expanded if over the cap.
        const ids = Object.keys(merged);
        if (ids.length > MAX_VISIBLE_BUBBLES) {
          const drop = ids.find((id) => !merged[id].expanded && id !== input.peerId);
          if (drop) {
            unreadByPeerRef.current.delete(drop);
            const { [drop]: _dropped, ...rest } = merged;
            return rest;
          }
        }
        return merged;
      });

      if (shouldRouteToNativeBubble) {
        // Forward the accumulated per-peer unread count, not a literal 1.
        void nativeShowBubble({
          peerId: input.peerId,
          name: info.name,
          avatarUrl: info.avatarUrl,
          body: truncate(input.body, MAX_PREVIEW_LENGTH),
          unreadCount: nextUnread,
        });
      }
    },
    [fetchPeerInfo, shouldRouteToNativeBubble, shouldShowBubbleFor],
  );

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
      const { [activeChatPeerId]: _dropped, ...rest } = prev;
      return rest;
    });
    unreadByPeerRef.current.delete(activeChatPeerId);
    void nativeHideBubble(activeChatPeerId);
  }, [activeChatPeerId]);

  // ── tear-down on signout / disable / call ───────────────────────────
  useEffect(() => {
    if (enabled && user && !hasActiveCall) return;
    setBubbles({});
    unreadByPeerRef.current.clear();
    void nativeHideAllBubbles();
  }, [enabled, user, hasActiveCall]);

  // ── per-bubble actions ──────────────────────────────────────────────
  const dismissPeer = useCallback((peerId: string) => {
    setBubbles((prev) => {
      const { [peerId]: _dropped, ...rest } = prev;
      return rest;
    });
    setMiniMessagesByPeer((prev) => {
      const { [peerId]: _dropped, ...rest } = prev;
      return rest;
    });
    unreadByPeerRef.current.delete(peerId);
    void nativeHideBubble(peerId);
  }, []);

  const loadMiniMessages = useCallback(async (peerId: string) => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(peerId)}/messages?limit=20&offset=0`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as unknown;
      setMiniMessagesByPeer((prev) => ({ ...prev, [peerId]: normaliseRawMessages(data) }));
    } catch {
      /* swallow — mini chat just won't show history */
    }
  }, []);

  const togglePeerExpanded = useCallback(
    (peerId: string) => {
      setBubbles((prev) => {
        const existing = prev[peerId];
        if (!existing) return prev;
        const expanded = !existing.expanded;
        if (expanded) unreadByPeerRef.current.set(peerId, 0);
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
    },
    [loadMiniMessages],
  );

  const sendQuickReply = useCallback(
    async (peerId: string) => {
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
          const sent = (await res.json().catch(() => ({}))) as SendMessageResponse;
          const senderId = userRef.current?.id || "";
          const messageId = sent.message?.id ?? sent.id ?? clientMessageId;
          setMiniMessagesByPeer((prev) => {
            const list = prev[peerId] || [];
            return {
              ...prev,
              [peerId]: [
                ...list,
                {
                  id: String(messageId),
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
    },
    [draftByPeer, t, toast],
  );

  // ── drag / snap-to-edge / drag-to-dismiss ──────────────────────────
  const dragStateRef = useRef<{
    peerId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const isOverDismissZone = useCallback((clientX: number, clientY: number): boolean => {
    if (typeof window === "undefined") return false;
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight - DISMISS_ZONE_HEIGHT / 2 - EDGE_MARGIN;
    const dx = clientX - targetX;
    const dy = clientY - targetY;
    return Math.hypot(dx, dy) < DISMISS_HIT_RADIUS;
  }, []);

  const handlePointerDown = useCallback((peerId: string, ev: React.PointerEvent<HTMLDivElement>) => {
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      peerId,
      pointerId: ev.pointerId,
      offsetX: ev.clientX - rect.left,
      offsetY: ev.clientY - rect.top,
      moved: false,
    };
    target.setPointerCapture(ev.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== ev.pointerId) return;
      const newX = ev.clientX - drag.offsetX;
      const newY = ev.clientY - drag.offsetY;
      if (!drag.moved) {
        // Treat any noticeable movement as a drag (vs. a tap).
        if (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2) {
          drag.moved = true;
          setDraggingPeerId(drag.peerId);
        }
      }
      if (drag.moved) {
        setPointerOverDismiss(isOverDismissZone(ev.clientX, ev.clientY));
        setBubbles((prev) => {
          const existing = prev[drag.peerId];
          if (!existing) return prev;
          return {
            ...prev,
            [drag.peerId]: { ...existing, position: { x: newX, y: newY } },
          };
        });
      }
    },
    [isOverDismissZone],
  );

  const handlePointerUp = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== ev.pointerId) return;
      const target = ev.currentTarget as HTMLElement;
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        /* pointer may already be released */
      }
      const wasDragging = drag.moved;
      const releasedOnDismiss = wasDragging && isOverDismissZone(ev.clientX, ev.clientY);
      const peerId = drag.peerId;
      dragStateRef.current = null;
      setDraggingPeerId(null);
      setPointerOverDismiss(false);

      if (releasedOnDismiss) {
        dismissPeer(peerId);
        return;
      }
      if (!wasDragging) {
        togglePeerExpanded(peerId);
        return;
      }
      // Snap to nearest edge.
      setBubbles((prev) => {
        const existing = prev[peerId];
        if (!existing || typeof window === "undefined") return prev;
        const snapped = snapPosition(
          existing.position.x,
          existing.position.y,
          window.innerWidth,
          window.innerHeight,
        );
        return { ...prev, [peerId]: { ...existing, position: snapped } };
      });
    },
    [dismissPeer, isOverDismissZone, togglePeerExpanded],
  );

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
      {visible.map((bubble) => {
        const initials = (bubble.name || "?").trim().charAt(0).toUpperCase();
        const messages = miniMessagesByPeer[bubble.peerId] || [];
        const draft = draftByPeer[bubble.peerId] || "";
        const sending = sendingPeer === bubble.peerId;
        const isDragging = draggingPeerId === bubble.peerId;
        return (
          <div
            key={bubble.peerId}
            className="absolute pointer-events-auto select-none touch-none"
            style={{
              top: bubble.position.y,
              left: bubble.position.x,
              transition: isDragging ? "none" : "top 200ms ease, left 200ms ease",
            }}
            data-testid={`chat-bubble-${bubble.peerId}`}
            onPointerDown={(e) => handlePointerDown(bubble.peerId, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Floating circle */}
            <div
              className={`relative h-14 w-14 rounded-full bg-primary shadow-xl ring-2 ring-background overflow-hidden flex items-center justify-center text-primary-foreground ${
                isDragging ? "scale-110" : "hover:scale-105"
              } transition-transform cursor-grab active:cursor-grabbing`}
              role="button"
              tabIndex={0}
              aria-label={t("chatBubbles.openChat")}
              data-testid={`chat-bubble-toggle-${bubble.peerId}`}
            >
              {bubble.avatarUrl ? (
                <img
                  src={bubble.avatarUrl}
                  alt={bubble.name}
                  className="h-full w-full object-cover pointer-events-none"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-lg font-semibold pointer-events-none">{initials}</span>
              )}
              {bubble.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center pointer-events-none">
                  {bubble.unreadCount > 9 ? "9+" : bubble.unreadCount}
                </span>
              )}
            </div>

            {/* Mini chat panel */}
            {bubble.expanded && !isDragging && (
              <div
                className="absolute right-16 top-0 w-72 max-w-[calc(100vw-96px)] bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: "60vh" }}
                data-testid={`chat-bubble-panel-${bubble.peerId}`}
                onPointerDown={(e) => e.stopPropagation()}
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
                    onChange={(e) =>
                      setDraftByPeer((prev) => ({ ...prev, [bubble.peerId]: e.target.value }))
                    }
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

      {/* Drag-to-dismiss target — appears only while a bubble is being
          dragged. Centered at the bottom, mirrors the Messenger UX. */}
      {draggingPeerId && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
          style={{
            bottom: EDGE_MARGIN,
            width: DISMISS_ZONE_HEIGHT,
            height: DISMISS_ZONE_HEIGHT,
          }}
          data-testid="chat-bubble-dismiss-zone"
        >
          <div
            className={`rounded-full flex items-center justify-center transition-all ${
              pointerOverDismiss
                ? "bg-destructive text-destructive-foreground scale-125 shadow-2xl"
                : "bg-background/90 text-muted-foreground shadow-lg border"
            }`}
            style={{ width: 64, height: 64 }}
          >
            <X className="h-7 w-7" />
          </div>
          <span className="mt-2 text-[11px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
            {t("chatBubbles.dragToDismiss")}
          </span>
        </div>
      )}
    </div>
  );
}
