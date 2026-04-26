import type { Express, Request, Response } from "express";
import { themes } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

// Whitelist of fields that the admin can patch on a theme. Keeps id/createdAt
// and `isDefault` (managed exclusively by /activate) out of the update path.
const PATCHABLE_THEME_FIELDS = [
  "displayName",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "foregroundColor",
  "cardColor",
  "mutedColor",
  "borderColor",
  "mode",
  "fontHeading",
  "fontBody",
  "radiusSm",
  "radiusMd",
  "radiusLg",
  "shadowIntensity",
  "isActive",
] as const;

type PatchableThemeField = (typeof PATCHABLE_THEME_FIELDS)[number];

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
        mode: req.body.mode ?? null,
        fontHeading: req.body.fontHeading ?? null,
        fontBody: req.body.fontBody ?? null,
        radiusSm: req.body.radiusSm ?? null,
        radiusMd: req.body.radiusMd ?? null,
        radiusLg: req.body.radiusLg ?? null,
        shadowIntensity: req.body.shadowIntensity ?? null,
        isActive,
      }).returning();
      res.json(theme);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Task #195 — full-edit endpoint. Accepts any subset of PATCHABLE_THEME_FIELDS.
  app.patch("/api/admin/themes/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates: Partial<Record<PatchableThemeField, unknown>> = {};
      for (const field of PATCHABLE_THEME_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          updates[field] = req.body[field];
        }
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No editable fields supplied" });
      }
      const [updated] = await db.update(themes)
        .set(updates as Record<string, unknown>)
        .where(eq(themes.id, id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Theme not found" });
      }
      await logAdminAction(req.admin!.id, "theme_change", "theme", id, {
        newValue: JSON.stringify(updates),
      }, req);
      res.json(updated);
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

  // Task #195 — public endpoint that returns the currently-default theme so the
  // ThemeProvider on the client can hydrate CSS variables on boot.
  app.get("/api/themes/active", async (req: Request, res: Response) => {
    try {
      const [active] = await db.select().from(themes).where(eq(themes.isDefault, true)).limit(1);
      if (!active) {
        return res.status(404).json({ error: "No default theme configured" });
      }
      res.json(active);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
