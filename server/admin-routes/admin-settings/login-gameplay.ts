import type { Express, Response } from "express";
import { loginMethodConfigs, gameplaySettings } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerLoginGameplayRoutes(app: Express) {

  app.get("/api/admin/login-configs", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const configs = await db.select().from(loginMethodConfigs).orderBy(loginMethodConfigs.method);
      res.json(configs);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/login-configs/:method", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { method } = req.params;
      const { isEnabled, otpEnabled, otpLength, otpExpiryMinutes, settings } = req.body;

      const [existing] = await db.select().from(loginMethodConfigs).where(eq(loginMethodConfigs.method, method));
      
      if (!existing) {
        const [created] = await db.insert(loginMethodConfigs).values({
          method,
          isEnabled: isEnabled ?? false,
          otpEnabled: otpEnabled ?? false,
          otpLength: otpLength ?? 6,
          otpExpiryMinutes: otpExpiryMinutes ?? 5,
          settings,
          updatedBy: req.admin!.id
        }).returning();

        await logAdminAction(req.admin!.id, "settings_change", "login_method_config", created.id, {
          newValue: JSON.stringify({ method, isEnabled })
        }, req);

        return res.json(created);
      }

      const [updated] = await db.update(loginMethodConfigs)
        .set({ 
          isEnabled: isEnabled ?? existing.isEnabled,
          otpEnabled: otpEnabled ?? existing.otpEnabled,
          otpLength: otpLength ?? existing.otpLength,
          otpExpiryMinutes: otpExpiryMinutes ?? existing.otpExpiryMinutes,
          settings: settings ?? existing.settings,
          updatedBy: req.admin!.id,
          updatedAt: new Date()
        })
        .where(eq(loginMethodConfigs.method, method))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "login_method_config", updated.id, {
        previousValue: String(existing.isEnabled),
        newValue: String(isEnabled)
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/gameplay-settings", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const settings = await db.select().from(gameplaySettings);
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
