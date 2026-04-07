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
        try {
          const res = await fetch("/api/auth/social/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
            credentials: "include",
          });

          if (!res.ok) {
            notifyOpener("vex_oauth_error", "oauth_exchange_failed");
            setLocation("/login?error=oauth_exchange_failed");
            return;
          }

          const data = await res.json();
          if (!data?.token) {
            notifyOpener("vex_oauth_error", "no_token");
            setLocation("/login?error=no_token");
            return;
          }

          localStorage.setItem("pwm_token", data.token);

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
