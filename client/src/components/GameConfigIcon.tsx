import { Gamepad2, type LucideIcon } from "lucide-react";
import type { GameConfigItem } from "@/lib/game-config";
import { cn } from "@/lib/utils";

type GameConfigIconProps = {
  config?: Pick<GameConfigItem, "icon" | "iconUrl"> | null;
  fallbackIcon?: LucideIcon;
  className?: string;
  alt?: string;
  decorative?: boolean;
};

export function GameConfigIcon({
  config,
  fallbackIcon: FallbackIcon = Gamepad2,
  className,
  alt = "",
  decorative = true,
}: GameConfigIconProps) {
  const IconComponent = config?.icon || FallbackIcon;

  if (config?.iconUrl) {
    return (
      <img
        src={config.iconUrl}
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        className={cn("object-contain", className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <IconComponent className={className} aria-hidden={decorative ? true : undefined} />;
}