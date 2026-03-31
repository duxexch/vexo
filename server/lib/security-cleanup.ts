/**
 * Security Cleanup Job — Phase 26
 * Periodically removes expired reset tokens, OTP codes, and inactive sessions.
 * Runs every hour.
 */
import { db } from "../db";
import { passwordResetTokens, otpVerifications, activeSessions } from "@shared/schema";
import { lt, eq, and, or } from "drizzle-orm";
import { logger } from "./logger";
import { getErrorMessage } from "../routes/helpers";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runCleanup() {
  const now = new Date();
  
  try {
    // 1. Delete expired password reset tokens
    const deletedTokens = await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, now))
      .returning({ id: passwordResetTokens.id });
    
    // 2. Delete expired OTP verifications
    const deletedOtps = await db.delete(otpVerifications)
      .where(lt(otpVerifications.expiresAt, now))
      .returning({ id: otpVerifications.id });
    
    // 3. Deactivate expired sessions
    const deactivatedSessions = await db.update(activeSessions)
      .set({ isActive: false })
      .where(and(
        eq(activeSessions.isActive, true),
        lt(activeSessions.expiresAt, now),
      ))
      .returning({ id: activeSessions.id });
    
    // 4. Hard-delete sessions older than 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const purgedSessions = await db.delete(activeSessions)
      .where(and(
        eq(activeSessions.isActive, false),
        lt(activeSessions.createdAt, thirtyDaysAgo),
      ))
      .returning({ id: activeSessions.id });
    
    const total = deletedTokens.length + deletedOtps.length + deactivatedSessions.length + purgedSessions.length;
    if (total > 0) {
      logger.info(
        `[Security Cleanup] Removed: ${deletedTokens.length} expired tokens, ` +
        `${deletedOtps.length} expired OTPs, ` +
        `${deactivatedSessions.length} expired sessions deactivated, ` +
        `${purgedSessions.length} old sessions purged`
      );
    }
  } catch (error: unknown) {
    logger.error('[Security Cleanup] Error', new Error(getErrorMessage(error)));
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSecurityCleanupJob() {
  // Run once immediately
  runCleanup();
  
  // Then run every hour
  cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  logger.info('[Security Cleanup] Scheduled hourly cleanup job');
}

export function stopSecurityCleanupJob() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
