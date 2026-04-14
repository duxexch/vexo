import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  CheckCircle2,
  Plus,
  Pencil,
  RefreshCw,
  Users,
  Settings2,
  Loader2,
  Percent,
  DollarSign,
  Zap,
  Scale,
  Trophy,
  TrendingUp,
  Flame,
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

const supportSettingsSchema = z.object({
  gameType: z.string().min(1, "نوع اللعبة مطلوب"),
  isEnabled: z.boolean(),
  oddsMode: z.enum(["automatic", "manual"]),
  defaultOddsPlayer1: z.string().min(1, "احتمالات اللاعب 1 مطلوبة"),
  defaultOddsPlayer2: z.string().min(1, "احتمالات اللاعب 2 مطلوبة"),
  minSupportAmount: z.string().min(1, "الحد الأدنى للدعم مطلوب"),
  maxSupportAmount: z.string().min(1, "الحد الأقصى للدعم مطلوب"),
  houseFeePercent: z.string().min(1, "نسبة رسوم المنصة مطلوبة"),
  allowInstantMatch: z.boolean(),
  instantMatchOdds: z.string(),
  winRateWeight: z.number().min(0).max(1),
  experienceWeight: z.number().min(0).max(1),
  streakWeight: z.number().min(0).max(1),
}).refine((data) => {
  const sum = data.winRateWeight + data.experienceWeight + data.streakWeight;
  return Math.abs(sum - 1.0) < 0.01;
}, {
  message: "مجموع الأوزان يجب أن يساوي 1.0",
  path: ["winRateWeight"],
});

type SupportSettingsFormData = z.infer<typeof supportSettingsSchema>;

interface SupportSettings {
  id: string;
  gameType: string;
  isEnabled: boolean;
  oddsMode: "automatic" | "manual";
  defaultOddsPlayer1: string;
  defaultOddsPlayer2: string;
  minSupportAmount: string;
  maxSupportAmount: string;
  houseFeePercent: string;
  allowInstantMatch: boolean;
  instantMatchOdds: string;
  winRateWeight: number;
  experienceWeight: number;
  streakWeight: number;
  createdAt: string;
  updatedAt: string;
}

