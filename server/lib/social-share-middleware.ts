import type { NextFunction, Request, Response } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../db";
import {
  challenges as challengesTable,
  multiplayerGames,
  tournaments,
  users,
} from "@shared/schema";
import { logger } from "./logger";

const SOCIAL_BOT_SIGNATURES = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "xbot",
  "linkedinbot",
  "linkedin",
  "slackbot",
  "slack-imgproxy",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "embedly",
  "pinterest",
  "skypeuripreview",
  "redditbot",
  "vkshare",
  "applebot",
  "quora link preview",
  "outbrain",
  "nuzzel",
  "bitlybot",
  "google-inspectiontool",
  "googlebot",
  "bingbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "viber",
  "iframely",
];

const SITE_NAME = "VEX";
const SITE_TITLE = "VEX | ألعاب أونلاين وتداول P2P آمن";
const SITE_DESCRIPTION =
  "منصة VEX للألعاب الأونلاين وتداول P2P الآمن: شطرنج، طاولة، دومينو، طرنيب وبلوت مع لاعبين حقيقيين، محفظة رقمية، بطولات، ومكافآت يومية.";
const FALLBACK_IMAGE = "/icons/vex-gaming-logo-512x512.png";
const FALLBACK_IMAGE_WIDTH = 512;
const FALLBACK_IMAGE_HEIGHT = 512;
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";

  let escaped = "";
  for (const char of String(value)) {
    const code = char.charCodeAt(0);
    if (code === 38) {
      escaped += String.fromCharCode(38, 97, 109, 112, 59);
    } else if (code === 60) {
      escaped += String.fromCharCode(38, 108, 116, 59);
    } else if (code === 62) {
      escaped += String.fromCharCode(38, 103, 116, 59);
    } else if (code === 34) {
      escaped += String.fromCharCode(38, 113, 117, 111, 116, 59);
    } else if (code === 39) {
      escaped += String.fromCharCode(38, 35, 51, 57, 59);
    } else {
      escaped += char;
    }
  }

  return escaped;
}

function clampText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function trimDescription(value: string): string {
  return clampText(value, 160);
}

function isSocialBot(req: Request): boolean {
  const ua =
    typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"].toLowerCase()
      : "";
  return ua.length > 0 && SOCIAL_BOT_SIGNATURES.some((sig) => ua.includes(sig));
}

function resolveOrigin(req: Request): string {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim().length > 0
      ? forwardedProto.split(",")[0].trim()
      : req.protocol;
  const host = req.get("host") || "vixo.click";
  return `${protocol.toLowerCase()}://${host}`;
}

const ALLOWED_EXTERNAL_HOSTS = new Set<string>([
  "vixo.click",
  "www.vixo.click",
  "cdn.vixo.click",
  "objectstorage.replit.com",
  "storage.googleapis.com",
  "res.cloudinary.com",
  "i.imgur.com",
]);

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) return false;
    if (host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".replit.co")) return true;
    return ALLOWED_EXTERNAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

function absoluteUrl(origin: string, value: string | null | undefined): string {
  if (!value) return `${origin}${FALLBACK_IMAGE}`;
  if (/^https?:\/\//i.test(value)) {
    return isSafeExternalUrl(value) ? value : `${origin}${FALLBACK_IMAGE}`;
  }
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/+$/, "");
  return trimmed || "/";
}

function currentUrl(origin: string, req: Request): string {
  return `${origin}${req.originalUrl}`;
}

interface ShareCard {
  title: string;
  description: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  type: "website" | "video.other" | "article";
  videoUrl?: string | null;
  canonicalUrl: string;
}

function buildHtml(card: ShareCard): string {
  const safeTitle = escapeHtml(card.title);
  const safeDescription = escapeHtml(card.description);
  const safeImage = escapeHtml(card.imageUrl);
  const safeVideo = card.videoUrl ? escapeHtml(card.videoUrl) : "";
  const safeUrl = escapeHtml(card.canonicalUrl);

  const videoTags = safeVideo
    ? `
  <meta property="og:video" content="${safeVideo}" />
  <meta property="og:video:secure_url" content="${safeVideo}" />
  <meta property="og:video:type" content="video/mp4" />
  <meta property="og:video:width" content="1280" />
  <meta property="og:video:height" content="720" />
  <meta name="twitter:player" content="${safeVideo}" />
  <meta name="twitter:player:width" content="1280" />
  <meta name="twitter:player:height" content="720" />`
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <link rel="canonical" href="${safeUrl}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:type" content="${escapeHtml(card.type)}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:secure_url" content="${safeImage}" />
  <meta property="og:image:width" content="${card.imageWidth}" />
  <meta property="og:image:height" content="${card.imageHeight}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:locale" content="ar_SA" />
  <meta property="og:locale:alternate" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <meta name="twitter:image:alt" content="${safeTitle}" />${videoTags}
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDescription}</p>
  <p><a href="${safeUrl}">${safeUrl}</a></p>
