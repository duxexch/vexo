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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            إعدادات تحديات {gameTypeNames[settings.gameType] || settings.gameType}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">عمولة المنصة (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="50"
                  value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
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
                />
                <p className="text-[10px] text-muted-foreground">غرامة إلغاء التحدي المنتظر (0 = استرداد كامل)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">الحد الأدنى للرهان ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minStake}
                  onChange={(e) => setForm({ ...form, minStake: e.target.value })}
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
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
              <Label className="text-xs">السماح بالاستسلام</Label>
              <Switch
                checked={form.allowSurrender}
                onCheckedChange={(checked) => setForm({ ...form, allowSurrender: checked })}
              />
            </div>
            {form.allowSurrender && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">نصيب الفائز (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={form.surrenderWinnerPercent}
                    onChange={(e) => setForm({ ...form, surrenderWinnerPercent: e.target.value })}
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
                  />
                  <p className="text-[10px] text-muted-foreground">منع الاستسلام المبكر (مكافحة غسيل الأموال)</p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">مهلة الدور (ثانية)</Label>
                <Input
                  type="number"
                  min="10"
                  max="600"
                  value={form.turnTimeoutSeconds}
                  onChange={(e) => setForm({ ...form, turnTimeoutSeconds: parseInt(e.target.value) || 120 })}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">الحد الأقصى للتحديات المتزامنة</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={form.maxConcurrentChallenges}
                  onChange={(e) => setForm({ ...form, maxConcurrentChallenges: parseInt(e.target.value) || 3 })}
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
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
              <Label className="text-xs">السماح بالمشاهدين</Label>
              <Switch
                checked={form.allowSpectators}
                onCheckedChange={(checked) => setForm({ ...form, allowSpectators: checked })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            حفظ الإعدادات
          </Button>
        </DialogFooter>
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            إعدادات التحديات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحكم بالعمولة والاستسلام والأمان لكل نوع لعبة
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-settings"] })}
          >
            <RefreshCw className="h-4 w-4 ml-1" />
            تحديث
          </Button>
          {(!settingsList || settingsList.length < defaultGameTypes.length) && (
            <Button size="sm" onClick={handleInitAll}>
              تهيئة جميع الألعاب
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {settingsList?.filter(s => s.isEnabled).length || 0}
            </div>
            <div className="text-xs text-muted-foreground">ألعاب مُفعّلة</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {settingsList?.[0] ? `${settingsList[0].commissionPercent}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">عمولة افتراضية</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {settingsList?.filter(s => s.allowSurrender).length || 0}
            </div>
            <div className="text-xs text-muted-foreground">تسمح بالاستسلام</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {settingsList?.filter(s => !s.isEnabled).length || 0}
            </div>
            <div className="text-xs text-muted-foreground">ألعاب مُعطّلة</div>
          </CardContent>
        </Card>
      </div>

      <Card>
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
              variant={sam9Mode === "competitive" ? "default" : "outline"}
              onClick={() => setSam9Mode("competitive")}
              disabled={sam9Loading || saveSam9SettingsMutation.isPending}
            >
              وضع تنافسي
            </Button>
            <Button
              type="button"
              variant={sam9Mode === "friendly_fixed_fee" ? "default" : "outline"}
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
            />
            <p className="text-xs text-muted-foreground">
              في الوضع الودي: يخصم هذا المبلغ من المستخدم عند إنشاء التحدي، بدون خصومات/أرباح إضافية عند النهاية.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">إعدادات كل لعبة</CardTitle>
          <CardDescription>اضغط على تعديل لتغيير الإعدادات</CardDescription>
        </CardHeader>
        <CardContent>
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
              {settingsList && settingsList.length > 0 ? (
                settingsList.map((s) => (
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
        </CardContent>
      </Card>

      {/* Security Info Card */}
      <Card className="border-orange-500/20 bg-orange-50/5">
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
