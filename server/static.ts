import express, { type Express, type Request } from "express";
import rateLimit from "express-rate-limit";
import escapeHtml from "escape-html";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    `Host: ${baseUrl}`,
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

  app.get("/sitemap.xml", publicStaticLimiter, (_req, res) => {
    const sitemapPath = path.join(distPath, "sitemap.xml");
    if (fs.existsSync(sitemapPath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      });
      res.sendFile(sitemapPath);
    } else {
      res.status(404).type("text/plain").send("sitemap.xml not found");
    }
  });

  app.get("/sitemap-index.xml", publicStaticLimiter, (_req, res) => {
    const sitemapIndexPath = path.join(distPath, "sitemap-index.xml");
    if (fs.existsSync(sitemapIndexPath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      });
      res.sendFile(sitemapIndexPath);
    } else {
      res.status(404).type("text/plain").send("sitemap-index.xml not found");
    }
  });

  app.get("/sitemap-core.xml", publicStaticLimiter, (_req, res) => {
    const sitemapCorePath = path.join(distPath, "sitemap-core.xml");
    if (fs.existsSync(sitemapCorePath)) {
      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      });
      res.sendFile(sitemapCorePath);
    } else {
      res.status(404).type("text/plain").send("sitemap-core.xml not found");
    }
  });

  // Downloads folder — APK, AAB with proper MIME types and Content-Disposition
  app.use("/downloads", express.static(path.join(distPath, "downloads"), {
    maxAge: "1h",
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      } else if (filePath.endsWith('.aab')) {
        res.setHeader('Content-Type', 'application/octet-stream');
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

  // Other static files — cache briefly, revalidate
  app.use(express.static(distPath, {
    maxAge: "1h",
    etag: true,
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
  app.use("*", publicHtmlLimiter, (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    const indexPath = path.resolve(distPath, "index.html");
    let html = fs.readFileSync(indexPath, "utf-8");

    // Get SEO data for the current path
    const pagePath = req.originalUrl.split("?")[0].replace(/\/$/, "") || "/";
    const seo = SEO_PAGES[pagePath];

    if (seo) {
      const escapedTitle = escapeHtmlAttribute(seo.title);
      const escapedDescription = escapeHtmlAttribute(seo.description);
      const escapedKeywords = escapeHtmlAttribute(seo.keywords);

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

      // Replace OG tags
      html = html.replace(
        /<meta property="og:title" content="[^"]*"/,
        `<meta property="og:title" content="${escapedTitle}"`
      );
      html = html.replace(
        /<meta property="og:description" content="[^"]*"/,
        `<meta property="og:description" content="${escapedDescription}"`
      );

      // Replace Twitter tags
      html = html.replace(
        /<meta name="twitter:title" content="[^"]*"/,
        `<meta name="twitter:title" content="${escapedTitle}"`
      );
      html = html.replace(
        /<meta name="twitter:description" content="[^"]*"/,
        `<meta name="twitter:description" content="${escapedDescription}"`
      );

      // Update canonical URL from static SEO config to avoid reflecting request-derived paths
      const escapedUrl = escapeHtmlAttribute(seo.canonicalUrl);
      html = html.replace(
        /<link rel="canonical" href="[^"]*"/,
        `<link rel="canonical" href="${escapedUrl}"`
      );
      html = html.replace(
        /<meta property="og:url" content="[^"]*"/,
        `<meta property="og:url" content="${escapedUrl}"`
      );
    }

    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
