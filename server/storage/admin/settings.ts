import {
  systemSettings, systemConfig,
  type SystemSetting, type InsertSystemSetting,
  type SystemConfig as SystemConfigType, type InsertSystemConfig,
} from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

// ==================== SYSTEM SETTINGS ====================

export async function getSetting(key: string): Promise<SystemSetting | undefined> {
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  return setting || undefined;
}

export async function setSetting(key: string, value: string, category?: string): Promise<SystemSetting> {
  const existing = await getSetting(key);
  if (existing) {
    const [updated] = await db.update(systemSettings)
      .set({ value, category, updatedAt: new Date() })
      .where(eq(systemSettings.key, key))
      .returning();
    return updated;
  }
  const [created] = await db.insert(systemSettings).values({ key, value, category }).returning();
  return created;
}

export async function getSettingsByCategory(category: string): Promise<SystemSetting[]> {
  return db.select().from(systemSettings).where(eq(systemSettings.category, category));
}

// ==================== SYSTEM CONFIG ====================

export async function getSystemConfig(key: string): Promise<SystemConfigType | undefined> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  return config || undefined;
}

export async function setSystemConfig(key: string, value: string, updatedBy?: string): Promise<SystemConfigType> {
  const existing = await getSystemConfig(key);
  
  if (existing) {
    const [updated] = await db.update(systemConfig)
      .set({
        value,
        version: sql`${systemConfig.version} + 1`,
        updatedAt: new Date(),
        updatedBy: updatedBy || null
      })
      .where(eq(systemConfig.key, key))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(systemConfig).values({
      key,
      value,
      version: 1,
      updatedBy
    }).returning();
    return created;
  }
}

export async function getConfigVersion(key: string): Promise<number> {
  const config = await getSystemConfig(key);
  return config?.version || 0;
}
