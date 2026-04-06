import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
  Loader2,
  Filter,
  Inbox,
  Search,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { type AppNotification, isSafeNotificationLink } from "@/lib/notifications";
import { NotificationSkeleton } from "@/components/skeletons";

const notificationIcons: Record<string, typeof Bell> = {
  announcement: Megaphone,
  transaction: Bell,
  security: Shield,
  promotion: Gift,
  system: Cog,
  p2p: Users,
  id_verification: Shield,
  success: CheckCheck,
  warning: BellRing,
};

const typeLabels: Record<string, { en: string; ar: string }> = {
  announcement: { en: "Announcement", ar: "إعلان" },
  transaction: { en: "Transaction", ar: "معاملة" },
  security: { en: "Security", ar: "أمان" },
  promotion: { en: "Promotion", ar: "عرض" },
  system: { en: "System", ar: "نظام" },
  p2p: { en: "P2P", ar: "P2P" },
  id_verification: { en: "Verification", ar: "توثيق" },
  success: { en: "Success", ar: "نجاح" },
  warning: { en: "Warning", ar: "تنبيه" },
};

const typeColors: Record<string, string> = {
  announcement: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  transaction: "bg-primary/10 text-primary border-primary/30",
  security: "bg-red-500/10 text-red-500 border-red-500/30",
  promotion: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  system: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  p2p: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  id_verification: "bg-teal-500/10 text-teal-500 border-teal-500/30",
  success: "bg-green-500/10 text-green-500 border-green-500/30",
  warning: "bg-orange-500/10 text-orange-500 border-orange-500/30",
};

const priorityColors: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-orange-500",
  urgent: "text-destructive font-semibold",
};

export default function NotificationsPage() {
  const { token } = useAuth();
  const { language, dir } = useI18n();
  const [, navigate] = useLocation();
  const [typeFilter, setTypeFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const isAr = language === "ar";

  const { data: notifications = [], isLoading, isFetching } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications", page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/notifications?page=${page}&limit=${page * PAGE_SIZE}`);
      return res.json();
    },
    enabled: !!token,
  });

  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!token,
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

  // Auto-mark all notifications as read when page is opened
  const hasAutoMarked = useRef(false);
  useEffect(() => {
    if (!hasAutoMarked.current && unreadCountData?.count && unreadCountData.count > 0) {
      hasAutoMarked.current = true;
      markAllAsReadMutation.mutate();
    }
  }, [unreadCountData?.count]);

  const getTitle = (n: AppNotification) =>
    isAr && n.titleAr ? n.titleAr : n.title;

  const getMessage = (n: AppNotification) =>
    isAr && n.messageAr ? n.messageAr : n.message;

  const unreadCount = unreadCountData?.count || 0;

  // Apply filters (including search)
  const filtered = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (readFilter === "unread" && n.isRead) return false;
    if (readFilter === "read" && !n.isRead) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const title = (isAr && n.titleAr ? n.titleAr : n.title || '').toLowerCase();
      const message = (isAr && n.messageAr ? n.messageAr : n.message || '').toLowerCase();
      if (!title.includes(q) && !message.includes(q)) return false;
    }
    return true;
  });

  const hasMore = notifications.length === page * PAGE_SIZE;

  // Group by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: AppNotification[] }[] = [];
  const todayItems = filtered.filter((n) => new Date(n.createdAt) >= today);
  const yesterdayItems = filtered.filter((n) => {
    const d = new Date(n.createdAt);
    return d >= yesterday && d < today;
  });
  const olderItems = filtered.filter((n) => new Date(n.createdAt) < yesterday);

  if (todayItems.length > 0) groups.push({ label: isAr ? "اليوم" : "Today", items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: isAr ? "أمس" : "Yesterday", items: yesterdayItems });
  if (olderItems.length > 0) groups.push({ label: isAr ? "أقدم" : "Older", items: olderItems });

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-3xl mx-auto" dir={dir}>
        <NotificationSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BellRing className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">
              {isAr ? "الإشعارات" : "Notifications"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? isAr
                  ? `${unreadCount} غير مقروءة`
                  : `${unreadCount} unread`
                : isAr
                  ? "لا توجد إشعارات جديدة"
                  : "No new notifications"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 me-2" />
              {isAr ? "قراءة الكل" : "Mark All Read"}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[280px]">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={isAr ? "بحث في الإشعارات..." : "Search notifications..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs ps-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <Filter className="h-3 w-3 me-1" />
            <SelectValue placeholder={isAr ? "النوع" : "Type"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل الأنواع" : "All Types"}</SelectItem>
            {Object.entries(typeLabels).map(([key, labels]) => (
              <SelectItem key={key} value={key}>
                {isAr ? labels.ar : labels.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder={isAr ? "الحالة" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
            <SelectItem value="unread">{isAr ? "غير مقروءة" : "Unread"}</SelectItem>
            <SelectItem value="read">{isAr ? "مقروءة" : "Read"}</SelectItem>
          </SelectContent>
        </Select>
        {(typeFilter !== "all" || readFilter !== "all" || searchQuery.trim()) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setTypeFilter("all"); setReadFilter("all"); setSearchQuery(""); }}
          >
            {isAr ? "مسح الفلاتر" : "Clear Filters"}
          </Button>
        )}
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {isAr ? "لا توجد إشعارات" : "No notifications"}
            </p>
            <p className="text-sm mt-1">
              {isAr ? "ستظهر إشعاراتك هنا" : "Your notifications will appear here"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{group.label}</h3>
              <div className="space-y-2">
                {group.items.map((notification) => {
                  const Icon = notificationIcons[notification.type] || Bell;
                  const typeColor = typeColors[notification.type] || typeColors.system;
                  const priorityColor = priorityColors[notification.priority] || "";

                  return (
                    <Card
                      key={notification.id}
                      className={cn(
                        "transition-all duration-300 cursor-pointer hover-elevate",
                        !notification.isRead && "border-primary/40 bg-primary/8 shadow-sm shadow-primary/10 ring-1 ring-primary/20"
                      )}
                      onClick={() => {
                        if (!notification.isRead) {
                          markAsReadMutation.mutate(notification.id);
                        }
                        if (isSafeNotificationLink(notification.link)) {
                          navigate(notification.link);
                        }
                      }}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex gap-3">
                          <div className={cn("p-2 rounded-full shrink-0 h-fit", typeColor)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className={cn("font-medium text-sm", priorityColor)}>
                                  {getTitle(notification)}
                                </p>
                                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                  {getMessage(notification)}
                                </p>
                              </div>
                              {!notification.isRead && (
                                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeColor)}>
                                {isAr ? typeLabels[notification.type]?.ar : typeLabels[notification.type]?.en}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(notification.createdAt), {
                                  addSuffix: true,
                                  locale: isAr ? ar : enUS,
                                })}
                              </span>
                              {notification.priority === "urgent" && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  {isAr ? "عاجل" : "Urgent"}
                                </Badge>
                              )}
                              {notification.priority === "high" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-500 border-orange-500/30">
                                  {isAr ? "مهم" : "Important"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
              >
                {isFetching && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {isAr ? "تحميل المزيد" : "Load More"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
