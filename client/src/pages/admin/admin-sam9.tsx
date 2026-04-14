import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  Database,
  Loader2,
  MessageCircle,
  Play,
  Power,
  RefreshCw,
  Search,
  Send,
  Shield,
  Square,
  Zap,
} from "lucide-react";

const adminToken = () => localStorage.getItem("adminToken") || "";

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

interface AiAgentCapabilitiesPayload {
  source?: string;
  generatedAt?: string;
  capabilities?: {
    agentName?: string;
    mode?: string;
    privacyMode?: string;
    runtimeControl?: {
      enabled?: boolean;
      currentState?: string;
      endpoints?: Record<string, string>;
    };
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
  role: "admin" | "agent";
  message: string;
  at: string;
  intent?: string;
  intentConfidence?: number | null;
  actions?: string[];
}

interface AiAgentChatPayload {
  source?: string;
  generatedAt?: string;
  reply?: string;
  summary?: Record<string, unknown> | null;
  intent?: string | null;
  intentConfidence?: number | null;
  thread?: Record<string, unknown> | null;
  actions?: Array<Record<string, unknown>>;
  recommendations?: Record<string, unknown> | null;
}

type AiAdminContextMode = "auto" | "pm" | "developer" | "ops" | "analytics";

interface AiAgentRuntimePayload {
  source?: string;
  generatedAt?: string;
  healthStatus?: string;
  runtime?: {
    enabled?: boolean;
    changedAt?: string;
    changedBy?: string;
    reason?: string;
  };
}

interface AiAgentSelfTunePayload {
  source?: string;
  generatedAt?: string;
  tunedStrategies?: number;
  trigger?: string;
  success?: boolean;
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

const AI_CHAT_CONTEXT_MODES: Array<{ value: AiAdminContextMode; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "pm", label: "PM" },
  { value: "developer", label: "DEV" },
  { value: "ops", label: "OPS" },
  { value: "analytics", label: "ANALYTICS" },
];

const SURFACE_CARD_CLASS = "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75";
const STAT_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-4 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/80";
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} shadow-[0_18px_45px_-28px_rgba(15,23,42,0.28)]`;
const BUTTON_3D_CLASS = "inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.6)] transition-all hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const BUTTON_3D_PRIMARY_CLASS = "inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-18px_rgba(14,116,144,0.65)] transition-all hover:-translate-y-0.5 hover:brightness-105";
const BUTTON_3D_DESTRUCTIVE_CLASS = "inline-flex items-center justify-center rounded-2xl border border-destructive/20 bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground shadow-[0_14px_30px_-18px_rgba(190,24,93,0.6)] transition-all hover:-translate-y-0.5 hover:brightness-105";
const INPUT_SURFACE_CLASS = "rounded-2xl border-slate-200/80 bg-white/90 shadow-inner shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/70 dark:shadow-black/20";
const TEXTAREA_SURFACE_CLASS = `${INPUT_SURFACE_CLASS} min-h-[170px]`;

async function adminFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
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

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

function buildRelativeDateRange(lastDays: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Math.max(0, lastDays - 1));
  return {
    from: toDateInput(from),
    to: toDateInput(to),
  };
}

function formatAiDataCell(value: unknown): string {
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
}

export default function AdminSam9Page() {
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [aiAgentPrompt, setAiAgentPrompt] = useState("");
  const [aiAgentConversation, setAiAgentConversation] = useState<AiAgentConversationMessage[]>([]);
  const [aiAgentContextMode, setAiAgentContextMode] = useState<AiAdminContextMode>("auto");
  const aiAgentThreadId = useMemo(() => `admin-sam9-${Date.now().toString(36)}`, []);

  const [aiDataQueryGroupBy, setAiDataQueryGroupBy] = useState<AiQueryGroupBy>("game");
  const [aiDataQueryGameType, setAiDataQueryGameType] = useState("");
  const [aiDataQueryFrom, setAiDataQueryFrom] = useState("");
  const [aiDataQueryTo, setAiDataQueryTo] = useState("");
  const [aiActivePreset, setAiActivePreset] = useState("top-games");

  const [runtimeReason, setRuntimeReason] = useState("");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [snapshotTags, setSnapshotTags] = useState("");

  const { data: aiAgentReport, refetch: refetchAiAgentReport, isFetching: aiAgentReportLoading } = useQuery<AiAgentReportPayload>({
    queryKey: ["admin-ai-agent-report"],
    queryFn: () => adminFetch("/api/admin/ai-agent/report"),
    refetchInterval: 30000,
  });

  const {
    data: aiAgentCapabilities,
    refetch: refetchAiAgentCapabilities,
    isFetching: aiAgentCapabilitiesLoading,
  } = useQuery<AiAgentCapabilitiesPayload>({
    queryKey: ["admin-ai-agent-capabilities"],
    queryFn: () => adminFetch("/api/admin/ai-agent/capabilities"),
    refetchInterval: 60000,
  });

  const {
    data: aiAgentDataSummary,
    refetch: refetchAiAgentDataSummary,
    isFetching: aiAgentDataSummaryLoading,
  } = useQuery<AiAgentDataSummaryPayload>({
    queryKey: ["admin-ai-agent-data-summary"],
    queryFn: () => adminFetch("/api/admin/ai-agent/data-summary"),
    refetchInterval: 45000,
  });

  const {
    data: aiAgentRuntime,
    refetch: refetchAiAgentRuntime,
    isFetching: aiAgentRuntimeLoading,
  } = useQuery<AiAgentRuntimePayload>({
    queryKey: ["admin-ai-agent-runtime"],
    queryFn: () => adminFetch("/api/admin/ai-agent/runtime"),
    refetchInterval: 10000,
  });

  const aiAgentChatMutation = useMutation({
    mutationFn: ({ message, contextMode }: { message: string; contextMode: AiAdminContextMode }) =>
      adminFetch("/api/admin/ai-agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          contextMode,
          threadId: aiAgentThreadId,
        }),
      }) as Promise<AiAgentChatPayload>,
    onSuccess: (data: AiAgentChatPayload) => {
      const reply = typeof data?.reply === "string" && data.reply.trim().length > 0
        ? data.reply
        : "تم استلام الرد بدون محتوى.";

      const actionNames = Array.isArray(data?.actions)
        ? data.actions.map((item) => String(item?.action || "")).filter((value) => value.length > 0)
        : [];

      setAiAgentConversation((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "agent",
          message: reply,
          at: data?.generatedAt || new Date().toISOString(),
          intent: typeof data?.intent === "string" ? data.intent : undefined,
          intentConfidence: typeof data?.intentConfidence === "number" ? data.intentConfidence : null,
          actions: actionNames,
        },
      ]);

      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-report"] });

      if (data?.source && data.source !== "ai-service") {
        toast({
          title: "وضع احتياطي",
          description: "تم استخدام المحرك المحلي لأن خدمة AI الخارجية غير متاحة حالياً.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const aiAgentDataQueryMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch("/api/admin/ai-agent/data-query", {
        method: "POST",
        body: JSON.stringify(payload),
      }) as Promise<AiAgentDataQueryPayload>,
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const runtimeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      adminFetch("/api/admin/ai-agent/runtime", {
        method: "POST",
        body: JSON.stringify({
          enabled,
          reason: runtimeReason.trim() || (enabled ? "start from admin panel" : "stop from admin panel"),
        }),
      }) as Promise<AiAgentRuntimePayload>,
    onSuccess: (data) => {
      const enabled = data?.runtime?.enabled === true;
      toast({
        title: enabled ? "تم تشغيل SAM9" : "تم إيقاف SAM9",
        description: data?.runtime?.changedAt ? new Date(data.runtime.changedAt).toLocaleString("ar-EG") : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-runtime"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-data-summary"] });
      setRuntimeReason("");
    },
    onError: (err: Error) => {
      toast({ title: "خطأ التحكم في SAM9", description: err.message, variant: "destructive" });
    },
  });

  const selfTuneMutation = useMutation({
    mutationFn: () =>
      adminFetch("/api/admin/ai-agent/self-tune", {
        method: "POST",
        body: JSON.stringify({ trigger: "admin-sam9-panel" }),
      }) as Promise<AiAgentSelfTunePayload>,
    onSuccess: (data) => {
      toast({
        title: "تم تنفيذ دورة الضبط الذاتي",
        description: `عدد الاستراتيجيات المعدلة: ${data?.tunedStrategies ?? 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-agent-data-summary"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const projectSnapshotMutation = useMutation({
    mutationFn: ({ notes, tags }: { notes: string; tags: string[] }) =>
      adminFetch("/api/admin/ai-agent/project-snapshot", {
        method: "POST",
        body: JSON.stringify({ notes, tags }),
      }) as Promise<{ success?: boolean }>,
    onSuccess: () => {
      toast({ title: "تم حفظ اللقطة للمساعد" });
      setSnapshotNotes("");
      setSnapshotTags("");
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

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

  const aiQueryPresets: AiQueryPreset[] = useMemo(() => ([
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
  ]), []);

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
    if (aiAgentDataQueryMutation.data || aiAgentDataQueryMutation.isPending) return;
    runAiAgentDataQuery({ groupBy: "game" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        role: "admin",
        message: prompt,
        at: new Date().toISOString(),
      },
    ]);

    setAiAgentPrompt("");
    aiAgentChatMutation.mutate({
      message: prompt,
      contextMode: aiAgentContextMode,
    });
  };

  const currentRuntimeEnabled = aiAgentRuntime?.runtime?.enabled === true;
  const totalEvents = aiAgentReport?.external?.report?.learning?.totalEvents ?? 0;
  const trackedGames = aiAgentReport?.external?.report?.performance?.totalGames
    ?? aiAgentReport?.localFallback?.summary?.totalTrackedMoves
    ?? 0;
  const aiWinRate = aiAgentReport?.external?.report?.performance?.aiWinRate ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-8 sm:p-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-5 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.15),_transparent_32%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.92))]">
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit rounded-full border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
              SAM9
            </Badge>
            <div className="space-y-2">
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                <Bot className="h-8 w-8 text-primary" />
                SAM9 Control Center
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                قسم مركزي للتحكم الكامل في SAM9: تشغيل وإيقاف، تقارير، تحليل بيانات، ومحادثة مباشرة.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={STAT_CARD_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Runtime State</p>
                <div className="mt-3">
                  <Badge variant={currentRuntimeEnabled ? "default" : "destructive"} className="rounded-full px-3 py-1 text-xs">
                    {currentRuntimeEnabled ? "RUNNING" : "STOPPED"}
                  </Badge>
                </div>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Source</p>
                <p className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">{aiAgentReport?.source === "ai-service" ? "ai-service" : "fallback"}</p>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Total Events</p>
                <p className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">{totalEvents.toLocaleString("en-US")}</p>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">AI Win Rate</p>
                <p className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">{aiWinRate}%</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[340px]">
            <Button
              className={cn(BUTTON_3D_CLASS, "w-full gap-1.5")}
              onClick={() => {
                refetchAiAgentReport();
                refetchAiAgentCapabilities();
                refetchAiAgentDataSummary();
                refetchAiAgentRuntime();
                runAiAgentDataQuery();
              }}
            >
              <RefreshCw className={cn(
                "h-4 w-4",
                (aiAgentReportLoading || aiAgentCapabilitiesLoading || aiAgentDataSummaryLoading || aiAgentRuntimeLoading) && "animate-spin",
              )} />
              تحديث الكل
            </Button>
            <Button
              className={cn(BUTTON_3D_PRIMARY_CLASS, "w-full gap-1.5")}
              onClick={() => selfTuneMutation.mutate()}
              disabled={selfTuneMutation.isPending}
            >
              {selfTuneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Self Tune
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className={`${DATA_CARD_CLASS} xl:col-span-2`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Power className="h-5 w-5" />
              Runtime Control
            </CardTitle>
            <CardDescription>
              زر تشغيل/إيقاف SAM9 على مستوى الخدمة دون الحاجة لإعادة تشغيل الحاوية.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={STAT_CARD_CLASS}>
                <p className="text-xs text-muted-foreground mb-1">Runtime State</p>
                <Badge variant={currentRuntimeEnabled ? "default" : "destructive"}>
                  {currentRuntimeEnabled ? "RUNNING" : "STOPPED"}
                </Badge>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-xs text-muted-foreground mb-1">Health</p>
                <p className="text-sm font-semibold">{String(aiAgentRuntime?.healthStatus || "-")}</p>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-xs text-muted-foreground mb-1">Changed By</p>
                <p className="text-sm font-semibold break-all">{String(aiAgentRuntime?.runtime?.changedBy || "-")}</p>
              </div>
              <div className={STAT_CARD_CLASS}>
                <p className="text-xs text-muted-foreground mb-1">Changed At</p>
                <p className="text-sm font-semibold">
                  {aiAgentRuntime?.runtime?.changedAt
                    ? new Date(aiAgentRuntime.runtime.changedAt).toLocaleString("ar-EG")
                    : "-"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div className="lg:col-span-3">
                <Label htmlFor="runtime-reason" className="text-xs text-muted-foreground">سبب التغيير (اختياري)</Label>
                <Input
                  id="runtime-reason"
                  value={runtimeReason}
                  onChange={(e) => setRuntimeReason(e.target.value)}
                  placeholder="مثال: إيقاف مؤقت للصيانة"
                  className={`${INPUT_SURFACE_CLASS} mt-1`}
                />
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end items-end">
                <Button
                  className={cn(BUTTON_3D_PRIMARY_CLASS, "gap-1.5")}
                  disabled={runtimeMutation.isPending || currentRuntimeEnabled}
                  onClick={() => runtimeMutation.mutate(true)}
                >
                  {runtimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  تشغيل
                </Button>
                <Button
                  className={cn(BUTTON_3D_DESTRUCTIVE_CLASS, "gap-1.5")}
                  disabled={runtimeMutation.isPending || !currentRuntimeEnabled}
                  onClick={() => runtimeMutation.mutate(false)}
                >
                  {runtimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  إيقاف
                </Button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
              last reason: {aiAgentRuntime?.runtime?.reason ? String(aiAgentRuntime.runtime.reason) : "-"}
            </div>
          </CardContent>
        </Card>

        <Card className={DATA_CARD_CLASS}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Quick Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={STAT_CARD_CLASS}>
              <p className="text-xs text-muted-foreground mb-1">Source</p>
              <Badge variant={aiAgentReport?.source === "ai-service" ? "default" : "secondary"}>
                {aiAgentReport?.source === "ai-service" ? "ai-service" : "fallback"}
              </Badge>
            </div>
            <div className={STAT_CARD_CLASS}>
              <p className="text-xs text-muted-foreground mb-1">Total Events</p>
              <p className="text-lg font-semibold">{totalEvents}</p>
            </div>
            <div className={STAT_CARD_CLASS}>
              <p className="text-xs text-muted-foreground mb-1">Tracked Games</p>
              <p className="text-lg font-semibold">{trackedGames}</p>
            </div>
            <div className={STAT_CARD_CLASS}>
              <p className="text-xs text-muted-foreground mb-1">AI Win Rate</p>
              <p className="text-lg font-semibold">{aiWinRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-muted-foreground mb-1">agentName</p>
                <p className="font-medium">{String(aiAgentCapabilities?.capabilities?.agentName || "-")}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-muted-foreground mb-1">privacyMode</p>
                <p className="font-medium">{String(aiAgentCapabilities?.capabilities?.privacyMode || "-")}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-muted-foreground mb-1">autonomousLearning</p>
                <p className="font-medium">{aiAgentCapabilities?.capabilities?.autonomousLearning?.enabled ? "true" : "false"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-muted-foreground mb-1">runtimeControl</p>
                <p className="font-medium">{aiAgentCapabilities?.capabilities?.runtimeControl?.enabled ? "true" : "false"}</p>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 space-y-2 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs text-muted-foreground">autonomousLearning.methods</p>
              <div className="flex flex-wrap gap-1.5">
                {capabilityMethods.length > 0 ? capabilityMethods.map((method) => (
                  <Badge key={method} variant="outline" className="text-[10px] font-normal">{method}</Badge>
                )) : <span className="text-xs text-muted-foreground">-</span>}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-muted-foreground space-y-1 dark:border-slate-800 dark:bg-slate-900/60">
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
                <div key={key} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-muted-foreground mb-1 truncate">{key}</p>
                  <p className="font-medium break-all">{formatAiDataCell(value)}</p>
                </div>
              ))}
            </div>

            <ScrollArea className="h-[130px] rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
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

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-muted-foreground space-y-1 dark:border-slate-800 dark:bg-slate-900/60">
              <p>source: {aiAgentDataSummary?.source || "-"}</p>
              <p>generatedAt: {aiAgentDataSummary?.generatedAt ? new Date(aiAgentDataSummary.generatedAt).toLocaleString("ar-EG") : "-"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={DATA_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Query
          </CardTitle>
          <CardDescription>
            Query endpoint: /api/admin/ai-agent/data-query
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {aiQueryPresets.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                className={cn(aiActivePreset === preset.key ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "h-9 shrink-0 text-xs")}
                onClick={() => applyAiQueryPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              className={cn(BUTTON_3D_CLASS, "h-9 shrink-0 text-xs")}
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

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
            <div className="grid grid-cols-3 gap-1 xl:col-span-2">
              {(["game", "day", "difficulty"] as const).map((groupBy) => (
                <Button
                  key={groupBy}
                  type="button"
                  className={cn(aiDataQueryGroupBy === groupBy ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "h-10 text-xs")}
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
              className={`${INPUT_SURFACE_CLASS} h-10 text-xs`}
            />
            <Input
              value={aiDataQueryFrom}
              onChange={(e) => {
                setAiActivePreset("custom");
                setAiDataQueryFrom(e.target.value);
              }}
              type="date"
              className={`${INPUT_SURFACE_CLASS} h-10 text-xs`}
            />
            <Input
              value={aiDataQueryTo}
              onChange={(e) => {
                setAiActivePreset("custom");
                setAiDataQueryTo(e.target.value);
              }}
              type="date"
              className={`${INPUT_SURFACE_CLASS} h-10 text-xs`}
            />
            <Button
              type="button"
              onClick={() => runAiAgentDataQuery()}
              disabled={aiAgentDataQueryMutation.isPending}
              className={cn(BUTTON_3D_PRIMARY_CLASS, "h-10 gap-1.5 text-xs")}
            >
              {aiAgentDataQueryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {t("common.search")}
            </Button>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 text-xs text-muted-foreground space-y-1 dark:border-slate-800 dark:bg-slate-900/60">
            <p>source: {aiAgentDataQueryMutation.data?.source || "-"}</p>
            <p>generatedAt: {aiAgentDataQueryMutation.data?.generatedAt ? new Date(aiAgentDataQueryMutation.data.generatedAt).toLocaleString("ar-EG") : "-"}</p>
            <p>query: {JSON.stringify(aiAgentDataQueryMutation.data?.query || { groupBy: aiDataQueryGroupBy, metric: "results" })}</p>
            <p>rows: {aiDataQueryRows.length}</p>
          </div>

          {!aiAgentDataQueryMutation.isPending && aiDataQueryRows.length > 0 && (
            <div className="space-y-3 md:hidden">
              {aiDataQueryRows.slice(0, 20).map((row, index) => (
                <div key={`${index}-${JSON.stringify(row).slice(0, 32)}`} className={STAT_CARD_CLASS}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">#{index + 1}</span>
                    <Badge variant="outline" className="text-[10px]">{aiDataQueryGroupBy}</Badge>
                  </div>
                  <div className="grid gap-2 text-xs">
                    {aiDataQueryColumns.map((column) => (
                      <div key={column} className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800/80">
                        <span className="text-muted-foreground">{AI_QUERY_COLUMN_LABELS[column] || column}</span>
                        <span className="text-right font-medium text-slate-900 dark:text-slate-100">{formatAiDataCell(row?.[column])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <ScrollArea className="hidden h-[280px] rounded-[24px] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60 md:block">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className={DATA_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              تواصل مباشر مع SAM9
            </CardTitle>
            <CardDescription>
              قناة محادثة إدارية لتحليل الأداء والمخاطر والتوصيات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] text-muted-foreground mb-2">Context Mode</p>
              <div className="flex flex-wrap gap-1.5">
                {AI_CHAT_CONTEXT_MODES.map((mode) => (
                  <Button
                    key={mode.value}
                    type="button"
                    className={cn(aiAgentContextMode === mode.value ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS, "h-8 text-[10px]")}
                    onClick={() => setAiAgentContextMode(mode.value)}
                  >
                    {mode.label}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[320px] rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="space-y-2">
                {aiAgentConversation.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    لا توجد محادثات بعد. ابدأ برسالة مثل: اعطني ملخص أداء البوت اليوم.
                  </p>
                )}
                {aiAgentConversation.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "max-w-[90%] rounded-[22px] px-3 py-2 text-sm shadow-sm",
                      item.role === "admin"
                        ? "ms-auto bg-primary text-primary-foreground"
                        : "me-auto bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{item.message}</p>
                    {item.role === "agent" && (item.intent || (item.actions && item.actions.length > 0)) && (
                      <p className="mt-1 text-[10px] opacity-80 break-all">
                        intent={item.intent || "-"}
                        {typeof item.intentConfidence === "number" ? ` (${item.intentConfidence.toFixed(2)})` : ""}
                        {Array.isArray(item.actions) && item.actions.length > 0 ? ` | actions=${item.actions.join(",")}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] opacity-70">{new Date(item.at).toLocaleTimeString("ar-EG")}</p>
                  </div>
                ))}
                {aiAgentChatMutation.isPending && (
                  <div className="me-auto inline-flex items-center gap-2 rounded-[20px] bg-muted px-3 py-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري توليد الرد...
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                value={aiAgentPrompt}
                onChange={(e) => setAiAgentPrompt(e.target.value)}
                placeholder="اسأل عن تقارير AI أو مشاكل اللعب المنفرد..."
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
                إرسال
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={DATA_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Project Snapshot Control
            </CardTitle>
            <CardDescription>
              إرسال لقطة حالة للمساعد حتى يحلل التغييرات الحالية في المشروع.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="snapshot-notes">Notes</Label>
              <Textarea
                id="snapshot-notes"
                value={snapshotNotes}
                onChange={(e) => setSnapshotNotes(e.target.value)}
                placeholder="اكتب الحالة الحالية أو مشاكل الإنتاج..."
                rows={7}
                className={TEXTAREA_SURFACE_CLASS}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="snapshot-tags">Tags (comma separated)</Label>
              <Input
                id="snapshot-tags"
                value={snapshotTags}
                onChange={(e) => setSnapshotTags(e.target.value)}
                placeholder="sam9,production,incident"
                className={INPUT_SURFACE_CLASS}
              />
            </div>

            <Separator />

            <Button
              className={cn(BUTTON_3D_PRIMARY_CLASS, "w-full gap-1.5")}
              onClick={() => {
                const notes = snapshotNotes.trim();
                const tags = snapshotTags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .slice(0, 20);

                if (!notes && tags.length === 0) {
                  toast({
                    title: "البيانات فارغة",
                    description: "أدخل ملاحظات أو وسوم قبل الإرسال.",
                    variant: "destructive",
                  });
                  return;
                }

                projectSnapshotMutation.mutate({ notes, tags });
              }}
              disabled={projectSnapshotMutation.isPending}
            >
              {projectSnapshotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال Snapshot
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
