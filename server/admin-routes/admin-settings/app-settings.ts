import type { Express, Request, Response } from "express";
import { getCanonicalOrigin } from "@shared/runtime-config";
import { featureFlags, themes, appSettings, insertAppSettingSchema } from "@shared/schema";
import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { getPublicRtcSettingsFromEnv } from "../../lib/public-rtc";
import { invalidateRuntimeSeoCache } from "../../static";
import fs from "fs";
import path from "path";

const SEO_SETTINGS_KEYS = [
  "seo_site_title",
  "seo_site_description",
  "seo_site_keywords",
  "seo_og_title",
  "seo_og_description",
  "seo_og_image",
  "seo_og_type",
  "seo_canonical_url",
  "seo_robots_content",
  "seo_enable_sitemap",
  "seo_google_analytics_id",
  "seo_facebook_pixel_id",
  "seo_twitter_handle",
  "seo_facebook_url",
  "seo_instagram_url",
  "seo_json_ld_enabled",
  "seo_organization_name",
  "seo_organization_logo",
  "seo_locale_overrides",
] as const;

type SeoSettingsResponse = {
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  canonicalUrl: string;
  robotsContent: string;
  enableSitemap: boolean;
  googleAnalyticsId: string;
  facebookPixelId: string;
  twitterHandle: string;
  facebookUrl: string;
  instagramUrl: string;
  jsonLdEnabled: boolean;
  organizationName: string;
  organizationLogo: string;
  localeOverrides: Record<string, Record<string, string>>;
};

const DEFAULT_SEO_SETTINGS: SeoSettingsResponse = {
  siteTitle: "",
  siteDescription: "",
  siteKeywords: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  ogType: "website",
  canonicalUrl: `${getCanonicalOrigin()}/`,
  robotsContent: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  enableSitemap: true,
  googleAnalyticsId: "",
  facebookPixelId: "",
  twitterHandle: "",
  facebookUrl: "",
  instagramUrl: "",
  jsonLdEnabled: true,
  organizationName: "VEX",
  organizationLogo: `${getCanonicalOrigin()}/icons/vex-gaming-logo-512x512.png`,
  localeOverrides: {},
};

