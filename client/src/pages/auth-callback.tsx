import { useEffect } from "react";
import { useLocation } from "wouter";

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

  const closePopupOrFallback = (fallbackPath: string): boolean => {
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

    // If browser blocks closing, continue in this tab as a safe fallback.
    window.setTimeout(() => {
      if (!window.closed) {
        window.location.replace(fallbackPath);
      }
    }, 250);

    return true;
  };

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      // Legacy fallback for older redirects still carrying token directly.
      const legacyToken = params.get("token");
      const legacyRedirect = params.get("redirect") || "/";
      const legacyIsNew = params.get("isNew") === "true";

      if (code) {
        const exchangeGuardKey = `vex_oauth_exchange_${code}`;
        const exchangeRedirectKey = `${exchangeGuardKey}_redirect`;
        const previousGuardState = sessionStorage.getItem(exchangeGuardKey);

        if (previousGuardState === "done") {
          const guardedRedirect = resolveSuccessRedirect(sessionStorage.getItem(exchangeRedirectKey), false);
          emitOAuthEvent({ type: "vex_oauth_success", redirect: guardedRedirect });
          if (closePopupOrFallback(guardedRedirect)) {
            return;
          }
          window.location.replace(guardedRedirect);
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
            emitOAuthEvent({ type: "vex_oauth_error", reason: "oauth_exchange_failed" });
            if (closePopupOrFallback("/login?error=oauth_exchange_failed")) {
              return;
            }
            setLocation("/login?error=oauth_exchange_failed");
            return;
          }

          const data = await res.json();
          if (!data?.token) {
            sessionStorage.removeItem(exchangeGuardKey);
            emitOAuthEvent({ type: "vex_oauth_error", reason: "no_token" });
            if (closePopupOrFallback("/login?error=no_token")) {
              return;
            }
            setLocation("/login?error=no_token");
            return;
          }

          localStorage.setItem("pwm_token", data.token);
          sessionStorage.setItem(exchangeGuardKey, "done");
          const successRedirect = resolveSuccessRedirect(data?.redirect, data?.isNew);
          sessionStorage.setItem(exchangeRedirectKey, successRedirect);

          emitOAuthEvent({
            type: "vex_oauth_success",
            redirect: successRedirect,
            isNew: data?.isNew === true,
          });
          if (closePopupOrFallback(successRedirect)) {
            return;
          }
          window.location.replace(successRedirect);
          return;
        } catch {
          sessionStorage.removeItem(exchangeGuardKey);
          emitOAuthEvent({ type: "vex_oauth_error", reason: "oauth_exchange_failed" });
          if (closePopupOrFallback("/login?error=oauth_exchange_failed")) {
            return;
          }
          setLocation("/login?error=oauth_exchange_failed");
          return;
        }
      }

      if (legacyToken) {
        localStorage.setItem("pwm_token", legacyToken);
        const legacyDestination = resolveSuccessRedirect(legacyRedirect, legacyIsNew);

        emitOAuthEvent({
          type: "vex_oauth_success",
          redirect: legacyDestination,
          isNew: legacyIsNew,
        });
        if (closePopupOrFallback(legacyDestination)) {
          return;
        }
        window.location.replace(legacyDestination);
        return;
      }

      emitOAuthEvent({ type: "vex_oauth_error", reason: "no_token" });
      if (closePopupOrFallback("/login?error=no_token")) {
        return;
      }
      setLocation("/login?error=no_token");
    };

    void run();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
