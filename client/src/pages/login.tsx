import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import type { User as UserSchema } from "@shared/schema";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check, CheckCircle2, Smartphone, Mail, User, Zap, KeyRound, Share2, Globe } from "lucide-react";
import { VexLogo } from "@/components/vex-logo";
import { SiGoogle, SiFacebook, SiTelegram, SiWhatsapp, SiX, SiApple, SiDiscord, SiLinkedin, SiGithub, SiTiktok, SiInstagram } from "react-icons/si";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Checkbox } from "@/components/ui/checkbox";
import { SupportChatIcon } from "@/components/support-chat-widget";
import { LanguageSwitcher } from "@/lib/i18n";
import { fetchWithCsrf } from "@/lib/csrf";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

interface AuthSettings {
  oneClickEnabled: boolean;
  phoneLoginEnabled: boolean;
  emailLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  telegramLoginEnabled: boolean;
  twitterLoginEnabled: boolean;
}

interface SocialPlatform {
  id: string;
  name: string;
  displayName: string;
  displayNameAr: string | null;
  icon: string;
  type: "oauth" | "otp" | "both";
  otpEnabled: boolean;
  runtime?: {
    oauthLoginEnabled?: boolean;
  };
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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
  Phone: Smartphone,
};

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, loginByAccount, loginByPhone, loginByEmail, oneClickRegister, confirmOneClickLogin, register, refreshUser } = useAuth();
  const { toast } = useToast();
  const { t, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [socialPlatforms, setSocialPlatforms] = useState<SocialPlatform[]>([]);

  // Read referral code from URL (?ref=xxx)
  const referralCodeFromUrl = new URLSearchParams(window.location.search).get("ref") || "";
  const getEnabledTabs = () => {
    if (!authSettings) return ["account"];
    const tabs: string[] = [];
    if (authSettings.oneClickEnabled !== false) tabs.push("one-click");
    tabs.push("account");
    if (authSettings.phoneLoginEnabled !== false) tabs.push("phone");
    if (authSettings.emailLoginEnabled !== false) tabs.push("email");
    return tabs;
  };

  const enabledTabs = getEnabledTabs();
  const currentTab = activeTab && enabledTabs.includes(activeTab) ? activeTab : enabledTabs[0];
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);
  const [isNicknameAvailable, setIsNicknameAvailable] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ accountId: string; password: string } | null>(null);
  const [pendingUser, setPendingUser] = useState<Record<string, unknown> | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<"request" | "reset">("request");
  const [resetToken, setResetToken] = useState("");

  const [accountLoginForm, setAccountLoginForm] = useState({ accountId: "", password: "" });
  const [phoneLoginForm, setPhoneLoginForm] = useState({ phone: "", password: "" });
  const [emailLoginForm, setEmailLoginForm] = useState({ username: "", password: "" });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ identifier: "", newPassword: "", confirmPassword: "" });

  // Auto-registration state
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<{ identifier: string; type: "email" | "phone"; password: string } | null>(null);
  const [showAccountNotFoundModal, setShowAccountNotFoundModal] = useState(false);

  // Smart redirect state - when user is on wrong tab
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [redirectInfo, setRedirectInfo] = useState<{ correctMethod: string; maskedHint: string; password: string } | null>(null);
  const socialPopupWatcherRef = useRef<number | null>(null);
  const socialLoginLockRef = useRef<{ platformName: string; startedAt: number } | null>(null);
  const socialLoginUnlockTimeoutRef = useRef<number | null>(null);
  const [activeSocialLoginPlatform, setActiveSocialLoginPlatform] = useState<string | null>(null);

  // Terms & privacy agreement state
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const clearSocialLoginLock = (resetLoading: boolean = true) => {
    socialLoginLockRef.current = null;
    setActiveSocialLoginPlatform(null);

    if (socialLoginUnlockTimeoutRef.current) {
      window.clearTimeout(socialLoginUnlockTimeoutRef.current);
      socialLoginUnlockTimeoutRef.current = null;
    }

    if (socialPopupWatcherRef.current) {
      window.clearInterval(socialPopupWatcherRef.current);
      socialPopupWatcherRef.current = null;
    }

    if (resetLoading) {
      setIsLoading(false);
    }
  };

  const beginSocialLoginAttempt = (platformName: string): boolean => {
    if (socialLoginLockRef.current) {
      return false;
    }

    socialLoginLockRef.current = {
      platformName,
      startedAt: Date.now(),
    };
    setActiveSocialLoginPlatform(platformName);
    setIsLoading(true);

    if (socialLoginUnlockTimeoutRef.current) {
      window.clearTimeout(socialLoginUnlockTimeoutRef.current);
    }

    socialLoginUnlockTimeoutRef.current = window.setTimeout(() => {
      clearSocialLoginLock();
      toast({
        title: t('auth.error') || 'Error',
        description: dir === "rtl"
          ? "انتهت محاولة تسجيل الدخول. حاول مرة أخرى."
          : "Login attempt timed out. Please try again.",
        variant: 'destructive',
      });
    }, 90_000);

    return true;
  };

  useEffect(() => {
    let isMounted = true;

    const refreshAuthSurface = async () => {
      try {
        const [settingsRes, socialRes] = await Promise.all([
          fetch("/api/auth/settings"),
          fetch("/api/social-platforms"),
        ]);

        if (!isMounted) return;

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (isMounted) setAuthSettings(settings);
        }

        if (socialRes.ok) {
          const socials = await socialRes.json();
          if (isMounted) setSocialPlatforms(Array.isArray(socials) ? socials : []);
        }
      } catch {
        // Keep previous UI state when network refresh fails.
      }
    };

    refreshAuthSurface();
    const interval = window.setInterval(refreshAuthSurface, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") {
        return;
      }

      const payload = event.data as { type?: string; reason?: string };
      if (payload.type === "vex_oauth_success") {
        clearSocialLoginLock(false);
        await refreshUser();
        setIsLoading(false);
        setLocation("/");
      }

      if (payload.type === "vex_oauth_error") {
        clearSocialLoginLock();
        toast({
          title: t('auth.error') || 'Error',
          description: payload.reason || 'Social login failed',
          variant: 'destructive',
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (socialLoginUnlockTimeoutRef.current) {
        window.clearTimeout(socialLoginUnlockTimeoutRef.current);
        socialLoginUnlockTimeoutRef.current = null;
      }
      socialLoginLockRef.current = null;
      if (socialPopupWatcherRef.current) {
        window.clearInterval(socialPopupWatcherRef.current);
        socialPopupWatcherRef.current = null;
      }
    };
  }, [dir, refreshUser, setLocation, t, toast]);

  const checkTermsAgreed = () => {
    if (!agreedToTerms) {
      toast({
        title: dir === "rtl" ? "مطلوب" : "Required",
        description: dir === "rtl"
          ? "يجب الموافقة على الشروط والأحكام وسياسة الخصوصية أولاً"
          : "You must agree to the Terms & Conditions and Privacy Policy first",
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const handleOneClickRegister = async () => {
    if (!checkTermsAgreed()) return;
    setIsLoading(true);
    try {
      const result = await oneClickRegister(referralCodeFromUrl || undefined);
      setGeneratedCredentials(result.credentials);
      setPendingUser(result.user);
      setPendingToken(result.token);
      setShowCredentialsModal(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTermsAgreed()) return;
    setIsLoading(true);
    try {
      await loginByAccount(accountLoginForm.accountId, accountLoginForm.password);
      setLocation("/");
    } catch (error: unknown) {
      const err = error as Error & { errorCode?: string; correctMethod?: string };
      // Handle WRONG_LOGIN_METHOD - auto redirect to correct tab
      if (err.errorCode === "WRONG_LOGIN_METHOD" && err.correctMethod) {
        setRedirectInfo({
          correctMethod: err.correctMethod,
          maskedHint: "",
          password: accountLoginForm.password
        });
        setShowRedirectModal(true);
        setIsLoading(false);
        return;
      }

      // Handle ACCOUNT_NOT_FOUND - use find-credential to search everywhere
      if (err.errorCode === "ACCOUNT_NOT_FOUND" && accountLoginForm.accountId) {
        try {
          const findRes = await fetchWithCsrf("/api/auth/find-credential", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: accountLoginForm.accountId }),
          });
          const findData = await findRes.json();
          if (findRes.ok && findData.found) {
            // User exists but registered via different method
            setRedirectInfo({
              correctMethod: findData.correctMethod,
              maskedHint: findData.maskedHint || "",
              password: accountLoginForm.password
            });
            setShowRedirectModal(true);
            setIsLoading(false);
            return;
          }
        } catch { }
        // Account truly doesn't exist
        setShowAccountNotFoundModal(true);
        setIsLoading(false);
        return;
      }

      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTermsAgreed()) return;
    setIsLoading(true);
    try {
      // Phone tab: validate phone number format (digits with optional + prefix, min 7 chars)
      const phoneClean = phoneLoginForm.phone.trim();
      if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
        toast({ title: t('common.error'), description: "الرجاء إدخال رقم هاتف صحيح (أرقام فقط، 7-15 خانة)", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      await loginByPhone(phoneClean, phoneLoginForm.password);
      setLocation("/");
    } catch (error: unknown) {
      const err = error as Error & { errorCode?: string; correctMethod?: string };
      // Handle WRONG_LOGIN_METHOD - auto redirect to correct tab
      if (err.errorCode === "WRONG_LOGIN_METHOD" && err.correctMethod) {
        setRedirectInfo({
          correctMethod: err.correctMethod,
          maskedHint: "",
          password: phoneLoginForm.password
        });
        setShowRedirectModal(true);
        setIsLoading(false);
        return;
      }

      // Handle ACCOUNT_NOT_FOUND - use find-credential to search everywhere
      if (err.errorCode === "ACCOUNT_NOT_FOUND" && phoneLoginForm.phone) {
        try {
          const findRes = await fetchWithCsrf("/api/auth/find-credential", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: phoneLoginForm.phone.trim() }),
          });
          const findData = await findRes.json();
          if (findRes.ok && findData.found) {
            // User exists but registered via different method
            setRedirectInfo({
              correctMethod: findData.correctMethod,
              maskedHint: findData.maskedHint || "",
              password: phoneLoginForm.password
            });
            setShowRedirectModal(true);
            setIsLoading(false);
            return;
          }
        } catch { }
        // Phone not found anywhere - offer to create account
        setPendingRegistration({
          identifier: phoneLoginForm.phone.trim(),
          type: "phone",
          password: phoneLoginForm.password
        });
        setShowCreateAccountModal(true);
        setIsLoading(false);
        return;
      }

      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTermsAgreed()) return;
    setIsLoading(true);
    try {
      // Email tab: only accept email format with @
      if (!emailLoginForm.username.includes("@")) {
        toast({ title: t('common.error'), description: "الرجاء إدخال بريد إلكتروني صحيح يحتوي على @", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      await loginByEmail(emailLoginForm.username, emailLoginForm.password);
      setLocation("/");
    } catch (error: unknown) {
      const err = error as Error & { errorCode?: string; correctMethod?: string };
      // Handle WRONG_LOGIN_METHOD - auto redirect to correct tab
      if (err.errorCode === "WRONG_LOGIN_METHOD" && err.correctMethod) {
        setRedirectInfo({
          correctMethod: err.correctMethod,
          maskedHint: "",
          password: emailLoginForm.password
        });
        setShowRedirectModal(true);
        setIsLoading(false);
        return;
      }

      // Handle ACCOUNT_NOT_FOUND - use find-credential to search everywhere
      if (err.errorCode === "ACCOUNT_NOT_FOUND" && emailLoginForm.username.includes("@")) {
        try {
          const findRes = await fetchWithCsrf("/api/auth/find-credential", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: emailLoginForm.username }),
          });
          const findData = await findRes.json();
          if (findRes.ok && findData.found) {
            // User exists but registered via different method
            setRedirectInfo({
              correctMethod: findData.correctMethod,
              maskedHint: findData.maskedHint || "",
              password: emailLoginForm.password
            });
            setShowRedirectModal(true);
            setIsLoading(false);
            return;
          }
        } catch { }
        // Email not found anywhere - offer to create account
        setPendingRegistration({
          identifier: emailLoginForm.username,
          type: "email",
          password: emailLoginForm.password
        });
        setShowCreateAccountModal(true);
        setIsLoading(false);
        return;
      }

      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!pendingRegistration) return;
    setIsLoading(true);
    try {
      const res = await fetchWithCsrf("/api/auth/create-from-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingRegistration),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Store token with correct key and cache user data
      localStorage.setItem("pwm_token", data.token);
      localStorage.setItem("pwm_user_cache", JSON.stringify({
        data: data.user,
        etag: "",
        cachedAt: Date.now()
      }));
      setShowCreateAccountModal(false);
      setPendingRegistration(null);
      toast({
        title: t('auth.createAccount'),
        description: t('auth.accountCreatedVerify')
      });
      // Navigate and reload to pick up the new auth state
      setLocation("/");
      window.location.reload();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetchWithCsrf("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: forgotPasswordForm.identifier,
          email: forgotPasswordForm.identifier.includes("@") ? forgotPasswordForm.identifier : undefined,
          phone: forgotPasswordForm.identifier.match(/^[0-9+]+$/) ? forgotPasswordForm.identifier : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetToken(data.token);
      setForgotPasswordStep("reset");
      toast({ title: t('common.success'), description: t('auth.resetTokenGenerated') });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPasswordForm.newPassword !== forgotPasswordForm.confirmPassword) {
      toast({ title: t('common.error'), description: t('auth.passwordsNoMatch'), variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetchWithCsrf("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, newPassword: forgotPasswordForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: t('common.success'), description: t('auth.resetSuccess') });
      setShowForgotPassword(false);
      setForgotPasswordStep("request");
      setForgotPasswordForm({ identifier: "", newPassword: "", confirmPassword: "" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: t('auth.copied'), description: t('auth.copiedToClipboard') });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyAllCredentials = () => {
    const text = `VEX Account Credentials\n\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}\n\nKeep these safe!`;
    navigator.clipboard.writeText(text);
    setCopiedField("all");
    toast({ title: t('auth.copied'), description: t('auth.allCopied') });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const shareCredentials = async () => {
    const text = `VEX Account Credentials\n\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}\n\nKeep these safe!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VEX Account Credentials',
          text: text,
        });
      } catch (err) {
        copyAllCredentials();
      }
    } else {
      copyAllCredentials();
    }
  };

  const checkNicknameAvailability = async (value: string) => {
    if (value.length < 3) {
      setNicknameError(t('auth.nicknameTooShort'));
      setIsNicknameAvailable(false);
      return false;
    }
    setIsCheckingNickname(true);
    try {
      const res = await fetch(`/api/user/check-nickname/${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!data.available) {
        setNicknameError(t('auth.nicknameTaken'));
        setIsNicknameAvailable(false);
        return false;
      }
      setNicknameError("");
      setIsNicknameAvailable(true);
      return true;
    } catch {
      setNicknameError(t('auth.nicknameCheckError'));
      setIsNicknameAvailable(false);
      return false;
    } finally {
      setIsCheckingNickname(false);
    }
  };

  const handleCredentialsSaved = async () => {
    setShowCredentialsModal(false);
    setShowNicknameModal(true);
  };

  const handleNicknameSubmit = async () => {
    const isAvailable = await checkNicknameAvailability(nickname);
    if (!isAvailable) return;

    try {
      setIsLoading(true);
      const token = pendingToken;
      const res = await fetchWithCsrf("/api/user/nickname", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: t('common.error'), description: data.error || t('auth.failedSetNickname'), variant: "destructive" });
        return;
      }

      if (pendingUser && pendingToken) {
        confirmOneClickLogin(pendingUser as unknown as UserSchema, pendingToken);
      }
      setShowNicknameModal(false);
      setPendingUser(null);
      setPendingToken(null);
      setNickname("");
      setLocation("/");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-background p-4 relative" dir={dir}>
      <div className="absolute top-4 start-4 end-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-2">
          <SupportChatIcon />
          <LanguageSwitcher />
        </div>
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md border-primary/20">
        <div className="p-6 text-center border-b border-border">
          <div className="flex justify-center mb-4">
            <VexLogo size={64} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">VEX</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('auth.gamingTrading')}</p>
        </div>

        <CardContent className="p-0">
          <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`w-full grid rounded-none border-b border-border h-auto p-0 bg-transparent`} style={{ gridTemplateColumns: `repeat(${enabledTabs.length}, 1fr)` }}>
              {enabledTabs.includes("one-click") && (
                <TabsTrigger
                  value="one-click"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs"
                  data-testid="tab-one-click"
                >
                  <Zap className="w-4 h-4 me-1" />
                  {t('auth.quick')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("account") && (
                <TabsTrigger
                  value="account"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs"
                  data-testid="tab-account"
                >
                  <User className="w-4 h-4 me-1" />
                  {t('auth.account')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("phone") && (
                <TabsTrigger
                  value="phone"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs"
                  data-testid="tab-phone"
                >
                  <Smartphone className="w-4 h-4 me-1" />
                  {t('auth.phone')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("email") && (
                <TabsTrigger
                  value="email"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs"
                  data-testid="tab-email"
                >
                  <Mail className="w-4 h-4 me-1" />
                  {t('auth.email')}
                </TabsTrigger>
              )}
            </TabsList>

            <div className="p-6 space-y-4">
              {enabledTabs.includes("one-click") && (
                <TabsContent value="one-click" className="m-0 space-y-4">
                  <div className="text-center space-y-4">
                    <div className="p-4 bg-accent/10 rounded-md border border-accent/20">
                      <Zap className="w-12 h-12 text-accent mx-auto mb-2" />
                      <h2 className="font-semibold text-foreground">{t('auth.oneClickTitle')}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('auth.oneClickDesc')}
                      </p>
                    </div>
                    <Button
                      onClick={handleOneClickRegister}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={isLoading || !agreedToTerms}
                      data-testid="button-one-click-register"
                    >
                      {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Zap className="me-2 h-4 w-4" />}
                      {t('auth.registerOneClick')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('auth.oneClickNote')}
                    </p>
                  </div>
                </TabsContent>
              )}

              {enabledTabs.includes("account") && (
                <TabsContent value="account" className="m-0">
                  <form onSubmit={handleAccountLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="accountId">{t('auth.accountId')}</Label>
                      <Input
                        id="accountId"
                        data-testid="input-account-id"
                        value={accountLoginForm.accountId}
                        onChange={e => setAccountLoginForm(prev => ({ ...prev, accountId: e.target.value }))}
                        placeholder={t('auth.enterAccountId')}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountPassword">{t('auth.password')}</Label>
                      <Input
                        id="accountPassword"
                        type="password"
                        data-testid="input-account-password"
                        value={accountLoginForm.password}
                        onChange={e => setAccountLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={t('auth.enterPassword')}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || !agreedToTerms} data-testid="button-account-login">
                      {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t('auth.signIn')}
                    </Button>
                  </form>
                </TabsContent>
              )}

              {enabledTabs.includes("phone") && (
                <TabsContent value="phone" className="m-0">
                  <form onSubmit={handlePhoneLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t('auth.phoneNumber')}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        data-testid="input-phone"
                        value={phoneLoginForm.phone}
                        onChange={e => {
                          // Only allow digits and + prefix
                          const val = e.target.value.replace(/[^0-9+]/g, '');
                          setPhoneLoginForm(prev => ({ ...prev, phone: val }));
                        }}
                        placeholder="+1234567890"
                        pattern="^\+?[0-9]{7,15}$"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phonePassword">{t('auth.password')}</Label>
                      <Input
                        id="phonePassword"
                        type="password"
                        data-testid="input-phone-password"
                        value={phoneLoginForm.password}
                        onChange={e => setPhoneLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={t('auth.enterPassword')}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || !agreedToTerms} data-testid="button-phone-login">
                      {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t('auth.signIn')}
                    </Button>
                  </form>
                </TabsContent>
              )}

              {enabledTabs.includes("email") && (
                <TabsContent value="email" className="m-0">
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">{t('auth.usernameEmail')}</Label>
                      <Input
                        id="username"
                        data-testid="input-username"
                        value={emailLoginForm.username}
                        onChange={e => setEmailLoginForm(prev => ({ ...prev, username: e.target.value }))}
                        placeholder={t('auth.enterUsernameEmail')}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emailPassword">{t('auth.password')}</Label>
                      <Input
                        id="emailPassword"
                        type="password"
                        data-testid="input-email-password"
                        value={emailLoginForm.password}
                        onChange={e => setEmailLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={t('auth.enterPassword')}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || !agreedToTerms} data-testid="button-email-login">
                      {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t('auth.signIn')}
                    </Button>
                  </form>
                </TabsContent>
              )}

              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mx-auto"
                  data-testid="button-forgot-password"
                >
                  <KeyRound className="w-3 h-3" />
                  {t('auth.forgotPassword')}
                </button>
              </div>

              {socialPlatforms.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center mb-3">{t('auth.orContinueWith')}</p>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {socialPlatforms
                      .filter((platform) => platform.runtime?.oauthLoginEnabled ?? (platform.type === "oauth" || platform.type === "both"))
                      .map((platform) => {
                        const Icon = PLATFORM_ICONS[platform.icon] || Globe;
                        return (
                          <Button
                            key={platform.id}
                            variant="outline"
                            size="icon"
                            className="w-12 h-12 rounded-full hover:scale-105 transition-transform"
                            onClick={async () => {
                              if (!beginSocialLoginAttempt(platform.name)) {
                                return;
                              }

                              try {
                                const res = await fetch(`/api/auth/social/${platform.name}`);
                                const data = await res.json();
                                if (data.url) {
                                  if (Capacitor.isNativePlatform()) {
                                    await Browser.open({ url: data.url });
                                    return;
                                  }

                                  const popupWidth = 520;
                                  const popupHeight = 700;
                                  const left = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
                                  const top = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));
                                  const popup = window.open(
                                    data.url,
                                    "vex_social_auth",
                                    `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
                                  );

                                  // Popup blocked or unsupported contexts: fallback to full redirect.
                                  if (!popup) {
                                    window.location.href = data.url;
                                    return;
                                  }

                                  popup.focus();
                                  socialPopupWatcherRef.current = window.setInterval(() => {
                                    if (popup.closed) {
                                      clearSocialLoginLock();
                                    }
                                  }, 500);
                                } else {
                                  toast({ title: t('auth.error') || 'Error', description: data.error || 'Failed to initiate login', variant: 'destructive' });
                                  clearSocialLoginLock();
                                }
                              } catch {
                                toast({ title: t('auth.error') || 'Error', description: 'Connection failed', variant: 'destructive' });
                                clearSocialLoginLock();
                              }
                            }}
                            disabled={isLoading || activeSocialLoginPlatform !== null}
                            aria-label={platform.displayName}
                            title={platform.displayName}
                            data-testid={`button-${platform.name}-login`}
                          >
                            {isLoading && activeSocialLoginPlatform === platform.name
                              ? <Loader2 className="w-5 h-5 animate-spin" />
                              : <Icon className="w-5 h-5" />}
                          </Button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Terms & Privacy Agreement Checkbox */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms-agreement"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5"
                    data-testid="checkbox-terms"
                  />
                  <label
                    htmlFor="terms-agreement"
                    className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none"
                  >
                    {dir === "rtl" ? (
                      <>
                        أوافق على{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          الشروط والأحكام
                        </a>
                        {" "}و{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          سياسة الخصوصية
                        </a>
                      </>
                    ) : (
                      <>
                        I agree to the{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          Terms & Conditions
                        </a>
                        {" "}and{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          Privacy Policy
                        </a>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Check className="w-5 h-5" />
              {t('auth.accountCreated')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.saveCredentials')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-sm text-destructive font-medium">
                {t('auth.saveWarning')}
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="text-xs text-muted-foreground">{t('auth.accountId')}</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-generated-account-id">
                    {generatedCredentials?.accountId}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(generatedCredentials?.accountId || "", "accountId")}
                  data-testid="button-copy-account-id"
                  aria-label={t('auth.copyAll')}
                  title={t('auth.copyAll')}
                >
                  {copiedField === "accountId" ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="text-xs text-muted-foreground">{t('auth.password')}</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-generated-password">
                    {generatedCredentials?.password}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(generatedCredentials?.password || "", "password")}
                  data-testid="button-copy-password"
                  aria-label={t('auth.copyAll')}
                  title={t('auth.copyAll')}
                >
                  {copiedField === "password" ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={copyAllCredentials}
                className="flex-1"
                data-testid="button-copy-all"
              >
                <Copy className="w-4 h-4 me-2" />
                {copiedField === "all" ? t('auth.copied') : t('auth.copyAll')}
              </Button>
              <Button
                variant="outline"
                onClick={shareCredentials}
                className="flex-1"
                data-testid="button-share-credentials"
              >
                <Share2 className="w-4 h-4 me-2" />
                {t('auth.share')}
              </Button>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center mb-3">{t('auth.shareVia')}</p>
              <div className="flex justify-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const text = encodeURIComponent(`VEX Account\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}`);
                    window.open(`https://wa.me/?text=${text}`, '_blank');
                  }}
                  data-testid="button-share-whatsapp"
                  className="bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30"
                  aria-label="WhatsApp"
                  title="WhatsApp"
                >
                  <SiWhatsapp className="w-4 h-4 text-[#25D366]" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const text = encodeURIComponent(`VEX Account\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}`);
                    window.open(`https://t.me/share/url?text=${text}`, '_blank');
                  }}
                  data-testid="button-share-telegram"
                  className="bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border-[#0088cc]/30"
                  aria-label="Telegram"
                  title="Telegram"
                >
                  <SiTelegram className="w-4 h-4 text-[#0088cc]" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const text = encodeURIComponent(`VEX Account\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}`);
                    window.open(`mailto:?subject=VEX Account Credentials&body=${text}`, '_blank');
                  }}
                  data-testid="button-share-email"
                  className="bg-muted hover:bg-muted/80"
                  aria-label={t('auth.email')}
                  title={t('auth.email')}
                >
                  <Mail className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const text = encodeURIComponent(`VEX Account\nAccount ID: ${generatedCredentials?.accountId}\nPassword: ${generatedCredentials?.password}`);
                    window.open(`sms:?body=${text}`, '_blank');
                  }}
                  data-testid="button-share-sms"
                  className="bg-muted hover:bg-muted/80"
                  aria-label={t('auth.phone')}
                  title={t('auth.phone')}
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button onClick={handleCredentialsSaved} className="w-full" data-testid="button-credentials-saved">
              {t('auth.savedCredentials')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              {forgotPasswordStep === "request" ? t('auth.resetPassword') : t('auth.setNewPassword')}
            </DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === "request"
                ? t('auth.resetDesc')
                : t('auth.newPasswordDesc')}
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordStep === "request" ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">{t('auth.identifierLabel')}</Label>
                <Input
                  id="identifier"
                  data-testid="input-forgot-identifier"
                  value={forgotPasswordForm.identifier}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, identifier: e.target.value }))}
                  placeholder={t('auth.enterIdentifier')}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-request-reset">
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('auth.requestReset')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('auth.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  data-testid="input-new-password"
                  value={forgotPasswordForm.newPassword}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder={t('auth.enterNewPassword')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  data-testid="input-confirm-password"
                  value={forgotPasswordForm.confirmPassword}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder={t('auth.confirmNewPassword')}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-reset-password">
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('auth.resetPassword')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateAccountModal} onOpenChange={setShowCreateAccountModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingRegistration?.type === "email" ? <Mail className="w-5 h-5 text-primary" /> : <Smartphone className="w-5 h-5 text-primary" />}
              {t('auth.accountNotFound')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.noAccountExists')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-accent/10 rounded-md border border-accent/20">
              <p className="text-sm">
                <span className="font-semibold">{pendingRegistration?.type === "email" ? t('auth.email') : t('auth.phone')}:</span>{" "}
                {pendingRegistration?.identifier}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('auth.createAccountPrompt')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateAccountModal(false);
                  setPendingRegistration(null);
                }}
                className="flex-1"
                disabled={isLoading}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateAccount}
                className="flex-1"
                disabled={isLoading}
                data-testid="button-confirm-create"
              >
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('auth.createAccount')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAccountNotFoundModal} onOpenChange={setShowAccountNotFoundModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-destructive" />
              {t('auth.accountNotFound')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.accountIdNotFound')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-accent/10 rounded-md border border-accent/20">
              <p className="text-sm">
                <span className="font-semibold">{t('auth.accountId')}:</span> {accountLoginForm.accountId}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('auth.useQuickTab')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('auth.usePhoneEmail')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAccountNotFoundModal(false)}
                className="flex-1"
                data-testid="button-close-account-not-found"
              >
                {t('auth.tryAgain')}
              </Button>
              <Button
                onClick={() => {
                  setShowAccountNotFoundModal(false);
                  setActiveTab("one-click");
                }}
                className="flex-1"
                data-testid="button-go-to-quick"
              >
                <Zap className="me-2 h-4 w-4" />
                {t('auth.quickRegister')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart Redirect Modal - guides user to correct login tab */}
      <Dialog open={showRedirectModal} onOpenChange={setShowRedirectModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              طريقة تسجيل الدخول غير صحيحة
            </DialogTitle>
            <DialogDescription>
              {redirectInfo?.correctMethod === "account" && "حسابك مسجل عبر رقم الحساب. انتقل لتسجيل الدخول الصحيح."}
              {redirectInfo?.correctMethod === "phone" && "حسابك مسجل عبر رقم الهاتف. انتقل لتسجيل الدخول الصحيح."}
              {redirectInfo?.correctMethod === "email" && "حسابك مسجل عبر البريد الإلكتروني. انتقل لتسجيل الدخول الصحيح."}
              {redirectInfo?.correctMethod === "username" && "حسابك مسجل عبر اسم المستخدم. انتقل لتسجيل الدخول الصحيح."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {redirectInfo?.maskedHint && (
              <div className="p-4 bg-accent/10 rounded-md border border-accent/20">
                <p className="text-sm text-center">
                  <span className="font-semibold">معلومات الحساب: </span>
                  {redirectInfo.maskedHint}
                </p>
              </div>
            )}
            <div className="p-4 bg-primary/5 rounded-md border border-primary/20">
              <p className="text-sm text-center font-medium">
                {redirectInfo?.correctMethod === "account" && (
                  <span className="flex items-center justify-center gap-2">
                    <User className="w-4 h-4" /> استخدم تبويب "رقم الحساب"
                  </span>
                )}
                {redirectInfo?.correctMethod === "phone" && (
                  <span className="flex items-center justify-center gap-2">
                    <Smartphone className="w-4 h-4" /> استخدم تبويب "الهاتف"
                  </span>
                )}
                {redirectInfo?.correctMethod === "email" && (
                  <span className="flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4" /> استخدم تبويب "البريد"
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRedirectModal(false);
                  setRedirectInfo(null);
                }}
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  const method = redirectInfo?.correctMethod;
                  setShowRedirectModal(false);
                  if (method === "account") {
                    setActiveTab("account");
                  } else if (method === "phone") {
                    setActiveTab("phone");
                  } else if (method === "email") {
                    setActiveTab("email");
                  }
                  setRedirectInfo(null);
                }}
                className="flex-1"
              >
                انتقل الآن
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNicknameModal} onOpenChange={(open) => { if (!open) setShowNicknameModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {t('auth.chooseNickname')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.nicknameRegDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">{t('auth.nickname')}</Label>
              <div className="relative">
                <Input
                  id="nickname"
                  data-testid="input-nickname"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setNicknameError("");
                    setIsNicknameAvailable(false);
                  }}
                  onBlur={() => nickname.length >= 3 && checkNicknameAvailability(nickname)}
                  placeholder={t('auth.enterNickname')}
                  className={nicknameError ? "border-destructive" : ""}
                />
                {isCheckingNickname && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {!isCheckingNickname && isNicknameAvailable && !nicknameError && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500 drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                )}
              </div>
              {nicknameError && (
                <p className="text-xs text-destructive">{nicknameError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('auth.nicknameMinChars')}
              </p>
            </div>
            <Button
              onClick={handleNicknameSubmit}
              disabled={isLoading || isCheckingNickname || nickname.length < 3}
              className="w-full"
              data-testid="button-set-nickname"
            >
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('auth.setNickname')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
