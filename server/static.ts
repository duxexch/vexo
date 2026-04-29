import express, { type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import escapeHtml from "escape-html";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { resolveDynamicRouteSeo } from "./lib/sitemap-builder";
import { getCanonicalOrigin } from "@shared/runtime-config";

const CANONICAL_ORIGIN = getCanonicalOrigin();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicStaticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicHtmlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFallbackRobots(req: Request): string {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"].split(",")[0].trim()
    : "";
  const protocol = appUrl
    ? ""
    : (forwardedProto || (req.secure ? "https" : "http"));
  const host = req.get("host");
  const baseUrl = appUrl || (host ? `${protocol}://${host}` : getCanonicalOrigin());
  return [
    "# VEX Platform - Robots.txt (fallback)",
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /auth/",
    "",
    `Sitemap: ${baseUrl}/sitemap-index.xml`,
  ].join("\n");
}

function buildFallbackSitemapCore(baseUrl: string): string {
  const now = new Date().toISOString();
  const publicPaths = [
    "/",
    "/games",
    "/challenges",
    "/p2p",
    "/tournaments",
    "/leaderboard",
    "/free",
    "/daily-rewards",
    "/referral",
    "/install-app",
    "/terms",
    "/privacy",
  ];

  const urls = publicPaths.map((route) => {
    const loc = route === "/" ? `${baseUrl}/` : `${baseUrl}${route}`;
    return [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${now}</lastmod>`,
      "    <changefreq>daily</changefreq>",
      "    <priority>0.8</priority>",
      "  </url>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
  ].join("\n");
}

function buildFallbackSitemapGuides(baseUrl: string): string {
  const now = new Date().toISOString();
  const guides = [
    "/guides/index.html",
    "/guides/vex-platform-overview.html",
    "/guides/vex-p2p-trading-security.html",
    "/guides/vex-games-challenges-guide.html",
    "/guides/vex-account-wallet-verification.html",
    "/guides/vex-online-chess-arabic-guide.html",
    "/guides/vex-online-backgammon-zahr-guide.html",
    "/guides/vex-online-domino-strategy-guide.html",
    "/guides/vex-online-baloot-tarneeb-guide.html",
    "/guides/vex-p2p-payment-methods-currencies-guide.html",
    "/guides/vex-earn-daily-rewards-tournaments-guide.html",
    "/guides/vex-seo-keywords-ar.html",
    "/guides/vex-seo-keywords-en.html",
    "/guides/vex-search-intents-faq.html",
    "/guides/vex-html-sitemap.html",
  ];

  const urls = guides.map((route) => [
    "  <url>",
    `    <loc>${escapeXml(`${baseUrl}${route}`)}</loc>`,
    `    <lastmod>${now}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>0.72</priority>",
    "  </url>",
  ].join("\n")).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
  ].join("\n");
}

function buildFallbackSitemapIndex(baseUrl: string): string {
  const now = new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <sitemap>",
    `    <loc>${escapeXml(`${baseUrl}/sitemap-core.xml`)}</loc>`,
    `    <lastmod>${now}</lastmod>`,
    "  </sitemap>",
    "  <sitemap>",
    `    <loc>${escapeXml(`${baseUrl}/sitemap-guides.xml`)}</loc>`,
    `    <lastmod>${now}</lastmod>`,
    "  </sitemap>",
    "</sitemapindex>",
  ].join("\n");
}

