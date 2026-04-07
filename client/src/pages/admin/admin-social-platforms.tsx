import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  CheckCircle2,
  XCircle,
  Settings2,
  Loader2,
  Key,
  Link2,
  Phone,
  MessageSquare,
  Shield,
  Globe,
  Save,
  Plus,
  Trash2,
  Power,
  PowerOff,
} from "lucide-react";
import { SiGoogle, SiFacebook, SiTelegram, SiWhatsapp, SiX, SiApple, SiDiscord, SiLinkedin, SiGithub, SiTiktok, SiInstagram } from "react-icons/si";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  if (!token) {
    window.location.href = "/admin/login";
    throw new Error("No auth token");
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("adminToken");
    window.location.href = "/admin/login";
    throw new Error("Session expired");
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const baseMessage =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as Record<string, unknown>).error === "string"
        ? (payload as Record<string, unknown>).error as string
        : typeof payload === "string" && payload.trim().length > 0
          ? payload.trim()
          : `Request failed (${res.status})`);

    const details =
      (payload && typeof payload === "object" && "details" in payload && Array.isArray((payload as Record<string, unknown>).details)
        ? ((payload as Record<string, unknown>).details as unknown[])
            .map((item) => (item && typeof item === "object" && "message" in item && typeof (item as Record<string, unknown>).message === "string"
              ? (item as Record<string, unknown>).message as string
              : ""))
            .filter(Boolean)
            .join("; ")
        : "");

    const message = details ? `${baseMessage}: ${details}` : baseMessage;
    throw new Error(message);
  }

  return payload;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown error";
}

interface SocialPlatform {
  id: string;
  name: string;
  displayName: string;
  displayNameAr: string | null;
  icon: string;
  type: "oauth" | "otp" | "both";
  isEnabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  webhookUrl: string | null;
  callbackUrl: string | null;
  botToken: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  otpEnabled: boolean;
  otpTemplate: string | null;
  otpExpiry: number;
  sortOrder: number;
  settings: string | null;
}

const PLATFORM_ICONS: Record<string, any> = {
  SiGoogle: SiGoogle,
  SiFacebook: SiFacebook,
  SiTelegram: SiTelegram,
  SiWhatsapp: SiWhatsapp,
  SiX: SiX,
  SiApple: SiApple,
  SiDiscord: SiDiscord,
  SiLinkedin: SiLinkedin,
  SiGithub: SiGithub,
  SiTiktok: SiTiktok,
  SiInstagram: SiInstagram,
  Phone: Phone,
  Globe: Globe,
};

