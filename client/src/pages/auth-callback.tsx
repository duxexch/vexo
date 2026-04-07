import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * OAuth Callback Page — Exchanges one-time OAuth code for JWT token.
 * URL: /auth/callback?code=...
 */
export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();

  const notifyOpener = (type: "vex_oauth_success" | "vex_oauth_error", reason?: string) => {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type, reason }, window.location.origin);
      } catch {
        // Ignore cross-window notification failures.
      }
    }
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
        const previousGuardState = sessionStorage.getItem(exchangeGuardKey);

        if (previousGuardState === "done") {
          if (window.opener && !window.opener.closed) {
            notifyOpener("vex_oauth_success");
            window.close();
            return;
          }
          setLocation("/");
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
            notifyOpener("vex_oauth_error", "oauth_exchange_failed");
            setLocation("/login?error=oauth_exchange_failed");
            return;
          }

          const data = await res.json();
          if (!data?.token) {
            sessionStorage.removeItem(exchangeGuardKey);
            notifyOpener("vex_oauth_error", "no_token");
            setLocation("/login?error=no_token");
            return;
          }

          localStorage.setItem("pwm_token", data.token);
          sessionStorage.setItem(exchangeGuardKey, "done");

          if (window.opener && !window.opener.closed) {
            notifyOpener("vex_oauth_success");
            window.close();
            return;
          }

          if (data.isNew === true) {
            setLocation("/profile?setup=true");
            return;
          }

          setLocation(typeof data.redirect === "string" && data.redirect.length > 0 ? data.redirect : "/");
          return;
        } catch {
          sessionStorage.removeItem(exchangeGuardKey);
          notifyOpener("vex_oauth_error", "oauth_exchange_failed");
          setLocation("/login?error=oauth_exchange_failed");
          return;
        }
      }

      if (legacyToken) {
        localStorage.setItem("pwm_token", legacyToken);

        if (window.opener && !window.opener.closed) {
          notifyOpener("vex_oauth_success");
          window.close();
          return;
        }

        if (legacyIsNew) {
          setLocation("/profile?setup=true");
          return;
        }
        setLocation(legacyRedirect);
        return;
      }

      notifyOpener("vex_oauth_error", "no_token");
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
