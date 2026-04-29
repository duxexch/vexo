export type ArcadeKind = "solo" | "duo" | "party";

export interface ArcadeGameMeta {
  key: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  color: string;
  kind: ArcadeKind;
  minPlayers: number;
  maxPlayers: number;
  scoringDirection: "higher_better" | "lower_better";
  iconEmoji: string;
}

export const ARCADE_GAMES: readonly ArcadeGameMeta[] = [
  { key: "snake",       slug: "snake",        titleAr: "حلبة الثعبان",     titleEn: "Snake Arena",    color: "#22c55e", kind: "solo",  minPlayers: 1, maxPlayers: 1, scoringDirection: "higher_better", iconEmoji: "🐍" },
  { key: "stack_tower", slug: "stack-tower",  titleAr: "برج المكعبات",    titleEn: "Stack Tower",    color: "#f59e0b", kind: "solo",  minPlayers: 1, maxPlayers: 1, scoringDirection: "higher_better", iconEmoji: "🏗️" },
  { key: "aim_trainer", slug: "aim-trainer",  titleAr: "مدرّب التصويب",   titleEn: "Aim Trainer",    color: "#ef4444", kind: "solo",  minPlayers: 1, maxPlayers: 1, scoringDirection: "higher_better", iconEmoji: "🎯" },
  { key: "pong",        slug: "pong",         titleAr: "مبارزة بونغ",     titleEn: "Pong Duel",      color: "#06b6d4", kind: "duo",   minPlayers: 1, maxPlayers: 2, scoringDirection: "higher_better", iconEmoji: "🏓" },
  { key: "air_hockey",  slug: "air-hockey",   titleAr: "هوكي الهواء",     titleEn: "Air Hockey",     color: "#3b82f6", kind: "duo",   minPlayers: 1, maxPlayers: 2, scoringDirection: "higher_better", iconEmoji: "🏒" },
  { key: "typing_duel", slug: "typing-duel",  titleAr: "مبارزة الكتابة",  titleEn: "Typing Duel",    color: "#a855f7", kind: "duo",   minPlayers: 1, maxPlayers: 2, scoringDirection: "higher_better", iconEmoji: "⌨️" },
  { key: "bomb_pass",   slug: "bomb-pass",    titleAr: "تمرير القنبلة",   titleEn: "Bomb Pass",      color: "#dc2626", kind: "party", minPlayers: 2, maxPlayers: 8, scoringDirection: "higher_better", iconEmoji: "💣" },
  { key: "quiz_rush",   slug: "quiz-rush",    titleAr: "سباق الأسئلة",    titleEn: "Quiz Rush",      color: "#8b5cf6", kind: "party", minPlayers: 2, maxPlayers: 8, scoringDirection: "higher_better", iconEmoji: "❓" },
  { key: "dice_battle", slug: "dice-battle",  titleAr: "معركة النرد",     titleEn: "Dice Battle",    color: "#0ea5e9", kind: "party", minPlayers: 2, maxPlayers: 8, scoringDirection: "higher_better", iconEmoji: "🎲" },
] as const;

const BY_KEY = new Map<string, ArcadeGameMeta>(ARCADE_GAMES.map((g) => [g.key, g]));
const BY_SLUG = new Map<string, ArcadeGameMeta>(ARCADE_GAMES.map((g) => [g.slug, g]));

export function getArcadeGame(keyOrSlug: string): ArcadeGameMeta | undefined {
  if (!keyOrSlug) return undefined;
  return BY_KEY.get(keyOrSlug) ?? BY_SLUG.get(keyOrSlug);
}

export function isArcadeGameKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return BY_KEY.has(key) || BY_SLUG.has(key);
}

export function gameKeyToSlug(key: string): string {
  const meta = getArcadeGame(key);
  return meta ? meta.slug : key.replace(/_/g, "-");
}

export function gameSlugToKey(slug: string): string {
  const meta = getArcadeGame(slug);
  return meta ? meta.key : slug.replace(/-/g, "_");
}

export const ARCADE_GAME_KEYS: readonly string[] = ARCADE_GAMES.map((g) => g.key);
export const ARCADE_GAME_SLUGS: readonly string[] = ARCADE_GAMES.map((g) => g.slug);
