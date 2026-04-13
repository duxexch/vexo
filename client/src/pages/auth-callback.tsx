import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { VexLogo } from "@/components/vex-logo";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const OAUTH_EVENT_STORAGE_KEY = "vex_oauth_event";

type OAuthEventType = "vex_oauth_success" | "vex_oauth_error";

type OAuthEventPayload = {
  type: OAuthEventType;
  reason?: string;
  redirect?: string;
  isNew?: boolean;
  ts: number;
};

/**
 * OAuth Callback Page — Exchanges one-time OAuth code for JWT token.
 * URL: /auth/callback?code=...
 */
export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [stage, setStage] = useState<"processing" | "success" | "error">("processing");

  const providerLabel = useMemo(() => {
    const platform = new URLSearchParams(window.location.search).get("platform");
    if (!platform) {
      return "OAuth";
    }

    const normalized = platform.trim().toLowerCase();
    if (!normalized) {
      return "OAuth";
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

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

  const resolveSuccessRedirect = (rawRedirect?: unknown, isNew?: unknown): string => {
    if (isNew === true) {
      return "/profile?setup=true";
    }

    const sanitized = sanitizeRelativeRedirect(typeof rawRedirect === "string" ? rawRedirect : undefined);
    if (!sanitized || sanitized.startsWith("/auth/callback")) {
      return "/";
    }

    return sanitized;
  };

  const hasPopupHint = () => {
    const popupHint = new URLSearchParams(window.location.search).get("popup");
    return popupHint === "1" || popupHint === "true";
  };

  const isPopupContext = () => hasPopupHint() || window.name === "vex_social_auth" || Boolean(window.opener);

  const emitOAuthEvent = (payload: Omit<OAuthEventPayload, "ts">) => {
    const fullPayload: OAuthEventPayload = {
      ...payload,
      ts: Date.now(),
    };

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(fullPayload, window.location.origin);
      } catch {
        // Ignore cross-window notification failures.
      }
    }

    // Fallback channel for cases where opener gets detached during provider redirects.
    try {
      localStorage.setItem(OAUTH_EVENT_STORAGE_KEY, JSON.stringify(fullPayload));
    } catch {
      // Ignore storage failures (private mode/quota/etc).
    }
  };

  const closePopupWindow = (): boolean => {
    if (!isPopupContext()) {
      return false;
    }

    const attemptClose = () => {
      try {
        window.close();
      } catch {
        // Ignore close failures; we retry and then fallback.
      }

      // Some browsers only allow close after a _self context touch.
      try {
        window.open("", "_self");
        window.close();
      } catch {
        // Ignore fallback close failures.
      }
    };

    attemptClose();

    return window.closed;
  };

  const completePopupFlow = (): boolean => {
    if (!isPopupContext()) {
      return false;
    }

    if (closePopupWindow()) {
      return true;
    }

    window.setTimeout(() => {
      closePopupWindow();
    }, 180);

    return window.closed;
  };

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const callbackError = params.get("error");

      if (callbackError && !code) {
        setStage("error");
        emitOAuthEvent({ type: "vex_oauth_error", reason: callbackError });
        if (completePopupFlow()) {
          return;
        }
        setLocation(`/?error=${encodeURIComponent(callbackError)}`);
        return;
      }

      if (code) {
        const exchangeGuardKey = `vex_oauth_exchange_${code}`;
        const exchangeRedirectKey = `${exchangeGuardKey}_redirect`;
        const previousGuardState = sessionStorage.getItem(exchangeGuardKey);

        if (previousGuardState === "done") {
          const guardedRedirect = resolveSuccessRedirect(sessionStorage.getItem(exchangeRedirectKey), false);
          setStage("success");
          emitOAuthEvent({ type: "vex_oauth_success", redirect: guardedRedirect });
          if (completePopupFlow()) {
            return;
          }
          setLocation(guardedRedirect);
          return;
        }

        if (previousGuardState === "pending") {
          return;
        }

        sessionStorage.setItem(exchangeGuardKey, "pending");

        try {
          const exchangeCode = async () => {
            let lastError: unknown;

            for (let attempt = 1; attempt <= 3; attempt += 1) {
              try {
                const response = await fetch("/api/auth/social/exchange", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code }),
                  credentials: "include",
                });

                // Retry short-lived 5xx failures to make callback completion more reliable.
                if (response.status >= 500 && attempt < 3) {
                  await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
                  continue;
                }

                return response;
              } catch (error) {
                lastError = error;
                if (attempt < 3) {
                  await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
                  continue;
                }
              }
            }

            throw lastError || new Error("oauth_exchange_failed");
          };

          const res = await exchangeCode();

          if (!res.ok) {
            sessionStorage.removeItem(exchangeGuardKey);
            setStage("error");
            emitOAuthEvent({ type: "vex_oauth_error", reason: "oauth_exchange_failed" });
            if (completePopupFlow()) {
              return;
            }
            setLocation("/?error=oauth_exchange_failed");
            return;
          }

          const data = await res.json();
          if (!data?.token) {
            sessionStorage.removeItem(exchangeGuardKey);
            setStage("error");
            emitOAuthEvent({ type: "vex_oauth_error", reason: "no_token" });
            if (completePopupFlow()) {
              return;
            }
            setLocation("/?error=no_token");
            return;
          }

          localStorage.setItem("pwm_token", data.token);
          sessionStorage.setItem(exchangeGuardKey, "done");
          const successRedirect = resolveSuccessRedirect(data?.redirect, data?.isNew);
          sessionStorage.setItem(exchangeRedirectKey, successRedirect);
          setStage("success");

          emitOAuthEvent({
            type: "vex_oauth_success",
            redirect: successRedirect,
            isNew: data?.isNew === true,
          });
          if (completePopupFlow()) {
            return;
          }
          setLocation(successRedirect);
          return;
        } catch {
          sessionStorage.removeItem(exchangeGuardKey);
          setStage("error");
          emitOAuthEvent({ type: "vex_oauth_error", reason: "oauth_exchange_failed" });
          if (completePopupFlow()) {
            return;
          }
          setLocation("/?error=oauth_exchange_failed");
          return;
        }
      }

      setStage("error");
      emitOAuthEvent({ type: "vex_oauth_error", reason: "no_token" });
      if (completePopupFlow()) {
        return;
      }
      setLocation("/?error=no_token");
    };

    void run();
  }, [setLocation]);

  return (
    <div className="relative min-h-[100svh] overflow-y-auto bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute -bottom-32 right-8 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-md items-center justify-center px-4 sm:px-5 py-6 sm:py-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full rounded-3xl border border-slate-200/80 bg-white/85 p-8 shadow-[0_22px_60px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <VexLogo size={56} className="rounded-2xl" alt="VEX" />
          </div>

          <div className="space-y-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{providerLabel}</p>
            <h1 className="text-xl font-semibold text-slate-900">{t("auth.signIn")}</h1>
            <p className="text-sm text-slate-600">
              {stage === "processing" ? t("common.loading") : stage === "success" ? t("auth.signIn") : t("common.error")}
            </p>
          </div>

          <div className="mt-7 flex justify-center">
            {stage === "processing" && <Loader2 className="h-10 w-10 animate-spin text-slate-700" />}
            {stage === "success" && <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
            {stage === "error" && <AlertCircle className="h-10 w-10 text-rose-600" />}
          </div>

          <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full w-full ${stage === "processing" ? "animate-pulse bg-slate-700" : stage === "success" ? "bg-emerald-600" : "bg-rose-600"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
