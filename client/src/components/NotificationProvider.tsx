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
import { type AppNotification, navigateToSafeNotificationLink, normalizeSafeNotificationLink } from "@/lib/notifications";

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
    const safeLink = normalizeSafeNotificationLink(notification.link);

    // Play sound based on priority first, then type
    const soundKey = PRIORITY_SOUND_MAP[notification.priority] || NOTIFICATION_SOUND_MAP[notification.type] || 'notification';
    playSound(soundKey);

    // Show professional popup notification (VexNotificationPopup)
    window.dispatchEvent(new CustomEvent("vex-show-popup", {
      detail: {
        type: notification.type || "system",
        priority: notification.priority || "normal",
        title,
        message,
        link: safeLink || undefined,
        duration: notification.priority === "urgent" ? 10000 : notification.priority === "high" ? 7000 : 5000,
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
              tag: `vex-${notification.type}-${notification.id}`,
              renotify: true,
              requireInteraction: notification.priority === 'urgent',
              vibrate: notification.priority === 'urgent' ? [200, 80, 200, 80, 200] :
                notification.priority === 'high' ? [200, 100, 200] : [150, 80, 150],
              data: {
                url: safeLink || '/',
                notificationType: notification.type,
                soundType: notification.type,
              },
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
            requireInteraction: notification.priority === 'urgent',
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
            queryClient.invalidateQueries({ queryKey: ['/api/config-version/multiplayer_games_version'] });
            playSound('notification');
            const lang = languageRef.current;
            window.dispatchEvent(new CustomEvent("vex-show-popup", {
              detail: {
                type: "system",
                priority: "normal",
                title: lang === 'ar' ? 'تم تحديث إعدادات اللعبة' : 'Game settings updated',
                message: lang === 'ar' ? 'تم تطبيق أحدث إعدادات اللعبة' : 'Latest game configuration has been applied',
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
                title: lang === 'ar' ? 'تحديث إعدادات P2P' : 'P2P Settings Updated',
                message: lang === 'ar' ? 'تم تحديث إعدادات التداول' : 'Trading settings have been updated',
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
                title: lang === 'ar' ? 'تم تحديك!' : 'You\'ve Been Challenged!',
                message: lang === 'ar'
                  ? `${data.data.player1Name} تحداك في ${data.data.gameType}`
                  : `${data.data.player1Name} challenged you to ${data.data.gameType}`,
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
                  title: lang === 'ar' ? 'بدأت المباراة!' : 'Game Started!',
                  message: lang === 'ar' ? 'جاري الانتقال إلى اللعبة...' : 'Redirecting to game...',
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
              title: lang === 'ar' ? 'رد من الدعم الفني 💬' : 'Support Reply 💬',
              message: msgContent.substring(0, 100) || (lang === 'ar' ? 'لديك رسالة جديدة من الدعم' : 'You have a new support message'),
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
  }, [token, showNotificationToast, maxReconnectAttempts, isDuplicateRealtimeNotification]);
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

  // Request browser notification permission on mount
  useEffect(() => {
    if (token && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Delay permission request slightly so it doesn't block initial render
      const timer = setTimeout(() => {
        Notification.requestPermission().catch(() => { });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [token]);

  return (
    <NotificationContext.Provider value={{ isConnected, unreadCount, sectionCounts, markSectionRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