function parseLocaleOverrides(raw: string | null | undefined): Record<string, Record<string, string>> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const normalized: Record<string, Record<string, string>> = {};
    for (const [locale, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;

      const localeMap: Record<string, string> = {};
      for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof fieldValue === "string") {
          localeMap[field] = fieldValue;
        }
      }

      if (Object.keys(localeMap).length > 0) {
        normalized[locale.toLowerCase()] = localeMap;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function buildSeoSettingsResponse(settingsRows: Array<{ key: string; value: string | null }>): SeoSettingsResponse {
  const map = settingsRows.reduce<Record<string, string>>((acc, row) => {
    if (row.value !== null) {
      acc[row.key] = row.value;
    }
    return acc;
  }, {});

  return {
    siteTitle: map.seo_site_title ?? DEFAULT_SEO_SETTINGS.siteTitle,
    siteDescription: map.seo_site_description ?? DEFAULT_SEO_SETTINGS.siteDescription,
    siteKeywords: map.seo_site_keywords ?? DEFAULT_SEO_SETTINGS.siteKeywords,
    ogTitle: map.seo_og_title ?? DEFAULT_SEO_SETTINGS.ogTitle,
    ogDescription: map.seo_og_description ?? DEFAULT_SEO_SETTINGS.ogDescription,
    ogImage: map.seo_og_image ?? DEFAULT_SEO_SETTINGS.ogImage,
    ogType: map.seo_og_type ?? DEFAULT_SEO_SETTINGS.ogType,
    canonicalUrl: map.seo_canonical_url ?? DEFAULT_SEO_SETTINGS.canonicalUrl,
    robotsContent: map.seo_robots_content ?? DEFAULT_SEO_SETTINGS.robotsContent,
    enableSitemap: (map.seo_enable_sitemap ?? "true") !== "false",
    googleAnalyticsId: map.seo_google_analytics_id ?? DEFAULT_SEO_SETTINGS.googleAnalyticsId,
    facebookPixelId: map.seo_facebook_pixel_id ?? DEFAULT_SEO_SETTINGS.facebookPixelId,
    twitterHandle: map.seo_twitter_handle ?? DEFAULT_SEO_SETTINGS.twitterHandle,
    facebookUrl: map.seo_facebook_url ?? DEFAULT_SEO_SETTINGS.facebookUrl,
    instagramUrl: map.seo_instagram_url ?? DEFAULT_SEO_SETTINGS.instagramUrl,
    jsonLdEnabled: (map.seo_json_ld_enabled ?? "true") !== "false",
    organizationName: map.seo_organization_name ?? DEFAULT_SEO_SETTINGS.organizationName,
    organizationLogo: map.seo_organization_logo ?? DEFAULT_SEO_SETTINGS.organizationLogo,
    localeOverrides: parseLocaleOverrides(map.seo_locale_overrides),
  };
}

function resolveAdminAabFilePath(): string | null {
  const rootPath = process.cwd();
  const candidateDirs = [
    path.resolve(rootPath, "dist", "public", "downloads"),
    path.resolve(rootPath, "client", "public", "downloads"),
  ];

  for (const dirPath of candidateDirs) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    // Preferred: read manifest.json (written by refresh-android-binaries.sh)
    // for the exact current AAB filename. The manifest is the single source
    // of truth — bumping package.json -> version and re-running the refresh
    // script makes this resolver return the new VEX-<version>.aab without
    // any code change.
    const manifestPath = path.join(dirPath, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
          aabFile?: string;
        };
        if (manifest.aabFile) {
          const fromManifest = path.join(dirPath, manifest.aabFile);
          if (fs.existsSync(fromManifest)) {
            return fromManifest;
          }
        }
      } catch {
        // Manifest is corrupt — fall through to the discovery fallbacks.
      }
    }

    // Legacy fallback chain — covers installs that haven't run the
    // refresh script yet (no manifest), and the older `app.aab` /
    // `VEX-official-release.aab` filenames from previous releases.
    const legacyCanonical = path.join(dirPath, "app.aab");
    if (fs.existsSync(legacyCanonical)) {
      return legacyCanonical;
    }

    const legacyCi = path.join(dirPath, "VEX-official-release.aab");
    if (fs.existsSync(legacyCi)) {
      return legacyCi;
    }

    const fallback = fs
      .readdirSync(dirPath)
      .find((fileName) => fileName.toLowerCase().endsWith(".aab"));

    if (fallback) {
      return path.join(dirPath, fallback);
    }
  }

  return null;
}