</body>
</html>`;
}

function buildFallbackCard(origin: string, canonicalUrl: string): ShareCard {
  return {
    title: SITE_TITLE,
    description: trimDescription(SITE_DESCRIPTION),
    imageUrl: absoluteUrl(origin, FALLBACK_IMAGE),
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl,
  };
}

async function buildTournamentCard(origin: string, idOrSlug: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      id: tournaments.id,
      shareSlug: tournaments.shareSlug,
      name: tournaments.name,
      nameAr: tournaments.nameAr,
      description: tournaments.description,
      descriptionAr: tournaments.descriptionAr,
      coverImageUrl: tournaments.coverImageUrl,
      promoVideoUrl: tournaments.promoVideoUrl,
      prizePool: tournaments.prizePool,
      currency: tournaments.currency,
    })
    .from(tournaments)
    .where(or(eq(tournaments.id, idOrSlug), eq(tournaments.shareSlug, idOrSlug)))
    .limit(1);

  if (!row) return null;

  const titleBase = row.nameAr || row.name || "بطولة VEX";
  const descriptionBase =
    row.descriptionAr ||
    row.description ||
    `انضم إلى بطولة ${titleBase} على منصة VEX${row.prizePool ? ` — جائزة ${row.prizePool} ${row.currency || ""}` : ""}.`;

  return {
    title: `${titleBase} — VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, row.coverImageUrl),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    videoUrl: row.promoVideoUrl || null,
    type: row.promoVideoUrl ? "video.other" : "article",
    canonicalUrl,
  };
}

async function buildGameCardBySlug(origin: string, slug: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      key: multiplayerGames.key,
      nameEn: multiplayerGames.nameEn,
      nameAr: multiplayerGames.nameAr,
      descriptionEn: multiplayerGames.descriptionEn,
      descriptionAr: multiplayerGames.descriptionAr,
      thumbnailUrl: multiplayerGames.thumbnailUrl,
    })
    .from(multiplayerGames)
    .where(eq(multiplayerGames.key, slug))
    .limit(1);

  if (!row) return null;

  const titleBase = row.nameAr || row.nameEn || slug;
  const descriptionBase =
    row.descriptionAr ||
    row.descriptionEn ||
    `العب ${titleBase} مع لاعبين حقيقيين على منصة VEX، تحديات مباشرة وبطولات بمكافآت يومية.`;

  return {
    title: `${titleBase} — العب أونلاين على VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, row.thumbnailUrl),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl,
  };
}

async function buildPlayerCard(origin: string, username: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      username: users.username,
      nickname: users.nickname,
      profilePicture: users.profilePicture,
      gamesPlayed: users.gamesPlayed,
      gamesWon: users.gamesWon,
      chessWon: users.chessWon,
      backgammonWon: users.backgammonWon,
      dominoWon: users.dominoWon,
      tarneebWon: users.tarneebWon,
      balootWon: users.balootWon,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!row) return null;

  const display = row.nickname || row.username;
  const bestGameWins = Math.max(
    row.chessWon || 0,
    row.backgammonWon || 0,
    row.dominoWon || 0,
    row.tarneebWon || 0,
    row.balootWon || 0,
  );

  const descriptionBase = `ملف اللاعب ${display} — ${row.gamesPlayed || 0} مباراة، ${row.gamesWon || 0} فوز${bestGameWins > 0 ? `، وأفضلية في ألعاب متعددة` : ""}.`;

  return {
    title: `${display} — لاعب VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, row.profilePicture),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "article",
    canonicalUrl,
  };
}