function buildRuntimeBaseUrl(req: Request): string {
  const appUrl = (process.env.APP_URL || process.env.APP_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (appUrl) {
    return appUrl;
  }

  const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"].split(",")[0].trim()
    : "";
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const host = req.get("host");
  return host ? `${protocol}://${host}` : CANONICAL_ORIGIN;
}

// SEO page titles & descriptions for crawler-friendly rendering
const SEO_PAGES: Record<string, { title: string; description: string; keywords: string; canonicalUrl: string }> = {
  "/": {
    title: "VEX - منصة الألعاب والتداول | Play Chess, Backgammon, Domino Online",
    description: "العب شطرنج، طاولة، دومينو، طرنيب وبلوت أونلاين مع لاعبين حقيقيين. تداول P2P آمن مع 85+ عملة. Play Chess, Backgammon, Domino, Tarneeb & Baloot online.",
    keywords: "VEX, العاب اونلاين, شطرنج, طاولة, دومينو, طرنيب, بلوت, تداول P2P, online games, chess, backgammon",
    canonicalUrl: CANONICAL_ORIGIN
  },
  "/games": {
    title: "ألعاب أونلاين - شطرنج، طاولة، دومينو، طرنيب، بلوت | VEX Games",
    description: "العب أفضل الألعاب أونلاين: شطرنج، طاولة زهر، دومينو، طرنيب وبلوت مع لاعبين حقيقيين في الوقت الفعلي. Play Chess, Backgammon, Domino, Tarneeb & Baloot online.",
    keywords: "العاب اونلاين, شطرنج اونلاين, طاولة زهر, دومينو, طرنيب, بلوت, chess online, backgammon, domino",
    canonicalUrl: `${CANONICAL_ORIGIN}/games`
  },
  "/challenges": {
    title: "تحديات مباشرة - العب وأربح | VEX Challenges",
    description: "شارك في تحديات مباشرة ضد لاعبين حقيقيين. تحدى أصدقائك في الشطرنج والطاولة والدومينو. Challenge real players in Chess, Backgammon & more.",
    keywords: "تحديات, مسابقات, العب واربح, challenges, compete, win prizes",
    canonicalUrl: `${CANONICAL_ORIGIN}/challenges`
  },
  "/p2p": {
    title: "تداول P2P آمن - 85+ عملة | VEX P2P Trading",
    description: "تداول P2P آمن ومضمون مع أكثر من 85 عملة. بيع واشتري بأفضل الأسعار. Secure P2P trading with 85+ currencies.",
    keywords: "تداول P2P, بيع وشراء, عملات, P2P trading, buy sell, currencies, secure trading",
    canonicalUrl: `${CANONICAL_ORIGIN}/p2p`
  },
  "/tournaments": {
    title: "بطولات أونلاين - فز بجوائز حقيقية | VEX Tournaments",
    description: "شارك في بطولات الشطرنج والطاولة والبلوت. جوائز حقيقية كل يوم. Join Chess, Backgammon & Baloot tournaments.",
    keywords: "بطولات, tournaments, جوائز, prizes, مسابقات, competitions",
    canonicalUrl: `${CANONICAL_ORIGIN}/tournaments`
  },
  "/leaderboard": {
    title: "لوحة المتصدرين - أفضل اللاعبين | VEX Leaderboard",
    description: "شاهد ترتيب أفضل اللاعبين. تنافس للوصول إلى القمة. See top players ranking and compete for the top.",
    keywords: "متصدرين, ترتيب, leaderboard, ranking, top players, أفضل لاعب",
    canonicalUrl: `${CANONICAL_ORIGIN}/leaderboard`
  },
  "/free": {
    title: "ألعاب مجانية - العب بدون رصيد | VEX Free Games",
    description: "العب ألعاب مجانية بدون أي رصيد. تدرب وطور مهاراتك. Play free games without any balance. Practice and improve.",
    keywords: "العاب مجانية, free games, بدون رصيد, practice, تدريب",
    canonicalUrl: `${CANONICAL_ORIGIN}/free`
  },
  "/daily-rewards": {
    title: "مكافآت يومية - اجمع هدايا كل يوم | VEX Daily Rewards",
    description: "احصل على مكافآت يومية مجانية. سجل دخولك كل يوم واجمع جوائز. Get free daily rewards and bonuses.",
    keywords: "مكافآت يومية, daily rewards, هدايا, bonuses, جوائز مجانية",
    canonicalUrl: `${CANONICAL_ORIGIN}/daily-rewards`
  },
  "/referral": {
    title: "ادعُ أصدقاءك واربح - نظام الإحالة | VEX Referral",
    description: "ادعُ أصدقاءك لمنصة VEX واحصل على مكافآت. Invite friends and earn rewards with VEX referral program.",
    keywords: "إحالة, دعوة أصدقاء, referral, invite friends, مكافآت إحالة",
    canonicalUrl: `${CANONICAL_ORIGIN}/referral`
  },
  "/install-app": {
    title: "حمّل تطبيق VEX - Android & PWA | Download VEX App",
    description: "حمّل تطبيق VEX على جهازك. متوفر كتطبيق PWA وأندرويد. Download VEX app for Android or install as PWA.",
    keywords: "تحميل VEX, download VEX, تطبيق اندرويد, Android app, PWA, تثبيت",
    canonicalUrl: `${CANONICAL_ORIGIN}/install-app`
  },
  "/terms": {
    title: "شروط الاستخدام | VEX Terms of Service",
    description: "شروط استخدام منصة VEX للألعاب والتداول. VEX Platform Terms of Service.",
    keywords: "شروط الاستخدام, terms of service, قوانين, rules",
    canonicalUrl: `${CANONICAL_ORIGIN}/terms`
  },
  "/privacy": {
    title: "سياسة الخصوصية | VEX Privacy Policy",
    description: "سياسة الخصوصية لمنصة VEX. نحمي بياناتك. VEX Privacy Policy - Your data is protected.",
    keywords: "سياسة الخصوصية, privacy policy, حماية البيانات, data protection",
    canonicalUrl: `${CANONICAL_ORIGIN}/privacy`
  },
  "/coin": {
    title: "عملة VEX - Project Coin بأسعار مباشرة | VEX Coin",
    description: "عملة VEX الرسمية: العملة الموحدة داخل المنصة، تفتح بطولات وجوائز وشراكات حصرية. أسعار وحركة سوقية مباشرة. The official VEX project coin powering tournaments, prizes and partnerships — live price feed.",
    keywords: "VEX Coin, عملة VEX, عملة المشروع, project coin, crypto gaming, gaming token, العملة الرسمية, live price",
    canonicalUrl: `${CANONICAL_ORIGIN}/coin`
  },
  "/agents-program": {
    title: "برنامج الوكلاء التجاريين - فرصة دخل حقيقي | VEX Agents Program",
    description: "انضم لشبكة وكلاء VEX المعتمدين واربح عمولات على كل عملية. شروط واضحة، دعم مباشر، ومستويات مكافآت متعددة. Join VEX certified commercial agents and earn commissions on every transaction.",
    keywords: "وكلاء تجاريون, برنامج الوكلاء, commercial agents, VEX agents, agent program, شراكة, partnership, agent commissions",
    canonicalUrl: `${CANONICAL_ORIGIN}/agents-program`
  },
  "/affiliates": {
    title: "برنامج الإحالة والشراكة - أربح من دعوات أصدقائك | VEX Affiliates",
    description: "ادعُ أصدقاءك ومجتمعك إلى منصة VEX واربح نسبة من كل عملية يقومون بها مدى الحياة. لوحة تحكم متقدمة وروابط تتبع فورية. Refer friends to VEX and earn lifetime commissions with real-time tracking.",
    keywords: "برنامج الإحالة, شراكة, affiliate program, referral commissions, VEX affiliates, ربح من الإحالة, marketing partner",
    canonicalUrl: `${CANONICAL_ORIGIN}/affiliates`
  },
  "/invest": {
    title: "فرصة استثمارية حصرية - ساهم في رحلة VEX | Invest in VEX",
    description: "فرصة استثمارية محدودة في منصة VEX. شارك في بناء مستقبل الألعاب والتداول في المنطقة العربية. اطلع على التوزيع والمزايا الحصرية. Limited investment opportunity to be part of the VEX journey — see allocation, terms and exclusive benefits.",
    keywords: "استثمار VEX, فرصة استثمارية, invest in VEX, VEX investment, gaming startup, Arab gaming, MENA tech investment",
    canonicalUrl: `${CANONICAL_ORIGIN}/invest`
  },
};

type SeoLocaleField = "siteTitle" | "siteDescription" | "siteKeywords" | "ogTitle" | "ogDescription";
type SeoLocaleOverrides = Record<string, Partial<Record<SeoLocaleField, string>>>;

type RuntimeSeoSettings = {
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  ogTitle: string;
  ogDescription: string;
  canonicalUrl: string;
  robotsContent: string;
  enableSitemap: boolean;
  localeOverrides: SeoLocaleOverrides;
};

const RUNTIME_SEO_SETTING_KEYS = [
  "seo_site_title",
  "seo_site_description",
  "seo_site_keywords",
  "seo_og_title",
  "seo_og_description",
  "seo_canonical_url",
  "seo_robots_content",
  "seo_enable_sitemap",
  "seo_locale_overrides",
] as const;

const RUNTIME_SEO_DEFAULTS: RuntimeSeoSettings = {
  siteTitle: SEO_PAGES["/"]?.title || "VEX",
  siteDescription: SEO_PAGES["/"]?.description || "VEX",
  siteKeywords: SEO_PAGES["/"]?.keywords || "VEX",
  ogTitle: SEO_PAGES["/"]?.title || "VEX",
  ogDescription: SEO_PAGES["/"]?.description || "VEX",
  canonicalUrl: `${CANONICAL_ORIGIN}/`,
  robotsContent: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  enableSitemap: true,
  localeOverrides: {},
};

const RTL_LANG_PREFIXES = ["ar", "fa", "ur", "he", "ps", "sd", "ug", "yi"];

const UUID_PROBE_ROUTE_REGEX =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-[a-z0-9-]+)?\/?$/i;

