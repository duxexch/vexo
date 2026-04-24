import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useMessageTranslation } from "@/hooks/use-message-translation";
import { playSound } from "@/hooks/use-sound-effects";
import { useLocation } from "wouter";
import {
  MessageCircle, BarChart3, Shield, Trash2, Search, Ban, X, Plus, Eye,
  MessageSquare, Users, Clock, AlertTriangle, Settings, Filter,
  Headphones, Send, RefreshCw, CheckCircle2, XCircle, Bot, ArrowLeft, Loader2,
  Paperclip, FileText, Download, Image, Languages, ChevronDown, PhoneCall, Video,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const adminToken = () => localStorage.getItem("adminToken") || "";

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const BUTTON_3D_DESTRUCTIVE_CLASS = "rounded-2xl border border-red-500 bg-red-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(185,28,28,0.35)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-red-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(185,28,28,0.35)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "rounded-[28px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98";

interface SupportTicket {
  id: string;
  nickname?: string;
  username?: string;
  displayUsername?: string;
  email?: string;
  phone?: string;
  userId?: string;
  unreadCount: number;
  status?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface TicketMessage {
  id: string;
  senderType: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
  mediaOriginalName?: string;
  createdAt: string;
  [key: string]: unknown;
}

interface AutoReply {
  id: string;
  trigger: string;
  response: string;
  isEnabled: boolean;
}

interface ChatFeatureUser {
  userId: string;
  username?: string;
  grantedBy?: string;
  nickname?: string;
  id?: string;
}

interface AiAgentReportPayload {
  source?: string;
  generatedAt?: string;
  connection?: {
    enabled?: boolean;
    baseUrl?: string;
    timeoutMs?: number;
  };
  external?: {
    report?: {
      learning?: {
        totalEvents?: number;
        activeStrategies?: number;
      };
      performance?: {
        totalGames?: number;
        aiWinRate?: number;
      };
    };
  } | null;
  localFallback?: {
    summary?: {
      totalProfiles?: number;
      totalTrackedMoves?: number;
      gamesCoverage?: Record<string, number>;
    };
  } | null;
}

interface AiAgentChatPayload {
  source?: string;
  generatedAt?: string;
  reply?: string;
  summary?: Record<string, unknown> | null;
}

interface AiAgentCapabilitiesPayload {
  source?: string;
  generatedAt?: string;
  capabilities?: {
    agentName?: string;
    mode?: string;
    privacyMode?: string;
    autonomousLearning?: {
      enabled?: boolean;
      methods?: string[];
      [key: string]: unknown;
    };
    dataAnalyst?: {
      enabled?: boolean;
      supports?: Record<string, unknown>;
      notes?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

interface AiAgentDataSummaryPayload {
  source?: string;
  generatedAt?: string;
  summary?: Record<string, unknown>;
  insights?: Record<string, unknown> | null;
  decisionAverages?: Record<string, unknown> | null;
}

interface AiAgentDataQueryPayload {
  source?: string;
  generatedAt?: string;
  query?: Record<string, unknown> | null;
  data?: {
    columns?: string[];
    rows?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } | null;
}

interface AiAgentConversationMessage {
  id: string;
  role: 'admin' | 'agent';
  message: string;
  at: string;
}

type AiQueryGroupBy = "game" | "day" | "difficulty";

interface AiQueryPreset {
  key: string;
  label: string;
  groupBy: AiQueryGroupBy;
  gameType?: string;
  from?: string;
  to?: string;
}

const AI_QUERY_COLUMN_LABELS: Record<string, string> = {
  day: "Day",
  events: "Events",
  matches: "Matches",
  aiWins: "AI Wins",
  humanWins: "Human Wins",
  draws: "Draws",
  abandons: "Abandons",
  aiWinRate: "AI Win Rate %",
  gameType: "Game",
  difficulty: "Difficulty",
  strategies: "Strategies",
  gamesPlayed: "Games Played",
  avgExplorationRate: "Avg Exploration",
  avgLearningRate: "Avg Learning",
  abandonRate: "Abandon Rate %",
  lastUpdated: "Last Updated",
};

type ToastFn = ReturnType<typeof useToast>["toast"];

const ADMIN_API_BASE_PATH = "/api/admin";

function i18nText(t: (key: string) => string, key: string, fallback: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

/**
 * Build a same-origin admin endpoint string from a caller-supplied path.
 *
 * The caller is trusted to supply a path under `/api/admin/*`, but some
 * call sites interpolate user-controlled IDs into the path. To stop a
 * crafted ID from steering the request away from `/api/admin/`
 * (CodeQL alert #133) we:
 *   1. reject any input that looks like an absolute URL or
 *      protocol-relative URL,
 *   2. reject backslashes and `..` segments (no traversal),
 *   3. normalize so the result always begins with `/api/admin/`,
 *   4. return a pathname-only string — never a fully-qualified URL —
 *      so the resulting `fetch` is unconditionally same-origin.
 *
 * No `new URL(...)` call is involved, so there is no path that can
 * resolve to a different origin.
 */
function buildSafeAdminEndpoint(path: string): string {
  const rawPath = String(path || "").trim();
  if (!rawPath) {
    throw new Error("Invalid admin endpoint");
  }

  // Reject absolute URLs (`http://...`, `https://...`, `javascript:`,
  // etc.) and protocol-relative URLs (`//evil.example/...`).
  if (rawPath.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawPath)) {
    throw new Error("Absolute URLs are not allowed");
  }

  // Strip an optional leading `/api/admin` so callers can use either
  // `"/api/admin/foo"` or `"/foo"`.
  const withoutPrefix = rawPath.startsWith(ADMIN_API_BASE_PATH)
    ? rawPath.slice(ADMIN_API_BASE_PATH.length)
    : rawPath;
  const relative = withoutPrefix.startsWith("/")
    ? withoutPrefix
    : `/${withoutPrefix}`;

  // No traversal, no Windows-style separators, no embedded NULs.
  if (
    relative.includes("\\") ||
    relative.includes("..") ||
    relative.includes("\0")
  ) {
    throw new Error("Invalid admin endpoint path");
  }

  // Split off any query/fragment so we can guarantee the path part
  // starts with `/api/admin/`. Splitting by hand (instead of using
  // `new URL`) keeps the value pathname-only and same-origin.
  let pathname = relative;
  let suffix = "";
  const hashIndex = pathname.indexOf("#");
  if (hashIndex !== -1) {
    suffix = pathname.slice(hashIndex) + suffix;
    pathname = pathname.slice(0, hashIndex);
  }
  const queryIndex = pathname.indexOf("?");
  if (queryIndex !== -1) {
    suffix = pathname.slice(queryIndex) + suffix;
    pathname = pathname.slice(0, queryIndex);
  }

  const endpointPath = `${ADMIN_API_BASE_PATH}${pathname}`;
  if (
    !endpointPath.startsWith(`${ADMIN_API_BASE_PATH}/`) &&
    endpointPath !== ADMIN_API_BASE_PATH
  ) {
    throw new Error("Invalid admin endpoint path");
  }

  return `${endpointPath}${suffix}`;
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const endpoint = buildSafeAdminEndpoint(path);

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function resolvePreferredUsername(user?: { username?: unknown; nickname?: unknown; id?: unknown }, fallback = "User") {
  const username = typeof user?.username === "string" ? user.username.trim() : "";
  if (username) return username;

  const nickname = typeof user?.nickname === "string" ? user.nickname.trim() : "";
  if (nickname) return nickname;

  const id = typeof user?.id === "string" ? user.id : "";
  return id || fallback;
}

export default function AdminChatPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const text = (key: string, fallback: string) => i18nText(t, key, fallback);
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [newBannedWord, setNewBannedWord] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [supportReply, setSupportReply] = useState("");
  const [adminMediaPreview, setAdminMediaPreview] = useState<{ url: string; type: string; name: string; file: File } | null>(null);
  const [adminUploading, setAdminUploading] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [supportFilter, setSupportFilter] = useState("all");
  const [newAutoTrigger, setNewAutoTrigger] = useState("");
  const [newAutoResponse, setNewAutoResponse] = useState("");
  const [newAutoResponseAr, setNewAutoResponseAr] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const { getDisplayText, getTranslatedText, hasTranslation, toggleTranslation, isTranslating: isTranslatingMsg, isShowingOriginal, autoTranslate, setAutoTranslate, translateMessage, targetLanguage, setTargetLanguage, languages, currentLanguageInfo } = useMessageTranslation();
  const [showAdminLangMenu, setShowAdminLangMenu] = useState(false);
  const [adminLangFilter, setAdminLangFilter] = useState("");
  const [aiAgentPrompt, setAiAgentPrompt] = useState("");
  const [aiAgentConversation, setAiAgentConversation] = useState<AiAgentConversationMessage[]>([]);
  const [aiDataQueryGroupBy, setAiDataQueryGroupBy] = useState<AiQueryGroupBy>("game");
  const [aiDataQueryGameType, setAiDataQueryGameType] = useState("");
  const [aiDataQueryFrom, setAiDataQueryFrom] = useState("");
  const [aiDataQueryTo, setAiDataQueryTo] = useState("");
  const [aiActivePreset, setAiActivePreset] = useState("top-games");

  useEffect(() => {
    const queryStart = location.indexOf("?");
    if (queryStart === -1) return;

    const search = location.slice(queryStart + 1);
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    const ticketId = params.get("ticketId");

    if (tab && ["overview", "support", "monitor", "filter", "settings", "ai-agent"].includes(tab)) {
      setActiveTab(tab);
    }

    if (ticketId && ticketId.trim().length > 0) {
      setActiveTab("support");
      setSelectedTicketId(ticketId);
    }
  }, [location]);

  // WebSocket for real-time support message notifications
  useEffect(() => {
    const token = adminToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "admin_auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "admin_alert" && data.data?.type === "support_message") {
          // Refresh support tickets and stats
          queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
          queryClient.invalidateQueries({ queryKey: ["admin-support-stats"] });
          if (selectedTicketId && data.data?.entityId === selectedTicketId) {
            queryClient.invalidateQueries({ queryKey: ["admin-ticket-detail", selectedTicketId] });
          }

          // Play support sound
          playSound('support');

          toast({
            title: text("adminChat.support.newMessageTitle", "New support message"),
            description: data.data.message || data.data.messageAr,
          });

          // Browser notification for admin
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const browserNotif = new Notification(text("adminChat.support.newMessageBrowserTitle", "New support message - VEX"), {
                body: data.data.message || data.data.messageAr || text("adminChat.support.newMessageBody", "New message from user"),
                icon: '/icons/vex-gaming-logo-192x192.png',
                tag: 'vex-admin-support',
                requireInteraction: true,
              });
              browserNotif.onclick = () => {
                window.focus();
                const entityId = typeof data.data?.entityId === "string" ? data.data.entityId : "";
                if (entityId) {
                  setActiveTab("support");
                  setSelectedTicketId(entityId);
                  setLocation(`/admin/chat-management?tab=support&ticketId=${encodeURIComponent(entityId)}`);
                }
                browserNotif.close();
              };
              setTimeout(() => browserNotif.close(), 15000);
            } catch { }
          }
        }
      } catch { }
    };

    ws.onerror = () => console.error("[Admin Chat WS] Connection error");

    return () => { ws.close(); };
  }, [selectedTicketId]);

  // Request browser notification permission for admin
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { });
    }
  }, []);

  // Chat stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-chat-stats"],
    queryFn: () => adminFetch("/api/admin/chat/stats"),
    refetchInterval: 30000,
  });

  // Chat settings
  const { data: settings } = useQuery({
    queryKey: ["admin-chat-settings"],
    queryFn: () => adminFetch("/api/admin/chat-settings"),
  });

  // Banned words
  const { data: bannedWordsData } = useQuery({
    queryKey: ["admin-banned-words"],
    queryFn: () => adminFetch("/api/admin/chat/banned-words"),
    enabled: activeTab === "filter",
  });

  // Support tickets — normalize both nested Drizzle format and flat format
  const { data: supportTickets, refetch: refetchTickets } = useQuery<SupportTicket[]>({
    queryKey: ["admin-support-tickets", supportFilter],
    queryFn: async (): Promise<SupportTicket[]> => {
      const raw = await adminFetch(`/api/admin/support-chat/tickets?status=${supportFilter}`);
      if (!Array.isArray(raw)) return [];
      return raw.map((r: Record<string, unknown>) => {
        // Handle nested Drizzle: { ticket: {...}, user: {...}, unreadCount }
        if (r.ticket && typeof r.ticket === 'object') {
          const t = r.ticket as Record<string, unknown>;
          const u = (r.user || {}) as Record<string, unknown>;
          return {
            id: t.id,
            userId: t.userId,
            status: t.status,
            lastMessageAt: t.lastMessageAt,
            updatedAt: t.updatedAt,
            createdAt: t.createdAt,
            username: u.username,
            nickname: u.nickname,
            displayUsername: r.displayUsername || u.username || u.nickname || t.userId,
            email: r.email || u.email,
            phone: r.phone || u.phone,
            profilePicture: u.profilePicture,
            unreadCount: Number(r.unreadCount) || 0,
          } as SupportTicket;
        }
        // Already flat format
        return {
          ...(r as SupportTicket),
          displayUsername: (r as SupportTicket).displayUsername || (r as SupportTicket).username || (r as SupportTicket).nickname || (r as SupportTicket).userId,
        } as SupportTicket;
      });
    },
    enabled: activeTab === "support",
    refetchInterval: activeTab === "support" ? 10000 : false,
  });

  // Support chat stats
  const { data: supportStats } = useQuery({
    queryKey: ["admin-support-stats"],
    queryFn: () => adminFetch("/api/admin/support-chat/stats"),
    enabled: activeTab === "support" || activeTab === "overview",
    refetchInterval: 30000,
  });

  const { data: aiAgentReport, refetch: refetchAiAgentReport, isFetching: aiAgentReportLoading } = useQuery<AiAgentReportPayload>({
    queryKey: ["admin-ai-agent-report"],
    queryFn: () => adminFetch("/api/admin/ai-agent/report"),
    enabled: activeTab === "ai-agent" || activeTab === "overview",
    refetchInterval: activeTab === "ai-agent" ? 30000 : false,
  });

  const {
    data: aiAgentCapabilities,
    refetch: refetchAiAgentCapabilities,
    isFetching: aiAgentCapabilitiesLoading,
  } = useQuery<AiAgentCapabilitiesPayload>({
    queryKey: ["admin-ai-agent-capabilities"],
    queryFn: () => adminFetch("/api/admin/ai-agent/capabilities"),
    enabled: activeTab === "ai-agent" || activeTab === "overview",
    refetchInterval: activeTab === "ai-agent" ? 60000 : false,
  });

  const {
    data: aiAgentDataSummary,
    refetch: refetchAiAgentDataSummary,
    isFetching: aiAgentDataSummaryLoading,
  } = useQuery<AiAgentDataSummaryPayload>({
    queryKey: ["admin-ai-agent-data-summary"],
    queryFn: () => adminFetch("/api/admin/ai-agent/data-summary"),
    enabled: activeTab === "ai-agent" || activeTab === "overview",
    refetchInterval: activeTab === "ai-agent" ? 45000 : false,
  });

  // Selected ticket messages — normalize nested Drizzle response
  const { data: ticketDetail, refetch: refetchTicketDetail } = useQuery({
    queryKey: ["admin-ticket-detail", selectedTicketId],
    queryFn: async () => {
      const raw = await adminFetch(`/api/admin/support-chat/tickets/${selectedTicketId}/messages`);
      // Handle both formats:
      // Old nested: { ticket: { ticket: {...}, user: {...} }, messages }
      // New flat:   { ticket: {...}, user: {...}, messages }
      let ticket = raw.ticket;
      let user = raw.user;
      if (ticket && typeof ticket === 'object' && 'ticket' in ticket) {
        // Double-nested from old Drizzle format
        user = ticket.user;
        ticket = ticket.ticket;
      }
      return { ticket, user, messages: raw.messages || [] };
    },
    enabled: !!selectedTicketId,
    refetchInterval: selectedTicketId ? 5000 : false,
  });

  // Auto-replies
  const { data: autoReplies, refetch: refetchAutoReplies } = useQuery({
    queryKey: ["admin-auto-replies"],
    queryFn: () => adminFetch("/api/admin/support-chat/auto-replies"),
    enabled: activeTab === "support",
  });

  // Auto-translate incoming user messages in admin support chat
  useEffect(() => {
    if (!autoTranslate || !ticketDetail?.messages) return;
    ticketDetail.messages.forEach((msg: TicketMessage) => {
      if (msg.senderType === "user" && msg.content) {
        const msgId = String(msg.id);
        if (isShowingOriginal(msgId) && !isTranslatingMsg(msgId)) {
          translateMessage(msgId, msg.content);
        }
      }
    });
  }, [ticketDetail?.messages, autoTranslate]);

  // Reply to ticket
  const replyMutation = useMutation({
    mutationFn: ({ ticketId, content, mediaUrl, mediaType, mediaName }: { ticketId: string; content: string; mediaUrl?: string; mediaType?: string; mediaName?: string }) =>
      adminFetch(`/api/admin/support-chat/tickets/${ticketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, mediaUrl, mediaType, mediaName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ticket-detail", selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      setSupportReply("");
      setAdminMediaPreview(null);
      toast({ title: text("adminChat.support.replySent", "Reply sent") });
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  // Close ticket
  const closeTicketMutation = useMutation({
    mutationFn: (ticketId: string) =>
      adminFetch(`/api/admin/support-chat/tickets/${ticketId}/close`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket-detail", selectedTicketId] });
      toast({ title: text("adminChat.support.ticketClosed", "Ticket closed") });
    },
  });

  // Reopen ticket
  const reopenTicketMutation = useMutation({
    mutationFn: (ticketId: string) =>
      adminFetch(`/api/admin/support-chat/tickets/${ticketId}/reopen`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket-detail", selectedTicketId] });
      toast({ title: text("adminChat.support.ticketReopened", "Ticket reopened") });
    },
  });

  // Add auto reply
  const addAutoReplyMutation = useMutation({
    mutationFn: (data: { trigger: string; response: string; responseAr?: string }) =>
      adminFetch("/api/admin/support-chat/auto-replies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-auto-replies"] });
      setNewAutoTrigger("");
      setNewAutoResponse("");
      setNewAutoResponseAr("");
      toast({ title: text("adminChat.autoReply.added", "Auto reply added") });
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  // Toggle auto reply
  const toggleAutoReplyMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      adminFetch(`/api/admin/support-chat/auto-replies/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-auto-replies"] });
    },
  });

  // Delete auto reply
  const deleteAutoReplyMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/support-chat/auto-replies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-auto-replies"] });
      toast({ title: text("adminChat.autoReply.deleted", "Auto reply deleted") });
    },
  });

  // Update chat setting
  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      adminFetch(`/api/admin/chat-settings/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-chat-settings"] });
      toast({ title: text("adminChat.settings.updated", "Setting updated") });
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  // Add banned word
  const addBannedWordMutation = useMutation({
    mutationFn: (word: string) =>
      adminFetch("/api/admin/chat/banned-words", {
        method: "POST",
        body: JSON.stringify({ word }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banned-words"] });
      setNewBannedWord("");
      toast({ title: text("adminChat.wordFilter.wordAdded", "Word added") });
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  // Remove banned word
  const removeBannedWordMutation = useMutation({
    mutationFn: (word: string) =>
      adminFetch(`/api/admin/chat/banned-words/${encodeURIComponent(word)}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banned-words"] });
      toast({ title: text("adminChat.wordFilter.wordDeleted", "Word deleted") });
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const aiAgentChatMutation = useMutation({
    mutationFn: (message: string) =>
      adminFetch("/api/admin/ai-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      }) as Promise<AiAgentChatPayload>,
    onSuccess: (data: AiAgentChatPayload) => {
      const reply = typeof data?.reply === "string" && data.reply.trim().length > 0
        ? data.reply
        : text("adminChat.ai.replyEmpty", "Reply received with no content.");

      setAiAgentConversation((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: 'agent',
          message: reply,
          at: data?.generatedAt || new Date().toISOString(),
        },
      ]);

      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-report"] });

      if (data?.source && data.source !== "ai-service") {
        toast({
          title: text("adminChat.ai.fallbackModeTitle", "Fallback mode"),
          description: text("adminChat.ai.fallbackModeDescription", "Local engine was used because external AI service is currently unavailable."),
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const aiAgentDataQueryMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch("/api/admin/ai-agent/data-query", {
        method: "POST",
        body: JSON.stringify(payload),
      }) as Promise<AiAgentDataQueryPayload>,
    onError: (err: Error) => {
      toast({ title: text("common.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

  const buildRelativeDateRange = (lastDays: number): { from: string; to: string } => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - Math.max(0, lastDays - 1));
    return {
      from: toDateInput(from),
      to: toDateInput(to),
    };
  };

  const AI_QUERY_PRESETS: AiQueryPreset[] = [
    {
      key: "top-games",
      label: "Top Games",
      groupBy: "game",
    },
    {
      key: "daily-trends",
      label: "Daily Trends (7d)",
      groupBy: "day",
      ...buildRelativeDateRange(7),
    },
    {
      key: "difficulty-breakdown",
      label: "Difficulty Breakdown",
      groupBy: "difficulty",
    },
  ];

  const formatAiDataCell = (value: unknown): string => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value.toLocaleString("en-US") : "0";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (value === null || value === undefined) {
      return "-";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const runAiAgentDataQuery = (override?: Partial<{ groupBy: AiQueryGroupBy; gameType: string; from: string; to: string }>) => {
    const groupBy = override?.groupBy ?? aiDataQueryGroupBy;
    const gameType = (override?.gameType ?? aiDataQueryGameType).trim();
    const from = override?.from ?? aiDataQueryFrom;
    const to = override?.to ?? aiDataQueryTo;

    const payload: Record<string, unknown> = {
      groupBy,
      metric: "results",
    };

    if (gameType) payload.gameType = gameType.toLowerCase();
    if (from) payload.from = from;
    if (to) payload.to = to;

    aiAgentDataQueryMutation.mutate(payload);
  };

  const applyAiQueryPreset = (preset: AiQueryPreset) => {
    setAiActivePreset(preset.key);
    setAiDataQueryGroupBy(preset.groupBy);
    setAiDataQueryGameType(preset.gameType || "");
    setAiDataQueryFrom(preset.from || "");
    setAiDataQueryTo(preset.to || "");
    runAiAgentDataQuery({
      groupBy: preset.groupBy,
      gameType: preset.gameType || "",
      from: preset.from || "",
      to: preset.to || "",
    });
  };

  useEffect(() => {
    if (activeTab !== "ai-agent") return;
    if (aiAgentDataQueryMutation.data || aiAgentDataQueryMutation.isPending) return;
    runAiAgentDataQuery({ groupBy: "game" });
  }, [activeTab, aiAgentDataQueryMutation]);

  const aiDataQueryColumns = Array.isArray(aiAgentDataQueryMutation.data?.data?.columns)
    ? aiAgentDataQueryMutation.data?.data?.columns.map((value) => String(value))
    : [];

  const aiDataQueryRows = Array.isArray(aiAgentDataQueryMutation.data?.data?.rows)
    ? aiAgentDataQueryMutation.data?.data?.rows
    : [];

  const capabilityMethods = Array.isArray(aiAgentCapabilities?.capabilities?.autonomousLearning?.methods)
    ? aiAgentCapabilities.capabilities.autonomousLearning.methods.map((item) => String(item))
    : [];

  const handleAiAgentSend = () => {
    const prompt = aiAgentPrompt.trim();
    if (!prompt || aiAgentChatMutation.isPending) {
      return;
    }

    setAiAgentConversation((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'admin',
        message: prompt,
        at: new Date().toISOString(),
      },
    ]);

    setAiAgentPrompt("");
    aiAgentChatMutation.mutate(prompt);
  };

  // Handle admin reply with optional media
  const handleAdminSendReply = async () => {
    if (replyMutation.isPending || adminUploading || !selectedTicketId) return;
    const trimmed = supportReply.trim();

    if (adminMediaPreview) {
      setAdminUploading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": adminToken(),
          },
          body: JSON.stringify({
            fileName: adminMediaPreview.name,
            fileData: adminMediaPreview.url,
            fileType: adminMediaPreview.file.type,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          console.error("[Admin Chat] Upload error:", res.status, errData);
          throw new Error(errData.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        const uploadedUrl = data.url || data.fileUrl;
        if (!uploadedUrl) throw new Error("No URL returned");
        replyMutation.mutate({
          ticketId: selectedTicketId,
          content: trimmed || (adminMediaPreview.type === "image" ? "📷 Image" : adminMediaPreview.type === "video" ? "🎥 Video" : "📎 File"),
          mediaUrl: uploadedUrl,
          mediaType: adminMediaPreview.type,
          mediaName: adminMediaPreview.name,
        });
      } catch (err: unknown) {
        toast({ title: text("adminChat.upload.failed", "File upload failed"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setAdminUploading(false);
      }
    } else if (trimmed) {
      replyMutation.mutate({ ticketId: selectedTicketId, content: trimmed });
    }
  };

  const settingsMap: Record<string, string> = {};
  if (settings) {
    (settings as { key: string; value: string }[]).forEach((s) => {
      settingsMap[s.key] = s.value || "";
    });
  }

  const chatEnabled = settingsMap["chat_enabled"] !== "false";

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <MessageCircle className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{text("adminChat.title", "Chat Management")}</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {text("adminChat.subtitle", "Monitor and manage all chat systems in the platform")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <Label htmlFor="chat-toggle" className="text-sm font-medium">{text("adminChat.settings.enableChat", "Enable chat")}</Label>
            <Switch
              id="chat-toggle"
              checked={chatEnabled}
              onCheckedChange={(checked) => {
                updateSettingMutation.mutate({
                  key: "chat_enabled",
                  value: checked ? "true" : "false",
                });
              }}
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full gap-2 overflow-x-auto rounded-[24px] border border-slate-200/80 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
          <TabsTrigger value="overview" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <BarChart3 className="h-4 w-4" />
            {text("adminChat.tabs.overview", "Overview")}
          </TabsTrigger>
          <TabsTrigger value="support" className="relative min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Headphones className="h-4 w-4" />
            {text("adminChat.tabs.support", "Support chats")}
            {(supportStats?.unreadFromUsers || 0) > 0 && (
              <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {supportStats.unreadFromUsers > 9 ? "9+" : supportStats.unreadFromUsers}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="messages" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Eye className="h-4 w-4" />
            {text("adminChat.tabs.messages", "Message monitoring")}
          </TabsTrigger>
          <TabsTrigger value="ai-agent" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Bot className="h-4 w-4" />
            {text("adminChat.tabs.ai", "AI Assistant")}
          </TabsTrigger>
          <TabsTrigger value="features" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Shield className="h-4 w-4" />
            {text("adminChat.tabs.features", "Features")}
          </TabsTrigger>
          <TabsTrigger value="filter" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Filter className="h-4 w-4" />
            {text("adminChat.tabs.wordFilter", "Word filter")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="min-w-[126px] flex-none gap-1.5 rounded-2xl">
            <Settings className="h-4 w-4" />
            {text("adminChat.tabs.settings", "Settings")}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{stats?.totalPrivateMessages || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.totalPrivateMessages", "Total private messages")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold">{stats?.totalGameMessages || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.gameMessages", "Game messages")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p className="text-2xl font-bold">{stats?.todayPrivateMessages || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.privateMessagesToday", "Private messages today")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                <p className="text-2xl font-bold">{stats?.todayGameMessages || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.gameMessagesToday", "Game messages today")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Users className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-2xl font-bold">{stats?.activeChattersLast24h || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.activeChatters24h", "Active chatters (24h)")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Filter className="h-8 w-8 mx-auto mb-2 text-red-500" />
                <p className="text-2xl font-bold">{stats?.bannedWordsCount || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.stats.blockedWords", "Blocked words")}</p>
              </CardContent>
            </Card>
          </div>

          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg">{text("adminChat.status.title", "Chat status")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <span>{text("adminChat.status.system", "System status")}</span>
                <Badge variant={chatEnabled ? "default" : "destructive"}>
                  {chatEnabled ? text("adminChat.common.enabled", "Enabled") : text("adminChat.common.disabled", "Disabled")}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <span>{text("adminChat.status.maxMessageLength", "Max message length")}</span>
                <span className="font-mono">{settingsMap["max_message_length"] || "2000"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <span>{text("adminChat.status.rateLimit", "Message rate limit")}</span>
                <span className="font-mono">{settingsMap["chat_rate_limit"] || "5 / 3s"}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Agent Tab */}
        <TabsContent value="ai-agent" className="space-y-4">
          <Card className={DATA_CARD_CLASS}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  {text("adminChat.ai.reportTitle", "AI service reports")}
                </span>
                <Button
                  className={cn(BUTTON_3D_CLASS, "gap-1.5")}
                  onClick={() => {
                    refetchAiAgentReport();
                    refetchAiAgentCapabilities();
                    refetchAiAgentDataSummary();
                    runAiAgentDataQuery();
                  }}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      (aiAgentReportLoading || aiAgentCapabilitiesLoading || aiAgentDataSummaryLoading) && "animate-spin",
                    )}
                  />
                  {text("common.refresh", "Refresh")}
                </Button>
              </CardTitle>
              <CardDescription>
                {text("adminChat.ai.reportDescription", "Track external AI service health with learning and performance indicators.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground mb-1">{text("adminChat.ai.source", "Source")}</p>
                  <Badge variant={aiAgentReport?.source === "ai-service" ? "default" : "secondary"}>
                    {aiAgentReport?.source === "ai-service" ? "ai-service" : "fallback"}
                  </Badge>
                </div>
                <div className="rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground mb-1">{text("adminChat.ai.totalEvents", "Total events")}</p>
                  <p className="text-lg font-semibold">{aiAgentReport?.external?.report?.learning?.totalEvents ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground mb-1">{text("adminChat.ai.trackedMatches", "Tracked matches")}</p>
                  <p className="text-lg font-semibold">{aiAgentReport?.external?.report?.performance?.totalGames ?? aiAgentReport?.localFallback?.summary?.totalTrackedMoves ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground mb-1">{text("adminChat.ai.botWinRate", "Bot win rate")}</p>
                  <p className="text-lg font-semibold">{aiAgentReport?.external?.report?.performance?.aiWinRate ?? 0}%</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 p-3 text-xs text-muted-foreground space-y-1 dark:border-slate-800">
                <p>Connection: {aiAgentReport?.connection?.enabled ? "enabled" : "disabled"}</p>
                <p>Endpoint: {aiAgentReport?.connection?.baseUrl || "-"}</p>
                <p>Timeout: {aiAgentReport?.connection?.timeoutMs || 0} ms</p>
                <p>Generated: {aiAgentReport?.generatedAt ? new Date(aiAgentReport.generatedAt).toLocaleString("ar-EG") : "-"}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className={DATA_CARD_CLASS}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground mb-1">agentName</p>
                    <p className="font-medium">{String(aiAgentCapabilities?.capabilities?.agentName || "-")}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground mb-1">privacyMode</p>
                    <p className="font-medium">{String(aiAgentCapabilities?.capabilities?.privacyMode || "-")}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground mb-1">autonomousLearning</p>
                    <p className="font-medium">{aiAgentCapabilities?.capabilities?.autonomousLearning?.enabled ? "true" : "false"}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground mb-1">dataAnalyst</p>
                    <p className="font-medium">{aiAgentCapabilities?.capabilities?.dataAnalyst?.enabled ? "true" : "false"}</p>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">autonomousLearning.methods</p>
                  <div className="flex flex-wrap gap-1.5">
                    {capabilityMethods.length > 0 ? capabilityMethods.map((method) => (
                      <Badge key={method} variant="outline" className="text-[10px] font-normal">{method}</Badge>
                    )) : <span className="text-xs text-muted-foreground">-</span>}
                  </div>
                </div>

                <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                  <p>source: {aiAgentCapabilities?.source || "-"}</p>
                  <p>generatedAt: {aiAgentCapabilities?.generatedAt ? new Date(aiAgentCapabilities.generatedAt).toLocaleString("ar-EG") : "-"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className={DATA_CARD_CLASS}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Data Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(aiAgentDataSummary?.summary || {}).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="rounded-md border p-2">
                      <p className="text-muted-foreground mb-1 truncate">{key}</p>
                      <p className="font-medium break-all">
                        {typeof value === "number"
                          ? Number.isFinite(value) ? value.toLocaleString("en-US") : "0"
                          : typeof value === "boolean"
                            ? value ? "true" : "false"
                            : value == null
                              ? "-"
                              : String(value)}
                      </p>
                    </div>
                  ))}
                </div>

                <ScrollArea className="h-[130px] rounded-md border p-3">
                  <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                    {JSON.stringify(
                      {
                        insights: aiAgentDataSummary?.insights || null,
                        decisionAverages: aiAgentDataSummary?.decisionAverages || null,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </ScrollArea>

                <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                  <p>source: {aiAgentDataSummary?.source || "-"}</p>
                  <p>generatedAt: {aiAgentDataSummary?.generatedAt ? new Date(aiAgentDataSummary.generatedAt).toLocaleString("ar-EG") : "-"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5" />
                Data Query
              </CardTitle>
              <CardDescription>
                Query: /api/admin/ai-agent/data-query
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {AI_QUERY_PRESETS.map((preset) => (
                  <Button
                    key={preset.key}
                    type="button"
                    variant={aiActivePreset === preset.key ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => applyAiQueryPreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setAiActivePreset("custom");
                    setAiDataQueryGameType("");
                    setAiDataQueryFrom("");
                    setAiDataQueryTo("");
                  }}
                >
                  Clear Filters
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
                <div className="xl:col-span-2 grid grid-cols-3 gap-1">
                  {(["game", "day", "difficulty"] as const).map((groupBy) => (
                    <Button
                      key={groupBy}
                      type="button"
                      variant={aiDataQueryGroupBy === groupBy ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setAiActivePreset("custom");
                        setAiDataQueryGroupBy(groupBy);
                      }}
                    >
                      {groupBy}
                    </Button>
                  ))}
                </div>

                <Input
                  value={aiDataQueryGameType}
                  onChange={(e) => {
                    setAiActivePreset("custom");
                    setAiDataQueryGameType(e.target.value);
                  }}
                  placeholder="gameType"
                  className="h-8 text-xs rounded-xl"
                />
                <Input
                  value={aiDataQueryFrom}
                  onChange={(e) => {
                    setAiActivePreset("custom");
                    setAiDataQueryFrom(e.target.value);
                  }}
                  type="date"
                  className="h-8 text-xs rounded-xl"
                />
                <Input
                  value={aiDataQueryTo}
                  onChange={(e) => {
                    setAiActivePreset("custom");
                    setAiDataQueryTo(e.target.value);
                  }}
                  type="date"
                  className="h-8 text-xs rounded-xl"
                />
                <Button
                  type="button"
                  onClick={() => runAiAgentDataQuery()}
                  disabled={aiAgentDataQueryMutation.isPending}
                  className="h-8 gap-1.5 text-xs"
                >
                  {aiAgentDataQueryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {t("common.search")}
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200/80 p-3 text-xs text-muted-foreground space-y-1 dark:border-slate-800">
                <p>source: {aiAgentDataQueryMutation.data?.source || "-"}</p>
                <p>generatedAt: {aiAgentDataQueryMutation.data?.generatedAt ? new Date(aiAgentDataQueryMutation.data.generatedAt).toLocaleString("ar-EG") : "-"}</p>
                <p>query: {JSON.stringify(aiAgentDataQueryMutation.data?.query || { groupBy: aiDataQueryGroupBy, metric: "results" })}</p>
                <p>rows: {aiDataQueryRows.length}</p>
              </div>

              <ScrollArea className="h-[280px] rounded-[24px] border border-slate-200/80 dark:border-slate-800">
                <div className="min-w-[640px] p-3">
                  {aiAgentDataQueryMutation.isPending && (
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </div>
                  )}

                  {!aiAgentDataQueryMutation.isPending && aiDataQueryRows.length === 0 && (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}

                  {!aiAgentDataQueryMutation.isPending && aiDataQueryRows.length > 0 && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                        <tr className="border-b">
                          {aiDataQueryColumns.map((column) => (
                            <th key={column} className="text-start py-2 pe-3 font-semibold text-foreground whitespace-nowrap">
                              {AI_QUERY_COLUMN_LABELS[column] || column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {aiDataQueryRows.slice(0, 120).map((row, index) => (
                          <tr key={`${index}-${JSON.stringify(row).slice(0, 32)}`} className="border-b last:border-b-0">
                            {aiDataQueryColumns.map((column) => {
                              const value = row?.[column];
                              return (
                                <td key={column} className="py-2 pe-3 align-top text-muted-foreground">
                                  <span className={cn(
                                    "break-words",
                                    typeof value === "number" && "font-medium text-foreground",
                                  )}>
                                    {formatAiDataCell(value)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {text("adminChat.ai.chatTitle", "Chat with AI Assistant")}
              </CardTitle>
              <CardDescription>
                {text("adminChat.ai.chatDescription", "Ask about bot performance, risks, or solo-play optimization recommendations.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[320px] rounded-[24px] border border-slate-200/80 p-3 dark:border-slate-800">
                <div className="space-y-2">
                  {aiAgentConversation.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {text("adminChat.ai.emptyConversation", "No conversation yet. Start with a message like: Give me today's bot performance summary.")}
                    </p>
                  )}
                  {aiAgentConversation.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "max-w-[90%] rounded-md px-3 py-2 text-sm",
                        item.role === 'admin'
                          ? "ms-auto bg-primary text-primary-foreground"
                          : "me-auto bg-muted",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{item.message}</p>
                      <p className="mt-1 text-[10px] opacity-70">{new Date(item.at).toLocaleTimeString("ar-EG")}</p>
                    </div>
                  ))}
                  {aiAgentChatMutation.isPending && (
                    <div className="me-auto inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {text("adminChat.ai.generatingReply", "Generating reply...")}
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Input
                  value={aiAgentPrompt}
                  onChange={(e) => setAiAgentPrompt(e.target.value)}
                  placeholder={text("adminChat.ai.inputPlaceholder", "Ask about AI reports or solo-play issues...")}
                  className={INPUT_SURFACE_CLASS}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAiAgentSend();
                    }
                  }}
                />
                <Button onClick={handleAiAgentSend} disabled={aiAgentChatMutation.isPending || !aiAgentPrompt.trim()} className={cn(BUTTON_3D_PRIMARY_CLASS, "gap-1.5")}>
                  <Send className="h-4 w-4" />
                  {text("common.send", "Send")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support Chat Tab */}
        <TabsContent value="support" className="space-y-4">
          {/* Support Stats Cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Headphones className="h-7 w-7 mx-auto mb-2 text-yellow-500" />
                <p className="text-2xl font-bold">{supportStats?.waiting || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.support.waiting", "Waiting for reply")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <MessageCircle className="h-7 w-7 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold">{supportStats?.active || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.support.activeChats", "Active chats")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <Clock className="h-7 w-7 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{supportStats?.todayTickets || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.support.todayTickets", "Today's tickets")}</p>
              </CardContent>
            </Card>
            <Card className={STAT_CARD_CLASS}>
              <CardContent className="pt-6 text-center">
                <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-gray-500" />
                <p className="text-2xl font-bold">{supportStats?.closed || 0}</p>
                <p className="text-xs text-muted-foreground">{text("adminChat.support.closed", "Closed")}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tickets List */}
            <Card className={`${DATA_CARD_CLASS} lg:col-span-1`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Headphones className="h-4 w-4" />
                    {text("adminChat.support.tickets", "Tickets")}
                  </span>
                  <Button className={`${BUTTON_3D_CLASS} h-9 w-9 p-0`} onClick={() => refetchTickets()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </CardTitle>
                <div className="flex gap-1 flex-wrap">
                  {["all", "waiting", "open", "active", "closed"].map((f) => (
                    <Button
                      key={f}
                      variant={supportFilter === f ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSupportFilter(f)}
                    >
                      {f === "all" ? text("common.all", "All") : f === "waiting" ? text("adminChat.support.waiting", "Waiting") : f === "open" ? text("common.open", "Open") : f === "active" ? text("common.active", "Active") : text("common.closed", "Closed")}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y">
                    {(!supportTickets || supportTickets.length === 0) && (
                      <p className="text-center text-muted-foreground py-8 text-sm">{text("adminChat.support.noTickets", "No tickets")}</p>
                    )}
                    {supportTickets?.map((ticket: SupportTicket) => (
                      <button
                        key={ticket.id}
                        className={`w-full text-start p-3 hover:bg-muted/50 transition-colors ${selectedTicketId === ticket.id ? "bg-primary/10 border-s-2 border-primary" : ""
                          }`}
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm truncate">
                            {ticket.displayUsername || ticket.username || ticket.nickname || ticket.userId || text("common.user", "User")}
                          </span>
                          <div className="flex items-center gap-1">
                            {ticket.unreadCount > 0 && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                {ticket.unreadCount}
                              </Badge>
                            )}
                            <Badge
                              variant={ticket.status === "waiting" ? "default" : ticket.status === "active" ? "secondary" : "outline"}
                              className="text-[10px] h-5"
                            >
                              {ticket.status === "waiting" ? text("adminChat.support.waiting", "Waiting") : ticket.status === "open" ? text("common.open", "Open") : ticket.status === "active" ? text("common.active", "Active") : text("common.closed", "Closed")}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {(() => {
                            const d = new Date(String(ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt || ''));
                            return isNaN(d.getTime()) ? "—" : d.toLocaleString("ar-EG", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            });
                          })()}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Conversation View */}
            <Card className={`${DATA_CARD_CLASS} lg:col-span-2`}>
              {!selectedTicketId ? (
                <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground gap-3">
                  <Headphones className="h-12 w-12 opacity-30" />
                  <p className="text-sm">اختر تذكرة لعرض المحادثة</p>
                </div>
              ) : (
                <>
                  <CardHeader className="pb-2 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button className={`${BUTTON_3D_CLASS} h-9 w-9 p-0`} onClick={() => setSelectedTicketId(null)}>
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                          <CardTitle className="text-base">
                            {resolvePreferredUsername(ticketDetail?.user as { username?: unknown; nickname?: unknown; id?: unknown })}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            @{resolvePreferredUsername(ticketDetail?.user as { username?: unknown; nickname?: unknown; id?: unknown }, "user")}
                          </CardDescription>
                          <p className="text-[11px] text-muted-foreground">
                            {ticketDetail?.user?.email || ticketDetail?.user?.phone || ticketDetail?.user?.id}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          className={cn(autoTranslate ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "gap-1 text-xs")}
                          onClick={() => setAutoTranslate(!autoTranslate)}
                          title={t('chat.autoTranslate')}
                        >
                          <Languages className="h-3.5 w-3.5" />
                          {t('chat.autoTranslate')}
                        </Button>
                        <div className="relative">
                          <Button
                            className={cn(BUTTON_3D_CLASS, "gap-1 text-xs")}
                            onClick={() => setShowAdminLangMenu(!showAdminLangMenu)}
                          >
                            {currentLanguageInfo?.nativeName?.slice(0, 6) || targetLanguage}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                          {showAdminLangMenu && (
                            <div className="absolute top-full end-0 mt-1 w-[220px] max-h-[280px] overflow-y-auto bg-popover text-popover-foreground border rounded-lg shadow-xl z-50">
                              <div className="p-1.5 sticky top-0 bg-popover z-10">
                                <input
                                  placeholder={t('chat.searchLanguage')}
                                  value={adminLangFilter}
                                  onChange={(e) => setAdminLangFilter(e.target.value)}
                                  className="w-full h-7 text-xs px-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
                                  autoFocus
                                />
                              </div>
                              {languages
                                .filter(l => {
                                  if (!adminLangFilter) return true;
                                  const q = adminLangFilter.toLowerCase();
                                  return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.includes(q);
                                })
                                .map(lang => (
                                  <button
                                    key={lang.code}
                                    onClick={() => { setTargetLanguage(lang.code); setShowAdminLangMenu(false); setAdminLangFilter(""); }}
                                    className={cn("w-full text-start px-2 py-1.5 text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex justify-between", targetLanguage === lang.code && "bg-primary/10 font-semibold")}
                                  >
                                    <span>{lang.nativeName}</span>
                                    <span className="text-muted-foreground">{lang.name}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        {ticketDetail?.ticket?.status !== "closed" ? (
                          <Button
                            className={cn(BUTTON_3D_CLASS, "gap-1 text-xs text-destructive")}
                            onClick={() => closeTicketMutation.mutate(selectedTicketId)}
                            disabled={closeTicketMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {text("common.close", "Close")}
                          </Button>
                        ) : (
                          <Button
                            className={cn(BUTTON_3D_CLASS, "gap-1 text-xs")}
                            onClick={() => reopenTicketMutation.mutate(selectedTicketId)}
                            disabled={reopenTicketMutation.isPending}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {text("adminChat.support.reopen", "Reopen")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex flex-col h-[400px]">
                    <ScrollArea className="flex-1 p-3">
                      <div className="space-y-2">
                        {ticketDetail?.messages?.map((msg: TicketMessage) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.senderType === "admin" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.senderType === "admin"
                                ? "bg-primary text-primary-foreground rounded-ee-sm"
                                : msg.senderType === "system"
                                  ? "bg-muted text-muted-foreground rounded-es-sm italic text-xs"
                                  : "bg-card border border-border text-card-foreground rounded-es-sm"
                                }`}
                            >
                              {msg.senderType === "system" && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold mb-0.5">
                                  <Bot className="h-3 w-3" /> {text("adminChat.autoReply.systemReply", "Auto reply")}
                                </span>
                              )}
                              {/* Media display */}
                              {msg.mediaUrl && msg.mediaType === "image" && (
                                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                                  <img src={msg.mediaUrl} alt={msg.mediaName || text("common.image", "Image")} className="rounded-lg max-w-full max-h-48 object-cover" loading="lazy" />
                                </a>
                              )}
                              {msg.mediaUrl && msg.mediaType === "video" && (
                                <video src={msg.mediaUrl} controls className="rounded-lg max-w-full max-h-48 mb-1" />
                              )}
                              {msg.mediaUrl && msg.mediaType === "file" && (
                                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 p-2 mb-1 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors">
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="text-xs truncate flex-1">{msg.mediaName || text("common.file", "File")}</span>
                                  <Download className="h-3 w-3 shrink-0 opacity-60" />
                                </a>
                              )}
                              <p className="whitespace-pre-wrap break-words">{getDisplayText(String(msg.id), msg.content || '')}</p>
                              {/* Show both original and translated */}
                              {hasTranslation(String(msg.id)) && !isTranslatingMsg(String(msg.id)) && (
                                <div className="mt-0.5 border-t border-current/10">
                                  <p className="text-[11px] whitespace-pre-wrap break-words opacity-60 italic">
                                    {isShowingOriginal(String(msg.id))
                                      ? getTranslatedText(String(msg.id))
                                      : (msg.content || '')
                                    }
                                  </p>
                                  <button
                                    onClick={() => toggleTranslation(String(msg.id), msg.content || '')}
                                    className="text-[9px] opacity-50 hover:opacity-100 transition-opacity underline"
                                  >
                                    {isShowingOriginal(String(msg.id)) ? t('chat.showTranslation') : t('chat.showOriginal')}
                                  </button>
                                </div>
                              )}
                              {isTranslatingMsg(String(msg.id)) && (
                                <span className="text-[9px] opacity-60 flex items-center gap-1">
                                  <Loader2 className="h-2 w-2 animate-spin" /> {t('chat.translating')}
                                </span>
                              )}
                              <div className="flex items-center justify-between mt-1">
                                {msg.senderType === "user" && !hasTranslation(String(msg.id)) && !isTranslatingMsg(String(msg.id)) && (
                                  <button
                                    onClick={() => toggleTranslation(String(msg.id), msg.content || '')}
                                    className="text-[9px] opacity-40 hover:opacity-80 transition-opacity"
                                    title={t('chat.translate')}
                                  >
                                    <Languages className="h-3 w-3" />
                                  </button>
                                )}
                                <p className="text-[9px] opacity-60 text-end flex-1">
                                  {(() => {
                                    const d = new Date(msg.createdAt);
                                    return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("ar-EG", {
                                      hour: "2-digit", minute: "2-digit"
                                    });
                                  })()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    {ticketDetail?.ticket?.status !== "closed" && (
                      <div className="p-3 border-t space-y-2">
                        {/* Admin media preview */}
                        {adminMediaPreview && (
                          <div className="relative flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
                            {adminMediaPreview.type === "image" ? (
                              <img src={adminMediaPreview.url} alt="" className="h-12 w-12 object-cover rounded" />
                            ) : (
                              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="text-xs truncate flex-1">{adminMediaPreview.name}</span>
                            <button onClick={() => setAdminMediaPreview(null)} className="p-0.5 rounded-full hover:bg-destructive/20">
                              <XCircle className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            ref={adminFileInputRef}
                            type="file"
                            accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 10 * 1024 * 1024) { toast({ title: text("adminChat.upload.fileTooLarge", "File is too large"), variant: "destructive" }); return; }
                              const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
                              const reader = new FileReader();
                              reader.onload = () => setAdminMediaPreview({ url: reader.result as string, type, name: file.name, file });
                              reader.readAsDataURL(file);
                              if (adminFileInputRef.current) adminFileInputRef.current.value = "";
                            }}
                          />
                          <Button
                            className={`${BUTTON_3D_CLASS} h-10 w-10 shrink-0 p-0`}
                            onClick={() => adminFileInputRef.current?.click()}
                            disabled={adminUploading || replyMutation.isPending}
                            title={text("adminChat.upload.attachFile", "Attach file")}
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                          <Input
                            value={supportReply}
                            onChange={(e) => setSupportReply(e.target.value)}
                            placeholder={text("adminChat.support.replyPlaceholder", "Write your reply...")}
                            className={`${INPUT_SURFACE_CLASS} flex-1`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && (supportReply.trim() || adminMediaPreview)) {
                                e.preventDefault();
                                handleAdminSendReply();
                              }
                            }}
                          />
                          <Button
                            className={`${BUTTON_3D_PRIMARY_CLASS} h-10 w-10 p-0`}
                            onClick={handleAdminSendReply}
                            disabled={(!supportReply.trim() && !adminMediaPreview) || replyMutation.isPending || adminUploading}
                          >
                            {replyMutation.isPending || adminUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </>
              )}
            </Card>
          </div>

          {/* Auto Replies Section */}
          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {text("adminChat.autoReply.title", "Auto replies")}
              </CardTitle>
              <CardDescription>
                {text("adminChat.autoReply.description", "Configure automatic replies when specific keywords are matched in user messages")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new auto-reply */}
              <div className="grid gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <Label className="text-xs mb-1 block">{text("adminChat.autoReply.keyword", "Keyword")}</Label>
                  <Input
                    placeholder={text("adminChat.autoReply.keywordPlaceholder", "Example: withdrawal, deposit, welcome")}
                    value={newAutoTrigger}
                    onChange={(e) => setNewAutoTrigger(e.target.value)}
                    className={cn(INPUT_SURFACE_CLASS, "text-sm")}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{text("adminChat.autoReply.replyLocal", "Reply (local)")}</Label>
                  <Input
                    placeholder={text("adminChat.autoReply.replyPlaceholder", "Auto reply...")}
                    value={newAutoResponse}
                    onChange={(e) => setNewAutoResponse(e.target.value)}
                    className={cn(INPUT_SURFACE_CLASS, "text-sm")}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{text("adminChat.autoReply.replyEnglish", "Reply (English)")}</Label>
                  <Input
                    placeholder="Auto reply..."
                    value={newAutoResponseAr}
                    onChange={(e) => setNewAutoResponseAr(e.target.value)}
                    className={cn(INPUT_SURFACE_CLASS, "text-sm")}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      if (newAutoTrigger.trim() && newAutoResponse.trim()) {
                        addAutoReplyMutation.mutate({
                          trigger: newAutoTrigger.trim(),
                          response: newAutoResponse.trim(),
                          responseAr: newAutoResponseAr.trim() || undefined,
                        });
                      }
                    }}
                    disabled={!newAutoTrigger.trim() || !newAutoResponse.trim() || addAutoReplyMutation.isPending}
                    className={cn(BUTTON_3D_PRIMARY_CLASS, "w-full gap-1.5")}
                  >
                    <Plus className="h-4 w-4" />
                    {text("common.add", "Add")}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Auto replies list */}
              <div className="space-y-2">
                {(!autoReplies || autoReplies.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {text("adminChat.autoReply.empty", "No auto replies yet. Add one for welcome messages.")}
                  </p>
                )}
                {autoReplies?.map((reply: AutoReply) => (
                  <div key={reply.id} className="flex items-center justify-between rounded-[24px] border border-slate-200/80 p-3 dark:border-slate-800">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{reply.trigger}</Badge>
                        {!reply.isEnabled && <Badge variant="secondary" className="text-[10px]">{text("common.disabled", "Disabled")}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{reply.response}</p>
                    </div>
                    <div className="flex items-center gap-1 ms-2">
                      <Switch
                        checked={reply.isEnabled}
                        onCheckedChange={(checked) => toggleAutoReplyMutation.mutate({ id: reply.id, isEnabled: checked })}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className={`${BUTTON_3D_DESTRUCTIVE_CLASS} h-8 w-8 p-0 text-destructive-foreground`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className={DIALOG_SURFACE_CLASS}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{text("adminChat.autoReply.deleteTitle", "Delete auto reply?")}</AlertDialogTitle>
                            <AlertDialogDescription>{text("adminChat.autoReply.deleteDescription", "This auto reply will be permanently deleted.")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className={BUTTON_3D_CLASS}>إلغاء</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteAutoReplyMutation.mutate(reply.id)}
                              className={BUTTON_3D_DESTRUCTIVE_CLASS}
                            >
                              {text("common.delete", "Delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Monitoring Tab */}
        <TabsContent value="messages" className="space-y-4">
          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {text("adminChat.messages.title", "Message monitoring")}
              </CardTitle>
              <CardDescription>
                {text("adminChat.messages.description", "Private chats are encrypted - only P2P and challenge chats can be monitored")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* E2EE Privacy Notice */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-6 text-center space-y-3">
                <Shield className="h-12 w-12 mx-auto text-emerald-500" />
                <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {text("adminChat.messages.e2eeTitle", "End-to-end encrypted chats (E2EE)")}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {text("adminChat.messages.e2eeDescription", "Private chats between users are protected by end-to-end encryption. No one, including admins, can read these messages. Only P2P and challenge chats can be monitored.")}
                </p>
                <div className="flex justify-center gap-4 pt-2">
                  <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30">
                    <Shield className="h-3 w-3" />
                    {text("adminChat.messages.e2eeEnabled", "E2EE enabled")}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    خوارزمية X25519 + AES-GCM
                  </Badge>
                </div>
              </div>

              <Separator />

              <p className="text-sm text-muted-foreground text-center">
                {text("adminChat.messages.p2pHint", "To review P2P and challenge chats, use the dedicated P2P/challenges management sections.")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Word Filter Tab */}
        <TabsContent value="filter" className="space-y-4">
          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {text("adminChat.wordFilter.title", "Blocked words filter")}
              </CardTitle>
              <CardDescription>
                {text("adminChat.wordFilter.description", "Manage words that are automatically filtered from messages")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder={text("adminChat.wordFilter.addPlaceholder", "Add a new word...")}
                  value={newBannedWord}
                  onChange={(e) => setNewBannedWord(e.target.value)}
                  className={INPUT_SURFACE_CLASS}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newBannedWord.trim()) {
                      addBannedWordMutation.mutate(newBannedWord.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (newBannedWord.trim()) {
                      addBannedWordMutation.mutate(newBannedWord.trim());
                    }
                  }}
                  disabled={!newBannedWord.trim() || addBannedWordMutation.isPending}
                  className={cn(BUTTON_3D_PRIMARY_CLASS, "gap-1.5")}
                >
                  <Plus className="h-4 w-4" />
                  {text("common.add", "Add")}
                </Button>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                {bannedWordsData?.words?.map((word: string) => (
                  <Badge
                    key={word}
                    variant="secondary"
                    className="gap-1 py-1.5 px-3 text-sm"
                  >
                    {word}
                    <button
                      onClick={() => removeBannedWordMutation.mutate(word)}
                      className="ms-1 hover:text-destructive transition-colors"
                      disabled={removeBannedWordMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!bannedWordsData?.words || bannedWordsData.words.length === 0) && (
                  <p className="text-sm text-muted-foreground py-4">
                    {text("adminChat.wordFilter.empty", "No blocked words")}
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 inline me-1" />
                  {text("adminChat.wordFilter.hint", "Blocked words are replaced automatically with *** in all messages. Changes apply immediately to new messages only.")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Tab - Media, Auto-Delete, PIN Management */}
        <TabsContent value="features" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Media Management */}
            <Card className={DATA_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  📷 {text("adminChat.features.media.title", "Media management")}
                </CardTitle>
                <CardDescription>{text("adminChat.features.media.description", "Control image and video sending feature")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AdminFeatureSection
                  featureType="media"
                  toast={toast}
                />
              </CardContent>
            </Card>

            {/* Auto-Delete Management */}
            <Card className={DATA_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  ⏱️ {text("adminChat.features.autodelete.title", "Auto-delete management")}
                </CardTitle>
                <CardDescription>{text("adminChat.features.autodelete.description", "Control automatic message deletion feature")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AdminFeatureSection
                  featureType="auto-delete"
                  toast={toast}
                />
              </CardContent>
            </Card>

            {/* Voice / Video Call Pricing */}
            <Card className={DATA_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PhoneCall className="h-4 w-4" />
                  <Video className="h-4 w-4" />
                  {text("adminChat.features.callPricing.title", "Call pricing and chat operations")}
                </CardTitle>
                <CardDescription>{text("adminChat.features.callPricing.description", "Manage private call prices, voice-message pricing, and message deletion charges")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AdminCallPricingSection toast={toast} />
              </CardContent>
            </Card>

            {/* PIN Management */}
            <Card className={DATA_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  🔐 {text("adminChat.features.pin.title", "PIN management")}
                </CardTitle>
                <CardDescription>{text("adminChat.features.pin.description", "Reset user PIN when needed")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AdminPinResetSection toast={toast} />
              </CardContent>
            </Card>
          </div>

          {/* Support Chat Media Settings */}
          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                📎 {text("adminChat.features.supportMedia.title", "Support chat media")}
              </CardTitle>
              <CardDescription>{text("adminChat.features.supportMedia.description", "Control sending media (images, video, files) in support chat")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AdminSupportMediaSection toast={toast} />
            </CardContent>
          </Card>

          {/* Privacy Notice */}
          <Card className={`${DATA_CARD_CLASS} border-emerald-500/30 bg-emerald-500/5`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">{text("adminChat.privacy.title", "Chat privacy")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {text("adminChat.privacy.description", "Private user-to-user chats are end-to-end encrypted (E2EE) and cannot be read by admins. Only P2P/challenge chats can be monitored to preserve user privacy.")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card className={DATA_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {text("adminChat.settings.title", "Chat settings")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{text("adminChat.settings.enableChat", "Enable chat")}</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={chatEnabled}
                    onCheckedChange={(checked) => {
                      updateSettingMutation.mutate({
                        key: "chat_enabled",
                        value: checked ? "true" : "false",
                      });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {chatEnabled ? text("adminChat.settings.enabledForAll", "Chat is enabled for everyone") : text("adminChat.settings.disabled", "Chat is disabled")}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>{text("adminChat.settings.maxMessageLength", "Maximum message length")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    defaultValue={settingsMap["max_message_length"] || "2000"}
                    className={cn(INPUT_SURFACE_CLASS, "w-32")}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0 && val <= 10000) {
                        updateSettingMutation.mutate({
                          key: "max_message_length",
                          value: String(val),
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground self-center">{text("adminChat.settings.characters", "characters")}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>{text("adminChat.settings.rateLimit", "Message rate limit")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    defaultValue={settingsMap["chat_rate_limit"] || "5"}
                    className={cn(INPUT_SURFACE_CLASS, "w-32")}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0 && val <= 100) {
                        updateSettingMutation.mutate({
                          key: "chat_rate_limit",
                          value: String(val),
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground self-center">{text("adminChat.settings.messagesPer3s", "messages / 3 seconds")}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 rounded-[24px] border border-emerald-500/20 bg-emerald-500/5 p-4">
                <Label className="text-emerald-700 dark:text-emerald-400">{text("adminChat.settings.privatePrivacy", "Private message privacy")}</Label>
                <p className="text-sm text-muted-foreground">
                  {text("adminChat.settings.e2eeNotice", "Due to full end-to-end encryption (E2EE), the system cannot delete or read private messages from the admin panel.")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {text("adminChat.settings.e2eeGuidance", "For administrative review, use only P2P/challenge monitoring tools available in their dedicated sections.")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div >
  );
}

// Admin Feature Management Sub-Component
function AdminFeatureSection({ featureType, toast }: { featureType: "media" | "auto-delete"; toast: ToastFn }) {
  const { t } = useI18n();
  const text = (key: string, fallback: string) => i18nText(t, key, fallback);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState("");

  const { data: stats, refetch } = useQuery({
    queryKey: [`admin-chat-${featureType}-stats`],
    queryFn: () => adminFetch(`/api/admin/chat/${featureType}/stats`),
  });

  const handleGrant = async () => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) return;
    setLoading(true);
    try {
      await adminFetch(`/api/admin/chat/${featureType}/grant`, {
        method: "POST",
        body: JSON.stringify({ userId: trimmedUserId }),
      });
      toast({ title: `${text("adminChat.features.granted", "Feature granted to user")} ${trimmedUserId}` });
      setUserId("");
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleRevoke = async (id: string) => {
    try {
      await adminFetch(`/api/admin/chat/${featureType}/revoke`, {
        method: "POST",
        body: JSON.stringify({ userId: id }),
      });
      toast({ title: text("adminChat.features.revoked", "Feature revoked") });
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleUpdatePrice = async () => {
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast({ title: text("common.error", "Error"), description: text("adminChat.pricing.invalidPrice", "Invalid price"), variant: "destructive" });
      return;
    }

    try {
      await adminFetch(`/api/admin/chat/${featureType}/pricing`, {
        method: "PUT",
        body: JSON.stringify({ price: Number(parsedPrice.toFixed(2)) }),
      });
      toast({ title: text("adminChat.pricing.updated", "Price updated") });
      setPrice("");
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.totalEnabled || 0}</div>
          <div className="text-muted-foreground text-xs">{text("adminChat.feature.enabledUsers", "Enabled users")}</div>
        </div>
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.currentPrice || "—"}</div>
          <div className="text-muted-foreground text-xs">{text("common.price", "Price")}</div>
        </div>
      </div>

      {/* Price Update */}
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={text("adminChat.pricing.newPrice", "New price")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${INPUT_SURFACE_CLASS} flex-1`}
        />
        <Button size="sm" className={BUTTON_3D_PRIMARY_CLASS} onClick={handleUpdatePrice} disabled={!price.trim()}>
          {text("common.update", "Update")}
        </Button>
      </div>

      <Separator />

      {/* Grant to user */}
      <div className="flex gap-2">
        <Input
          placeholder={text("adminChat.userIdPlaceholder", "User ID")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={`${INPUT_SURFACE_CLASS} flex-1`}
        />
        <Button size="sm" className={BUTTON_3D_PRIMARY_CLASS} onClick={handleGrant} disabled={loading || !userId.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : text("adminChat.feature.grant", "Grant")}
        </Button>
      </div>

      {/* Enabled users list */}
      {stats?.users?.length > 0 && (
        <ScrollArea className="h-32">
          <div className="space-y-1">
            {stats.users.map((u: ChatFeatureUser) => (
              <div key={u.userId} className="flex items-center justify-between rounded-2xl bg-muted/50 p-1.5 text-sm">
                <span className="truncate">{u.username || u.userId}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{u.grantedBy}</Badge>
                  <Button className={`${BUTTON_3D_CLASS} h-6 w-6 p-0`} onClick={() => handleRevoke(u.userId)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function AdminCallPricingSection({ toast }: { toast: ToastFn }) {
  const { t } = useI18n();
  const text = (key: string, fallback: string) => i18nText(t, key, fallback);
  const [voicePrice, setVoicePrice] = useState("");
  const [videoPrice, setVideoPrice] = useState("");
  const [voiceMessagePrice, setVoiceMessagePrice] = useState("");
  const [messageDeletePrice, setMessageDeletePrice] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: stats, refetch, isFetching } = useQuery({
    queryKey: ["admin-chat-calls-stats"],
    queryFn: () => adminFetch("/api/admin/chat/calls/stats"),
  });

  const handleSave = async () => {
    const payload: Record<string, number> = {};

    if (voicePrice.trim()) {
      const parsed = Number(voicePrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({ title: text("common.error", "Error"), description: text("adminChat.callPricing.invalidVoiceMinute", "Invalid voice minute price"), variant: "destructive" });
        return;
      }
      payload.voicePricePerMinute = Number(parsed.toFixed(2));
    }

    if (videoPrice.trim()) {
      const parsed = Number(videoPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({ title: text("common.error", "Error"), description: text("adminChat.callPricing.invalidVideoMinute", "Invalid video minute price"), variant: "destructive" });
        return;
      }
      payload.videoPricePerMinute = Number(parsed.toFixed(2));
    }

    if (voiceMessagePrice.trim()) {
      const parsed = Number(voiceMessagePrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({ title: text("common.error", "Error"), description: text("adminChat.callPricing.invalidVoiceMessage", "Invalid voice message price"), variant: "destructive" });
        return;
      }
      payload.voiceMessagePrice = Number(parsed.toFixed(2));
    }

    if (messageDeletePrice.trim()) {
      const parsed = Number(messageDeletePrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({ title: text("common.error", "Error"), description: text("adminChat.callPricing.invalidDeletePrice", "Invalid message delete price"), variant: "destructive" });
        return;
      }
      payload.messageDeletePrice = Number(parsed.toFixed(2));
    }

    if (!Object.keys(payload).length) {
      toast({ title: text("common.notice", "Notice"), description: text("adminChat.callPricing.enterValue", "Enter at least one value") });
      return;
    }

    setSaving(true);
    try {
      await adminFetch("/api/admin/chat/calls/pricing", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setVoicePrice("");
      setVideoPrice("");
      setVoiceMessagePrice("");
      setMessageDeletePrice("");
      toast({ title: text("adminChat.callPricing.updated", "Pricing updated") });
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.voicePricePerMinute ?? 0}</div>
          <div className="text-muted-foreground text-xs">{text("adminChat.callPricing.voiceMinute", "Voice minute price")}</div>
        </div>
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.videoPricePerMinute ?? 0}</div>
          <div className="text-muted-foreground text-xs">{text("adminChat.callPricing.videoMinute", "Video minute price")}</div>
        </div>
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.voiceMessagePrice ?? 0}</div>
          <div className="text-muted-foreground text-xs">{text("adminChat.callPricing.voiceMessage", "Voice message price")}</div>
        </div>
        <div className="rounded-2xl bg-muted p-2 text-center">
          <div className="text-lg font-bold">{stats?.messageDeletePrice ?? 0}</div>
          <div className="text-muted-foreground text-xs">{text("adminChat.callPricing.deleteMessage", "Message delete price")}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200/70 p-2 text-center dark:border-slate-800">
          <div className="font-semibold">{stats?.totals?.voiceMinutes ?? 0}</div>
          <div className="text-muted-foreground">{text("adminChat.callPricing.billedVoiceMinutes", "Billed voice minutes")}</div>
        </div>
        <div className="rounded-xl border border-slate-200/70 p-2 text-center dark:border-slate-800">
          <div className="font-semibold">{stats?.totals?.videoMinutes ?? 0}</div>
          <div className="text-muted-foreground">{text("adminChat.callPricing.billedVideoMinutes", "Billed video minutes")}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200/70 p-2 text-center dark:border-slate-800">
          <div className="font-semibold">{stats?.totals?.voiceMessagesCharged ?? 0}</div>
          <div className="text-muted-foreground">{text("adminChat.callPricing.billedVoiceMessages", "Billed voice messages")}</div>
        </div>
        <div className="rounded-xl border border-slate-200/70 p-2 text-center dark:border-slate-800">
          <div className="font-semibold">{stats?.totals?.deleteActionsCharged ?? 0}</div>
          <div className="text-muted-foreground">{text("adminChat.callPricing.billedDeletes", "Billed message deletions")}</div>
        </div>
      </div>

      <div className="space-y-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={text("adminChat.callPricing.voiceMinute", "Voice minute price")}
          value={voicePrice}
          onChange={(e) => setVoicePrice(e.target.value)}
          className={INPUT_SURFACE_CLASS}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={text("adminChat.callPricing.videoMinute", "Video minute price")}
          value={videoPrice}
          onChange={(e) => setVideoPrice(e.target.value)}
          className={INPUT_SURFACE_CLASS}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={text("adminChat.callPricing.voiceMessage", "Voice message price")}
          value={voiceMessagePrice}
          onChange={(e) => setVoiceMessagePrice(e.target.value)}
          className={INPUT_SURFACE_CLASS}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={text("adminChat.callPricing.deleteMessage", "Message delete price")}
          value={messageDeletePrice}
          onChange={(e) => setMessageDeletePrice(e.target.value)}
          className={INPUT_SURFACE_CLASS}
        />
      </div>

      <Button
        className={cn(BUTTON_3D_PRIMARY_CLASS, "w-full gap-1.5")}
        disabled={saving || isFetching}
        onClick={handleSave}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {text("adminChat.callPricing.update", "Update pricing")}
      </Button>
    </div>
  );
}

// Admin PIN Reset Sub-Component
function AdminPinResetSection({ toast }: { toast: ToastFn }) {
  const { t } = useI18n();
  const text = (key: string, fallback: string) => i18nText(t, key, fallback);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) return;
    setLoading(true);
    try {
      await adminFetch(`/api/admin/chat/pin/reset`, {
        method: "POST",
        body: JSON.stringify({ userId: trimmedUserId }),
      });
      toast({ title: `${text("adminChat.pinReset.done", "PIN reset for user")} ${trimmedUserId}` });
      setUserId("");
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {text("adminChat.pinReset.description", "You can reset a user PIN if it is forgotten. The PIN will be removed completely.")}
      </p>
      <div className="flex gap-2">
        <Input
          placeholder={text("adminChat.userIdPlaceholder", "User ID")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={`${INPUT_SURFACE_CLASS} flex-1`}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className={BUTTON_3D_DESTRUCTIVE_CLASS} disabled={loading || !userId.trim()}>
              {text("adminChat.pinReset.action", "Reset")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className={DIALOG_SURFACE_CLASS}>
            <AlertDialogHeader>
              <AlertDialogTitle>{text("adminChat.pinReset.confirmTitle", "Reset PIN")}</AlertDialogTitle>
              <AlertDialogDescription>
                {text("adminChat.pinReset.confirmDescription", "PIN will be removed for user")} {userId}. {text("common.areYouSure", "Are you sure?")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={BUTTON_3D_CLASS}>{text("common.cancel", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction className={BUTTON_3D_DESTRUCTIVE_CLASS} onClick={handleReset}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : text("common.confirm", "Confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-3">
        <p className="text-xs text-muted-foreground">
          ⚠️ {text("adminChat.pinReset.warning", "Resetting will remove PIN protection from the user's chats. Use this only when requested through support.")}
        </p>
      </div>
    </div>
  );
}

// Admin Support Media Settings Sub-Component
function AdminSupportMediaSection({ toast }: { toast: ToastFn }) {
  const { t } = useI18n();
  const text = (key: string, fallback: string) => i18nText(t, key, fallback);
  const [blockUserId, setBlockUserId] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: mediaSettings, refetch } = useQuery({
    queryKey: ["admin-support-media-settings"],
    queryFn: () => adminFetch("/api/admin/support-chat/media-settings"),
  });

  const globalEnabled = mediaSettings?.globalEnabled ?? true;

  const handleToggleGlobal = async (enabled: boolean) => {
    setLoading(true);
    try {
      await adminFetch("/api/admin/support-chat/media-settings/global", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      toast({ title: enabled ? text("adminChat.supportMedia.enabled", "Support media enabled") : text("adminChat.supportMedia.disabled", "Support media disabled") });
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleBlockUser = async () => {
    if (!blockUserId.trim()) return;
    setLoading(true);
    try {
      await adminFetch("/api/admin/support-chat/media-settings/block-user", {
        method: "POST",
        body: JSON.stringify({ userId: blockUserId.trim() }),
      });
      toast({ title: `${text("adminChat.supportMedia.blocked", "Blocked media for user")} ${blockUserId}` });
      setBlockUserId("");
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      await adminFetch("/api/admin/support-chat/media-settings/unblock-user", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      toast({ title: text("adminChat.supportMedia.unblocked", "Unblocked media") });
      refetch();
    } catch (err: unknown) {
      toast({ title: text("common.error", "Error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Global toggle */}
      <div className="flex items-center justify-between rounded-[24px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
        <div>
          <Label className="text-sm font-medium">{text("adminChat.supportMedia.globalToggle", "Enable media globally")}</Label>
          <p className="text-xs text-muted-foreground">{text("adminChat.supportMedia.globalDescription", "Allow all users to send media in support")}</p>
        </div>
        <Switch
          checked={globalEnabled}
          onCheckedChange={handleToggleGlobal}
          disabled={loading}
        />
      </div>

      <Separator />

      {/* Block user */}
      <div>
        <Label className="text-xs mb-1 block">{text("adminChat.supportMedia.blockUserLabel", "Block media for a specific user")}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={text("adminChat.userIdPlaceholder", "User ID")}
            value={blockUserId}
            onChange={(e) => setBlockUserId(e.target.value)}
            className={`${INPUT_SURFACE_CLASS} flex-1`}
          />
          <Button size="sm" className={BUTTON_3D_DESTRUCTIVE_CLASS} onClick={handleBlockUser} disabled={loading || !blockUserId.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : text("common.block", "Block")}
          </Button>
        </div>
      </div>

      {/* Blocked users list */}
      {mediaSettings?.blockedUsers?.length > 0 && (
        <>
          <Separator />
          <div>
            <Label className="text-xs mb-2 block">{text("adminChat.supportMedia.blockedUsers", "Blocked users")} ({mediaSettings.blockedUsers.length})</Label>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {mediaSettings.blockedUsers.map((u: ChatFeatureUser) => (
                  <div key={u.id} className="flex items-center justify-between rounded-2xl bg-muted/50 p-1.5 text-sm">
                    <span className="truncate">{u.username || u.nickname || u.id}</span>
                    <Button className={`${BUTTON_3D_CLASS} h-6 w-6 p-0`} onClick={() => handleUnblockUser(u.id || '')}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}

      <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-xs text-muted-foreground">
          💡 {text("adminChat.supportMedia.adminNotice", "Admins can always send media. This control applies to users only.")}
        </p>
      </div>
    </div>
  );
}
