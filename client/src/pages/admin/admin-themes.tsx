import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Palette, Save, Loader2, Star, CheckCircle2, Eye } from "lucide-react";
import {
  applyAdminTheme,
  clearAdminTheme,
  type AdminTheme,
} from "@/lib/theme";

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
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

const FONT_CHOICES = [
  "Poppins",
  "Inter",
  "Tajawal",
  "Cairo",
  "Roboto",
  "IBM Plex Sans",
  "Noto Sans Arabic",
];

const SHADOW_CHOICES = [
  { value: "soft", labelEn: "Soft", labelAr: "خفيف" },
  { value: "medium", labelEn: "Medium", labelAr: "متوسط" },
  { value: "strong", labelEn: "Strong", labelAr: "قوي" },
];

const RADIUS_CHOICES = [
  "0.125rem",
  "0.25rem",
  "0.375rem",
  "0.5rem",
  "0.625rem",
  "0.75rem",
  "0.875rem",
  "1rem",
  "1.25rem",
  "1.5rem",
];

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          dir="ltr"
          className="font-mono"
          data-testid={`input-${id}`}
        />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
          aria-label={label}
        />
      </div>
    </div>
  );
}

interface ThemeMiniSwatchProps {
  theme: AdminTheme;
}

function ThemeMiniSwatch({ theme }: ThemeMiniSwatchProps) {
  const swatches = [
    theme.primaryColor,
    theme.secondaryColor,
    theme.accentColor,
    theme.backgroundColor,
    theme.cardColor,
    theme.borderColor,
  ];
  return (
    <div className="flex items-center gap-1.5">
      {swatches.map((color, idx) => (
        <span
          key={idx}
          className="block h-6 w-6 rounded-md border border-black/10 shadow-sm"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface ThemePreviewProps {
  theme: AdminTheme;
  isArabic: boolean;
}

function ThemePreview({ theme, isArabic }: ThemePreviewProps) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-md transition"
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.foregroundColor,
        borderColor: theme.borderColor,
        fontFamily: theme.fontBody ? `'${theme.fontBody}', sans-serif` : undefined,
        borderRadius: theme.radiusLg ?? undefined,
      }}
    >
      <h3
        className="text-lg font-bold"
        style={{
          color: theme.foregroundColor,
          fontFamily: theme.fontHeading ? `'${theme.fontHeading}', sans-serif` : undefined,
        }}
      >
        {theme.displayName}
      </h3>
      <p className="mt-1 text-sm" style={{ color: theme.mutedColor }}>
        {isArabic ? "معاينة حيّة لكل العناصر" : "Live preview of all elements"}
      </p>

      <div
        className="mt-4 rounded-xl p-4"
        style={{
          backgroundColor: theme.cardColor,
          borderColor: theme.borderColor,
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: theme.radiusMd ?? undefined,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-semibold shadow"
            style={{
              backgroundColor: theme.primaryColor,
              color: "#fff",
              borderRadius: theme.radiusSm ?? undefined,
            }}
          >
            {isArabic ? "زر أساسي" : "Primary"}
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-semibold shadow"
            style={{
              backgroundColor: theme.secondaryColor,
              color: "#fff",
              borderRadius: theme.radiusSm ?? undefined,
            }}
          >
            {isArabic ? "زر ثانوي" : "Secondary"}
          </button>
          <span
            className="px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: theme.accentColor,
              color: "#fff",
              borderRadius: theme.radiusSm ?? undefined,
            }}
          >
            {isArabic ? "تمييز" : "Accent"}
          </span>
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-semibold shadow"
            style={{
              backgroundColor: theme.destructiveColor || "#ef4444",
              color: "#fff",
              borderRadius: theme.radiusSm ?? undefined,
            }}
          >
            {isArabic ? "حذف" : "Delete"}
          </button>
        </div>
        <p className="mt-3 text-sm" style={{ color: theme.foregroundColor }}>
          {isArabic
            ? "يمكنك تعديل كل لون وخط ونصف قطر ومستوى ظل بشكل مباشر."
            : "Every color, font, radius and shadow level is editable in real time."}
        </p>
      </div>
    </div>
  );
}

interface ThemeEditorProps {
  open: boolean;
  theme: AdminTheme | null;
  onClose: () => void;
  onSaved: (saved: AdminTheme) => void;
}

function ThemeEditor({ open, theme, onClose, onSaved }: ThemeEditorProps) {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";
  const [draft, setDraft] = useState<AdminTheme | null>(theme);

  useEffect(() => {
    setDraft(theme);
  }, [theme]);

  const update = <K extends keyof AdminTheme>(key: K, value: AdminTheme[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: AdminTheme) => {
      const { id, name, isDefault, ...editable } = payload;
      return adminFetch(`/api/admin/themes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(editable),
      });
    },
    onSuccess: (saved: AdminTheme) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/themes"] });
      toast({
        title: isArabic ? "تم الحفظ" : "Saved",
        description: isArabic ? "تم تحديث الثيم" : "Theme updated",
      });
      // Pass the *server response* back so the parent reapplies the freshly
      // saved values (avoids using a stale pre-edit copy of `editing`).
      onSaved(saved);
      onClose();
    },
    onError: (error: unknown) => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description:
          error instanceof Error
            ? error.message
            : isArabic
              ? "فشل حفظ الثيم"
              : "Failed to save theme",
        variant: "destructive",
      });
    },
  });

  const handlePreviewLive = () => {
    if (draft) applyAdminTheme(draft);
  };

  const handleResetPreview = async () => {
    clearAdminTheme();
    try {
      const res = await fetch("/api/themes/active");
      if (res.ok) {
        const active = (await res.json()) as AdminTheme;
        applyAdminTheme(active);
      }
    } catch {
      // best-effort restore — leaving cleared vars falls back to index.css
    }
  };

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {isArabic ? "تعديل الثيم: " : "Edit theme: "} {draft.displayName}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "كل تعديل يُعرَض فورًا في المعاينة الحيّة على اليمين."
              : "Each tweak is reflected instantly in the live preview on the right."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isArabic ? "الاسم" : "Name"}
              </h3>
              <Input
                value={draft.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                data-testid="input-display-name"
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isArabic ? "الألوان" : "Colors"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorField
                  id="primaryColor"
                  label={isArabic ? "اللون الأساسي" : "Primary"}
                  value={draft.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                />
                <ColorField
                  id="secondaryColor"
                  label={isArabic ? "اللون الثانوي" : "Secondary"}
                  value={draft.secondaryColor}
                  onChange={(v) => update("secondaryColor", v)}
                />
                <ColorField
                  id="accentColor"
                  label={isArabic ? "لون التمييز" : "Accent"}
                  value={draft.accentColor}
                  onChange={(v) => update("accentColor", v)}
                />
                <ColorField
                  id="backgroundColor"
                  label={isArabic ? "الخلفية" : "Background"}
                  value={draft.backgroundColor}
                  onChange={(v) => update("backgroundColor", v)}
                />
                <ColorField
                  id="foregroundColor"
                  label={isArabic ? "النص" : "Foreground"}
                  value={draft.foregroundColor}
                  onChange={(v) => update("foregroundColor", v)}
                />
                <ColorField
                  id="cardColor"
                  label={isArabic ? "البطاقات" : "Card"}
                  value={draft.cardColor}
                  onChange={(v) => update("cardColor", v)}
                />
                <ColorField
                  id="mutedColor"
                  label={isArabic ? "نص خافت" : "Muted"}
                  value={draft.mutedColor}
                  onChange={(v) => update("mutedColor", v)}
                />
                <ColorField
                  id="borderColor"
                  label={isArabic ? "الحدود" : "Border"}
                  value={draft.borderColor}
                  onChange={(v) => update("borderColor", v)}
                />
                <ColorField
                  id="destructiveColor"
                  label={isArabic ? "الإجراءات الخطرة" : "Destructive"}
                  value={draft.destructiveColor || "#ef4444"}
                  onChange={(v) => update("destructiveColor", v)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isArabic ? "الخطوط" : "Fonts"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isArabic ? "خط العناوين" : "Heading font"}</Label>
                  <Select
                    value={draft.fontHeading || "Poppins"}
                    onValueChange={(v) => update("fontHeading", v)}
                  >
                    <SelectTrigger data-testid="select-font-heading">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_CHOICES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "خط النص" : "Body font"}</Label>
                  <Select
                    value={draft.fontBody || "Poppins"}
                    onValueChange={(v) => update("fontBody", v)}
                  >
                    <SelectTrigger data-testid="select-font-body">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_CHOICES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isArabic ? "الأبعاد والظلال" : "Dimensions & Shadows"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{isArabic ? "نصف قطر صغير" : "Radius sm"}</Label>
                  <Select
                    value={draft.radiusSm || "0.25rem"}
                    onValueChange={(v) => update("radiusSm", v)}
                  >
                    <SelectTrigger data-testid="select-radius-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RADIUS_CHOICES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "نصف قطر متوسط" : "Radius md"}</Label>
                  <Select
                    value={draft.radiusMd || "0.5rem"}
                    onValueChange={(v) => update("radiusMd", v)}
                  >
                    <SelectTrigger data-testid="select-radius-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RADIUS_CHOICES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "نصف قطر كبير" : "Radius lg"}</Label>
                  <Select
                    value={draft.radiusLg || "0.75rem"}
                    onValueChange={(v) => update("radiusLg", v)}
                  >
                    <SelectTrigger data-testid="select-radius-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RADIUS_CHOICES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isArabic ? "شدة الظلال" : "Shadow intensity"}</Label>
                  <Select
                    value={draft.shadowIntensity || "medium"}
                    onValueChange={(v) => update("shadowIntensity", v)}
                  >
                    <SelectTrigger data-testid="select-shadow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHADOW_CHOICES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {isArabic ? s.labelAr : s.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "الوضع" : "Mode"}</Label>
                  <Select
                    value={draft.mode || "dark"}
                    onValueChange={(v) => update("mode", v)}
                  >
                    <SelectTrigger data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">{isArabic ? "داكن" : "Dark"}</SelectItem>
                      <SelectItem value="light">{isArabic ? "فاتح" : "Light"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {isArabic ? "المعاينة" : "Preview"}
            </h3>
            <ThemePreview theme={draft} isArabic={isArabic} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviewLive}
                data-testid="button-preview-live"
              >
                <Eye className="h-4 w-4 me-2" />
                {isArabic ? "تطبيق على الصفحة الآن" : "Apply to page now"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetPreview}
              >
                {isArabic ? "إلغاء المعاينة" : "Reset preview"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel-edit"
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => draft && saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            data-testid="button-save-theme"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <Save className="h-4 w-4 me-2" />
            )}
            {isArabic ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminThemesPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";
  const [editing, setEditing] = useState<AdminTheme | null>(null);

  const { data: themes, isLoading } = useQuery<AdminTheme[]>({
    queryKey: ["/api/admin/themes"],
    queryFn: () => adminFetch("/api/admin/themes"),
  });

  const sortedThemes = useMemo(() => {
    if (!themes) return [];
    return [...themes].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [themes]);

  const activateMutation = useMutation({
    mutationFn: async (id: string) =>
      adminFetch(`/api/admin/themes/${id}/activate`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/themes"] });
      toast({
        title: isArabic ? "تم التفعيل" : "Activated",
        description: isArabic
          ? "تم تعيين الثيم كافتراضي. سيظهر للمستخدمين بعد إعادة تحميل الصفحة."
          : "Theme set as default. Users will see it after a page reload.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description:
          error instanceof Error
            ? error.message
            : isArabic
              ? "فشل تفعيل الثيم"
              : "Failed to activate theme",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 md:space-y-6" data-testid="admin-themes-page">
      <div className="rounded-2xl border bg-card px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-400 to-violet-700 text-white shadow-lg">
            <Palette className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {isArabic ? "ثيمات المشروع" : "App Themes"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {isArabic
                ? "أربع ثيمات قابلة للتعديل بالكامل — اختر الافتراضي ليظهر لكل المستخدمين."
                : "Four fully-editable theme presets — pick the default that all users will see."}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sortedThemes.map((theme) => (
            <Card
              key={theme.id}
              className="overflow-hidden transition hover:shadow-lg"
              data-testid={`card-theme-${theme.name}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{theme.displayName}</CardTitle>
                    <CardDescription className="text-xs">{theme.name}</CardDescription>
                  </div>
                  {theme.isDefault && (
                    <Badge variant="default" className="gap-1">
                      <Star className="h-3 w-3" />
                      {isArabic ? "افتراضي" : "Default"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className="rounded-lg border p-3"
                  style={{
                    backgroundColor: theme.backgroundColor,
                    borderColor: theme.borderColor,
                  }}
                >
                  <ThemeMiniSwatch theme={theme} />
                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className="text-xs"
                      style={{ color: theme.foregroundColor }}
                    >
                      {theme.mode === "light"
                        ? isArabic
                          ? "وضع فاتح"
                          : "Light mode"
                        : isArabic
                          ? "وضع داكن"
                          : "Dark mode"}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: theme.primaryColor,
                        color: "#fff",
                      }}
                    >
                      {theme.shadowIntensity || "medium"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setEditing(theme)}
                    data-testid={`button-edit-${theme.name}`}
                  >
                    <Palette className="h-4 w-4 me-2" />
                    {isArabic ? "تعديل" : "Edit"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    disabled={theme.isDefault || activateMutation.isPending}
                    onClick={() => activateMutation.mutate(theme.id)}
                    data-testid={`button-activate-${theme.name}`}
                  >
                    {theme.isDefault ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 me-2" />
                        {isArabic ? "نشط" : "Active"}
                      </>
                    ) : (
                      <>
                        <Star className="h-4 w-4 me-2" />
                        {isArabic ? "اجعله افتراضي" : "Set as default"}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ThemeEditor
        open={!!editing}
        theme={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          // After save, re-apply the live theme if the saved one is currently
          // default so the admin sees the change without a hard reload. We use
          // the server response (`saved`) — never the stale `editing` snapshot
          // — so the live preview reflects the freshly saved values.
          if (saved.isDefault) {
            applyAdminTheme(saved);
          }
        }}
      />
    </div>
  );
}
