import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, AlertTriangle, Info, AlertCircle, Flame, Check, ExternalLink } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { playSound } from "@/hooks/use-sound-effects";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

interface AdminAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  titleAr: string | null;
  message: string;
  messageAr: string | null;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
}

export function AdminAlertsDropdown() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isUnmountingRef = useRef(false);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const { data: alerts = [] } = useQuery<AdminAlert[]>({
    queryKey: ["/api/admin/alerts"],
    queryFn: () => adminFetch("/api/admin/alerts?limit=20"),
    refetchInterval: 30000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/alerts/count"],
    queryFn: () => adminFetch("/api/admin/alerts/count"),
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/alerts/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => adminFetch("/api/admin/alerts/read-all", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });
    },
  });

  const navigateToDeepLink = useCallback((alert: Pick<AdminAlert, "deepLink" | "entityType" | "entityId">) => {
    let deepLink = alert.deepLink;

    if (alert.entityType === "support_ticket" && alert.entityId) {
      try {
        const parsed = new URL(deepLink || "/admin/chat-management", window.location.origin);
        parsed.searchParams.set("tab", "support");
        parsed.searchParams.set("ticketId", alert.entityId);
        deepLink = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        deepLink = `/admin/chat-management?tab=support&ticketId=${encodeURIComponent(alert.entityId)}`;
      }
    }

    if (!deepLink) return;

    try {
      const parsed = new URL(deepLink, window.location.origin);
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (path.startsWith("/admin")) {
        setLocation(path);
      }
    } catch {
      if (deepLink.startsWith("/admin")) {
        setLocation(deepLink);
      }
    }
  }, [setLocation]);

  const playAdminAlertSound = useCallback((severity: string) => {
    if (severity === "urgent") {
      playSound("urgent_alarm");
      return;
    }
    if (severity === "critical") {
      playSound("security_alert");
      return;
    }
    if (severity === "warning") {
      playSound("support");
      return;
    }
    playSound("notification");
  }, []);

  const handleNewAlert = useCallback((alert: AdminAlert) => {
    if (!alert?.id) return;
    if (seenAlertIdsRef.current.has(alert.id)) return;

    seenAlertIdsRef.current.add(alert.id);

    queryClient.setQueryData<AdminAlert[]>(["/api/admin/alerts"], (previous) => {
      const list = previous || [];
      const next = [alert, ...list.filter((item) => item.id !== alert.id)];
      return next.slice(0, 20);
    });

    queryClient.setQueryData<{ count: number }>(["/api/admin/alerts/count"], (previous) => {
      const prevCount = previous?.count || 0;
      const increment = alert.isRead ? 0 : 1;
      return { count: prevCount + increment };
    });

    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });

    playAdminAlertSound(alert.severity);

    toast({
      title: alert.title,
      description: alert.message,
    });

    if (typeof Notification !== "undefined" && Notification.permission === "granted" && alert.title) {
      try {
        const browserNotification = new Notification(alert.title, {
          body: alert.message || "",
          icon: "/icons/vex-gaming-logo-192x192.png",
          tag: `vex-admin-alert-${alert.id}`,
          requireInteraction: true,
        });

        browserNotification.onclick = () => {
          window.focus();
          navigateToDeepLink(alert);
          browserNotification.close();
        };

        setTimeout(() => browserNotification.close(), 15000);
      } catch {
        // Ignore browser notification failures.
      }
    }
  }, [navigateToDeepLink, playAdminAlertSound, toast]);

  useEffect(() => {
    alerts.forEach((alert) => {
      if (alert?.id) {
        seenAlertIdsRef.current.add(alert.id);
      }
    });
  }, [alerts]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Ignore notification permission failures.
      });
    }
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    isUnmountingRef.current = false;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        ws.send(JSON.stringify({ type: "admin_auth", token }));
      };

      ws.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        const payloadRecord = typeof payload === "object" && payload !== null
          ? payload as Record<string, unknown>
          : null;

        const messages = payloadRecord?.type === "batch" && Array.isArray(payloadRecord.messages)
          ? payloadRecord.messages
          : [payload];

        messages.forEach((message) => {
          if (!message || typeof message !== "object") return;

          const typedMessage = message as { type?: string; data?: AdminAlert; count?: number };
          if (typedMessage.type === "admin_alert" && typedMessage.data) {
            handleNewAlert(typedMessage.data);
          }

          if (typedMessage.type === "admin_alert_count" && typeof typedMessage.count === "number") {
            queryClient.setQueryData(["/api/admin/alerts/count"], { count: typedMessage.count });
          }
        });
      };

      ws.onclose = () => {
        if (isUnmountingRef.current) return;

        const nextAttempt = Math.min(reconnectAttemptRef.current + 1, 8);
        reconnectAttemptRef.current = nextAttempt;
        const reconnectDelayMs = Math.min(10000, 500 * (2 ** nextAttempt));

        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, reconnectDelayMs);
      };

      ws.onerror = () => {
        // onclose handles retry.
      };
    };

    connect();

    return () => {
      isUnmountingRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      wsRef.current?.close();
    };
  }, [handleNewAlert]);

  const handleAlertClick = (alert: AdminAlert) => {
    if (!alert.isRead) {
      queryClient.setQueryData<AdminAlert[]>(["/api/admin/alerts"], (previous) => {
        if (!previous) return previous;
        return previous.map((item) => item.id === alert.id ? { ...item, isRead: true } : item);
      });

      queryClient.setQueryData<{ count: number }>(["/api/admin/alerts/count"], (previous) => {
        const current = previous?.count || 0;
        return { count: Math.max(0, current - 1) };
      });

      markReadMutation.mutate(alert.id);
    }

    navigateToDeepLink(alert);
    setIsOpen(false);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "urgent": return <Flame className="h-4 w-4 text-red-500" />;
      case "critical": return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "destructive" | "secondary" | "outline" | "default"> = {
      urgent: "destructive",
      critical: "destructive",
      warning: "secondary",
      info: "outline",
    };
    return variants[severity] || "outline";
  };

  const unreadCount = countData?.count || 0;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-admin-alerts">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alerts</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <Check className="h-3 w-3 me-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80">
          {alerts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No alerts
            </div>
          ) : (
            alerts.map((alert) => (
              <DropdownMenuItem
                key={alert.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${!alert.isRead ? 'bg-muted/50' : ''}`}
                onClick={() => handleAlertClick(alert)}
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="flex items-center gap-2 w-full">
                  {getSeverityIcon(alert.severity)}
                  <span className="font-medium text-sm flex-1 truncate">{alert.title}</span>
                  <Badge variant={getSeverityBadge(alert.severity)} className="text-[10px]">
                    {alert.severity}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 ps-6">{alert.message}</p>
                <div className="flex items-center justify-between w-full ps-6">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                  </span>
                  {alert.deepLink && (
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
