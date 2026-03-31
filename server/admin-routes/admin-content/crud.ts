import type { Express, Response } from "express";
import { managedLanguages, insertManagedLanguageSchema, badgeCatalog, insertBadgeCatalogSchema, broadcastNotifications, insertBroadcastNotificationSchema, users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerContentCrudRoutes(app: Express) {

  // ==================== MANAGED LANGUAGES ====================

  app.get("/api/admin/languages", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const languages = await db.select().from(managedLanguages).orderBy(managedLanguages.name);
      res.json(languages);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/languages", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = insertManagedLanguageSchema.parse(req.body);
      const [language] = await db.insert(managedLanguages).values(data).returning();

      await logAdminAction(req.admin!.id, "settings_change", "managed_language", language.id, {
        newValue: JSON.stringify(data)
      }, req);

      res.json(language);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/languages/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, nativeName, direction, isDefault, isActive, translations } = req.body;

      const [existing] = await db.select().from(managedLanguages).where(eq(managedLanguages.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Language not found" });
      }

      if (isDefault === true) {
        await db.update(managedLanguages).set({ isDefault: false });
      }

      const [updated] = await db.update(managedLanguages)
        .set({ 
          name: name ?? existing.name,
          nativeName: nativeName ?? existing.nativeName,
          direction: direction ?? existing.direction,
          isDefault: isDefault ?? existing.isDefault,
          isActive: isActive ?? existing.isActive,
          translations: translations ?? existing.translations,
          updatedAt: new Date()
        })
        .where(eq(managedLanguages.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "managed_language", id, {
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated)
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/languages/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existing] = await db.select().from(managedLanguages).where(eq(managedLanguages.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Language not found" });
      }

      if (existing.isDefault) {
        return res.status(400).json({ error: "Cannot delete default language" });
      }

      await db.delete(managedLanguages).where(eq(managedLanguages.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "managed_language", id, {
        previousValue: JSON.stringify(existing),
        reason: "Language deleted"
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== BADGE CATALOG ====================

  app.get("/api/admin/badges", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const badges = await db.select().from(badgeCatalog).orderBy(badgeCatalog.sortOrder, badgeCatalog.name);
      res.json(badges);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/badges", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = insertBadgeCatalogSchema.parse(req.body);
      const [badge] = await db.insert(badgeCatalog).values(data).returning();

      await logAdminAction(req.admin!.id, "settings_change", "badge_catalog", badge.id, {
        newValue: JSON.stringify(data)
      }, req);

      res.json(badge);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/badges/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [existing] = await db.select().from(badgeCatalog).where(eq(badgeCatalog.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Badge not found" });
      }

      const [updated] = await db.update(badgeCatalog)
        .set({
          name: updates.name ?? existing.name,
          nameAr: updates.nameAr ?? existing.nameAr,
          description: updates.description ?? existing.description,
          descriptionAr: updates.descriptionAr ?? existing.descriptionAr,
          iconUrl: updates.iconUrl ?? existing.iconUrl,
          iconName: updates.iconName ?? existing.iconName,
          color: updates.color ?? existing.color,
          category: updates.category ?? existing.category,
          requirement: updates.requirement ?? existing.requirement,
          points: updates.points ?? existing.points,
          isActive: updates.isActive ?? existing.isActive,
          sortOrder: updates.sortOrder ?? existing.sortOrder
        })
        .where(eq(badgeCatalog.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "settings_change", "badge_catalog", id, {
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated)
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/badges/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existing] = await db.select().from(badgeCatalog).where(eq(badgeCatalog.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Badge not found" });
      }

      await db.delete(badgeCatalog).where(eq(badgeCatalog.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "badge_catalog", id, {
        previousValue: JSON.stringify(existing),
        reason: "Badge deleted"
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== BROADCAST NOTIFICATIONS ====================

  app.get("/api/admin/broadcast-notifications", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const broadcasts = await db.select().from(broadcastNotifications).orderBy(desc(broadcastNotifications.sentAt)).limit(100);
      res.json(broadcasts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/broadcast-notifications", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = insertBroadcastNotificationSchema.parse(req.body);
      const [broadcast] = await db.insert(broadcastNotifications).values({
        ...data,
        sentBy: req.admin!.id
      }).returning();

      if (data.targetType === "all") {
        const allUsers = await db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
        const broadcastData = data as Record<string, unknown>;
        for (const user of allUsers) {
          await sendNotification(user.id, {
            type: "announcement",
            title: data.title,
            titleAr: (broadcastData.titleAr as string) || data.title,
            message: data.content,
            messageAr: (broadcastData.contentAr as string) || data.content,
            metadata: JSON.stringify({ broadcastId: broadcast.id }),
            link: '/notifications',
          });
        }
      } else if (data.targetType === "user" && data.targetValue) {
        const broadcastData = data as Record<string, unknown>;
        await sendNotification(data.targetValue, {
          type: "announcement",
          title: data.title,
          titleAr: (broadcastData.titleAr as string) || data.title,
          message: data.content,
          messageAr: (broadcastData.contentAr as string) || data.content,
          metadata: JSON.stringify({ broadcastId: broadcast.id }),
          link: '/notifications',
        });
      }

      await logAdminAction(req.admin!.id, "settings_change", "broadcast_notification", broadcast.id, {
        newValue: JSON.stringify({ title: data.title, targetType: data.targetType })
      }, req);

      res.json(broadcast);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
