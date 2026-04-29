import type { Request } from "express";
import { adminAuditLogs, type AdminAuditAction } from "@shared/schema";
import { db } from "../db";

const KNOWN_AUDIT_ACTIONS = new Set<AdminAuditAction>([
  "login",
  "logout",
  "user_update",
  "user_ban",
  "user_suspend",
  "user_balance_adjust",
  "reward_sent",
  "dispute_resolve",
  "theme_change",
  "section_toggle",
  "settings_update",
  "announcement_create",
  "promo_code_create",
  "transaction_review",
  "payment_method_update",
] as AdminAuditAction[]);

function normalizeAdminAuditAction(action: string): AdminAuditAction {
  const trimmed = (action || "").trim().toLowerCase() as AdminAuditAction;
  return KNOWN_AUDIT_ACTIONS.has(trimmed) ? trimmed : ("settings_update" as AdminAuditAction);
}

function mergeOriginalActionMetadata(metadata: string | undefined, originalAction: string): string {
  let parsed: Record<string, unknown> = {};
  if (metadata) {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      parsed = { raw: metadata };
    }
  }
  parsed.originalAction = originalAction;
  return JSON.stringify(parsed);
}

/**
 * Lightweight audit-log writer mirroring the main server's helper. Failures
 * are swallowed because audit logging must never break the actual operation.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: { previousValue?: string; newValue?: string; reason?: string; metadata?: string },
  req: Request,
): Promise<void> {
  try {
    const normalizedAction = normalizeAdminAuditAction(action);
    const normalizedKey = (action || "").trim().toLowerCase();
    const metadata =
      normalizedAction === normalizedKey
        ? details.metadata
        : mergeOriginalActionMetadata(details.metadata, action);

    await db.insert(adminAuditLogs).values({
      adminId,
      action: normalizedAction,
      entityType,
      entityId,
      previousValue: details.previousValue,
      newValue: details.newValue,
      reason: details.reason,
      metadata,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    console.error(
      `[agents-service] audit log failure: action=${action} entity=${entityId} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
