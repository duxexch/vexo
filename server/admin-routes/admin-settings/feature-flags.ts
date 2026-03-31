import type { Express, Response } from "express";
import { featureFlags, insertFeatureFlagSchema, themes } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerFeatureFlagsRoutes(app: Express) {

  app.get("/api/admin/feature-flags", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const flags = await db.select().from(featureFlags).orderBy(featureFlags.sortOrder);
      res.json(flags);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/feature-flags", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const data = insertFeatureFlagSchema.parse(req.body);
      const [flag] = await db.insert(featureFlags).values({
        ...data,
        updatedBy: req.admin!.id
      }).returning();
      
      await logAdminAction(req.admin!.id, "section_toggle", "feature_flag", flag.id, {
        newValue: JSON.stringify(data)
      }, req);
      
      res.json(flag);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/feature-flags/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { isEnabled } = req.body;
      
      const [existing] = await db.select().from(featureFlags).where(eq(featureFlags.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Feature flag not found" });
      }
      
      const [updated] = await db.update(featureFlags)
        .set({ isEnabled, updatedBy: req.admin!.id, updatedAt: new Date() })
        .where(eq(featureFlags.id, id))
        .returning();
      
      await logAdminAction(req.admin!.id, "section_toggle", "feature_flag", id, {
        previousValue: String(existing.isEnabled),
        newValue: String(isEnabled)
      }, req);
      
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Seed default feature flags and themes
  app.post("/api/admin/seed-defaults", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const defaultFlags = [
        { key: "dashboard", name: "Dashboard", nameAr: "لوحة التحكم", icon: "LayoutDashboard", sortOrder: 1 },
        { key: "wallet", name: "Wallet", nameAr: "المحفظة", icon: "Wallet", sortOrder: 2 },
        { key: "challenges", name: "Challenges", nameAr: "التحديات", icon: "Swords", sortOrder: 3 },
        { key: "play", name: "Play Games", nameAr: "العب الألعاب", icon: "Play", sortOrder: 4 },
        { key: "p2p", name: "P2P Trading", nameAr: "تداول P2P", icon: "ArrowLeftRight", sortOrder: 5 },
        { key: "free", name: "Free Rewards", nameAr: "مكافآت مجانية", icon: "Gift", sortOrder: 6 },
        { key: "transactions", name: "Transactions", nameAr: "المعاملات", icon: "DollarSign", sortOrder: 7 },
        { key: "complaints", name: "Complaints", nameAr: "الشكاوى", icon: "AlertTriangle", sortOrder: 8 },
        { key: "settings", name: "Settings", nameAr: "الإعدادات", icon: "Settings", sortOrder: 9 },
        { key: "install-app", name: "Install App", nameAr: "تحميل التطبيق", icon: "Download", sortOrder: 10 },
      ];
      
      for (const flag of defaultFlags) {
        const existing = await db.select().from(featureFlags).where(eq(featureFlags.key, flag.key));
        if (existing.length === 0) {
          await db.insert(featureFlags).values({
            ...flag,
            isEnabled: true,
            category: "section",
            updatedBy: req.admin!.id
          });
        }
      }
      
      const defaultThemes = [
        {
          name: "vex-dark",
          displayName: "VEX Dark",
          primaryColor: "#00c853",
          secondaryColor: "#ff9800",
          accentColor: "#00bcd4",
          backgroundColor: "#0f1419",
          foregroundColor: "#ffffff",
          cardColor: "#1a1f26",
          mutedColor: "#6b7280",
          borderColor: "#2d3748",
          isDefault: true
        },
        {
          name: "midnight-blue",
          displayName: "Midnight Blue",
          primaryColor: "#3b82f6",
          secondaryColor: "#8b5cf6",
          accentColor: "#06b6d4",
          backgroundColor: "#0f172a",
          foregroundColor: "#f8fafc",
          cardColor: "#1e293b",
          mutedColor: "#64748b",
          borderColor: "#334155",
          isDefault: false
        },
        {
          name: "crimson-night",
          displayName: "Crimson Night",
          primaryColor: "#ef4444",
          secondaryColor: "#f97316",
          accentColor: "#eab308",
          backgroundColor: "#18181b",
          foregroundColor: "#fafafa",
          cardColor: "#27272a",
          mutedColor: "#71717a",
          borderColor: "#3f3f46",
          isDefault: false
        },
        {
          name: "emerald-forest",
          displayName: "Emerald Forest",
          primaryColor: "#10b981",
          secondaryColor: "#14b8a6",
          accentColor: "#22d3ee",
          backgroundColor: "#022c22",
          foregroundColor: "#ecfdf5",
          cardColor: "#064e3b",
          mutedColor: "#6ee7b7",
          borderColor: "#065f46",
          isDefault: false
        },
        {
          name: "royal-gold",
          displayName: "Royal Gold",
          primaryColor: "#f59e0b",
          secondaryColor: "#d97706",
          accentColor: "#fbbf24",
          backgroundColor: "#1c1917",
          foregroundColor: "#fef3c7",
          cardColor: "#292524",
          mutedColor: "#a8a29e",
          borderColor: "#44403c",
          isDefault: false
        }
      ];
      
      for (const theme of defaultThemes) {
        const existing = await db.select().from(themes).where(eq(themes.name, theme.name));
        if (existing.length === 0) {
          await db.insert(themes).values(theme);
        }
      }
      
      res.json({ message: "Default data seeded successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
