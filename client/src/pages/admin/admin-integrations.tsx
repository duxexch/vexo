import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import {
  CheckCircle2,
  Settings2,
  MessageSquare,
  CreditCard,
  Mail,
  Shield,
  Globe,
  Smartphone,
  ExternalLink,
  Copy,
  RefreshCw,
  Key,
  Link2,
} from "lucide-react";
import { SiGoogle, SiFacebook, SiTelegram, SiX, SiStripe, SiTwilio } from "react-icons/si";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

interface IntegrationStatus {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  isConfigured: boolean;
  isEnabled: boolean;
  requiredEnvVars: string[];
  documentationUrl: string;
  category: "auth" | "payment" | "notification" | "other";
}

const INTEGRATIONS: IntegrationStatus[] = [
  {
    id: "twilio",
    name: "Twilio SMS",
    nameAr: "رسائل تويليو",
    description: "Send OTP codes and notifications via SMS",
    descriptionAr: "إرسال رموز التحقق والإشعارات عبر الرسائل القصيرة",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    documentationUrl: "https://www.twilio.com/docs/sms",
    category: "notification",
  },
  {
    id: "sendgrid",
    name: "SendGrid Email",
    nameAr: "بريد سيند جريد",
    description: "Send transactional emails and notifications",
    descriptionAr: "إرسال رسائل البريد الإلكتروني والإشعارات",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL"],
    documentationUrl: "https://docs.sendgrid.com/",
    category: "notification",
  },
  {
    id: "google_oauth",
    name: "Google Sign-In",
    nameAr: "تسجيل دخول جوجل",
    description: "Allow users to sign in with Google accounts",
    descriptionAr: "السماح للمستخدمين بتسجيل الدخول بحسابات جوجل",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_SCOPES",
      "GOOGLE_ANDROID_CLIENT_ID",
      "GOOGLE_CLIENT_ID_ANDROID",
      "GOOGLE_ANDROID_PACKAGE_NAME",
      "GOOGLE_ANDROID_SHA1",
    ],
    documentationUrl: "https://developers.google.com/identity/sign-in/web/sign-in",
    category: "auth",
  },
  {
    id: "facebook_oauth",
    name: "Facebook Login",
    nameAr: "تسجيل دخول فيسبوك",
    description: "Allow users to sign in with Facebook accounts",
    descriptionAr: "السماح للمستخدمين بتسجيل الدخول بحسابات فيسبوك",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    documentationUrl: "https://developers.facebook.com/docs/facebook-login/web",
    category: "auth",
  },
  {
    id: "telegram_oauth",
    name: "Telegram Login",
    nameAr: "تسجيل دخول تيليجرام",
    description: "Allow users to sign in with Telegram accounts",
    descriptionAr: "السماح للمستخدمين بتسجيل الدخول بحسابات تيليجرام",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["TELEGRAM_BOT_TOKEN"],
    documentationUrl: "https://core.telegram.org/widgets/login",
    category: "auth",
  },
  {
    id: "twitter_oauth",
    name: "Twitter/X Login",
    nameAr: "تسجيل دخول تويتر",
    description: "Allow users to sign in with Twitter/X accounts",
    descriptionAr: "السماح للمستخدمين بتسجيل الدخول بحسابات تويتر",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["TWITTER_API_KEY", "TWITTER_API_SECRET"],
    documentationUrl: "https://developer.twitter.com/en/docs/authentication/oauth-2-0",
    category: "auth",
  },
  {
    id: "stripe",
    name: "Stripe Payments",
    nameAr: "مدفوعات سترايب",
    description: "Accept credit card and online payments",
    descriptionAr: "قبول بطاقات الائتمان والمدفوعات الإلكترونية",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"],
    documentationUrl: "https://stripe.com/docs",
    category: "payment",
  },
  {
    id: "firebase_push",
    name: "Firebase Push Notifications",
    nameAr: "إشعارات فايربيس",
    description: "Send push notifications to mobile devices",
    descriptionAr: "إرسال إشعارات فورية للهواتف المحمولة",
    isConfigured: false,
    isEnabled: false,
    requiredEnvVars: ["FIREBASE_PROJECT_ID", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"],
    documentationUrl: "https://firebase.google.com/docs/cloud-messaging",
    category: "notification",
  },
];

const CATEGORY_ICONS = {
  auth: Shield,
  payment: CreditCard,
  notification: MessageSquare,
  other: Settings2,
};