function SupportSettingsForm({
  settings,
  onSuccess,
  onClose,
}: {
  settings?: SupportSettings;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!settings;

  const form = useForm<SupportSettingsFormData>({
    resolver: zodResolver(supportSettingsSchema),
    defaultValues: {
      gameType: settings?.gameType || "",
      isEnabled: settings?.isEnabled ?? true,
      oddsMode: settings?.oddsMode || "automatic",
      defaultOddsPlayer1: settings?.defaultOddsPlayer1 || "1.80",
      defaultOddsPlayer2: settings?.defaultOddsPlayer2 || "2.00",
      minSupportAmount: settings?.minSupportAmount || "10.00",
      maxSupportAmount: settings?.maxSupportAmount || "1000.00",
      houseFeePercent: settings?.houseFeePercent || "5.00",
      allowInstantMatch: settings?.allowInstantMatch ?? false,
      instantMatchOdds: settings?.instantMatchOdds || "1.90",
      winRateWeight: settings?.winRateWeight ?? 0.5,
      experienceWeight: settings?.experienceWeight ?? 0.3,
      streakWeight: settings?.streakWeight ?? 0.2,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: SupportSettingsFormData) => {
      const res = await fetch("/api/admin/support-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل في إنشاء الإعدادات");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] });
      toast({ title: "تم إنشاء الإعدادات بنجاح" });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SupportSettingsFormData) => {
      const res = await fetch(`/api/admin/support-settings/${settings?.gameType}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل في تحديث الإعدادات");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] });
      toast({ title: "تم تحديث الإعدادات بنجاح" });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: SupportSettingsFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const oddsMode = form.watch("oddsMode");

  const totalWeight = form.watch("winRateWeight") + form.watch("experienceWeight") + form.watch("streakWeight");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[72vh] overflow-y-auto px-1 pb-1">
        <FormField
          control={form.control}
          name="gameType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>نوع اللعبة / Game Type</FormLabel>
              <FormControl>
                <Input
                  placeholder="مثال: chess, backgammon, domino"
                  {...field}
                  disabled={isEditing}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-game-type"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          <FormField
            control={form.control}
            name="isEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormLabel>تفعيل الدعم / Enable Support</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-enabled"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Tabs value={oddsMode} onValueChange={(value) => form.setValue("oddsMode", value as "automatic" | "manual")} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
            <TabsTrigger
              value="automatic"
              className="rounded-2xl"
              data-testid="tab-automatic"
            >
              الوضع التلقائي
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="rounded-2xl"
              data-testid="tab-manual"
            >
              الوضع اليدوي
            </TabsTrigger>
          </TabsList>

          <TabsContent value="automatic" className="space-y-4 pt-4">
            <Card className={DATA_CARD_CLASS}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  أوزان الخوارزمية / Algorithm Weights
                </CardTitle>
                <CardDescription>
                  يجب أن يساوي المجموع 1.0 - الحالي: {totalWeight.toFixed(2)}
                  <Badge variant={Math.abs(totalWeight - 1.0) < 0.01 ? "default" : "destructive"} className="ms-2">
                    {Math.abs(totalWeight - 1.0) < 0.01 ? "صحيح ✓" : "غير صحيح ✗"}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="winRateWeight"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                          وزن معدل الفوز / Win Rate
                        </FormLabel>
                        <span className="text-sm font-medium">{field.value.toFixed(2)}</span>
                      </div>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={0}
                          max={1}
                          step={0.05}
                          data-testid="slider-win-rate"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="experienceWeight"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-500" />
                          وزن الخبرة / Experience
                        </FormLabel>
                        <span className="text-sm font-medium">{field.value.toFixed(2)}</span>
                      </div>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={0}
                          max={1}
                          step={0.05}
                          data-testid="slider-experience"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="streakWeight"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <Flame className="h-4 w-4 text-orange-500" />
                          وزن السلسلة / Streak
                        </FormLabel>
                        <span className="text-sm font-medium">{field.value.toFixed(2)}</span>
                      </div>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={0}
                          max={1}
                          step={0.05}
                          data-testid="slider-streak"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="defaultOddsPlayer1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>احتمالات اللاعب 1 / Player 1 Odds</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="1.80"
                        {...field}
                        className={INPUT_SURFACE_CLASS}
                        data-testid="input-odds-player1"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultOddsPlayer2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>احتمالات اللاعب 2 / Player 2 Odds</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="2.00"
                        {...field}
                        className={INPUT_SURFACE_CLASS}
                        data-testid="input-odds-player2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="minSupportAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  الحد الأدنى / Min Amount
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="10.00"
                    {...field}
                    className={INPUT_SURFACE_CLASS}
                    data-testid="input-min-amount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxSupportAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  الحد الأقصى / Max Amount
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="1000.00"
                    {...field}
                    className={INPUT_SURFACE_CLASS}
                    data-testid="input-max-amount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="houseFeePercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                نسبة رسوم المنصة / House Fee (%)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="5.00"
                  {...field}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-house-fee"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Card className={DATA_CARD_CLASS}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              المطابقة الفورية / Instant Match
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="allowInstantMatch"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <FormLabel>السماح بالمطابقة الفورية</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-instant-match"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch("allowInstantMatch") && (
              <FormField
                control={form.control}
                name="instantMatchOdds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>احتمالات المطابقة الفورية / Instant Match Odds</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="1.90"
                        {...field}
                        className={INPUT_SURFACE_CLASS}
                        data-testid="input-instant-odds"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button type="button" className={BUTTON_3D_CLASS} onClick={onClose}>
            إلغاء / Cancel
          </Button>
          <Button type="submit" className={BUTTON_3D_PRIMARY_CLASS} disabled={isSubmitting} data-testid="button-submit-settings">
            {isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {isEditing ? "تحديث / Update" : "إنشاء / Create"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function SettingsCard({ settings }: { settings: SupportSettings }) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <Card className={DATA_CARD_CLASS}>
      <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{settings.gameType}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={settings.isEnabled ? "default" : "secondary"}>
                {settings.isEnabled ? "مفعّل" : "معطّل"}
              </Badge>
              <Badge variant="outline">
                {settings.oddsMode === "automatic" ? "تلقائي" : "يدوي"}
              </Badge>
            </div>
          </div>
        </div>
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogTrigger asChild>
            <Button className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`} data-testid={`button-edit-${settings.gameType}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className={`${DIALOG_SURFACE_CLASS} sm:max-w-3xl`}>
            <div className="space-y-4 p-5 sm:p-6">
              <DialogHeader>
                <DialogTitle>تعديل إعدادات الدعم - {settings.gameType}</DialogTitle>
              </DialogHeader>
              <SupportSettingsForm
                settings={settings}
                onSuccess={() => setIsEditOpen(false)}
                onClose={() => setIsEditOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <span className="text-muted-foreground">الحد الأدنى</span>
            <p className="mt-2 font-medium">${settings.minSupportAmount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <span className="text-muted-foreground">الحد الأقصى</span>
            <p className="mt-2 font-medium">${settings.maxSupportAmount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <span className="text-muted-foreground">رسوم المنصة</span>
            <p className="mt-2 font-medium">{settings.houseFeePercent}%</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <span className="text-muted-foreground">المطابقة الفورية</span>
            <p className="mt-2 font-medium">{settings.allowInstantMatch ? "نعم" : "لا"}</p>
          </div>
        </div>

        {settings.oddsMode === "manual" && (
          <div className="grid gap-4 border-t pt-4 text-sm md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-muted-foreground">احتمالات اللاعب 1</span>
              <p className="mt-2 font-medium">{settings.defaultOddsPlayer1}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-muted-foreground">احتمالات اللاعب 2</span>
              <p className="mt-2 font-medium">{settings.defaultOddsPlayer2}</p>
            </div>
          </div>
        )}

        {settings.oddsMode === "automatic" && (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-sm text-muted-foreground mb-2">أوزان الخوارزمية:</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline" className="gap-1">
                <Trophy className="h-3 w-3 text-yellow-500" />
                فوز: {(settings.winRateWeight * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="h-3 w-3 text-blue-500" />
                خبرة: {(settings.experienceWeight * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Flame className="h-3 w-3 text-orange-500" />
                سلسلة: {(settings.streakWeight * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSupportSettingsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: settingsList, isLoading, isError, error } = useQuery<SupportSettings[]>({
    queryKey: ["/api/admin/support-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/support-settings", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("فشل في جلب الإعدادات");
      return res.json();
    },
  });

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

  if (isError) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <Card className={`${DATA_CARD_CLASS} border-destructive`}>
          <CardContent className="pt-6">
            <p className="text-destructive">خطأ: {(error as Error).message}</p>
            <Button
              className={`${BUTTON_3D_CLASS} mt-4`}
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] })}
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedSettingsList = [...(settingsList || [])].sort((left, right) => left.gameType.localeCompare(right.gameType));
  const enabledCount = sortedSettingsList.filter((settings) => settings.isEnabled).length;
  const automaticCount = sortedSettingsList.filter((settings) => settings.oddsMode === "automatic").length;
  const instantMatchCount = sortedSettingsList.filter((settings) => settings.allowInstantMatch).length;

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                إعدادات الدعم - ادعم واربح
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                إدارة إعدادات دعم المتفرجين لكل نوع لعبة
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className={BUTTON_3D_CLASS}
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] })}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 me-2" />
              تحديث
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className={BUTTON_3D_PRIMARY_CLASS} data-testid="button-create-settings">
                  <Plus className="h-4 w-4 me-2" />
                  إضافة إعدادات جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className={`${DIALOG_SURFACE_CLASS} sm:max-w-3xl`}>
                <div className="space-y-4 p-5 sm:p-6">
                  <DialogHeader>
                    <DialogTitle>إضافة إعدادات دعم جديدة</DialogTitle>
                  </DialogHeader>
                  <SupportSettingsForm
                    onSuccess={() => setIsCreateOpen(false)}
                    onClose={() => setIsCreateOpen(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">إجمالي الأنماط</p>
              <p className="mt-1 text-2xl font-bold">{sortedSettingsList.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">إعدادات مفعّلة</p>
              <p className="mt-1 text-2xl font-bold">{enabledCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">أوضاع تلقائية</p>
              <p className="mt-1 text-2xl font-bold">{automaticCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">مطابقة فورية</p>
              <p className="mt-1 text-2xl font-bold">{instantMatchCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {settingsList && settingsList.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedSettingsList.map((settings) => (
            <SettingsCard key={settings.id} settings={settings} />
          ))}
        </div>
      ) : (
        <Card className={DATA_CARD_CLASS}>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">لا توجد إعدادات</p>
            <p className="text-muted-foreground mb-4">ابدأ بإضافة إعدادات دعم لنوع لعبة</p>
            <Button className={BUTTON_3D_PRIMARY_CLASS} onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 me-2" />
              إضافة إعدادات جديدة
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
