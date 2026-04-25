/**
 * NotificationProvider — Global real-time notification system
 * Phase 1-5: Infrastructure for sound + visual + WebSocket notifications
 * 
 * This provider MUST wrap the authenticated layout to enable:
 * - WebSocket connection for real-time notification delivery
 * - Sound alerts (Web Audio API) on new notifications
 * - Visual toast notifications with priority-based styling
 * - Browser native notifications (if permission granted)
 * - Cache invalidation for notification queries
 */
import { useEffect, useRef, useCallback, createContext, useContext, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { playSound } from "@/hooks/use-sound-effects";
import {
  type AppNotification,
  navigateToSafeNotificationLink,
  normalizeSafeNotificationLink,
  syncPushSubscriptionWithServer,
} from "@/lib/notifications";

// Sound mapping by notification type — using new distinctive sounds
const NOTIFICATION_SOUND_MAP: Record<string, Parameters<typeof playSound>[0]> = {
  transaction: 'transaction_alert',
  p2p: 'transaction_alert',
  security: 'security_alert',
  warning: 'security_alert',
  announcement: 'notification',
  promotion: 'promo_chime',
  system: 'notification',
  id_verification: 'success',
  success: 'success',
  chat: 'chat_incoming',
  challenge: 'challenge',
  support: 'support',
  game: 'level_up',
};

// Priority-based sound override
const PRIORITY_SOUND_MAP: Record<string, Parameters<typeof playSound>[0]> = {
  urgent: 'urgent_alarm',
  high: 'notification',
};

interface NotificationContextType {
  isConnected: boolean;
  unreadCount: number;
  sectionCounts: Record<string, number>;
  markSectionRead: (section: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  isConnected: false,
  unreadCount: 0,
  sectionCounts: {},
  markSectionRead: () => { },
});

export function useNotificationStatus() {
  return useContext(NotificationContext);
}

// Map URL path to section key for auto-read
function routeToSection(path: string): string | null {
  const map: [string, string][] = [
    ['/wallet', 'wallet'],
    ['/transactions', 'transactions'],
    ['/p2p', 'p2p'],
    ['/challenges', 'challenges'],
    ['/multiplayer', 'multiplayer'],
    ['/chat', 'chat'],
    ['/support', 'support'],
    ['/settings', 'settings'],
    ['/friends', 'friends'],
    ['/notifications', 'notifications'],
    ['/games', 'games'],
    ['/free', 'free'],
    ['/admin', 'admin'],
    ['/leaderboard', 'leaderboard'],
    ['/affiliates', 'affiliates'],
  ];
  for (const [prefix, section] of map) {
    if (path === prefix || path.startsWith(prefix + '/')) return section;
  }
  if (path === '/' || path === '') return 'dashboard';
  return null;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const { language } = useI18n();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 15;
  const languageRef = useRef(language);
  const userRef = useRef(user);
  const recentNotificationKeysRef = useRef<Map<string, number>>(new Map());
  const pushSyncStartedRef = useRef(false);

  // Keep refs updated to avoid stale closures in WebSocket callbacks
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { userRef.current = user; }, [user]);

  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!token,
    refetchInterval: isConnected ? 60000 : 20000,
  });

  const unreadCount = unreadCountData?.count || 0;

  // Fetch per-section unread counts
  const { data: sectionCountsData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["/api/notifications/section-counts"],
    enabled: !!token,
    refetchInterval: isConnected ? 60000 : 30000,
  });

  const sectionCounts = sectionCountsData?.counts || {};

  // Mark section notifications as read
  const markSectionReadMutation = useMutation({
    mutationFn: async (section: string) => {
      await apiRequest("POST", "/api/notifications/read-section", { section });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/section-counts"] });
    },
  });

  const markSectionRead = useCallback((section: string) => {
    if (sectionCounts[section] && sectionCounts[section] > 0) {
      markSectionReadMutation.mutate(section);
    }
  }, [sectionCounts, markSectionReadMutation]);

  // Auto-mark section as read when user navigates to it
  const [location] = useLocation();
  const prevLocationRef = useRef(location);

  const getNotificationMetadata = useCallback((notification: AppNotification): Record<string, unknown> | null => {
    if (!notification.metadata) return null;
    try {
      const parsed = JSON.parse(notification.metadata) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (location === prevLocationRef.current) return;
    prevLocationRef.current = location;

    // Map route to section key
    const sectionKey = routeToSection(location);
    if (sectionKey && sectionCounts[sectionKey] && sectionCounts[sectionKey] > 0) {
      // Delay slightly so page renders first
      const timer = setTimeout(() => markSectionRead(sectionKey), 500);
      return () => clearTimeout(timer);
    }
  }, [location, sectionCounts, markSectionRead]);

  const showNotificationToast = useCallback((notification: AppNotification) => {
    const lang = languageRef.current;
    const title = lang === "ar" && notification.titleAr ? notification.titleAr : notification.title;
    const message = lang === "ar" && notification.messageAr ? notification.messageAr : notification.message;
    const titleAr = notification.titleAr || notification.title;
    const messageAr = notification.messageAr || notification.message;
    const safeLink = normalizeSafeNotificationLink(notification.link);
    const metadata = getNotificationMetadata(notification);
    const metadataEvent = typeof metadata?.event === "string" ? metadata.event : null;
    const metadataSessionId = typeof metadata?.sessionId === "string" ? metadata.sessionId : null;
    const isPrivateCallInvite = metadataEvent === "private_call_invite";
    const chatSenderId = typeof metadata?.senderId === "string" ? metadata.senderId : null;
    const urlParams = new URLSearchParams(window.location.search);
    const openChatUser = urlParams.get("user");
    const isUserInSameChatThread = location.startsWith("/chat")
      && !!chatSenderId
      && openChatUser === chatSenderId
      && document.visibilityState === "visible";

    // Play sound based on priority first, then type
    const soundKey = metadataEvent === "chat_message"
      ? "chat_incoming"
      : (PRIORITY_SOUND_MAP[notification.priority] || NOTIFICATION_SOUND_MAP[notification.type] || 'notification');

    if (!isUserInSameChatThread) {
      playSound(soundKey);
    }

    if (isUserInSameChatThread) {
      return;
    }

    // Task #89: surface incoming DMs as Messenger-style floating
    // bubbles. We dispatch unconditionally for chat events that survived
    // the "same thread" suppression above; the bubble layer itself
    // applies the muted-peer / active-call / preference checks so the
    // notification toast and bubble logic stay decoupled.
    if (metadataEvent === "chat_message" && chatSenderId) {
      window.dispatchEvent(
        new CustomEvent("vex-incoming-dm", {
          detail: {
            senderId: chatSenderId,
            title: notification.title,
            titleAr,
            message: notification.message,
            messageAr,
            link: safeLink || `/chat?user=${encodeURIComponent(chatSenderId)}`,
            messageId: typeof metadata?.messageId === "string" ? metadata.messageId : null,
          },
        }),
      );
    }

    // Show professional popup notification (VexNotificationPopup)
    window.dispatchEvent(new CustomEvent("vex-show-popup", {
      detail: {
        type: isPrivateCallInvite ? "challenge" : (notification.type || "system"),
        priority: notification.priority || "normal",
        title: notification.title,
        titleAr,
        message: notification.message,
        messageAr,
        link: safeLink || undefined,
        duration: isPrivateCallInvite ? 15000 : (notification.priority === "urgent" ? 10000 : notification.priority === "high" ? 7000 : 5000),
      },
    }));

    // Browser native push notification (for lock screen / background)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        // Use Service Worker for persistent notifications when available
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            options: {
              body: message,
              icon: '/icons/vex-gaming-logo-192x192.png',
              badge: '/icons/vex-gaming-logo-96x96.png',
              tag: isPrivateCallInvite && metadataSessionId
                ? `vex-private-call-${metadataSessionId}`
                : `vex-${notification.type}-${notification.id}`,
              renotify: !!isPrivateCallInvite,
              requireInteraction: isPrivateCallInvite || notification.priority === 'urgent',
              vibrate: notification.priority === 'urgent' ? [200, 80, 200, 80, 200] :
                notification.priority === 'high' ? [200, 100, 200] : [150, 80, 150],
              data: {
                url: safeLink || '/',
                notificationType: isPrivateCallInvite ? 'private_call_invite' : notification.type,
                soundType: isPrivateCallInvite ? 'challenge' : notification.type,
              },
              actions: isPrivateCallInvite
                ? [
                  { action: 'open_call', title: languageRef.current === 'ar' ? 'فتح المكالمة' : 'Open call' },
                  { action: 'dismiss', title: languageRef.current === 'ar' ? 'إغلاق' : 'Dismiss' },
                ]
                : [{ action: 'dismiss', title: languageRef.current === 'ar' ? 'إغلاق' : 'Dismiss' }],
              dir: languageRef.current === 'ar' ? 'rtl' : 'ltr',
              lang: languageRef.current || 'en',
              silent: false,
              timestamp: Date.now(),
            },
          });
        } else {
          // Fallback to basic Notification API
          const browserNotif = new Notification(title, {
            body: message,
            icon: '/icons/vex-gaming-logo-192x192.png',
            tag: `vex-${notification.id}`,
            requireInteraction: isPrivateCallInvite || notification.priority === 'urgent',
          });
          browserNotif.onclick = () => {
            window.focus();
            navigateToSafeNotificationLink(safeLink);
            browserNotif.close();
          };
          setTimeout(() => browserNotif.close(), 8000);
        }
      } catch { }
    }

    // Vibrate on mobile (if supported)
    if (navigator.vibrate) {
      if (notification.priority === 'urgent') {
        navigator.vibrate([200, 100, 200, 100, 200]);
      } else if (notification.priority === 'high') {
        navigator.vibrate([200, 100, 200]);
      } else {
        navigator.vibrate(100);
      }
    }
  }, [getNotificationMetadata, location]);

  const isBadgeAssignmentNotification = useCallback((notification: AppNotification): boolean => {
    if (notification.type !== "success" || !notification.metadata) {
      return false;
    }

    try {
      const metadata = JSON.parse(notification.metadata) as { event?: string };
      return metadata?.event === "badge_assigned";
    } catch {
      return false;
    }
  }, []);

  const isDuplicateRealtimeNotification = useCallback((notification: AppNotification): boolean => {
    const now = Date.now();
    const dedupeWindowMs = 15000;

    const fallbackKey = `${notification.type || 'system'}:${notification.title || ''}:${notification.message || ''}:${notification.link || ''}`;
    const key = notification.id ? `id:${notification.id}` : `fallback:${fallbackKey}`;

    const cache = recentNotificationKeysRef.current;
    for (const [cachedKey, seenAt] of cache) {
      if (now - seenAt > dedupeWindowMs) {
        cache.delete(cachedKey);
      }
    }

    const seenAt = cache.get(key);
    if (seenAt && now - seenAt < dedupeWindowMs) {
      return true;
    }

    cache.set(key, now);
    return false;
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!token) return;

    const currentSocket = wsRef.current;
    if (currentSocket && (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close(1000, "superseded");
        return;
      }

      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) {
        return;
      }

      try {
        const data = JSON.parse(event.data);

        // ====== NEW NOTIFICATION (real-time from server) ======
        if (data.type === "new_notification") {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/section-counts"] });
          const notification = data.data as AppNotification;

          if (isBadgeAssignmentNotification(notification)) {
            queryClient.invalidateQueries({ queryKey: ["/api/me/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

            const currentUserId = userRef.current?.id;
            if (currentUserId) {
              queryClient.invalidateQueries({ queryKey: ["/api/player", currentUserId, "stats"] });
            }
          }

          if (isDuplicateRealtimeNotification(notification)) {
            return;
          }

          showNotificationToast(notification);
        }

        // ====== INITIAL UNREAD NOTIFICATIONS (on connect) ======
        if (data.type === "unread_notifications") {
          queryClient.setQueryData(["/api/notifications"], data.data);
        }

        // ====== SYSTEM EVENTS ======
        if (data.type === "system_event") {
          const event = data.event;
          if (event?.type === 'game_config_changed') {
            queryClient.invalidateQueries({ queryKey: ['/api/multiplayer-games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/external-games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/games/available'] });
            queryClient.invalidateQueries({ queryKey: ['/api/config-version/multiplayer_games_version'] });
            playSound('notification');
            const lang = languageRef.current;
            window.dispatchEvent(new CustomEvent("vex-show-popup", {
              detail: {
                type: "system",
                priority: "normal",
                title: 'Game settings updated',
                titleAr: 'تم تحديث إعدادات اللعبة',
                message: 'Latest game configuration has been applied',
                messageAr: 'تم تطبيق أحدث إعدادات اللعبة',
              },
            }));
          }
          if (event?.type === 'p2p_settings_changed') {
            queryClient.invalidateQueries({ queryKey: ['/api/p2p'] });
            const lang = languageRef.current;
            playSound('notification');
            window.dispatchEvent(new CustomEvent("vex-show-popup", {
              detail: {
                type: "p2p",
                priority: "normal",
                title: 'P2P Settings Updated',
                titleAr: 'تحديث إعدادات P2P',
                message: 'Trading settings have been updated',
                messageAr: 'تم تحديث إعدادات التداول',
              },
            }));
          }
          if (event?.type === 'config_updated') {
            queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
            queryClient.invalidateQueries({ queryKey: ['/api/sections'] });
          }
        }

        // ====== CHALLENGE UPDATES ======
        if (data.type === "challenge_update") {
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/public'] });
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/available'] });
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/my'] });

          // Only show popup for friend challenges targeted at this user, not all public challenges
          if (data.eventType === 'created' && data.data?.opponentType === 'friend' && data.data?.player2Id === userRef.current?.id) {
            const lang = languageRef.current;
            playSound('challenge');
            window.dispatchEvent(new CustomEvent("vex-show-popup", {
              detail: {
                type: "challenge",
                priority: "high",
                title: 'You\'ve Been Challenged!',
                titleAr: 'تم تحديك!',
                message: `${data.data.player1Name} challenged you to ${data.data.gameType}`,
                messageAr: `${data.data.player1Name} تحداك في ${data.data.gameType}`,
                link: '/challenges',
              },
            }));
          }
        }

        // ====== GAME START ======
        if (data.type === "game_start") {
          const payload = data.payload;
          const currentUser = userRef.current;
          const safeRedirectUrl = normalizeSafeNotificationLink(payload?.redirectUrl);
          if (safeRedirectUrl && currentUser?.id) {
            // Check if current user is any player in the game (not just player1)
            const playerIds = [payload.player1Id, payload.player2Id, payload.player3Id, payload.player4Id].filter(Boolean);
            if (playerIds.includes(currentUser.id)) {
              const lang = languageRef.current;
              playSound('level_up');
              window.dispatchEvent(new CustomEvent("vex-show-popup", {
                detail: {
                  type: "game",
                  priority: "high",
                  title: 'Game Started!',
                  titleAr: 'بدأت المباراة!',
                  message: 'Redirecting to game...',
                  messageAr: 'جاري الانتقال إلى اللعبة...',
                  duration: 3000,
                },
              }));
              setTimeout(() => {
                window.location.assign(safeRedirectUrl);
              }, 800);
            }
          }
        }

        // ====== SUPPORT MESSAGE (admin reply) ======
        if (data.type === "support_message") {
          queryClient.invalidateQueries({ queryKey: ["support-messages"] });
          queryClient.invalidateQueries({ queryKey: ["support-unread"] });
          queryClient.invalidateQueries({ queryKey: ["support-ticket"] });

          playSound('support');

          const lang = languageRef.current;
          const msgContent = data.data?.content || '';
          window.dispatchEvent(new CustomEvent("vex-show-popup", {
            detail: {
              type: "support",
              priority: "high",
              title: 'Support Reply 💬',
              titleAr: 'رد من الدعم الفني 💬',
              message: msgContent.substring(0, 100) || 'You have a new support message',
              messageAr: msgContent.substring(0, 100) || 'لديك رسالة جديدة من الدعم',
              duration: 8000,
            },
          }));

          // Signal support widget to show unread badge (don't force-open if user closed it)
          window.dispatchEvent(new CustomEvent('support-chat-new-message'));

          // Push notification for background/locked screen
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SHOW_NOTIFICATION',
              title: lang === 'ar' ? 'رد من الدعم الفني' : 'Support Reply',
              options: {
                body: msgContent.substring(0, 100) || (lang === 'ar' ? 'لديك رسالة جديدة من الدعم' : 'You have a new support message'),
                icon: '/icons/vex-gaming-logo-192x192.png',
                badge: '/icons/vex-gaming-logo-96x96.png',
                tag: 'vex-support-reply',
                vibrate: [200, 100, 200],
                data: { url: '/', notificationType: 'support' },
                dir: lang === 'ar' ? 'rtl' : 'ltr',
                lang: lang || 'ar',
              },
            });
          }

          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        }

        // ====== BALANCE UPDATE ======
        if (data.type === "balance_update") {
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }

      } catch (error) {
        console.error("[NotificationProvider] WebSocket message error:", error);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) {
        return;
      }

      setIsConnected(false);
      wsRef.current = null;

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      }
    };

    ws.onerror = () => {
      if (wsRef.current === ws) {
        ws.close();
      }
    };
  }, [token, showNotificationToast, maxReconnectAttempts, isDuplicateRealtimeNotification, isBadgeAssignmentNotification]);
  // Connect WebSocket when authenticated
  useEffect(() => {
    if (token && user) {
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, user, connectWebSocket]);

  // Initialize browser permission + push subscription sync.
  useEffect(() => {
    if (!user || pushSyncStartedRef.current) {
      return;
    }

    pushSyncStartedRef.current = true;
    const timer = setTimeout(() => {
      syncPushSubscriptionWithServer(token ?? undefined)
        .catch(() => { })
        .finally(() => {
          pushSyncStartedRef.current = false;
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, [token, user]);

  return (
    <NotificationContext.Provider value={{ isConnected, unreadCount, sectionCounts, markSectionRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
