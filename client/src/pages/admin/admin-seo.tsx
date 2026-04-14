import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { languages, useI18n } from "@/lib/i18n";
import {
  Search,
  Globe,
  Share2,
  FileText,
  Code,
  BarChart3,
  Link,
  Save,
  Loader2,
  Eye,
  AlertCircle
} from "lucide-react";
import { SiGoogle, SiFacebook, SiX, SiInstagram } from "react-icons/si";

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

interface SeoSettings {
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  canonicalUrl: string;
  robotsContent: string;
  enableSitemap: boolean;
  googleAnalyticsId: string;
  facebookPixelId: string;
  twitterHandle: string;
  facebookUrl: string;
  instagramUrl: string;
  jsonLdEnabled: boolean;
  organizationName: string;
  organizationLogo: string;
  localeOverrides?: Record<string, Record<string, string>>;
}

const defaultSeoSettings: SeoSettings = {
  siteTitle: "",
  siteDescription: "",
  siteKeywords: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  ogType: "website",
  canonicalUrl: "",
  robotsContent: "index, follow",
  enableSitemap: true,
  googleAnalyticsId: "",
  facebookPixelId: "",
  twitterHandle: "",
  facebookUrl: "",
  instagramUrl: "",
  jsonLdEnabled: false,
  organizationName: "",
  organizationLogo: "",
  localeOverrides: {},
};

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const TEXTAREA_SURFACE_CLASS = "rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const PREVIEW_PANEL_CLASS = "rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60";

