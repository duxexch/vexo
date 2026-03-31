import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";

interface BackButtonProps {
  fallbackPath?: string;
  className?: string;
}

export function BackButton({ fallbackPath = "/", className = "" }: BackButtonProps) {
  const [, setLocation] = useLocation();
  const { t, language } = useI18n();
  const isRtl = ['ar', 'fa', 'ur', 'he'].includes(language);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation(fallbackPath);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`gap-2 ${className}`}
      data-testid="button-back"
    >
      <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
      <span>{t('common.back')}</span>
    </Button>
  );
}
