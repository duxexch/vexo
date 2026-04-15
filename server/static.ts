import express, { type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import escapeHtml from "escape-html";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { inArray } from "drizzle-orm";

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

function buildFallbackRobots(req: Request): string {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"].split(",")[0].trim()
    : "";
  const protocol = appUrl
    ? ""
    : (forwardedProto || (req.secure ? "https" : "http"));
  const host = req.get("host");
  const baseUrl = appUrl || (host ? `${protocol}://${host}` : "https://vixo.click");
  const hostForDirective = (() => {
    if (appUrl) {
      try {
        return new URL(appUrl).host;
      } catch {
        return appUrl.replace(/^https?:\/\//i, "");
      }
    }

    if (host) {
      return host;
    }

    return "vixo.click";
  })();

  return [
    "# VEX Platform - Robots.txt (fallback)",
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /auth/",
    "",
    `Sitemap: ${baseUrl}/sitemap-index.xml`,
    `Sitemap: ${baseUrl}/sitemap-core.xml`,
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
    `Host: ${hostForDirective}`,
  ].join("\n");
}

// SEO page titles & descriptions for crawler-friendly rendering
const SEO_PAGES: Record<string, { title: string; description: string; keywords: string; canonicalUrl: string }> = {
  "/": {
    title: "VEX - منصة الألعاب والتداول | Play Chess, Backgammon, Domino Online",
    description: "العب شطرنج، طاولة، دومينو، طرنيب وبلوت أونلاين مع لاعبين حقيقيين. تداول P2P آمن مع 85+ عملة. Play Chess, Backgammon, Domino, Tarneeb & Baloot online.",
    keywords: "VEX, العاب اونلاين, شطرنج, طاولة, دومينو, طرنيب, بلوت, تداول P2P, online games, chess, backgammon",
    canonicalUrl: "https://vixo.click"
  },
  "/games": {
    title: "ألعاب أونلاين - شطرنج، طاولة، دومينو، طرنيب، بلوت | VEX Games",
    description: "العب أفضل الألعاب أونلاين: شطرنج، طاولة زهر، دومينو، طرنيب وبلوت مع لاعبين حقيقيين في الوقت الفعلي. Play Chess, Backgammon, Domino, Tarneeb & Baloot online.",
    keywords: "العاب اونلاين, شطرنج اونلاين, طاولة زهر, دومينو, طرنيب, بلوت, chess online, backgammon, domino",
    canonicalUrl: "https://vixo.click/games"
  },
  "/challenges": {
    title: "تحديات مباشرة - العب وأربح | VEX Challenges",
    description: "شارك في تحديات مباشرة ضد لاعبين حقيقيين. تحدى أصدقائك في الشطرنج والطاولة والدومينو. Challenge real players in Chess, Backgammon & more.",
    keywords: "تحديات, مسابقات, العب واربح, challenges, compete, win prizes",
    canonicalUrl: "https://vixo.click/challenges"
  },
  "/p2p": {
    title: "تداول P2P آمن - 85+ عملة | VEX P2P Trading",
    description: "تداول P2P آمن ومضمون مع أكثر من 85 عملة. بيع واشتري بأفضل الأسعار. Secure P2P trading with 85+ currencies.",
    keywords: "تداول P2P, بيع وشراء, عملات, P2P trading, buy sell, currencies, secure trading",
    canonicalUrl: "https://vixo.click/p2p"
  },
  "/tournaments": {
    title: "بطولات أونلاين - فز بجوائز حقيقية | VEX Tournaments",
    description: "شارك في بطولات الشطرنج والطاولة والبلوت. جوائز حقيقية كل يوم. Join Chess, Backgammon & Baloot tournaments.",
    keywords: "بطولات, tournaments, جوائز, prizes, مسابقات, competitions",
    canonicalUrl: "https://vixo.click/tournaments"
  },
  "/leaderboard": {
    title: "لوحة المتصدرين - أفضل اللاعبين | VEX Leaderboard",
    description: "شاهد ترتيب أفضل اللاعبين. تنافس للوصول إلى القمة. See top players ranking and compete for the top.",
    keywords: "متصدرين, ترتيب, leaderboard, ranking, top players, أفضل لاعب",
    canonicalUrl: "https://vixo.click/leaderboard"
  },
  "/free": {
    title: "ألعاب مجانية - العب بدون رصيد | VEX Free Games",
    description: "العب ألعاب مجانية بدون أي رصيد. تدرب وطور مهاراتك. Play free games without any balance. Practice and improve.",
    keywords: "العاب مجانية, free games, بدون رصيد, practice, تدريب",
    canonicalUrl: "https://vixo.click/free"
  },
  "/daily-rewards": {
    title: "مكافآت يومية - اجمع هدايا كل يوم | VEX Daily Rewards",
    description: "احصل على مكافآت يومية مجانية. سجل دخولك كل يوم واجمع جوائز. Get free daily rewards and bonuses.",
    keywords: "مكافآت يومية, daily rewards, هدايا, bonuses, جوائز مجانية",
    canonicalUrl: "https://vixo.click/daily-rewards"
  },
  "/referral": {
    title: "ادعُ أصدقاءك واربح - نظام الإحالة | VEX Referral",
    description: "ادعُ أصدقاءك لمنصة VEX واحصل على مكافآت. Invite friends and earn rewards with VEX referral program.",
    keywords: "إحالة, دعوة أصدقاء, referral, invite friends, مكافآت إحالة",
    canonicalUrl: "https://vixo.click/referral"
  },
  "/install-app": {
    title: "حمّل تطبيق VEX - Android & PWA | Download VEX App",
    description: "حمّل تطبيق VEX على جهازك. متوفر كتطبيق PWA وأندرويد. Download VEX app for Android or install as PWA.",
    keywords: "تحميل VEX, download VEX, تطبيق اندرويد, Android app, PWA, تثبيت",
    canonicalUrl: "https://vixo.click/install-app"
  },
  "/terms": {
    title: "شروط الاستخدام | VEX Terms of Service",
    description: "شروط استخدام منصة VEX للألعاب والتداول. VEX Platform Terms of Service.",
    keywords: "شروط الاستخدام, terms of service, قوانين, rules",
    canonicalUrl: "https://vixo.click/terms"
  },
  "/privacy": {
    title: "سياسة الخصوصية | VEX Privacy Policy",
    description: "سياسة الخصوصية لمنصة VEX. نحمي بياناتك. VEX Privacy Policy - Your data is protected.",
    keywords: "سياسة الخصوصية, privacy policy, حماية البيانات, data protection",
    canonicalUrl: "https://vixo.click/privacy"
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
  canonicalUrl: "https://vixo.click/",
  robotsContent: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  enableSitemap: true,
  localeOverrides: {},
};

const RTL_LANG_PREFIXES = ["ar", "fa", "ur", "he", "ps", "sd", "ug", "yi"];

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

  app.get("/sitemap.xml", publicStaticLimiter, async (_req, res) => {
    try {
      const runtimeSeo = await getRuntimeSeoSettings();
      if (!runtimeSeo.enableSitemap) {
        return res.status(404).type("text/plain").send("sitemap.xml disabled");
      }

      const sitemapPath = path.join(distPath, "sitemap.xml");
      if (fs.existsSync(sitemapPath)) {
        res.set({
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        });
        return res.sendFile(sitemapPath);
      }

      return res.status(404).type("text/plain").send("sitemap.xml not found");
    } catch {
      return res.status(500).type("text/plain").send("sitemap.xml unavailable");
    }
  });

  app.get("/sitemap-index.xml", publicStaticLimiter, async (_req, res) => {
    try {
      const runtimeSeo = await getRuntimeSeoSettings();
      if (!runtimeSeo.enableSitemap) {
        return res.status(404).type("text/plain").send("sitemap-index.xml disabled");
      }

      const sitemapIndexPath = path.join(distPath, "sitemap-index.xml");
      if (fs.existsSync(sitemapIndexPath)) {
        res.set({
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        });
        return res.sendFile(sitemapIndexPath);
      }

      return res.status(404).type("text/plain").send("sitemap-index.xml not found");
    } catch {
      return res.status(500).type("text/plain").send("sitemap-index.xml unavailable");
    }
  });

  app.get("/sitemap-core.xml", publicStaticLimiter, async (_req, res) => {
    try {
      const runtimeSeo = await getRuntimeSeoSettings();
      if (!runtimeSeo.enableSitemap) {
        return res.status(404).type("text/plain").send("sitemap-core.xml disabled");
      }

      const sitemapCorePath = path.join(distPath, "sitemap-core.xml");
      if (fs.existsSync(sitemapCorePath)) {
        res.set({
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=900",
        });
        return res.sendFile(sitemapCorePath);
      }

      return res.status(404).type("text/plain").send("sitemap-core.xml not found");
    } catch {
      return res.status(500).type("text/plain").send("sitemap-core.xml unavailable");
    }
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
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
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

  // fall through to index.html if the file doesn't exist (SPA)
  // Inject SEO meta tags for crawler-friendly rendering
  app.use("*", publicHtmlLimiter, async (req, res) => {
    try {
      const forceSeoRefresh = req.query.seo_refresh === "1" || req.query.seo_refresh === "true";
      const runtimeSeo = await getRuntimeSeoSettings(forceSeoRefresh);
      const locale = getPreferredLocale(req);
      const localeBase = locale.split("-")[0];
      const isRtlLocale = RTL_LANG_PREFIXES.includes(localeBase);

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Robots-Tag", runtimeSeo.robotsContent);

      const indexPath = path.resolve(distPath, "index.html");
      let html = fs.readFileSync(indexPath, "utf-8");

      // Get SEO data for the current path
      const pagePath = req.originalUrl.split("?")[0].replace(/\/$/, "") || "/";
      const routeSeo = SEO_PAGES[pagePath];

      const defaultCanonical = `https://vixo.click${pagePath === "/" ? "/" : pagePath}`;
      const canonicalUrl = routeSeo?.canonicalUrl || runtimeSeo.canonicalUrl || defaultCanonical;

      const title = getLocaleValue(runtimeSeo.localeOverrides, locale, "siteTitle")
        || routeSeo?.title
        || runtimeSeo.siteTitle
        || RUNTIME_SEO_DEFAULTS.siteTitle;
      const description = getLocaleValue(runtimeSeo.localeOverrides, locale, "siteDescription")
        || routeSeo?.description
        || runtimeSeo.siteDescription
        || RUNTIME_SEO_DEFAULTS.siteDescription;
      const keywords = getLocaleValue(runtimeSeo.localeOverrides, locale, "siteKeywords")
        || routeSeo?.keywords
        || runtimeSeo.siteKeywords
        || RUNTIME_SEO_DEFAULTS.siteKeywords;
      const ogTitle = getLocaleValue(runtimeSeo.localeOverrides, locale, "ogTitle") || runtimeSeo.ogTitle || title;
      const ogDescription = getLocaleValue(runtimeSeo.localeOverrides, locale, "ogDescription") || runtimeSeo.ogDescription || description;

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

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch {
      res.status(500).set({ "Content-Type": "text/plain" }).end("SEO rendering error");
    }
  });
}
