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

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string) {
  const token = getAdminToken();
  const res = await fetch(url, {
    headers: { "x-admin-token": token || "" },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Track all admin actions and changes
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[100px]">
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

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <FileText className="w-6 h-6 mx-auto text-primary mb-1" />
            <div className="text-lg font-bold">{logs.length}</div>
            <div className="text-xs text-muted-foreground">Total Entries</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <LogIn className="w-6 h-6 mx-auto text-green-500 mb-1" />
            <div className="text-lg font-bold">{logs.filter(l => l.action === 'login').length}</div>
            <div className="text-xs text-muted-foreground">Logins</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <User className="w-6 h-6 mx-auto text-blue-500 mb-1" />
            <div className="text-lg font-bold">{logs.filter(l => l.action.startsWith('user_')).length}</div>
            <div className="text-xs text-muted-foreground">User Actions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Settings className="w-6 h-6 mx-auto text-slate-500 mb-1" />
            <div className="text-lg font-bold">
              {logs.filter(l => ['settings_update', 'section_toggle', 'theme_change'].includes(l.action)).length}
            </div>
            <div className="text-xs text-muted-foreground">Settings Changes</div>
          </CardContent>
        </Card>
      </div>

      {/* Log entries */}
      <Card>
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
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {logs.map((log) => {
                  const config = ACTION_CONFIG[log.action] || { icon: AlertTriangle, color: "text-gray-500", label: log.action };
                  const Icon = config.icon;
                  const metadata = parseJSON(log.metadata);

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
                    >
                      <div className={`p-2 rounded-lg bg-background shrink-0`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
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
                          <p className="text-sm mt-1">{log.reason}</p>
                        )}
                        {metadata && typeof metadata === 'object' && (
                          <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted rounded px-2 py-1 max-w-full overflow-hidden">
                            {Object.entries(metadata).slice(0, 3).map(([k, v]) => (
                              <span key={k} className="me-3">
                                {k}: {typeof v === 'string' ? v.substring(0, 30) : String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
