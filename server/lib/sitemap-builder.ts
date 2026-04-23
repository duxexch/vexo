import { db } from "../db";
import { multiplayerGames, users, liveGameSessions } from "@shared/schema";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger";

export const SEO_GAME_KEYS = ["chess", "backgammon", "domino", "tarneeb", "baloot", "languageduel"] as const;
export type SeoGameKey = typeof SEO_GAME_KEYS[number];

export const SEO_CATEGORIES: Record<string, { slugs: string[]; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string }> = {
  board: {
    slugs: ["chess", "backgammon", "domino"],
    titleAr: "ألعاب الطاولة - شطرنج، طاولة زهر، دومينو",
    titleEn: "Board Games - Chess, Backgammon, Dominoes",
    descriptionAr: "العب أفضل ألعاب الطاولة أونلاين: الشطرنج، الطاولة، الدومينو ضد لاعبين حقيقيين.",
    descriptionEn: "Play the best board games online: Chess, Backgammon, Dominoes against real players.",
  },
  card: {
    slugs: ["tarneeb", "baloot"],
    titleAr: "ألعاب الورق - طرنيب وبلوت",
    titleEn: "Card Games - Tarneeb & Baloot",
    descriptionAr: "العب الطرنيب والبلوت أونلاين مع شركاء وفرق حقيقية.",
    descriptionEn: "Play Tarneeb and Baloot online with real teammates and opponents.",
  },
  language: {
    slugs: ["languageduel"],
    titleAr: "ألعاب اللغة - تحدي اللغات",
    titleEn: "Language Games - Language Duel",
    descriptionAr: "تحدى أصدقاءك في تعلم اللغات والمفردات.",
    descriptionEn: "Challenge friends in vocabulary and language duels.",
  },
};

export const SEO_GAME_LABELS: Record<string, { ar: string; en: string; description: { ar: string; en: string } }> = {
  chess: { ar: "الشطرنج", en: "Chess", description: { ar: "العب الشطرنج أونلاين ضد لاعبين حقيقيين بمستويات مختلفة.", en: "Play chess online against real players at all skill levels." } },
  backgammon: { ar: "الطاولة (زهر)", en: "Backgammon", description: { ar: "العب الطاولة (زهر) أونلاين بأسلوب عربي أصيل.", en: "Play Backgammon online with authentic gameplay." } },
  domino: { ar: "الدومينو", en: "Dominoes", description: { ar: "العب الدومينو أونلاين مع أصدقائك ولاعبين من حول العالم.", en: "Play Dominoes online with friends and players worldwide." } },
  tarneeb: { ar: "الطرنيب", en: "Tarneeb", description: { ar: "العب الطرنيب أونلاين مع شركاء حقيقيين.", en: "Play Tarneeb online with real teammates." } },
  baloot: { ar: "البلوت", en: "Baloot", description: { ar: "العب البلوت أونلاين بأسلوب احترافي.", en: "Play Baloot online with professional gameplay." } },
  languageduel: { ar: "تحدي اللغات", en: "Language Duel", description: { ar: "تحدى أصدقاءك في تعلم اللغات.", en: "Challenge friends in language learning duels." } },
};

type CachedXml = { xml: string; expiresAt: number };
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const cache = new Map<string, CachedXml>();

export function invalidateSitemapCache(): void {
  cache.clear();
  logger.info("[SEO] Sitemap cache invalidated");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

function wrapUrlset(entries: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join("\n"),
    "</urlset>",
  ].join("\n");
}

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.xml;
}

