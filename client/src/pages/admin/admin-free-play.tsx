import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Coins,
  Calendar,
  Crown,
  Gamepad2,
  Settings,
  BarChart3,
  Upload,
  Image as ImageIcon,
  Video,
  MousePointerClick,
  Eye,
  Medal,
  Pencil,
  Plus,
  Trash2,
  Trophy,
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

async function adminPost(url: string, body: Record<string, unknown>) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

async function adminPatch(url: string, body: Record<string, unknown>) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

async function adminDelete(url: string) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "x-admin-token": token || "" },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

interface FreePlayLeaderboardRow {
  user_id: string;
  username?: string;
  nickname?: string | null;
  last_active_at?: string | null;
  activity_count?: number;
  total_rewards?: string;
  successful_referrals?: number;
  invited_total?: number;
  invited_active?: number;
  games_played?: number;
  games_won?: number;
  total_earnings?: string;
  last_activity_at?: string | null;
}

interface FreePlayLeaderboardResponse {
  section: "daily" | "ads" | "referral" | "games";
  windowDays: number;
  rows: FreePlayLeaderboardRow[];
}

interface ReferrerDetailsResponse {
  referrer: {
    id: string;
    username: string;
    nickname?: string | null;
    status: string;
    isOnline: boolean;
    lastActiveAt?: string | null;
  };
  affiliate: {
    id: string;
    affiliateCode: string;
    referralLink: string;
    commissionRate: string;
    isActive: boolean;
  } | null;
  summary: {
    invitedTotal: number;
    invitedActive: number;
    invitedInactive: number;
    totalInvitedDeposits: string;
    totalInvitedEarnings: string;
    totalInvitedGames: number;
    totalCommissions: string;
    commissionEvents: number;
    lastCommissionAt?: string | null;
  };
  invitedUsers: Array<{
    id: string;
    username: string;
    nickname?: string | null;
    status: string;
    is_online: boolean;
    last_active_at?: string | null;
    total_deposited: string;
    total_earnings: string;
    total_won: string;
    games_played: number;
    created_at: string;
    commission_generated: string;
  }>;
}

interface MarketerOverviewResponse {
  summary: {
    total_marketers: number;
    approved_marketers: number;
    pending_marketers: number;
    revoked_marketers: number;
    total_commissions: string;
    total_pending: string;
    total_withdrawable: string;
    total_paid: string;
  };
  topMarketers: Array<{
    user_id: string;
    username: string;
    nickname?: string | null;
    total_referrals: number;
    total_commission_earned: string;
    pending_commission: string;
    total_withdrawable_commission: string;
  }>;
}

interface MarketerDetailsResponse {
  user: {
    id: string;
    username: string;
    nickname?: string | null;
    status: string;
  };
  affiliate: {
    id: string;
    marketerStatus: string;
    cpaEnabled: boolean;
    cpaAmount: string;
    revshareEnabled: boolean;
    revshareRate: string;
    commissionHoldDays: number;
    minQualifiedDeposits: string;
    minQualifiedWagered: string;
    minQualifiedGames: number;
    totalCommissionEarned: string;
    pendingCommission: string;
    totalWithdrawableCommission: string;
    totalPaidCommission: string;
  } | null;
  referralStats: {
    invited_total: number;
    invited_active: number;
    invited_deposits: string;
    invited_wagered: string;
    invited_games: number;
  };
  commissionStats: {
    total_amount: string;
    on_hold_amount: string;
    released_amount: string;
    cpa_amount: string;
    revshare_amount: string;
    events_count: number;
  };
  recentEvents: Array<{
    id: string;
    reward_type: string;
    reward_status: string;
    reward_amount: string;
    hold_until?: string | null;
    released_at?: string | null;
    created_at: string;
    referred_username?: string | null;
  }>;
}

interface FreePlayAdsCampaign {
  id: string;
  title: string;
  title_ar?: string | null;
  type: "image" | "video" | "link" | "embed";
  asset_url?: string | null;
  target_url?: string | null;
  embed_code?: string | null;
  display_duration: number;
  sort_order: number;
  is_active: boolean;
  tracked_views: number;
  tracked_clicks: number;
  reward_claims: number;
  reward_total: string;
}

interface FreePlayAdsCampaignsResponse {
  windowDays: number;
  campaigns: FreePlayAdsCampaign[];
}

interface FreePlayAdsAnalyticsResponse {
  windowDays: number;
  totals: {
    views: number;
    clicks: number;
    rewardClaims: number;
    uniqueUsers: number;
    rewardTotal: string;
    clickThroughRate: string;
    totalCampaigns: number;
    activeCampaigns: number;
  };
  topCampaigns: Array<{
    id: string;
    title: string;
    type: string;
    views: number;
    clicks: number;
    reward_claims: number;
    reward_total: string;
  }>;
}

