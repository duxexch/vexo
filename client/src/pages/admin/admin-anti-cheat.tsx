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

export default function AdminAntiCheatPage() {
  const { toast } = useToast();
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
      type: "Gift Velocity Burst",
      description: "Accounts sending gifts at unusually high frequency",
      severity: (giftAntiCheat?.metrics?.highVelocitySenderCount || 0) > 0 ? "high" : "low",
      count: Number(giftAntiCheat?.metrics?.highVelocitySenderCount || 0),
      icon: Zap,
    },
    {
      type: "High-Value Gift Burst",
      description: "Abnormal gift value bursts in a short monitoring window",
      severity: (giftAntiCheat?.metrics?.highValueSenderCount || 0) > 0 ? "medium" : "low",
      count: Number(giftAntiCheat?.metrics?.highValueSenderCount || 0),
      icon: TrendingUp,
    },
    {
      type: "Reference Replay Signal",
      description: "Repeated idempotency/reference signatures detected",
      severity: (giftAntiCheat?.metrics?.duplicateReferenceCount || 0) > 0 ? "high" : "low",
      count: Number(giftAntiCheat?.metrics?.duplicateReferenceCount || 0),
      icon: Shield,
    },
    {
      type: "Ledger Orphan Credits",
      description: "Gift credits without matching source send transaction",
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

  const handleReviewPattern = (patternType: string) => {
    const normalized = patternType.toLowerCase();
    const nextFilter = normalized.includes("burst") || normalized.includes("replay")
      ? "gift_sent"
      : normalized.includes("orphan")
        ? "gift_received"
        : "all";

    setActivityTypeFilter(nextFilter as "all" | "gift_sent" | "gift_received" | "platform_fee");
    toast({
      title: "Review filter updated",
      description: `Showing ${nextFilter === "all" ? "all" : nextFilter} events for investigation.`,
    });
  };

  const copyReference = async (referenceId?: string) => {
    if (!referenceId) return;
    try {
      await navigator.clipboard.writeText(referenceId);
      toast({ title: "Reference copied", description: "Transaction reference copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Unable to copy reference ID.", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Anti-Cheat System</h1>
        <p className="text-muted-foreground">Monitor and prevent fraudulent activity</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flagged Users</p>
                <p className="text-2xl font-bold">{giftAntiCheat?.metrics?.highVelocitySenderCount || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold">{giftAntiCheat?.metrics?.duplicateReferenceCount || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-500/10">
                <Eye className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Banned Today</p>
                <p className="text-2xl font-bold">{giftIntegrity?.hasAnomaly ? 1 : 0}</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <Ban className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Actions</p>
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
          <CardTitle>Detected Suspicious Patterns</CardTitle>
          <CardDescription>
            Automated detection of potential cheating behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suspiciousPatterns.map((pattern) => (
              <div
                key={pattern.type}
                className="flex items-center justify-between p-4 rounded-lg border"
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
                        {pattern.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold">{pattern.count}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReviewPattern(pattern.type)}
                    data-testid={`button-review-${pattern.type.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Flagged Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredEvents.slice(0, 8).map((activity: { user_id: string; type: string; amount: string; reference_id?: string; created_at: string }, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={getSeverityColor(activity.type === "gift_sent" ? "high" : "medium")}>
                    {activity.type}
                  </Badge>
                  <div>
                    <span className="font-medium">{activity.user_id}</span>
                    <p className="text-sm text-muted-foreground">
                      Amount: ${Number(activity.amount || 0).toFixed(2)}
                      {activity.reference_id ? ` | Ref: ${activity.reference_id.slice(0, 36)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{new Date(activity.created_at).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedActivity(activity)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <div className="p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
                No recent flagged gift events in the active monitoring window.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flagged Event Details</DialogTitle>
            <DialogDescription>
              Inspect selected anti-cheat event and copy the reference for deeper trace lookup.
            </DialogDescription>
          </DialogHeader>

          {selectedActivity && (
            <div className="space-y-3 text-sm">
              <div><span className="font-semibold">User:</span> {selectedActivity.user_id}</div>
              <div><span className="font-semibold">Type:</span> {selectedActivity.type}</div>
              <div><span className="font-semibold">Amount:</span> ${Number(selectedActivity.amount || 0).toFixed(2)}</div>
              <div><span className="font-semibold">Time:</span> {new Date(selectedActivity.created_at).toLocaleString()}</div>
              <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="truncate text-muted-foreground">
                  {selectedActivity.reference_id || "No reference attached"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!selectedActivity.reference_id}
                  onClick={() => copyReference(selectedActivity.reference_id)}
                >
                  <Copy className="h-4 w-4 me-1" />
                  Copy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
