import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Settings,
  Bell,
  MessageSquare,
  CreditCard,
  Shield,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Wallet,
  Building2,
  Smartphone,
  CheckCircle,
  Clock,
  Globe,
  Award,
  Upload,
  Camera,
  IdCard,
  XCircle,
  Loader2,
  User,
} from "lucide-react";

interface P2PSettings {
  p2pUsername: string;
  p2pUsernameChangeCount: number;
  canChangeP2PUsername: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
  notifyOnTrade: boolean;
  notifyOnDispute: boolean;
  notifyOnMessage: boolean;
  preferredCurrencies: string[];
  tradeLimits: {
    minBuy: string;
    maxBuy: string;
    minSell: string;
    maxSell: string;
  };
  autoConfirmEnabled: boolean;
  autoConfirmDelayMinutes: number;
}

interface PaymentMethod {
  id: string;
  type: string;
  name: string;
  displayLabel?: string | null;
  countryCode?: string | null;
  countryPaymentMethodId?: string | null;
  accountNumber: string;
  holderName: string;
  isVerified: boolean;
  isActive: boolean;
}

interface CountryPaymentMethodOption {
  id: string;
  countryCode: string;
  name: string;
  type: "bank_transfer" | "e_wallet" | "crypto" | "card";
  minAmount: string;
  maxAmount: string;
  isAvailable: boolean;
  isActive: boolean;
}

interface P2PBadge {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  color: string;
  criteria: Record<string, unknown>;
}

const PAYMENT_TYPES = [
  { value: "bank_transfer", label: "Bank Transfer", labelAr: "تحويل بنكي", icon: Building2 },
  { value: "e_wallet", label: "E-Wallet", labelAr: "محفظة إلكترونية", icon: Wallet },
  { value: "crypto", label: "Crypto", labelAr: "عملة رقمية", icon: CreditCard },
];

const CURRENCIES = ["USD", "USDT", "EUR", "GBP", "SAR", "AED", "EGP"];

function resolveLanguageLocale(languageCode?: string): string {
  const normalizedCode = String(languageCode || "en").trim();
  const requestedLocale = normalizedCode === "ar" ? "ar-SA-u-nu-arab" : normalizedCode;

  try {
    new Intl.NumberFormat(requestedLocale);
    return requestedLocale;
  } catch {
    return "en-US";
  }
}

interface IdVerificationData {
  idVerificationStatus: string | null;
  idFrontImage: string | null;
  idBackImage: string | null;
  idVerificationRejectionReason: string | null;
  idVerifiedAt: string | null;
}

