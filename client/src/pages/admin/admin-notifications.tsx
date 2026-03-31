import { useState, useMemo } from "react";
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
    const targetValue = form.getValues("targetValue");
    return users?.find((u) => u.id === targetValue);
  }, [users, form.watch("targetValue")]);

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
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: NotificationFormData) => {
    if (data.targetType === "user" && !data.targetValue) {
      toast({ title: isArabic ? "خطأ" : "Error", description: isArabic ? "يرجى اختيار مستخدم" : "Please select a user", variant: "destructive" });
      return;
    }
    sendMutation.mutate(data);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(isArabic ? "ar" : "en");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          {isArabic ? "إرسال الإشعارات" : "Broadcast Notifications"}
        </h1>
        <p className="text-muted-foreground">
          {isArabic ? "إرسال إشعارات للمستخدمين" : "Send notifications to users"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="targetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "الهدف" : "Target"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-target-type">
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
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-select-user"
                              >
                                {selectedUser?.username || (isArabic ? "اختر مستخدم..." : "Select user...")}
                                <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "العنوان (إنجليزي)" : "Title (English)"}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-notification-title" />
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
                          <Input {...field} dir="rtl" data-testid="input-notification-title-ar" />
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
                        <Textarea {...field} rows={3} data-testid="input-notification-content" />
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
                        <Textarea {...field} rows={3} dir="rtl" data-testid="input-notification-content-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
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

        <Card>
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
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isArabic ? "العنوان" : "Title"}</TableHead>
                      <TableHead>{isArabic ? "الهدف" : "Target"}</TableHead>
                      <TableHead>{isArabic ? "التاريخ" : "Date"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts?.map((broadcast) => (
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
                    {!broadcasts?.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          {isArabic ? "لا توجد إشعارات سابقة" : "No notifications sent yet"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
