import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Bell, Send, Loader2, Users, User, Check, ChevronsUpDown, History } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

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
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch");
  }
  return res.json();
}

interface BroadcastNotification {
  id: string;
  title: string;
  titleAr: string | null;
  content: string;
  contentAr: string | null;
  targetType: string;
  targetValue: string | null;
  sentBy: string | null;
  sentAt: string;
  expiresAt: string | null;
}

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
}

const notificationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  titleAr: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  contentAr: z.string().optional(),
  targetType: z.enum(["all", "user"]),
  targetValue: z.string().optional(),
});

type NotificationFormData = z.infer<typeof notificationSchema>;

const SURFACE_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const STAT_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900/70";
const DATA_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900/70";
const TABLE_WRAP_CLASS = "overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/85 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:bg-slate-900/70";
const BUTTON_3D_CLASS = "rounded-xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_8px_0_0_rgba(148,163,184,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(148,163,184,0.45)] hover:brightness-105 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.82)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-xl border border-sky-600 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(3,105,161,0.52)] hover:brightness-105";
const INPUT_SURFACE_CLASS = "min-h-[46px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[110px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";

function normalizeNotificationPayload(data: NotificationFormData): NotificationFormData {
  return {
    ...data,
    title: data.title.trim(),
    titleAr: data.titleAr?.trim() || "",
    content: data.content.trim(),
    contentAr: data.contentAr?.trim() || "",
    targetValue: data.targetType === "user" ? data.targetValue?.trim() || "" : "",
  };
}

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";

  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const form = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: "",
      titleAr: "",
      content: "",
      contentAr: "",
      targetType: "all",
      targetValue: "",
    },
  });

  const watchTargetType = form.watch("targetType");
  const watchedTargetValue = form.watch("targetValue");

  const { data: broadcasts, isLoading: loadingBroadcasts } = useQuery<BroadcastNotification[]>({
    queryKey: ["/api/admin/broadcast-notifications"],
    queryFn: () => adminFetch("/api/admin/broadcast-notifications"),
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => adminFetch("/api/admin/users"),
  });

  const filteredUsers = useMemo(() => {
    if (!users || !userSearchQuery) return users || [];
    const query = userSearchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)
    );
  }, [users, userSearchQuery]);

  const selectedUser = useMemo(() => {
    return users?.find((u) => u.id === watchedTargetValue);
  }, [users, watchedTargetValue]);

  useEffect(() => {
    if (watchTargetType !== "user" && watchedTargetValue) {
      form.setValue("targetValue", "", { shouldDirty: true, shouldValidate: true });
      setUserSearchQuery("");
      setUserSearchOpen(false);
    }
  }, [form, watchTargetType, watchedTargetValue]);

  const sendMutation = useMutation({
    mutationFn: async (data: NotificationFormData) => {
      return adminFetch("/api/admin/broadcast-notifications", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcast-notifications"] });
      toast({ title: isArabic ? "تم الإرسال" : "Sent", description: isArabic ? "تم إرسال الإشعار بنجاح" : "Notification sent successfully" });
      form.reset({
        title: "",
        titleAr: "",
        content: "",
        contentAr: "",
        targetType: "all",
        targetValue: "",
      });
      setUserSearchQuery("");
      setUserSearchOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: NotificationFormData) => {
    const normalizedData = normalizeNotificationPayload(data);
    if (normalizedData.targetType === "user" && !normalizedData.targetValue) {
      toast({ title: isArabic ? "خطأ" : "Error", description: isArabic ? "يرجى اختيار مستخدم" : "Please select a user", variant: "destructive" });
      return;
    }
    sendMutation.mutate(normalizedData);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(isArabic ? "ar" : "en");
  };

  const notificationHistory = broadcasts || [];
  const userTargetedCount = notificationHistory.filter((broadcast) => broadcast.targetType === "user").length;
  const allUsersCount = notificationHistory.filter((broadcast) => broadcast.targetType === "all").length;

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
            <Bell className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-page-title">
              {isArabic ? "إرسال الإشعارات" : "Broadcast Notifications"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {isArabic ? "إرسال إشعارات للمستخدمين" : "Send notifications to users"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "السجل" : "History"}
              </p>
              <p className="mt-1 text-2xl font-bold">{notificationHistory.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "الكل" : "All"}
              </p>
              <p className="mt-1 text-2xl font-bold">{allUsersCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "مستخدم" : "User"}
              </p>
              <p className="mt-1 text-2xl font-bold">{userTargetedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className={SURFACE_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {isArabic ? "إرسال إشعار جديد" : "Send New Notification"}
            </CardTitle>
            <CardDescription>
              {isArabic ? "قم بإنشاء وإرسال إشعار جديد" : "Create and send a new notification"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="targetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "الهدف" : "Target"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-target-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {isArabic ? "جميع المستخدمين" : "All Users"}
                            </div>
                          </SelectItem>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {isArabic ? "مستخدم محدد" : "Specific User"}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchTargetType === "user" && (
                  <FormField
                    control={form.control}
                    name="targetValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "اختر المستخدم" : "Select User"}</FormLabel>
                        <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  `${INPUT_SURFACE_CLASS} w-full justify-between`,
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-select-user"
                              >
                                {selectedUser?.username || (isArabic ? "اختر مستخدم..." : "Select user...")}
                                <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder={isArabic ? "ابحث عن مستخدم..." : "Search user..."}
                                value={userSearchQuery}
                                onValueChange={setUserSearchQuery}
                                data-testid="input-search-user"
                              />
                              <CommandList>
                                <CommandEmpty>{isArabic ? "لم يتم العثور على مستخدم" : "No user found"}</CommandEmpty>
                                <CommandGroup>
                                  {filteredUsers.slice(0, 10).map((user) => (
                                    <CommandItem
                                      key={user.id}
                                      value={user.username}
                                      onSelect={() => {
                                        form.setValue("targetValue", user.id);
                                        setUserSearchOpen(false);
                                      }}
                                      data-testid={`option-user-${user.id}`}
                                    >
                                      <Check
                                        className={cn(
                                          "me-2 h-4 w-4",
                                          field.value === user.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div>
                                        <p className="font-medium">{user.username}</p>
                                        {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "العنوان (إنجليزي)" : "Title (English)"}</FormLabel>
                        <FormControl>
                          <Input {...field} className={INPUT_SURFACE_CLASS} data-testid="input-notification-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="titleAr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "العنوان (عربي)" : "Title (Arabic)"}</FormLabel>
                        <FormControl>
                          <Input {...field} className={INPUT_SURFACE_CLASS} dir="rtl" data-testid="input-notification-title-ar" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "المحتوى (إنجليزي)" : "Content (English)"}</FormLabel>
                      <FormControl>
                        <Textarea {...field} className={TEXTAREA_SURFACE_CLASS} rows={4} data-testid="input-notification-content" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contentAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "المحتوى (عربي)" : "Content (Arabic)"}</FormLabel>
                      <FormControl>
                        <Textarea {...field} className={TEXTAREA_SURFACE_CLASS} rows={4} dir="rtl" data-testid="input-notification-content-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className={`${BUTTON_3D_PRIMARY_CLASS} w-full`}
                  disabled={sendMutation.isPending}
                  data-testid="button-send-notification"
                >
                  {sendMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  <Send className="me-2 h-4 w-4" />
                  {isArabic ? "إرسال الإشعار" : "Send Notification"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className={SURFACE_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {isArabic ? "سجل الإشعارات" : "Notification History"}
            </CardTitle>
            <CardDescription>
              {isArabic ? "الإشعارات المرسلة سابقاً" : "Previously sent notifications"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBroadcasts ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={DATA_CARD_CLASS}>
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="mt-3 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : !notificationHistory.length ? (
              <div className={`${DATA_CARD_CLASS} py-10 text-center text-muted-foreground`}>
                <Bell className="mx-auto mb-4 h-10 w-10 opacity-50" />
                <p>{isArabic ? "لا توجد إشعارات سابقة" : "No notifications sent yet"}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {notificationHistory.map((broadcast) => (
                    <div key={broadcast.id} className={DATA_CARD_CLASS} data-testid={`row-broadcast-${broadcast.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{isArabic && broadcast.titleAr ? broadcast.titleAr : broadcast.title}</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {isArabic && broadcast.contentAr ? broadcast.contentAr : broadcast.content}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                          {broadcast.targetType === "all" ? (
                            <><Users className="me-1 h-3 w-3" />{isArabic ? "الكل" : "All"}</>
                          ) : (
                            <><User className="me-1 h-3 w-3" />{isArabic ? "مستخدم" : "User"}</>
                          )}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{formatDate(broadcast.sentAt)}</p>
                    </div>
                  ))}
                </div>

                <div className={`hidden max-h-[500px] overflow-y-auto md:block ${TABLE_WRAP_CLASS}`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isArabic ? "العنوان" : "Title"}</TableHead>
                        <TableHead>{isArabic ? "الهدف" : "Target"}</TableHead>
                        <TableHead>{isArabic ? "التاريخ" : "Date"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notificationHistory.map((broadcast) => (
                        <TableRow key={broadcast.id} data-testid={`row-broadcast-${broadcast.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{isArabic && broadcast.titleAr ? broadcast.titleAr : broadcast.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {isArabic && broadcast.contentAr ? broadcast.contentAr : broadcast.content}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {broadcast.targetType === "all" ? (
                                <><Users className="h-3 w-3 me-1" />{isArabic ? "الكل" : "All"}</>
                              ) : (
                                <><User className="h-3 w-3 me-1" />{isArabic ? "مستخدم" : "User"}</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(broadcast.sentAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