export function registerAppSettingsRoutes(app: Express) {

  app.get("/api/admin/seo-settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const rows = await db.select({ key: appSettings.key, value: appSettings.value })
        .from(appSettings)
        .where(inArray(appSettings.key, [...SEO_SETTINGS_KEYS]));

      res.json(buildSeoSettingsResponse(rows));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/seo-settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const updates: Record<string, string> = {};

      const setString = (field: keyof Record<string, unknown>, key: string, maxLen: number) => {
        const value = payload[field];
        if (typeof value === "string") {
          updates[key] = value.trim().slice(0, maxLen);
        }
      };

      setString("siteTitle", "seo_site_title", 180);
      setString("siteDescription", "seo_site_description", 320);
      setString("siteKeywords", "seo_site_keywords", 1000);
      setString("ogTitle", "seo_og_title", 180);
      setString("ogDescription", "seo_og_description", 320);
      setString("ogImage", "seo_og_image", 500);
      setString("ogType", "seo_og_type", 32);
      setString("canonicalUrl", "seo_canonical_url", 500);
      setString("robotsContent", "seo_robots_content", 500);
      setString("googleAnalyticsId", "seo_google_analytics_id", 80);
      setString("facebookPixelId", "seo_facebook_pixel_id", 80);
      setString("twitterHandle", "seo_twitter_handle", 80);
      setString("facebookUrl", "seo_facebook_url", 500);
      setString("instagramUrl", "seo_instagram_url", 500);
      setString("organizationName", "seo_organization_name", 180);
      setString("organizationLogo", "seo_organization_logo", 500);

      if (typeof payload.enableSitemap === "boolean") {
        updates.seo_enable_sitemap = payload.enableSitemap ? "true" : "false";
      }

      if (typeof payload.jsonLdEnabled === "boolean") {
        updates.seo_json_ld_enabled = payload.jsonLdEnabled ? "true" : "false";
      }

      if (payload.localeOverrides && typeof payload.localeOverrides === "object" && !Array.isArray(payload.localeOverrides)) {
        updates.seo_locale_overrides = JSON.stringify(payload.localeOverrides);
      }

      const updateEntries = Object.entries(updates);
      if (updateEntries.length === 0) {
        return res.status(400).json({ error: "No valid SEO settings to update" });
      }

      for (const [key, value] of updateEntries) {
        const [existing] = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.key, key)).limit(1);

        if (existing) {
          await db.update(appSettings)
            .set({
              value,
              category: "seo",
              updatedBy: req.admin!.id,
              updatedAt: new Date(),
            })
            .where(eq(appSettings.key, key));
        } else {
          await db.insert(appSettings).values({
            key,
            value,
            category: "seo",
            updatedBy: req.admin!.id,
          });
        }
      }

      await logAdminAction(req.admin!.id, "settings_update", "seo_settings", "global", {
        metadata: JSON.stringify({ updatedKeys: updateEntries.map(([key]) => key) }),
      }, req);

      invalidateRuntimeSeoCache();

      const rows = await db.select({ key: appSettings.key, value: appSettings.value })
        .from(appSettings)
        .where(inArray(appSettings.key, [...SEO_SETTINGS_KEYS]));

      return res.json(buildSeoSettingsResponse(rows));
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public settings for user app
  app.get("/api/settings/public", async (req: Request, res: Response) => {
    try {
      const [flagsList, activeTheme] = await Promise.all([
        db.select().from(featureFlags),
        db.select().from(themes).where(eq(themes.isDefault, true)).limit(1)
      ]);

      const enabledSections: Record<string, boolean> = {};
      flagsList.forEach(flag => {
        enabledSections[flag.key] = flag.isEnabled;
      });

      res.json({
        sections: enabledSections,
        theme: activeTheme[0] || null,
        rtc: getPublicRtcSettingsFromEnv(),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/settings/store-links", async (req: Request, res: Response) => {
    try {
      const storeKeys = [
        "store_google_play_url",
        "store_apple_url",
        "store_show_pwa",
        "store_show_google_play",
        "store_show_apple",
      ];
      const settings = await db.select().from(appSettings)
        .where(inArray(appSettings.key, storeKeys));

      const result: Record<string, string | null> = {};
      for (const s of settings) {
        result[s.key] = s.value;
      }
      if (!result.store_show_pwa) result.store_show_pwa = "true";
      if (!result.store_show_google_play) result.store_show_google_play = "true";
      if (!result.store_show_apple) result.store_show_apple = "true";

      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin app settings CRUD
  app.get("/api/admin/app-settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const settings = await db.select().from(appSettings).orderBy(appSettings.key);
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/downloads/aab", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const filePath = resolveAdminAabFilePath();
      if (!filePath) {
        return res.status(404).json({ error: "AAB file not found" });
      }

      const fileName = path.basename(filePath);
      await logAdminAction(
        req.admin!.id,
        "settings_update",
        "admin_download",
        fileName,
        { metadata: JSON.stringify({ downloadType: "aab" }) },
        req,
      );

      return res.download(filePath, fileName);
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/app-settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = insertAppSettingSchema.parse(req.body);
      const [setting] = await db.insert(appSettings).values({
        ...data,
        updatedBy: req.admin!.id
      }).returning();

      await logAdminAction(req.admin!.id, "settings_change", "app_setting", setting.id, {
        newValue: JSON.stringify(data)
      }, req);

      res.json(setting);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/app-settings/:key", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { key } = req.params;
      const { value, valueAr, category } = req.body;

      const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key));

      if (!existing) {
        const [created] = await db.insert(appSettings).values({
          key,
          value,
          valueAr,
          category,
          updatedBy: req.admin!.id
        }).returning();

        await logAdminAction(req.admin!.id, "settings_change", "app_setting", created.id, {
          newValue: value
        }, req);

        return res.json(created);
      }

      const [updated] = await db.update(appSettings)
        .set({ value, valueAr, category, updatedBy: req.admin!.id, updatedAt: new Date() })
        .where(eq(appSettings.key, key))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "app_setting", updated.id, {
        previousValue: existing.value || "",
        newValue: value
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
