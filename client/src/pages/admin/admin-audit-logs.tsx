import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Clock,
  User,
  Settings,
  AlertTriangle,
  LogIn,
  LogOut,
  UserX,
  DollarSign,
  Gift,
  Gavel,
  Palette,
  ToggleLeft,
  Megaphone,
  Gamepad2,
  Tag,
  Ban,
  CheckCircle,
  FileText,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  login: { icon: LogIn, color: "text-green-500", label: "Login" },
  logout: { icon: LogOut, color: "text-gray-500", label: "Logout" },
  user_update: { icon: User, color: "text-blue-500", label: "User Update" },
  user_ban: { icon: UserX, color: "text-red-500", label: "User Ban" },
  user_suspend: { icon: Ban, color: "text-orange-500", label: "User Suspend" },
  user_balance_adjust: { icon: DollarSign, color: "text-emerald-500", label: "Balance Adjust" },
  reward_sent: { icon: Gift, color: "text-purple-500", label: "Reward Sent" },
  dispute_resolve: { icon: Gavel, color: "text-amber-500", label: "Dispute Resolve" },
  theme_change: { icon: Palette, color: "text-pink-500", label: "Theme Change" },
  section_toggle: { icon: ToggleLeft, color: "text-cyan-500", label: "Section Toggle" },
  settings_update: { icon: Settings, color: "text-slate-500", label: "Settings Update" },
  announcement_create: { icon: Megaphone, color: "text-indigo-500", label: "Announcement Create" },
  announcement_update: { icon: Megaphone, color: "text-indigo-400", label: "Announcement Update" },
  game_update: { icon: Gamepad2, color: "text-violet-500", label: "Game Update" },
  promo_create: { icon: Tag, color: "text-teal-500", label: "Promo Create" },
  p2p_ban: { icon: Ban, color: "text-red-600", label: "P2P Ban" },
  p2p_unban: { icon: CheckCircle, color: "text-green-600", label: "P2P Unban" },
};

const ALL_ACTIONS = Object.keys(ACTION_CONFIG);

const SURFACE_CARD_CLASS = "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75";
const STAT_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-4 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/80";
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} shadow-[0_18px_45px_-28px_rgba(15,23,42,0.28)]`;
const SELECT_TRIGGER_CLASS = "h-11 w-full rounded-2xl border-slate-200/80 bg-white/90 shadow-inner shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/70 dark:shadow-black/20";

export default function AdminAuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [limitFilter, setLimitFilter] = useState("50");

  const queryParams = new URLSearchParams({ limit: limitFilter });
  if (actionFilter !== "all") queryParams.set("action", actionFilter);

  const { data: logs = [], isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/admin/audit-logs", actionFilter, limitFilter],
    queryFn: () => adminFetch(`/api/admin/audit-logs?${queryParams.toString()}`),
    refetchInterval: 30000,
  });

  const formatDate = (d: string) => {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const parseJSON = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return str; }
  };

  const loginCount = logs.filter((log) => log.action === "login").length;
  const userActionCount = logs.filter((log) => log.action.startsWith("user_")).length;
  const settingsChangeCount = logs.filter((log) => ["settings_update", "section_toggle", "theme_change"].includes(log.action)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-8 sm:p-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-5 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_32%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.92))]">
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit rounded-full border-blue-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
              Audit Logs
            </Badge>
            <div className="space-y-2">
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                <FileText className="h-7 w-7 text-primary" />
                Audit Logs
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Track all admin actions and changes
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0 text-center sm:text-left">
                  <FileText className="mb-2 h-6 w-6 text-primary sm:mx-0 mx-auto" />
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{logs.length}</div>
                  <div className="text-xs text-muted-foreground">Total Entries</div>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0 text-center sm:text-left">
                  <LogIn className="mb-2 h-6 w-6 text-green-500 sm:mx-0 mx-auto" />
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{loginCount}</div>
                  <div className="text-xs text-muted-foreground">Logins</div>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0 text-center sm:text-left">
                  <User className="mb-2 h-6 w-6 text-blue-500 sm:mx-0 mx-auto" />
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{userActionCount}</div>
                  <div className="text-xs text-muted-foreground">User Actions</div>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0 text-center sm:text-left">
                  <Settings className="mb-2 h-6 w-6 text-slate-500 sm:mx-0 mx-auto" />
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{settingsChangeCount}</div>
                  <div className="text-xs text-muted-foreground">Settings Changes</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[360px]">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {ALL_ACTIONS.map(action => (
                  <SelectItem key={action} value={action}>
                    {ACTION_CONFIG[action].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={limitFilter} onValueChange={setLimitFilter}>
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Log entries */}
      <Card className={DATA_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-24 w-full rounded-[24px]" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300/90 bg-slate-50/70 py-12 text-center text-muted-foreground dark:border-slate-700 dark:bg-slate-900/50">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <ScrollArea className="h-[700px] rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="space-y-3">
                {logs.map((log) => {
                  const config = ACTION_CONFIG[log.action] || { icon: AlertTriangle, color: "text-gray-500", label: log.action };
                  const Icon = config.icon;
                  const metadata = parseJSON(log.metadata);

                  return (
                    <div
                      key={log.id}
                      className="rounded-[26px] border border-slate-200/70 bg-white/85 p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)] transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-950/75 dark:hover:bg-slate-950"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {config.label}
                            </Badge>
                            {log.entityType && (
                              <span className="text-xs text-muted-foreground">
                                {log.entityType}
                                {log.entityId && `: ${log.entityId.substring(0, 8)}...`}
                              </span>
                            )}
                          </div>
                          {log.reason && (
                            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{log.reason}</p>
                          )}
                          {metadata && typeof metadata === 'object' && (
                            <div className="max-w-full overflow-hidden rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs text-muted-foreground dark:bg-slate-900">
                              {Object.entries(metadata).slice(0, 3).map(([k, v]) => (
                                <span key={k} className="me-3">
                                  {k}: {typeof v === 'string' ? v.substring(0, 30) : String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(log.createdAt)}
                            </span>
                            {log.ipAddress && (
                              <span className="font-mono">{log.ipAddress}</span>
                            )}
                            <span className="font-mono text-muted-foreground/60">
                              Admin: {log.adminId.substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
