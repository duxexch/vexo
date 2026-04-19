import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import {
  Shield,
  AlertTriangle,
  Eye,
  Ban,
  Clock,
  TrendingUp,
  Zap,
  Copy,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function AdminAntiCheatPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [activityTypeFilter, setActivityTypeFilter] = useState<"all" | "gift_sent" | "gift_received" | "platform_fee">("all");
  const [selectedActivity, setSelectedActivity] = useState<{
    user_id: string;
    type: string;
    amount: string;
    reference_id?: string;
    created_at: string;
  } | null>(null);

  const { data: analytics } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => adminFetch("/api/admin/analytics"),
  });
  void analytics;

  const { data: giftIntegrity } = useQuery({
    queryKey: ["/api/admin/project-currency/gifts/integrity", 24],
    queryFn: () => adminFetch("/api/admin/project-currency/gifts/integrity?windowHours=24"),
    refetchInterval: 30_000,
  });

  const { data: giftAntiCheat } = useQuery({
    queryKey: ["/api/admin/project-currency/gifts/anti-cheat", 24],
    queryFn: () => adminFetch("/api/admin/project-currency/gifts/anti-cheat?windowHours=24"),
    refetchInterval: 30_000,
  });

  const suspiciousPatterns = [
    {
      id: "gift-velocity-burst",
      type: t("admin.antiCheat.pattern.giftVelocityBurst.title"),
      description: t("admin.antiCheat.pattern.giftVelocityBurst.description"),
      severity: (giftAntiCheat?.metrics?.highVelocitySenderCount || 0) > 0 ? "high" : "low",
      count: Number(giftAntiCheat?.metrics?.highVelocitySenderCount || 0),
      icon: Zap,
    },
    {
      id: "high-value-gift-burst",
      type: t("admin.antiCheat.pattern.highValueGiftBurst.title"),
      description: t("admin.antiCheat.pattern.highValueGiftBurst.description"),
      severity: (giftAntiCheat?.metrics?.highValueSenderCount || 0) > 0 ? "medium" : "low",
      count: Number(giftAntiCheat?.metrics?.highValueSenderCount || 0),
      icon: TrendingUp,
    },
    {
      id: "reference-replay-signal",
      type: t("admin.antiCheat.pattern.referenceReplaySignal.title"),
      description: t("admin.antiCheat.pattern.referenceReplaySignal.description"),
      severity: (giftAntiCheat?.metrics?.duplicateReferenceCount || 0) > 0 ? "high" : "low",
      count: Number(giftAntiCheat?.metrics?.duplicateReferenceCount || 0),
      icon: Shield,
    },
    {
      id: "ledger-orphan-credits",
      type: t("admin.antiCheat.pattern.ledgerOrphanCredits.title"),
      description: t("admin.antiCheat.pattern.ledgerOrphanCredits.description"),
      severity: (giftIntegrity?.orphanReceivedCount || 0) > 0 ? "high" : "low",
      count: Number(giftIntegrity?.orphanReceivedCount || 0),
      icon: AlertTriangle,
    },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "default";
    }
  };

  const recentEvents = (giftAntiCheat?.recentLargeGiftEvents || []) as Array<{
    user_id: string;
    type: string;
    amount: string;
    reference_id?: string;
    created_at: string;
  }>;

  const filteredEvents = activityTypeFilter === "all"
    ? recentEvents
    : recentEvents.filter((event) => event.type === activityTypeFilter);

  const handleReviewPattern = (patternId: string) => {
    const nextFilter = patternId === "ledger-orphan-credits"
      ? "gift_received"
      : (patternId === "gift-velocity-burst" || patternId === "high-value-gift-burst" || patternId === "reference-replay-signal")
        ? "gift_sent"
        : "all";

    setActivityTypeFilter(nextFilter as "all" | "gift_sent" | "gift_received" | "platform_fee");
    toast({
      title: t("admin.antiCheat.toast.reviewFilterUpdated"),
      description: t("admin.antiCheat.toast.showingEvents", {
        type: nextFilter === "all" ? t("admin.antiCheat.filter.all") : t(`admin.antiCheat.filter.${nextFilter}`),
      }),
    });
  };

  const copyReference = async (referenceId?: string) => {
    if (!referenceId) return;
    try {
      await navigator.clipboard.writeText(referenceId);
      toast({ title: t("admin.antiCheat.toast.referenceCopied"), description: t("admin.antiCheat.toast.referenceCopiedDescription") });
    } catch {
      toast({ title: t("admin.antiCheat.toast.copyFailed"), description: t("admin.antiCheat.toast.copyFailedDescription"), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("admin.antiCheat.heading")}</h1>
        <p className="text-muted-foreground">{t("admin.antiCheat.subheading")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.antiCheat.stat.flaggedUsers")}</p>
                <p className="text-2xl font-bold">{giftAntiCheat?.metrics?.highVelocitySenderCount || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.antiCheat.stat.underReview")}</p>
                <p className="text-2xl font-bold">{giftAntiCheat?.metrics?.duplicateReferenceCount || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-500/10">
                <Eye className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.antiCheat.stat.bannedToday")}</p>
                <p className="text-2xl font-bold">{giftIntegrity?.hasAnomaly ? 1 : 0}</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <Ban className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.antiCheat.stat.pendingActions")}</p>
                <p className="text-2xl font-bold">{giftAntiCheat?.riskScore || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.antiCheat.detectedPatterns.title")}</CardTitle>
          <CardDescription>
            {t("admin.antiCheat.detectedPatterns.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suspiciousPatterns.map((pattern) => (
              <div
                key={pattern.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${pattern.severity === 'high' ? 'bg-red-500/10' :
                    pattern.severity === 'medium' ? 'bg-yellow-500/10' :
                      'bg-blue-500/10'
                    }`}>
                    <pattern.icon className={`h-5 w-5 ${pattern.severity === 'high' ? 'text-red-500' :
                      pattern.severity === 'medium' ? 'text-yellow-500' :
                        'text-blue-500'
                      }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{pattern.type}</h4>
                      <Badge variant={getSeverityColor(pattern.severity)}>
                        {t(`admin.antiCheat.severity.${pattern.severity}`)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="text-lg font-bold">{pattern.count}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[40px]"
                    onClick={() => handleReviewPattern(pattern.id)}
                    data-testid={`button-review-${pattern.id}`}
                  >
                    {t("admin.antiCheat.review")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.antiCheat.recentFlaggedActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredEvents.slice(0, 8).map((activity: { user_id: string; type: string; amount: string; reference_id?: string; created_at: string }, index: number) => (
              <div
                key={index}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={getSeverityColor(activity.type === "gift_sent" ? "high" : "medium")}>
                    {activity.type}
                  </Badge>
                  <div>
                    <span className="font-medium">{activity.user_id}</span>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.antiCheat.amount")}: ${Number(activity.amount || 0).toFixed(2)}
                      {activity.reference_id ? ` | ${t("admin.antiCheat.reference")}: ${activity.reference_id.slice(0, 36)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{new Date(activity.created_at).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px]" onClick={() => setSelectedActivity(activity)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <div className="p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
                {t("admin.antiCheat.noRecentFlagged")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.antiCheat.flaggedEventDetails.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.antiCheat.flaggedEventDetails.description")}
            </DialogDescription>
          </DialogHeader>

          {selectedActivity && (
            <div className="space-y-3 text-sm">
              <div><span className="font-semibold">{t("admin.antiCheat.user")}:</span> {selectedActivity.user_id}</div>
              <div><span className="font-semibold">{t("admin.antiCheat.type")}:</span> {selectedActivity.type}</div>
              <div><span className="font-semibold">{t("admin.antiCheat.amount")}:</span> ${Number(selectedActivity.amount || 0).toFixed(2)}</div>
              <div><span className="font-semibold">{t("admin.antiCheat.time")}:</span> {new Date(selectedActivity.created_at).toLocaleString()}</div>
              <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="truncate text-muted-foreground">
                  {selectedActivity.reference_id || t("admin.antiCheat.noReferenceAttached")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!selectedActivity.reference_id}
                  onClick={() => copyReference(selectedActivity.reference_id)}
                >
                  <Copy className="h-4 w-4 me-1" />
                  {t("admin.antiCheat.copy")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
