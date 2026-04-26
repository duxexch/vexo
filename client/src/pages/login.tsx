import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useAuth, type IdentifierOtpMethod, type LoginFlowResult } from "@/lib/auth";
import type { User as UserSchema } from "@shared/schema";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGuidedFocus } from "@/hooks/use-guided-focus";
import { Loader2, Copy, Check, CheckCircle2, Smartphone, Mail, User, Zap, KeyRound, Share2, Globe, AlertTriangle } from "lucide-react";
import { VexLogo } from "@/components/vex-logo";
import { SiGoogle, SiFacebook, SiTelegram, SiWhatsapp, SiX, SiApple, SiDiscord, SiLinkedin, SiGithub, SiTiktok, SiInstagram } from "react-icons/si";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Checkbox } from "@/components/ui/checkbox";
import { SupportContactQuickLaunch } from "@/components/support-contact-quick-launch";
import { fetchWithCsrf } from "@/lib/csrf";
import { openNotificationSettings, requestPostSignupNotificationPermissions } from "@/lib/startup-permissions";

type NativeGoogleLoginResult = {
  responseType?: string;
  accessToken?: {
    token?: string;
  };
  idToken?: string;
};

let capacitorCoreModulePromise: Promise<typeof import("@capacitor/core")> | null = null;
let capacitorBrowserModulePromise: Promise<typeof import("@capacitor/browser")> | null = null;
let capacitorSocialModulePromise: Promise<typeof import("@capgo/capacitor-social-login")> | null = null;

const getCapacitorCore = () => {
  if (!capacitorCoreModulePromise) {
    capacitorCoreModulePromise = import("@capacitor/core");
  }
  return capacitorCoreModulePromise;
};

const getCapacitorBrowser = () => {
  if (!capacitorBrowserModulePromise) {
    capacitorBrowserModulePromise = import("@capacitor/browser");
  }
  return capacitorBrowserModulePromise;
};

const getCapacitorSocialLogin = () => {
  if (!capacitorSocialModulePromise) {
    capacitorSocialModulePromise = import("@capgo/capacitor-social-login");
  }
  return capacitorSocialModulePromise;
};

const isNativeCapacitorPlatform = async (): Promise<boolean> => {
  const { Capacitor } = await getCapacitorCore();
  return Capacitor.isNativePlatform();
};

interface AuthSettings {
  oneClickEnabled: boolean;
  phoneLoginEnabled: boolean;
  emailLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  telegramLoginEnabled: boolean;
  twitterLoginEnabled: boolean;
}

const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  oneClickEnabled: true,
  phoneLoginEnabled: true,
  emailLoginEnabled: true,
  googleLoginEnabled: false,
  facebookLoginEnabled: false,
  telegramLoginEnabled: false,
  twitterLoginEnabled: false,
};

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

const OAUTH_EVENT_STORAGE_KEY = "vex_oauth_event";
const AUTO_CREATE_MAX_CLIENT_ATTEMPTS = 4;
const AUTO_CREATE_ATTEMPTS_STORAGE_KEY = "vex_auto_create_attempts_v1";
const AUTO_CREATE_CLIENT_ID_STORAGE_KEY = "vex_auto_create_client_id_v1";

