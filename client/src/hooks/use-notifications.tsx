import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { type AppNotification, normalizeSafeNotificationLink } from "@/lib/notifications";

export function useNotifications() {
  const { token, user } = useAuth();
  const headers = useAuthHeaders();
  const { toast } = useToast();
  const { language } = useI18n();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const lastWsErrorToastRef = useRef<{ key: string; at: number } | null>(null);

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { headers });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: isConnected ? 60000 : 30000,
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { headers });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      const data = await res.json();
      return data.count;
    },
    enabled: !!token,
    refetchInterval: isConnected ? 30000 : 10000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("POST", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const connectWebSocket = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (isWsErrorType(data?.type)) {
          const { message, code } = extractWsErrorInfo(data);
          if (message) {
            const now = Date.now();
            const dedupeKey = `${String(data?.type || "ws_error")}:${code || "unknown_code"}:${message}`;
            const shouldSkipDuplicate =
              lastWsErrorToastRef.current?.key === dedupeKey
              && now - lastWsErrorToastRef.current.at < 5000;

            if (shouldSkipDuplicate) {
              return;
            }

            lastWsErrorToastRef.current = { key: dedupeKey, at: now };
            toast({
              title: language === "ar" ? "خطأ" : "Error",
              description: message,
              variant: "destructive",
            });
          }
          return;
        }

        if (data.type === "new_notification") {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });

          const notification = data.data as AppNotification;
          const title = language === "ar" && notification.titleAr ? notification.titleAr : notification.title;
          const message = language === "ar" && notification.messageAr ? notification.messageAr : notification.message;

          toast({
            title,
            description: message,
            variant: notification.priority === "urgent" || notification.priority === "high" ? "destructive" : "default",
          });
        }

        if (data.type === "unread_notifications") {
          queryClient.setQueryData(["/api/notifications"], data.data);
        }

        // Handle system events like game config changes
        if (data.type === "system_event") {
          const event = data.event;
          if (event?.type === 'game_config_changed') {
            // Invalidate multiplayer games cache to refresh game config
            queryClient.invalidateQueries({ queryKey: ['/api/multiplayer-games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/external-games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/games'] });
            queryClient.invalidateQueries({ queryKey: ['/api/games/available'] });
            queryClient.invalidateQueries({ queryKey: ['/api/config-version/multiplayer_games_version'] });

            // Show user-facing toast notification
            toast({
              title: language === 'ar' ? 'تم تحديث إعدادات اللعبة' : 'Game settings updated',
              description: language === 'ar'
                ? 'تم تطبيق أحدث إعدادات اللعبة'
                : 'Latest game configuration has been applied',
            });
          }
        }

        // Handle real-time challenge updates
        if (data.type === "challenge_update") {
          // Invalidate all challenge-related queries for real-time updates
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/public'] });
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/available'] });
          queryClient.invalidateQueries({ queryKey: ['/api/challenges/my'] });

          // Show toast for new challenges (optional - can be noisy)
          if (data.eventType === 'created' && data.data?.visibility === 'public') {
            toast({
              title: language === 'ar' ? 'تحدي جديد!' : 'New Challenge!',
              description: language === 'ar'
                ? `${data.data.player1Name} أنشأ تحدي ${data.data.gameType}`
                : `${data.data.player1Name} created a ${data.data.gameType} challenge`,
            });
          }
        }

        // Handle game start - redirect player1 (creator) to game screen
        if (data.type === "game_start") {
          const payload = data.payload;
          const safeRedirectUrl = normalizeSafeNotificationLink(payload?.redirectUrl);
          if (safeRedirectUrl && user?.id) {
            // Only redirect player1 (creator) - player2 is already redirected via mutation onSuccess
            if (payload.player1Id === user.id) {
              toast({
                title: language === 'ar' ? 'بدأت المباراة!' : 'Game Started!',
                description: language === 'ar'
                  ? 'جاري الانتقال إلى اللعبة...'
                  : 'Redirecting to game...',
              });
              // Direct navigation for challenge creator
              window.location.assign(safeRedirectUrl);
            }
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [token, toast, language, user]);

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
      }
    };
  }, [token, user, connectWebSocket]);

  const getLocalizedContent = useCallback((notification: AppNotification) => {
    return {
      title: language === "ar" && notification.titleAr ? notification.titleAr : notification.title,
      message: language === "ar" && notification.messageAr ? notification.messageAr : notification.message,
    };
  }, [language]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    getLocalizedContent,
  };
}
