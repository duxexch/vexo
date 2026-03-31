import { AlertCircle, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface QueryErrorStateProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function QueryErrorState({ error, onRetry, className, compact }: QueryErrorStateProps) {
  const { t, dir } = useI18n();
  const isOffline = !navigator.onLine;
  const Icon = isOffline ? WifiOff : AlertCircle;

  if (compact) {
    return (
      <div role="alert" dir={dir} className={`flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm ${className ?? ""}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{error?.message || t('common.error')}</span>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 px-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div role="alert" dir={dir} className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className ?? ""}`}>
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <Icon className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{t('common.error')}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {error?.message || t('common.error')}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="me-2 h-4 w-4" />
          {t('auth.tryAgain')}
        </Button>
      )}
    </div>
  );
}
