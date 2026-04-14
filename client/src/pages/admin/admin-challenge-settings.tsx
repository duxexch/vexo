import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pencil,
  RefreshCw,
  Settings2,
  Loader2,
  Percent,
  DollarSign,
  Shield,
  Clock,
  Users,
  Swords,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const adminToken = () => localStorage.getItem("adminToken") || "";

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-y-auto rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98";

interface ChallengeSettings {
  id: string;
  gameType: string;
  isEnabled: boolean;
  commissionPercent: string;
  allowSurrender: boolean;
  surrenderWinnerPercent: string;
  surrenderLoserRefundPercent: string;
  withdrawPenaltyPercent: string;
  turnTimeoutSeconds: number;
  reconnectGraceSeconds: number;
  challengeExpiryMinutes: number;
  minStake: string;
  maxStake: string;
  allowDraw: boolean;
  maxSpectators: number;
  allowSpectators: boolean;
  minMovesBeforeSurrender: number;
  maxConcurrentChallenges: number;
  createdAt: string;
  updatedAt: string;
}

interface Sam9SoloSettings {
  mode: "competitive" | "friendly_fixed_fee";
  fixedFee: string;
  updatedAt?: string | null;
}

function EditSettingsDialog({
  settings,
  open,
  onOpenChange
}: {
  settings: ChallengeSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    isEnabled: settings.isEnabled,
    commissionPercent: settings.commissionPercent,
    allowSurrender: settings.allowSurrender,
    surrenderWinnerPercent: settings.surrenderWinnerPercent,
    surrenderLoserRefundPercent: settings.surrenderLoserRefundPercent,
    withdrawPenaltyPercent: settings.withdrawPenaltyPercent,
    turnTimeoutSeconds: settings.turnTimeoutSeconds,
    reconnectGraceSeconds: settings.reconnectGraceSeconds,
    challengeExpiryMinutes: settings.challengeExpiryMinutes,
    minStake: settings.minStake,
    maxStake: settings.maxStake,
    allowDraw: settings.allowDraw,
    maxSpectators: settings.maxSpectators,
    allowSpectators: settings.allowSpectators,
    minMovesBeforeSurrender: settings.minMovesBeforeSurrender,
    maxConcurrentChallenges: settings.maxConcurrentChallenges,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`/api/admin/challenge-settings/${settings.gameType}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-settings"] });
      toast({ title: "تم التحديث", description: `تم تحديث إعدادات ${settings.gameType} بنجاح` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    // Validate
    const commission = parseFloat(form.commissionPercent);
    if (isNaN(commission) || commission < 0 || commission > 50) {
      toast({ title: "خطأ", description: "العمولة يجب أن تكون بين 0% و 50%", variant: "destructive" });
      return;
    }
    const winnerPct = parseFloat(form.surrenderWinnerPercent);
    const loserPct = parseFloat(form.surrenderLoserRefundPercent);
    if (winnerPct + loserPct > 100) {
      toast({ title: "خطأ", description: "نسبة الفائز + الخاسر لا يمكن أن تتجاوز 100%", variant: "destructive" });
      return;
    }
    updateMutation.mutate(form);
  };

  const gameTypeNames: Record<string, string> = {
    chess: "شطرنج",
    backgammon: "طاولة",
    domino: "دومينو",
    tarneeb: "طرنيب",
    baloot: "بلوت",
    languageduel: "تحدي اللغات",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_SURFACE_CLASS} sm:max-w-3xl`}>
        <div className="space-y-6 p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              إعدادات تحديات {gameTypeNames[settings.gameType] || settings.gameType}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Enable/Disable */}
            <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div>
                <Label className="font-semibold">تفعيل التحديات</Label>
                <p className="text-xs text-muted-foreground">السماح بإنشاء تحديات جديدة لهذه اللعبة</p>
              </div>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(checked) => setForm({ ...form, isEnabled: checked })}
              />
            </div>

            <Separator />

            {/* Commission Section */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Percent className="h-4 w-4 text-green-500" />
                إعدادات العمولة والمالية
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">عمولة المنصة (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="50"
                    value={form.commissionPercent}
                    onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
                    className={INPUT_SURFACE_CLASS}
                  />
                  <p className="text-[10px] text-muted-foreground">0-50% من إجمالي الرهان</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">غرامة الانسحاب (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.withdrawPenaltyPercent}
                    onChange={(e) => setForm({ ...form, withdrawPenaltyPercent: e.target.value })}
                    className={INPUT_SURFACE_CLASS}
                  />
                  <p className="text-[10px] text-muted-foreground">غرامة إلغاء التحدي المنتظر (0 = استرداد كامل)</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">الحد الأدنى للرهان ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minStake}
                    onChange={(e) => setForm({ ...form, minStake: e.target.value })}
                    className={INPUT_SURFACE_CLASS}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الحد الأقصى للرهان ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.maxStake}
                    onChange={(e) => setForm({ ...form, maxStake: e.target.value })}
                    className={INPUT_SURFACE_CLASS}
                  />
                  <p className="text-[10px] text-muted-foreground">0 = بدون حد أقصى</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Surrender Settings */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Ban className="h-4 w-4 text-red-500" />
                إعدادات الاستسلام
              </h4>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <Label className="text-xs">السماح بالاستسلام</Label>
                <Switch
                  checked={form.allowSurrender}
                  onCheckedChange={(checked) => setForm({ ...form, allowSurrender: checked })}
                />
              </div>
              {form.allowSurrender && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">نصيب الفائز (%)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={form.surrenderWinnerPercent}
                      onChange={(e) => setForm({ ...form, surrenderWinnerPercent: e.target.value })}
                      className={INPUT_SURFACE_CLASS}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">استرداد الخاسر (%)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={form.surrenderLoserRefundPercent}
                      onChange={(e) => setForm({ ...form, surrenderLoserRefundPercent: e.target.value })}
                      className={INPUT_SURFACE_CLASS}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الحد الأدنى من الحركات</Label>
                    <Input
                      type="number"
                      min="0"
                      max="50"
                      value={form.minMovesBeforeSurrender}
                      onChange={(e) => setForm({ ...form, minMovesBeforeSurrender: parseInt(e.target.value) || 0 })}
                      className={INPUT_SURFACE_CLASS}
                    />
                    <p className="text-[10px] text-muted-foreground">منع الاستسلام المبكر (مكافحة غسيل الأموال)</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <Label className="text-xs">السماح بالتعادل</Label>
                <Switch
                  checked={form.allowDraw}
                  onCheckedChange={(checked) => setForm({ ...form, allowDraw: checked })}
                />
              </div>
            </div>

            <Separator />

            {/* Timing Settings */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-blue-500" />
                إعدادات التوقيت
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">مهلة الدور (ثانية)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="600"
                    value={form.turnTimeoutSeconds}
                    onChange={(e) => setForm({ ...form, turnTimeoutSeconds: parseInt(e.target.value) || 120 })}
                    className={INPUT_SURFACE_CLASS}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">مهلة إعادة الاتصال (ثانية)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="300"
                    value={form.reconnectGraceSeconds}
                    onChange={(e) => setForm({ ...form, reconnectGraceSeconds: parseInt(e.target.value) || 60 })}
                    className={INPUT_SURFACE_CLASS}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">انتهاء التحدي (دقيقة)</Label>
                  <Input
                    type="number"
                    min="5"
                    max="1440"
                    value={form.challengeExpiryMinutes}
                    onChange={(e) => setForm({ ...form, challengeExpiryMinutes: parseInt(e.target.value) || 30 })}
                    className={INPUT_SURFACE_CLASS}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Security Settings */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-orange-500" />
                إعدادات الأمان
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">الحد الأقصى للتحديات المتزامنة</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={form.maxConcurrentChallenges}
                    onChange={(e) => setForm({ ...form, maxConcurrentChallenges: parseInt(e.target.value) || 3 })}
                    className={INPUT_SURFACE_CLASS}
                  />
                  <p className="text-[10px] text-muted-foreground">منع استنزاف الرصيد</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الحد الأقصى للمشاهدين</Label>
                  <Input
                    type="number"
                    min="0"
                    max="1000"
                    value={form.maxSpectators}
                    onChange={(e) => setForm({ ...form, maxSpectators: parseInt(e.target.value) || 100 })}
                    className={INPUT_SURFACE_CLASS}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <Label className="text-xs">السماح بالمشاهدين</Label>
                <Switch
                  checked={form.allowSpectators}
                  onCheckedChange={(checked) => setForm({ ...form, allowSpectators: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button className={BUTTON_3D_CLASS} onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button className={BUTTON_3D_PRIMARY_CLASS} onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حفظ الإعدادات
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminChallengeSettingsPage() {
  const { toast } = useToast();
  const [editingSettings, setEditingSettings] = useState<ChallengeSettings | null>(null);
  const [sam9Mode, setSam9Mode] = useState<"competitive" | "friendly_fixed_fee">("competitive");
  const [sam9FixedFee, setSam9FixedFee] = useState("0.00");

  const { data: settingsList, isLoading } = useQuery<ChallengeSettings[]>({
    queryKey: ["/api/admin/challenge-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/challenge-settings", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: sam9Settings, isLoading: sam9Loading } = useQuery<Sam9SoloSettings>({
    queryKey: ["/api/admin/challenge-settings/sam9-solo"],
    queryFn: async () => {
      const res = await fetch("/api/admin/challenge-settings/sam9-solo", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch SAM9 settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (!sam9Settings) return;
    setSam9Mode(sam9Settings.mode);
    setSam9FixedFee(sam9Settings.fixedFee);
  }, [sam9Settings]);

  const saveSam9SettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/challenge-settings/sam9-solo", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify({
          mode: sam9Mode,
          fixedFee: sam9FixedFee,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update SAM9 settings");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-settings/sam9-solo"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات اللعب الفردي SAM9 بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const gameTypeNames: Record<string, string> = {
    chess: "شطرنج ♟",
    backgammon: "طاولة 🎲",
    domino: "دومينو 🁡",
    tarneeb: "طرنيب ♠",
    baloot: "بلوت ♦",
    languageduel: "تحدي اللغات 🌍",
  };

  const defaultGameTypes = ["chess", "backgammon", "domino", "tarneeb", "baloot", "languageduel"];

  const getGameTypeOrder = (gameType: string) => {
    const index = defaultGameTypes.indexOf(gameType);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  // Ensure all game types appear (auto-create on first fetch)
  const initMutation = useMutation({
    mutationFn: async (gameType: string) => {
      const res = await fetch(`/api/admin/challenge-settings/${gameType}`, {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-settings"] });
    },
  });

  // Initialize all game types if they don't exist
  const handleInitAll = async () => {
    for (const gt of defaultGameTypes) {
      await initMutation.mutateAsync(gt);
    }
    toast({ title: "تم", description: "تم تهيئة إعدادات جميع الألعاب" });
  };

  const orderedSettingsList = [...(settingsList || [])].sort((left, right) => getGameTypeOrder(left.gameType) - getGameTypeOrder(right.gameType));
  const enabledCount = orderedSettingsList.filter((settings) => settings.isEnabled).length;
  const surrenderEnabledCount = orderedSettingsList.filter((settings) => settings.allowSurrender).length;
  const spectatorsEnabledCount = orderedSettingsList.filter((settings) => settings.allowSpectators).length;
  const disabledCount = orderedSettingsList.filter((settings) => !settings.isEnabled).length;

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6" dir="rtl">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Swords className="h-7 w-7" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                إعدادات التحديات
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                تحكم بالعمولة والاستسلام والأمان لكل نوع لعبة
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className={BUTTON_3D_CLASS}
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-settings"] })}
            >
              <RefreshCw className="h-4 w-4 ml-1" />
              تحديث
            </Button>
            {(!settingsList || settingsList.length < defaultGameTypes.length) && (
              <Button className={BUTTON_3D_PRIMARY_CLASS} onClick={handleInitAll}>
                تهيئة جميع الألعاب
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{enabledCount}</div>
              <div className="text-xs text-muted-foreground">ألعاب مُفعّلة</div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{surrenderEnabledCount}</div>
              <div className="text-xs text-muted-foreground">تسمح بالاستسلام</div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{spectatorsEnabledCount}</div>
              <div className="text-xs text-muted-foreground">تسمح بالمشاهدين</div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{disabledCount}</div>
              <div className="text-xs text-muted-foreground">ألعاب مُعطّلة</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={DATA_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="text-lg">إعدادات اللعب الفردي مع SAM9</CardTitle>
          <CardDescription>
            اختر بين وضع تنافسي عادي أو وضع ودي برسوم ثابتة تخصم مرة واحدة عند إنشاء التحدي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              type="button"
              className={sam9Mode === "competitive" ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS}
              onClick={() => setSam9Mode("competitive")}
              disabled={sam9Loading || saveSam9SettingsMutation.isPending}
            >
              وضع تنافسي
            </Button>
            <Button
              type="button"
              className={sam9Mode === "friendly_fixed_fee" ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS}
              onClick={() => setSam9Mode("friendly_fixed_fee")}
              disabled={sam9Loading || saveSam9SettingsMutation.isPending}
            >
              وضع ودي برسوم ثابتة
            </Button>
          </div>

          <div className="space-y-1.5 max-w-sm">
            <Label className="text-sm">الرسوم الثابتة (تطبق في الوضع الودي فقط)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={sam9FixedFee}
              onChange={(e) => setSam9FixedFee(e.target.value)}
              disabled={sam9Loading || saveSam9SettingsMutation.isPending || sam9Mode !== "friendly_fixed_fee"}
              className={INPUT_SURFACE_CLASS}
            />
            <p className="text-xs text-muted-foreground">
              في الوضع الودي: يخصم هذا المبلغ من المستخدم عند إنشاء التحدي، بدون خصومات/أرباح إضافية عند النهاية.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              className={BUTTON_3D_PRIMARY_CLASS}
              onClick={() => saveSam9SettingsMutation.mutate()}
              disabled={sam9Loading || saveSam9SettingsMutation.isPending}
            >
              {saveSam9SettingsMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حفظ إعدادات SAM9
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Table */}
      <Card className={DATA_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="text-lg">إعدادات كل لعبة</CardTitle>
          <CardDescription>اضغط على تعديل لتغيير الإعدادات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:hidden">
            {orderedSettingsList.length > 0 ? (
              orderedSettingsList.map((s) => (
                <div key={s.id} className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{gameTypeNames[s.gameType] || s.gameType}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.isEnabled ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            مُفعّل
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
                            <Ban className="h-3 w-3 ml-1" />
                            مُعطّل
                          </Badge>
                        )}
                        <Badge variant="outline">{s.allowSurrender ? "استسلام مفعّل" : "استسلام مغلق"}</Badge>
                      </div>
                    </div>
                    <Button className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`} onClick={() => setEditingSettings(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">العمولة</p>
                      <p className="mt-2 font-semibold text-green-600">{s.commissionPercent}%</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">الرهان</p>
                      <p className="mt-2 font-semibold">${parseFloat(s.minStake).toFixed(2)} - {parseFloat(s.maxStake) > 0 ? `$${parseFloat(s.maxStake).toFixed(2)}` : "∞"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">مهلة الدور</p>
                      <p className="mt-2 font-semibold">{s.turnTimeoutSeconds}s</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">تحديات متزامنة</p>
                      <p className="mt-2 font-semibold">{s.maxConcurrentChallenges}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground dark:border-slate-700">
                لا توجد إعدادات. اضغط "تهيئة جميع الألعاب" لإنشاء الإعدادات الافتراضية.
              </div>
            )}
          </div>

          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اللعبة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">العمولة</TableHead>
                  <TableHead className="text-center">الاستسلام</TableHead>
                  <TableHead className="text-center">الفائز/الخاسر</TableHead>
                  <TableHead className="text-center">الحد الأدنى</TableHead>
                  <TableHead className="text-center">الحد الأقصى</TableHead>
                  <TableHead className="text-center">مهلة الدور</TableHead>
                  <TableHead className="text-center">تحديات متزامنة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedSettingsList.length > 0 ? (
                  orderedSettingsList.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {gameTypeNames[s.gameType] || s.gameType}
                      </TableCell>
                      <TableCell className="text-center">
                        {s.isEnabled ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            مُفعّل
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
                            <Ban className="h-3 w-3 ml-1" />
                            مُعطّل
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-green-600">
                        {s.commissionPercent}%
                      </TableCell>
                      <TableCell className="text-center">
                        {s.allowSurrender ? (
                          <Badge variant="outline" className="text-xs">✓ مسموح</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-red-400">✗ ممنوع</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {s.surrenderWinnerPercent}% / {s.surrenderLoserRefundPercent}%
                      </TableCell>
                      <TableCell className="text-center">
                        ${parseFloat(s.minStake).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {parseFloat(s.maxStake) > 0 ? `$${parseFloat(s.maxStake).toFixed(2)}` : "∞"}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {s.turnTimeoutSeconds}s
                      </TableCell>
                      <TableCell className="text-center">
                        {s.maxConcurrentChallenges}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingSettings(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      لا توجد إعدادات. اضغط "تهيئة جميع الألعاب" لإنشاء الإعدادات الافتراضية.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Security Info Card */}
      <Card className={`${DATA_CARD_CLASS} border-orange-500/20 bg-orange-50/5`}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
            <Shield className="h-4 w-4" />
            ملاحظات أمنية
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• <strong>العمولة</strong>: تُخصم تلقائياً من مجموع الرهان قبل الدفع للفائز</p>
          <p>• <strong>الحد الأدنى من الحركات</strong>: يمنع الاستسلام الفوري (مكافحة غسيل الأموال)</p>
          <p>• <strong>التحديات المتزامنة</strong>: يمنع استنزاف الرصيد بإنشاء تحديات متعددة</p>
          <p>• <strong>غرامة الانسحاب = 0%</strong>: استرداد كامل لإلغاء تحدي لم ينضم إليه أحد</p>
          <p>• <strong>نسبة الاستسلام 70/30</strong>: الفائز يحصل على 70% والخاسر يسترد 30% (بعد العمولة)</p>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editingSettings && (
        <EditSettingsDialog
          settings={editingSettings}
          open={!!editingSettings}
          onOpenChange={(open) => !open && setEditingSettings(null)}
        />
      )}
    </div>
  );
}