function shouldForceNotFoundForProbe(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase();
  if (!normalized || normalized === "/") {
    return false;
  }

  if (normalized.includes("404check")) {
    return true;
  }

  return UUID_PROBE_ROUTE_REGEX.test(normalized);
}

let runtimeSeoCache: { value: RuntimeSeoSettings; expiresAt: number } | null = null;

export function invalidateRuntimeSeoCache(): void {
  runtimeSeoCache = null;
}

function parseLocaleOverrides(raw: string | null | undefined): SeoLocaleOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const out: SeoLocaleOverrides = {};
    for (const [locale, localeValue] of Object.entries(parsed)) {
      if (!localeValue || typeof localeValue !== "object" || Array.isArray(localeValue)) continue;
      const localeData = localeValue as Record<string, unknown>;

      const normalized: Partial<Record<SeoLocaleField, string>> = {};
      for (const field of ["siteTitle", "siteDescription", "siteKeywords", "ogTitle", "ogDescription"] as const) {
        if (typeof localeData[field] === "string") {
          normalized[field] = localeData[field] as string;
        }
      }

      if (Object.keys(normalized).length > 0) {
        out[locale.toLowerCase()] = normalized;
      }
    }

    return out;
  } catch {
    return {};
  }
}

async function getRuntimeSeoSettings(forceRefresh = false): Promise<RuntimeSeoSettings> {
  if (!forceRefresh && runtimeSeoCache && runtimeSeoCache.expiresAt > Date.now()) {
    return runtimeSeoCache.value;
  }

  const rows = await db.select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [...RUNTIME_SEO_SETTING_KEYS]));

  const map = rows.reduce<Record<string, string>>((acc, row) => {
    if (row.value !== null) acc[row.key] = row.value;
    return acc;
  }, {});

  const value: RuntimeSeoSettings = {
    siteTitle: map.seo_site_title || RUNTIME_SEO_DEFAULTS.siteTitle,
    siteDescription: map.seo_site_description || RUNTIME_SEO_DEFAULTS.siteDescription,
    siteKeywords: map.seo_site_keywords || RUNTIME_SEO_DEFAULTS.siteKeywords,
    ogTitle: map.seo_og_title || RUNTIME_SEO_DEFAULTS.ogTitle,
    ogDescription: map.seo_og_description || RUNTIME_SEO_DEFAULTS.ogDescription,
    canonicalUrl: map.seo_canonical_url || RUNTIME_SEO_DEFAULTS.canonicalUrl,
    robotsContent: map.seo_robots_content || RUNTIME_SEO_DEFAULTS.robotsContent,
    enableSitemap: (map.seo_enable_sitemap || "true") !== "false",
    localeOverrides: parseLocaleOverrides(map.seo_locale_overrides),
  };

  runtimeSeoCache = {
    value,
    expiresAt: Date.now() + 60_000,
  };

  return value;
}