function setCached(key: string, xml: string): void {
  cache.set(key, { xml, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function buildGamesSitemap(baseUrl: string): Promise<string> {
  const key = `games:${baseUrl}`;
  const cached = getCached(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const entries: string[] = [];
  try {
    const rows = await db.select({ key: multiplayerGames.key, updatedAt: multiplayerGames.updatedAt })
      .from(multiplayerGames)
      .where(eq(multiplayerGames.isActive, true));
    for (const row of rows) {
      const lastmod = row.updatedAt ? row.updatedAt.toISOString() : now;
      entries.push(urlEntry(`${baseUrl}/game/${row.key}`, lastmod, "weekly", "0.85"));
    }
  } catch (e) {
    logger.warn(`[SEO] buildGamesSitemap fallback: ${e instanceof Error ? e.message : String(e)}`);
    for (const k of SEO_GAME_KEYS) {
      entries.push(urlEntry(`${baseUrl}/game/${k}`, now, "weekly", "0.85"));
    }
  }

  const xml = wrapUrlset(entries);
  setCached(key, xml);
  return xml;
}

export async function buildCategoriesSitemap(baseUrl: string): Promise<string> {
  const key = `categories:${baseUrl}`;
  const cached = getCached(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const entries = Object.keys(SEO_CATEGORIES).map((cat) =>
    urlEntry(`${baseUrl}/games/${cat}`, now, "weekly", "0.8"),
  );
  const xml = wrapUrlset(entries);
  setCached(key, xml);
  return xml;
}

export async function buildPlayersSitemap(baseUrl: string): Promise<string> {
  const key = `players:${baseUrl}`;
  const cached = getCached(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const entries: string[] = [];
  try {
    // Top 5000 most-active public players (with at least one game played, active accounts)
    const rows = await db.select({ username: users.username, updatedAt: users.updatedAt })
      .from(users)
      .where(and(
        eq(users.status, "active"),
        sql`${users.gamesPlayed} > 0`,
        isNotNull(users.username),
      ))
      .orderBy(desc(users.gamesPlayed))
      .limit(5000);
    for (const row of rows) {
      if (!row.username) continue;
      const lastmod = row.updatedAt ? row.updatedAt.toISOString() : now;
      entries.push(urlEntry(`${baseUrl}/player/${encodeURIComponent(row.username)}`, lastmod, "weekly", "0.5"));
    }
  } catch (e) {
    logger.warn(`[SEO] buildPlayersSitemap failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const xml = wrapUrlset(entries);
  setCached(key, xml);
  return xml;
}

export async function buildMatchesSitemap(baseUrl: string): Promise<string> {
  const key = `matches:${baseUrl}`;
  const cached = getCached(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const entries: string[] = [];
  try {
    // Recent completed sessions (last 5000)
    const rows = await db.select({ id: liveGameSessions.id, endedAt: liveGameSessions.endedAt, updatedAt: liveGameSessions.updatedAt })
      .from(liveGameSessions)
      .where(eq(liveGameSessions.status, "completed"))
      .orderBy(desc(liveGameSessions.endedAt))
      .limit(5000);
    for (const row of rows) {
      const ts = row.endedAt || row.updatedAt;
      const lastmod = ts ? ts.toISOString() : now;
      entries.push(urlEntry(`${baseUrl}/match/${row.id}`, lastmod, "monthly", "0.4"));
    }
  } catch (e) {
    logger.warn(`[SEO] buildMatchesSitemap failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const xml = wrapUrlset(entries);
  setCached(key, xml);
  return xml;
}

export async function buildLeaderboardsSitemap(baseUrl: string): Promise<string> {
  const key = `leaderboards:${baseUrl}`;
  const cached = getCached(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const entries = SEO_GAME_KEYS.map((k) =>
    urlEntry(`${baseUrl}/leaderboard/${k}`, now, "daily", "0.7"),
  );
  const xml = wrapUrlset(entries);
  setCached(key, xml);
  return xml;
}

export function buildSitemapIndex(baseUrl: string): string {
  const now = new Date().toISOString();
  const sitemaps = [
    "sitemap-core.xml",
    "sitemap-guides.xml",
    "sitemap-games.xml",
    "sitemap-categories.xml",
    "sitemap-players.xml",
    "sitemap-matches.xml",
    "sitemap-leaderboards.xml",
  ];
  const items = sitemaps.map((name) => [
    "  <sitemap>",
    `    <loc>${baseUrl}/${name}</loc>`,
    `    <lastmod>${now}</lastmod>`,
    "  </sitemap>",
  ].join("\n")).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</sitemapindex>",
  ].join("\n");
}

// ==================== Per-route SEO meta lookups (for SSR shell) ====================

type DynamicSeo = {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  jsonLd?: Record<string, unknown>;
};

type SeoCachedRecord = { value: DynamicSeo | null; expiresAt: number };
const META_CACHE_TTL_MS = 5 * 60 * 1000;
const metaCache = new Map<string, SeoCachedRecord>();

function metaGet(key: string): DynamicSeo | null | undefined {
  const e = metaCache.get(key);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    metaCache.delete(key);
    return undefined;
  }
  return e.value;
}

function metaSet(key: string, value: DynamicSeo | null): void {
  metaCache.set(key, { value, expiresAt: Date.now() + META_CACHE_TTL_MS });
}

export function clearDynamicSeoCache(): void {
  metaCache.clear();
}

function arabicLocale(locale: string): boolean {
  return locale.toLowerCase().split("-")[0] === "ar";
}

export async function resolveDynamicRouteSeo(
  pagePath: string,
  baseUrl: string,
  locale: string,
): Promise<DynamicSeo | null> {
  const ar = arabicLocale(locale);
  const cleanPath = pagePath.replace(/\/+$/, "") || "/";

  // /game/:slug
  const gameMatch = cleanPath.match(/^\/game\/([a-z0-9_-]+)$/i);
  if (gameMatch) {
    const slug = gameMatch[1].toLowerCase();
    const cacheKey = `game:${slug}:${ar ? "ar" : "en"}`;
    const cached = metaGet(cacheKey);
    if (cached !== undefined) return cached;

    let nameAr = SEO_GAME_LABELS[slug]?.ar;
    let nameEn = SEO_GAME_LABELS[slug]?.en;
    let descAr = SEO_GAME_LABELS[slug]?.description.ar;
    let descEn = SEO_GAME_LABELS[slug]?.description.en;

    try {
      const [row] = await db.select().from(multiplayerGames).where(eq(multiplayerGames.key, slug));
      if (row) {
        nameAr = row.nameAr || nameAr;
        nameEn = row.nameEn || nameEn;
        descAr = row.descriptionAr || descAr || nameAr;
        descEn = row.descriptionEn || descEn || nameEn;
      } else if (!nameAr) {
        metaSet(cacheKey, null);
        return null;
      }
    } catch {
      if (!nameAr) {
        metaSet(cacheKey, null);
        return null;
      }
    }

    const title = ar
      ? `${nameAr} أونلاين - العب الآن مجاناً | VEX`
      : `${nameEn} Online - Play Now Free | VEX`;
    const description = ar
      ? `${descAr || nameAr} على منصة VEX. سجّل واربح جوائز حقيقية.`
      : `${descEn || nameEn} on VEX platform. Sign up and win real prizes.`;
    const keywords = ar
      ? `${nameAr}, ${nameAr} اونلاين, العب ${nameAr}, ${nameEn} online, ${slug}, VEX`
      : `${nameEn}, play ${nameEn} online, ${slug}, ${nameAr}, VEX gaming`;

    const result: DynamicSeo = {
      title,
      description,
      keywords,
      canonicalUrl: `${baseUrl}/game/${slug}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "VideoGame",
        "name": ar ? nameAr : nameEn,
        "alternateName": ar ? nameEn : nameAr,
        "description": description,
        "url": `${baseUrl}/game/${slug}`,
        "gamePlatform": ["Web", "Android"],
        "applicationCategory": "Game",
        "publisher": { "@type": "Organization", "name": "VEX" },
      },
    };
    metaSet(cacheKey, result);
    return result;
  }

  // /games/:category
  const categoryMatch = cleanPath.match(/^\/games\/([a-z0-9_-]+)$/i);
  if (categoryMatch) {
    const cat = categoryMatch[1].toLowerCase();
    const meta = SEO_CATEGORIES[cat];
    if (!meta) return null;
    return {
      title: ar ? `${meta.titleAr} | VEX` : `${meta.titleEn} | VEX`,
      description: ar ? meta.descriptionAr : meta.descriptionEn,
      keywords: ar
        ? `${meta.titleAr}, العاب ${cat}, العاب اونلاين, VEX`
        : `${meta.titleEn}, ${cat} games, online games, VEX`,
      canonicalUrl: `${baseUrl}/games/${cat}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": ar ? meta.titleAr : meta.titleEn,
        "description": ar ? meta.descriptionAr : meta.descriptionEn,
        "url": `${baseUrl}/games/${cat}`,
      },
    };
  }

  // /player/:username
  const playerMatch = cleanPath.match(/^\/player\/([A-Za-z0-9_.-]+)$/);
  if (playerMatch) {
    const username = playerMatch[1];
    const cacheKey = `player:${username.toLowerCase()}:${ar ? "ar" : "en"}`;
    const cached = metaGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const [row] = await db.select({
        username: users.username,
        nickname: users.nickname,
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
      }).from(users).where(eq(users.username, username));
      if (!row) {
        metaSet(cacheKey, null);
        return null;
      }
      const display = row.nickname || row.username;
      const title = ar
        ? `${display} - ملف اللاعب على VEX`
        : `${display} - Player Profile on VEX`;
      const description = ar
        ? `شاهد ملف اللاعب ${display}: ${row.gamesPlayed} مباراة، ${row.gamesWon} فوز على منصة VEX.`
        : `View player ${display}'s profile: ${row.gamesPlayed} matches, ${row.gamesWon} wins on VEX.`;
      const result: DynamicSeo = {
        title,
        description,
        keywords: ar
          ? `${display}, لاعب VEX, ملف لاعب, شطرنج, طاولة`
          : `${display}, VEX player, player profile, chess, backgammon`,
        canonicalUrl: `${baseUrl}/player/${encodeURIComponent(username)}`,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "mainEntity": {
            "@type": "Person",
            "name": display,
            "alternateName": row.username,
          },
          "url": `${baseUrl}/player/${encodeURIComponent(username)}`,
        },
      };
      metaSet(cacheKey, result);
      return result;
    } catch {
      metaSet(cacheKey, null);
      return null;
    }
  }

  // /match/:id
  const matchMatch = cleanPath.match(/^\/match\/([a-f0-9-]{8,})$/i);
  if (matchMatch) {
    const matchId = matchMatch[1];
    const cacheKey = `match:${matchId}:${ar ? "ar" : "en"}`;
    const cached = metaGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const [row] = await db.select({
        id: liveGameSessions.id,
        gameType: liveGameSessions.gameType,
        endedAt: liveGameSessions.endedAt,
        status: liveGameSessions.status,
      }).from(liveGameSessions).where(eq(liveGameSessions.id, matchId));
      if (!row) {
        metaSet(cacheKey, null);
        return null;
      }
      const gameLabel = SEO_GAME_LABELS[row.gameType.toLowerCase()] || { ar: row.gameType, en: row.gameType };
      const dateStr = row.endedAt ? row.endedAt.toISOString().split("T")[0] : "";
      const title = ar
        ? `مباراة ${gameLabel.ar}${dateStr ? " - " + dateStr : ""} | VEX`
        : `${gameLabel.en} Match${dateStr ? " - " + dateStr : ""} | VEX`;
      const description = ar
        ? `تفاصيل مباراة ${gameLabel.ar} على منصة VEX.`
        : `${gameLabel.en} match details on VEX platform.`;
      const result: DynamicSeo = {
        title,
        description,
        keywords: ar
          ? `${gameLabel.ar}, مباراة, VEX, ${row.gameType}`
          : `${gameLabel.en}, match, VEX, ${row.gameType}`,
        canonicalUrl: `${baseUrl}/match/${matchId}`,
      };
      metaSet(cacheKey, result);
      return result;
    } catch {
      metaSet(cacheKey, null);
      return null;
    }
  }

  // /leaderboard/:game
  const lbMatch = cleanPath.match(/^\/leaderboard\/([a-z0-9_-]+)$/i);
  if (lbMatch) {
    const game = lbMatch[1].toLowerCase();
    const label = SEO_GAME_LABELS[game];
    if (!label) return null;
    return {
      title: ar
        ? `لوحة متصدري ${label.ar} | VEX Leaderboard`
        : `${label.en} Leaderboard - Top Players | VEX`,
      description: ar
        ? `شاهد قائمة أفضل اللاعبين في لعبة ${label.ar} على منصة VEX. تنافس للوصول إلى القمة.`
        : `View the top ${label.en} players on VEX platform. Compete for the top spot.`,
      keywords: ar
        ? `متصدرين ${label.ar}, ترتيب ${label.ar}, ${label.en} leaderboard, VEX`
        : `${label.en} leaderboard, top ${label.en} players, ranking, VEX`,
      canonicalUrl: `${baseUrl}/leaderboard/${game}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": ar ? `متصدرو ${label.ar}` : `${label.en} Leaderboard`,
        "url": `${baseUrl}/leaderboard/${game}`,
      },
    };
  }

  return null;
}

export function isSeoLandingPath(pagePath: string): boolean {
  const p = pagePath.replace(/\/+$/, "") || "/";
  return /^\/game\/[a-z0-9_-]+$/i.test(p)
    || /^\/games\/[a-z0-9_-]+$/i.test(p)
    || /^\/player\/[A-Za-z0-9_.-]+$/.test(p)
    || /^\/match\/[a-f0-9-]{8,}$/i.test(p)
    || /^\/leaderboard\/[a-z0-9_-]+$/i.test(p);
}

// Helper: leaderboard top players (used by public API)
export async function getPublicLeaderboard(game: SeoGameKey, limit = 50): Promise<Array<{ username: string; nickname: string | null; profilePicture: string | null; wins: number; played: number }>> {
  const winsCol = `${game}_won`;
  const playedCol = `${game}_played`;
  const rows = await db.execute(sql`
    SELECT username, nickname, profile_picture, ${sql.raw(winsCol)} AS wins, ${sql.raw(playedCol)} AS played
    FROM users
    WHERE status = 'active' AND ${sql.raw(winsCol)} > 0
    ORDER BY ${sql.raw(winsCol)} DESC
    LIMIT ${limit}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    username: String(r.username),
    nickname: r.nickname ? String(r.nickname) : null,
    profilePicture: r.profile_picture ? String(r.profile_picture) : null,
    wins: Number(r.wins) || 0,
    played: Number(r.played) || 0,
  }));
}