export default function AdminSeoPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";

  const [settings, setSettings] = useState<SeoSettings>(defaultSeoSettings);
  const [activeTab, setActiveTab] = useState("meta");

  const { data: seoData, isLoading } = useQuery({
    queryKey: ["/api/admin/seo-settings"],
    queryFn: () => adminFetch("/api/admin/seo-settings"),
  });

  useEffect(() => {
    if (seoData) {
      setSettings({ ...defaultSeoSettings, ...seoData });
    }
  }, [seoData]);

  const coveredLanguageCount = languages.length;
  const analyticsConfiguredCount = [settings.googleAnalyticsId, settings.facebookPixelId].filter(Boolean).length;
  const socialLinksCount = [settings.twitterHandle, settings.facebookUrl, settings.instagramUrl].filter(Boolean).length;
  const seoCoverageCount = [settings.siteTitle, settings.siteDescription, settings.canonicalUrl, settings.ogTitle, settings.ogDescription].filter(Boolean).length;

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SeoSettings>) => {
      return adminFetch("/api/admin/seo-settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo-settings"] });
      toast({
        title: isArabic ? "تم الحفظ" : "Saved",
        description: isArabic ? "تم حفظ إعدادات SEO بنجاح" : "SEO settings saved successfully",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description: isArabic ? "فشل حفظ الإعدادات" : "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = (section: string) => {
    let dataToSave: Partial<SeoSettings> = {};

    switch (section) {
      case "meta":
        dataToSave = {
          siteTitle: settings.siteTitle,
          siteDescription: settings.siteDescription,
          siteKeywords: settings.siteKeywords,
        };
        break;
      case "og":
        dataToSave = {
          ogTitle: settings.ogTitle,
          ogDescription: settings.ogDescription,
          ogImage: settings.ogImage,
          ogType: settings.ogType,
        };
        break;
      case "technical":
        dataToSave = {
          canonicalUrl: settings.canonicalUrl,
          robotsContent: settings.robotsContent,
          enableSitemap: settings.enableSitemap,
        };
        break;
      case "analytics":
        dataToSave = {
          googleAnalyticsId: settings.googleAnalyticsId,
          facebookPixelId: settings.facebookPixelId,
          twitterHandle: settings.twitterHandle,
          facebookUrl: settings.facebookUrl,
          instagramUrl: settings.instagramUrl,
        };
        break;
      case "jsonld":
        dataToSave = {
          jsonLdEnabled: settings.jsonLdEnabled,
          organizationName: settings.organizationName,
          organizationLogo: settings.organizationLogo,
        };
        break;
      default:
        dataToSave = settings;
    }

    saveMutation.mutate(dataToSave);
  };

  const updateSetting = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
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
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Search className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl flex items-center gap-2">
                {isArabic ? "إدارة SEO" : "SEO Management"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {isArabic
                  ? "إدارة إعدادات محركات البحث والبيانات الوصفية"
                  : "Manage search engine optimization and metadata settings"}
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
            <Globe className="h-4 w-4" />
            <span>
              {isArabic
                ? `تغطية اللغات: ${coveredLanguageCount}/${coveredLanguageCount}`
                : `Language coverage: ${coveredLanguageCount}/${coveredLanguageCount}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "اللغات" : "Languages"}</p>
              <p className="mt-1 text-2xl font-bold">{coveredLanguageCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "حقول SEO المعبأة" : "SEO Fields Filled"}</p>
              <p className="mt-1 text-2xl font-bold">{seoCoverageCount}/5</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "تكاملات التحليل" : "Analytics Links"}</p>
              <p className="mt-1 text-2xl font-bold">{analyticsConfiguredCount}/2</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "روابط اجتماعية" : "Social Links"}</p>
              <p className="mt-1 text-2xl font-bold">{socialLinksCount}/3</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <div className={`${SURFACE_CARD_CLASS} p-3`}>
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-[24px] bg-slate-100/80 p-1.5 md:grid-cols-5 dark:bg-slate-900/80">
            <TabsTrigger value="meta" className="flex items-center gap-2" data-testid="tab-meta">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{isArabic ? "العلامات الوصفية" : "Meta Tags"}</span>
            </TabsTrigger>
            <TabsTrigger value="og" className="flex items-center gap-2" data-testid="tab-og">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{isArabic ? "Open Graph" : "Open Graph"}</span>
            </TabsTrigger>
            <TabsTrigger value="technical" className="flex items-center gap-2" data-testid="tab-technical">
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">{isArabic ? "تقني" : "Technical"}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2" data-testid="tab-analytics">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">{isArabic ? "التحليلات" : "Analytics"}</span>
            </TabsTrigger>
            <TabsTrigger value="jsonld" className="flex items-center gap-2" data-testid="tab-jsonld">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">{isArabic ? "البيانات المنظمة" : "Structured Data"}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="meta" className="space-y-6">
          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {isArabic ? "العلامات الوصفية" : "Meta Tags"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تكوين العنوان والوصف والكلمات المفتاحية للموقع"
                  : "Configure site title, description, and keywords for search engines"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="siteTitle">{isArabic ? "عنوان الموقع" : "Site Title"}</Label>
                <Input
                  id="siteTitle"
                  value={settings.siteTitle}
                  onChange={(e) => updateSetting("siteTitle", e.target.value)}
                  placeholder={isArabic ? "اسم موقعك" : "Your Site Name"}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-site-title"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic ? "يظهر في علامة تبويب المتصفح ونتائج البحث" : "Appears in browser tab and search results"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteDescription">{isArabic ? "وصف الموقع" : "Site Description"}</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.siteDescription}
                  onChange={(e) => updateSetting("siteDescription", e.target.value)}
                  placeholder={isArabic ? "وصف موجز لموقعك..." : "A brief description of your site..."}
                  rows={3}
                  className={TEXTAREA_SURFACE_CLASS}
                  data-testid="input-site-description"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic ? "الحد الأمثل: 150-160 حرف" : "Optimal length: 150-160 characters"}
                  ({settings.siteDescription.length}/160)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteKeywords">{isArabic ? "الكلمات المفتاحية" : "Keywords"}</Label>
                <Textarea
                  id="siteKeywords"
                  value={settings.siteKeywords}
                  onChange={(e) => updateSetting("siteKeywords", e.target.value)}
                  placeholder={isArabic ? "كلمة1, كلمة2, كلمة3" : "keyword1, keyword2, keyword3"}
                  rows={2}
                  className={TEXTAREA_SURFACE_CLASS}
                  data-testid="input-site-keywords"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic ? "افصل الكلمات بفواصل" : "Separate keywords with commas"}
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  className={BUTTON_3D_PRIMARY_CLASS}
                  onClick={() => handleSave("meta")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-meta"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Save className="h-4 w-4 me-2" />
                  )}
                  {isArabic ? "حفظ العلامات الوصفية" : "Save Meta Tags"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {isArabic ? "معاينة نتائج البحث" : "Search Result Preview"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`${PREVIEW_PANEL_CLASS} space-y-1`}>
                <p className="text-blue-500 text-lg hover:underline cursor-pointer">
                  {settings.siteTitle || (isArabic ? "عنوان موقعك" : "Your Site Title")}
                </p>
                <p className="text-green-600 text-sm">
                  {settings.canonicalUrl || "https://yoursite.com"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {settings.siteDescription || (isArabic ? "وصف موقعك سيظهر هنا..." : "Your site description will appear here...")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="og" className="space-y-6">
          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                {isArabic ? "إعدادات Open Graph" : "Open Graph Settings"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تحكم في كيفية ظهور موقعك عند مشاركته على وسائل التواصل الاجتماعي"
                  : "Control how your site appears when shared on social media"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ogTitle">{isArabic ? "عنوان OG" : "OG Title"}</Label>
                <Input
                  id="ogTitle"
                  value={settings.ogTitle}
                  onChange={(e) => updateSetting("ogTitle", e.target.value)}
                  placeholder={isArabic ? "عنوان للمشاركة الاجتماعية" : "Title for social sharing"}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-og-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogDescription">{isArabic ? "وصف OG" : "OG Description"}</Label>
                <Textarea
                  id="ogDescription"
                  value={settings.ogDescription}
                  onChange={(e) => updateSetting("ogDescription", e.target.value)}
                  placeholder={isArabic ? "وصف للمشاركة الاجتماعية..." : "Description for social sharing..."}
                  rows={3}
                  className={TEXTAREA_SURFACE_CLASS}
                  data-testid="input-og-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogImage">{isArabic ? "رابط صورة OG" : "OG Image URL"}</Label>
                <Input
                  id="ogImage"
                  value={settings.ogImage}
                  onChange={(e) => updateSetting("ogImage", e.target.value)}
                  placeholder="https://yoursite.com/og-image.jpg"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-og-image"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic ? "الحجم الموصى به: 1200x630 بكسل" : "Recommended size: 1200x630 pixels"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ogType">{isArabic ? "نوع OG" : "OG Type"}</Label>
                <Input
                  id="ogType"
                  value={settings.ogType}
                  onChange={(e) => updateSetting("ogType", e.target.value)}
                  placeholder="website"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-og-type"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic ? "عادة: website, article, product" : "Common values: website, article, product"}
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  className={BUTTON_3D_PRIMARY_CLASS}
                  onClick={() => handleSave("og")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-og"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Save className="h-4 w-4 me-2" />
                  )}
                  {isArabic ? "حفظ Open Graph" : "Save Open Graph"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {isArabic ? "معاينة المشاركة الاجتماعية" : "Social Share Preview"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`${PREVIEW_PANEL_CLASS} max-w-md overflow-hidden p-0`}>
                <div className="flex h-40 items-center justify-center bg-muted">
                  {settings.ogImage ? (
                    <img
                      src={settings.ogImage}
                      alt="OG Preview"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      {isArabic ? "صورة OG" : "OG Image"}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="font-semibold text-sm">
                    {settings.ogTitle || settings.siteTitle || (isArabic ? "عنوان OG" : "OG Title")}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {settings.ogDescription || settings.siteDescription || (isArabic ? "وصف OG" : "OG Description")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {settings.canonicalUrl || "yoursite.com"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical" className="space-y-6">
          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                {isArabic ? "عنوان URL الأساسي" : "Canonical URL"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "حدد عنوان URL الأساسي لتجنب مشاكل المحتوى المكرر"
                  : "Set the canonical URL to avoid duplicate content issues"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="canonicalUrl">{isArabic ? "عنوان URL الأساسي" : "Canonical URL"}</Label>
                <Input
                  id="canonicalUrl"
                  value={settings.canonicalUrl}
                  onChange={(e) => updateSetting("canonicalUrl", e.target.value)}
                  placeholder="https://yoursite.com"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-canonical-url"
                />
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {isArabic ? "إعدادات Robots.txt" : "Robots.txt Settings"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تحكم في كيفية فهرسة محركات البحث لموقعك"
                  : "Control how search engines crawl and index your site"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="robotsContent">{isArabic ? "محتوى Robots" : "Robots Content"}</Label>
                <Textarea
                  id="robotsContent"
                  value={settings.robotsContent}
                  onChange={(e) => updateSetting("robotsContent", e.target.value)}
                  placeholder="index, follow"
                  rows={4}
                  className={`${TEXTAREA_SURFACE_CLASS} font-mono text-sm`}
                  data-testid="input-robots-content"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic
                    ? "القيم الشائعة: index/noindex, follow/nofollow"
                    : "Common values: index/noindex, follow/nofollow"}
                </p>
              </div>

              <div className={PREVIEW_PANEL_CLASS}>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {isArabic ? "قيم شائعة:" : "Common directives:"}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li><code className="bg-muted px-1 rounded">index, follow</code> - {isArabic ? "السماح بالفهرسة والتتبع" : "Allow indexing and following"}</li>
                  <li><code className="bg-muted px-1 rounded">noindex, follow</code> - {isArabic ? "عدم الفهرسة ولكن التتبع" : "Don't index but follow links"}</li>
                  <li><code className="bg-muted px-1 rounded">noindex, nofollow</code> - {isArabic ? "عدم الفهرسة وعدم التتبع" : "Don't index or follow"}</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {isArabic ? "إعدادات خريطة الموقع" : "Sitemap Settings"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تكوين إنشاء خريطة الموقع التلقائية"
                  : "Configure automatic sitemap generation"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`${PREVIEW_PANEL_CLASS} flex items-center justify-between`}>
                <div>
                  <Label className="text-base">{isArabic ? "تفعيل خريطة الموقع" : "Enable Sitemap"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isArabic
                      ? "إنشاء ملف sitemap.xml تلقائياً"
                      : "Automatically generate sitemap.xml file"}
                  </p>
                </div>
                <Switch
                  checked={settings.enableSitemap}
                  onCheckedChange={(checked) => updateSetting("enableSitemap", checked)}
                  data-testid="switch-enable-sitemap"
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  className={BUTTON_3D_PRIMARY_CLASS}
                  onClick={() => handleSave("technical")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-technical"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Save className="h-4 w-4 me-2" />
                  )}
                  {isArabic ? "حفظ الإعدادات التقنية" : "Save Technical Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiGoogle className="h-5 w-5" />
                {isArabic ? "Google Analytics" : "Google Analytics"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "ربط موقعك بـ Google Analytics لتتبع الزوار"
                  : "Connect your site to Google Analytics for visitor tracking"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="googleAnalyticsId">{isArabic ? "معرف Google Analytics" : "Google Analytics ID"}</Label>
                <Input
                  id="googleAnalyticsId"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => updateSetting("googleAnalyticsId", e.target.value)}
                  placeholder="G-XXXXXXXXXX or UA-XXXXXXXX-X"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-google-analytics-id"
                />
                <p className="text-xs text-muted-foreground">
                  {isArabic
                    ? "معرف GA4 (G-XXXX) أو Universal Analytics (UA-XXXX)"
                    : "GA4 ID (G-XXXX) or Universal Analytics ID (UA-XXXX)"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiFacebook className="h-5 w-5" />
                {isArabic ? "Facebook Pixel" : "Facebook Pixel"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تتبع التحويلات وإنشاء جماهير مخصصة"
                  : "Track conversions and create custom audiences"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="facebookPixelId">{isArabic ? "معرف Facebook Pixel" : "Facebook Pixel ID"}</Label>
                <Input
                  id="facebookPixelId"
                  value={settings.facebookPixelId}
                  onChange={(e) => updateSetting("facebookPixelId", e.target.value)}
                  placeholder="XXXXXXXXXXXXXXX"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-facebook-pixel-id"
                />
              </div>
            </CardContent>
          </Card>

          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                {isArabic ? "روابط وسائل التواصل الاجتماعي" : "Social Media Links"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "أضف روابط حساباتك على وسائل التواصل الاجتماعي"
                  : "Add links to your social media accounts"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twitterHandle" className="flex items-center gap-2">
                  <SiX className="h-4 w-4" />
                  {isArabic ? "حساب Twitter/X" : "Twitter/X Handle"}
                </Label>
                <Input
                  id="twitterHandle"
                  value={settings.twitterHandle}
                  onChange={(e) => updateSetting("twitterHandle", e.target.value)}
                  placeholder="@yourusername"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-twitter-handle"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="facebookUrl" className="flex items-center gap-2">
                  <SiFacebook className="h-4 w-4" />
                  {isArabic ? "رابط Facebook" : "Facebook URL"}
                </Label>
                <Input
                  id="facebookUrl"
                  value={settings.facebookUrl}
                  onChange={(e) => updateSetting("facebookUrl", e.target.value)}
                  placeholder="https://facebook.com/yourpage"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-facebook-url"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagramUrl" className="flex items-center gap-2">
                  <SiInstagram className="h-4 w-4" />
                  {isArabic ? "رابط Instagram" : "Instagram URL"}
                </Label>
                <Input
                  id="instagramUrl"
                  value={settings.instagramUrl}
                  onChange={(e) => updateSetting("instagramUrl", e.target.value)}
                  placeholder="https://instagram.com/youraccount"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-instagram-url"
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  className={BUTTON_3D_PRIMARY_CLASS}
                  onClick={() => handleSave("analytics")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-analytics"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Save className="h-4 w-4 me-2" />
                  )}
                  {isArabic ? "حفظ إعدادات التحليلات" : "Save Analytics Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jsonld" className="space-y-6">
          <Card className={SURFACE_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {isArabic ? "البيانات المنظمة JSON-LD" : "JSON-LD Structured Data"}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? "تحسين ظهور موقعك في نتائج البحث باستخدام البيانات المنظمة"
                  : "Enhance your search appearance with structured data markup"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`${PREVIEW_PANEL_CLASS} flex items-center justify-between`}>
                <div>
                  <Label className="text-base">{isArabic ? "تفعيل JSON-LD" : "Enable JSON-LD"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isArabic
                      ? "إضافة بيانات منظمة لمحركات البحث"
                      : "Add structured data markup for search engines"}
                  </p>
                </div>
                <Switch
                  checked={settings.jsonLdEnabled}
                  onCheckedChange={(checked) => updateSetting("jsonLdEnabled", checked)}
                  data-testid="switch-jsonld-enabled"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationName">{isArabic ? "اسم المؤسسة" : "Organization Name"}</Label>
                <Input
                  id="organizationName"
                  value={settings.organizationName}
                  onChange={(e) => updateSetting("organizationName", e.target.value)}
                  placeholder={isArabic ? "اسم شركتك" : "Your Company Name"}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-organization-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationLogo">{isArabic ? "رابط شعار المؤسسة" : "Organization Logo URL"}</Label>
                <Input
                  id="organizationLogo"
                  value={settings.organizationLogo}
                  onChange={(e) => updateSetting("organizationLogo", e.target.value)}
                  placeholder="https://yoursite.com/logo.png"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-organization-logo"
                />
              </div>

              {settings.jsonLdEnabled && (
                <Card className={DATA_CARD_CLASS}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      {isArabic ? "معاينة JSON-LD" : "JSON-LD Preview"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <pre className="overflow-x-auto rounded-2xl bg-background p-3 text-xs">
                      {JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        "name": settings.organizationName || "Your Organization",
                        "url": settings.canonicalUrl || "https://yoursite.com",
                        "logo": settings.organizationLogo || "https://yoursite.com/logo.png",
                        "sameAs": [
                          settings.facebookUrl,
                          settings.instagramUrl,
                          settings.twitterHandle ? `https://twitter.com/${settings.twitterHandle.replace('@', '')}` : null
                        ].filter(Boolean)
                      }, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  className={BUTTON_3D_PRIMARY_CLASS}
                  onClick={() => handleSave("jsonld")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-jsonld"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Save className="h-4 w-4 me-2" />
                  )}
                  {isArabic ? "حفظ البيانات المنظمة" : "Save Structured Data"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