const PLATFORM_FIELDS: Record<string, { label: string; labelAr: string; fields: string[] }> = {
  google: {
    label: "Google OAuth",
    labelAr: "مصادقة جوجل",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  facebook: {
    label: "Facebook Login",
    labelAr: "تسجيل دخول فيسبوك",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  telegram: {
    label: "Telegram Bot",
    labelAr: "بوت تيليجرام",
    fields: ["botToken", "webhookUrl"],
  },
  whatsapp: {
    label: "WhatsApp Business",
    labelAr: "واتساب للأعمال",
    fields: ["phoneNumberId", "businessAccountId", "accessToken", "otpTemplate"],
  },
  twitter: {
    label: "Twitter/X OAuth",
    labelAr: "مصادقة تويتر",
    fields: ["apiKey", "apiSecret", "callbackUrl"],
  },
  apple: {
    label: "Apple Sign-In",
    labelAr: "تسجيل دخول آبل",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  discord: {
    label: "Discord OAuth",
    labelAr: "مصادقة ديسكورد",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  linkedin: {
    label: "LinkedIn OAuth",
    labelAr: "مصادقة لينكدإن",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  github: {
    label: "GitHub OAuth",
    labelAr: "مصادقة جيت هاب",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  tiktok: {
    label: "TikTok Business",
    labelAr: "تيك توك للأعمال",
    fields: ["clientId", "clientSecret", "callbackUrl"],
  },
  instagram: {
    label: "Instagram Graph API",
    labelAr: "API إنستجرام",
    fields: ["clientId", "clientSecret", "accessToken", "callbackUrl"],
  },
  sms: {
    label: "SMS Provider",
    labelAr: "مزود الرسائل النصية",
    fields: ["apiKey", "apiSecret", "phoneNumberId", "otpTemplate"],
  },
};

const FIELD_LABELS: Record<string, { en: string; ar: string }> = {
  clientId: { en: "Client ID", ar: "معرف العميل" },
  clientSecret: { en: "Client Secret", ar: "سر العميل" },
  apiKey: { en: "API Key", ar: "مفتاح API" },
  apiSecret: { en: "API Secret", ar: "سر API" },
  webhookUrl: { en: "Webhook URL", ar: "رابط Webhook" },
  callbackUrl: { en: "Callback URL", ar: "رابط الاستدعاء" },
  botToken: { en: "Bot Token", ar: "توكن البوت" },
  phoneNumberId: { en: "Phone Number ID", ar: "معرف رقم الهاتف" },
  businessAccountId: { en: "Business Account ID", ar: "معرف حساب الأعمال" },
  accessToken: { en: "Access Token", ar: "توكن الوصول" },
  refreshToken: { en: "Refresh Token", ar: "توكن التجديد" },
  otpTemplate: { en: "OTP Message Template", ar: "قالب رسالة OTP" },
  otpExpiry: { en: "OTP Expiry (seconds)", ar: "مدة صلاحية OTP (ثانية)" },
};

function PlatformCard({
  platform,
  isArabic,
  onToggle,
  onEdit,
  onDelete,
  isToggling,
}: {
  platform: SocialPlatform;
  isArabic: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isToggling: boolean;
}) {
  const Icon = PLATFORM_ICONS[platform.icon] || Globe;
  
  // Check configuration status based on platform type
  const p = platform as SocialPlatform & Record<string, unknown>;
  const isOAuthConfigured = !!p.has_clientId && !!p.has_clientSecret;
  const isOtpConfigured = platform.type === "otp" 
    ? !!(p.has_apiKey || p.has_botToken || p.has_accessToken)
    : true;
  const isFullyConfigured = platform.type === "oauth" 
    ? isOAuthConfigured
    : platform.type === "otp"
    ? isOtpConfigured
    : isOAuthConfigured && isOtpConfigured;

  return (
    <Card className="relative overflow-visible hover-elevate">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${platform.isEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
              <Icon className={`w-6 h-6 ${platform.isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {isArabic ? platform.displayNameAr || platform.displayName : platform.displayName}
                <Badge variant={platform.isEnabled ? "default" : "secondary"} className="text-xs">
                  {platform.isEnabled 
                    ? (isArabic ? "مفعّل" : "Enabled") 
                    : (isArabic ? "معطّل" : "Disabled")}
                </Badge>
                {platform.isEnabled && (
                  <Badge 
                    variant={isFullyConfigured ? "outline" : "destructive"} 
                    className={`text-xs ${isFullyConfigured ? 'border-green-500 text-green-600' : ''}`}
                  >
                    {isFullyConfigured
                      ? (isArabic ? "مُهيّأ" : "Configured")
                      : (isArabic ? "غير مُهيّأ" : "Not configured")}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5 flex items-center gap-2">
                {platform.type === "oauth" && (
                  <Badge variant="outline" className="text-xs">
                    <Shield className="w-3 h-3 me-1" />
                    {isArabic ? "تسجيل دخول" : "Login"}
                  </Badge>
                )}
                {platform.type === "otp" && (
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="w-3 h-3 me-1" />
                    OTP
                  </Badge>
                )}
                {platform.type === "both" && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      <Shield className="w-3 h-3 me-1" />
                      {isArabic ? "تسجيل دخول" : "Login"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <MessageSquare className="w-3 h-3 me-1" />
                      OTP
                    </Badge>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              data-testid={`button-edit-${platform.name}`}
            >
              <Settings2 className="w-4 h-4 me-1" />
              {isArabic ? "الإعدادات" : "Settings"}
            </Button>
            <Button
              variant={platform.isEnabled ? "destructive" : "default"}
              size="sm"
              onClick={onToggle}
              disabled={isToggling}
              data-testid={`button-toggle-${platform.name}`}
            >
              {isToggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : platform.isEnabled ? (
                <>
                  <PowerOff className="w-4 h-4 me-1" />
                  {isArabic ? "إيقاف" : "Disable"}
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 me-1" />
                  {isArabic ? "تفعيل" : "Enable"}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              data-testid={`button-delete-${platform.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function PlatformSettingsDialog({
  platform,
  isOpen,
  onClose,
  isArabic,
  onSave,
  isSaving,
}: {
  platform: SocialPlatform | null;
  isOpen: boolean;
  onClose: () => void;
  isArabic: boolean;
  onSave: (data: Partial<SocialPlatform>) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<Partial<SocialPlatform>>({});

  // Populate form data whenever platform or dialog open state changes
  useEffect(() => {
    if (platform && isOpen) {
      setFormData({
        clientId: platform.clientId || "",
        clientSecret: platform.clientSecret || "",
        apiKey: platform.apiKey || "",
        apiSecret: platform.apiSecret || "",
        webhookUrl: platform.webhookUrl || "",
        callbackUrl: platform.callbackUrl || "",
        botToken: platform.botToken || "",
        phoneNumberId: platform.phoneNumberId || "",
        businessAccountId: platform.businessAccountId || "",
        accessToken: platform.accessToken || "",
        refreshToken: platform.refreshToken || "",
        otpEnabled: platform.otpEnabled,
        otpTemplate: platform.otpTemplate || "",
        otpExpiry: platform.otpExpiry,
        type: platform.type,
      });
    }
  }, [platform, isOpen]);

  if (!platform) return null;

  const platformConfig = PLATFORM_FIELDS[platform.name] || { label: platform.displayName, labelAr: platform.displayNameAr, fields: [] };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            {isArabic ? `إعدادات ${platform.displayNameAr || platform.displayName}` : `${platform.displayName} Settings`}
          </DialogTitle>
          <DialogDescription>
            {isArabic 
              ? "قم بتكوين إعدادات المصادقة والتكامل لهذه المنصة" 
              : "Configure authentication and integration settings for this platform"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <Label>{isArabic ? "نوع الاستخدام" : "Usage Type"}</Label>
              <Select
                value={formData.type || platform.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as "oauth" | "otp" | "both" })}
              >
                <SelectTrigger className="w-48" data-testid="select-platform-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oauth">{isArabic ? "تسجيل دخول فقط" : "Login Only"}</SelectItem>
                  <SelectItem value="otp">{isArabic ? "OTP فقط" : "OTP Only"}</SelectItem>
                  <SelectItem value="both">{isArabic ? "تسجيل دخول + OTP" : "Login + OTP"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {platformConfig.fields.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>
                  {isArabic ? FIELD_LABELS[field]?.ar : FIELD_LABELS[field]?.en}
                </Label>
                {field === "otpTemplate" ? (
                  <Textarea
                    id={field}
                    value={(formData as Record<string, unknown>)[field] as string || ""}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                    placeholder={isArabic ? "رمز التحقق الخاص بك هو: {{code}}" : "Your verification code is: {{code}}"}
                    data-testid={`input-${field}`}
                  />
                ) : (
                  <Input
                    id={field}
                    type={field.toLowerCase().includes("secret") || field.toLowerCase().includes("token") || field.toLowerCase().includes("key") ? "password" : "text"}
                    value={(formData as Record<string, unknown>)[field] as string || ""}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                    placeholder={isArabic ? FIELD_LABELS[field]?.ar : FIELD_LABELS[field]?.en}
                    data-testid={`input-${field}`}
                  />
                )}
              </div>
            ))}

            {(platform.type === "otp" || platform.type === "both" || formData.type === "otp" || formData.type === "both") && (
              <>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>{isArabic ? "تفعيل OTP" : "Enable OTP"}</Label>
                    <p className="text-xs text-muted-foreground">
                      {isArabic ? "السماح بإرسال رموز التحقق عبر هذه المنصة" : "Allow sending verification codes via this platform"}
                    </p>
                  </div>
                  <Switch
                    checked={formData.otpEnabled ?? platform.otpEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, otpEnabled: checked })}
                    data-testid="switch-otp-enabled"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otpExpiry">
                    {isArabic ? FIELD_LABELS.otpExpiry.ar : FIELD_LABELS.otpExpiry.en}
                  </Label>
                  <Input
                    id="otpExpiry"
                    type="number"
                    value={formData.otpExpiry ?? platform.otpExpiry}
                    onChange={(e) => setFormData({ ...formData, otpExpiry: parseInt(e.target.value) || 300 })}
                    placeholder="300"
                    data-testid="input-otp-expiry"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-settings">
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => onSave(formData)} disabled={isSaving} data-testid="button-save-settings">
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin me-2" />
            ) : (
              <Save className="w-4 h-4 me-2" />
            )}
            {isArabic ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSocialPlatformsPage() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const isArabic = language === "ar";

  const [editingPlatform, setEditingPlatform] = useState<SocialPlatform | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingPlatform, setDeletingPlatform] = useState<SocialPlatform | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPlatform, setNewPlatform] = useState({
    name: "",
    displayName: "",
    displayNameAr: "",
    type: "oauth" as "oauth" | "otp" | "both",
    icon: "SiGoogle",
  });

  const { data: platforms, isLoading } = useQuery<SocialPlatform[]>({
    queryKey: ["/api/admin/social-platforms"],
    queryFn: () => adminFetch("/api/admin/social-platforms"),
    enabled: !!getAdminToken(),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      setTogglingId(id);
      return adminFetch(`/api/admin/social-platforms/${id}/toggle`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-platforms"] });
      toast({
        title: isArabic ? "تم التحديث" : "Updated",
        description: isArabic ? "تم تغيير حالة المنصة" : "Platform status changed",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description: isArabic ? "فشل تغيير حالة المنصة" : "Failed to change platform status",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SocialPlatform> }) => {
      return adminFetch(`/api/admin/social-platforms/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-platforms"] });
      setEditingPlatform(null);
      toast({
        title: isArabic ? "تم الحفظ" : "Saved",
        description: isArabic ? "تم حفظ إعدادات المنصة" : "Platform settings saved",
      });
    },
    onError: (error: unknown) => {
      const details = getErrorMessage(error);
      toast({
        title: isArabic ? "خطأ" : "Error",
        description: isArabic
          ? `فشل حفظ الإعدادات: ${details}`
          : `Failed to save settings: ${details}`,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newPlatform) => {
      return adminFetch("/api/admin/social-platforms", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-platforms"] });
      setShowAddDialog(false);
      setNewPlatform({
        name: "",
        displayName: "",
        displayNameAr: "",
        type: "oauth",
        icon: "SiGoogle",
      });
      toast({
        title: isArabic ? "تمت الإضافة" : "Added",
        description: isArabic ? "تمت إضافة المنصة بنجاح" : "Platform added successfully",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description: isArabic ? "فشل إضافة المنصة" : "Failed to add platform",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminFetch(`/api/admin/social-platforms/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-platforms"] });
      setDeletingPlatform(null);
      toast({
        title: isArabic ? "تم الحذف" : "Deleted",
        description: isArabic ? "تم حذف المنصة بنجاح" : "Platform deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "خطأ" : "Error",
        description: isArabic ? "فشل حذف المنصة" : "Failed to delete platform",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const enabledPlatforms = platforms?.filter((p) => p.isEnabled) || [];
  const disabledPlatforms = platforms?.filter((p) => !p.isEnabled) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isArabic ? "منصات التواصل الاجتماعي" : "Social Platforms"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isArabic 
              ? "إدارة منصات تسجيل الدخول وإرسال رموز التحقق OTP" 
              : "Manage login platforms and OTP verification providers"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {enabledPlatforms.length} {isArabic ? "مفعّل" : "enabled"}
          </Badge>
          <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-platform">
            <Plus className="w-4 h-4 me-2" />
            {isArabic ? "إضافة منصة" : "Add Platform"}
          </Button>
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isArabic ? "إضافة منصة جديدة" : "Add New Platform"}
            </DialogTitle>
            <DialogDescription>
              {isArabic 
                ? "أدخل تفاصيل المنصة الجديدة" 
                : "Enter the details for the new platform"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{isArabic ? "الاسم (معرف)" : "Name (identifier)"}</Label>
              <Input
                id="name"
                value={newPlatform.name}
                onChange={(e) => setNewPlatform({ ...newPlatform, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="e.g., discord"
                data-testid="input-new-platform-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">{isArabic ? "اسم العرض (English)" : "Display Name"}</Label>
              <Input
                id="displayName"
                value={newPlatform.displayName}
                onChange={(e) => setNewPlatform({ ...newPlatform, displayName: e.target.value })}
                placeholder="e.g., Discord"
                data-testid="input-new-platform-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayNameAr">{isArabic ? "اسم العرض (عربي)" : "Display Name (Arabic)"}</Label>
              <Input
                id="displayNameAr"
                value={newPlatform.displayNameAr}
                onChange={(e) => setNewPlatform({ ...newPlatform, displayNameAr: e.target.value })}
                placeholder="ديسكورد"
                data-testid="input-new-platform-display-name-ar"
              />
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "النوع" : "Type"}</Label>
              <Select
                value={newPlatform.type}
                onValueChange={(v) => setNewPlatform({ ...newPlatform, type: v as "oauth" | "otp" | "both" })}
              >
                <SelectTrigger data-testid="select-new-platform-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oauth">OAuth</SelectItem>
                  <SelectItem value="otp">OTP</SelectItem>
                  <SelectItem value="both">{isArabic ? "كلاهما" : "Both"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "الأيقونة" : "Icon"}</Label>
              <Select
                value={newPlatform.icon}
                onValueChange={(v) => setNewPlatform({ ...newPlatform, icon: v })}
              >
                <SelectTrigger data-testid="select-new-platform-icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SiGoogle">Google</SelectItem>
                  <SelectItem value="SiFacebook">Facebook</SelectItem>
                  <SelectItem value="SiTelegram">Telegram</SelectItem>
                  <SelectItem value="SiWhatsapp">WhatsApp</SelectItem>
                  <SelectItem value="SiX">X (Twitter)</SelectItem>
                  <SelectItem value="SiApple">Apple</SelectItem>
                  <SelectItem value="SiDiscord">Discord</SelectItem>
                  <SelectItem value="SiLinkedin">LinkedIn</SelectItem>
                  <SelectItem value="SiGithub">GitHub</SelectItem>
                  <SelectItem value="SiTiktok">TikTok</SelectItem>
                  <SelectItem value="SiInstagram">Instagram</SelectItem>
                  <SelectItem value="Phone">SMS</SelectItem>
                  <SelectItem value="Globe">{isArabic ? "عام" : "Generic"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button 
              onClick={() => createMutation.mutate(newPlatform)} 
              disabled={createMutation.isPending || !newPlatform.name || !newPlatform.displayName}
              data-testid="button-confirm-add"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin me-2" />
              ) : (
                <Plus className="w-4 h-4 me-2" />
              )}
              {isArabic ? "إضافة" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {enabledPlatforms.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            {isArabic ? "المنصات المفعّلة" : "Enabled Platforms"}
          </h2>
          <div className="grid gap-4">
            {enabledPlatforms.map((platform) => (
              <PlatformCard
                key={platform.id}
                platform={platform}
                isArabic={isArabic}
                onToggle={() => toggleMutation.mutate(platform.id)}
                onEdit={() => setEditingPlatform(platform)}
                onDelete={() => setDeletingPlatform(platform)}
                isToggling={togglingId === platform.id}
              />
            ))}
          </div>
        </div>
      )}

      {disabledPlatforms.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <XCircle className="w-5 h-5 text-muted-foreground" />
            {isArabic ? "المنصات المعطّلة" : "Disabled Platforms"}
          </h2>
          <div className="grid gap-4">
            {disabledPlatforms.map((platform) => (
              <PlatformCard
                key={platform.id}
                platform={platform}
                isArabic={isArabic}
                onToggle={() => toggleMutation.mutate(platform.id)}
                onEdit={() => setEditingPlatform(platform)}
                onDelete={() => setDeletingPlatform(platform)}
                isToggling={togglingId === platform.id}
              />
            ))}
          </div>
        </div>
      )}

      <PlatformSettingsDialog
        platform={editingPlatform}
        isOpen={!!editingPlatform}
        onClose={() => setEditingPlatform(null)}
        isArabic={isArabic}
        onSave={(data) => {
          if (editingPlatform) {
            updateMutation.mutate({ id: editingPlatform.id, data });
          }
        }}
        isSaving={updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingPlatform} onOpenChange={(open) => { if (!open) setDeletingPlatform(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {isArabic ? "حذف المنصة" : "Delete Platform"}
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? `هل أنت متأكد من حذف "${deletingPlatform?.displayName}"؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to delete "${deletingPlatform?.displayName}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingPlatform(null)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingPlatform) {
                  deleteMutation.mutate(deletingPlatform.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin me-2" />
              ) : (
                <Trash2 className="w-4 h-4 me-2" />
              )}
              {isArabic ? "حذف" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
