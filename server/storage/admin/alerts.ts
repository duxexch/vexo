import {
  adminAlerts,
  type AdminAlert, type InsertAdminAlert,
  type AdminAlertType, type AdminAlertSeverity,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql } from "drizzle-orm";

// ==================== ADMIN ALERTS ====================

export async function createAdminAlert(alert: InsertAdminAlert): Promise<AdminAlert> {
  const [created] = await db.insert(adminAlerts).values(alert).returning();
  return created;
}

export async function getAdminAlert(id: string): Promise<AdminAlert | undefined> {
  const [alert] = await db.select().from(adminAlerts).where(eq(adminAlerts.id, id));
  return alert || undefined;
}

export async function listAdminAlerts(options?: { unreadOnly?: boolean; type?: string; severity?: string; limit?: number }): Promise<AdminAlert[]> {
  const conditions = [];
  if (options?.unreadOnly) {
    conditions.push(eq(adminAlerts.isRead, false));
  }
  if (options?.type) {
    conditions.push(eq(adminAlerts.type, options.type as AdminAlertType));
  }
  if (options?.severity) {
    conditions.push(eq(adminAlerts.severity, options.severity as AdminAlertSeverity));
  }

  let query = db.select().from(adminAlerts);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  query = query.orderBy(desc(adminAlerts.createdAt)) as typeof query;
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  return query;
}

export async function markAdminAlertAsRead(id: string, readBy: string): Promise<AdminAlert | undefined> {
  const [updated] = await db.update(adminAlerts)
    .set({ isRead: true, readAt: new Date(), readBy })
    .where(eq(adminAlerts.id, id))
    .returning();
  return updated || undefined;
}

export async function markAdminAlertReadByEntity(entityType: string, entityId: string, readBy: string): Promise<AdminAlert | undefined> {
  const [updated] = await db.update(adminAlerts)
    .set({ isRead: true, readAt: new Date(), readBy })
    .where(and(
      eq(adminAlerts.entityType, entityType),
      eq(adminAlerts.entityId, entityId),
      eq(adminAlerts.isRead, false)
    ))
    .returning();
  return updated || undefined;
}

export async function markAllAdminAlertsAsRead(readBy: string): Promise<number> {
  const result = await db.update(adminAlerts)
    .set({ isRead: true, readAt: new Date(), readBy })
    .where(eq(adminAlerts.isRead, false));
  return result.rowCount || 0;
}

export async function getUnreadAdminAlertCount(): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(adminAlerts)
    .where(eq(adminAlerts.isRead, false));
  return Number(result?.count || 0);
}

export async function getUnreadAdminAlertCountByDeepLink(): Promise<Record<string, number>> {
  const results = await db.select({
    deepLink: adminAlerts.deepLink,
    count: sql<number>`count(*)::int`,
  })
    .from(adminAlerts)
    .where(and(
      eq(adminAlerts.isRead, false),
      sql`${adminAlerts.deepLink} IS NOT NULL`
    ))
    .groupBy(adminAlerts.deepLink);
  
  const counts: Record<string, number> = {};
  for (const row of results) {
    if (row.deepLink) {
      counts[row.deepLink] = row.count;
    }
  }
  return counts;
}

export async function getUnreadAlertEntityIds(deepLink: string): Promise<string[]> {
  const results = await db.select({ entityId: adminAlerts.entityId })
    .from(adminAlerts)
    .where(and(
      eq(adminAlerts.isRead, false),
      eq(adminAlerts.deepLink, deepLink),
      sql`${adminAlerts.entityId} IS NOT NULL`
    ));
  return results.map(r => r.entityId!).filter(Boolean);
}

export async function deleteAdminAlert(id: string): Promise<boolean> {
  const result = await db.delete(adminAlerts).where(eq(adminAlerts.id, id));
  return (result.rowCount || 0) > 0;
}