interface FreePlayAdFormState {
  title: string;
  titleAr: string;
  type: "image" | "video" | "link" | "embed";
  assetUrl: string;
  targetUrl: string;
  embedCode: string;
  displayDuration: string;
  sortOrder: string;
  isActive: boolean;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function AdminFreePlayPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("referral");
  const [leaderboardWindowDays, setLeaderboardWindowDays] = useState("30");
  const [leaderboardLimit, setLeaderboardLimit] = useState("20");
  const [selectedReferrerId, setSelectedReferrerId] = useState("");
  const [referrerCommissionRate, setReferrerCommissionRate] = useState("5.00");
  const [marketerCpaEnabled, setMarketerCpaEnabled] = useState(true);
  const [marketerRevshareEnabled, setMarketerRevshareEnabled] = useState(true);
  const [marketerCpaAmount, setMarketerCpaAmount] = useState("5.00");
  const [marketerRevshareRate, setMarketerRevshareRate] = useState("10.00");
  const [marketerHoldDays, setMarketerHoldDays] = useState("7");
  const [marketerMinDeposit, setMarketerMinDeposit] = useState("0.00");
  const [marketerMinWagered, setMarketerMinWagered] = useState("0.00");
  const [marketerMinGames, setMarketerMinGames] = useState("0");
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [adAssetUploading, setAdAssetUploading] = useState(false);
  const [adForm, setAdForm] = useState<FreePlayAdFormState>({
    title: "",
    titleAr: "",
    type: "image",
    assetUrl: "",
    targetUrl: "",
    embedCode: "",
    displayDuration: "5000",
    sortOrder: "0",
    isActive: true,
  });

  const windowDaysValue = Math.max(parseInt(leaderboardWindowDays, 10) || 30, 1);
  const limitValue = Math.max(parseInt(leaderboardLimit, 10) || 20, 1);

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

  const { data: dailyLeaderboard, isLoading: dailyLeaderboardLoading } = useQuery<FreePlayLeaderboardResponse>({
    queryKey: ["/api/admin/free-play/leaderboard", "daily", windowDaysValue, limitValue],
    queryFn: () => adminFetch(`/api/admin/free-play/leaderboard?section=daily&windowDays=${windowDaysValue}&limit=${limitValue}`),
  });

  const { data: adsLeaderboard, isLoading: adsLeaderboardLoading } = useQuery<FreePlayLeaderboardResponse>({
    queryKey: ["/api/admin/free-play/leaderboard", "ads", windowDaysValue, limitValue],
    queryFn: () => adminFetch(`/api/admin/free-play/leaderboard?section=ads&windowDays=${windowDaysValue}&limit=${limitValue}`),
  });

  const { data: referralLeaderboard, isLoading: referralLeaderboardLoading } = useQuery<FreePlayLeaderboardResponse>({
    queryKey: ["/api/admin/free-play/leaderboard", "referral", windowDaysValue, limitValue],
    queryFn: () => adminFetch(`/api/admin/free-play/leaderboard?section=referral&windowDays=${windowDaysValue}&limit=${limitValue}`),
  });

  const { data: gamesLeaderboard, isLoading: gamesLeaderboardLoading } = useQuery<FreePlayLeaderboardResponse>({
    queryKey: ["/api/admin/free-play/leaderboard", "games", windowDaysValue, limitValue],
    queryFn: () => adminFetch(`/api/admin/free-play/leaderboard?section=games&windowDays=${windowDaysValue}&limit=${limitValue}`),
  });

  const { data: referrerDetails, isLoading: referrerDetailsLoading } = useQuery<ReferrerDetailsResponse>({
    queryKey: ["/api/admin/free-play/referrals", selectedReferrerId],
    queryFn: () => adminFetch(`/api/admin/free-play/referrals/${selectedReferrerId}/details?limit=100`),
    enabled: selectedReferrerId.length > 0,
  });

  const { data: marketerOverview } = useQuery<MarketerOverviewResponse>({
    queryKey: ["/api/admin/free-play/marketers/overview"],
    queryFn: () => adminFetch("/api/admin/free-play/marketers/overview"),
  });

  const { data: marketerDetails, isLoading: marketerDetailsLoading } = useQuery<MarketerDetailsResponse>({
    queryKey: ["/api/admin/free-play/marketers", selectedReferrerId],
    queryFn: () => adminFetch(`/api/admin/free-play/marketers/${selectedReferrerId}/details`),
    enabled: selectedReferrerId.length > 0,
  });

  const { data: adsCampaigns, isLoading: adsCampaignsLoading } = useQuery<FreePlayAdsCampaignsResponse>({
    queryKey: ["/api/admin/free-play/ads/campaigns", windowDaysValue],
    queryFn: () => adminFetch(`/api/admin/free-play/ads/campaigns?windowDays=${windowDaysValue}`),
  });