async function buildMatchCard(origin: string, id: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      id: challengesTable.id,
      gameType: challengesTable.gameType,
      status: challengesTable.status,
      winnerId: challengesTable.winnerId,
      betAmount: challengesTable.betAmount,
      currencyType: challengesTable.currencyType,
    })
    .from(challengesTable)
    .where(eq(challengesTable.id, id))
    .limit(1);

  if (!row || row.status !== "completed") return null;

  let label = row.gameType || "Match";
  let thumbnailUrl: string | null = null;

  if (row.gameType) {
    const [game] = await db
      .select({
        nameAr: multiplayerGames.nameAr,
        nameEn: multiplayerGames.nameEn,
        thumbnailUrl: multiplayerGames.thumbnailUrl,
      })
      .from(multiplayerGames)
      .where(eq(multiplayerGames.key, row.gameType))
      .limit(1);

    if (game) {
      label = game.nameAr || game.nameEn || row.gameType;
      thumbnailUrl = game.thumbnailUrl || null;
    }
  }

  const winnerText = row.winnerId ? " — الفائز محدد" : "";
  const stake = row.betAmount ? ` بقيمة ${row.betAmount} ${row.currencyType === "project" ? "VEX" : "USD"}` : "";
  const descriptionBase = `ملخص مباراة ${label}${stake}${winnerText}. شاهد النتيجة واللاعبين المشاركين على VEX.`;

  return {
    title: `${label} — ملخص مباراة VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, thumbnailUrl),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "article",
    canonicalUrl,
  };
}

async function buildChallengeCard(origin: string, challengeId: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      id: challengesTable.id,
      gameType: challengesTable.gameType,
      status: challengesTable.status,
      betAmount: challengesTable.betAmount,
      currencyType: challengesTable.currencyType,
    })
    .from(challengesTable)
    .where(eq(challengesTable.id, challengeId))
    .limit(1);

  if (!row) return null;

  let label = row.gameType || "Challenge";
  let thumbnailUrl: string | null = null;

  if (row.gameType) {
    const [game] = await db
      .select({
        nameAr: multiplayerGames.nameAr,
        nameEn: multiplayerGames.nameEn,
        thumbnailUrl: multiplayerGames.thumbnailUrl,
      })
      .from(multiplayerGames)
      .where(eq(multiplayerGames.key, row.gameType))
      .limit(1);

    if (game) {
      label = game.nameAr || game.nameEn || row.gameType;
      thumbnailUrl = game.thumbnailUrl || null;
    }
  }

  const stake = row.betAmount ? ` بقيمة ${row.betAmount} ${row.currencyType === "project" ? "VEX" : "USD"}` : "";
  const statusText = row.status === "waiting" ? " قيد الانتظار" : "";
  const descriptionBase = `تحدي ${label}${stake}${statusText}. تابع التفاصيل والمباراة مباشرة على VEX.`;

  return {
    title: `تحدي ${label} — VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, thumbnailUrl),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "article",
    canonicalUrl,
  };
}

async function buildLeaderboardCard(origin: string, game: string, canonicalUrl: string): Promise<ShareCard | null> {
  const [row] = await db
    .select({
      key: multiplayerGames.key,
      nameEn: multiplayerGames.nameEn,
      nameAr: multiplayerGames.nameAr,
      descriptionEn: multiplayerGames.descriptionEn,
      descriptionAr: multiplayerGames.descriptionAr,
      thumbnailUrl: multiplayerGames.thumbnailUrl,
    })
    .from(multiplayerGames)
    .where(eq(multiplayerGames.key, game))
    .limit(1);

  if (!row) return null;

  const titleBase = row.nameAr || row.nameEn || game;
  const descriptionBase =
    row.descriptionAr ||
    row.descriptionEn ||
    `لوحة متصدري ${titleBase} على منصة VEX — تنافس للوصول إلى القمة.`;

  return {
    title: `متصدرو ${titleBase} — VEX`,
    description: trimDescription(descriptionBase),
    imageUrl: absoluteUrl(origin, row.thumbnailUrl),
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl,
  };
}

const TOURNAMENT_PATH = /^\/tournaments\/([A-Za-z0-9_-]+)\/?$/;
const CHALLENGE_PATH = /^\/challenge\/([A-Za-z0-9_-]+)\/(?:watch|play)\/?$/;
const GAME_PATH = /^\/game\/([A-Za-z0-9_-]+)\/?$/;
const PLAYER_PATH = /^\/player\/([A-Za-z0-9_.-]+)\/?$/;
const MATCH_PATH = /^\/match\/([A-Fa-f0-9-]{8,})\/?$/;
const LEADERBOARD_PATH = /^\/leaderboard\/([A-Za-z0-9_-]+)\/?$/;

