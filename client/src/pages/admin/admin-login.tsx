import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });

  const completeLogin = (data: { token: string; admin: unknown }) => {
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminUser", JSON.stringify(data.admin));
    queryClient.invalidateQueries();
    toast({
      title: t("common.success"),
      description: `${t("auth.signIn")} · ${t("nav.admin")}`,
    });
    setLocation("/admin/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = requiresTwoFactor
        ? await apiRequest("POST", "/api/admin/verify-2fa", {
          code: twoFactorCode,
          challengeToken: twoFactorChallengeToken,
        })
        : await apiRequest("POST", "/api/admin/login", credentials);

      const data = await response.json();

      if (data.requires2FA) {
        setRequiresTwoFactor(true);
        setTwoFactorChallengeToken(data.challengeToken || "");
        setTwoFactorCode("");
        toast({
          title: t("settings.twoFactorAuth"),
          description: t("settings.twoFactorCode"),
        });
        return;
      }

      if (data.token) {
        completeLogin(data);
      }
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("auth.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-background p-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t("admin.dashboard.title")}</CardTitle>
          <CardDescription>
            {`${t("auth.signIn")} · ${t("nav.admin")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {!requiresTwoFactor ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">{t("auth.username")}</Label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder={t("auth.username")}
                      className="h-11 ps-10"
                      value={credentials.username}
                      onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                      required
                      data-testid="input-admin-username"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder={t("auth.password")}
                      className="h-11 ps-10"
                      value={credentials.password}
                      onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                      required
                      data-testid="input-admin-password"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="totpCode">{t("settings.twoFactorCode")}</Label>
                <Input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t("settings.twoFactorCode")}
                  className="h-11"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                  required
                  data-testid="input-admin-2fa-code"
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.twoFactorBackupCodesDescription")}
                </p>
              </div>
            )}
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isLoading}
              data-testid="button-admin-login"
            >
              {isLoading
                ? t("common.loading")
                : requiresTwoFactor
                  ? t("settings.twoFactorVerifyAndEnable")
                  : `${t("auth.signIn")} ${t("nav.admin")}`}
            </Button>
            {requiresTwoFactor && (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full"
                onClick={() => {
                  setRequiresTwoFactor(false);
                  setTwoFactorCode("");
                  setTwoFactorChallengeToken("");
                }}
                data-testid="button-admin-login-back"
              >
                {t("common.back")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
