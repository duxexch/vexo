import {
  auditLogs, adminAuditLogs,
  type AuditLog, type InsertAuditLog,
  type AuditAction, type AdminAuditAction,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and } from "drizzle-orm";

// ==================== AUDIT LOGS ====================

export async function createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
  const [auditLog] = await db.insert(auditLogs).values(log).returning();
  return auditLog;
}

export async function getAuditLogs(userId?: string, action?: string): Promise<AuditLog[]> {
  const conditions = [];
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (action) conditions.push(eq(auditLogs.action, action as AuditAction));
  
  if (conditions.length > 0) {
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(100);
  }
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}

// ==================== ADMIN AUDIT LOGGING ====================

export async function createAdminAuditLog(log: { adminId: string; action: string; entityType: string; entityId?: string; oldValue?: Record<string, unknown>; newValue?: Record<string, unknown>; ipAddress?: string; userAgent?: string }): Promise<void> {
  await db.insert(adminAuditLogs).values({
    adminId: log.adminId,
    action: log.action as AdminAuditAction,
    entityType: log.entityType,
    entityId: log.entityId || null,
    previousValue: log.oldValue ? JSON.stringify(log.oldValue) : null,
    newValue: log.newValue ? JSON.stringify(log.newValue) : null,
    ipAddress: log.ipAddress || null,
    userAgent: log.userAgent || null,
  });
}