const HOME_CARDS: Record<string, ShareCard> = {
  "/": {
    title: SITE_TITLE,
    description: trimDescription(SITE_DESCRIPTION),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
  "/p2p/share": {
    title: "مشاركة صفقة P2P على VEX",
    description: trimDescription("شارك الصفقة بسرعة عبر واتساب، فيسبوك، تيليجرام، X، ولينكدإن مع صورة وشرح مختصر وواضح."),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
  "/tournaments": {
    title: "بطولات VEX — انضم وفز بالجوائز",
    description: trimDescription("تصفّح بطولات VEX النشطة والقادمة، سجّل، وشاهد مباريات اللاعبين مباشرة."),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
  "/challenges": {
    title: "تحديات VEX — العب وتراهن مع أصدقائك",
    description: trimDescription("اكتشف تحديات VEX المتاحة الآن، أنشئ تحديك الخاص، أو شاهد مباريات بين لاعبين حقيقيين."),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
  "/games": {
    title: "ألعاب VEX أونلاين — العب الآن",
    description: trimDescription("استعرض ألعاب VEX المتاحة واكتشف تجارب أونلاين سريعة وممتعة."),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
  "/invest": {
    title: "استثمر في VEX",
    description: trimDescription("فرصة استثمارية حصرية في منصة VEX. راقب النمو، التوزيع، والخطة المستقبلية."),
    imageUrl: FALLBACK_IMAGE,
    imageWidth: FALLBACK_IMAGE_WIDTH,
    imageHeight: FALLBACK_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl: "",
  },
};

function buildP2POfferCard(origin: string, req: Request, canonicalUrl: string): ShareCard | null {
  const offerId = typeof req.query.offerId === "string" ? req.query.offerId.trim() : "";
  if (!offerId) return null;

  const offerType = typeof req.query.offerType === "string" ? req.query.offerType.trim() : "";
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  const currency = typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : "";
  const amount = typeof req.query.amount === "string" ? req.query.amount.trim() : "";
  const price = typeof req.query.price === "string" ? req.query.price.trim() : "";
  const fiatCurrency = typeof req.query.fiatCurrency === "string" ? req.query.fiatCurrency.trim().toUpperCase() : "USD";
  const dealKind = typeof req.query.dealKind === "string" ? req.query.dealKind.trim() : "standard_asset";
  const visibility = typeof req.query.visibility === "string" ? req.query.visibility.trim() : "public";
  const paymentMethods = typeof req.query.paymentMethods === "string" ? req.query.paymentMethods.trim() : "";
  const title = typeof req.query.title === "string" ? clampText(req.query.title, 80) : "";
  const summary = typeof req.query.summary === "string" ? clampText(req.query.summary, 220) : "";

  const tradeVerb = offerType === "sell" ? "بيع" : "شراء";
  const kindLabel = dealKind === "digital_product" ? "صفقة منتج رقمي" : "صفقة P2P";
  const paymentLabel = paymentMethods ? ` • طرق الدفع: ${paymentMethods}` : "";
  const visibilityLabel = visibility === "private_friend" ? " • خاصة" : " • عامة";
  const description = summary || clampText(`${kindLabel}${title ? `: ${title}` : ""}${username ? ` • ${tradeVerb} بواسطة @${username}` : ""}${currency && amount ? ` • ${amount} ${currency}` : ""}${price ? ` • السعر ${price} ${fiatCurrency}` : ""}${paymentLabel}${visibilityLabel}`, 160);

  return {
    title: title || `${kindLabel} — VEX`,
    description: trimDescription(description),
    imageUrl: `${origin}/icons/vex-gaming-logo-512x512.png`,
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    type: "website",
    canonicalUrl,
  };
}

export function createSocialShareMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== "GET") return next();
    if (!isSocialBot(req)) return next();

    const path = normalizePath(req.path);

    if (
      path.startsWith("/api/") ||
      path.startsWith("/ws") ||
      path.startsWith("/socket") ||
      path.startsWith("/uploads/") ||
      path.startsWith("/storage/") ||
      /\.[a-z0-9]{2,5}$/i.test(path)
    ) {
      return next();
    }

    const origin = resolveOrigin(req);
    const canonical = currentUrl(origin, req);

    try {
      let card: ShareCard | null = null;

      const homeCard = HOME_CARDS[path];
      if (homeCard) {
        card = { ...homeCard, canonicalUrl: canonical };
      } else {
        const tMatch = path.match(TOURNAMENT_PATH);
        if (tMatch) {
          card = await buildTournamentCard(origin, tMatch[1], canonical);
        } else {
          const cMatch = path.match(CHALLENGE_PATH);
          if (cMatch) {
            card = await buildChallengeCard(origin, cMatch[1], canonical);
          } else {
            const gMatch = path.match(GAME_PATH);
            if (gMatch) {
              card = await buildGameCardBySlug(origin, gMatch[1], canonical);
            } else {
              const pMatch = path.match(PLAYER_PATH);
              if (pMatch) {
                card = await buildPlayerCard(origin, pMatch[1], canonical);
              } else {
                const mMatch = path.match(MATCH_PATH);
                if (mMatch) {
                  card = await buildMatchCard(origin, mMatch[1], canonical);
                } else {
                  const lbMatch = path.match(LEADERBOARD_PATH);
                  if (lbMatch) {
                    card = await buildLeaderboardCard(origin, lbMatch[1], canonical);
                  }
                }
              }
            }
          }
        }
      }

      if (!card) {
        card = buildFallbackCard(origin, canonical);
      }

      const html = buildHtml(card);
      res.status(200);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      res.send(html);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[SocialShare] Failed to build OG meta for ${path}: ${message}`);
      next();
    }
  };
}