const LanguageSwitcher = lazy(() =>
  import("@/lib/i18n-ui").then((module) => ({ default: module.LanguageSwitcher })),
);

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const {
    login,
    loginByAccount,
    loginByPhone,
    loginByEmail,
    requestIdentifierOtp,
    verifyIdentifierOtp,
    verifyTwoFactorChallenge,
    oneClickRegister,
    confirmOneClickLogin,
    register,
    refreshUser,
  } = useAuth();
  const { toast } = useToast();
  const { t, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authSettings, setAuthSettings] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS);
  const [socialPlatforms, setSocialPlatforms] = useState<SocialPlatform[]>([]);

  // Read referral code from URL (?ref=xxx)
  const referralCodeFromUrl = new URLSearchParams(window.location.search).get("ref") || "";
  const getEnabledTabs = () => {
    const tabs: string[] = [];
    if (authSettings.oneClickEnabled !== false) tabs.push("one-click");
    tabs.push("account");
    if (authSettings.phoneLoginEnabled !== false) tabs.push("phone");
    if (authSettings.emailLoginEnabled !== false) tabs.push("email");
    return tabs;
  };

  const enabledTabs = getEnabledTabs();
  const currentTab = activeTab && enabledTabs.includes(activeTab) ? activeTab : enabledTabs[0];

  const isSocialPlatformEnabledInAuthSettings = (platformName: string): boolean => {
    switch (platformName.trim().toLowerCase()) {
      case "google":
        return authSettings.googleLoginEnabled !== false;
      case "facebook":
        return authSettings.facebookLoginEnabled !== false;
      case "telegram":
        return authSettings.telegramLoginEnabled !== false;
      case "twitter":
        return authSettings.twitterLoginEnabled !== false;
      default:
        return true;
    }
  };

  const shouldShowSocialPlatform = (platform: SocialPlatform): boolean => {
    const runtimeOAuthEnabled = platform.runtime?.oauthLoginEnabled ?? (platform.type === "oauth" || platform.type === "both");
    if (!runtimeOAuthEnabled) {
      return false;
    }

    return isSocialPlatformEnabledInAuthSettings(platform.name);
  };

  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  // True from the moment one-click registration succeeds until the user either
  // sets their nickname or dismisses the dialogs. Used to pause the background
  // auth-surface poller so it can't surface a misleading error while the
  // signup dialogs are open.
  const quickSignupInProgressRef = useRef(false);
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
  const [pendingRegistration, setPendingRegistration] = useState<{ identifier: string; type: "email" | "phone" | "account"; password: string } | null>(null);
  const [showAccountNotFoundModal, setShowAccountNotFoundModal] = useState(false);
  const [autoCreateAttempts, setAutoCreateAttempts] = useState(0);

  // Mandatory identifier OTP challenge state
  const [showIdentifierOtpModal, setShowIdentifierOtpModal] = useState(false);
  const [identifierOtpCode, setIdentifierOtpCode] = useState("");
  const [identifierOtpChallengeToken, setIdentifierOtpChallengeToken] = useState("");
  const [identifierOtpMethods, setIdentifierOtpMethods] = useState<IdentifierOtpMethod[]>([]);
  const [selectedIdentifierOtpMethod, setSelectedIdentifierOtpMethod] = useState<IdentifierOtpMethod>("email");
  const [identifierOtpMaskedTarget, setIdentifierOtpMaskedTarget] = useState("");

  // Optional account 2FA challenge state (after OTP if account has 2FA)
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const socialPopupWatcherRef = useRef<number | null>(null);
  const socialPopupRef = useRef<Window | null>(null);
  const socialLoginLockRef = useRef<{ platformName: string; startedAt: number } | null>(null);
  const socialLoginUnlockTimeoutRef = useRef<number | null>(null);
  const socialGoogleForceConsentRetriedRef = useRef<boolean>(false);
  const lastOAuthEventTsRef = useRef<number>(0);
  const shouldPromptPostSignupPermissionsRef = useRef(false);
  const [activeSocialLoginPlatform, setActiveSocialLoginPlatform] = useState<string | null>(null);

  // Terms & privacy agreement state
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsVisualWarning, setShowTermsVisualWarning] = useState(false);

  const accountIdInputRef = useRef<HTMLInputElement | null>(null);
  const accountPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const accountLoginButtonRef = useRef<HTMLButtonElement | null>(null);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const phonePasswordInputRef = useRef<HTMLInputElement | null>(null);
  const phoneLoginButtonRef = useRef<HTMLButtonElement | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const emailPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const emailLoginButtonRef = useRef<HTMLButtonElement | null>(null);

  const forgotIdentifierInputRef = useRef<HTMLInputElement | null>(null);
  const forgotRequestButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetCodeInputRef = useRef<HTMLInputElement | null>(null);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const resetPasswordButtonRef = useRef<HTMLButtonElement | null>(null);

  const identifierOtpCodeInputRef = useRef<HTMLInputElement | null>(null);
  const identifierOtpVerifyButtonRef = useRef<HTMLButtonElement | null>(null);

  const twoFactorCodeInputRef = useRef<HTMLInputElement | null>(null);
  const twoFactorVerifyButtonRef = useRef<HTMLButtonElement | null>(null);
  const { focusAndScroll, queueFocus } = useGuidedFocus();

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

    if (socialPopupRef.current?.closed) {
      socialPopupRef.current = null;
    }

    if (resetLoading) {
      setIsLoading(false);
    }
  };

  const sanitizeRelativeRedirect = (candidate?: string | null): string | undefined => {
    if (!candidate) {
      return undefined;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > 2048 || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
      return undefined;
    }

    if (/[\r\n]/.test(trimmed)) {
      return undefined;
    }

    try {
      const normalized = new URL(trimmed, window.location.origin);
      return `${normalized.pathname}${normalized.search}${normalized.hash}`;
    } catch {
      return undefined;
    }
  };

  const resolvePostLoginRedirect = (): string => {
    const queryParams = new URLSearchParams(window.location.search);
    const explicitRedirect = sanitizeRelativeRedirect(queryParams.get("redirect"));
    if (explicitRedirect && !explicitRedirect.startsWith("/auth/callback")) {
      return explicitRedirect;
    }

    const currentPath = sanitizeRelativeRedirect(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    if (!currentPath || currentPath === "/login" || currentPath.startsWith("/login?") || currentPath.startsWith("/auth/callback")) {
      return "/";
    }

    return currentPath;
  };

  const resolveOAuthEventRedirect = (payload: { redirect?: unknown; isNew?: unknown }): string => {
    if (payload.isNew === true) {
      return "/profile?setup=true";
    }

    const redirect = sanitizeRelativeRedirect(typeof payload.redirect === "string" ? payload.redirect : undefined);
    if (!redirect || redirect.startsWith("/auth/callback") || redirect === "/login" || redirect.startsWith("/login?")) {
      return "/";
    }

    return redirect;
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
        title: t('common.error'),
        description: t('auth.loginTimeout'),
        variant: 'destructive',
      });
    }, 90_000);

    return true;
  };

  const extractNativeGoogleTokens = (payload: NativeGoogleLoginResult): { accessToken?: string; idToken?: string } => {
    if (payload.responseType === "offline") {
      return {};
    }

    const accessToken =
      payload.accessToken && typeof payload.accessToken.token === "string" && payload.accessToken.token.trim().length > 0
        ? payload.accessToken.token.trim()
        : undefined;

    const idToken =
      typeof payload.idToken === "string" && payload.idToken.trim().length > 0
        ? payload.idToken.trim()
        : undefined;

    return {
      accessToken,
      idToken,
    };
  };

  const completeSocialLogin = async (payload: { token?: string; redirect?: string; isNew?: boolean }) => {
    if (!payload.token || typeof payload.token !== "string") {
      throw new Error("oauth_exchange_failed");
    }

    localStorage.setItem("pwm_token", payload.token);
    sessionStorage.setItem("pwm_token_backup", payload.token);
    await refreshUser();

    if (payload.isNew === true) {
      setLocation("/profile?setup=true");
      return;
    }

    const redirectTarget = sanitizeRelativeRedirect(
      typeof payload.redirect === "string" && payload.redirect.length > 0 ? payload.redirect : "/",
    ) || "/";
    setLocation(redirectTarget);
  };

  const handleNativeGoogleLogin = async () => {
    if (!(await isNativeCapacitorPlatform())) {
      throw new Error("google_native_not_available");
    }

    const { SocialLogin } = await getCapacitorSocialLogin();

    const configRes = await fetch("/api/auth/social/google/native/config", {
      cache: "no-store",
      credentials: "include",
    });
    const configData = await configRes.json().catch(() => ({} as Record<string, unknown>));

    if (!configRes.ok || typeof configData.clientId !== "string" || configData.clientId.length === 0) {
      throw new Error(
        typeof configData.error === "string" && configData.error.length > 0
          ? configData.error
          : "native_google_not_available",
      );
    }

    if (configData.loginMode !== "sdk-only") {
      throw new Error("google_native_sdk_mode_disabled");
    }

    await SocialLogin.initialize({
      google: {
        webClientId: configData.clientId,
        mode: "online",
      },
    });

    const loginResult = await SocialLogin.login({
      provider: "google",
      options: {
        style: "standard",
      },
    });

    const tokens = extractNativeGoogleTokens(loginResult.result as NativeGoogleLoginResult);
    if (!tokens.accessToken && !tokens.idToken) {
      throw new Error("google_native_sdk_token_missing");
    }

    const exchangeRes = await fetchWithCsrf("/api/auth/social/google/native/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
      }),
    });
    const exchangeData = await exchangeRes.json().catch(() => ({} as Record<string, unknown>));

    if (!exchangeRes.ok) {
      throw new Error(
        typeof exchangeData.error === "string" && exchangeData.error.length > 0
          ? exchangeData.error
          : "oauth_exchange_failed",
      );
    }

    await completeSocialLogin(exchangeData as { token?: string; redirect?: string; isNew?: boolean });
  };

  const startPlatformOAuthFlow = async (platformName: string, options?: { forceConsent?: boolean }) => {
    const postLoginRedirect = resolvePostLoginRedirect();
    const startParams = new URLSearchParams({ redirect: postLoginRedirect });
    const isNativePlatform = await isNativeCapacitorPlatform();
    if (!isNativePlatform) {
      startParams.set("popup", "1");
    }

    if (options?.forceConsent && platformName.trim().toLowerCase() === "google") {
      startParams.set("force_consent", "1");
    }

    const res = await fetch(`/api/auth/social/${platformName}?${startParams.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!data.url) {
      throw new Error(typeof data.error === "string" ? data.error : "oauth_initiation_failed");
    }

    if (isNativePlatform) {
      const { Browser } = await getCapacitorBrowser();
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

    if (!popup) {
      throw new Error("oauth_popup_blocked");
    }

    popup.focus();
    socialPopupRef.current = popup;
    socialPopupWatcherRef.current = window.setInterval(() => {
      if (popup.closed) {
        socialPopupRef.current = null;
        clearSocialLoginLock();
      }
    }, 500);
  };

  const handleSocialLogin = async (platform: SocialPlatform) => {
    if (!checkTermsAgreed()) {
      return;
    }

    if (!beginSocialLoginAttempt(platform.name)) {
      return;
    }

    try {
      if (platform.name.trim().toLowerCase() === "google") {
        socialGoogleForceConsentRetriedRef.current = false;
      }

      if ((await isNativeCapacitorPlatform()) && platform.name === "google") {
        await handleNativeGoogleLogin();
        clearSocialLoginLock();
        return;
      }

      await startPlatformOAuthFlow(platform.name);
    } catch (error: unknown) {
      const description = error instanceof Error && error.message
        ? error.message
        : t('common.error');

      toast({
        title: t('common.error'),
        description,
        variant: 'destructive',
      });
      clearSocialLoginLock();
    }
  };

  useEffect(() => {
    let isMounted = true;

    const refreshAuthSurface = async () => {
      // While the one-click signup dialogs are open, the new vex_token cookie
      // is already attached to outgoing requests but the user hasn't selected
      // a username yet. Skip this refresh so we can't accidentally surface any
      // gate-related errors over the open dialog.
      if (quickSignupInProgressRef.current) return;

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
        // Any non-OK response (including a 428 USERNAME_SELECTION_REQUIRED) is
        // intentionally ignored: this poller only refreshes public config and
        // never surfaces its own errors to the user.
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
    const normalizeOAuthHost = (hostname: string): string => hostname.replace(/^www\./i, "");

    const parseOrigin = (value: string): URL | null => {
      try {
        return new URL(value);
      } catch {
        return null;
      }
    };

    const currentOriginUrl = parseOrigin(window.location.origin);

    const isTrustedOAuthOrigin = (origin: string) => {
      if (!currentOriginUrl) {
        return origin === window.location.origin;
      }

      const incomingOriginUrl = parseOrigin(origin);
      if (!incomingOriginUrl) {
        return false;
      }

      const currentPort = currentOriginUrl.port || (currentOriginUrl.protocol === "https:" ? "443" : "80");
      const incomingPort = incomingOriginUrl.port || (incomingOriginUrl.protocol === "https:" ? "443" : "80");

      return (
        normalizeOAuthHost(incomingOriginUrl.hostname) === normalizeOAuthHost(currentOriginUrl.hostname)
        && incomingPort === currentPort
      );
    };

    const isTrustedOAuthSource = (source: MessageEventSource | null) => {
      return Boolean(socialPopupRef.current && source === socialPopupRef.current);
    };

    const hasActiveSocialAttempt = () => {
      if (socialLoginLockRef.current) {
        return true;
      }

      return Boolean(socialPopupRef.current && !socialPopupRef.current.closed);
    };

    const handleOAuthSignal = async (payload: { type?: string; reason?: string; ts?: number; redirect?: string; isNew?: boolean }) => {
      const isRecentOAuthEvent =
        typeof payload.ts === "number"
          ? Math.abs(Date.now() - payload.ts) <= 2 * 60_000
          : false;

      if (
        (payload.type === "vex_oauth_success" || payload.type === "vex_oauth_error")
        && !hasActiveSocialAttempt()
        && !isRecentOAuthEvent
      ) {
        return;
      }

      if (typeof payload.ts === "number" && payload.ts <= lastOAuthEventTsRef.current) {
        return;
      }

      if (typeof payload.ts === "number") {
        lastOAuthEventTsRef.current = payload.ts;
      }

      if (payload.type === "vex_oauth_success") {
        const redirectTarget = resolveOAuthEventRedirect(payload);
        if (socialPopupRef.current && !socialPopupRef.current.closed) {
          try {
            socialPopupRef.current.close();
          } catch {
            // Ignore popup close failures in hardened browser contexts.
          }
        }
        socialPopupRef.current = null;
        clearSocialLoginLock(false);
        await refreshUser();
        setIsLoading(false);
        setLocation(redirectTarget);
        return;
      }

      if (payload.type === "vex_oauth_error") {
        const failingPlatform = socialLoginLockRef.current?.platformName?.trim().toLowerCase() || "";
        const reason = (payload.reason || "").toLowerCase();
        const isGoogleConsentRelated =
          failingPlatform === "google"
          && !socialGoogleForceConsentRetriedRef.current
          && (reason.includes("access_denied")
            || reason.includes("scope")
            || reason.includes("oauth_exchange_failed")
            || reason.includes("no_token"));

        if (isGoogleConsentRelated) {
          socialGoogleForceConsentRetriedRef.current = true;
          try {
            await startPlatformOAuthFlow("google", { forceConsent: true });
            return;
          } catch {
            // Continue to default error handling below.
          }
        }

        clearSocialLoginLock();
        toast({
          title: t('common.error'),
          description: payload.reason || t('auth.socialLoginFailed'),
          variant: 'destructive',
        });
      }
    };

    const onMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (!isTrustedOAuthOrigin(event.origin)) {
        return;
      }

      const payload = event.data as { type?: string; reason?: string; ts?: number; redirect?: string; isNew?: boolean };

      if (!isTrustedOAuthSource(event.source)) {
        const isOAuthSignal = payload.type === "vex_oauth_success" || payload.type === "vex_oauth_error";
        const isRecentOAuthSignal =
          isOAuthSignal
          && typeof payload.ts === "number"
          && Math.abs(Date.now() - payload.ts) <= 2 * 60_000;

        if (!isRecentOAuthSignal) {
          return;
        }
      }

      await handleOAuthSignal(payload);
    };

    const onStorage = async (event: StorageEvent) => {
      if (event.key !== OAUTH_EVENT_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as { type?: string; reason?: string; ts?: number; redirect?: string; isNew?: boolean };
        await handleOAuthSignal(payload);
      } catch {
        // Ignore malformed storage payloads.
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
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
  }, [refreshUser, setLocation, t, toast]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTO_CREATE_ATTEMPTS_STORAGE_KEY);
      const parsed = Number.parseInt(raw || "0", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        setAutoCreateAttempts(Math.min(parsed, AUTO_CREATE_MAX_CLIENT_ATTEMPTS));
      }
    } catch {
      // Ignore local storage read errors.
    }
  }, []);

  useEffect(() => {
    if (currentTab === "account") {
      queueFocus(accountIdInputRef.current);
      return;
    }

    if (currentTab === "phone") {
      queueFocus(phoneInputRef.current);
      return;
    }

    if (currentTab === "email") {
      queueFocus(emailInputRef.current);
    }
  }, [currentTab]);

  useEffect(() => {
    if (!showForgotPassword) return;

    if (forgotPasswordStep === "request") {
      queueFocus(forgotIdentifierInputRef.current);
      return;
    }

    queueFocus(resetCodeInputRef.current);
  }, [showForgotPassword, forgotPasswordStep]);

  useEffect(() => {
    if (!showIdentifierOtpModal) return;
    queueFocus(identifierOtpCodeInputRef.current);
  }, [showIdentifierOtpModal]);

  useEffect(() => {
    if (!showTwoFactorModal) return;
    queueFocus(twoFactorCodeInputRef.current);
  }, [showTwoFactorModal]);

  const getOrCreateAutoCreateClientId = (): string => {
    try {
      const existing = localStorage.getItem(AUTO_CREATE_CLIENT_ID_STORAGE_KEY);
      if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
        return existing;
      }
    } catch {
      // Ignore storage access issues and continue with generated value.
    }

    const randomSuffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

    const generated = `${Date.now().toString(36)}_${randomSuffix}`.substring(0, 64);

    try {
      localStorage.setItem(AUTO_CREATE_CLIENT_ID_STORAGE_KEY, generated);
    } catch {
      // Ignore storage write issues; request still carries this generated value.
    }

    return generated;
  };

  const isAutoCreateFeatureBlocked = autoCreateAttempts >= AUTO_CREATE_MAX_CLIENT_ATTEMPTS;

  const recordAutoCreatePromptAttempt = (): number => {
    const next = Math.min(autoCreateAttempts + 1, AUTO_CREATE_MAX_CLIENT_ATTEMPTS);
    setAutoCreateAttempts(next);
    try {
      localStorage.setItem(AUTO_CREATE_ATTEMPTS_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage write issues; in-memory attempt counter still applies.
    }
    return next;
  };

  const offerAutoCreatePrompt = (payload: { identifier: string; type: "email" | "phone" | "account"; password: string }): boolean => {
    if (isAutoCreateFeatureBlocked) {
      return false;
    }

    setPendingRegistration(payload);
    setShowCreateAccountModal(true);
    recordAutoCreatePromptAttempt();
    return true;
  };

  const checkTermsAgreed = () => {
    if (!agreedToTerms) {
      setShowTermsVisualWarning(true);
      toast({
        title: t('auth.termsRequiredTitle'),
        description: t('auth.termsRequiredDescription'),
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const requestPostSignupNotifications = async () => {
    try {
      const summary = await requestPostSignupNotificationPermissions();
      const granted = summary.notifications === "granted" || summary.nativePush === "granted";

      if (granted) {
        toast({
          title: t('common.success'),
          description: t('permissions.postSignup.success'),
        });
        return;
      }

      toast({
        title: t('permissions.postSignup.blocked'),
        description: t('permissions.postSignup.openSettings'),
        action: (
          <ToastAction altText={t('permissions.gate.openSettings')} onClick={() => { void openNotificationSettings(); }}>
            {t('permissions.gate.openSettings')}
          </ToastAction>
        ),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('permissions.gate.retryHint'),
        variant: 'destructive',
      });
    }
  };

  const promptPostSignupNotifications = () => {
    toast({
      title: t('permissions.postSignup.title'),
      description: t('permissions.postSignup.description'),
      action: (
        <ToastAction altText={t('permissions.postSignup.allow')} onClick={() => { void requestPostSignupNotifications(); }}>
          {t('permissions.postSignup.allow')}
        </ToastAction>
      ),
    });
  };

  const applyLoginFlowResult = (result: LoginFlowResult) => {
    if (result.status === "authenticated") {
      setShowIdentifierOtpModal(false);
      setShowTwoFactorModal(false);
      setIdentifierOtpCode("");
      setTwoFactorCode("");
      if (shouldPromptPostSignupPermissionsRef.current) {
        shouldPromptPostSignupPermissionsRef.current = false;
        promptPostSignupNotifications();
      }
      setLocation("/");
      return;
    }

    if (result.status === "identifier_otp_required") {
      setIdentifierOtpChallengeToken(result.challengeToken);
      setIdentifierOtpMethods(result.availableMethods);
      setSelectedIdentifierOtpMethod(result.availableMethods[0] || "email");
      setIdentifierOtpMaskedTarget(result.maskedTarget || "");
      setIdentifierOtpCode("");
      setShowIdentifierOtpModal(true);
      return;
    }

    if (result.status === "two_factor_required") {
      setShowIdentifierOtpModal(false);
      setShowTwoFactorModal(true);
      setTwoFactorChallengeToken(result.challengeToken);
      setTwoFactorCode("");
    }
  };

  const handleIdentifierOtpResend = async (requestedMethod?: IdentifierOtpMethod) => {
    if (!identifierOtpChallengeToken) return;
    setIsLoading(true);
    try {
      const nextMethod = requestedMethod || selectedIdentifierOtpMethod;
      const resendResult = await requestIdentifierOtp(identifierOtpChallengeToken, nextMethod);
      setSelectedIdentifierOtpMethod(nextMethod);
      if (resendResult.maskedTarget) {
        setIdentifierOtpMaskedTarget(resendResult.maskedTarget);
      }

      toast({
        title: t('common.success'),
        description: resendResult.maskedTarget
          ? `${t('settings.verificationCodeLabel')}: ${resendResult.maskedTarget}`
          : t('settings.verificationCodeLabel'),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleIdentifierOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifierOtpChallengeToken || !identifierOtpCode.trim()) {
      focusAndScroll(identifierOtpCodeInputRef.current);
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyIdentifierOtp(identifierOtpChallengeToken, identifierOtpCode.trim());
      applyLoginFlowResult(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorChallengeToken || !twoFactorCode.trim()) {
      focusAndScroll(twoFactorCodeInputRef.current);
      return;
    }

    setIsLoading(true);
    try {
      await verifyTwoFactorChallenge(twoFactorChallengeToken, twoFactorCode.trim(), false);
      setShowTwoFactorModal(false);
      setTwoFactorCode("");
      setTwoFactorChallengeToken("");
      if (shouldPromptPostSignupPermissionsRef.current) {
        shouldPromptPostSignupPermissionsRef.current = false;
        promptPostSignupNotifications();
      }
      setLocation("/");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOneClickRegister = async () => {
    if (!checkTermsAgreed()) return;
    setIsLoading(true);
    try {
      const result = await oneClickRegister(referralCodeFromUrl || undefined);
      // Pause the background auth-surface poller for the duration of the
      // credentials → nickname dialogs. The new user has a vex_token cookie
      // attached to every request but no chosen username yet, so any other
      // gated call could surface a misleading error toast over the dialog.
      quickSignupInProgressRef.current = true;
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
    shouldPromptPostSignupPermissionsRef.current = false;
    setIsLoading(true);
    try {
      const result = await loginByAccount(accountLoginForm.accountId, accountLoginForm.password);
      applyLoginFlowResult(result);
    } catch {
      toast({ title: t('common.error'), description: t('auth.tryAgain'), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    shouldPromptPostSignupPermissionsRef.current = false;
    setIsLoading(true);
    try {
      // Phone tab: validate phone number format (digits with optional + prefix, min 7 chars)
      const phoneClean = phoneLoginForm.phone.trim();
      if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
        toast({ title: t('common.error'), description: t('auth.phoneInvalidFormat'), variant: "destructive" });
        focusAndScroll(phoneInputRef.current);
        setIsLoading(false);
        return;
      }
      const result = await loginByPhone(phoneClean, phoneLoginForm.password);
      applyLoginFlowResult(result);
    } catch {
      toast({ title: t('common.error'), description: t('auth.tryAgain'), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    shouldPromptPostSignupPermissionsRef.current = false;
    setIsLoading(true);
    try {
      // Email tab: only accept email format with @
      if (!emailLoginForm.username.includes("@")) {
        toast({ title: t('common.error'), description: t('auth.emailInvalidFormat'), variant: "destructive" });
        focusAndScroll(emailInputRef.current);
        setIsLoading(false);
        return;
      }
      const result = await loginByEmail(emailLoginForm.username, emailLoginForm.password);
      applyLoginFlowResult(result);
    } catch {
      toast({ title: t('common.error'), description: t('auth.tryAgain'), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!pendingRegistration) return;
    shouldPromptPostSignupPermissionsRef.current = false;
    setIsLoading(true);
    try {
      const autoCreateClientId = getOrCreateAutoCreateClientId();
      const res = await fetchWithCsrf("/api/auth/create-from-identifier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VEX-Client-ID": autoCreateClientId,
        },
        body: JSON.stringify(pendingRegistration),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        if (data.errorCode === "AUTO_CREATE_BLOCKED") {
          const blockedFromAccountFlow = pendingRegistration?.type === "account";
          setAutoCreateAttempts(AUTO_CREATE_MAX_CLIENT_ATTEMPTS);
          try {
            localStorage.setItem(AUTO_CREATE_ATTEMPTS_STORAGE_KEY, String(AUTO_CREATE_MAX_CLIENT_ATTEMPTS));
          } catch {
            // Ignore storage write issues; state is already updated in memory.
          }
          setShowCreateAccountModal(false);
          setPendingRegistration(null);
          setActiveTab("one-click");
          if (blockedFromAccountFlow) {
            setShowAccountNotFoundModal(true);
          }
          toast({ title: t('common.error'), description: t('auth.useQuickTab'), variant: "destructive" });
          return;
        }

        throw new Error(typeof data.error === "string" ? data.error : t('common.error'));
      }

      if (data.user && typeof data.token === "string") {
        confirmOneClickLogin(data.user as UserSchema, data.token);
        setShowCreateAccountModal(false);
        setPendingRegistration(null);
        promptPostSignupNotifications();
        setLocation("/");
        return;
      }

      if (data.requiresIdentifierOtp === true && typeof data.challengeToken === "string") {
        shouldPromptPostSignupPermissionsRef.current = true;
        setIdentifierOtpChallengeToken(data.challengeToken);
        const methods = Array.isArray(data.availableMethods)
          ? data.availableMethods.filter((value: unknown): value is IdentifierOtpMethod => value === "email" || value === "phone")
          : [];
        setIdentifierOtpMethods(methods);
        setSelectedIdentifierOtpMethod(methods[0] || "email");
        setIdentifierOtpMaskedTarget(typeof data.maskedTarget === "string" ? data.maskedTarget : "");
        setIdentifierOtpCode("");
        setShowIdentifierOtpModal(true);
      }

      setShowCreateAccountModal(false);
      setPendingRegistration(null);
      toast({
        title: t('auth.createAccount'),
        description: t('auth.accountCreatedVerify')
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordForm.identifier.trim()) {
      focusAndScroll(forgotIdentifierInputRef.current);
      return;
    }
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
      const tokenFromResponse = typeof data.token === "string" ? data.token.trim() : "";
      const deliveryMasked = data?.delivery && typeof data.delivery === "object" && typeof data.delivery.masked === "string"
        ? data.delivery.masked
        : "";
      const shouldPrefillResetToken = import.meta.env.DEV && tokenFromResponse.length > 0;

      setResetToken(shouldPrefillResetToken ? tokenFromResponse : "");
      setForgotPasswordStep("reset");
      toast({
        title: t('common.success'),
        description: deliveryMasked
          ? `${t('auth.resetTokenGenerated')}: ${deliveryMasked}`
          : t('auth.resetTokenGenerated'),
      });
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
      focusAndScroll(confirmPasswordInputRef.current);
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
      setResetToken("");
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

  const buildCredentialsShareText = () => t('auth.credentialsShareBody', {
    accountId: generatedCredentials?.accountId ?? "",
    password: generatedCredentials?.password ?? "",
  });

  const copyAllCredentials = () => {
    const text = buildCredentialsShareText();
    navigator.clipboard.writeText(text);
    setCopiedField("all");
    toast({ title: t('auth.copied'), description: t('auth.allCopied') });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const shareCredentials = async () => {
    const text = buildCredentialsShareText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('auth.credentialsShareTitle'),
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
        // If the user dismissed the nickname dialog while the request was
        // in flight, silently abandon — no toast, no side effects.
        if (!quickSignupInProgressRef.current) return;
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        toast({
          title: t('common.error'),
          description: (typeof data.error === "string" && data.error) || t('auth.failedSetNickname'),
          variant: "destructive",
        });
        return;
      }

      // The server returns the updated user record. Setting nickname during
      // one-click signup flips usernameSelectedAt server-side, so we must use
      // that updated user (not the stale pendingUser) when authenticating —
      // otherwise the AuthProvider would still see usernameSelectedAt = null
      // and bounce us to the SelectUsername redirect page.
      const updatedUser = await res.json().catch(() => null) as UserSchema | null;

      // Guard against late-arriving success after the user dismissed the
      // dialog: do not log them in or redirect them in that case.
      if (!quickSignupInProgressRef.current) return;

      if ((updatedUser || pendingUser) && pendingToken) {
        const userToCommit = (updatedUser ?? (pendingUser as unknown as UserSchema));
        confirmOneClickLogin(userToCommit, pendingToken);
        promptPostSignupNotifications();
      }
      // Signup is fully complete — re-enable the background poller.
      quickSignupInProgressRef.current = false;
      setShowNicknameModal(false);
      setPendingUser(null);
      setPendingToken(null);
      setNickname("");
      setLocation("/");
    } catch (error: unknown) {
      // Suppress error toast if the dialog was dismissed mid-request.
      if (!quickSignupInProgressRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      className="relative flex min-h-[100svh] supports-[min-height:100dvh]:min-h-[100dvh] items-start justify-center overflow-y-auto bg-background p-4 pt-20 pb-[calc(env(safe-area-inset-bottom)+8rem)] sm:items-center sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      dir={dir}
    >
      <div
        className="absolute start-4 end-4 flex items-center justify-between z-50"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <div className="flex items-center gap-2">
          <SupportContactQuickLaunch />
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
        </div>
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md border-primary/20 overflow-hidden shadow-sm sm:shadow-md">
        <div className="p-6 text-center border-b border-border">
          <div className="flex justify-center mb-4">
            <VexLogo size={64} loading="eager" fetchPriority="high" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">VEX</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('auth.gamingTrading')}</p>
        </div>

        <CardContent className="p-0 max-h-[calc(100svh-9.75rem)] supports-[max-height:100dvh]:max-h-[calc(100dvh-9.75rem)] sm:max-h-[calc(100dvh-8.5rem)] overflow-y-auto overscroll-contain">
          <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="sticky top-0 z-10 w-full rounded-none border-b border-border h-auto p-0 bg-background/95 backdrop-blur flex items-stretch overflow-x-auto">
              {enabledTabs.includes("one-click") && (
                <TabsTrigger
                  value="one-click"
                  className="min-w-[4.75rem] flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs sm:text-sm"
                  data-testid="tab-one-click"
                >
                  <Zap className="w-4 h-4 me-1" />
                  {t('auth.quick')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("account") && (
                <TabsTrigger
                  value="account"
                  className="min-w-[4.75rem] flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs sm:text-sm"
                  data-testid="tab-account"
                >
                  <User className="w-4 h-4 me-1" />
                  {t('auth.account')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("phone") && (
                <TabsTrigger
                  value="phone"
                  className="min-w-[4.75rem] flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs sm:text-sm"
                  data-testid="tab-phone"
                >
                  <Smartphone className="w-4 h-4 me-1" />
                  {t('auth.phone')}
                </TabsTrigger>
              )}
              {enabledTabs.includes("email") && (
                <TabsTrigger
                  value="email"
                  className="min-w-[4.75rem] flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs sm:text-sm"
                  data-testid="tab-email"
                >
                  <Mail className="w-4 h-4 me-1" />
                  {t('auth.email')}
                </TabsTrigger>
              )}
            </TabsList>

            <div className="p-6 space-y-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pb-6">
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
                      className="h-11 w-full bg-primary hover:bg-primary/90 text-primary-foreground"
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
                        ref={accountIdInputRef}
                        id="accountId"
                        data-testid="input-account-id"
                        className="h-11"
                        value={accountLoginForm.accountId}
                        onChange={e => setAccountLoginForm(prev => ({ ...prev, accountId: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(accountPasswordInputRef.current);
                        }}
                        placeholder={t('auth.enterAccountId')}
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountPassword">{t('auth.password')}</Label>
                      <Input
                        ref={accountPasswordInputRef}
                        id="accountPassword"
                        type="password"
                        data-testid="input-account-password"
                        className="h-11"
                        value={accountLoginForm.password}
                        onChange={e => setAccountLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(accountLoginButtonRef.current);
                        }}
                        placeholder={t('auth.enterPassword')}
                        autoComplete="current-password"
                        enterKeyHint="done"
                        required
                      />
                    </div>
                    <Button ref={accountLoginButtonRef} type="submit" className="h-11 w-full" disabled={isLoading} data-testid="button-account-login">
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
                        ref={phoneInputRef}
                        id="phone"
                        type="tel"
                        data-testid="input-phone"
                        className="h-11"
                        value={phoneLoginForm.phone}
                        onChange={e => {
                          // Only allow digits and + prefix
                          const val = e.target.value.replace(/[^0-9+]/g, '');
                          setPhoneLoginForm(prev => ({ ...prev, phone: val }));
                        }}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(phonePasswordInputRef.current);
                        }}
                        placeholder="+1234567890"
                        pattern="^\+?[0-9]{7,15}$"
                        autoComplete="tel"
                        inputMode="tel"
                        enterKeyHint="next"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phonePassword">{t('auth.password')}</Label>
                      <Input
                        ref={phonePasswordInputRef}
                        id="phonePassword"
                        type="password"
                        data-testid="input-phone-password"
                        className="h-11"
                        value={phoneLoginForm.password}
                        onChange={e => setPhoneLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(phoneLoginButtonRef.current);
                        }}
                        placeholder={t('auth.enterPassword')}
                        autoComplete="current-password"
                        enterKeyHint="done"
                        required
                      />
                    </div>
                    <Button ref={phoneLoginButtonRef} type="submit" className="h-11 w-full" disabled={isLoading} data-testid="button-phone-login">
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
                        ref={emailInputRef}
                        id="username"
                        data-testid="input-username"
                        className="h-11"
                        value={emailLoginForm.username}
                        onChange={e => setEmailLoginForm(prev => ({ ...prev, username: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(emailPasswordInputRef.current);
                        }}
                        placeholder={t('auth.enterUsernameEmail')}
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emailPassword">{t('auth.password')}</Label>
                      <Input
                        ref={emailPasswordInputRef}
                        id="emailPassword"
                        type="password"
                        data-testid="input-email-password"
                        className="h-11"
                        value={emailLoginForm.password}
                        onChange={e => setEmailLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          queueFocus(emailLoginButtonRef.current);
                        }}
                        placeholder={t('auth.enterPassword')}
                        autoComplete="current-password"
                        enterKeyHint="done"
                        required
                      />
                    </div>
                    <Button ref={emailLoginButtonRef} type="submit" className="h-11 w-full" disabled={isLoading} data-testid="button-email-login">
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

              {/* Terms & Privacy Agreement Checkbox */}
              <div
                className={`rounded-md border p-3 transition-all ${showTermsVisualWarning && !agreedToTerms
                  ? "border-destructive/70 bg-destructive/10 ring-2 ring-destructive/30"
                  : "border-border"
                  }`}
                data-testid="terms-agreement-container"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms-agreement"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setAgreedToTerms(isChecked);
                      if (isChecked) {
                        setShowTermsVisualWarning(false);
                      }
                    }}
                    className="mt-0.5 h-5 w-5"
                    data-testid="checkbox-terms"
                  />
                  <label
                    htmlFor="terms-agreement"
                    className="text-sm text-muted-foreground leading-relaxed cursor-pointer select-none"
                  >
                    <>
                      {t('auth.termsAgreementPrefix')} {" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground underline decoration-foreground/60 underline-offset-4 hover:text-primary"
                      >
                        {t('auth.termsConditions')}
                      </a>
                      {" "}{t('common.and')} {" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground underline decoration-foreground/60 underline-offset-4 hover:text-primary"
                      >
                        {t('auth.privacyPolicy')}
                      </a>
                    </>
                  </label>
                </div>

                {showTermsVisualWarning && !agreedToTerms && (
                  <div className="mt-2 flex items-start gap-2 text-destructive" data-testid="terms-strong-visual-hint">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs font-semibold">{t('auth.termsRequiredDescription')}</p>
                  </div>
                )}
              </div>

              {socialPlatforms.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center mb-3">{t('auth.orContinueWith')}</p>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {socialPlatforms
                      .filter(shouldShowSocialPlatform)
                      .map((platform) => {
                        const Icon = PLATFORM_ICONS[platform.icon] || Globe;
                        return (
                          <Button
                            key={platform.id}
                            variant="outline"
                            size="icon"
                            className="w-12 h-12 rounded-full hover:scale-105 transition-transform"
                            onClick={() => {
                              void handleSocialLogin(platform);
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
            </div>
          </Tabs>
          <div
            aria-hidden="true"
            className="h-[calc(env(safe-area-inset-bottom)+4rem)] sm:hidden"
          />
        </CardContent>
      </Card>

      <Dialog open={showCredentialsModal} onOpenChange={(open) => {
        if (!open) {
          // User dismissed the credentials dialog without continuing — stop
          // pausing the poller so the login page returns to its normal state.
          quickSignupInProgressRef.current = false;
        }
        setShowCredentialsModal(open);
      }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
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
                    window.open(`mailto:?subject=${encodeURIComponent(t('auth.credentialsShareMailSubject'))}&body=${text}`, '_blank');
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
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
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
                  ref={forgotIdentifierInputRef}
                  id="identifier"
                  data-testid="input-forgot-identifier"
                  value={forgotPasswordForm.identifier}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, identifier: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    queueFocus(forgotRequestButtonRef.current);
                  }}
                  placeholder={t('auth.enterIdentifier')}
                  enterKeyHint="done"
                  required
                />
              </div>
              <Button ref={forgotRequestButtonRef} type="submit" className="w-full" disabled={isLoading} data-testid="button-request-reset">
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('auth.requestReset')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="resetCode">{t('settings.verificationCodeLabel')}</Label>
                <Input
                  ref={resetCodeInputRef}
                  id="resetCode"
                  data-testid="input-reset-code"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value.trim())}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    queueFocus(newPasswordInputRef.current);
                  }}
                  placeholder={t('settings.otpPlaceholder')}
                  autoCapitalize="characters"
                  enterKeyHint="next"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('auth.newPassword')}</Label>
                <Input
                  ref={newPasswordInputRef}
                  id="newPassword"
                  type="password"
                  data-testid="input-new-password"
                  value={forgotPasswordForm.newPassword}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    queueFocus(confirmPasswordInputRef.current);
                  }}
                  placeholder={t('auth.enterNewPassword')}
                  enterKeyHint="next"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                <Input
                  ref={confirmPasswordInputRef}
                  id="confirmPassword"
                  type="password"
                  data-testid="input-confirm-password"
                  value={forgotPasswordForm.confirmPassword}
                  onChange={e => setForgotPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    queueFocus(resetPasswordButtonRef.current);
                  }}
                  placeholder={t('auth.confirmNewPassword')}
                  enterKeyHint="done"
                  required
                />
              </div>
              <Button ref={resetPasswordButtonRef} type="submit" className="w-full" disabled={isLoading} data-testid="button-reset-password">
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('auth.resetPassword')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showIdentifierOtpModal} onOpenChange={setShowIdentifierOtpModal}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              {t('settings.verificationCodeLabel')}
            </DialogTitle>
            <DialogDescription>
              {identifierOtpMaskedTarget
                ? `${t('settings.verificationCodeLabel')}: ${identifierOtpMaskedTarget}`
                : t('settings.verificationDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleIdentifierOtpVerify} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="identifier-otp-code">{t('settings.verificationCodeLabel')}</Label>
              <Input
                ref={identifierOtpCodeInputRef}
                id="identifier-otp-code"
                value={identifierOtpCode}
                onChange={(e) => setIdentifierOtpCode(e.target.value.replace(/\s+/g, ""))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  queueFocus(identifierOtpVerifyButtonRef.current);
                }}
                placeholder={t('settings.otpPlaceholder')}
                inputMode="numeric"
                enterKeyHint="done"
                required
              />
            </div>

            {identifierOtpMethods.length > 1 && (
              <div className="space-y-2">
                <Label>{t('support.chooseContact')}</Label>
                <div className="flex gap-2">
                  {identifierOtpMethods.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant={selectedIdentifierOtpMethod === method ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => {
                        void handleIdentifierOtpResend(method);
                      }}
                      disabled={isLoading}
                    >
                      {method === "email" ? t('auth.email') : t('auth.phone')}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  void handleIdentifierOtpResend(selectedIdentifierOtpMethod);
                }}
                disabled={isLoading}
              >
                {t('settings.resendCode')}
              </Button>
              <Button ref={identifierOtpVerifyButtonRef} type="submit" className="flex-1" disabled={isLoading}>
                {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('settings.verify')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showTwoFactorModal} onOpenChange={setShowTwoFactorModal}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              {t('settings.twoFactorAuth')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.twoFactorAuthDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTwoFactorVerify} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="two-factor-code">{t('settings.twoFactorCode')}</Label>
              <Input
                ref={twoFactorCodeInputRef}
                id="two-factor-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\s+/g, ""))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  queueFocus(twoFactorVerifyButtonRef.current);
                }}
                placeholder={t('settings.otpPlaceholder')}
                inputMode="numeric"
                enterKeyHint="done"
                required
              />
            </div>
            <Button ref={twoFactorVerifyButtonRef} type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('settings.verify')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateAccountModal} onOpenChange={setShowCreateAccountModal}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingRegistration?.type === "email"
                ? <Mail className="w-5 h-5 text-primary" />
                : pendingRegistration?.type === "phone"
                  ? <Smartphone className="w-5 h-5 text-primary" />
                  : <User className="w-5 h-5 text-primary" />}
              {t('auth.accountNotFound')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.noAccountExists')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-accent/10 rounded-md border border-accent/20">
              <p className="text-sm">
                <span className="font-semibold">
                  {pendingRegistration?.type === "email"
                    ? t('auth.email')
                    : pendingRegistration?.type === "phone"
                      ? t('auth.phone')
                      : t('auth.accountId')}
                  :
                </span>{" "}
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
                {t('common.cancel')}
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
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
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

      <Dialog open={showNicknameModal} onOpenChange={(open) => {
        if (!open) {
          quickSignupInProgressRef.current = false;
          setShowNicknameModal(false);
        }
      }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl">
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
