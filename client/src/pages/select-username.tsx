import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VexLogo } from "@/components/vex-logo";
import { useToast } from "@/hooks/use-toast";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export default function SelectUsernamePage() {
  const { t, dir } = useI18n();
  const { user, updateUser, logout } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    setClientError(null);
  }, [username]);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return t("auth.usernameLengthError") || "Username must be 3-30 characters.";
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      return t("auth.usernameFormatError") || "Letters, numbers, and underscores only.";
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate(username);
    if (validationError) {
      setClientError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/select-username", {
        username: username.trim(),
      });
      const data = await res.json();
      if (data?.user) {
        updateUser(data.user);
        toast({
          title: t("auth.usernameSavedTitle") || "Username saved",
          description: t("auth.usernameSavedDesc") || "Welcome aboard!",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // queryClient throws "STATUS: BODY" — try to surface specific server error
      let display = message;
      const match = message.match(/^\d+:\s*(.+)$/s);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          display = parsed?.error || display;
        } catch {
          display = match[1];
        }
      }
      setClientError(display);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4"
      dir={dir}
      data-testid="page-select-username"
    >
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <VexLogo size={48} />
          <h1 className="text-2xl font-bold" data-testid="text-select-username-title">
            {t("auth.chooseUsernameTitle") || "Choose your username"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.chooseUsernameDesc") ||
              "This is how other players will see you. You can only set this once."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="username">
              {t("auth.username") || "Username"}
            </Label>
            <Input
              id="username"
              data-testid="input-select-username"
              autoComplete="off"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.usernamePlaceholder") || "e.g. ali_player"}
              disabled={submitting}
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">
              {t("auth.usernameHint") ||
                "3-30 characters. Letters, numbers, and underscores only."}
            </p>
          </div>

          {clientError && (
            <p
              className="text-sm font-medium text-destructive"
              role="alert"
              data-testid="text-select-username-error"
            >
              {clientError}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !username.trim()}
            data-testid="button-select-username-submit"
          >
            {submitting
              ? t("common.saving") || "Saving..."
              : t("auth.confirmUsername") || "Confirm username"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted-foreground underline hover:text-foreground"
            data-testid="button-select-username-logout"
          >
            {t("auth.logout") || "Sign out"}
          </button>
        </div>

        {user?.accountId && (
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.yourAccountId") || "Your account ID"}:{" "}
            <span className="font-mono">{user.accountId}</span>
          </p>
        )}
      </div>
    </div>
  );
}
