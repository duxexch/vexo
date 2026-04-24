import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGuidedFocus } from "@/hooks/use-guided-focus";
import { WORLD_CURRENCIES, formatCurrencyLabel } from "@/lib/currencies";

// Hook so PreferencesSection can access (avoids prop drilling)
function useCurrencies() { return { WORLD_CURRENCIES, formatCurrencyLabel }; }

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Shield, Settings2, Loader2, Monitor, Smartphone, Globe, Trash2, LogOut, CheckCircle, KeyRound, Camera, Users, ImageIcon, Volume2, VolumeX, ShieldCheck, Mail, Copy } from "lucide-react";
import { BlockedMutedSettings } from "@/components/BlockedMutedSettings";
import { useSoundEffects } from "@/hooks/use-sound-effects";
import {
  DOMINO_SPEED_MODES,
  setDominoSpeedMode,
  useDominoSpeedMode,
  type DominoSpeedMode,
} from "@/lib/domino-speed";
import { format } from "date-fns";
import QRCode from "qrcode";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type ProfileSecurityMethod = "two_factor" | "email" | "phone";

type UpdateProfilePayload = ProfileFormValues & {
  securityMethod?: ProfileSecurityMethod;
  securityCode?: string;
};

type UpdateProfileError = Error & {
  code?: string;
  allowedMethods?: ProfileSecurityMethod[];
};

const PROFILE_SECURITY_METHODS: ProfileSecurityMethod[] = ["two_factor", "email", "phone"];

