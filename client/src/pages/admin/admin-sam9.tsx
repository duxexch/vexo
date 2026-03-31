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
}

interface AiAgentChatPayload {
  source?: string;
  generatedAt?: string;
  reply?: string;
  summary?: Record<string, unknown> | null;
}

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
    mutationFn: (message: string) =>
      adminFetch("/api/admin/ai-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      }) as Promise<AiAgentChatPayload>,
    onSuccess: (data: AiAgentChatPayload) => {
      const reply = typeof data?.reply === "string" && data.reply.trim().length > 0
        ? data.reply
        : "تم استلام الرد بدون محتوى.";

      setAiAgentConversation((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "agent",
          message: reply,
          at: data?.generatedAt || new Date().toISOString(),
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
    aiAgentChatMutation.mutate(prompt);
  };

  const currentRuntimeEnabled = aiAgentRuntime?.runtime?.enabled === true;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            SAM9 Control Center
          </h1>
          <p className="text-muted-foreground mt-1">
            قسم مركزي للتحكم الكامل في SAM9: تشغيل وإيقاف، تقارير، تحليل بيانات، ومحادثة مباشرة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
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
            size="sm"
            className="gap-1.5"
            onClick={() => selfTuneMutation.mutate()}
            disabled={selfTuneMutation.isPending}
          >
            {selfTuneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            Self Tune
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Runtime State</p>
                <Badge variant={currentRuntimeEnabled ? "default" : "destructive"}>
                  {currentRuntimeEnabled ? "RUNNING" : "STOPPED"}
                </Badge>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Health</p>
                <p className="text-sm font-semibold">{String(aiAgentRuntime?.healthStatus || "-")}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Changed By</p>
                <p className="text-sm font-semibold break-all">{String(aiAgentRuntime?.runtime?.changedBy || "-")}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Changed At</p>
                <p className="text-sm font-semibold">
                  {aiAgentRuntime?.runtime?.changedAt
                    ? new Date(aiAgentRuntime.runtime.changedAt).toLocaleString("ar-EG")
                    : "-"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
              <div className="lg:col-span-3">
                <Label htmlFor="runtime-reason" className="text-xs text-muted-foreground">سبب التغيير (اختياري)</Label>
                <Input
                  id="runtime-reason"
                  value={runtimeReason}
                  onChange={(e) => setRuntimeReason(e.target.value)}
                  placeholder="مثال: إيقاف مؤقت للصيانة"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 lg:justify-end items-end">
                <Button
                  variant="default"
                  className="gap-1.5"
                  disabled={runtimeMutation.isPending || currentRuntimeEnabled}
                  onClick={() => runtimeMutation.mutate(true)}
                >
                  {runtimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  تشغيل
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  disabled={runtimeMutation.isPending || !currentRuntimeEnabled}
                  onClick={() => runtimeMutation.mutate(false)}
                >
                  {runtimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  إيقاف
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              last reason: {aiAgentRuntime?.runtime?.reason ? String(aiAgentRuntime.runtime.reason) : "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Quick Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-1">Source</p>
              <Badge variant={aiAgentReport?.source === "ai-service" ? "default" : "secondary"}>
                {aiAgentReport?.source === "ai-service" ? "ai-service" : "fallback"}
              </Badge>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-1">Total Events</p>
              <p className="text-lg font-semibold">{aiAgentReport?.external?.report?.learning?.totalEvents ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-1">Tracked Games</p>
              <p className="text-lg font-semibold">
                {aiAgentReport?.external?.report?.performance?.totalGames
                  ?? aiAgentReport?.localFallback?.summary?.totalTrackedMoves
                  ?? 0}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-1">AI Win Rate</p>
              <p className="text-lg font-semibold">{aiAgentReport?.external?.report?.performance?.aiWinRate ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
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
                <p className="text-muted-foreground mb-1">runtimeControl</p>
                <p className="font-medium">{aiAgentCapabilities?.capabilities?.runtimeControl?.enabled ? "true" : "false"}</p>
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

        <Card>
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
                  <p className="font-medium break-all">{formatAiDataCell(value)}</p>
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

      <Card>
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
          <div className="flex flex-wrap gap-2">
            {aiQueryPresets.map((preset) => (
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
              className="h-8 text-xs"
            />
            <Input
              value={aiDataQueryFrom}
              onChange={(e) => {
                setAiActivePreset("custom");
                setAiDataQueryFrom(e.target.value);
              }}
              type="date"
              className="h-8 text-xs"
            />
            <Input
              value={aiDataQueryTo}
              onChange={(e) => {
                setAiActivePreset("custom");
                setAiDataQueryTo(e.target.value);
              }}
              type="date"
              className="h-8 text-xs"
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

          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <p>source: {aiAgentDataQueryMutation.data?.source || "-"}</p>
            <p>generatedAt: {aiAgentDataQueryMutation.data?.generatedAt ? new Date(aiAgentDataQueryMutation.data.generatedAt).toLocaleString("ar-EG") : "-"}</p>
            <p>query: {JSON.stringify(aiAgentDataQueryMutation.data?.query || { groupBy: aiDataQueryGroupBy, metric: "results" })}</p>
            <p>rows: {aiDataQueryRows.length}</p>
          </div>

          <ScrollArea className="h-[280px] rounded-md border">
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
        <Card>
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
            <ScrollArea className="h-[320px] rounded-md border p-3">
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
                      "max-w-[90%] rounded-md px-3 py-2 text-sm",
                      item.role === "admin"
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAiAgentSend();
                  }
                }}
              />
              <Button onClick={handleAiAgentSend} disabled={aiAgentChatMutation.isPending || !aiAgentPrompt.trim()} className="gap-1.5">
                <Send className="h-4 w-4" />
                إرسال
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="snapshot-tags">Tags (comma separated)</Label>
              <Input
                id="snapshot-tags"
                value={snapshotTags}
                onChange={(e) => setSnapshotTags(e.target.value)}
                placeholder="sam9,production,incident"
              />
            </div>

            <Separator />

            <Button
              className="w-full gap-1.5"
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
