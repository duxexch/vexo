import type { Express, Request, Response } from "express";
import { themes } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerThemesRoutes(app: Express) {

  app.get("/api/admin/themes", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const themesList = await db.select().from(themes);
      res.json(themesList);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/themes", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { name, primaryColor, secondaryColor, backgroundColor, accentColor, isActive } = req.body;
      const displayName = req.body.nameAr || req.body.displayName || name;
      const [theme] = await db.insert(themes).values({ 
        name, 
        displayName,
        primaryColor, 
        secondaryColor, 
        backgroundColor, 
        foregroundColor: req.body.textColor || req.body.foregroundColor || '#ffffff',
        accentColor, 
        cardColor: req.body.cardColor || backgroundColor,
        mutedColor: req.body.mutedColor || '#888888',
        borderColor: req.body.borderColor || '#333333',
        isActive,
      }).returning();
      res.json(theme);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/themes/:id/activate", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.update(themes).set({ isDefault: false });
      const [updated] = await db.update(themes)
        .set({ isDefault: true })
        .where(eq(themes.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Theme not found" });
      }
      
      await logAdminAction(req.admin!.id, "theme_change", "theme", id, {
        newValue: updated.name
      }, req);
      
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/themes/public", async (req: Request, res: Response) => {
    try {
      const themesList = await db.select().from(themes);
      res.json(themesList);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