function isProfileSecurityMethod(value: unknown): value is ProfileSecurityMethod {
  return typeof value === "string" && PROFILE_SECURITY_METHODS.includes(value as ProfileSecurityMethod);
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface UserPreferences {
  language: string;
  currency: string;
  countryCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  city?: string | null;
  addressLine?: string | null;
  notifyAnnouncements: boolean;
  notifyTransactions: boolean;
  notifyPromotions: boolean;
  notifyP2P: boolean;
  hideSpectatorChat?: boolean;
}

type GeoCountryOption = {
  code: string;
  name: string;
};

type GeoRegionOption = {
  code: string;
  name: string;
  countryCode: string;
};

interface LoginHistoryEntry {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  status: string;
}

interface UserSession {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  lastActiveAt: string;
  isCurrent: boolean;
  createdAt: string;
}

interface TwoFactorStatus {
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
}

interface TwoFactorSetupResponse {
  secret: string;
  otpauthUri: string;
}

interface TwoFactorVerifySetupResponse {
  success: boolean;
  backupCodes: string[];
}

interface TwoFactorSendBackupResponse {
  success: boolean;
  sentTo: string;
  backupCodesRemaining: number;
}

function ProfileSection() {
  const { user, updateUser, token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const headers = useAuthHeaders();

  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [pendingSecureUpdate, setPendingSecureUpdate] = useState<ProfileFormValues | null>(null);
  const [securityAllowedMethods, setSecurityAllowedMethods] = useState<ProfileSecurityMethod[]>([]);
  const [selectedSecurityMethod, setSelectedSecurityMethod] = useState<ProfileSecurityMethod>("two_factor");
  const [securityCode, setSecurityCode] = useState("");
  const [isSendingSecurityCode, setIsSendingSecurityCode] = useState(false);
  const [securityOtpSent, setSecurityOtpSent] = useState(false);
  const [editingContact, setEditingContact] = useState<"email" | "phone" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const profileSubmitButtonRef = useRef<HTMLButtonElement | null>(null);
  const profileSecurityCodeInputRef = useRef<HTMLInputElement | null>(null);
  const profileSecurityConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const { focusAndScroll, queueFocus } = useGuidedFocus();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      phone: user?.phone || "",
    },
  });

  const extractProfileValues = (payload: UpdateProfilePayload): ProfileFormValues => ({
    firstName: payload.firstName || "",
    lastName: payload.lastName || "",
    email: payload.email || "",
    phone: payload.phone || "",
  });

  useEffect(() => {
    form.reset({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setEditingContact(null);
  }, [form, user?.firstName, user?.lastName, user?.email, user?.phone]);

  useEffect(() => {
    if (!editingContact) return;
    if (editingContact === "email") {
      queueFocus(emailInputRef.current);
      return;
    }
    queueFocus(phoneInputRef.current);
  }, [editingContact]);

  const maskEmailValue = (value: string): string => {
    const normalized = value.trim();
    const [localPart = "", domainPart = ""] = normalized.split("@");
    if (!localPart || !domainPart) return "***";
    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}***@${domainPart}`;
  };

  const maskPhoneValue = (value: string): string => {
    const normalized = value.trim();
    if (normalized.length <= 4) return "****";
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  };

  const startContactEdit = (type: "email" | "phone") => {
    setEditingContact(type);
    resetSecurityChallenge();
    if (type === "email") {
      form.setValue("email", "", { shouldDirty: false });
      return;
    }
    form.setValue("phone", "", { shouldDirty: false });
  };

  const cancelContactEdit = (type: "email" | "phone") => {
    setEditingContact((prev) => (prev === type ? null : prev));
    if (type === "email") {
      form.setValue("email", user?.email || "", { shouldDirty: false });
      return;
    }
    form.setValue("phone", user?.phone || "", { shouldDirty: false });
  };

  const resetSecurityChallenge = () => {
    setPendingSecureUpdate(null);
    setSecurityAllowedMethods([]);
    setSelectedSecurityMethod("two_factor");
    setSecurityCode("");
    setSecurityOtpSent(false);
  };

  const getSecurityMethodLabel = (method: ProfileSecurityMethod) => {
    if (method === "two_factor") return t("settings.twoFactorAuth") || "2FA";
    if (method === "email") return t("settings.contactTypeEmail") || "Email";
    return t("settings.contactTypePhone") || "Phone";
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfilePayload) => {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });

      const responseData = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!res.ok) {
        const error = new Error(
          typeof responseData?.error === "string" ? responseData.error : "Failed to update profile"
        ) as UpdateProfileError;
        if (typeof responseData?.errorCode === "string") {
          error.code = responseData.errorCode;
        }
        if (Array.isArray(responseData?.allowedMethods)) {
          error.allowedMethods = responseData.allowedMethods.filter(isProfileSecurityMethod);
        }
        throw error;
      }

      return responseData;
    },
    onSuccess: (data) => {
      updateUser(data as Parameters<typeof updateUser>[0]);
      setEditingContact(null);
      resetSecurityChallenge();
      toast({ title: t("common.success"), description: t("settings.profileUpdated") });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: unknown, variables: UpdateProfilePayload) => {
      const typedError = error as UpdateProfileError;

      if (typedError.code === "SECURITY_VERIFICATION_REQUIRED") {
        const allowedMethods = Array.isArray(typedError.allowedMethods)
          ? typedError.allowedMethods.filter(isProfileSecurityMethod)
          : [];
        const nextAllowedMethods: ProfileSecurityMethod[] = allowedMethods.length > 0
          ? allowedMethods
          : ["email", "phone"];
        const preferredMethod: ProfileSecurityMethod = nextAllowedMethods.includes("two_factor")
          ? "two_factor"
          : nextAllowedMethods[0];

        setPendingSecureUpdate(extractProfileValues(variables));
        setSecurityAllowedMethods(nextAllowedMethods);
        setSelectedSecurityMethod(preferredMethod);
        setSecurityCode("");
        setSecurityOtpSent(false);

        toast({
          title: t("settings.security") || "Security",
          description: t("settings.verificationDescription"),
        });
        return;
      }

      toast({ title: t("common.error"), description: t("settings.profileUpdateFailed"), variant: "destructive" });
    },
  });

  const handleSendSecurityCode = async () => {
    if (!pendingSecureUpdate) return;
    if (selectedSecurityMethod !== "email" && selectedSecurityMethod !== "phone") return;

    const contactValue = selectedSecurityMethod === "email" ? user?.email : user?.phone;
    if (!contactValue) {
      toast({ title: t("common.error"), description: t("settings.profileUpdateFailed"), variant: "destructive" });
      return;
    }

    setIsSendingSecurityCode(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ contactType: selectedSecurityMethod, contactValue }),
      });

      const data = await res.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send security code");
      }

      setSecurityOtpSent(true);
      queueFocus(profileSecurityCodeInputRef.current);
      toast({
        title: t("common.success"),
        description: data?.message || t("settings.otpSent"),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("settings.profileUpdateFailed");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setIsSendingSecurityCode(false);
    }
  };

  const handleProfileSubmit = (data: ProfileFormValues) => {
    const normalizedEmail = (data.email || "").trim();
    const normalizedPhone = (data.phone || "").trim();

    if (editingContact === "email" && !normalizedEmail) {
      toast({ title: t("common.error"), description: t("validation.fillAllFields"), variant: "destructive" });
      queueFocus(emailInputRef.current);
      return;
    }

    if (editingContact === "phone" && !normalizedPhone) {
      toast({ title: t("common.error"), description: t("validation.fillAllFields"), variant: "destructive" });
      queueFocus(phoneInputRef.current);
      return;
    }

    resetSecurityChallenge();
    updateProfileMutation.mutate({
      ...data,
      email: normalizedEmail,
      phone: normalizedPhone,
    });
  };

  const handleProfileInvalid = (errors: Partial<Record<keyof ProfileFormValues, unknown>>) => {
    if (errors.firstName) {
      form.setFocus("firstName");
      return;
    }
    if (errors.lastName) {
      form.setFocus("lastName");
      return;
    }
    if (errors.email) {
      queueFocus(emailInputRef.current);
      return;
    }
    if (errors.phone) {
      queueFocus(phoneInputRef.current);
    }
  };

  const handleConfirmSecureProfileUpdate = () => {
    if (!pendingSecureUpdate) return;
    if (!selectedSecurityMethod || securityCode.trim().length < 4) {
      focusAndScroll(profileSecurityCodeInputRef.current);
      return;
    }

    updateProfileMutation.mutate({
      ...pendingSecureUpdate,
      securityMethod: selectedSecurityMethod,
      securityCode: securityCode.trim(),
    });
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("common.error"), description: t("settings.fileTooLarge") || "File size must be less than 5MB", variant: "destructive" });
      return;
    }

    setIsUploadingPicture(true);
    try {
      const base64 = await convertToBase64(file);
      const res = await fetch("/api/user/profile-picture", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ profilePicture: base64 }),
      });
      if (!res.ok) throw new Error("Failed to upload");
      const data = await res.json();
      updateUser(data.user);
      toast({ title: t("common.success"), description: t("settings.profilePictureUpdated") || "Profile picture updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch {
      toast({ title: t("common.error"), description: t("settings.uploadFailed") || "Failed to upload profile picture", variant: "destructive" });
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleCoverPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("common.error"), description: t("settings.fileTooLarge") || "File size must be less than 10MB", variant: "destructive" });
      return;
    }

    setIsUploadingCover(true);
    try {
      const base64 = await convertToBase64(file);
      const res = await fetch("/api/user/cover-photo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ coverPhoto: base64 }),
      });
      if (!res.ok) throw new Error("Failed to upload");
      const data = await res.json();
      updateUser(data.user);
      toast({ title: t("common.success"), description: t("settings.coverPhotoUpdated") || "Cover photo updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch {
      toast({ title: t("common.error"), description: t("settings.uploadFailed") || "Failed to upload cover photo", variant: "destructive" });
    } finally {
      setIsUploadingCover(false);
    }
  };

  const getUserInitials = () => {
    const first = user?.firstName?.[0] || '';
    const last = user?.lastName?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          {t("settings.profile")}
        </CardTitle>
        <CardDescription>{t("settings.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-16">
          <div
            className="h-32 rounded-lg bg-gradient-to-r from-primary/20 to-primary/40 relative overflow-hidden cursor-pointer group"
            onClick={() => coverInputRef.current?.click()}
            data-testid="button-cover-photo"
          >
            {user?.coverPhoto ? (
              <img
                src={user.coverPhoto}
                alt="Cover"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {isUploadingCover ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <div className="text-white flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  <span className="text-sm">{t("settings.changeCover") || "Change Cover"}</span>
                </div>
              )}
            </div>
            <input
              type="file"
              ref={coverInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleCoverPhotoUpload}
              data-testid="input-cover-photo"
            />
          </div>

          <div className="absolute -bottom-12 start-4">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={user?.profilePicture || undefined} alt={user?.firstName || "Profile"} />
                <AvatarFallback className="text-2xl bg-primary/10">{getUserInitials()}</AvatarFallback>
              </Avatar>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleProfilePictureUpload}
                data-testid="input-profile-picture"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute bottom-0 end-0 h-8 w-8 rounded-full shadow-md"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPicture}
                aria-label="Upload profile picture"
                data-testid="button-upload-picture"
              >
                {isUploadingPicture ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleProfileSubmit, handleProfileInvalid)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.firstName")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("settings.firstNamePlaceholder")}
                        data-testid="input-firstname"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          form.setFocus("lastName");
                        }}
                        enterKeyHint="next"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.lastName")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("settings.lastNamePlaceholder")}
                        data-testid="input-lastname"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          queueFocus(emailInputRef.current || profileSubmitButtonRef.current);
                        }}
                        enterKeyHint="next"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("auth.email")}</FormLabel>
                    {user?.email && (
                      user?.emailVerified ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle className="w-3 h-3 me-1" />
                          {t("settings.verified") || "Verified"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                          {t("settings.unverified") || "Unverified"}
                        </Badge>
                      )
                    )}
                  </div>
                  {user?.email && editingContact !== "email" ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2" data-testid="masked-email-display">
                      <p className="text-sm font-medium">{maskEmailValue(user.email)}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startContactEdit("email")}
                        data-testid="button-change-email"
                      >
                        {t("common.change") || "Change"}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <FormControl>
                        <Input
                          {...field}
                          ref={emailInputRef}
                          type="email"
                          placeholder="email@example.com"
                          data-testid="input-email"
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            queueFocus(phoneInputRef.current || profileSubmitButtonRef.current);
                          }}
                          enterKeyHint="next"
                        />
                      </FormControl>
                      {user?.email && editingContact === "email" && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelContactEdit("email")}
                            data-testid="button-cancel-change-email"
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("auth.phone")}</FormLabel>
                    {user?.phone && (
                      user?.phoneVerified ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle className="w-3 h-3 me-1" />
                          {t("settings.verified") || "Verified"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                          {t("settings.unverified") || "Unverified"}
                        </Badge>
                      )
                    )}
                  </div>
                  {user?.phone && editingContact !== "phone" ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2" data-testid="masked-phone-display">
                      <p className="text-sm font-medium">{maskPhoneValue(user.phone)}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startContactEdit("phone")}
                        data-testid="button-change-phone"
                      >
                        {t("common.change") || "Change"}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <FormControl>
                        <Input
                          {...field}
                          ref={phoneInputRef}
                          type="tel"
                          placeholder="+1234567890"
                          data-testid="input-phone"
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            queueFocus(profileSubmitButtonRef.current);
                          }}
                          inputMode="tel"
                          enterKeyHint="done"
                        />
                      </FormControl>
                      {user?.phone && editingContact === "phone" && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelContactEdit("phone")}
                            data-testid="button-cancel-change-phone"
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              ref={profileSubmitButtonRef}
              type="submit"
              className="w-full sm:w-auto min-h-11"
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>

            {pendingSecureUpdate && securityAllowedMethods.length > 0 && (
              <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-4" data-testid="profile-security-challenge">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t("settings.security")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.verificationDescription")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {securityAllowedMethods.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant={selectedSecurityMethod === method ? "default" : "outline"}
                      onClick={() => {
                        setSelectedSecurityMethod(method);
                        setSecurityCode("");
                        setSecurityOtpSent(false);
                      }}
                      data-testid={`button-profile-security-method-${method}`}
                    >
                      {getSecurityMethodLabel(method)}
                    </Button>
                  ))}
                </div>

                {(selectedSecurityMethod === "email" || selectedSecurityMethod === "phone") && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendSecurityCode}
                      disabled={isSendingSecurityCode}
                      data-testid="button-send-profile-security-otp"
                    >
                      {isSendingSecurityCode && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t("settings.resendCode")}
                    </Button>
                    {securityOtpSent && (
                      <p className="text-xs text-muted-foreground">{t("settings.otpSent")}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {selectedSecurityMethod === "two_factor"
                      ? t("settings.twoFactorCode")
                      : t("settings.verificationCodeLabel")}
                  </Label>
                  <Input
                    ref={profileSecurityCodeInputRef}
                    value={securityCode}
                    onChange={(e) => setSecurityCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      queueFocus(profileSecurityConfirmButtonRef.current);
                    }}
                    placeholder={t("settings.otpPlaceholder")}
                    inputMode="numeric"
                    enterKeyHint="done"
                    maxLength={12}
                    data-testid="input-profile-security-code"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetSecurityChallenge}
                    disabled={updateProfileMutation.isPending}
                    className="flex-1"
                    data-testid="button-cancel-profile-security"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    ref={profileSecurityConfirmButtonRef}
                    type="button"
                    onClick={handleConfirmSecureProfileUpdate}
                    disabled={updateProfileMutation.isPending || securityCode.trim().length < 4}
                    className="flex-1"
                    data-testid="button-confirm-profile-security"
                  >
                    {updateProfileMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t("common.confirm")}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function VerificationSection() {
  const { user, token, updateUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const headers = useAuthHeaders();
  const OTP_RESEND_COOLDOWN_SECONDS = 5 * 60;

  const [verifyingType, setVerifyingType] = useState<"email" | "phone" | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [lastOtpMessage, setLastOtpMessage] = useState<string | null>(null);
  const [expectedOtpLength, setExpectedOtpLength] = useState(6);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [resendReadyAtByType, setResendReadyAtByType] = useState<Record<"email" | "phone", number>>({
    email: 0,
    phone: 0,
  });
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const otpVerifyButtonRef = useRef<HTMLButtonElement | null>(null);
  const { focusAndScroll, queueFocus } = useGuidedFocus();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!showOtpInput) return;
    queueFocus(otpInputRef.current);
  }, [showOtpInput]);

  const maskEmailValue = (value: string): string => {
    const normalized = value.trim();
    const [localPart = "", domainPart = ""] = normalized.split("@");
    if (!localPart || !domainPart) return "***";
    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}***@${domainPart}`;
  };

  const maskPhoneValue = (value: string): string => {
    const normalized = value.trim();
    if (normalized.length <= 4) return "****";
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  };

  const getContactTypeLabel = (type: "email" | "phone") => {
    return type === "email" ? t("settings.contactTypeEmail") : t("settings.contactTypePhone");
  };

  const setResendCooldown = (type: "email" | "phone", seconds: number) => {
    const normalizedSeconds = Math.max(0, Math.floor(seconds));
    setResendReadyAtByType((prev) => ({
      ...prev,
      [type]: Date.now() + normalizedSeconds * 1000,
    }));
  };

  const getResendRemainingSeconds = (type: "email" | "phone") => {
    return Math.max(0, Math.ceil((resendReadyAtByType[type] - nowTs) / 1000));
  };

  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  };

  const handleSendOtp = async (type: "email" | "phone") => {
    const contactValue = type === "email" ? user?.email : user?.phone;
    if (!contactValue) {
      setLastOtpMessage(null);
      toast({
        title: t("common.error") || "Error",
        description: t("settings.addContactFirst", { type: getContactTypeLabel(type) }),
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    setVerifyingType(type);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ contactType: type, contactValue }),
      });
      const data = await res.json().catch(() => null) as {
        error?: string;
        message?: string;
        devOtp?: string;
        resendAfter?: number;
        retryAfter?: number;
        otpLength?: number;
      } | null;

      if (!res.ok) {
        const retryAfterSeconds = typeof data?.retryAfter === "number" ? data.retryAfter : 0;
        if (retryAfterSeconds > 0) {
          setShowOtpInput(true);
          setResendCooldown(type, retryAfterSeconds);
        }
        setLastOtpMessage(null);
        throw new Error(data?.error || "Failed to send OTP");
      }

      setShowOtpInput(true);
      setResendCooldown(type, typeof data?.resendAfter === "number" ? data.resendAfter : OTP_RESEND_COOLDOWN_SECONDS);
      setExpectedOtpLength(Math.max(4, Math.min(12, Number(data?.otpLength || 6))));
      setLastOtpMessage(data?.message || null);
      if (data?.devOtp) {
        setDevOtp(data.devOtp);
      }
      toast({
        title: t("common.success") || "Success",
        description: data?.message || t("settings.otpSent")
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: t("common.error") || "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!verifyingType || !otpCode) {
      focusAndScroll(otpInputRef.current);
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ contactType: verifyingType, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: t("common.success") || "Success",
        description: data.message
      });

      // Refresh user data in auth context and query cache
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // Reset state
      setShowOtpInput(false);
      if (verifyingType) {
        setResendCooldown(verifyingType, 0);
      }
      setVerifyingType(null);
      setOtpCode("");
      setDevOtp(null);
      setLastOtpMessage(null);
      setExpectedOtpLength(6);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: t("common.error") || "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel = () => {
    setShowOtpInput(false);
    setVerifyingType(null);
    setOtpCode("");
    setDevOtp(null);
    setLastOtpMessage(null);
    setExpectedOtpLength(6);
  };

  const resendRemainingSeconds = verifyingType ? getResendRemainingSeconds(verifyingType) : 0;

  const hasUnverifiedContacts = (user?.email && !user?.emailVerified) || (user?.phone && !user?.phoneVerified);

  if (!hasUnverifiedContacts) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t("settings.verification") || "Contact Verification"}
        </CardTitle>
        <CardDescription>
          {t("settings.verificationDescription") || "Verify your email and phone number to secure your account."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showOtpInput ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/15 p-2 text-primary">
                  {verifyingType === "phone" ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {t("settings.enterVerificationCode", {
                      type: verifyingType ? getContactTypeLabel(verifyingType) : "",
                    })}
                  </p>
                  {lastOtpMessage && (
                    <p className="text-xs text-muted-foreground">{lastOtpMessage}</p>
                  )}
                  {devOtp && (
                    <p className="text-xs text-muted-foreground">
                      (Dev mode) OTP: <span className="font-mono font-bold">{devOtp}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('settings.verificationCodeLabel')}</Label>
              <Input
                ref={otpInputRef}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  queueFocus(otpVerifyButtonRef.current);
                }}
                placeholder={t('settings.otpPlaceholder')}
                inputMode="numeric"
                className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                enterKeyHint="done"
                maxLength={expectedOtpLength}
                data-testid="input-otp-code"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {resendRemainingSeconds > 0
                  ? t("settings.resendCodeIn", { time: formatCountdown(resendRemainingSeconds) })
                  : t("settings.resendCodeReady")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => verifyingType && handleSendOtp(verifyingType)}
                disabled={!verifyingType || isSending || resendRemainingSeconds > 0}
                data-testid="button-resend-otp"
              >
                {isSending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("settings.resendCode")}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isVerifying}
                className="flex-1"
                data-testid="button-cancel-verify"
              >
                {t('common.cancel')}
              </Button>
              <Button
                ref={otpVerifyButtonRef}
                onClick={handleVerifyOtp}
                disabled={isVerifying || otpCode.length !== expectedOtpLength}
                className="flex-1"
                data-testid="button-verify-otp"
              >
                {isVerifying && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('settings.verify')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {user?.email && !user?.emailVerified && (
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/15 p-2 text-primary">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{maskEmailValue(user.email)}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.emailNotVerified')}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSendOtp("email")}
                    disabled={isSending}
                    className="shrink-0"
                    data-testid="button-verify-email"
                  >
                    {isSending && verifyingType === "email" && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('settings.verify')}
                  </Button>
                </div>
              </div>
            )}
            {user?.phone && !user?.phoneVerified && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-muted p-2">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{maskPhoneValue(user.phone)}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.phoneNotVerified')}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSendOtp("phone")}
                    disabled={isSending}
                    className="shrink-0"
                    data-testid="button-verify-phone"
                  >
                    {isSending && verifyingType === "phone" && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('settings.verify')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SoundSettingsSection() {
  const { t } = useI18n();
  const { enabled, volume, toggle, setVolume, play } = useSoundEffects();

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold flex items-center gap-2">
        {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {t('settings.soundEffects') || 'Sound Effects'}
      </Label>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>{t('settings.enableSounds') || 'Enable Sounds'}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.enableSoundsDesc') || 'Play sound effects for game actions and notifications'}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
          />
        </div>
        {enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('settings.volume') || 'Volume'}</Label>
              <span className="text-sm text-muted-foreground">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => play('click')}>
                {t('settings.testClick') || 'Click'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => play('success')}>
                {t('settings.testSuccess') || 'Success'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => play('notification')}>
                {t('settings.testNotification') || 'Notification'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => play('coin')}>
                {t('settings.testCoin') || 'Coin'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => play('win')}>
                {t('settings.testWin') || 'Win'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GameSpeedSection() {
  const { t } = useI18n();
  const speedMode = useDominoSpeedMode();

  const handleChange = (value: string) => {
    if (DOMINO_SPEED_MODES.includes(value as DominoSpeedMode)) {
      setDominoSpeedMode(value as DominoSpeedMode);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">
        {t("settings.gameSpeed") || "Game Speed"}
      </Label>
      <p className="text-sm text-muted-foreground">
        {t("settings.gameSpeedDescription")
          || "Controls how quickly domino animations play. Faster modes shrink the wait between moves."}
      </p>
      <Select value={speedMode} onValueChange={handleChange}>
        <SelectTrigger className="w-full md:w-[220px]" data-testid="select-game-speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal" data-testid="option-game-speed-normal">
            {t("settings.gameSpeedNormal") || "Normal"}
          </SelectItem>
          <SelectItem value="fast" data-testid="option-game-speed-fast">
            {t("settings.gameSpeedFast") || "Fast"}
          </SelectItem>
          <SelectItem value="turbo" data-testid="option-game-speed-turbo">
            {t("settings.gameSpeedTurbo") || "Turbo"}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PreferencesSection() {
  const { t, language, setLanguage } = useI18n();
  const { toast } = useToast();
  const headers = useAuthHeaders();
  const { WORLD_CURRENCIES, formatCurrencyLabel } = useCurrencies();
  const [cityDraft, setCityDraft] = useState("");
  const [addressLineDraft, setAddressLineDraft] = useState("");

  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/user/preferences"],
  });

  const selectedCountryCode = String(preferences?.countryCode || "").trim().toUpperCase();
  const selectedRegionCode = selectedCountryCode
    ? String(preferences?.regionCode || "").trim().toUpperCase() || "__all__"
    : "__all__";

  const { data: countries = [] } = useQuery<GeoCountryOption[]>({
    queryKey: ["/api/users/search/meta/countries"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/search/meta/countries");
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
  });

  const { data: regions = [] } = useQuery<GeoRegionOption[]>({
    queryKey: ["/api/users/search/meta/regions", selectedCountryCode],
    queryFn: async () => {
      const params = new URLSearchParams({ countryCode: selectedCountryCode });
      const res = await apiRequest("GET", `/api/users/search/meta/regions?${params.toString()}`);
      return res.json();
    },
    enabled: selectedCountryCode.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: Partial<UserPreferences>) => {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update preferences");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("settings.preferencesUpdated") });
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.preferencesUpdateFailed"), variant: "destructive" });
    },
  });

  const handleLanguageChange = (newLang: "en" | "ar") => {
    setLanguage(newLang);
    updatePreferencesMutation.mutate({ language: newLang });
  };

  const handleCurrencyChange = (currency: string) => {
    updatePreferencesMutation.mutate({ currency });
  };

  const handleNotificationToggle = (key: keyof UserPreferences, value: boolean) => {
    updatePreferencesMutation.mutate({ [key]: value });
  };

  useEffect(() => {
    setCityDraft(String(preferences?.city || ""));
    setAddressLineDraft(String(preferences?.addressLine || ""));
  }, [preferences?.city, preferences?.addressLine]);

  const handleLocationCountryChange = (value: string) => {
    const countryCode = value === "__all__" ? null : value;
    updatePreferencesMutation.mutate({
      countryCode,
      regionCode: null,
      regionName: null,
    });
  };

  const handleLocationRegionChange = (value: string) => {
    if (value === "__all__") {
      updatePreferencesMutation.mutate({
        regionCode: null,
        regionName: null,
      });
      return;
    }

    const region = regions.find((item) => item.code === value);
    updatePreferencesMutation.mutate({
      regionCode: value,
      regionName: region?.name || value,
    });
  };

  const persistLocationText = (key: "city" | "addressLine", value: string) => {
    const normalized = value.trim();
    const currentValue = String(preferences?.[key] || "").trim();
    if (normalized === currentValue) {
      return;
    }
    updatePreferencesMutation.mutate({ [key]: normalized.length > 0 ? normalized : null });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          {t("settings.preferences")}
        </CardTitle>
        <CardDescription>{t("settings.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t("settings.language")}</Label>
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-full md:w-[200px]" data-testid="select-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en" data-testid="option-language-en">English</SelectItem>
              <SelectItem value="ar" data-testid="option-language-ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("settings.currency")}</Label>
          <Select value={preferences?.currency || "USD"} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="w-full md:w-[280px]" data-testid="select-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {WORLD_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{formatCurrencyLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label className="text-base font-semibold">{t("settings.location")}</Label>
            <p className="text-sm text-muted-foreground">{t("settings.locationDescription")}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("settings.locationCountry")}</Label>
              <Select
                value={selectedCountryCode || "__all__"}
                onValueChange={handleLocationCountryChange}
              >
                <SelectTrigger data-testid="select-location-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("settings.locationRegion")}</Label>
              <Select
                value={selectedRegionCode}
                onValueChange={handleLocationRegionChange}
                disabled={!selectedCountryCode}
              >
                <SelectTrigger data-testid="select-location-region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  {regions.map((region) => (
                    <SelectItem key={region.code} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("settings.locationCity")}</Label>
              <Input
                value={cityDraft}
                onChange={(e) => setCityDraft(e.target.value)}
                onBlur={() => persistLocationText("city", cityDraft)}
                data-testid="input-location-city"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.locationAddressLine")}</Label>
              <Input
                value={addressLineDraft}
                onChange={(e) => setAddressLineDraft(e.target.value)}
                onBlur={() => persistLocationText("addressLine", addressLineDraft)}
                data-testid="input-location-address"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("settings.locationHint")}</p>
        </div>

        <SoundSettingsSection />

        <GameSpeedSection />

        <div className="space-y-4">
          <Label className="text-base font-semibold">{t("settings.notifications")}</Label>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{t("settings.notifyAnnouncements")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.notifyAnnouncementsDesc")}</p>
              </div>
              <Switch
                checked={preferences?.notifyAnnouncements ?? true}
                onCheckedChange={(checked) => handleNotificationToggle("notifyAnnouncements", checked)}
                data-testid="switch-notify-announcements"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{t("settings.notifyTransactions")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.notifyTransactionsDesc")}</p>
              </div>
              <Switch
                checked={preferences?.notifyTransactions ?? true}
                onCheckedChange={(checked) => handleNotificationToggle("notifyTransactions", checked)}
                data-testid="switch-notify-transactions"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{t("settings.notifyPromotions")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.notifyPromotionsDesc")}</p>
              </div>
              <Switch
                checked={preferences?.notifyPromotions ?? true}
                onCheckedChange={(checked) => handleNotificationToggle("notifyPromotions", checked)}
                data-testid="switch-notify-promotions"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{t("settings.notifyP2P")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.notifyP2PDesc")}</p>
              </div>
              <Switch
                checked={preferences?.notifyP2P ?? true}
                onCheckedChange={(checked) => handleNotificationToggle("notifyP2P", checked)}
                data-testid="switch-notify-p2p"
              />
            </div>
            {/* Task #17: per-user toggle to hide spectator chat in the
                in-game chat panel. Default off — players see everything
                with the spectator badge so context is preserved; turning
                this on filters spectator messages out entirely. */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>
                  {language === "ar"
                    ? "إخفاء دردشة المتفرجين"
                    : "Hide spectator chat"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "أخفِ رسائل المتفرجين في لوحة دردشة المباراة وشاهد دردشة اللاعبين فقط."
                    : "Hide viewer messages in the in-game chat panel and see only player chat."}
                </p>
              </div>
              <Switch
                checked={preferences?.hideSpectatorChat ?? false}
                onCheckedChange={(checked) => handleNotificationToggle("hideSpectatorChat", checked)}
                data-testid="switch-hide-spectator-chat"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PrivacySection() {
  const { user, updateUser, token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { stealthMode?: boolean; isOnline?: boolean }) => {
      const res = await fetch("/api/user/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (data) => {
      updateUser(data);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: t('common.updated'),
        description: t('settings.visibilityUpdated')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.updateFailed'),
        variant: "destructive"
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t('settings.privacyVisibility')}
        </CardTitle>
        <CardDescription>
          {t('settings.privacyDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>{t('settings.stealthMode')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.stealthModeDescription')}
            </p>
          </div>
          <Switch
            checked={user?.stealthMode ?? false}
            onCheckedChange={(checked) => updateStatusMutation.mutate({ stealthMode: checked })}
            disabled={updateStatusMutation.isPending}
            data-testid="switch-stealth-mode"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>{t('settings.currentStatus')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.currentStatusDescription')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user?.stealthMode ? (
              <Badge variant="secondary" data-testid="badge-status-hidden">
                {t('settings.statusHidden')}
              </Badge>
            ) : user?.isOnline ? (
              <Badge className="bg-green-600" data-testid="badge-status-online">
                {t('settings.statusOnline')}
              </Badge>
            ) : (
              <Badge variant="secondary" data-testid="badge-status-offline">
                {t('settings.statusOffline')}
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-muted/50">
          <p className="text-sm text-muted-foreground">
            {t('settings.stealthModeExplanation')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const headers = useAuthHeaders();

  const [twoFactorSetupData, setTwoFactorSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState<string | null>(null);
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState("");
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState("");
  const [gmailBackupPassword, setGmailBackupPassword] = useState("");
  const changePasswordButtonRef = useRef<HTMLButtonElement | null>(null);
  const twoFactorVerifySetupButtonRef = useRef<HTMLButtonElement | null>(null);
  const gmailBackupPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const gmailBackupButtonRef = useRef<HTMLButtonElement | null>(null);
  const disableTwoFactorPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const disableTwoFactorButtonRef = useRef<HTMLButtonElement | null>(null);
  const withdrawalNewPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const withdrawalConfirmPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const withdrawalLoginPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const withdrawalSetButtonRef = useRef<HTMLButtonElement | null>(null);
  const { focusAndScroll, queueFocus } = useGuidedFocus();

  const maskEmailValue = (value: string): string => {
    const normalized = value.trim();
    const [localPart = "", domainPart = ""] = normalized.split("@");
    if (!localPart || !domainPart) return "***";
    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}***@${domainPart}`;
  };

  const normalizedEmail = (user?.email || "").trim().toLowerCase();
  const hasLinkedGmail = normalizedEmail.endsWith("@gmail.com") || normalizedEmail.endsWith("@googlemail.com");

  useEffect(() => {
    let active = true;
    const otpauthUri = twoFactorSetupData?.otpauthUri;

    if (!otpauthUri) {
      setTwoFactorQrDataUrl(null);
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    }).then((qrDataUrl) => {
      if (active) {
        setTwoFactorQrDataUrl(qrDataUrl);
      }
    }).catch(() => {
      if (active) {
        setTwoFactorQrDataUrl(null);
      }
    });

    return () => {
      active = false;
    };
  }, [twoFactorSetupData?.otpauthUri]);

  const { data: twoFactorStatus, isLoading: twoFactorStatusLoading } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/auth/2fa/status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/2fa/status", {
        method: "GET",
        headers,
      });
      if (!res.ok) throw new Error("Failed to load 2FA status");
      return res.json();
    },
  });

  const startTwoFactorSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to start 2FA setup" }));
        throw new Error(error.error || "Failed to start 2FA setup");
      }
      return res.json() as Promise<TwoFactorSetupResponse>;
    },
    onSuccess: (data) => {
      setTwoFactorSetupData(data);
      setTwoFactorQrDataUrl(null);
      setTwoFactorSetupCode("");
      setNewBackupCodes([]);
      toast({ title: t("common.success"), description: t("settings.twoFactorSetupReady") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const verifyTwoFactorSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/2fa/verify-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: twoFactorSetupCode }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to verify 2FA setup" }));
        throw new Error(error.error || "Failed to verify 2FA setup");
      }
      return res.json() as Promise<TwoFactorVerifySetupResponse>;
    },
    onSuccess: (data) => {
      setTwoFactorSetupData(null);
      setTwoFactorQrDataUrl(null);
      setTwoFactorSetupCode("");
      setNewBackupCodes(data.backupCodes || []);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/2fa/status"] });
      toast({ title: t("common.success"), description: t("settings.twoFactorEnabledSuccess") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const disableTwoFactorMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: disableTwoFactorPassword }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to disable 2FA" }));
        throw new Error(error.error || "Failed to disable 2FA");
      }
      return res.json();
    },
    onSuccess: () => {
      setDisableTwoFactorPassword("");
      setNewBackupCodes([]);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/2fa/status"] });
      toast({ title: t("common.success"), description: t("settings.twoFactorDisabledSuccess") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const sendGmailBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/2fa/send-backup-to-gmail", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: gmailBackupPassword }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to send backup codes" }));
        throw new Error(error.error || "Failed to send backup codes");
      }
      return res.json() as Promise<TwoFactorSendBackupResponse>;
    },
    onSuccess: (data) => {
      setGmailBackupPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/2fa/status"] });
      toast({ title: t("common.success"), description: `${t("settings.gmailBackupSent")} ${data.sentTo}` });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const copyBackupCodes = async () => {
    if (!newBackupCodes.length || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(newBackupCodes.join("\n"));
      toast({ title: t("common.success"), description: t("settings.backupCodesCopied") });
    } catch {
      toast({ title: t("common.error"), description: t("settings.backupCodesCopyFailed"), variant: "destructive" });
    }
  };

  // Load withdrawal password state from user preferences
  const { data: secPrefs } = useQuery<{ withdrawalPasswordEnabled?: boolean }>({
    queryKey: ["/api/user/preferences"],
  });
  const [withdrawalPasswordEnabled, setWithdrawalPasswordEnabled] = useState(false);

  // Sync with server value when loaded
  useEffect(() => {
    if (secPrefs?.withdrawalPasswordEnabled !== undefined) {
      setWithdrawalPasswordEnabled(secPrefs.withdrawalPasswordEnabled);
    }
  }, [secPrefs?.withdrawalPasswordEnabled]);

  const [showSetWithdrawalPassword, setShowSetWithdrawalPassword] = useState(false);
  const [withdrawalPasswordForm, setWithdrawalPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
    currentLoginPassword: ""
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormValues) => {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers,
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("settings.passwordChanged") });
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handlePasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate(data);
  };

  const handlePasswordInvalid = (errors: Partial<Record<keyof PasswordFormValues, unknown>>) => {
    if (errors.currentPassword) {
      passwordForm.setFocus("currentPassword");
      return;
    }
    if (errors.newPassword) {
      passwordForm.setFocus("newPassword");
      return;
    }
    if (errors.confirmPassword) {
      passwordForm.setFocus("confirmPassword");
    }
  };

  const setWithdrawalPasswordMutation = useMutation({
    mutationFn: async (data: { password: string; loginPassword: string }) => {
      const res = await fetch("/api/user/withdrawal-password", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to set withdrawal password");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t('settings.withdrawalPasswordSetSuccess') });
      setShowSetWithdrawalPassword(false);
      setWithdrawalPasswordForm({ newPassword: "", confirmPassword: "", currentLoginPassword: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t('settings.withdrawalPasswordSetFailed'), variant: "destructive" });
    },
  });

  const { data: loginHistory, isLoading: historyLoading } = useQuery<LoginHistoryEntry[]>({
    queryKey: ["/api/user/login-history"],
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<UserSession[]>({
    queryKey: ["/api/user/sessions"],
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/user/sessions/${sessionId}/revoke`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to revoke session");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("settings.sessionRevoked") });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sessions"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.sessionRevokeFailed"), variant: "destructive" });
    },
  });

  const revokeAllSessionsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/sessions/revoke-all", {
        method: "POST",
        headers,
        body: JSON.stringify({ exceptCurrent: true }),
      });
      if (!res.ok) throw new Error("Failed to revoke sessions");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("settings.allSessionsRevoked") });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sessions"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.sessionRevokeFailed"), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!showSetWithdrawalPassword) return;
    queueFocus(withdrawalNewPasswordInputRef.current);
  }, [showSetWithdrawalPassword]);

  const handleSetWithdrawalPassword = () => {
    if (withdrawalPasswordForm.newPassword !== withdrawalPasswordForm.confirmPassword) {
      toast({ title: t("common.error"), description: t('validation.passwordsMismatch'), variant: "destructive" });
      focusAndScroll(withdrawalConfirmPasswordInputRef.current);
      return;
    }
    if (!withdrawalPasswordForm.newPassword) {
      toast({ title: t("common.error"), description: t('validation.fillAllFields'), variant: "destructive" });
      focusAndScroll(withdrawalNewPasswordInputRef.current);
      return;
    }
    if (!withdrawalPasswordForm.currentLoginPassword) {
      toast({ title: t("common.error"), description: t('validation.fillAllFields'), variant: "destructive" });
      focusAndScroll(withdrawalLoginPasswordInputRef.current);
      return;
    }

    setWithdrawalPasswordMutation.mutate({
      password: withdrawalPasswordForm.newPassword,
      loginPassword: withdrawalPasswordForm.currentLoginPassword
    });
  };

  const getDeviceIcon = (deviceInfo: string) => {
    const lower = deviceInfo?.toLowerCase() || "";
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
      return <Smartphone className="h-4 w-4" />;
    }
    if (lower.includes("mac") || lower.includes("windows") || lower.includes("linux")) {
      return <Monitor className="h-4 w-4" />;
    }
    return <Globe className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("settings.changePassword")}
          </CardTitle>
          <CardDescription>{t("settings.changePasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit, handlePasswordInvalid)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.currentPassword")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        data-testid="input-current-password"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          passwordForm.setFocus("newPassword");
                        }}
                        enterKeyHint="next"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.newPassword")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        data-testid="input-new-password"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          passwordForm.setFocus("confirmPassword");
                        }}
                        enterKeyHint="next"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.confirmPassword")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        data-testid="input-confirm-password"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          queueFocus(changePasswordButtonRef.current);
                        }}
                        enterKeyHint="done"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button ref={changePasswordButtonRef} type="submit" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
                {changePasswordMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("settings.updatePassword")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("settings.twoFactorAuth")}
          </CardTitle>
          <CardDescription>{t("settings.twoFactorAuthDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFactorStatusLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3 bg-muted/40">
                <div className="flex items-center gap-2">
                  <Badge variant={twoFactorStatus?.enabled ? "default" : "secondary"}>
                    {twoFactorStatus?.enabled ? t("settings.twoFactorEnabled") : t("settings.twoFactorDisabled")}
                  </Badge>
                  {twoFactorStatus?.verifiedAt && (
                    <span className="text-xs text-muted-foreground">
                      {t("settings.twoFactorVerifiedAt")} {format(new Date(twoFactorStatus.verifiedAt), "PPp")}
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {t("settings.twoFactorBackupRemaining")}: {twoFactorStatus?.backupCodesRemaining ?? 0}
                </span>
              </div>

              {!twoFactorStatus?.enabled && !twoFactorSetupData && (
                <Button
                  onClick={() => startTwoFactorSetupMutation.mutate()}
                  disabled={startTwoFactorSetupMutation.isPending}
                  data-testid="button-two-factor-start-setup"
                >
                  {startTwoFactorSetupMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("settings.twoFactorSetupStart")}
                </Button>
              )}

              {!twoFactorStatus?.enabled && twoFactorSetupData && (
                <div className="space-y-4 rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">{t("settings.twoFactorSetupStep1")}</p>

                  <div className="rounded-md border bg-background/30 p-3">
                    <div className="mx-auto flex min-h-[220px] w-[220px] items-center justify-center rounded-md bg-background p-2">
                      {twoFactorQrDataUrl ? (
                        <img
                          src={twoFactorQrDataUrl}
                          alt={t("settings.twoFactorAuth")}
                          className="h-[200px] w-[200px]"
                          data-testid="img-two-factor-qr"
                        />
                      ) : (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("settings.twoFactorSecret")}</Label>
                    <Input
                      value={twoFactorSetupData.secret}
                      readOnly
                      data-testid="input-two-factor-secret"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="two-factor-setup-code">{t("settings.twoFactorCode")}</Label>
                    <Input
                      id="two-factor-setup-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={twoFactorSetupCode}
                      onChange={(e) => setTwoFactorSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        queueFocus(twoFactorVerifySetupButtonRef.current);
                      }}
                      placeholder={t("settings.otpPlaceholder")}
                      enterKeyHint="done"
                      data-testid="input-two-factor-setup-code"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      ref={twoFactorVerifySetupButtonRef}
                      onClick={() => verifyTwoFactorSetupMutation.mutate()}
                      disabled={verifyTwoFactorSetupMutation.isPending || twoFactorSetupCode.length !== 6}
                      data-testid="button-two-factor-verify-setup"
                    >
                      {verifyTwoFactorSetupMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t("settings.twoFactorVerifyAndEnable")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTwoFactorSetupData(null);
                        setTwoFactorQrDataUrl(null);
                        setTwoFactorSetupCode("");
                      }}
                      data-testid="button-two-factor-cancel-setup"
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {newBackupCodes.length > 0 && (
                <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" data-testid="two-factor-backup-codes">
                  <div>
                    <p className="font-medium">{t("settings.twoFactorBackupCodes")}</p>
                    <p className="text-sm text-muted-foreground">{t("settings.twoFactorBackupCodesDescription")}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {newBackupCodes.map((code) => (
                      <Badge key={code} variant="secondary" className="justify-center py-1 text-xs tracking-wide">
                        {code}
                      </Badge>
                    ))}
                  </div>
                  <Button variant="outline" onClick={copyBackupCodes} data-testid="button-copy-backup-codes">
                    <Copy className="me-2 h-4 w-4" />
                    {t("settings.copyBackupCodes")}
                  </Button>
                </div>
              )}

              {twoFactorStatus?.enabled && (
                <>
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{t("settings.gmailBackup")}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("settings.gmailBackupDescription")}</p>

                    <div className="space-y-2">
                      <Label>{t("settings.gmailBackupAddress")}</Label>
                      <Input
                        value={user?.email ? maskEmailValue(user.email) : ""}
                        readOnly
                        placeholder={t("settings.gmailBackupMissing")}
                        data-testid="input-gmail-backup-address"
                      />
                    </div>

                    {!hasLinkedGmail && (
                      <p className="text-sm text-destructive" data-testid="text-gmail-required-warning">
                        {t("settings.gmailBackupRequired")}
                      </p>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="gmail-backup-password">{t("settings.gmailBackupPassword")}</Label>
                      <Input
                        ref={gmailBackupPasswordInputRef}
                        id="gmail-backup-password"
                        type="password"
                        value={gmailBackupPassword}
                        onChange={(e) => setGmailBackupPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          queueFocus(gmailBackupButtonRef.current);
                        }}
                        placeholder={t("settings.currentPassword")}
                        enterKeyHint="done"
                        data-testid="input-gmail-backup-password"
                      />
                    </div>

                    <Button
                      ref={gmailBackupButtonRef}
                      onClick={() => sendGmailBackupMutation.mutate()}
                      disabled={sendGmailBackupMutation.isPending || !hasLinkedGmail || !gmailBackupPassword}
                      data-testid="button-send-gmail-backup"
                    >
                      {sendGmailBackupMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t("settings.gmailBackupSend")}
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="font-medium">{t("settings.twoFactorDisable")}</p>
                    <p className="text-sm text-muted-foreground">{t("settings.twoFactorDisableDescription")}</p>
                    <div className="space-y-2">
                      <Label htmlFor="disable-two-factor-password">{t("settings.twoFactorDisablePassword")}</Label>
                      <Input
                        ref={disableTwoFactorPasswordInputRef}
                        id="disable-two-factor-password"
                        type="password"
                        value={disableTwoFactorPassword}
                        onChange={(e) => setDisableTwoFactorPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          queueFocus(disableTwoFactorButtonRef.current);
                        }}
                        placeholder={t("settings.currentPassword")}
                        enterKeyHint="done"
                        data-testid="input-disable-two-factor-password"
                      />
                    </div>
                    <Button
                      ref={disableTwoFactorButtonRef}
                      variant="destructive"
                      onClick={() => disableTwoFactorMutation.mutate()}
                      disabled={disableTwoFactorMutation.isPending || !disableTwoFactorPassword}
                      data-testid="button-disable-two-factor"
                    >
                      {disableTwoFactorMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t("settings.twoFactorDisableConfirm")}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.activeSessions")}</CardTitle>
          <CardDescription>{t("settings.activeSessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`session-item-${session.id}`}
                >
                  <div className="flex w-full items-center gap-3 sm:w-auto">
                    {getDeviceIcon(session.deviceInfo)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {session.deviceInfo || t("settings.unknownDevice")}
                        {session.isCurrent && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 me-1" />
                            {t("settings.currentSession")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground break-all sm:break-normal">
                        {session.ipAddress} • {t("settings.lastActive")}: {format(new Date(session.lastActiveAt), "PPp")}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="self-end min-h-[44px] min-w-[44px]"
                      onClick={() => revokeSessionMutation.mutate(session.id)}
                      disabled={revokeSessionMutation.isPending}
                      aria-label="Revoke session"
                      data-testid={`button-revoke-session-${session.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {sessions.length > 1 && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => revokeAllSessionsMutation.mutate()}
                  disabled={revokeAllSessionsMutation.isPending}
                  data-testid="button-revoke-all-sessions"
                >
                  {revokeAllSessionsMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  <LogOut className="me-2 h-4 w-4" />
                  {t("settings.revokeAllSessions")}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("settings.noSessions")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.loginHistory")}</CardTitle>
          <CardDescription>{t("settings.loginHistoryDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : loginHistory && loginHistory.length > 0 ? (
            <div className="space-y-2">
              {loginHistory.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`login-history-${entry.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm">{entry.ipAddress || t("settings.unknownIP")}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{entry.userAgent || t("settings.unknownDevice")}</p>
                    </div>
                  </div>
                  <div className="text-start sm:text-end">
                    <Badge variant={entry.status === "success" ? "default" : "destructive"} className="text-xs">
                      {entry.status === "success" ? t("common.success") : t("settings.failed")}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(entry.createdAt), "PPp")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("settings.noLoginHistory")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t('settings.withdrawalPassword')}
          </CardTitle>
          <CardDescription>
            {t('settings.withdrawalPasswordDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>{t('settings.enableWithdrawalPassword')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.enableWithdrawalPasswordDesc')}
              </p>
            </div>
            <Switch
              checked={withdrawalPasswordEnabled}
              onCheckedChange={(checked) => {
                setWithdrawalPasswordEnabled(checked);
                if (checked) {
                  setShowSetWithdrawalPassword(true);
                }
              }}
              data-testid="switch-withdrawal-password"
            />
          </div>

          {withdrawalPasswordEnabled && showSetWithdrawalPassword && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="withdrawal-new-password">{t('settings.newWithdrawalPassword')}</Label>
                <Input
                  ref={withdrawalNewPasswordInputRef}
                  id="withdrawal-new-password"
                  type="password"
                  value={withdrawalPasswordForm.newPassword}
                  onChange={(e) => setWithdrawalPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    queueFocus(withdrawalConfirmPasswordInputRef.current);
                  }}
                  placeholder={t('settings.newWithdrawalPasswordPlaceholder')}
                  enterKeyHint="next"
                  data-testid="input-withdrawal-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawal-confirm-password">{t('settings.confirmWithdrawalPassword')}</Label>
                <Input
                  ref={withdrawalConfirmPasswordInputRef}
                  id="withdrawal-confirm-password"
                  type="password"
                  value={withdrawalPasswordForm.confirmPassword}
                  onChange={(e) => setWithdrawalPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    queueFocus(withdrawalLoginPasswordInputRef.current);
                  }}
                  placeholder={t('settings.confirmWithdrawalPasswordPlaceholder')}
                  enterKeyHint="next"
                  data-testid="input-withdrawal-confirm-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawal-login-password">{t('settings.currentLoginPassword')}</Label>
                <Input
                  ref={withdrawalLoginPasswordInputRef}
                  id="withdrawal-login-password"
                  type="password"
                  value={withdrawalPasswordForm.currentLoginPassword}
                  onChange={(e) => setWithdrawalPasswordForm(prev => ({ ...prev, currentLoginPassword: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    queueFocus(withdrawalSetButtonRef.current);
                  }}
                  placeholder={t('settings.loginPasswordPlaceholder')}
                  enterKeyHint="done"
                  data-testid="input-withdrawal-login-password"
                />
              </div>
              <Button
                ref={withdrawalSetButtonRef}
                onClick={handleSetWithdrawalPassword}
                disabled={setWithdrawalPasswordMutation.isPending}
                data-testid="button-set-withdrawal-password"
              >
                {setWithdrawalPasswordMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('settings.setWithdrawalPassword')}
              </Button>
            </div>
          )}

          {withdrawalPasswordEnabled && !showSetWithdrawalPassword && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowSetWithdrawalPassword(true)}
                data-testid="button-reset-withdrawal-password"
              >
                <KeyRound className="me-2 h-4 w-4" />
                {t('settings.resetWithdrawalPassword')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="container max-w-4xl mx-auto min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_40%)] p-3 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6" data-testid="text-settings-title">{t("nav.settings")}</h1>

      <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6">
        <TabsList className="w-full justify-start gap-1 overflow-x-auto whitespace-nowrap rounded-xl p-1">
          <TabsTrigger value="profile" className="min-h-[44px] min-w-[8rem]" data-testid="tab-profile">
            <User className="h-4 w-4 sm:me-2" />
            <span className="text-xs sm:text-sm">{t("settings.profile")}</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="min-h-[44px] min-w-[8rem]" data-testid="tab-preferences">
            <Settings2 className="h-4 w-4 sm:me-2" />
            <span className="text-xs sm:text-sm">{t("settings.preferences")}</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="min-h-[44px] min-w-[8rem]" data-testid="tab-privacy">
            <Globe className="h-4 w-4 sm:me-2" />
            <span className="text-xs sm:text-sm">{t("settings.privacy") || "Privacy"}</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="min-h-[44px] min-w-[8rem]" data-testid="tab-security">
            <Shield className="h-4 w-4 sm:me-2" />
            <span className="text-xs sm:text-sm">{t("settings.security")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="space-y-6">
            <ProfileSection />
            <VerificationSection />
          </div>
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesSection />
        </TabsContent>

        <TabsContent value="privacy">
          <div className="space-y-6">
            <PrivacySection />
            <BlockedMutedSettings />
          </div>
        </TabsContent>

        <TabsContent value="security">
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
