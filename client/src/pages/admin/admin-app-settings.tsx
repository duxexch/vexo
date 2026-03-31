import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  Settings,
  Palette,
  Shield,
  Phone,
  Mail,
  Save,
  Loader2,
  Download,
  Link,
  Eye,
  EyeOff,
} from "lucide-react";
import { SiGoogle, SiFacebook, SiTelegram, SiX } from "react-icons/si";

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
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  valueAr: string | null;
  category: string | null;
}

interface LoginMethodConfig {
  id: string;
  method: string;
  isEnabled: boolean;
  otpEnabled: boolean;
  otpLength: number;
  otpExpiryMinutes: number;
  settings: string | null;
}

const loginMethods = [
  { method: "phone", icon: Phone, label: "Phone", labelAr: "الهاتف" },
  { method: "email", icon: Mail, label: "Email", labelAr: "البريد الإلكتروني" },
  { method: "google", icon: SiGoogle, label: "Google", labelAr: "جوجل" },
  { method: "facebook", icon: SiFacebook, label: "Facebook", labelAr: "فيسبوك" },
  { method: "telegram", icon: SiTelegram, label: "Telegram", labelAr: "تيليجرام" },
  { method: "twitter", icon: SiX, label: "Twitter/X", labelAr: "تويتر/إكس" },
];

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminAppSettingsPage() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const isArabic = language === "ar";

  const [brandingForm, setBrandingForm] = useState({
    appName: "",
    appNameAr: "",
    appIconUrl: "",
    primaryColor: "",
    secondaryColor: "",
    accentColor: "",
  });

  const [storeForm, setStoreForm] = useState({
    googlePlayUrl: "",
    appStoreUrl: "",
    showPwa: true,
    showGooglePlay: true,
    showAppStore: true,
  });

  const { data: appSettings, isLoading: loadingAppSettings } = useQuery({
    queryKey: ["/api/admin/app-settings"],
    queryFn: () => adminFetch("/api/admin/app-settings"),
  });

  const { data: loginConfigs, isLoading: loadingLoginConfigs } = useQuery({
    queryKey: ["/api/admin/login-configs"],
    queryFn: () => adminFetch("/api/admin/login-configs"),
  });

  useState(() => {
    if (appSettings) {
      const settings = appSettings as AppSetting[];
      const getVal = (key: string) => settings.find((s) => s.key === key)?.value || "";
      const getValAr = (key: string) => settings.find((s) => s.key === key)?.valueAr || "";
      setBrandingForm({
        appName: getVal("app_name"),
        appNameAr: getValAr("app_name"),
        appIconUrl: getVal("app_icon_url"),
        primaryColor: getVal("primary_color"),
        secondaryColor: getVal("secondary_color"),
        accentColor: getVal("accent_color"),
      });
      setStoreForm({
        googlePlayUrl: getVal("store_google_play_url"),
        appStoreUrl: getVal("store_apple_url"),
        showPwa: getVal("store_show_pwa") !== "false",
        showGooglePlay: getVal("store_show_google_play") !== "false",
        showAppStore: getVal("store_show_apple") !== "false",
      });
    }
  });

  const updateAppSettingMutation = useMutation({
    mutationFn: async ({ key, value, valueAr, category }: { key: string; value: string; valueAr?: string; category?: string }) => {
      return adminFetch(`/api/admin/app-settings/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value, valueAr, category }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-settings"] });
    },
    onError: () => {
      toast({ title: isArabic ? "خطأ" : "Error", description: isArabic ? "فشل حفظ الإعداد" : "Failed to save setting", variant: "destructive" });
    },
  });

  const updateLoginConfigMutation = useMutation({
    mutationFn: async ({ method, ...data }: { method: string; isEnabled?: boolean; otpEnabled?: boolean; otpLength?: number; otpExpiryMinutes?: number }) => {
      return adminFetch(`/api/admin/login-configs/${method}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/login-configs"] });
      toast({ title: isArabic ? "تم الحفظ" : "Saved", description: isArabic ? "تم تحديث طريقة تسجيل الدخول" : "Login method updated" });
    },
    onError: () => {
      toast({ title: isArabic ? "خطأ" : "Error", description: isArabic ? "فشل التحديث" : "Failed to update", variant: "destructive" });
    },
  });

  const saveBranding = async () => {
    const updates = [
      { key: "app_name", value: brandingForm.appName, valueAr: brandingForm.appNameAr, category: "branding" },
      { key: "app_icon_url", value: brandingForm.appIconUrl, category: "branding" },
      { key: "primary_color", value: brandingForm.primaryColor, category: "branding" },
      { key: "secondary_color", value: brandingForm.secondaryColor, category: "branding" },
      { key: "accent_color", value: brandingForm.accentColor, category: "branding" },
    ];

    try {
      for (const update of updates) {
        await updateAppSettingMutation.mutateAsync(update);
      }
      toast({ title: isArabic ? "تم الحفظ" : "Saved", description: isArabic ? "تم حفظ إعدادات العلامة التجارية" : "Branding settings saved" });
    } catch (error) {
      console.error("Error saving branding:", error);
    }
  };

  const saveStoreLinks = async () => {
    const updates = [
      { key: "store_google_play_url", value: storeForm.googlePlayUrl, category: "store_links" },
      { key: "store_apple_url", value: storeForm.appStoreUrl, category: "store_links" },
      { key: "store_show_pwa", value: storeForm.showPwa ? "true" : "false", category: "store_links" },
      { key: "store_show_google_play", value: storeForm.showGooglePlay ? "true" : "false", category: "store_links" },
      { key: "store_show_apple", value: storeForm.showAppStore ? "true" : "false", category: "store_links" },
    ];

    try {
      for (const update of updates) {
        await updateAppSettingMutation.mutateAsync(update);
      }
      toast({ title: isArabic ? "تم الحفظ" : "Saved", description: isArabic ? "تم حفظ إعدادات روابط التحميل" : "Store link settings saved" });
    } catch (error) {
      console.error("Error saving store links:", error);
    }
  };

  const getLoginConfig = (method: string): LoginMethodConfig | undefined => {
    return (loginConfigs as LoginMethodConfig[])?.find((c) => c.method === method);
  };

  const isSaving = updateAppSettingMutation.isPending || 
                   updateLoginConfigMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          {isArabic ? "إعدادات التطبيق" : "App Settings"}
        </h1>
        <p className="text-muted-foreground">
          {isArabic ? "إدارة إعدادات التطبيق والعلامة التجارية وطرق تسجيل الدخول" : "Manage app configuration, branding, and login methods"}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {isArabic ? "العلامة التجارية" : "App Branding"}
            </CardTitle>
            <CardDescription>
              {isArabic ? "تخصيص مظهر التطبيق والألوان" : "Customize app appearance and colors"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingAppSettings ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="appName">{isArabic ? "اسم التطبيق (إنجليزي)" : "App Name (English)"}</Label>
                    <Input
                      id="appName"
                      value={brandingForm.appName}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, appName: e.target.value }))}
                      placeholder="VEX Gaming"
                      data-testid="input-app-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appNameAr">{isArabic ? "اسم التطبيق (عربي)" : "App Name (Arabic)"}</Label>
                    <Input
                      id="appNameAr"
                      value={brandingForm.appNameAr}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, appNameAr: e.target.value }))}
                      placeholder="فيكس للألعاب"
                      dir="rtl"
                      data-testid="input-app-name-ar"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appIconUrl">{isArabic ? "رابط شعار التطبيق" : "App Icon/Logo URL"}</Label>
                  <Input
                    id="appIconUrl"
                    value={brandingForm.appIconUrl}
                    onChange={(e) => setBrandingForm((prev) => ({ ...prev, appIconUrl: e.target.value }))}
                    placeholder="https://example.com/logo.png"
                    data-testid="input-app-icon-url"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">{isArabic ? "اللون الأساسي" : "Primary Color"}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        value={brandingForm.primaryColor}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                        placeholder="#00c853"
                        data-testid="input-primary-color"
                      />
                      <input
                        type="color"
                        value={brandingForm.primaryColor || "#00c853"}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">{isArabic ? "اللون الثانوي" : "Secondary Color"}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondaryColor"
                        value={brandingForm.secondaryColor}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                        placeholder="#ff9800"
                        data-testid="input-secondary-color"
                      />
                      <input
                        type="color"
                        value={brandingForm.secondaryColor || "#ff9800"}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accentColor">{isArabic ? "لون التمييز" : "Accent Color"}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accentColor"
                        value={brandingForm.accentColor}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, accentColor: e.target.value }))}
                        placeholder="#1a2332"
                        data-testid="input-accent-color"
                      />
                      <input
                        type="color"
                        value={brandingForm.accentColor || "#1a2332"}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, accentColor: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={saveBranding} 
                    disabled={isSaving}
                    data-testid="button-save-branding"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                    {isArabic ? "حفظ العلامة التجارية" : "Save Branding"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            ██  STORE LINKS & DOWNLOAD BUTTONS  ██
            ══════════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {isArabic ? "روابط التحميل وأزرار المتاجر" : "Download Links & Store Buttons"}
            </CardTitle>
            <CardDescription>
              {isArabic ? "إدارة روابط التحميل وإظهار/إخفاء أزرار التحميل في صفحة تحميل التطبيق" : "Manage download links and show/hide download buttons on the install page"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingAppSettings ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Toggle Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {isArabic ? "إظهار/إخفاء الأزرار" : "Show/Hide Buttons"}
                  </h3>
                  <div className="grid gap-3">
                    {/* PWA Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-green-500/10">
                          <Download className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{isArabic ? "زر تحميل PWA" : "PWA Install Button"}</p>
                          <p className="text-xs text-muted-foreground">{isArabic ? "زر التحميل المباشر للتطبيق" : "Direct app install button"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {storeForm.showPwa ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                        <Switch
                          checked={storeForm.showPwa}
                          onCheckedChange={(checked) => setStoreForm((prev) => ({ ...prev, showPwa: checked }))}
                        />
                      </div>
                    </div>

                    {/* Google Play Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-blue-500/10">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="currentColor">
                            <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.3 2.3-8.636-8.632z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{isArabic ? "زر جوجل بلاي" : "Google Play Button"}</p>
                          <p className="text-xs text-muted-foreground">{isArabic ? "رابط التحميل من جوجل بلاي" : "Google Play Store download link"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {storeForm.showGooglePlay ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                        <Switch
                          checked={storeForm.showGooglePlay}
                          onCheckedChange={(checked) => setStoreForm((prev) => ({ ...prev, showGooglePlay: checked }))}
                        />
                      </div>
                    </div>

                    {/* App Store Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-gray-500/10">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{isArabic ? "زر آبل ستور" : "App Store Button"}</p>
                          <p className="text-xs text-muted-foreground">{isArabic ? "رابط التحميل من آبل ستور" : "Apple App Store download link"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {storeForm.showAppStore ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                        <Switch
                          checked={storeForm.showAppStore}
                          onCheckedChange={(checked) => setStoreForm((prev) => ({ ...prev, showAppStore: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* URL Links */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {isArabic ? "روابط التحميل" : "Download URLs"}
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Link className="h-3.5 w-3.5" />
                        {isArabic ? "رابط جوجل بلاي" : "Google Play URL"}
                      </Label>
                      <Input
                        value={storeForm.googlePlayUrl}
                        onChange={(e) => setStoreForm((prev) => ({ ...prev, googlePlayUrl: e.target.value }))}
                        placeholder="https://play.google.com/store/apps/details?id=..."
                        dir="ltr"
                        disabled={!storeForm.showGooglePlay}
                        className={!storeForm.showGooglePlay ? "opacity-50" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Link className="h-3.5 w-3.5" />
                        {isArabic ? "رابط آبل ستور" : "App Store URL"}
                      </Label>
                      <Input
                        value={storeForm.appStoreUrl}
                        onChange={(e) => setStoreForm((prev) => ({ ...prev, appStoreUrl: e.target.value }))}
                        placeholder="https://apps.apple.com/app/..."
                        dir="ltr"
                        disabled={!storeForm.showAppStore}
                        className={!storeForm.showAppStore ? "opacity-50" : ""}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={saveStoreLinks}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                    {isArabic ? "حفظ إعدادات التحميل" : "Save Store Settings"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {isArabic ? "طرق تسجيل الدخول" : "Login Method Settings"}
            </CardTitle>
            <CardDescription>
              {isArabic ? "تكوين طرق المصادقة وإعدادات OTP" : "Configure authentication methods and OTP settings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLoginConfigs ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              <Accordion type="multiple" className="w-full">
                {loginMethods.map((lm) => {
                  const config = getLoginConfig(lm.method);
                  const Icon = lm.icon;
                  return (
                    <AccordionItem key={lm.method} value={lm.method}>
                      <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between gap-4 w-full pe-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-muted">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="font-medium">{isArabic ? lm.labelAr : lm.label}</span>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={config?.isEnabled ?? false}
                              onCheckedChange={(checked) =>
                                updateLoginConfigMutation.mutate({ method: lm.method, isEnabled: checked })
                              }
                              data-testid={`switch-login-${lm.method}`}
                            />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-3 p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`otp-${lm.method}`}>{isArabic ? "تفعيل OTP" : "Enable OTP"}</Label>
                            <Switch
                              id={`otp-${lm.method}`}
                              checked={config?.otpEnabled ?? false}
                              onCheckedChange={(checked) =>
                                updateLoginConfigMutation.mutate({ method: lm.method, otpEnabled: checked })
                              }
                              data-testid={`switch-otp-${lm.method}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{isArabic ? "طول OTP" : "OTP Length"}</Label>
                            <Select
                              value={String(config?.otpLength ?? 6)}
                              onValueChange={(val) =>
                                updateLoginConfigMutation.mutate({ method: lm.method, otpLength: parseInt(val) })
                              }
                            >
                              <SelectTrigger data-testid={`select-otp-length-${lm.method}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="4">4 {isArabic ? "أرقام" : "digits"}</SelectItem>
                                <SelectItem value="5">5 {isArabic ? "أرقام" : "digits"}</SelectItem>
                                <SelectItem value="6">6 {isArabic ? "أرقام" : "digits"}</SelectItem>
                                <SelectItem value="8">8 {isArabic ? "أرقام" : "digits"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>{isArabic ? "انتهاء OTP (دقائق)" : "OTP Expiry (minutes)"}</Label>
                            <Select
                              value={String(config?.otpExpiryMinutes ?? 5)}
                              onValueChange={(val) =>
                                updateLoginConfigMutation.mutate({ method: lm.method, otpExpiryMinutes: parseInt(val) })
                              }
                            >
                              <SelectTrigger data-testid={`select-otp-expiry-${lm.method}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2 {isArabic ? "دقائق" : "minutes"}</SelectItem>
                                <SelectItem value="5">5 {isArabic ? "دقائق" : "minutes"}</SelectItem>
                                <SelectItem value="10">10 {isArabic ? "دقائق" : "minutes"}</SelectItem>
                                <SelectItem value="15">15 {isArabic ? "دقائق" : "minutes"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