function IdVerificationSection({ language }: { language: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const numberLocale = resolveLanguageLocale(language);

  const { data: verificationData, isLoading } = useQuery<IdVerificationData>({
    queryKey: ['/api/user/id-verification'],
  });

  const submitMutation = useMutation({
    mutationFn: (data: { frontImage: string; backImage: string }) =>
      apiRequest('POST', '/api/user/id-verification', data),
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: language === 'ar' ? 'تم إرسال طلب التوثيق بنجاح' : 'ID verification request submitted successfully'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/id-verification'] });
      setFrontImage(null);
      setBackImage(null);
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const handleImageUpload = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: language === 'ar' ? 'حجم الملف يجب أن يكون أقل من 10 ميجابايت' : 'File size must be less than 10MB',
        variant: "destructive"
      });
      return;
    }

    // Validate it's actually an image
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('common.error'),
        description: language === 'ar' ? 'يرجى رفع صورة فقط' : 'Please upload an image file only',
        variant: "destructive"
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (side === 'front') {
        setFrontImage(base64);
      } else {
        setBackImage(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!frontImage || !backImage) {
      toast({
        title: t('common.error'),
        description: language === 'ar' ? 'يرجى رفع صورتي الهوية' : 'Please upload both ID images',
        variant: "destructive"
      });
      return;
    }
    submitMutation.mutate({ frontImage, backImage });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = verificationData?.idVerificationStatus;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="h-5 w-5 text-primary" />
          {t('p2p.settings.idVerification')}
        </CardTitle>
        <CardDescription>
          {t('p2p.settings.idVerificationDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === 'approved' && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-medium text-green-600">
                {t('p2p.settings.verificationApproved')}
              </p>
              <p className="text-sm text-muted-foreground">
                {verificationData?.idVerifiedAt && `${t('common.date')}: ${new Date(verificationData.idVerifiedAt).toLocaleDateString(numberLocale)}`}
              </p>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <Clock className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600">
                {t('p2p.settings.verificationPending')}
              </p>
              <p className="text-sm text-muted-foreground">
                {language === 'ar' ? 'جاري مراجعة وثائقك من قبل فريقنا' : 'Your documents are being reviewed by our team'}
              </p>
            </div>
          </div>
        )}

        {status === 'rejected' && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle className="h-6 w-6 text-red-500" />
            <div>
              <p className="font-medium text-red-600">
                {t('p2p.settings.verificationRejected')}
              </p>
              <p className="text-sm text-muted-foreground">
                {verificationData?.idVerificationRejectionReason || (language === 'ar' ? 'يرجى المحاولة مرة أخرى' : 'Please try again')}
              </p>
            </div>
          </div>
        )}

        {(!status || status === 'rejected') && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('p2p.settings.uploadIdFront')}</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {frontImage ? (
                    <div className="relative">
                      <img src={frontImage} alt="Front ID" loading="lazy" className="max-h-40 mx-auto rounded" />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 end-2"
                        onClick={() => setFrontImage(null)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload('front')}
                        data-testid="input-id-front"
                      />
                      <Camera className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">
                        {language === 'ar' ? 'انقر لرفع الصورة' : 'Click to upload'}
                      </p>
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('p2p.settings.uploadIdBack')}</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {backImage ? (
                    <div className="relative">
                      <img src={backImage} alt="Back ID" loading="lazy" className="max-h-40 mx-auto rounded" />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 end-2"
                        onClick={() => setBackImage(null)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload('back')}
                        data-testid="input-id-back"
                      />
                      <Camera className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">
                        {language === 'ar' ? 'انقر لرفع الصورة' : 'Click to upload'}
                      </p>
                    </label>
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!frontImage || !backImage || submitMutation.isPending}
              className="w-full"
              data-testid="button-submit-verification"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Upload className="h-4 w-4 me-2" />
              )}
              {t('p2p.settings.submitVerification')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function P2PSettingsPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedPaymentCountry, setSelectedPaymentCountry] = useState("ALL");
  const [p2pUsernameDraft, setP2PUsernameDraft] = useState("");
  const [newPayment, setNewPayment] = useState({
    countryPaymentMethodId: "",
    displayLabel: "",
    accountNumber: "",
    bankName: "",
    holderName: "",
  });

  const { data: settings, isLoading: loadingSettings } = useQuery<P2PSettings>({
    queryKey: ['/api/p2p/settings'],
  });

  const { data: paymentMethods, isLoading: loadingPayments } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/p2p/payment-methods'],
  });

  const { data: paymentCatalog = [] } = useQuery<CountryPaymentMethodOption[]>({
    queryKey: ['/api/payment-methods'],
  });

  const { data: badges } = useQuery<P2PBadge[]>({
    queryKey: ['/api/p2p/badges'],
  });

  useEffect(() => {
    setP2PUsernameDraft(settings?.p2pUsername || "");
  }, [settings?.p2pUsername]);

  const paymentCountryOptions = useMemo(() => {
    const defaultCountries = ["ALL", "EG", "SA", "AE", "US", "GB", "EU"];
    const countryCodes = new Set(defaultCountries);

    for (const method of paymentCatalog) {
      const normalizedCountry = String(method.countryCode || "").trim().toUpperCase();
      if (normalizedCountry) {
        countryCodes.add(normalizedCountry);
      }
    }

    return Array.from(countryCodes).sort((left, right) => {
      if (left === "ALL") return -1;
      if (right === "ALL") return 1;
      return left.localeCompare(right);
    });
  }, [paymentCatalog]);

  const availableCatalogMethods = useMemo(() => {
    const normalizedCountry = selectedPaymentCountry.toUpperCase();
    return paymentCatalog.filter((method) => {
      const methodCountryCode = String(method.countryCode || "").toUpperCase();
      if (normalizedCountry === "ALL") {
        return true;
      }

      return methodCountryCode === normalizedCountry || methodCountryCode === "ALL";
    });
  }, [paymentCatalog, selectedPaymentCountry]);

  const selectedCatalogMethod = useMemo(() => {
    return availableCatalogMethods.find((method) => method.id === newPayment.countryPaymentMethodId) || null;
  }, [availableCatalogMethods, newPayment.countryPaymentMethodId]);

  useEffect(() => {
    if (!newPayment.countryPaymentMethodId) {
      return;
    }

    const stillAvailable = availableCatalogMethods.some((method) => method.id === newPayment.countryPaymentMethodId);
    if (!stillAvailable) {
      setNewPayment((previous) => ({ ...previous, countryPaymentMethodId: "", displayLabel: "" }));
    }
  }, [availableCatalogMethods, newPayment.countryPaymentMethodId]);

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<P2PSettings>) =>
      apiRequest('PATCH', '/api/p2p/settings', data),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('p2p.settings.saved') });
      queryClient.invalidateQueries({ queryKey: ['/api/p2p/settings'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const addPaymentMutation = useMutation({
    mutationFn: (data: typeof newPayment) =>
      apiRequest('POST', '/api/p2p/payment-methods', data),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('p2p.settings.paymentAdded') });
      queryClient.invalidateQueries({ queryKey: ['/api/p2p/payment-methods'] });
      setShowAddPayment(false);
      setSelectedPaymentCountry("ALL");
      setNewPayment({ countryPaymentMethodId: "", displayLabel: "", accountNumber: "", bankName: "", holderName: "" });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/p2p/payment-methods/${id}`),
    onSuccess: () => {
      toast({ title: t('common.success'), description: t('p2p.settings.paymentDeleted') });
      queryClient.invalidateQueries({ queryKey: ['/api/p2p/payment-methods'] });
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const handleToggle = (key: "autoReplyEnabled" | "notifyOnTrade" | "notifyOnDispute" | "notifyOnMessage", value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  const normalizedUsernameDraft = p2pUsernameDraft.trim().toLowerCase();
  const p2pUsernamePattern = /^[a-z0-9_]{4,24}$/;
  const isP2PUsernameDraftValid = p2pUsernamePattern.test(normalizedUsernameDraft);
  const isP2PUsernameChanged = normalizedUsernameDraft !== (settings?.p2pUsername || "");
  const canSaveP2PUsername = Boolean(settings?.canChangeP2PUsername)
    && isP2PUsernameDraftValid
    && isP2PUsernameChanged
    && !updateSettingsMutation.isPending;

  if (loadingSettings) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded-lg w-1/3" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/p2p">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-settings-title">
            <Settings className="h-6 w-6 text-primary" />
            {t('p2p.settings.title')}
          </h1>
          <p className="text-muted-foreground">{t('p2p.settings.description')}</p>
        </div>
      </div>

      <Tabs defaultValue="verification" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-muted/50 p-2 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger
            value="verification"
            className="h-auto min-h-[48px] w-full gap-2 whitespace-normal rounded-lg border border-transparent px-2 py-2 text-center text-xs leading-tight sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            <IdCard className="h-4 w-4 shrink-0" />
            {t('p2p.settings.idVerification')}
          </TabsTrigger>
          <TabsTrigger
            value="general"
            className="h-auto min-h-[48px] w-full gap-2 whitespace-normal rounded-lg border border-transparent px-2 py-2 text-center text-xs leading-tight sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            <Settings className="h-4 w-4 shrink-0" />
            {t('p2p.settings.general')}
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="h-auto min-h-[48px] w-full gap-2 whitespace-normal rounded-lg border border-transparent px-2 py-2 text-center text-xs leading-tight sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            <Bell className="h-4 w-4 shrink-0" />
            {t('p2p.settings.notifications')}
          </TabsTrigger>
          <TabsTrigger
            value="payment"
            className="h-auto min-h-[48px] w-full gap-2 whitespace-normal rounded-lg border border-transparent px-2 py-2 text-center text-xs leading-tight sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            {t('p2p.settings.paymentMethods')}
          </TabsTrigger>
          <TabsTrigger
            value="badges"
            className="h-auto min-h-[48px] w-full gap-2 whitespace-normal rounded-lg border border-transparent px-2 py-2 text-center text-xs leading-tight sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            <Award className="h-4 w-4 shrink-0" />
            {t('p2p.settings.badges')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification" className="mt-4 space-y-4">
          <IdVerificationSection language={language} />
        </TabsContent>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{language === 'ar' ? 'اسم مستخدم P2P' : 'P2P Username'}</CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'يتم إنشاؤه تلقائياً ويظهر في الإعلانات والتعاملات. يمكن تغييره مرة واحدة فقط.'
                  : 'Auto-generated and shown in P2P ads and transactions. You can change it once only.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="p2p-username-input">{language === 'ar' ? 'اسم المستخدم' : 'Username'}</Label>
                <Input
                  id="p2p-username-input"
                  value={p2pUsernameDraft}
                  onChange={(event) => setP2PUsernameDraft(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={language === 'ar' ? 'مثال: trader_1024' : 'e.g. trader_1024'}
                  data-testid="input-p2p-username"
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar'
                    ? 'مسموح فقط بالحروف الإنجليزية الصغيرة والأرقام و _. الطول من 4 إلى 24 حرفاً.'
                    : 'Use lowercase letters, numbers, and underscore only. Length must be 4-24 characters.'}
                </p>
                {!isP2PUsernameDraftValid && normalizedUsernameDraft.length > 0 && (
                  <p className="text-xs text-destructive">
                    {language === 'ar'
                      ? 'صيغة اسم المستخدم غير صحيحة.'
                      : 'Invalid username format.'}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={settings?.canChangeP2PUsername ? "outline" : "secondary"}>
                  {settings?.canChangeP2PUsername
                    ? (language === 'ar' ? 'متاح تغيير واحد' : 'One change available')
                    : (language === 'ar' ? 'تم استهلاك التغيير' : 'Change already used')}
                </Badge>

                <Button
                  variant="outline"
                  onClick={() => updateSettingsMutation.mutate({ p2pUsername: normalizedUsernameDraft } as Partial<P2PSettings>)}
                  disabled={!canSaveP2PUsername}
                  data-testid="button-save-p2p-username"
                >
                  {t('common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('p2p.settings.autoReply')}</CardTitle>
              <CardDescription>{t('p2p.settings.autoReplyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-reply">{t('p2p.settings.enableAutoReply')}</Label>
                <Switch
                  id="auto-reply"
                  checked={settings?.autoReplyEnabled}
                  onCheckedChange={(v) => handleToggle('autoReplyEnabled', v)}
                  data-testid="switch-auto-reply"
                />
              </div>
              <div>
                <Label>{t('p2p.settings.autoReplyMessage')}</Label>
                <Textarea
                  className="mt-2"
                  placeholder={t('p2p.settings.autoReplyPlaceholder')}
                  defaultValue={settings?.autoReplyMessage}
                  data-testid="input-auto-reply-message"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('p2p.settings.tradeLimits')}</CardTitle>
              <CardDescription>{t('p2p.settings.tradeLimitsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('p2p.settings.minBuy')}</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.tradeLimits.minBuy}
                    className="mt-2"
                    data-testid="input-min-buy"
                  />
                </div>
                <div>
                  <Label>{t('p2p.settings.maxBuy')}</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.tradeLimits.maxBuy}
                    className="mt-2"
                    data-testid="input-max-buy"
                  />
                </div>
                <div>
                  <Label>{t('p2p.settings.minSell')}</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.tradeLimits.minSell}
                    className="mt-2"
                    data-testid="input-min-sell"
                  />
                </div>
                <div>
                  <Label>{t('p2p.settings.maxSell')}</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.tradeLimits.maxSell}
                    className="mt-2"
                    data-testid="input-max-sell"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('p2p.settings.preferredCurrencies')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {CURRENCIES.map(currency => (
                  <Badge
                    key={currency}
                    variant={settings?.preferredCurrencies.includes(currency) ? "default" : "outline"}
                    className="cursor-pointer"
                    data-testid={`badge-currency-${currency}`}
                  >
                    {currency}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('p2p.settings.notificationPrefs')}</CardTitle>
              <CardDescription>{t('p2p.settings.notificationDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/20">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{t('p2p.settings.tradeNotifications')}</p>
                    <p className="text-sm text-muted-foreground">{t('p2p.settings.tradeNotificationsDesc')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notifyOnTrade}
                  onCheckedChange={(v) => handleToggle('notifyOnTrade', v)}
                  data-testid="switch-notify-trade"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-500/20">
                    <Shield className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium">{t('p2p.settings.disputeNotifications')}</p>
                    <p className="text-sm text-muted-foreground">{t('p2p.settings.disputeNotificationsDesc')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notifyOnDispute}
                  onCheckedChange={(v) => handleToggle('notifyOnDispute', v)}
                  data-testid="switch-notify-dispute"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-500/20">
                    <MessageSquare className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">{t('p2p.settings.messageNotifications')}</p>
                    <p className="text-sm text-muted-foreground">{t('p2p.settings.messageNotificationsDesc')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notifyOnMessage}
                  onCheckedChange={(v) => handleToggle('notifyOnMessage', v)}
                  data-testid="switch-notify-message"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>{t('p2p.settings.paymentMethods')}</CardTitle>
                <CardDescription>{t('p2p.settings.paymentMethodsDesc')}</CardDescription>
              </div>
              <Button onClick={() => setShowAddPayment(true)} data-testid="button-add-payment">
                <Plus className="h-4 w-4 me-2" />
                {t('p2p.settings.addPayment')}
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
                </div>
              ) : paymentMethods && paymentMethods.length > 0 ? (
                <div className="space-y-3">
                  {paymentMethods.map(method => {
                    const typeInfo = PAYMENT_TYPES.find(t => t.value === method.type);
                    const Icon = typeInfo?.icon || CreditCard;
                    return (
                      <div key={method.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`payment-method-${method.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/20">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{method.displayLabel?.trim() || method.name}</p>
                              {method.countryCode ? (
                                <Badge variant="outline" className="text-[10px]">{method.countryCode}</Badge>
                              ) : null}
                              {method.isVerified && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                            {method.displayLabel?.trim() && method.displayLabel.trim() !== method.name ? (
                              <p className="text-xs text-muted-foreground">{method.name}</p>
                            ) : null}
                            <p className="text-sm text-muted-foreground">{method.accountNumber}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePaymentMutation.mutate(method.id)}
                          data-testid={`button-delete-payment-${method.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('p2p.settings.noPaymentMethods')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="badges" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('p2p.settings.availableBadges')}</CardTitle>
              <CardDescription>{t('p2p.settings.badgesDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {badges?.map(badge => (
                  <div
                    key={badge.slug}
                    className="p-4 border rounded-lg"
                    data-testid={`badge-info-${badge.slug}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="p-2 rounded-full"
                        style={{ backgroundColor: `${badge.color}20` }}
                      >
                        <Award className="h-5 w-5" style={{ color: badge.color }} />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: badge.color }}>
                          {language === 'ar' ? badge.nameAr : badge.name}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? badge.descriptionAr : badge.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('p2p.settings.addPaymentMethod')}</DialogTitle>
            <DialogDescription>{t('p2p.settings.addPaymentDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('p2p.country')}</Label>
              <Select value={selectedPaymentCountry} onValueChange={setSelectedPaymentCountry}>
                <SelectTrigger className="mt-2" data-testid="select-payment-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentCountryOptions.map((countryCode) => (
                    <SelectItem key={countryCode} value={countryCode}>
                      {countryCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('p2p.paymentMethod')}</Label>
              <Select
                value={newPayment.countryPaymentMethodId}
                onValueChange={(value) => {
                  const nextMethod = availableCatalogMethods.find((method) => method.id === value);
                  setNewPayment((previous) => ({
                    ...previous,
                    countryPaymentMethodId: value,
                    displayLabel: nextMethod?.name || "",
                  }));
                }}
              >
                <SelectTrigger className="mt-2" data-testid="select-payment-catalog-method">
                  <SelectValue placeholder={t('p2p.paymentMethod')} />
                </SelectTrigger>
                <SelectContent>
                  {availableCatalogMethods.map((method) => {
                    const typeInfo = PAYMENT_TYPES.find((type) => type.value === method.type);
                    return (
                      <SelectItem key={method.id} value={method.id}>
                        {method.name} {typeInfo ? `(${language === 'ar' ? typeInfo.labelAr : typeInfo.label})` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('p2p.settings.paymentName')}</Label>
              <Input
                className="mt-2"
                value={newPayment.displayLabel}
                onChange={(e) => setNewPayment((p) => ({ ...p, displayLabel: e.target.value }))}
                placeholder={t('p2p.settings.paymentNamePlaceholder')}
                data-testid="input-payment-display-label"
              />
            </div>

            {selectedCatalogMethod?.type === 'bank_transfer' && (
              <div>
                <Label>{t('p2p.settings.bankName')}</Label>
                <Input
                  className="mt-2"
                  value={newPayment.bankName}
                  onChange={(e) => setNewPayment(p => ({ ...p, bankName: e.target.value }))}
                  placeholder={t('p2p.settings.bankNamePlaceholder')}
                  data-testid="input-bank-name"
                />
              </div>
            )}

            {selectedCatalogMethod ? (
              <div className="rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
                <div>
                  {t('p2p.limit')}: {selectedCatalogMethod.minAmount} - {selectedCatalogMethod.maxAmount}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                {language === 'ar' ? 'اختر وسيلة دفع من القائمة أولاً.' : 'Select a payment method first.'}
              </div>
            )}

            <div>
              <Label>{t('p2p.settings.accountNumber')}</Label>
              <Input
                className="mt-2"
                value={newPayment.accountNumber}
                onChange={(e) => setNewPayment(p => ({ ...p, accountNumber: e.target.value }))}
                placeholder={t('p2p.settings.accountNumberPlaceholder')}
                data-testid="input-account-number"
              />
            </div>
            <div>
              <Label>{t('p2p.settings.holderName')}</Label>
              <Input
                className="mt-2"
                value={newPayment.holderName}
                onChange={(e) => setNewPayment(p => ({ ...p, holderName: e.target.value }))}
                placeholder={t('p2p.settings.holderNamePlaceholder')}
                data-testid="input-holder-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddPayment(false);
                setSelectedPaymentCountry("ALL");
                setNewPayment({ countryPaymentMethodId: "", displayLabel: "", accountNumber: "", bankName: "", holderName: "" });
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => addPaymentMutation.mutate(newPayment)}
              disabled={addPaymentMutation.isPending || !newPayment.countryPaymentMethodId || !newPayment.accountNumber.trim()}
            >
              <Save className="h-4 w-4 me-2" />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
