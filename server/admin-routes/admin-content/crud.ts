import type { Express, Response } from "express";
import { managedLanguages, insertManagedLanguageSchema, badgeCatalog, insertBadgeCatalogSchema, broadcastNotifications, insertBroadcastNotificationSchema, userBadges, users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { getBadgeEntitlementForUser, getBadgeEntitlementsForUsers } from "../../lib/user-badge-entitlements";

const DEFAULT_TRUST_BADGES = [
  {
    name: "Trusted Seed",
    nameAr: "بذرة الثقة",
    description: "Starter trust badge for new reliable traders.",
    descriptionAr: "شارة بداية الثقة للمتداولين الجدد الموثوقين.",
    iconName: "Shield",
    color: "#10b981",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 1,
    p2pMonthlyLimit: "5000.00",
    challengeMaxAmount: "150.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 100,
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "Trusted Bronze",
    nameAr: "الثقة البرونزية",
    description: "Bronze trust level with higher monthly trading room.",
    descriptionAr: "مستوى الثقة البرونزي مع مساحة تداول شهرية أعلى.",
    iconName: "Medal",
    color: "#b45309",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 2,
    p2pMonthlyLimit: "10000.00",
    challengeMaxAmount: "300.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 200,
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "Trusted Silver",
    nameAr: "الثقة الفضية",
    description: "Silver trust level for consistent platform users.",
    descriptionAr: "مستوى الثقة الفضي للمستخدمين المنتظمين.",
    iconName: "BadgeCheck",
    color: "#64748b",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 3,
    p2pMonthlyLimit: "25000.00",
    challengeMaxAmount: "750.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 300,
    sortOrder: 3,
    isActive: true,
  },
  {
    name: "Trusted Gold",
    nameAr: "الثقة الذهبية",
    description: "Gold trust level with stronger P2P capacity.",
    descriptionAr: "مستوى الثقة الذهبي بسعة أكبر في تداول P2P.",
    iconName: "Award",
    color: "#f59e0b",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 4,
    p2pMonthlyLimit: "50000.00",
    challengeMaxAmount: "1500.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 400,
    sortOrder: 4,
    isActive: true,
  },
  {
    name: "Elite Trader",
    nameAr: "المتداول النخبوي",
    description: "Elite tier unlocked for high-trust members.",
    descriptionAr: "فئة النخبة للأعضاء ذوي الثقة العالية.",
    iconName: "Crown",
    color: "#ef4444",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 5,
    p2pMonthlyLimit: "75000.00",
    challengeMaxAmount: "2500.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 500,
    sortOrder: 5,
    isActive: true,
  },
  {
    name: "Platinum Vault",
    nameAr: "الخزنة البلاتينية",
    description: "Platinum tier for premium trusted traders.",
    descriptionAr: "الفئة البلاتينية للمتداولين الموثوقين المميزين.",
    iconName: "Gem",
    color: "#06b6d4",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 6,
    p2pMonthlyLimit: "100000.00",
    challengeMaxAmount: "4000.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 600,
    sortOrder: 6,
    isActive: true,
  },
  {
    name: "Diamond Trust",
    nameAr: "الثقة الماسية",
    description: "Diamond-level trust with expanded challenge cap.",
    descriptionAr: "ثقة بمستوى الماس مع حد تحديات أعلى.",
    iconName: "Diamond",
    color: "#0284c7",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 7,
    p2pMonthlyLimit: "150000.00",
    challengeMaxAmount: "7000.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 700,
    sortOrder: 7,
    isActive: true,
  },
  {
    name: "Master Merchant",
    nameAr: "التاجر المتمكن",
    description: "Master tier for top-performing market participants.",
    descriptionAr: "فئة الماستر لأفضل المشاركين في السوق.",
    iconName: "Trophy",
    color: "#7c3aed",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 8,
    p2pMonthlyLimit: "250000.00",
    challengeMaxAmount: "12000.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 800,
    sortOrder: 8,
    isActive: true,
  },
  {
    name: "Grand Commander",
    nameAr: "القائد الكبير",
    description: "High authority trust tier with major limits.",
    descriptionAr: "فئة ثقة عالية الصلاحية بحدود كبيرة.",
    iconName: "ShieldCheck",
    color: "#be123c",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 9,
    p2pMonthlyLimit: "350000.00",
    challengeMaxAmount: "18000.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 900,
    sortOrder: 9,
    isActive: true,
  },
  {
    name: "Royal Legend",
    nameAr: "الأسطورة الملكية",
    description: "Top trust tier with maximum badge privileges.",
    descriptionAr: "أعلى فئة ثقة بامتيازات الشارة القصوى.",
    iconName: "Crown",
    color: "#1d4ed8",
    category: "trust",
    requirement: "Manual trust assignment",
    level: 10,
    p2pMonthlyLimit: "500000.00",
    challengeMaxAmount: "25000.00",
    grantsP2pPrivileges: true,
    showOnProfile: true,
    points: 1000,
    sortOrder: 10,
    isActive: true,
  },
] as const;

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

  app.post("/api/admin/badges/initialize", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const existing = await db
        .select({ name: badgeCatalog.name })
        .from(badgeCatalog);

      const existingNames = new Set(existing.map((row) => row.name.trim().toLowerCase()));
      const toInsert = DEFAULT_TRUST_BADGES.filter((badge) => !existingNames.has(badge.name.trim().toLowerCase()));

      if (toInsert.length > 0) {
        await db.insert(badgeCatalog).values(toInsert);
      }

      await logAdminAction(req.admin!.id, "settings_change", "badge_catalog", "seed_defaults", {
        newValue: JSON.stringify({
          insertedCount: toInsert.length,
          skippedCount: DEFAULT_TRUST_BADGES.length - toInsert.length,
          totalDefaults: DEFAULT_TRUST_BADGES.length,
        }),
      }, req);

      res.json({
        success: true,
        insertedCount: toInsert.length,
        skippedCount: DEFAULT_TRUST_BADGES.length - toInsert.length,
        totalDefaults: DEFAULT_TRUST_BADGES.length,
      });
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
