import { Gamepad2, type LucideIcon } from "lucide-react";
import type { GameConfigItem } from "@/lib/game-config";
import { cn } from "@/lib/utils";

type GameConfigIconProps = {
  config?: Pick<GameConfigItem, "icon" | "iconUrl"> | null;
  fallbackIcon?: LucideIcon;
  className?: string;
  alt?: string;
  decorative?: boolean;
  fit?: "contain" | "cover";
};

export function GameConfigIcon({
  config,
  fallbackIcon: FallbackIcon = Gamepad2,
  className,
  alt = "",
  decorative = true,
  fit = "cover",
}: GameConfigIconProps) {
  const IconComponent = config?.icon || FallbackIcon;

  if (config?.iconUrl) {
    return (
      <img
        src={config.iconUrl}
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        className={cn(fit === "cover" ? "object-cover" : "object-contain", className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <IconComponent className={className} aria-hidden={decorative ? true : undefined} />;
}