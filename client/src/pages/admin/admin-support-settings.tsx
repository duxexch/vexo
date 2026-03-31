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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const adminToken = () => localStorage.getItem("adminToken") || "";

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
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
                  data-testid="input-game-type" 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between">
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

        <Tabs defaultValue={oddsMode} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="automatic" 
              onClick={() => form.setValue("oddsMode", "automatic")}
              data-testid="tab-automatic"
            >
              الوضع التلقائي
            </TabsTrigger>
            <TabsTrigger 
              value="manual" 
              onClick={() => form.setValue("oddsMode", "manual")}
              data-testid="tab-manual"
            >
              الوضع اليدوي
            </TabsTrigger>
          </TabsList>

          <TabsContent value="automatic" className="space-y-4 pt-4">
            <Card>
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
            <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
                  data-testid="input-house-fee"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Card>
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
                <FormItem className="flex items-center justify-between">
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
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء / Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} data-testid="button-submit-settings">
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
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">{settings.gameType}</CardTitle>
          <Badge variant={settings.isEnabled ? "default" : "secondary"}>
            {settings.isEnabled ? "مفعّل" : "معطّل"}
          </Badge>
          <Badge variant="outline">
            {settings.oddsMode === "automatic" ? "تلقائي" : "يدوي"}
          </Badge>
        </div>
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-edit-${settings.gameType}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>تعديل إعدادات الدعم - {settings.gameType}</DialogTitle>
            </DialogHeader>
            <SupportSettingsForm
              settings={settings}
              onSuccess={() => setIsEditOpen(false)}
              onClose={() => setIsEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">الحد الأدنى</span>
            <p className="font-medium">${settings.minSupportAmount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">الحد الأقصى</span>
            <p className="font-medium">${settings.maxSupportAmount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">رسوم المنصة</span>
            <p className="font-medium">{settings.houseFeePercent}%</p>
          </div>
          <div>
            <span className="text-muted-foreground">المطابقة الفورية</span>
            <p className="font-medium">{settings.allowInstantMatch ? "نعم" : "لا"}</p>
          </div>
        </div>

        {settings.oddsMode === "manual" && (
          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <span className="text-muted-foreground">احتمالات اللاعب 1</span>
              <p className="font-medium">{settings.defaultOddsPlayer1}</p>
            </div>
            <div>
              <span className="text-muted-foreground">احتمالات اللاعب 2</span>
              <p className="font-medium">{settings.defaultOddsPlayer2}</p>
            </div>
          </div>
        )}

        {settings.oddsMode === "automatic" && (
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">أوزان الخوارزمية:</p>
            <div className="flex gap-4 text-sm">
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
  const { toast } = useToast();
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">خطأ: {(error as Error).message}</p>
            <Button 
              variant="outline" 
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] })}
              className="mt-4"
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            إعدادات الدعم - ادعم واربح
          </h1>
          <p className="text-muted-foreground">
            إدارة إعدادات دعم المتفرجين لكل نوع لعبة
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/support-settings"] })}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 me-2" />
            تحديث
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-settings">
                <Plus className="h-4 w-4 me-2" />
                إضافة إعدادات جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>إضافة إعدادات دعم جديدة</DialogTitle>
              </DialogHeader>
              <SupportSettingsForm
                onSuccess={() => setIsCreateOpen(false)}
                onClose={() => setIsCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {settingsList && settingsList.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {settingsList.map((settings) => (
            <SettingsCard key={settings.id} settings={settings} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">لا توجد إعدادات</p>
            <p className="text-muted-foreground mb-4">ابدأ بإضافة إعدادات دعم لنوع لعبة</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 me-2" />
              إضافة إعدادات جديدة
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
