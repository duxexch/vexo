import {
  projectCurrencySettings,
  type ProjectCurrencySettings, type InsertProjectCurrencySettings,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// ==================== PROJECT CURRENCY SETTINGS ====================

export async function getProjectCurrencySettings(): Promise<ProjectCurrencySettings | undefined> {
  const [settings] = await db.select().from(projectCurrencySettings).limit(1);
  return settings || undefined;
}

export async function updateProjectCurrencySettings(data: Partial<InsertProjectCurrencySettings>): Promise<ProjectCurrencySettings> {
  const existing = await getProjectCurrencySettings();
  if (existing) {
    const [updated] = await db.update(projectCurrencySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectCurrencySettings.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(projectCurrencySettings).values(data as InsertProjectCurrencySettings).returning();
  return created;
}
