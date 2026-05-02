import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    Activity,
    ArrowRightLeft,
    BarChart3,
    CheckCircle2,
    Cpu,
    Database,
    ExternalLink,
    Gauge,
    Globe,
    Link2,
    Loader2,
    Mic,
    RefreshCw,
    Save,
    Settings2,
    Shield,
    Sparkles,
    Video,
    Wifi,
    Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { RealtimeExternalProviderType, RealtimeMode, RealtimeQualityPreset, RealtimeFeature, RealtimeProviderConfig, RealtimeMonitoringSnapshot } from "@shared/realtime";

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
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
    }

    return res.json();
}

const MODE_OPTIONS: Array<{ value: RealtimeMode; label: string; description: string }> = [
    { value: "self", label: "Self-hosted", description: "WebRTC + Socket.IO signaling" },
    { value: "external", label: "External", description: "Agora / 100ms token-based routing" },
    { value: "auto", label: "Auto", description: "Smart switch based on TURN load" },
];

const PROVIDER_OPTIONS: Array<{ value: RealtimeExternalProviderType; label: string }> = [
    { value: "agora", label: "Agora" },
    { value: "100ms", label: "100ms" },
];

const QUALITY_OPTIONS: Array<{ value: RealtimeQualityPreset; label: string }> = [
    { value: "low", label: "Low" },
    { value: "balanced", label: "Balanced" },
    { value: "high", label: "High" },
    { value: "ultra", label: "Ultra" },
];

const FEATURE_LABELS: Record<RealtimeFeature, { en: string; ar: string }> = {
    textChat: { en: "Text chat", ar: "الدردشة النصية" },
    voiceCalls: { en: "Voice calls", ar: "المكالمات الصوتية" },
    videoCalls: { en: "Video calls", ar: "مكالمات الفيديو" },
};

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-11 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";

type RealtimeAdminResponse = {
    config: RealtimeProviderConfig;
    monitoring: RealtimeMonitoringSnapshot;
    selection: { mode: RealtimeMode; turnLoadHigh: boolean };
    providers: {
        selfHosted: { available: boolean };
        external: { available: boolean; type: RealtimeExternalProviderType; region: string };
    };
};

