import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
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
  Loader2,
  Phone,
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
    requiredEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
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

function IntegrationCard({ integration, isArabic }: { integration: IntegrationStatus; isArabic: boolean }) {
  const [showSetup, setShowSetup] = useState(false);
  const Icon = INTEGRATION_ICONS[integration.id] || Settings2;
  const isSocialIntegration = integration.category === "auth";

  const setupDescription = isSocialIntegration
    ? (isArabic
      ? "إعدادات تسجيل الدخول الاجتماعي تتم من لوحة الأدمن > Social Platforms. متغيرات البيئة أدناه اختيارية كخطة احتياط."
      : "Social login settings are managed in Admin > Social Platforms. Environment variables below are optional fallback.")
    : (isArabic
      ? "أضف المتغيرات التالية إلى ملف .env.production.local الخاص بك"
      : "Add the following environment variables to your .env.production.local file");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <Card className="relative overflow-visible">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Key className="w-3 h-3" />
              <span>
                {isSocialIntegration
                  ? (isArabic ? "تتم الإدارة من Social Platforms" : "Managed in Social Platforms")
                  : `${integration.requiredEnvVars.length} ${isArabic ? "متغيرات مطلوبة" : "variables required"}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(integration.documentationUrl, "_blank")}
                data-testid={`button-docs-${integration.id}`}
              >
                <ExternalLink className="w-3 h-3 me-1" />
                {isArabic ? "التوثيق" : "Docs"}
              </Button>
              <Button
                size="sm"
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
        <DialogContent className="max-w-lg">
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
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-medium text-sm">
                {isSocialIntegration
                  ? (isArabic ? "متغيرات بيئة اختيارية (Fallback):" : "Optional Environment Variables (Fallback):")
                  : (isArabic ? "المتغيرات المطلوبة:" : "Required Environment Variables:")}
              </h4>
              {integration.requiredEnvVars.map((envVar) => (
                <div key={envVar} className="flex items-center justify-between bg-muted rounded p-2">
                  <code className="text-xs font-mono">{envVar}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(envVar)}
                    data-testid={`button-copy-${envVar}`}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4">
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
                    <li>{isArabic ? "استخدم .env.production.local فقط كخيار احتياطي إذا لزم" : "Use .env.production.local only as fallback when needed"}</li>
                  </>
                ) : (
                  <>
                    <li>{isArabic ? "افتح ملف .env.production.local على الخادم" : "Open .env.production.local on your server"}</li>
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
            <Button variant="outline" onClick={() => setShowSetup(false)}>
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminIntegrationsPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
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

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isArabic ? "إعدادات الربط الخارجي" : "External Integrations"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isArabic
              ? "اربط التطبيق بالخدمات الخارجية للحصول على ميزات إضافية"
              : "Connect your app to external services for additional features"}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-integrations">
          <RefreshCw className="w-4 h-4 me-2" />
          {isArabic ? "تحديث" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-2 grid-cols-3">
        {categories.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category];
          const configured = integrationsWithStatus.filter(
            (i) => i.category === category && i.isConfigured
          ).length;
          const total = integrationsWithStatus.filter((i) => i.category === category).length;

          return (
            <Card key={category} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
              </div>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            {isArabic ? "الكل" : "All"}
          </TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category} data-testid={`tab-${category}`}>
              {isArabic ? CATEGORY_LABELS[category].ar : CATEGORY_LABELS[category].en}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
            <div className="grid gap-4 md:grid-cols-2">
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
