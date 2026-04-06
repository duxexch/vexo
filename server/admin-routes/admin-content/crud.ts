import type { Express, Response } from "express";
import { managedLanguages, insertManagedLanguageSchema, badgeCatalog, insertBadgeCatalogSchema, broadcastNotifications, insertBroadcastNotificationSchema, userBadges, users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { getBadgeEntitlementForUser, getBadgeEntitlementsForUsers } from "../../lib/user-badge-entitlements";

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
      const hasField = (key: string): boolean => Object.prototype.hasOwnProperty.call(updates ?? {}, key);

      const [existing] = await db.select().from(badgeCatalog).where(eq(badgeCatalog.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Badge not found" });
      }

      const [updated] = await db.update(badgeCatalog)
        .set({
          name: updates.name ?? existing.name,
          nameAr: hasField("nameAr") ? updates.nameAr : existing.nameAr,
          description: hasField("description") ? updates.description : existing.description,
          descriptionAr: hasField("descriptionAr") ? updates.descriptionAr : existing.descriptionAr,
          iconUrl: hasField("iconUrl") ? updates.iconUrl : existing.iconUrl,
          iconName: hasField("iconName") ? updates.iconName : existing.iconName,
          color: hasField("color") ? updates.color : existing.color,
          category: hasField("category") ? updates.category : existing.category,
          requirement: hasField("requirement") ? updates.requirement : existing.requirement,
          level: updates.level ?? existing.level,
          p2pMonthlyLimit: hasField("p2pMonthlyLimit") ? updates.p2pMonthlyLimit : existing.p2pMonthlyLimit,
          challengeMaxAmount: hasField("challengeMaxAmount") ? updates.challengeMaxAmount : existing.challengeMaxAmount,
          grantsP2pPrivileges: updates.grantsP2pPrivileges ?? existing.grantsP2pPrivileges,
          showOnProfile: updates.showOnProfile ?? existing.showOnProfile,
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

  app.get("/api/admin/badges/users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
        : 30;

      const baseCondition = eq(users.role, "player");
      const whereCondition = q
        ? and(
          baseCondition,
          or(
            ilike(users.username, `%${q}%`),
            ilike(users.nickname, `%${q}%`),
            ilike(users.accountId, `%${q}%`),
          ),
        )
        : baseCondition;

      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          nickname: users.nickname,
          accountId: users.accountId,
          profilePicture: users.profilePicture,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereCondition)
        .orderBy(desc(users.createdAt))
        .limit(limit);

      const entitlementsMap = await getBadgeEntitlementsForUsers(rows.map((row) => row.id));

      res.json(rows.map((row) => {
        const entitlements = entitlementsMap.get(row.id);
        return {
          ...row,
          badgeCount: entitlements?.badgeCount ?? 0,
          topBadge: entitlements?.topBadge ?? null,
        };
      }));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/badges/users/:userId/assigned", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const assignedBadges = await db
        .select({
          badgeId: badgeCatalog.id,
          name: badgeCatalog.name,
          nameAr: badgeCatalog.nameAr,
          iconUrl: badgeCatalog.iconUrl,
          iconName: badgeCatalog.iconName,
          color: badgeCatalog.color,
          category: badgeCatalog.category,
          level: badgeCatalog.level,
          points: badgeCatalog.points,
          earnedAt: userBadges.earnedAt,
        })
        .from(userBadges)
        .innerJoin(badgeCatalog, eq(userBadges.badgeId, badgeCatalog.id))
        .where(eq(userBadges.userId, userId))
        .orderBy(desc(badgeCatalog.level), desc(userBadges.earnedAt));

      const entitlements = await getBadgeEntitlementForUser(userId);

      res.json({
        userId,
        assignedBadges,
        entitlements,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/badges/assign", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const badgeId = typeof req.body?.badgeId === "string" ? req.body.badgeId.trim() : "";
      const replaceExisting = req.body?.replaceExisting !== false;

      if (!userId || !badgeId) {
        return res.status(400).json({ error: "userId and badgeId are required" });
      }

      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const [targetBadge] = await db
        .select({ id: badgeCatalog.id, name: badgeCatalog.name })
        .from(badgeCatalog)
        .where(eq(badgeCatalog.id, badgeId))
        .limit(1);

      if (!targetBadge) {
        return res.status(404).json({ error: "Badge not found" });
      }

      if (replaceExisting) {
        await db.delete(userBadges).where(eq(userBadges.userId, userId));
      }

      await db
        .insert(userBadges)
        .values({ userId, badgeId })
        .onConflictDoNothing();

      const entitlements = await getBadgeEntitlementForUser(userId);

      await logAdminAction(req.admin!.id, "settings_change", "user_badges", userId, {
        newValue: JSON.stringify({ userId, badgeId, replaceExisting, topBadge: entitlements.topBadge }),
      }, req);

      res.json({
        success: true,
        userId,
        badgeId,
        entitlements,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/badges/users/:userId/:badgeId", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { userId, badgeId } = req.params;

      await db.delete(userBadges).where(and(
        eq(userBadges.userId, userId),
        eq(userBadges.badgeId, badgeId),
      ));

      const entitlements = await getBadgeEntitlementForUser(userId);

      await logAdminAction(req.admin!.id, "settings_change", "user_badges", userId, {
        newValue: JSON.stringify({ userId, badgeId, action: "removed", topBadge: entitlements.topBadge }),
      }, req);

      res.json({
        success: true,
        userId,
        badgeId,
        entitlements,
      });
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
