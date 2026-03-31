import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Gift,
  Tv,
  Users,
  TrendingUp,
  Activity,
  Save,
  RefreshCw,
  Clock,
  DollarSign,
  Calendar,
  Crown,
  Gamepad2,
  Settings,
  BarChart3,
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

async function adminPut(url: string, body: Record<string, unknown>) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

export default function AdminFreePlayPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");

  // Queries
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/free-play/settings"],
    queryFn: () => adminFetch("/api/admin/free-play/settings"),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/free-play/stats"],
    queryFn: () => adminFetch("/api/admin/free-play/stats"),
    refetchInterval: 30000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["/api/admin/free-play/activity"],
    queryFn: () => adminFetch("/api/admin/free-play/activity?limit=50"),
  });

  const { data: topReferrers } = useQuery({
    queryKey: ["/api/admin/free-play/top-referrers"],
    queryFn: () => adminFetch("/api/admin/free-play/top-referrers"),
  });

  // Local state for settings form
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const settingsInitialized = Object.keys(localSettings).length > 0;

  // Initialize local settings from fetched settings
  if (settings && !settingsInitialized) {
    const init: Record<string, string> = {};
    for (const [key, val] of Object.entries(settings)) {
      init[key] = (val as { value: string }).value;
    }
    setLocalSettings(init);
  }

  const updateSettingsMut = useMutation({
    mutationFn: (s: Record<string, string>) =>
      adminPut("/api/admin/free-play/settings", { settings: s }),
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Free play settings updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMut.mutate(localSettings);
  };

  const updateLocal = (key: string, value: string) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleLocal = (key: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: prev[key] === "true" ? "false" : "true",
    }));
  };

  const getSettingVal = (key: string, fallback = "0") => localSettings[key] ?? fallback;
  const isOn = (key: string) => getSettingVal(key, "true") === "true";

  const formatCurrency = (n: number | string) => {
    const num = typeof n === "string" ? parseFloat(n) : n;
    return `$${num.toFixed(2)}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-green-500" />
            Free Play Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control daily bonuses, ad rewards, referral system, and free play limits
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play"] });
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Calendar className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Bonus Today</p>
                  <p className="text-lg font-bold">{stats.dailyBonus.today.claims}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stats.dailyBonus.today.total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Tv className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ad Watches Today</p>
                  <p className="text-lg font-bold">{stats.adWatches.today.watches}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stats.adWatches.today.total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Users className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Referrals Today</p>
                  <p className="text-lg font-bold">{stats.referrals.today.count}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stats.referrals.today.total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <DollarSign className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">All-Time Distributed</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totals.allRewardsDistributed)}</p>
                  <p className="text-xs text-muted-foreground">{stats.totals.activeReferrers} active referrers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="settings" className="flex items-center gap-1">
            <Settings className="w-4 h-4" /> Settings
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-1">
            <BarChart3 className="w-4 h-4" /> Statistics
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <Activity className="w-4 h-4" /> Activity
          </TabsTrigger>
          <TabsTrigger value="referrers" className="flex items-center gap-1">
            <Crown className="w-4 h-4" /> Top Referrers
          </TabsTrigger>
        </TabsList>

        {/* ====== SETTINGS TAB ====== */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {settingsLoading ? (
            <div className="text-center text-muted-foreground py-10">Loading settings...</div>
          ) : (
            <>
              {/* Toggle Switches */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Feature Toggles</CardTitle>
                  <CardDescription>Enable or disable free play features</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Free Play System</Label>
                      <p className="text-xs text-muted-foreground">Master toggle for the entire free play section</p>
                    </div>
                    <Switch checked={isOn("free_play_enabled")} onCheckedChange={() => toggleLocal("free_play_enabled")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Daily Bonus</Label>
                      <p className="text-xs text-muted-foreground">Allow users to claim daily rewards</p>
                    </div>
                    <Switch checked={isOn("daily_bonus_enabled")} onCheckedChange={() => toggleLocal("daily_bonus_enabled")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Ad Rewards</Label>
                      <p className="text-xs text-muted-foreground">Allow users to earn by watching ads</p>
                    </div>
                    <Switch checked={isOn("ad_reward_enabled")} onCheckedChange={() => toggleLocal("ad_reward_enabled")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Referral Rewards</Label>
                      <p className="text-xs text-muted-foreground">Give rewards when referred users register</p>
                    </div>
                    <Switch checked={isOn("referral_reward_enabled")} onCheckedChange={() => toggleLocal("referral_reward_enabled")} />
                  </div>
                </CardContent>
              </Card>

              {/* Amount Settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Reward Amounts</CardTitle>
                  <CardDescription>Configure reward values and limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Ad Reward Amount ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={getSettingVal("ad_reward_amount", "0.10")}
                        onChange={(e) => updateLocal("ad_reward_amount", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Amount earned per ad watched</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Max Ads Per Day</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={getSettingVal("max_ads_per_day", "10")}
                        onChange={(e) => updateLocal("max_ads_per_day", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Maximum ad watches allowed per day</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Referral Reward ($)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        min="0"
                        value={getSettingVal("referral_reward_amount", "5.00")}
                        onChange={(e) => updateLocal("referral_reward_amount", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Amount given to referrer on new signup</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Free Play Daily Limit</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={getSettingVal("freePlayLimit", "50")}
                        onChange={(e) => updateLocal("freePlayLimit", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Max free games per user per day (0 = unlimited)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={updateSettingsMut.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {updateSettingsMut.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ====== STATISTICS TAB ====== */}
        <TabsContent value="stats" className="mt-4 space-y-4">
          {statsLoading ? (
            <div className="text-center text-muted-foreground py-10">Loading statistics...</div>
          ) : stats ? (
            <>
              {/* Daily Bonus Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-yellow-500" /> Daily Bonus Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-xl font-bold">{stats.dailyBonus.today.claims}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.dailyBonus.today.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">This Week</p>
                      <p className="text-xl font-bold">{stats.dailyBonus.week.claims}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.dailyBonus.week.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">All Time</p>
                      <p className="text-xl font-bold">{stats.dailyBonus.allTime.claims}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.dailyBonus.allTime.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Ad Watch Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tv className="w-4 h-4 text-blue-500" /> Ad Watch Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-xl font-bold">{stats.adWatches.today.watches}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.adWatches.today.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">This Week</p>
                      <p className="text-xl font-bold">{stats.adWatches.week.watches}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.adWatches.week.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">All Time</p>
                      <p className="text-xl font-bold">{stats.adWatches.allTime.watches}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.adWatches.allTime.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Referral Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-500" /> Referral Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-xl font-bold">{stats.referrals.today.count}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.referrals.today.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">This Week</p>
                      <p className="text-xl font-bold">{stats.referrals.week.count}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.referrals.week.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">All Time</p>
                      <p className="text-xl font-bold">{stats.referrals.allTime.count}</p>
                      <p className="text-xs text-green-500">{formatCurrency(stats.referrals.allTime.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Rewards Distributed</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(stats.totals.allRewardsDistributed)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Games Today</p>
                      <p className="text-2xl font-bold">{stats.totals.gamesToday}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active Referrers</p>
                      <p className="text-2xl font-bold">{stats.totals.activeReferrers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center text-muted-foreground py-10">No statistics available</div>
          )}
        </TabsContent>

        {/* ====== ACTIVITY TAB ====== */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" /> Recent Activity
              </CardTitle>
              <CardDescription>Latest free play rewards and actions</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading activity...</div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {activity.map((item: { type: string; username?: string; details?: string; amount: string | number; date: string }, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg border bg-card/50 hover:bg-card">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md ${
                          item.type === 'daily_bonus' ? 'bg-yellow-500/10' :
                          item.type === 'ad_watch' ? 'bg-blue-500/10' :
                          'bg-green-500/10'
                        }`}>
                          {item.type === 'daily_bonus' ? (
                            <Calendar className="w-4 h-4 text-yellow-500" />
                          ) : item.type === 'ad_watch' ? (
                            <Tv className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Users className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.username}</p>
                          <p className="text-xs text-muted-foreground">{item.details}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          item.type === 'daily_bonus' ? 'default' :
                          item.type === 'ad_watch' ? 'secondary' :
                          'outline'
                        }>
                          {item.type === 'daily_bonus' ? 'Daily' :
                           item.type === 'ad_watch' ? 'Ad' : 'Referral'}
                        </Badge>
                        <p className="text-sm font-bold text-green-500 mt-0.5">
                          +{formatCurrency(item.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.date).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== TOP REFERRERS TAB ====== */}
        <TabsContent value="referrers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-500" /> Top Referrers
              </CardTitle>
              <CardDescription>Users who brought the most new players</CardDescription>
            </CardHeader>
            <CardContent>
              {topReferrers && topReferrers.length > 0 ? (
                <div className="space-y-2">
                  {topReferrers.map((r: { userId: string; nickname?: string; username?: string; referralCount?: number; totalEarned?: string | number }, idx: number) => (
                    <div key={r.userId} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                          idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                          idx === 2 ? 'bg-orange-500/20 text-orange-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          #{idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{r.nickname || r.username}</p>
                          <p className="text-xs text-muted-foreground">@{r.username}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{r.referralCount} referrals</p>
                        <p className="text-xs text-green-500">{formatCurrency(r.totalEarned || 0)} earned</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">
                  No referrers yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