const CATEGORY_LABELS = {
  auth: { en: "Authentication", ar: "المصادقة" },
  payment: { en: "Payments", ar: "المدفوعات" },
  notification: { en: "Notifications", ar: "الإشعارات" },
  other: { en: "Other", ar: "أخرى" },
};

const INTEGRATION_ICONS: Record<string, any> = {
  twilio: SiTwilio,
  sendgrid: Mail,
  google_oauth: SiGoogle,
  facebook_oauth: SiFacebook,
  telegram_oauth: SiTelegram,
  twitter_oauth: SiX,
  stripe: SiStripe,
  firebase_push: Smartphone,
};

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-y-auto rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 sm:max-w-2xl";

function IntegrationCard({ integration, isArabic }: { integration: IntegrationStatus; isArabic: boolean }) {
  const [showSetup, setShowSetup] = useState(false);
  const Icon = INTEGRATION_ICONS[integration.id] || Settings2;
  const isSocialIntegration = integration.category === "auth";

  const setupDescription = isSocialIntegration
    ? (isArabic
      ? "إعدادات تسجيل الدخول الاجتماعي تتم من لوحة الأدمن > Social Platforms. متغيرات البيئة أدناه اختيارية كخطة احتياط."
      : "Social login settings are managed in Admin > Social Platforms. Environment variables below are optional fallback.")
    : (isArabic
      ? "أضف المتغيرات التالية إلى ملف .env الخاص بك"
      : "Add the following environment variables to your .env file");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <Card className={`${DATA_CARD_CLASS} relative overflow-visible`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {isArabic ? integration.nameAr : integration.name}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {isArabic ? integration.descriptionAr : integration.description}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={integration.isConfigured ? "default" : "secondary"}
              className={integration.isConfigured ? "bg-green-600" : ""}
            >
              {integration.isConfigured
                ? (isArabic ? "مُفعّل" : "Connected")
                : (isArabic ? "غير مُفعّل" : "Not Connected")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {isArabic ? "الحالة" : "Status"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  {integration.isConfigured ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Settings2 className="h-4 w-4 text-slate-500" />}
                  {integration.isConfigured ? (isArabic ? "مربوط" : "Connected") : (isArabic ? "غير مربوط" : "Not connected")}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {isArabic ? "المتطلبات" : "Requirements"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <Key className="h-4 w-4 text-slate-500" />
                  {isSocialIntegration
                    ? (isArabic ? "تتم الإدارة من Social Platforms" : "Managed in Social Platforms")
                    : `${integration.requiredEnvVars.length} ${isArabic ? "متغيرات مطلوبة" : "variables required"}`}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                className={BUTTON_3D_CLASS}
                onClick={() => window.open(integration.documentationUrl, "_blank")}
                data-testid={`button-docs-${integration.id}`}
              >
                <ExternalLink className="w-3 h-3 me-1" />
                {isArabic ? "التوثيق" : "Docs"}
              </Button>
              <Button
                className={BUTTON_3D_PRIMARY_CLASS}
                onClick={() => setShowSetup(true)}
                data-testid={`button-setup-${integration.id}`}
              >
                <Settings2 className="w-3 h-3 me-1" />
                {isArabic ? "الإعداد" : "Setup"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <div className="space-y-5 p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                {isArabic ? `إعداد ${integration.nameAr}` : `Setup ${integration.name}`}
              </DialogTitle>
              <DialogDescription>
                {setupDescription}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200/80 p-4 space-y-3 dark:border-slate-800">
                <h4 className="font-medium text-sm">
                  {isSocialIntegration
                    ? (isArabic ? "متغيرات بيئة اختيارية (Fallback):" : "Optional Environment Variables (Fallback):")
                    : (isArabic ? "المتغيرات المطلوبة:" : "Required Environment Variables:")}
                </h4>
                {integration.requiredEnvVars.map((envVar) => (
                  <div key={envVar} className="flex items-center justify-between rounded-2xl bg-muted p-2">
                    <code className="text-xs font-mono">{envVar}</code>
                    <Button
                      className={`${BUTTON_3D_CLASS} h-8 w-8 p-0`}
                      onClick={() => copyToClipboard(envVar)}
                      data-testid={`button-copy-${envVar}`}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <h4 className="font-medium text-sm text-blue-700 dark:text-blue-300 mb-2">
                  {isSocialIntegration
                    ? (isArabic ? "كيفية الإعداد:" : "How to configure:")
                    : (isArabic ? "كيفية الإضافة:" : "How to add:")}
                </h4>
                <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  {isSocialIntegration ? (
                    <>
                      <li>{isArabic ? "افتح لوحة الأدمن ثم انتقل إلى Social Platforms" : "Open Admin panel and go to Social Platforms"}</li>
                      <li>{isArabic ? "أدخل Client ID و Client Secret و Callback URL لكل مزود" : "Set Client ID, Client Secret, and Callback URL for each provider"}</li>
                      <li>{isArabic ? "فعّل المزود المطلوب ثم احفظ" : "Enable the provider and save"}</li>
                      <li>{isArabic ? "استخدم ملف .env كمصدر متغيرات البيئة الأساسي" : "Use the .env file as the primary environment source"}</li>
                    </>
                  ) : (
                    <>
                      <li>{isArabic ? "افتح ملف .env على الخادم" : "Open the .env file on your server"}</li>
                      <li>{isArabic ? "أضف كل متغير مع القيمة المناسبة" : "Add each variable with the appropriate value"}</li>
                      <li>{isArabic ? "أعد تشغيل التطبيق لتفعيل التغييرات" : "Restart the application to apply changes"}</li>
                    </>
                  )}
                </ol>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="w-3 h-3" />
                <a
                  href={integration.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {isArabic ? "اقرأ التوثيق الكامل" : "Read full documentation"}
                </a>
              </div>
            </div>

            <DialogFooter>
              <Button className={BUTTON_3D_CLASS} onClick={() => setShowSetup(false)}>
                {isArabic ? "إغلاق" : "Close"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminIntegrationsPage() {
  const { language } = useI18n();
  const isArabic = language === "ar";

  const { data: integrationStatuses, isLoading, refetch } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/admin/integrations/status"],
    queryFn: () => adminFetch("/api/admin/integrations/status"),
  });

  const integrationsWithStatus = INTEGRATIONS.map((integration) => ({
    ...integration,
    isConfigured: integrationStatuses?.[integration.id] ?? false,
  }));

  const categories = ["auth", "notification", "payment"] as const;
  const connectedCount = integrationsWithStatus.filter((integration) => integration.isConfigured).length;
  const authCount = integrationsWithStatus.filter((integration) => integration.category === "auth").length;
  const notificationCount = integrationsWithStatus.filter((integration) => integration.category === "notification").length;
  const paymentCount = integrationsWithStatus.filter((integration) => integration.category === "payment").length;

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
              <Globe className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {isArabic ? "إعدادات الربط الخارجي" : "External Integrations"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {isArabic
                  ? "اربط التطبيق بالخدمات الخارجية للحصول على ميزات إضافية"
                  : "Connect your app to external services for additional features"}
              </p>
            </div>
          </div>
          <Button className={BUTTON_3D_CLASS} onClick={() => refetch()} data-testid="button-refresh-integrations">
            <RefreshCw className="me-2 h-4 w-4" />
            {isArabic ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "الإجمالي" : "Total"}</p>
              <p className="mt-1 text-2xl font-bold">{integrationsWithStatus.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "المتصلة" : "Connected"}</p>
              <p className="mt-1 text-2xl font-bold">{connectedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "المصادقة" : "Auth"}</p>
              <p className="mt-1 text-2xl font-bold">{authCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "الإشعارات/المدفوعات" : "Notify/Pay"}</p>
              <p className="mt-1 text-2xl font-bold">{notificationCount + paymentCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category];
          const configured = integrationsWithStatus.filter(
            (i) => i.category === category && i.isConfigured
          ).length;
          const total = integrationsWithStatus.filter((i) => i.category === category).length;

          return (
            <Card key={category} className={STAT_CARD_CLASS}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <CategoryIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {isArabic ? CATEGORY_LABELS[category].ar : CATEGORY_LABELS[category].en}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {configured}/{total} {isArabic ? "مُفعّل" : "connected"}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <div className={`${SURFACE_CARD_CLASS} p-3`}>
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-[24px] bg-slate-100/80 p-1.5 md:grid-cols-4 dark:bg-slate-900/80">
            <TabsTrigger value="all" data-testid="tab-all">
              {isArabic ? "الكل" : "All"}
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger key={category} value={category} data-testid={`tab-${category}`}>
                {isArabic ? CATEGORY_LABELS[category].ar : CATEGORY_LABELS[category].en}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {integrationsWithStatus.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                isArabic={isArabic}
              />
            ))}
          </div>
        </TabsContent>

        {categories.map((category) => (
          <TabsContent key={category} value={category} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {integrationsWithStatus
                .filter((i) => i.category === category)
                .map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    isArabic={isArabic}
                  />
                ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
