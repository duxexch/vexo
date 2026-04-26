import { sql } from "drizzle-orm";
import { db } from "../db";
import { themes, featureFlags } from "@shared/schema";
import { logger } from "../lib/logger";

export function runDatabaseSeeds(): void {
  // One-time backfill: existing users (created before mandatory username flow)
  // get usernameSelectedAt = NOW() so they're not blocked by the gate.
  // Users with placeholder usernames like "player_<accountId>" are LEFT NULL
  // so they go through the new selection flow on next login.
  (async () => {
    try {
      await db.execute(sql`
        UPDATE users
        SET username_selected_at = NOW()
        WHERE username_selected_at IS NULL
          AND username IS NOT NULL
          AND username NOT LIKE 'player\\_%' ESCAPE '\\'
      `);
    } catch (error) {
      logger.error(
        "Failed to backfill username_selected_at",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  })();

  // Seed default themes if none exist (Task #195 — ship 4 editable presets).
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
            destructiveColor: "#ef4444",
            mode: "dark",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.25rem",
            radiusMd: "0.5rem",
            radiusLg: "0.75rem",
            shadowIntensity: "medium",
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
            destructiveColor: "#f43f5e",
            mode: "dark",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.375rem",
            radiusMd: "0.625rem",
            radiusLg: "1rem",
            shadowIntensity: "strong",
            isDefault: false,
          },
          {
            name: "vex-light",
            displayName: "VEX Light",
            primaryColor: "#0ea5e9",
            secondaryColor: "#f97316",
            accentColor: "#22c55e",
            backgroundColor: "#fafafa",
            foregroundColor: "#0f172a",
            cardColor: "#ffffff",
            mutedColor: "#64748b",
            borderColor: "#e2e8f0",
            destructiveColor: "#dc2626",
            mode: "light",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.25rem",
            radiusMd: "0.5rem",
            radiusLg: "0.75rem",
            shadowIntensity: "soft",
            isDefault: false,
          },
          {
            name: "vex-sunset",
            displayName: "VEX Sunset",
            primaryColor: "#f97316",
            secondaryColor: "#ec4899",
            accentColor: "#facc15",
            backgroundColor: "#1c1410",
            foregroundColor: "#fff7ed",
            cardColor: "#2a1d17",
            mutedColor: "#d6a48c",
            borderColor: "#7c2d12",
            destructiveColor: "#b91c1c",
            mode: "dark",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.5rem",
            radiusMd: "0.875rem",
            radiusLg: "1.25rem",
            shadowIntensity: "strong",
            isDefault: false,
          },
        ]);
        logger.info("Default themes seeded");
      } else {
        const existingNames = new Set(
          (await db.select({ name: themes.name }).from(themes)).map((row) => row.name),
        );
        const additions: Array<typeof themes.$inferInsert> = [];
        if (!existingNames.has("vex-light")) {
          additions.push({
            name: "vex-light",
            displayName: "VEX Light",
            primaryColor: "#0ea5e9",
            secondaryColor: "#f97316",
            accentColor: "#22c55e",
            backgroundColor: "#fafafa",
            foregroundColor: "#0f172a",
            cardColor: "#ffffff",
            mutedColor: "#64748b",
            borderColor: "#e2e8f0",
            destructiveColor: "#dc2626",
            mode: "light",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.25rem",
            radiusMd: "0.5rem",
            radiusLg: "0.75rem",
            shadowIntensity: "soft",
            isDefault: false,
          });
        }
        if (!existingNames.has("vex-sunset")) {
          additions.push({
            name: "vex-sunset",
            displayName: "VEX Sunset",
            primaryColor: "#f97316",
            secondaryColor: "#ec4899",
            accentColor: "#facc15",
            backgroundColor: "#1c1410",
            foregroundColor: "#fff7ed",
            cardColor: "#2a1d17",
            mutedColor: "#d6a48c",
            borderColor: "#7c2d12",
            destructiveColor: "#b91c1c",
            mode: "dark",
            fontHeading: "Poppins",
            fontBody: "Poppins",
            radiusSm: "0.5rem",
            radiusMd: "0.875rem",
            radiusLg: "1.25rem",
            shadowIntensity: "strong",
            isDefault: false,
          });
        }
        if (additions.length > 0) {
          await db.insert(themes).values(additions);
          logger.info(`Topped up themes table with ${additions.length} additional preset(s)`);
        }

        await db.execute(sql`
          UPDATE themes
          SET mode = COALESCE(mode, 'dark'),
              font_heading = COALESCE(font_heading, 'Poppins'),
              font_body = COALESCE(font_body, 'Poppins'),
              radius_sm = COALESCE(radius_sm, '0.25rem'),
              radius_md = COALESCE(radius_md, '0.5rem'),
              radius_lg = COALESCE(radius_lg, '0.75rem'),
              shadow_intensity = COALESCE(shadow_intensity, 'medium'),
              destructive_color = COALESCE(destructive_color, '#ef4444')
          WHERE name IN ('vex-dark', 'vex-royal')
        `);
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