  const { data: adsAnalytics, isLoading: adsAnalyticsLoading } = useQuery<FreePlayAdsAnalyticsResponse>({
    queryKey: ["/api/admin/free-play/ads/analytics", windowDaysValue],
    queryFn: () => adminFetch(`/api/admin/free-play/ads/analytics?windowDays=${windowDaysValue}`),
  });

  useEffect(() => {
    if (referrerDetails?.affiliate?.commissionRate) {
      setReferrerCommissionRate(String(referrerDetails.affiliate.commissionRate));
    }
  }, [referrerDetails?.affiliate?.commissionRate]);

  useEffect(() => {
    if (selectedReferrerId || !topReferrers?.length) {
      return;
    }

    const firstReferrerId = String(topReferrers[0]?.userId || "");
    if (firstReferrerId) {
      setSelectedReferrerId(firstReferrerId);
    }
  }, [selectedReferrerId, topReferrers]);

  useEffect(() => {
    if (!marketerDetails?.affiliate) {
      return;
    }
    setMarketerCpaEnabled(marketerDetails.affiliate.cpaEnabled !== false);
    setMarketerRevshareEnabled(marketerDetails.affiliate.revshareEnabled !== false);
    setMarketerCpaAmount(String(marketerDetails.affiliate.cpaAmount || "5.00"));
    setMarketerRevshareRate(String(marketerDetails.affiliate.revshareRate || "10.00"));
    setMarketerHoldDays(String(marketerDetails.affiliate.commissionHoldDays ?? 7));
    setMarketerMinDeposit(String(marketerDetails.affiliate.minQualifiedDeposits || "0.00"));
    setMarketerMinWagered(String(marketerDetails.affiliate.minQualifiedWagered || "0.00"));
    setMarketerMinGames(String(marketerDetails.affiliate.minQualifiedGames ?? 0));
  }, [marketerDetails?.affiliate]);

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

  const updateCommissionMut = useMutation({
    mutationFn: (payload: { userId: string; commissionRate: string }) =>
      adminPut(`/api/admin/free-play/referrals/${payload.userId}/commission`, {
        commissionRate: payload.commissionRate,
      }),
    onSuccess: () => {
      toast({ title: "Referral commission updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/referrals", selectedReferrerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/leaderboard", "referral", windowDaysValue, limitValue] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update commission", description: err.message, variant: "destructive" });
    },
  });

  const updateMarketerConfigMut = useMutation({
    mutationFn: (payload: {
      userId: string;
      cpaEnabled: boolean;
      revshareEnabled: boolean;
      cpaAmount: string;
      revshareRate: string;
      commissionHoldDays: string;
      minQualifiedDeposits: string;
      minQualifiedWagered: string;
      minQualifiedGames: string;
    }) => adminPut(`/api/admin/free-play/marketers/${payload.userId}/config`, payload),
    onSuccess: () => {
      toast({ title: "Marketer configuration updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedReferrerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update marketer config", description: err.message, variant: "destructive" });
    },
  });

