import type { Express, Request, Response } from "express";
import { featureFlags, themes, appSettings, insertAppSettingSchema } from "@shared/schema";
import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerAppSettingsRoutes(app: Express) {

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
        theme: activeTheme[0] || null
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
