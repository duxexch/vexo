import {
  Crown,
  Target,
  Shuffle,
  Gem,
  Gamepad2,
  Dices,
  CircleDot,
  TrendingUp,
  Star,
  Trophy,
  Spade,
  Heart,
  Dice5,
  Swords,
  Zap,
  Award,
  Flame,
  Sparkles,
  Rocket,
  Bomb,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const GAME_ICON_OPTIONS: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Crown", icon: Crown },
  { name: "Target", icon: Target },
  { name: "Shuffle", icon: Shuffle },
  { name: "Gem", icon: Gem },
  { name: "Gamepad2", icon: Gamepad2 },
  { name: "Dices", icon: Dices },
  { name: "Dice5", icon: Dice5 },
  { name: "CircleDot", icon: CircleDot },
  { name: "TrendingUp", icon: TrendingUp },
  { name: "Star", icon: Star },
  { name: "Trophy", icon: Trophy },
  { name: "Spade", icon: Spade },
  { name: "Heart", icon: Heart },
  { name: "Swords", icon: Swords },
  { name: "Zap", icon: Zap },
  { name: "Award", icon: Award },
  { name: "Flame", icon: Flame },
  { name: "Sparkles", icon: Sparkles },
  { name: "Rocket", icon: Rocket },
  { name: "Bomb", icon: Bomb },
];

export const GAME_COLOR_PRESETS: Array<{ key: string; label: string; color: string; gradient: string; swatch: string }> = [
  { key: "amber", label: "Amber",   color: "bg-amber-500/20 text-amber-500 border-amber-500/30",     gradient: "from-amber-500/20 to-amber-600/10",     swatch: "from-amber-400 to-amber-600" },
  { key: "blue",  label: "Blue",    color: "bg-blue-500/20 text-blue-500 border-blue-500/30",        gradient: "from-blue-500/20 to-blue-600/10",       swatch: "from-blue-400 to-blue-600" },
  { key: "emerald", label: "Emerald", color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30", gradient: "from-emerald-500/20 to-emerald-600/10", swatch: "from-emerald-400 to-emerald-600" },
  { key: "purple", label: "Purple", color: "bg-purple-500/20 text-purple-500 border-purple-500/30",  gradient: "from-purple-500/20 to-purple-600/10",   swatch: "from-purple-400 to-purple-600" },
  { key: "rose",  label: "Rose",    color: "bg-rose-500/20 text-rose-500 border-rose-500/30",        gradient: "from-rose-500/20 to-rose-600/10",       swatch: "from-rose-400 to-rose-600" },
  { key: "cyan",  label: "Cyan",    color: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30",        gradient: "from-cyan-500/20 to-cyan-600/10",       swatch: "from-cyan-400 to-cyan-600" },
  { key: "indigo", label: "Indigo", color: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30",  gradient: "from-indigo-500/20 to-indigo-600/10",   swatch: "from-indigo-400 to-indigo-600" },
  { key: "red",   label: "Red",     color: "bg-red-500/20 text-red-500 border-red-500/30",           gradient: "from-red-500/20 to-red-600/10",         swatch: "from-red-400 to-red-600" },
  { key: "green", label: "Green",   color: "bg-green-500/20 text-green-500 border-green-500/30",     gradient: "from-green-500/20 to-green-600/10",     swatch: "from-green-400 to-green-600" },
  { key: "yellow", label: "Yellow", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",  gradient: "from-yellow-500/20 to-yellow-600/10",   swatch: "from-yellow-400 to-yellow-600" },
  { key: "pink",  label: "Pink",    color: "bg-pink-500/20 text-pink-500 border-pink-500/30",        gradient: "from-pink-500/20 to-pink-600/10",       swatch: "from-pink-400 to-pink-600" },
  { key: "teal",  label: "Teal",    color: "bg-teal-500/20 text-teal-500 border-teal-500/30",        gradient: "from-teal-500/20 to-teal-600/10",       swatch: "from-teal-400 to-teal-600" },
];

interface GameIconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  disabled?: boolean;
  language: string;
}

export function GameIconPicker({ value, onChange, disabled, language }: GameIconPickerProps) {
  const isAr = language === "ar";
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {isAr ? "أيقونة (Lucide) — تستخدم لو لم ترفع صورة" : "Icon (Lucide) — used when no image uploaded"}
      </div>
      <div className="grid grid-cols-10 gap-1.5">
        {GAME_ICON_OPTIONS.map(({ name, icon: Icon }) => (
          <button
            type="button"
            key={name}
            disabled={disabled}
            onClick={() => onChange(name)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-lg border transition-all",
              value === name
                ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-testid={`icon-pick-${name}`}
            title={name}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface GameColorPickerProps {
  colorClass: string;
  gradientClass: string;
  onChange: (next: { colorClass: string; gradientClass: string }) => void;
  language: string;
}

export function GameColorPicker({ colorClass, gradientClass, onChange, language }: GameColorPickerProps) {
  const isAr = language === "ar";
  const isCustom = colorClass !== "" && !GAME_COLOR_PRESETS.some((p) => p.color === colorClass);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">
        {isAr ? "لون الكارت + التدرج" : "Card color + gradient"}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {GAME_COLOR_PRESETS.map((p) => {
          const selected = colorClass === p.color;
          return (
            <button
              type="button"
              key={p.key}
              onClick={() => onChange({ colorClass: p.color, gradientClass: p.gradient })}
              className={cn(
                "h-10 rounded-lg border-2 bg-gradient-to-br shadow-inner transition-all",
                p.swatch,
                selected ? "border-foreground ring-2 ring-offset-2 ring-foreground/30" : "border-transparent hover:scale-105",
              )}
              data-testid={`color-pick-${p.key}`}
              title={p.label}
            />
          );
        })}
      </div>
      <details className="rounded-lg border border-border bg-muted/30 p-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {isAr ? "قيم Tailwind متقدّمة (يدوي)" : "Advanced Tailwind classes (manual)"}
          {isCustom && (
            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
              custom
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">colorClass</label>
            <Input
              value={colorClass}
              onChange={(e) => onChange({ colorClass: e.target.value, gradientClass })}
              className="h-8 font-mono text-xs"
              placeholder="bg-amber-500/20 text-amber-500 border-amber-500/30"
              data-testid="input-color-class"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">gradientClass</label>
            <Input
              value={gradientClass}
              onChange={(e) => onChange({ colorClass, gradientClass: e.target.value })}
              className="h-8 font-mono text-xs"
              placeholder="from-amber-500/20 to-amber-600/10"
              data-testid="input-gradient-class"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
