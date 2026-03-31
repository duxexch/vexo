import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * OAuth Callback Page — Exchanges one-time OAuth code for JWT token.
 * URL: /auth/callback?code=...
 */
export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();

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
            setLocation("/login?error=oauth_exchange_failed");
            return;
          }

          const data = await res.json();
          if (!data?.token) {
            setLocation("/login?error=no_token");
            return;
          }

          localStorage.setItem("pwm_token", data.token);

          if (data.isNew === true) {
            setLocation("/profile?setup=true");
            return;
          }

          setLocation(typeof data.redirect === "string" && data.redirect.length > 0 ? data.redirect : "/");
          return;
        } catch {
          setLocation("/login?error=oauth_exchange_failed");
          return;
        }
      }

      if (legacyToken) {
        localStorage.setItem("pwm_token", legacyToken);
        if (legacyIsNew) {
          setLocation("/profile?setup=true");
          return;
        }
        setLocation(legacyRedirect);
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