  const marketerBadgeMut = useMutation({
    mutationFn: (payload: { userId: string; action: "grant" | "revoke" }) =>
      adminPost(`/api/admin/free-play/marketers/${payload.userId}/badge`, { action: payload.action }),
    onSuccess: (_data, variables) => {
      toast({ title: variables.action === "grant" ? "Marketer badge granted" : "Marketer badge revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedReferrerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
    },
    onError: (err: Error) => {
      toast({ title: "Badge action failed", description: err.message, variant: "destructive" });
    },
  });

  const syncMarketerMut = useMutation({
    mutationFn: (payload: { userId?: string; releaseOnly?: boolean }) =>
      adminPost("/api/admin/free-play/marketers/sync", payload),
    onSuccess: () => {
      toast({ title: "Marketer sync finished" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers", selectedReferrerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/marketers/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/referrals", selectedReferrerId] });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const createCampaignMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => adminPost("/api/admin/free-play/ads/campaigns", payload),
    onSuccess: () => {
      toast({ title: "Ad campaign created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/campaigns", windowDaysValue] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/analytics", windowDaysValue] });
      setIsCampaignDialogOpen(false);
      setEditingCampaignId(null);
      setAdForm({
        title: "",
        titleAr: "",
        type: "image",
        assetUrl: "",
        targetUrl: "",
        embedCode: "",
        displayDuration: "5000",
        sortOrder: "0",
        isActive: true,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    },
  });

  const updateCampaignMut = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      adminPatch(`/api/admin/free-play/ads/campaigns/${payload.id}`, payload.body),
    onSuccess: () => {
      toast({ title: "Ad campaign updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/campaigns", windowDaysValue] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/analytics", windowDaysValue] });
      setIsCampaignDialogOpen(false);
      setEditingCampaignId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update campaign", description: err.message, variant: "destructive" });
    },
  });

  const deleteCampaignMut = useMutation({
    mutationFn: (campaignId: string) => adminDelete(`/api/admin/free-play/ads/campaigns/${campaignId}`),
    onSuccess: () => {
      toast({ title: "Ad campaign deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/campaigns", windowDaysValue] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/free-play/ads/analytics", windowDaysValue] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete campaign", description: err.message, variant: "destructive" });
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

  const formatProjectCoins = (n: number | string) => {
    const num = typeof n === "string" ? parseFloat(n) : n;
    return `${num.toFixed(2)} coins`;
  };

  const selectReferrer = (userId: string, commission?: string) => {
    setSelectedReferrerId(userId);
    setReferrerCommissionRate(commission || "5.00");
  };

  const handleCommissionSave = () => {
    if (!selectedReferrerId) {
      toast({ title: "Select a referrer first", variant: "destructive" });
      return;
    }

    updateCommissionMut.mutate({ userId: selectedReferrerId, commissionRate: referrerCommissionRate });
  };

  const handleMarketerConfigSave = () => {
    if (!selectedReferrerId) {
      toast({ title: "Select a marketer first", variant: "destructive" });
      return;
    }

    updateMarketerConfigMut.mutate({
      userId: selectedReferrerId,
      cpaEnabled: marketerCpaEnabled,
      revshareEnabled: marketerRevshareEnabled,
      cpaAmount: marketerCpaAmount,
      revshareRate: marketerRevshareRate,
      commissionHoldDays: marketerHoldDays,
      minQualifiedDeposits: marketerMinDeposit,
      minQualifiedWagered: marketerMinWagered,
      minQualifiedGames: marketerMinGames,
    });
  };

  const handleCampaignAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setAdAssetUploading(true);
      const base64 = await fileToBase64(file);
      const payload = await adminPost("/api/admin/free-play/ads/upload-asset", {
        data: base64,
        mimeType: file.type,
        fileName: file.name,
      });

      const assetUrl = String(payload?.assetUrl || "");
      setAdForm((prev) => ({ ...prev, assetUrl }));
      toast({ title: "Asset uploaded" });
    } catch (err) {
      toast({
        title: "Asset upload failed",
        description: err instanceof Error ? err.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setAdAssetUploading(false);
      event.target.value = "";
    }
  };

  const openCreateCampaign = () => {
    setEditingCampaignId(null);
    setAdForm({
      title: "",
      titleAr: "",
      type: "image",
      assetUrl: "",
      targetUrl: "",
      embedCode: "",
      displayDuration: "5000",
      sortOrder: "0",
      isActive: true,
    });
    setIsCampaignDialogOpen(true);
  };

  const openEditCampaign = (campaign: FreePlayAdsCampaign) => {
    setEditingCampaignId(campaign.id);
    setAdForm({
      title: campaign.title,
      titleAr: campaign.title_ar || "",
      type: campaign.type,
      assetUrl: campaign.asset_url || "",
      targetUrl: campaign.target_url || "",
      embedCode: campaign.embed_code || "",
      displayDuration: String(campaign.display_duration || 5000),
      sortOrder: String(campaign.sort_order || 0),
      isActive: campaign.is_active,
    });
    setIsCampaignDialogOpen(true);
  };

  const saveCampaign = () => {
    const payload: Record<string, unknown> = {
      title: adForm.title,
      titleAr: adForm.titleAr,
      type: adForm.type,
      assetUrl: adForm.assetUrl,
      targetUrl: adForm.targetUrl,
      embedCode: adForm.embedCode,
      displayDuration: Number.parseInt(adForm.displayDuration, 10),
      sortOrder: Number.parseInt(adForm.sortOrder, 10),
      isActive: adForm.isActive,
    };

    if (editingCampaignId) {
      updateCampaignMut.mutate({ id: editingCampaignId, body: payload });
      return;
    }

    createCampaignMut.mutate(payload);
  };

  return (
    <div className="min-h-[100svh] space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-green-500" />
            Free Play Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            All rewards here use project currency only and are credited to users' project wallets
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[40px] w-full sm:w-auto"
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
                  <p className="text-xs text-muted-foreground">{formatProjectCoins(stats.dailyBonus.today.total)}</p>
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
                  <p className="text-xs text-muted-foreground">{formatProjectCoins(stats.adWatches.today.total)}</p>
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
                  <p className="text-xs text-muted-foreground">{formatProjectCoins(stats.referrals.today.total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Coins className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">All-Time Distributed</p>
                  <p className="text-lg font-bold">{formatProjectCoins(stats.totals.allRewardsDistributed)}</p>
                  <p className="text-xs text-muted-foreground">{stats.totals.activeReferrers} active referrers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="overflow-x-auto pb-1">
            <TabsList className="inline-grid grid-cols-4 min-w-[30rem] md:min-w-0 md:w-full md:max-w-xl">
              <TabsTrigger value="daily" className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Daily
              </TabsTrigger>
              <TabsTrigger value="ads" className="flex items-center gap-1">
                <Tv className="w-4 h-4" /> Ads
              </TabsTrigger>
              <TabsTrigger value="referral" className="flex items-center gap-1">
                <Users className="w-4 h-4" /> Referral
              </TabsTrigger>
              <TabsTrigger value="games" className="flex items-center gap-1">
                <Gamepad2 className="w-4 h-4" /> Games
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="w-full sm:w-24"
              type="number"
              min="1"
              value={leaderboardWindowDays}
              onChange={(e) => setLeaderboardWindowDays(e.target.value)}
              placeholder="Days"
            />
            <Input
              className="w-full sm:w-24"
              type="number"
              min="1"
              value={leaderboardLimit}
              onChange={(e) => setLeaderboardLimit(e.target.value)}
              placeholder="Limit"
            />
          </div>
        </div>

        <TabsContent value="daily" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Daily Rewards Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Daily Bonus Enabled</Label>
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <p className="text-xs text-muted-foreground">Allow users to claim daily bonus</p>
                    <Switch checked={isOn("daily_bonus_enabled")} onCheckedChange={() => toggleLocal("daily_bonus_enabled")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Daily Reward Amount (Project Coins)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={getSettingVal("daily_bonus_amount", "0.10")}
                    onChange={(e) => updateLocal("daily_bonus_amount", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={updateSettingsMut.isPending || settingsLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  {updateSettingsMut.isPending ? "Saving..." : "Save Daily Controls"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" /> Daily Activity Leaderboard
              </CardTitle>
              <CardDescription>Top users by daily free rewards claims in selected window</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyLeaderboardLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading daily leaderboard...</div>
              ) : dailyLeaderboard?.rows?.length ? (
                <div className="space-y-2">
                  {dailyLeaderboard.rows.map((row, idx) => (
                    <div key={String(row.user_id)} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-semibold">#{idx + 1} {row.nickname || row.username}</p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{row.activity_count || 0} claims</p>
                        <p className="text-xs text-green-500">{formatProjectCoins(row.total_rewards || 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No data in this range</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold">{adsAnalytics?.totals?.views || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Clicks</p>
                <p className="text-2xl font-bold">{adsAnalytics?.totals?.clicks || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Average CTR</p>
                <p className="text-2xl font-bold">{adsAnalytics?.totals?.clickThroughRate || "0.00"}%</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tv className="w-4 h-4 text-blue-500" /> Ads Campaign Management
                </CardTitle>
                <CardDescription>Create image/video/link campaigns and monitor performance</CardDescription>
              </div>
              <Button className="min-h-[40px]" onClick={openCreateCampaign}>
                <Plus className="w-4 h-4 mr-2" /> New Campaign
              </Button>
            </CardHeader>
            <CardContent>
              {adsCampaignsLoading || adsAnalyticsLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading campaigns...</div>
              ) : adsCampaigns?.campaigns?.length ? (
                <div className="space-y-2">
                  {adsCampaigns.campaigns.map((campaign) => {
                    return (
                      <div key={campaign.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{campaign.title}</p>
                            <p className="text-xs text-muted-foreground">{campaign.type.toUpperCase()} • {campaign.target_url || "No target URL"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={campaign.is_active ? "default" : "outline"}>{campaign.is_active ? "Active" : "Inactive"}</Badge>
                            <Button size="sm" className="min-h-[40px]" variant="outline" onClick={() => openEditCampaign(campaign)}>
                              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              className="min-h-[40px]"
                              variant="destructive"
                              onClick={() => deleteCampaignMut.mutate(campaign.id)}
                              disabled={deleteCampaignMut.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 rounded bg-muted/40">Impressions: <span className="font-semibold">{campaign.tracked_views || 0}</span></div>
                          <div className="p-2 rounded bg-muted/40">Clicks: <span className="font-semibold">{campaign.tracked_clicks || 0}</span></div>
                          <div className="p-2 rounded bg-muted/40">Claims: <span className="font-semibold">{campaign.reward_claims || 0}</span></div>
                          <div className="p-2 rounded bg-muted/40">CTR: <span className="font-semibold">{campaign.tracked_views > 0 ? ((campaign.tracked_clicks / campaign.tracked_views) * 100).toFixed(2) : "0.00"}%</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No campaigns found</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-blue-500" /> Ads Activity Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adsLeaderboardLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading ads leaderboard...</div>
              ) : adsLeaderboard?.rows?.length ? (
                <div className="space-y-2">
                  {adsLeaderboard.rows.map((row, idx) => (
                    <div key={String(row.user_id)} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-semibold">#{idx + 1} {row.nickname || row.username}</p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{row.activity_count || 0} ad interactions</p>
                        <p className="text-xs text-green-500">{formatProjectCoins(row.total_rewards || 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No ads activity data</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referral" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" /> Referral Controls
              </CardTitle>
              <CardDescription>
                Configure referral rewards in project currency and adjust the referral profit rate (%) from one place.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-1">
                  <Label>Referral Rewards Enabled</Label>
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <p className="text-xs text-muted-foreground">Allow referral bonus crediting</p>
                    <Switch checked={isOn("referral_reward_enabled")} onCheckedChange={() => toggleLocal("referral_reward_enabled")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Base Reward Amount (Project Coins)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={getSettingVal("referral_reward_amount", "5.00")}
                    onChange={(e) => updateLocal("referral_reward_amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Referral Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={getSettingVal("referral_reward_rate_percent", "100.00")}
                    onChange={(e) => updateLocal("referral_reward_rate_percent", e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Effective reward per successful referral: </span>
                <span className="font-semibold text-green-600">
                  {formatProjectCoins(
                    (Number.parseFloat(getSettingVal("referral_reward_amount", "0")) || 0)
                    * ((Number.parseFloat(getSettingVal("referral_reward_rate_percent", "100")) || 0) / 100),
                  )}
                </span>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={updateSettingsMut.isPending || settingsLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  {updateSettingsMut.isPending ? "Saving..." : "Save Referral Controls"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Medal className="w-4 h-4 text-sky-500" /> Marketer Program Overview
              </CardTitle>
              <CardDescription>CPA + RevShare health, pending balances, and top marketers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded border">
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p className="text-xl font-bold">{Number(marketerOverview?.summary?.approved_marketers || 0)}</p>
                </div>
                <div className="p-3 rounded border">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold">{Number(marketerOverview?.summary?.pending_marketers || 0)}</p>
                </div>
                <div className="p-3 rounded border">
                  <p className="text-xs text-muted-foreground">Total Pending</p>
                  <p className="text-xl font-bold">{formatProjectCoins(marketerOverview?.summary?.total_pending || 0)}</p>
                </div>
                <div className="p-3 rounded border">
                  <p className="text-xs text-muted-foreground">Total Withdrawable</p>
                  <p className="text-xl font-bold">{formatProjectCoins(marketerOverview?.summary?.total_withdrawable || 0)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => syncMarketerMut.mutate({ userId: selectedReferrerId || undefined, releaseOnly: false })}
                  disabled={syncMarketerMut.isPending}
                >
                  {syncMarketerMut.isPending ? "Syncing..." : "Run RevShare Sync"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => syncMarketerMut.mutate({ userId: selectedReferrerId || undefined, releaseOnly: true })}
                  disabled={syncMarketerMut.isPending}
                >
                  {syncMarketerMut.isPending ? "Processing..." : "Release Eligible"}
                </Button>
              </div>

              {(marketerOverview?.topMarketers?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  {marketerOverview!.topMarketers.slice(0, 5).map((row, idx) => (
                    <div key={row.user_id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">#{idx + 1} {row.nickname || row.username}</p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatProjectCoins(row.total_commission_earned || 0)}</p>
                        <p className="text-xs text-muted-foreground">{Number(row.total_referrals || 0)} referrals</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-500" /> Referral Leaderboard
              </CardTitle>
              <CardDescription>Select a referrer to open deep analytics and update commission</CardDescription>
            </CardHeader>
            <CardContent>
              {referralLeaderboardLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading referral leaderboard...</div>
              ) : referralLeaderboard?.rows?.length ? (
                <div className="space-y-2">
                  {referralLeaderboard.rows.map((row, idx) => (
                    <div key={String(row.user_id)} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-semibold">#{idx + 1} {row.nickname || row.username}</p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-semibold">{row.activity_count || 0} referrals</p>
                          <p className="text-xs text-green-500">{formatProjectCoins(row.total_rewards || 0)}</p>
                        </div>
                        <Button
                          size="sm"
                          className="min-h-[40px]"
                          variant={selectedReferrerId === String(row.user_id) ? "default" : "outline"}
                          onClick={() => selectReferrer(String(row.user_id))}
                        >
                          Inspect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No referral data</div>
              )}
            </CardContent>
          </Card>

          {!!selectedReferrerId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Referrer Deep Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {referrerDetailsLoading ? (
                  <div className="text-center text-muted-foreground py-6">Loading referrer details...</div>
                ) : referrerDetails ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="p-3 rounded border"><p className="text-xs text-muted-foreground">Invited</p><p className="text-xl font-bold">{referrerDetails.summary.invitedTotal}</p></div>
                      <div className="p-3 rounded border"><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold">{referrerDetails.summary.invitedActive}</p></div>
                      <div className="p-3 rounded border"><p className="text-xs text-muted-foreground">Deposits</p><p className="text-xl font-bold">{formatProjectCoins(referrerDetails.summary.totalInvitedDeposits)}</p></div>
                      <div className="p-3 rounded border"><p className="text-xs text-muted-foreground">Earnings</p><p className="text-xl font-bold">{formatProjectCoins(referrerDetails.summary.totalInvitedEarnings)}</p></div>
                      <div className="p-3 rounded border"><p className="text-xs text-muted-foreground">Commission</p><p className="text-xl font-bold">{formatProjectCoins(referrerDetails.summary.totalCommissions)}</p></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label>Commission Rate (%)</Label>
                        <Input value={referrerCommissionRate} onChange={(e) => setReferrerCommissionRate(e.target.value)} type="number" min="0" max="100" step="0.01" />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <Button onClick={handleCommissionSave} disabled={updateCommissionMut.isPending}>
                          {updateCommissionMut.isPending ? "Updating..." : "Update Commission"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-auto">
                      {referrerDetails.invitedUsers.map((invited) => (
                        <div key={invited.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{invited.nickname || invited.username}</p>
                              <p className="text-xs text-muted-foreground">@{invited.username}</p>
                            </div>
                            <Badge variant={invited.status === "active" ? "default" : "outline"}>{invited.status === "active" ? "Active" : "Inactive"}</Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-2">
                            <div className="p-2 rounded bg-muted/40">Deposits: <span className="font-semibold">{formatProjectCoins(invited.total_deposited)}</span></div>
                            <div className="p-2 rounded bg-muted/40">Earnings: <span className="font-semibold">{formatProjectCoins(invited.total_earnings)}</span></div>
                            <div className="p-2 rounded bg-muted/40">Commission: <span className="font-semibold">{formatProjectCoins(invited.commission_generated)}</span></div>
                            <div className="p-2 rounded bg-muted/40">Last active: <span className="font-semibold">{formatDateTime(invited.last_active_at)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-6">No details found for selected referrer</div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-sky-500" /> Marketer Controls
              </CardTitle>
              <CardDescription>
                Controls are always visible. Select a referrer from Referral Leaderboard to apply badge/config actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {marketerDetailsLoading ? (
                <div className="text-center text-muted-foreground py-4">Loading marketer details...</div>
              ) : (
                <>
                  {!selectedReferrerId && (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Select a referrer first to load marketer details and enable action buttons.
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="p-3 rounded border">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-xl font-bold capitalize">{marketerDetails?.affiliate?.marketerStatus || "pending"}</p>
                    </div>
                    <div className="p-3 rounded border">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-bold">{formatProjectCoins(marketerDetails?.commissionStats?.total_amount || 0)}</p>
                    </div>
                    <div className="p-3 rounded border">
                      <p className="text-xs text-muted-foreground">On Hold</p>
                      <p className="text-xl font-bold">{formatProjectCoins(marketerDetails?.commissionStats?.on_hold_amount || 0)}</p>
                    </div>
                    <div className="p-3 rounded border">
                      <p className="text-xs text-muted-foreground">Released</p>
                      <p className="text-xl font-bold">{formatProjectCoins(marketerDetails?.commissionStats?.released_amount || 0)}</p>
                    </div>
                    <div className="p-3 rounded border">
                      <p className="text-xs text-muted-foreground">RevShare</p>
                      <p className="text-xl font-bold">{formatProjectCoins(marketerDetails?.commissionStats?.revshare_amount || 0)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>CPA Enabled</Label>
                      <div className="flex items-center h-10 px-3 border rounded-md justify-between">
                        <span className="text-sm">Active</span>
                        <Switch checked={marketerCpaEnabled} onCheckedChange={setMarketerCpaEnabled} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPA Amount</Label>
                      <Input value={marketerCpaAmount} onChange={(e) => setMarketerCpaAmount(e.target.value)} type="number" min="0" step="0.01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>RevShare Enabled</Label>
                      <div className="flex items-center h-10 px-3 border rounded-md justify-between">
                        <span className="text-sm">Active</span>
                        <Switch checked={marketerRevshareEnabled} onCheckedChange={setMarketerRevshareEnabled} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>RevShare %</Label>
                      <Input value={marketerRevshareRate} onChange={(e) => setMarketerRevshareRate(e.target.value)} type="number" min="0" max="100" step="0.01" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Hold Days</Label>
                      <Input value={marketerHoldDays} onChange={(e) => setMarketerHoldDays(e.target.value)} type="number" min="0" max="120" step="1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Min Deposit</Label>
                      <Input value={marketerMinDeposit} onChange={(e) => setMarketerMinDeposit(e.target.value)} type="number" min="0" step="0.01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Min Wagered</Label>
                      <Input value={marketerMinWagered} onChange={(e) => setMarketerMinWagered(e.target.value)} type="number" min="0" step="0.01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Min Games</Label>
                      <Input value={marketerMinGames} onChange={(e) => setMarketerMinGames(e.target.value)} type="number" min="0" step="1" />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => marketerBadgeMut.mutate({ userId: selectedReferrerId, action: "grant" })}
                      disabled={marketerBadgeMut.isPending || !selectedReferrerId}
                    >
                      Grant Marketer Badge
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => marketerBadgeMut.mutate({ userId: selectedReferrerId, action: "revoke" })}
                      disabled={marketerBadgeMut.isPending || !selectedReferrerId}
                    >
                      Revoke Marketer Badge
                    </Button>
                    <Button onClick={handleMarketerConfigSave} disabled={updateMarketerConfigMut.isPending || !selectedReferrerId}>
                      {updateMarketerConfigMut.isPending ? "Saving..." : "Save Marketer Config"}
                    </Button>
                  </div>

                  {(marketerDetails?.recentEvents?.length ?? 0) > 0 && (
                    <div className="space-y-2 max-h-[300px] overflow-auto">
                      {marketerDetails!.recentEvents.slice(0, 20).map((event) => (
                        <div key={event.id} className="border rounded-lg p-2 flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium">{event.referred_username || "Referral"}</p>
                            <p className="text-xs text-muted-foreground uppercase">{event.reward_type} • {event.reward_status}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatProjectCoins(event.reward_amount || 0)}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {!selectedReferrerId && topReferrers?.length ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Referrers Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topReferrers.map((r: { userId: string; nickname?: string; username?: string; referralCount?: number; totalRewards?: string | number }, idx: number) => (
                  <div key={r.userId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-semibold">#{idx + 1} {r.nickname || r.username}</p>
                      <p className="text-xs text-muted-foreground">@{r.username}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{r.referralCount || 0} referrals</p>
                      <p className="text-xs text-green-500">{formatProjectCoins(r.totalRewards || 0)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="games" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-purple-500" /> Games Activity Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gamesLeaderboardLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading games leaderboard...</div>
              ) : gamesLeaderboard?.rows?.length ? (
                <div className="space-y-2">
                  {gamesLeaderboard.rows.map((row, idx) => (
                    <div key={String(row.user_id)} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-semibold">#{idx + 1} {row.nickname || row.username}</p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{row.activity_count || 0} game actions</p>
                        <p className="text-xs text-green-500">{formatProjectCoins(row.total_earnings || 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No game activity data</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" /> Recent Free Rewards Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading activity...</div>
              ) : activity?.length ? (
                <div className="space-y-2 max-h-[420px] overflow-auto">
                  {activity.map((item: { type: string; username?: string; details?: string; amount: string | number; date: string }, idx: number) => (
                    <div key={`${item.type}-${item.date}-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{item.username || "Unknown user"}</p>
                        <p className="text-xs text-muted-foreground">{item.details || "No details"}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="mb-1">{item.type}</Badge>
                        <p className="text-xs text-green-500">+{formatProjectCoins(item.amount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(item.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-6">No recent activity</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCampaignId ? "Edit Ad Campaign" : "Create Ad Campaign"}</DialogTitle>
            <DialogDescription>Manage ad metadata, media asset, target URL, and ordering.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Title (EN)</Label>
                <Input value={adForm.title} onChange={(e) => setAdForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Title (AR)</Label>
                <Input value={adForm.titleAr} onChange={(e) => setAdForm((prev) => ({ ...prev, titleAr: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={adForm.type} onValueChange={(value: "image" | "video" | "link" | "embed") => setAdForm((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                    <SelectItem value="embed">Embed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target URL</Label>
                <Input value={adForm.targetUrl} onChange={(e) => setAdForm((prev) => ({ ...prev, targetUrl: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Asset URL</Label>
              <Input value={adForm.assetUrl} onChange={(e) => setAdForm((prev) => ({ ...prev, assetUrl: e.target.value }))} />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input type="file" accept="image/*,video/*" onChange={handleCampaignAssetUpload} disabled={adAssetUploading} />
                <Button className="min-h-[40px]" variant="outline" disabled={adAssetUploading}>{adAssetUploading ? "Uploading..." : "Upload"}</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Embed Code</Label>
              <Textarea rows={4} value={adForm.embedCode} onChange={(e) => setAdForm((prev) => ({ ...prev, embedCode: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Display Duration (ms)</Label>
                <Input type="number" value={adForm.displayDuration} onChange={(e) => setAdForm((prev) => ({ ...prev, displayDuration: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" value={adForm.sortOrder} onChange={(e) => setAdForm((prev) => ({ ...prev, sortOrder: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex items-center h-10 px-3 border rounded-md justify-between">
                  <span className="text-sm">Active</span>
                  <Switch checked={adForm.isActive} onCheckedChange={(checked) => setAdForm((prev) => ({ ...prev, isActive: checked }))} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button className="min-h-[44px] w-full sm:w-auto" variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>Cancel</Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={saveCampaign}
              disabled={createCampaignMut.isPending || updateCampaignMut.isPending}
            >
              {editingCampaignId ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
