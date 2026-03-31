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
  const [isOpen, setIsOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: alerts = [], refetch } = useQuery<AdminAlert[]>({
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

  const handleNewAlert = useCallback((alert: AdminAlert) => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "admin_auth", token }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "admin_alert") {
        handleNewAlert(data.data);
      }
      if (data.type === "admin_alert_count") {
        queryClient.setQueryData(["/api/admin/alerts/count"], { count: data.count });
      }
    };

    ws.onerror = () => {
      console.error("Admin alerts WebSocket error");
    };

    return () => {
      ws.close();
    };
  }, [handleNewAlert]);

  const handleAlertClick = (alert: AdminAlert) => {
    if (!alert.isRead) {
      markReadMutation.mutate(alert.id);
    }
    if (alert.deepLink) {
      setLocation(alert.deepLink);
      setIsOpen(false);
    }
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
