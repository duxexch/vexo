import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { type AppNotification, getFinancialNotificationReference, normalizeSafeNotificationLink } from "@/lib/notifications";
import { playSound } from "@/hooks/use-sound-effects";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  BellRing,
  Megaphone,
  Shield,
  Gift,
  Cog,
  Users,
  Check,
  CheckCheck,
  Copy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";

const notificationIcons: Record<string, typeof Bell> = {
  announcement: Megaphone,
  transaction: Bell,
  security: Shield,
  promotion: Gift,
  system: Cog,
  p2p: Users,
  id_verification: Shield,
  success: Check,
  warning: BellRing,
};

const priorityColors: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-orange-500",
  urgent: "text-destructive",
};

export function NotificationBell() {
  const { token } = useAuth();
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [hasNewPulse, setHasNewPulse] = useState(false);

  const { data: unreadCountData, refetch: refetchUnreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!token,
    refetchInterval: 30000,
  });

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!token && open,
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

  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  }, [open]);

  const unreadCount = unreadCountData?.count || 0;
  const hasUnread = unreadCount > 0;
  const prevUnreadRef = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
      playSound('notification');
      // Trigger pulse animation for 4 seconds
      setHasNewPulse(true);
      const timer = setTimeout(() => setHasNewPulse(false), 4000);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const getNotificationTitle = (notification: AppNotification) => {
    if (language === "ar" && notification.titleAr) {
      return notification.titleAr;
    }
    return notification.title;
  };

  const getNotificationMessage = (notification: AppNotification) => {
    if (language === "ar" && notification.messageAr) {
      return notification.messageAr;
    }
    return notification.message;
  };

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: true,
        locale: language === "ar" ? ar : enUS,
      });
    } catch {
      return "";
    }
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    const safeTarget = normalizeSafeNotificationLink(notification.link);
    navigate(safeTarget || (notification.type === "transaction" ? "/transactions" : "/notifications"));
    setOpen(false);
  };

  const getIcon = (type: string) => {
    const Icon = notificationIcons[type] || Bell;
    return Icon;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative overflow-visible"
          aria-label="Notifications"
          data-testid="button-notification-bell"
        >
          {hasUnread ? (
            <BellRing className={`h-5 w-5 ${hasNewPulse ? 'animate-bounce text-primary' : ''}`} />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {hasUnread && (
            <Badge
              variant="destructive"
              className={`absolute -top-1 -end-1 z-10 h-5 min-w-5 px-1 py-0 flex items-center justify-center text-xs leading-none no-default-hover-elevate no-default-active-elevate ${hasNewPulse ? 'animate-pulse' : ''}`}
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
          {hasNewPulse && hasUnread && (
            <span className="absolute -top-1 -end-1 h-5 w-5 rounded-full bg-destructive/40 animate-ping pointer-events-none" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <h4 className="font-semibold text-sm">{t("notifications.title")}</h4>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="text-xs"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3 me-1" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div
              className="p-8 text-center text-sm text-muted-foreground"
              data-testid="text-no-notifications"
            >
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("notifications.empty")}</p>
            </div>
          ) : (
            <div>
              {notifications.slice(0, 15).map((notification, index) => {
                const Icon = getIcon(notification.type);
                return (
                  <div key={notification.id}>
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-start p-3 hover-elevate transition-colors ${notification.isRead ? "opacity-70" : "bg-muted/30"
                        }`}
                      data-testid={`notification-item-${notification.id}`}
                    >
                      <div className="flex gap-3">
                        <div
                          className={`flex-shrink-0 mt-0.5 ${priorityColors[notification.priority]}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm font-medium truncate ${notification.isRead ? "" : "font-semibold"
                                }`}
                              data-testid={`notification-title-${notification.id}`}
                            >
                              {getNotificationTitle(notification)}
                            </p>
                            {!notification.isRead && (
                              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                            )}
                          </div>
                          <p
                            className="text-xs text-muted-foreground line-clamp-2 mt-0.5"
                            data-testid={`notification-message-${notification.id}`}
                          >
                            {getNotificationMessage(notification)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(notification.createdAt)}
                          </p>
                          {notification.type === "transaction" && (() => {
                            const reference = getFinancialNotificationReference(notification);
                            if (!reference) return null;
                            return (
                              <div className="mt-1 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px]">
                                <span className="font-medium text-primary">Ref:</span>
                                <span className="font-mono">{reference}</span>
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-primary hover:bg-primary/10"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigator.clipboard.writeText(reference).then(() => {
                                      toast({ title: "Reference copied", description: reference });
                                    }).catch(() => {
                                      toast({ title: "Copy failed", description: "Could not copy reference", variant: "destructive" });
                                    });
                                  }}
                                  aria-label="Copy transaction reference"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </button>
                    {index < Math.min(notifications.length, 15) - 1 && <Separator />}
                  </div>
                );
              })}
              {/* View All link */}
              <Separator />
              <button
                onClick={() => { navigate('/notifications'); setOpen(false); }}
                className="w-full p-2.5 text-center text-xs font-medium text-primary hover:bg-muted/50 transition-colors"
              >
                {t("notifications.viewAll") || (language === 'ar' ? 'عرض جميع الإشعارات' : 'View All Notifications')}
              </button>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