async function getRuntimeSeoSettingsSafely(forceRefresh = false): Promise<RuntimeSeoSettings> {
  try {
    return await getRuntimeSeoSettings(forceRefresh);
  } catch {
    return RUNTIME_SEO_DEFAULTS;
  }
}

function getPreferredLocale(req: Request): string {
  const langQuery = typeof req.query.lang === "string" ? req.query.lang : "";
  const hlQuery = typeof req.query.hl === "string" ? req.query.hl : "";
  const fromQuery = (langQuery || hlQuery).trim().toLowerCase();
  if (fromQuery) return fromQuery;

  const acceptLanguageHeader = typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : "";
  const first = acceptLanguageHeader.split(",")[0]?.trim().toLowerCase();
  return first || "ar";
}

function getLocaleValue(overrides: SeoLocaleOverrides, locale: string, field: SeoLocaleField): string | undefined {
  const exact = overrides[locale]?.[field];
  if (exact) return exact;

  const base = locale.split("-")[0];
  return overrides[base]?.[field];
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // ── Service Worker — MUST NOT be cached, with correct MIME & scope headers ──
  app.get("/sw.js", publicStaticLimiter, (_req, res) => {
    const swPath = path.join(distPath, "sw.js");
    if (fs.existsSync(swPath)) {
      const content = fs.readFileSync(swPath, "utf-8");
      res.set({
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
      });
      res.status(200).send(content);
    } else {
      res.status(404).end("// Service worker not found");
    }
  });

  // ── Manifest — short cache, correct type ──
  app.get("/manifest.json", publicStaticLimiter, (_req, res) => {
    const manifestPath = path.join(distPath, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, "utf-8");
      res.set({
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      res.status(200).send(content);
    } else {
      res.status(404).json({});
    }
  });

  // Favicon — serve a stable image response for search engines.
  app.get("/favicon.ico", publicStaticLimiter, (_req, res) => {
    const icoPath = path.join(distPath, "favicon.ico");
    const pngFallbackPath = path.join(distPath, "icons", "vex-gaming-logo-96x96.png");

    res.set({
      "Cache-Control": "public, max-age=86400",
    });

    if (fs.existsSync(icoPath)) {
      res.type("image/x-icon");
      return res.sendFile(icoPath);
    }

    if (fs.existsSync(pngFallbackPath)) {
      res.type("image/png");
      return res.sendFile(pngFallbackPath);
    }

    return res.status(404).type("text/plain").send("favicon not found");
  });

  // SEO infrastructure files — serve explicitly with stable content types.
  app.get("/robots.txt", publicStaticLimiter, (req, res) => {
    const robotsPath = path.join(distPath, "robots.txt");
    if (fs.existsSync(robotsPath)) {
      res.set({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
      });
      res.sendFile(robotsPath);
    } else {
      res.set({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      res.status(200).send(buildFallbackRobots(req));
    }
  });

  app.get("/sitemap.xml", publicStaticLimiter, (req, res) => {
    const sitemapPath = path.join(distPath, "sitemap.xml");
    if (fs.existsSync(sitemapPath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      return res.sendFile(sitemapPath);
    }

    const fallbackXml = buildFallbackSitemapCore(buildRuntimeBaseUrl(req));
    return res
      .status(200)
      .set("Cache-Control", "public, max-age=3600")
      .type("application/xml; charset=utf-8")
      .send(fallbackXml);
  });

  app.get("/sitemap-index.xml", publicStaticLimiter, (req, res) => {
    const sitemapIndexPath = path.join(distPath, "sitemap-index.xml");
    if (fs.existsSync(sitemapIndexPath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      return res.sendFile(sitemapIndexPath);
    }

    const fallbackXml = buildFallbackSitemapIndex(buildRuntimeBaseUrl(req));
    return res
      .status(200)
      .set("Cache-Control", "public, max-age=3600")
      .type("application/xml; charset=utf-8")
      .send(fallbackXml);
  });

  app.get("/sitemap-core.xml", publicStaticLimiter, (req, res) => {
    const sitemapCorePath = path.join(distPath, "sitemap-core.xml");
    if (fs.existsSync(sitemapCorePath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      return res.sendFile(sitemapCorePath);
    }

    const fallbackXml = buildFallbackSitemapCore(buildRuntimeBaseUrl(req));
    return res
      .status(200)
      .set("Cache-Control", "public, max-age=3600")
      .type("application/xml; charset=utf-8")
      .send(fallbackXml);
  });

  app.get("/sitemap-guides.xml", publicStaticLimiter, (req, res) => {
    const sitemapGuidesPath = path.join(distPath, "sitemap-guides.xml");
    if (fs.existsSync(sitemapGuidesPath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      return res.sendFile(sitemapGuidesPath);
    }

    const fallbackXml = buildFallbackSitemapGuides(buildRuntimeBaseUrl(req));
    return res
      .status(200)
      .set("Cache-Control", "public, max-age=3600")
      .type("application/xml; charset=utf-8")
      .send(fallbackXml);
  });

  // Downloads folder — serve public APK files only. AAB is admin-only.
  const blockPublicAabDownload = (req: Request, res: Response, next: NextFunction) => {
    if (req.path.toLowerCase().endsWith(".aab")) {
      return res.status(404).type("text/plain").send("Not found");
    }
    return next();
  };

  app.use("/downloads", blockPublicAabDownload, express.static(path.join(distPath, "downloads"), {
    maxAge: "1h",
    etag: true,
    redirect: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      }
      // manifest.json drives the live APK filename / version — never cache
      // it, otherwise refresh-android-binaries.sh updates won't surface
      // until the 1h TTL expires.
      if (path.basename(filePath) === 'manifest.json') {
        res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    }
  }));

  // Hashed assets (JS/CSS with content hash) — immutable, cache forever
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
    etag: false,
    lastModified: false,
  }));

  // App icons change infrequently, so cache longer than generic static files.
  app.use("/icons", express.static(path.join(distPath, "icons"), {
    maxAge: "30d",
    immutable: true,
    etag: true,
    index: false,
  }));

  // Other static files — cache briefly, revalidate
  app.use(express.static(distPath, {
    maxAge: "1h",
    etag: true,
    index: false,
    redirect: false,
  }));

  // Digital Asset Links for TWA (Android app verification)
  app.get("/.well-known/assetlinks.json", publicStaticLimiter, (_req, res) => {
    const assetLinksPath = path.join(distPath, ".well-known", "assetlinks.json");
    if (fs.existsSync(assetLinksPath)) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.sendFile(assetLinksPath);
    } else {
      res.status(404).json([]);
    }
  });

  // Apple App Site Association (iOS Universal Links / Trusted app)
  app.get("/.well-known/apple-app-site-association", publicStaticLimiter, (_req, res) => {
    const aasaPath = path.join(distPath, ".well-known", "apple-app-site-association");
    if (fs.existsSync(aasaPath)) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.sendFile(aasaPath);
    } else {
      res.status(404).json({});
    }
  });

  // Catch-all for unmatched /api/* routes — return 404 JSON, not SPA HTML
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  // Requests for non-existing HTML files should return 404 instead of SPA fallback.
  app.get(/.*\.html$/i, publicHtmlLimiter, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res.status(404).type("text/plain").send("Not found");
  });

  // fall through to index.html if the file doesn't exist (SPA)
  // Inject SEO meta tags for crawler-friendly rendering
  app.use("*", publicHtmlLimiter, async (req, res) => {
    try {
      const pagePath = req.originalUrl.split("?")[0].replace(/\/+$/, "") || "/";
      if (shouldForceNotFoundForProbe(pagePath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        return res.status(404).type("text/plain").send("Not found");
      }

      const indexPath = path.resolve(distPath, "index.html");
      const baseHtml = fs.readFileSync(indexPath, "utf-8");
      const { html, robotsContent } = await renderHtmlWithSeo(req, baseHtml);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Robots-Tag", robotsContent);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch {
      res.status(500).set({ "Content-Type": "text/plain" }).end("SEO rendering error");
    }
  });
}

/**
 * Apply dynamic SEO meta + JSON-LD to an HTML template based on the request.
 * Used by both the production static handler and the dev Vite middleware so
 * programmatic SEO landing pages get correct titles/canonicals in every mode.
 */
export async function renderHtmlWithSeo(
  req: Request,
  baseHtml: string,
): Promise<{ html: string; robotsContent: string }> {
  const pagePath = req.originalUrl.split("?")[0].replace(/\/+$/, "") || "/";
  const forceSeoRefresh = req.query.seo_refresh === "1" || req.query.seo_refresh === "true";
  const runtimeSeo = await getRuntimeSeoSettingsSafely(forceSeoRefresh);
  const locale = getPreferredLocale(req);
  const localeBase = locale.split("-")[0];
  const isRtlLocale = RTL_LANG_PREFIXES.includes(localeBase);
  let html = baseHtml;

  {
      // Get SEO data for the current path — try static map first, then dynamic resolver
      const staticRouteSeo = SEO_PAGES[pagePath];
      const baseUrlForRoute = buildRuntimeBaseUrl(req);
      let dynamicRouteSeo: { title: string; description: string; keywords: string; canonicalUrl: string; jsonLd?: Record<string, unknown> } | null = null;
      if (!staticRouteSeo) {
        try {
          dynamicRouteSeo = await resolveDynamicRouteSeo(pagePath, baseUrlForRoute, locale);
        } catch {
          dynamicRouteSeo = null;
        }
      }
      const routeSeo = staticRouteSeo || (dynamicRouteSeo ? {
        title: dynamicRouteSeo.title,
        description: dynamicRouteSeo.description,
        keywords: dynamicRouteSeo.keywords,
        canonicalUrl: dynamicRouteSeo.canonicalUrl,
      } : undefined);

      const defaultCanonical = `${baseUrlForRoute}${pagePath === "/" ? "/" : pagePath}`;
      const canonicalUrl = routeSeo?.canonicalUrl || runtimeSeo.canonicalUrl || defaultCanonical;

      // Priority: per-route SEO (static map or dynamic resolver) > admin locale overrides
      // > runtime defaults. For programmatic landing pages we want the page-specific
      // title/description to outrank the site-wide locale override.
      const title = routeSeo?.title
        || getLocaleValue(runtimeSeo.localeOverrides, locale, "siteTitle")
        || runtimeSeo.siteTitle
        || RUNTIME_SEO_DEFAULTS.siteTitle;
      const description = routeSeo?.description
        || getLocaleValue(runtimeSeo.localeOverrides, locale, "siteDescription")
        || runtimeSeo.siteDescription
        || RUNTIME_SEO_DEFAULTS.siteDescription;
      const keywords = routeSeo?.keywords
        || getLocaleValue(runtimeSeo.localeOverrides, locale, "siteKeywords")
        || runtimeSeo.siteKeywords
        || RUNTIME_SEO_DEFAULTS.siteKeywords;
      const ogTitle = routeSeo?.title
        || getLocaleValue(runtimeSeo.localeOverrides, locale, "ogTitle")
        || runtimeSeo.ogTitle
        || title;
      const ogDescription = routeSeo?.description
        || getLocaleValue(runtimeSeo.localeOverrides, locale, "ogDescription")
        || runtimeSeo.ogDescription
        || description;

      const escapedTitle = escapeHtmlAttribute(title);
      const escapedDescription = escapeHtmlAttribute(description);
      const escapedKeywords = escapeHtmlAttribute(keywords);
      const escapedOgTitle = escapeHtmlAttribute(ogTitle);
      const escapedOgDescription = escapeHtmlAttribute(ogDescription);
      const escapedUrl = escapeHtmlAttribute(canonicalUrl);
      const escapedRobots = escapeHtmlAttribute(runtimeSeo.robotsContent);

      html = html.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => {
        const withoutLangDir = attrs
          .replace(/\s+lang="[^"]*"/i, "")
          .replace(/\s+dir="[^"]*"/i, "");
        return `<html lang="${escapeHtmlAttribute(locale)}" dir="${isRtlLocale ? "rtl" : "ltr"}"${withoutLangDir}>`;
      });

      // Replace title
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`);

      // Replace meta description
      html = html.replace(
        /<meta name="description" content="[^"]*"/,
        `<meta name="description" content="${escapedDescription}"`
      );

      // Replace meta keywords
      html = html.replace(
        /<meta name="keywords" content="[^"]*"/,
        `<meta name="keywords" content="${escapedKeywords}"`
      );

      // Replace robots meta from runtime settings
      html = html.replace(
        /<meta name="robots" content="[^"]*"/,
        `<meta name="robots" content="${escapedRobots}"`
      );

      // Replace OG tags
      html = html.replace(
        /<meta property="og:title" content="[^"]*"/,
        `<meta property="og:title" content="${escapedOgTitle}"`
      );
      html = html.replace(
        /<meta property="og:description" content="[^"]*"/,
        `<meta property="og:description" content="${escapedOgDescription}"`
      );

      // Replace Twitter tags
      html = html.replace(
        /<meta name="twitter:title" content="[^"]*"/,
        `<meta name="twitter:title" content="${escapedOgTitle}"`
      );
      html = html.replace(
        /<meta name="twitter:description" content="[^"]*"/,
        `<meta name="twitter:description" content="${escapedOgDescription}"`
      );

      // Update canonical URL
      html = html.replace(
        /<link rel="canonical" href="[^"]*"/,
        `<link rel="canonical" href="${escapedUrl}"`
      );
      html = html.replace(
        /<meta property="og:url" content="[^"]*"/,
        `<meta property="og:url" content="${escapedUrl}"`
      );

      // Keep twitter:url in sync with canonical (was previously static and drifted per page)
      html = html.replace(
        /<meta name="twitter:url" content="[^"]*"/,
        `<meta name="twitter:url" content="${escapedUrl}"`
      );

      // Make og:locale match the request locale so social cards align with <html lang>
      const ogLocaleValue = locale.includes("-")
        ? locale.replace("-", "_")
        : `${localeBase}_${localeBase.toUpperCase()}`;
      const escapedOgLocale = escapeHtmlAttribute(ogLocaleValue);
      html = html.replace(
        /<meta property="og:locale" content="[^"]*"/,
        `<meta property="og:locale" content="${escapedOgLocale}"`
      );

      // ==================== hreflang alternates (AR / EN / x-default) ====================
      // The platform serves the same canonical URL for both AR and EN via i18n,
      // so we point all alternates at the same canonical URL. This signals to
      // Google that the page is bilingual rather than duplicate content.
      const hreflangBlock = [
        `<link rel="alternate" hreflang="ar" href="${escapedUrl}" />`,
        `<link rel="alternate" hreflang="en" href="${escapedUrl}" />`,
        `<link rel="alternate" hreflang="x-default" href="${escapedUrl}" />`,
      ].join("\n    ");
      if (!/<link rel="alternate" hreflang=/i.test(html)) {
        html = html.replace(
          /(<link rel="canonical" href="[^"]*"\s*\/?>)/,
          `$1\n    ${hreflangBlock}`,
        );
      }

      // ==================== Global JSON-LD (Organization + WebSite + Breadcrumbs) ====================
      // Emit on every SSR'd HTML response so each indexable page carries strong
      // entity signals and a breadcrumb trail. Dynamic-route JSON-LD (e.g.
      // VideoGame) is appended afterwards and does not replace these blocks.
      // JSON.stringify handles all value escaping; the </script>-injection
      // guard happens in the .replace below.
      const organizationJsonLd = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${baseUrlForRoute}/#organization`,
        name: "VEX",
        url: baseUrlForRoute,
        logo: `${baseUrlForRoute}/logo-512.png`,
        sameAs: [],
      } as Record<string, unknown>;

      const websiteJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${baseUrlForRoute}/#website`,
        name: runtimeSeo.siteTitle || "VEX",
        url: baseUrlForRoute,
        inLanguage: ["ar", "en"],
        publisher: { "@id": `${baseUrlForRoute}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${baseUrlForRoute}/games?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      } as Record<string, unknown>;

      // Build a breadcrumb trail from the path segments for non-root routes.
      const ar = arabicLocale(locale);
      const breadcrumbItems: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
        { "@type": "ListItem", position: 1, name: ar ? "الرئيسية" : "Home", item: `${baseUrlForRoute}/` },
      ];
      if (pagePath !== "/") {
        const segments = pagePath.split("/").filter(Boolean);
        let acc = "";
        segments.forEach((seg, idx) => {
          acc += `/${seg}`;
          breadcrumbItems.push({
            "@type": "ListItem",
            position: idx + 2,
            name: seg
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            item: `${baseUrlForRoute}${acc}`,
          });
        });
      }
      const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      } as Record<string, unknown>;

      const baseLdBlocks = [organizationJsonLd, websiteJsonLd, breadcrumbJsonLd]
        .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`)
        .join("\n");

      // Inject base JSON-LD blocks (Organization + WebSite + Breadcrumbs) before </head>
      html = html.replace("</head>", `${baseLdBlocks}\n</head>`);

      // Inject JSON-LD for dynamic SEO routes (programmatic landing pages)
      if (dynamicRouteSeo?.jsonLd) {
        const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(dynamicRouteSeo.jsonLd).replace(/</g, "\\u003c")}</script>`;
        html = html.replace("</head>", `${jsonLdScript}\n</head>`);
      }
  }

  return { html, robotsContent: runtimeSeo.robotsContent };
}

function arabicLocale(locale: string): boolean {
  return locale.toLowerCase().split("-")[0] === "ar";
}
