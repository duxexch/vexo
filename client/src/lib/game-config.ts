import {
  Crown,
  Target,
  Shuffle,
  Gem,
  Gamepad2,
  Dice5,
  Spade,
  Heart,
} from "lucide-react";

/** Shape returned by GET /api/multiplayer-games */
export interface MultiplayerGameFromAPI {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  minStake: string;
  maxStake: string;
  houseFee: string;
  isActive: boolean;
  iconName?: string;
  iconUrl?: string;
  updatedAt?: string;
}

/** Unified game config item used across lobby, leaderboard, challenges, game-history */
export interface GameConfigItem {
  name: string;
  nameAr: string;
  icon: typeof Crown;
  color: string;
  gradient: string;
  minStake?: number;
  maxStake?: number;
  houseFee?: number;
  iconUrl?: string;
}

function isImagePath(value?: string | null): value is string {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return normalized.startsWith("/") || /^https?:\/\//i.test(normalized);
}

function withVersionSuffix(url: string, versionSeed?: string): string {
  if (!versionSeed) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(versionSeed)}`;
}

function resolveGameIconUrl(game: MultiplayerGameFromAPI): string | undefined {
  const iconUrl = typeof game.iconUrl === "string" ? game.iconUrl.trim() : "";
  const iconName = typeof game.iconName === "string" ? game.iconName.trim() : "";

  const imagePath = isImagePath(iconUrl)
    ? iconUrl
    : isImagePath(iconName)
      ? iconName
      : "";

  if (!imagePath) {
    return undefined;
  }

  const versionSeed = game.updatedAt ? String(new Date(game.updatedAt).getTime()) : game.id;
  return withVersionSuffix(imagePath, versionSeed);
}

/** Icon + style mapping per game key */
export const GAME_ICON_STYLES: Record<string, { icon: typeof Crown; color: string; gradient: string }> = {
  chess: { icon: Crown, color: "bg-amber-500/20 text-amber-500 border-amber-500/30", gradient: "from-amber-500/20 to-amber-600/10" },
  domino: { icon: Target, color: "bg-blue-500/20 text-blue-500 border-blue-500/30", gradient: "from-blue-500/20 to-blue-600/10" },
  backgammon: { icon: Shuffle, color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30", gradient: "from-emerald-500/20 to-emerald-600/10" },
  tarneeb: { icon: Gem, color: "bg-purple-500/20 text-purple-500 border-purple-500/30", gradient: "from-purple-500/20 to-purple-600/10" },
  baloot: { icon: Gem, color: "bg-rose-500/20 text-rose-500 border-rose-500/30", gradient: "from-rose-500/20 to-rose-600/10" },
  languageduel: { icon: Target, color: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30", gradient: "from-cyan-500/20 to-cyan-600/10" },
  snake: { icon: Gamepad2, color: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30", gradient: "from-indigo-500/20 to-indigo-600/10" },
};

export const DEFAULT_GAME_STYLE = {
  icon: Gamepad2,
  color: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  gradient: "from-gray-500/20 to-gray-600/10",
};

/** Simple icon-only map (used by game-history fallback) */
export const GAME_ICONS_SIMPLE: Record<string, typeof Crown> = {
  chess: Crown,
  domino: Target,
  backgammon: Dice5,
  tarneeb: Spade,
  baloot: Heart,
  languageduel: Target,
  snake: Gamepad2,
};

/** Fallback game configs when API is unavailable */
export const FALLBACK_GAME_CONFIG: Record<string, GameConfigItem> = {
  chess: { name: "Chess", nameAr: "شطرنج", icon: Crown, color: "bg-amber-500/20 text-amber-500 border-amber-500/30", gradient: "from-amber-500/20 to-amber-600/10" },
  domino: { name: "Domino", nameAr: "دومينو", icon: Target, color: "bg-blue-500/20 text-blue-500 border-blue-500/30", gradient: "from-blue-500/20 to-blue-600/10" },
  backgammon: { name: "Backgammon", nameAr: "طاولة", icon: Shuffle, color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30", gradient: "from-emerald-500/20 to-emerald-600/10" },
  tarneeb: { name: "Tarneeb", nameAr: "طرنيب", icon: Gem, color: "bg-purple-500/20 text-purple-500 border-purple-500/30", gradient: "from-purple-500/20 to-purple-600/10" },
  baloot: { name: "Baloot", nameAr: "بلوت", icon: Gem, color: "bg-rose-500/20 text-rose-500 border-rose-500/30", gradient: "from-rose-500/20 to-rose-600/10" },
  languageduel: { name: "LanguageDuel", nameAr: "تحدي اللغات", icon: Target, color: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30", gradient: "from-cyan-500/20 to-cyan-600/10" },
  snake: { name: "Snake Arena", nameAr: "أرينا الثعبان", icon: Gamepad2, color: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30", gradient: "from-indigo-500/20 to-indigo-600/10" },
};

/** Build game config from API data, falling back to hardcoded if empty */
export function buildGameConfig(apiGames: MultiplayerGameFromAPI[] | undefined): Record<string, GameConfigItem> {
  if (!apiGames || apiGames.length === 0) {
    return { ...FALLBACK_GAME_CONFIG };
  }
  const config: Record<string, GameConfigItem> = {};
  for (const game of apiGames) {
    const style = GAME_ICON_STYLES[game.key] || DEFAULT_GAME_STYLE;
    config[game.key] = {
      name: game.nameEn,
      nameAr: game.nameAr,
      icon: style.icon,
      color: style.color,
      gradient: style.gradient,
      minStake: parseFloat(game.minStake),
      maxStake: parseFloat(game.maxStake),
      houseFee: parseFloat(game.houseFee),
      iconUrl: resolveGameIconUrl(game),
    };
  }
  return config;
}

/** Build game config with an "all" entry prepended (for leaderboard filters) */
export function buildGameConfigWithAll(apiGames: MultiplayerGameFromAPI[] | undefined): Record<string, GameConfigItem> {
  const config = buildGameConfig(apiGames);
  return {
    all: { name: "All Games", nameAr: "جميع الألعاب", icon: Gamepad2, color: "text-primary", gradient: "" },
    ...config,
  };
}
