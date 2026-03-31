import { db } from "../db";
import { themes, featureFlags } from "@shared/schema";
import { logger } from "../lib/logger";

export function runDatabaseSeeds(): void {
  // Seed default themes if none exist
  (async () => {
    try {
      const existingThemes = await db.select().from(themes).limit(1);
      if (existingThemes.length === 0) {
        await db.insert(themes).values([
          {
            name: "vex-dark",
            displayName: "VEX Dark (Default)",
            primaryColor: "#00c853",
            secondaryColor: "#ff9800",
            accentColor: "#00e676",
            backgroundColor: "#0f1419",
            foregroundColor: "#ffffff",
            cardColor: "#1a1f2e",
            mutedColor: "#6b7280",
            borderColor: "#2d3748",
            isDefault: true,
          },
          {
            name: "vex-royal",
            displayName: "VEX Royal",
            primaryColor: "#6366f1",
            secondaryColor: "#f59e0b",
            accentColor: "#8b5cf6",
            backgroundColor: "#0c0a1d",
            foregroundColor: "#ffffff",
            cardColor: "#1e1b4b",
            mutedColor: "#9ca3af",
            borderColor: "#312e81",
            isDefault: false,
          },
        ]);
        logger.info("Default themes seeded");
      }
    } catch (error) {
      logger.error('Failed to seed themes', error instanceof Error ? error : new Error(String(error)));
    }
  })();

  // Seed default feature flags if none exist
  (async () => {
    try {
      const existingFlags = await db.select().from(featureFlags).limit(1);
      if (existingFlags.length === 0) {
        await db.insert(featureFlags).values([
          { key: "dashboard", name: "Dashboard", nameAr: "لوحة التحكم", isEnabled: true, category: "section", sortOrder: 1, icon: "LayoutDashboard", description: "Main dashboard and overview", descriptionAr: "لوحة التحكم الرئيسية والنظرة العامة" },
          { key: "wallet", name: "Wallet", nameAr: "المحفظة", isEnabled: true, category: "section", sortOrder: 2, icon: "Wallet", description: "Wallet management and transactions", descriptionAr: "إدارة المحفظة والمعاملات" },
          { key: "challenges", name: "Challenges", nameAr: "التحديات", isEnabled: true, category: "section", sortOrder: 3, icon: "Swords", description: "Multiplayer challenges and competitions", descriptionAr: "التحديات والمنافسات متعددة اللاعبين" },
          { key: "play", name: "Play Games", nameAr: "العب الألعاب", isEnabled: true, category: "section", sortOrder: 4, icon: "Play", description: "Access to games and entertainment", descriptionAr: "الوصول للألعاب والترفيه" },
          { key: "p2p", name: "P2P Trading", nameAr: "تداول P2P", isEnabled: true, category: "section", sortOrder: 5, icon: "ArrowLeftRight", description: "Peer-to-peer trading marketplace", descriptionAr: "سوق التداول بين الأفراد" },
          { key: "free", name: "Free Rewards", nameAr: "مكافآت مجانية", isEnabled: true, category: "section", sortOrder: 6, icon: "Gift", description: "Free rewards and bonuses", descriptionAr: "المكافآت والهدايا المجانية" },
          { key: "transactions", name: "Transactions", nameAr: "المعاملات", isEnabled: true, category: "section", sortOrder: 7, icon: "DollarSign", description: "Transaction history and records", descriptionAr: "سجل المعاملات والعمليات" },
          { key: "complaints", name: "Complaints", nameAr: "الشكاوى", isEnabled: true, category: "section", sortOrder: 8, icon: "AlertTriangle", description: "Submit and track complaints", descriptionAr: "تقديم ومتابعة الشكاوى" },
          { key: "support", name: "Support", nameAr: "الدعم", isEnabled: true, category: "section", sortOrder: 9, description: "Customer support contact methods", descriptionAr: "طرق التواصل مع الدعم الفني" },
          { key: "settings", name: "Settings", nameAr: "الإعدادات", isEnabled: true, category: "section", sortOrder: 10, icon: "Settings", description: "User settings and preferences", descriptionAr: "إعدادات وتفضيلات المستخدم" },
          { key: "install-app", name: "Install App", nameAr: "تحميل التطبيق", isEnabled: true, category: "section", sortOrder: 11, icon: "Download", description: "Install the app on your device", descriptionAr: "تثبيت التطبيق على جهازك" },
        ]);
        logger.info("Default feature flags seeded");
      }
    } catch (error) {
      logger.error('Failed to seed feature flags', error instanceof Error ? error : new Error(String(error)));
    }
  })();
}
