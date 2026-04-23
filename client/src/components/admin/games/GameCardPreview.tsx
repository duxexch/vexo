import { Gamepad2, type LucideIcon } from "lucide-react";
import { GAME_ICON_OPTIONS } from "./GameVisualPicker";
import { cn } from "@/lib/utils";

interface GameCardPreviewProps {
  nameEn: string;
  nameAr: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  iconName?: string;
  colorClass?: string;
  gradientClass?: string;
  language: string;
}

function lookupIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return Gamepad2;
  return GAME_ICON_OPTIONS.find((o) => o.name === iconName)?.icon || Gamepad2;
}

export function GameCardPreview({
  nameEn,
  nameAr,
  iconUrl,
  thumbnailUrl,
  imageUrl,
  iconName,
  colorClass,
  gradientClass,
  language,
}: GameCardPreviewProps) {
  const isAr = language === "ar";
  const FallbackIcon = lookupIcon(iconName);
  const displayName = isAr ? nameAr || nameEn : nameEn || nameAr;
  const heroImage = thumbnailUrl || imageUrl || iconUrl;

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {isAr ? "معاينة كارت اللعبة" : "Game Card Preview"}
      </div>

      {/* Lobby card variant */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div className={cn(
          "relative h-32 w-full bg-gradient-to-br",
          gradientClass || "from-primary/20 to-primary/5",
        )}>
          {heroImage ? (
            <img src={heroImage} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FallbackIcon className="h-16 w-16 text-foreground/40" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 p-3">
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl border",
            colorClass || "bg-primary/20 text-primary border-primary/30",
          )}>
            {iconUrl ? (
              <img src={iconUrl} alt="" className="h-7 w-7 rounded-md object-contain" />
            ) : (
              <FallbackIcon className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{displayName || (isAr ? "بدون اسم" : "Unnamed")}</div>
            <div className="truncate text-xs text-muted-foreground">{isAr ? "عرض الكارت في صالة الألعاب" : "How it appears in lobby"}</div>
          </div>
        </div>
      </div>

      {/* Compact tile variant (used in home/quick-actions) */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl border",
          colorClass || "bg-primary/20 text-primary border-primary/30",
        )}>
          {iconUrl ? (
            <img src={iconUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
          ) : (
            <FallbackIcon className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{displayName || "—"}</div>
          <div className="text-xs text-muted-foreground">{isAr ? "عرض مدمج (الرئيسية)" : "Compact tile (home)"}</div>
        </div>
      </div>
    </div>
  );
}
