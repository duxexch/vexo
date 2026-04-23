import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { CallType } from "@shared/socketio-events";

interface CallButtonProps {
  callType: CallType;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "icon";
}

export function CallButton({ callType, onClick, disabled, size = "icon" }: CallButtonProps) {
  const { t } = useI18n();
  const Icon = callType === "video" ? Video : Phone;
  const label = callType === "video" ? t("rtcCall.startVideo") : t("rtcCall.startVoice");
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={`button-call-${callType}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
