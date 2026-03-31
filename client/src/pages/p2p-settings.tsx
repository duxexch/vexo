import { useState } from "react";
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
  accountNumber: string;
  holderName: string;
  isVerified: boolean;
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

const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "KWD"];

interface IdVerificationData {
  idVerificationStatus: string | null;
  idFrontImage: string | null;
  idBackImage: string | null;
  idVerificationRejectionReason: string | null;
  idVerifiedAt: string | null;
}

function IdVerificationSection({ language }: { language: string }) {
  const { toast } = useToast();
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: verificationData, isLoading } = useQuery<IdVerificationData>({
    queryKey: ['/api/user/id-verification'],
  });

  const submitMutation = useMutation({
    mutationFn: (data: { frontImage: string; backImage: string }) =>
      apiRequest('POST', '/api/user/id-verification', data),
    onSuccess: () => {
      toast({ 
        title: language === 'ar' ? 'تم الإرسال' : 'Submitted',
        description: language === 'ar' ? 'تم إرسال طلب التوثيق بنجاح' : 'ID verification request submitted successfully'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/id-verification'] });
      setFrontImage(null);
      setBackImage(null);
    },
    onError: (err: Error) => {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: err.message, variant: "destructive" });
    }
  });

  const handleImageUpload = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'حجم الملف يجب أن يكون أقل من 10 ميجابايت' : 'File size must be less than 10MB',
        variant: "destructive"
      });
      return;
    }

    // Validate it's actually an image
    if (!file.type.startsWith('image/')) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
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
        title: language === 'ar' ? 'خطأ' : 'Error',
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
          {language === 'ar' ? 'التحقق من الهوية' : 'ID Verification'}
        </CardTitle>
        <CardDescription>
          {language === 'ar' 
            ? 'قم بتوثيق هويتك لزيادة مصداقيتك في التداولات P2P'
            : 'Verify your identity to increase your credibility in P2P trades'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === 'approved' && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-medium text-green-600">
                {language === 'ar' ? 'تم التحقق من هويتك' : 'Your ID is Verified'}
              </p>
              <p className="text-sm text-muted-foreground">
                {verificationData?.idVerifiedAt && `${language === 'ar' ? 'تم التحقق في' : 'Verified on'}: ${new Date(verificationData.idVerifiedAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <Clock className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600">
                {language === 'ar' ? 'قيد المراجعة' : 'Pending Review'}
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
                {language === 'ar' ? 'تم رفض التحقق' : 'Verification Rejected'}
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
                <Label>{language === 'ar' ? 'الوجه الأمامي للهوية' : 'Front Side of ID'}</Label>
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
                <Label>{language === 'ar' ? 'الوجه الخلفي للهوية' : 'Back Side of ID'}</Label>
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
              {language === 'ar' ? 'إرسال للتحقق' : 'Submit for Verification'}
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
  const [newPayment, setNewPayment] = useState({
    type: "bank_transfer",
    name: "",
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

  const { data: badges } = useQuery<P2PBadge[]>({
    queryKey: ['/api/p2p/badges'],
  });

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
      setNewPayment({ type: "bank_transfer", name: "", accountNumber: "", bankName: "", holderName: "" });
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

  const handleToggle = (key: keyof P2PSettings, value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

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

      <Tabs defaultValue="verification">
        <TabsList className="flex-wrap">
          <TabsTrigger value="verification">
            <IdCard className="h-4 w-4 me-1" />
            {language === 'ar' ? 'التوثيق' : 'Verification'}
          </TabsTrigger>
          <TabsTrigger value="general">
            <Settings className="h-4 w-4 me-1" />
            {t('p2p.settings.general')}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 me-1" />
            {t('p2p.settings.notifications')}
          </TabsTrigger>
          <TabsTrigger value="payment">
            <CreditCard className="h-4 w-4 me-1" />
            {t('p2p.settings.paymentMethods')}
          </TabsTrigger>
          <TabsTrigger value="badges">
            <Award className="h-4 w-4 me-1" />
            {t('p2p.settings.badges')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification" className="mt-4 space-y-4">
          <IdVerificationSection language={language} />
        </TabsContent>

        <TabsContent value="general" className="mt-4 space-y-4">
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
                              <p className="font-medium">{method.name}</p>
                              {method.isVerified && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>
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
              <Label>{t('p2p.settings.paymentType')}</Label>
              <Select value={newPayment.type} onValueChange={(v) => setNewPayment(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-2" data-testid="select-payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {language === 'ar' ? type.labelAr : type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('p2p.settings.paymentName')}</Label>
              <Input
                className="mt-2"
                value={newPayment.name}
                onChange={(e) => setNewPayment(p => ({ ...p, name: e.target.value }))}
                placeholder={t('p2p.settings.paymentNamePlaceholder')}
                data-testid="input-payment-name"
              />
            </div>
            {newPayment.type === 'bank_transfer' && (
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
            <Button variant="outline" onClick={() => setShowAddPayment(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => addPaymentMutation.mutate(newPayment)} disabled={addPaymentMutation.isPending}>
              <Save className="h-4 w-4 me-2" />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
