import type { NextFunction, Request, Response } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../db";
import {
  challenges as challengesTable,
  multiplayerGames,
  tournaments,
} from "@shared/schema";
import { logger } from "./logger";

const SOCIAL_BOT_SIGNATURES = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
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

const FALLBACK_IMAGE = "/icons/vex-gaming-logo-512x512.png";

const ESCAPE_HTML_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_HTML_MAP[ch] || ch);
}

function isSocialBot(req: Request): boolean {
  const ua = typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"].toLowerCase()
    : "";
  if (!ua) return false;
  return SOCIAL_BOT_SIGNATURES.some((sig) => ua.includes(sig));
}

function resolveOrigin(req: Request): string {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;
  const protocol = (typeof forwardedProto === "string" && forwardedProto.trim().length > 0
    ? forwardedProto.split(",")[0].trim()
    : req.protocol).toLowerCase();
  const host = req.get("host") || "vixo.click";
  return `${protocol}://${host}`;
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
    // Block private IP ranges and AWS/GCP metadata services
    if (/^(10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) return false;
    if (host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".replit.co")) {
      return true;
    }
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

interface ShareCard {
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string | null;
  type: "website" | "video.other" | "article";
}

function buildHtml(canonicalUrl: string, card: ShareCard): string {
  const safeTitle = escapeHtml(card.title);
  const safeDescription = escapeHtml(card.description);
  const safeImage = escapeHtml(card.imageUrl);
  const safeVideo = card.videoUrl ? escapeHtml(card.videoUrl) : "";
  const safeUrl = escapeHtml(canonicalUrl);

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

  <meta property="og:site_name" content="VEX" />
  <meta property="og:type" content="${escapeHtml(card.type)}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:secure_url" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="ar_AR" />
  <meta property="og:locale:alternate" content="en_US" />${videoTags}

  <meta name="twitter:card" content="${card.videoUrl ? "player" : "summary_large_image"}" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />

  <meta http-equiv="refresh" content="0; url=${safeUrl}" />
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDescription}</p>
  <p><a href="${safeUrl}">${safeUrl}</a></p>
</body>
</html>
`;
}

async function buildTournamentCard(
  origin: string,
  idOrSlug: string,
): Promise<ShareCard | null> {
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
      gameType: tournaments.gameType,
      prizePool: tournaments.prizePool,
      currency: tournaments.currency,
    })
    .from(tournaments)
    .where(or(eq(tournaments.id, idOrSlug), eq(tournaments.shareSlug, idOrSlug)))
    .limit(1);

  if (!row) return null;

  const title = row.nameAr || row.name || "بطولة VEX";
  const desc = row.descriptionAr
    || row.description
    || `انضم إلى بطولة ${title} على منصة VEX${row.prizePool ? ` — جائزة ${row.prizePool} ${row.currency || ""}` : ""}.`;

  return {
    title: `${title} — VEX`,
    description: desc.slice(0, 280),
    imageUrl: absoluteUrl(origin, row.coverImageUrl),
    videoUrl: row.promoVideoUrl || null,
    type: row.promoVideoUrl ? "video.other" : "article",
  };
}

async function buildGameCardBySlug(
  origin: string,
  slug: string,
): Promise<ShareCard | null> {
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

  const title = row.nameAr || row.nameEn || slug;
  return {
    title: `${title} — العب أونلاين على VEX`,
    description: (row.descriptionAr || row.descriptionEn
      || `العب ${title} مع لاعبين حقيقيين على منصة VEX، تحديات مباشرة وبطولات بمكافآت يومية.`).slice(0, 280),
    imageUrl: absoluteUrl(origin, row.thumbnailUrl),
    type: "website",
  };
}

async function buildChallengeCard(
  origin: string,
  challengeId: string,
): Promise<ShareCard | null> {
  const [chal] = await db
    .select({
      id: challengesTable.id,
      gameType: challengesTable.gameType,
      betAmount: challengesTable.betAmount,
      currencyType: challengesTable.currencyType,
      status: challengesTable.status,
    })
    .from(challengesTable)
    .where(eq(challengesTable.id, challengeId))
    .limit(1);

  if (!chal) return null;

  let label = chal.gameType;
  let thumbnailUrl: string | null = null;
  if (chal.gameType) {
    const [game] = await db
      .select({
        nameAr: multiplayerGames.nameAr,
        nameEn: multiplayerGames.nameEn,
        thumbnailUrl: multiplayerGames.thumbnailUrl,
      })
      .from(multiplayerGames)
      .where(eq(multiplayerGames.key, chal.gameType))
      .limit(1);
    if (game) {
      label = game.nameAr || game.nameEn || chal.gameType;
      thumbnailUrl = game.thumbnailUrl || null;
    }
  }

  const stake = chal.betAmount ? ` بقيمة ${chal.betAmount} ${chal.currencyType === "project" ? "VEX" : "USD"}` : "";
  return {
    title: `تحدي ${label} على VEX${stake}`,
    description: `شاهد تحدي ${label} مباشرة على منصة VEX${stake} — انضم وتابع المباراة الآن.`,
    imageUrl: absoluteUrl(origin, thumbnailUrl),
    type: "video.other",
  };
}

const TOURNAMENT_PATH = /^\/tournaments\/([A-Za-z0-9_-]+)\/?$/;
const CHALLENGE_PATH = /^\/challenge\/([A-Za-z0-9_-]+)\/(?:watch|play)\/?$/;
const GAME_PATH = /^\/game\/([A-Za-z0-9_-]+)\/?$/;

const HOMEPAGE_CARD: ShareCard = {
  title: "VEX | ألعاب أونلاين وتداول P2P آمن",
  description:
    "منصة VEX للألعاب الأونلاين وتداول P2P الآمن: شطرنج، طاولة، دومينو، طرنيب وبلوت مع لاعبين حقيقيين، محفظة رقمية، بطولات، ومكافآت يومية.",
  imageUrl: FALLBACK_IMAGE,
  type: "website",
};

const TOURNAMENT_HUB_CARD: ShareCard = {
  title: "بطولات VEX — انضم وفز بالجوائز",
  description:
    "تصفّح بطولات VEX النشطة والقادمة، سجّل، وشاهد مباريات اللاعبين مباشرة.",
  imageUrl: FALLBACK_IMAGE,
  type: "website",
};

const CHALLENGE_HUB_CARD: ShareCard = {
  title: "تحديات VEX — العب وتراهن مع أصدقائك",
  description:
    "اكتشف تحديات VEX المتاحة الآن، أنشئ تحديك الخاص، أو شاهد مباريات بين لاعبين حقيقيين.",
  imageUrl: FALLBACK_IMAGE,
  type: "website",
};

export function createSocialShareMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== "GET") return next();
    if (!isSocialBot(req)) return next();

    const path = req.path;

    // Skip API, sockets, static assets
    if (
      path.startsWith("/api/")
      || path.startsWith("/ws")
      || path.startsWith("/socket")
      || path.startsWith("/uploads/")
      || path.startsWith("/storage/")
      || /\.[a-z0-9]{2,5}$/i.test(path)
    ) {
      return next();
    }

    const origin = resolveOrigin(req);
    const canonical = `${origin}${req.originalUrl}`;

    try {
      let card: ShareCard | null = null;

      const tMatch = path.match(TOURNAMENT_PATH);
      if (tMatch) {
        card = await buildTournamentCard(origin, tMatch[1]);
        if (!card) card = TOURNAMENT_HUB_CARD;
      } else if (path === "/tournaments" || path === "/tournaments/") {
        card = TOURNAMENT_HUB_CARD;
      } else {
        const cMatch = path.match(CHALLENGE_PATH);
        if (cMatch) {
          card = await buildChallengeCard(origin, cMatch[1]);
          if (!card) card = CHALLENGE_HUB_CARD;
        } else if (path === "/challenges" || path === "/challenges/") {
          card = CHALLENGE_HUB_CARD;
        } else {
          const gMatch = path.match(GAME_PATH);
          if (gMatch) {
            card = await buildGameCardBySlug(origin, gMatch[1]);
          } else if (path === "/" || path === "") {
            card = HOMEPAGE_CARD;
          }
        }
      }

      if (!card) return next();

      const html = buildHtml(canonical, card);
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