function MetricCard({
    title,
    value,
    icon: Icon,
    subtext,
}: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    subtext?: string;
}) {
    return (
        <Card className={STAT_CARD_CLASS}>
            <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
                    <p className="mt-1 text-2xl font-bold truncate">{value}</p>
                    {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function AdminRealtimePage() {
    const { toast } = useToast();
    const { language } = useI18n();
    const isArabic = language === "ar";

    const [draft, setDraft] = useState<RealtimeProviderConfig | null>(null);

    const { data, isLoading, refetch } = useQuery<RealtimeAdminResponse>({
        queryKey: ["/api/admin/realtime"],
        queryFn: () => adminFetch("/api/admin/realtime"),
    });

    const config = draft ?? data?.config ?? null;
    const monitoring = data?.monitoring ?? null;

    const saveMutation = useMutation({
        mutationFn: (payload: RealtimeProviderConfig) =>
            adminFetch("/api/admin/realtime", {
                method: "PUT",
                body: JSON.stringify(payload),
            }),
        onSuccess: (updated: RealtimeProviderConfig) => {
            setDraft(null);
            queryClient.setQueryData(["/api/admin/realtime"], (current: RealtimeAdminResponse | undefined) => {
                if (!current) return current;
                return { ...current, config: updated };
            });
            toast({
                title: isArabic ? "تم حفظ إعدادات الوقت الحقيقي" : "Realtime settings saved",
            });
        },
        onError: (error: Error) => {
            toast({
                title: isArabic ? "فشل حفظ الإعدادات" : "Failed to save settings",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const updateConfig = <K extends keyof RealtimeProviderConfig>(key: K, value: RealtimeProviderConfig[K]) => {
        if (!config) return;
        setDraft({ ...config, [key]: value });
    };

    const updateExternal = (patch: Partial<RealtimeProviderConfig["external"]>) => {
        if (!config) return;
        setDraft({
            ...config,
            external: { ...config.external, ...patch },
        });
    };

    const updatePerformance = (patch: Partial<RealtimeProviderConfig["performance"]>) => {
        if (!config) return;
        setDraft({
            ...config,
            performance: { ...config.performance, ...patch },
        });
    };

    const updateFeature = (feature: RealtimeFeature, enabled: boolean) => {
        if (!config) return;
        setDraft({
            ...config,
            features: {
                ...config.features,
                [feature]: enabled,
            },
        });
    };

    const hasChanges = useMemo(() => {
        if (!data || !config) return false;
        return JSON.stringify(config) !== JSON.stringify(data.config);
    }, [config, data]);

    if (isLoading || !config) {
        return (
            <div className="space-y-5 p-3 sm:p-4 md:p-6">
                <div className={`${SURFACE_CARD_CLASS} p-6`}>
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="mt-3 h-5 w-96 max-w-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={STAT_CARD_CLASS}>
                            <Skeleton className="h-24 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const selectedMode = config.mode;
    const turnLoadHigh = data?.selection.turnLoadHigh ?? false;
    const selectedProvider = data?.providers.external.type ?? config.external.providerType;

    return (
        <div className="space-y-5 p-3 sm:p-4 md:p-6">
            <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
                            <Zap className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                {isArabic ? "إدارة الوقت الحقيقي" : "Realtime Communication"}
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                                {isArabic
                                    ? "بدّل بين المزودين، واضبط الصوت والفيديو، وراقب الضغط على TURN مباشرة من لوحة الأدمن."
                                    : "Switch providers, tune voice/video, and watch TURN pressure from the admin panel."}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button className={BUTTON_3D_CLASS} onClick={() => refetch()} data-testid="button-refresh-realtime">
                            <RefreshCw className="me-2 h-4 w-4" />
                            {isArabic ? "تحديث" : "Refresh"}
                        </Button>
                        <Button
                            className={BUTTON_3D_PRIMARY_CLASS}
                            onClick={() => saveMutation.mutate(config)}
                            disabled={!hasChanges || saveMutation.isPending}
                            data-testid="button-save-realtime"
                        >
                            {saveMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                            {isArabic ? "حفظ" : "Save"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title={isArabic ? "الغرف النشطة" : "Active Rooms"}
                    value={monitoring?.activeRooms ?? 0}
                    icon={Database}
                />
                <MetricCard
                    title={isArabic ? "المستخدمون النشطون" : "Active Users"}
                    value={monitoring?.activeUsers ?? 0}
                    icon={UsersIcon}
                />
                <MetricCard
                    title={isArabic ? "فشل الاتصالات" : "Failed Connections"}
                    value={monitoring?.failedConnections ?? 0}
                    icon={Shield}
                />
                <MetricCard
                    title={isArabic ? "TURN Mbps" : "TURN Mbps"}
                    value={(monitoring?.turnBandwidthUsageMbps ?? 0).toFixed(1)}
                    icon={Gauge}
                    subtext={turnLoadHigh ? (isArabic ? "الحمل مرتفع" : "High load") : (isArabic ? "الحمل طبيعي" : "Normal load")}
                />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
                <Card className={`${SURFACE_CARD_CLASS} xl:col-span-2`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowRightLeft className="h-5 w-5" />
                            {isArabic ? "وضع المزود" : "Provider Mode"}
                        </CardTitle>
                        <CardDescription>
                            {isArabic
                                ? "اختر بين التشغيل الذاتي، مزود خارجي، أو التبديل الذكي."
                                : "Choose self-hosted, external, or smart auto-switching."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            {MODE_OPTIONS.map((option) => {
                                const active = selectedMode === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => updateConfig("mode", option.value)}
                                        className={`rounded-[24px] border p-4 text-start transition-all ${active ? "border-sky-400 bg-sky-50 shadow-sm dark:border-sky-700 dark:bg-sky-950/40" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70"}`}
                                        data-testid={`button-mode-${option.value}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-semibold">{option.label}</div>
                                            {active && <CheckCircle2 className="h-4 w-4 text-sky-600" />}
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                                {isArabic ? "المزوّد المختار:" : "Selected provider:"} {selectedProvider}
                            </Badge>
                            <Badge variant={turnLoadHigh ? "destructive" : "secondary"}>
                                {turnLoadHigh ? (isArabic ? "تحميل TURN مرتفع" : "TURN high") : (isArabic ? "TURN طبيعي" : "TURN normal")}
                            </Badge>
                            <Badge variant="outline">
                                {isArabic ? "الوضع الحالي:" : "Current mode:"} {selectedMode}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className={SURFACE_CARD_CLASS}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            {isArabic ? "المراقبة" : "Monitoring"}
                        </CardTitle>
                        <CardDescription>
                            {isArabic ? "لقطات تشغيلية مباشرة" : "Live operational snapshot"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">{isArabic ? "استخدام TURN" : "TURN usage"}</span>
                            <span className="font-semibold">{(monitoring?.turnBandwidthUsageMbps ?? 0).toFixed(1)} Mbps</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">{isArabic ? "مزود التبديل التلقائي" : "Auto-switch threshold"}</span>
                            <span className="font-semibold">{config.performance.turnUsageThreshold}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">{isArabic ? "التحكم" : "Control"}</span>
                            <span className="font-semibold">{turnLoadHigh ? (isArabic ? "حوّل إلى خارجي" : "Switch external") : (isArabic ? "ابق على المحلي" : "Stay self-hosted")}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <Card className={SURFACE_CARD_CLASS}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5" />
                            {isArabic ? "إعدادات المزود الخارجي" : "External Provider Settings"}
                        </CardTitle>
                        <CardDescription>
                            {isArabic ? "بيانات التكامل الخارجية تُستخدم عند اختيار External أو Auto." : "External credentials are used when External or Auto is selected."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{isArabic ? "نوع المزود" : "Provider type"}</Label>
                                <Select value={config.external.providerType} onValueChange={(value) => updateExternal({ providerType: value as RealtimeExternalProviderType })}>
                                    <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-external-provider-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDER_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{isArabic ? "المنطقة" : "Region"}</Label>
                                <Input
                                    className={INPUT_SURFACE_CLASS}
                                    value={config.external.region}
                                    onChange={(e) => updateExternal({ region: e.target.value })}
                                    data-testid="input-external-region"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{isArabic ? "API Key" : "API Key"}</Label>
                            <Input
                                className={INPUT_SURFACE_CLASS}
                                value={config.external.apiKey}
                                onChange={(e) => updateExternal({ apiKey: e.target.value })}
                                data-testid="input-external-api-key"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>{isArabic ? "API Secret" : "API Secret"}</Label>
                            <Input
                                className={INPUT_SURFACE_CLASS}
                                type="password"
                                value={config.external.apiSecret}
                                onChange={(e) => updateExternal({ apiSecret: e.target.value })}
                                data-testid="input-external-api-secret"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ExternalLink className="h-3.5 w-3.5" />
                            {isArabic ? "المفاتيح تُخزن في قاعدة البيانات وتُحدث فورياً." : "Keys are stored in the database and updated immediately."}
                        </div>
                    </CardContent>
                </Card>

                <Card className={SURFACE_CARD_CLASS}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings2 className="h-5 w-5" />
                            {isArabic ? "الميزات والتشغيل" : "Features and Performance"}
                        </CardTitle>
                        <CardDescription>
                            {isArabic ? "فعّل أو عطّل chat/voice/video واضبط سعة الغرف والجودة." : "Enable chat/voice/video and tune capacity plus quality."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-3">
                            {(["textChat", "voiceCalls", "videoCalls"] as RealtimeFeature[]).map((feature) => (
                                <div key={feature} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                                    <div>
                                        <p className="font-medium text-sm">{isArabic ? FEATURE_LABELS[feature].ar : FEATURE_LABELS[feature].en}</p>
                                    </div>
                                    <Switch checked={config.features[feature]} onCheckedChange={(value) => updateFeature(feature, value)} data-testid={`switch-feature-${feature}`} />
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label>{isArabic ? "أقصى عدد في الغرفة" : "Max participants"}</Label>
                                <Input
                                    type="number"
                                    className={INPUT_SURFACE_CLASS}
                                    value={config.performance.maxParticipantsPerRoom}
                                    onChange={(e) => updatePerformance({ maxParticipantsPerRoom: Number(e.target.value) || 2 })}
                                    data-testid="input-max-participants"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{isArabic ? "جودة البث" : "Quality preset"}</Label>
                                <Select
                                    value={config.performance.bitratePreset}
                                    onValueChange={(value) => updatePerformance({ bitratePreset: value as RealtimeQualityPreset })}
                                >
                                    <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-bitrate-preset">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {QUALITY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{isArabic ? "عتبة TURN" : "TURN threshold"}</Label>
                                <Input
                                    type="number"
                                    className={INPUT_SURFACE_CLASS}
                                    value={config.performance.turnUsageThreshold}
                                    onChange={(e) => updatePerformance({ turnUsageThreshold: Number(e.target.value) || 0 })}
                                    data-testid="input-turn-threshold"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className={SURFACE_CARD_CLASS}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mic className="h-5 w-5" />
                        {isArabic ? "إشارات التشغيل السريع" : "Runtime Signals"}
                    </CardTitle>
                    <CardDescription>
                        {isArabic ? "لقطات تساعد على التبديل الفوري دون إعادة نشر." : "Signals that drive instant switching without redeploying."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs text-muted-foreground">{isArabic ? "المزوّد الخارجي" : "External provider"}</p>
                        <p className="mt-1 font-semibold">{selectedProvider}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs text-muted-foreground">{isArabic ? "TURN threshold" : "TURN threshold"}</p>
                        <p className="mt-1 font-semibold">{config.performance.turnUsageThreshold}%</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs text-muted-foreground">{isArabic ? "الحالة الحالية" : "Current selection"}</p>
                        <p className="mt-1 font-semibold">{turnLoadHigh ? (isArabic ? "External" : "External") : (isArabic ? "Self-hosted" : "Self-hosted")}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs text-muted-foreground">{isArabic ? "آخر تحديث" : "Last refresh"}</p>
                        <p className="mt-1 font-semibold">{data?.selection.mode ?? config.mode}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function UsersIcon({ className }: { className?: string }) {
    return <Database className={className} />;
}
