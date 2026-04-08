import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, strictRateLimiter } from "./middleware";
import { getErrorMessage } from "./helpers";
import { storage } from "../storage";
import { sendNotification } from "../websocket";
import { db } from "../db";
import { activeSessions } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyTOTP } from "./auth/helpers";
import { sanitizePlainText } from "../lib/input-security";

const rawRestoreWindowDays = Number.parseInt(process.env.ACCOUNT_RESTORE_WINDOW_DAYS || "30", 10);
const ACCOUNT_RESTORE_WINDOW_DAYS = Number.isFinite(rawRestoreWindowDays)
  ? Math.min(365, Math.max(1, rawRestoreWindowDays))
  : 30;

export function registerSecurityRoutes(app: Express): void {

  // ==================== SECURITY ====================

  const passwordChangeSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string()
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password is too long")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match", path: ["confirmPassword"],
  }).refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from current password", path: ["newPassword"],
  });

  const disableAccountSchema = z.object({
    password: z.string().min(1, "Password is required"),
    twoFactorCode: z.string().trim().regex(/^\d{6}$/).optional(),
    reason: z.string().max(200).optional().nullable(),
  });

  const deleteAccountSchema = z.object({
    password: z.string().min(1, "Password is required"),
    twoFactorCode: z.string().trim().regex(/^\d{6}$/).optional(),
    confirmation: z.literal("DELETE"),
    reason: z.string().max(500).optional().nullable(),
  });

  app.post("/api/user/change-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const validated = passwordChangeSchema.parse(req.body);

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const isValid = await bcrypt.compare(validated.currentPassword, user.password);
      if (!isValid) return res.status(400).json({ error: "Current password is incorrect" });

      const hashedPassword = await bcrypt.hash(validated.newPassword, 10);
      await storage.updateUser(req.user!.id, { password: hashedPassword });

      await storage.createAuditLog({
        userId: req.user!.id, action: "settings_change", entityType: "user",
        entityId: req.user!.id, details: "Password changed", ipAddress: req.ip,
      });

      await storage.createNotification({
        userId: req.user!.id, type: "security", priority: "high",
        title: "Password Changed", titleAr: "تم تغيير كلمة المرور",
        message: "Your password was changed successfully. If you didn't make this change, contact support immediately.",
        messageAr: "تم تغيير كلمة المرور بنجاح. إذا لم تقم بهذا التغيير، اتصل بالدعم فوراً.",
        link: '/settings',
      });

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/account/disable", authMiddleware, strictRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const validated = disableAccountSchema.parse(req.body);
      const user = await storage.getUser(req.user!.id);

      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === "admin") {
        return res.status(403).json({ error: "Admin accounts cannot be disabled from this endpoint" });
      }
      if (user.accountDeletedAt) {
        return res.status(400).json({ error: "Account is already scheduled as deleted" });
      }
      if (user.status !== "active") {
        return res.status(400).json({ error: "Account is already inactive" });
      }

      const passwordOk = await bcrypt.compare(validated.password, user.password);
      if (!passwordOk) {
        return res.status(400).json({ error: "Password is incorrect" });
      }

      if (user.twoFactorEnabled) {
        if (!validated.twoFactorCode) {
          return res.status(400).json({ error: "Two-factor code is required" });
        }
        if (!user.twoFactorSecret || !verifyTOTP(user.twoFactorSecret, validated.twoFactorCode)) {
          return res.status(400).json({ error: "Invalid two-factor code" });
        }
      }

      const safeReason = validated.reason ? sanitizePlainText(validated.reason, { maxLength: 200 }) : "";

      await storage.updateUser(user.id, {
        status: "inactive",
        accountDisabledAt: new Date(),
        isOnline: false,
        lastActiveAt: new Date(),
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      await storage.revokeAllUserSessions(user.id);
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(and(
          eq(activeSessions.userId, user.id),
          eq(activeSessions.isActive, true),
        ));

      await storage.createAuditLog({
        userId: user.id,
        action: "settings_change",
        entityType: "user",
        entityId: user.id,
        details: safeReason ? `Account disabled by owner. Reason: ${safeReason}` : "Account disabled by owner",
        ipAddress: req.ip,
      });

      await storage.createNotification({
        userId: user.id,
        type: "security",
        priority: "high",
        title: "Account Disabled",
        titleAr: "تم تعطيل الحساب",
        message: "Your account has been disabled by request. Use account recovery to reactivate.",
        messageAr: "تم تعطيل حسابك بناءً على طلبك. استخدم استعادة الحساب لإعادة التفعيل.",
        link: "/login",
      });

      res.clearCookie("vex_token", { path: "/" });
      return res.json({ success: true, message: "Account disabled successfully" });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/account/delete", authMiddleware, strictRateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const validated = deleteAccountSchema.parse(req.body);
      const user = await storage.getUser(req.user!.id);

      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === "admin") {
        return res.status(403).json({ error: "Admin accounts cannot be deleted from this endpoint" });
      }
      if (user.accountDeletedAt) {
        return res.status(400).json({ error: "Account is already marked as deleted" });
      }

      const passwordOk = await bcrypt.compare(validated.password, user.password);
      if (!passwordOk) {
        return res.status(400).json({ error: "Password is incorrect" });
      }

      if (user.twoFactorEnabled) {
        if (!validated.twoFactorCode) {
          return res.status(400).json({ error: "Two-factor code is required" });
        }
        if (!user.twoFactorSecret || !verifyTOTP(user.twoFactorSecret, validated.twoFactorCode)) {
          return res.status(400).json({ error: "Invalid two-factor code" });
        }
      }

      const safeReason = validated.reason ? sanitizePlainText(validated.reason, { maxLength: 500 }) : "";

      await storage.updateUser(user.id, {
        status: "inactive",
        accountDeletedAt: new Date(),
        accountDeletionReason: safeReason || null,
        accountDisabledAt: null,
        isOnline: false,
        lastActiveAt: new Date(),
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      await storage.revokeAllUserSessions(user.id);
      await db.update(activeSessions)
        .set({ isActive: false })
        .where(and(
          eq(activeSessions.userId, user.id),
          eq(activeSessions.isActive, true),
        ));

      await storage.createAuditLog({
        userId: user.id,
        action: "settings_change",
        entityType: "user",
        entityId: user.id,
        details: safeReason ? `Account deleted by owner. Reason: ${safeReason}` : "Account deleted by owner",
        ipAddress: req.ip,
      });

      await storage.createNotification({
        userId: user.id,
        type: "security",
        priority: "high",
        title: "Account Deleted",
        titleAr: "تم حذف الحساب",
        message: `Your account was deleted by request. It can be restored within ${ACCOUNT_RESTORE_WINDOW_DAYS} days with recovery verification.`,
        messageAr: `تم حذف حسابك بناءً على طلبك. يمكن استعادته خلال ${ACCOUNT_RESTORE_WINDOW_DAYS} يوماً عبر التحقق الأمني.`,
        link: "/login",
      });

      res.clearCookie("vex_token", { path: "/" });
      return res.json({
        success: true,
        message: "Account deleted successfully",
        restoreWindowDays: ACCOUNT_RESTORE_WINDOW_DAYS,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/user/login-history", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const history = await storage.getUserLoginHistory(req.user!.id);
      res.json(history);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== WITHDRAWAL PASSWORD ====================

  app.post("/api/user/withdrawal-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { password, loginPassword } = req.body;
      if (!password || !loginPassword) {
        return res.status(400).json({ error: "Password and login password are required" });
      }
      if (password.length < 4 || password.length > 20) {
        return res.status(400).json({ error: "Withdrawal password must be 4-20 characters" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const isValid = await bcrypt.compare(loginPassword, user.password);
      if (!isValid) return res.status(400).json({ error: "Login password is incorrect" });

      const hashedWithdrawalPwd = await bcrypt.hash(password, 10);
      await storage.updateUser(req.user!.id, {
        withdrawalPassword: hashedWithdrawalPwd, withdrawalPasswordEnabled: true,
      });

      await storage.createAuditLog({
        userId: req.user!.id, action: "settings_change", entityType: "user",
        entityId: req.user!.id, details: "Withdrawal password set", ipAddress: req.ip,
      });

      await storage.createNotification({
        userId: req.user!.id, type: "security", priority: "high",
        title: "Withdrawal Password Set", titleAr: "تم تعيين كلمة مرور السحب",
        message: "A withdrawal password has been set on your account.",
        messageAr: "تم تعيين كلمة مرور للسحب على حسابك.", link: '/settings',
      });

      res.json({ success: true, message: "Withdrawal password set successfully" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/user/withdrawal-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { loginPassword } = req.body;
      if (!loginPassword) return res.status(400).json({ error: "Login password is required" });

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const isValid = await bcrypt.compare(loginPassword, user.password);
      if (!isValid) return res.status(400).json({ error: "Login password is incorrect" });

      await storage.updateUser(req.user!.id, {
        withdrawalPassword: null, withdrawalPasswordEnabled: false,
      });

      await sendNotification(req.user!.id, {
        type: 'security', priority: 'urgent',
        title: 'Withdrawal Password Removed ⚠️', titleAr: 'تم إزالة كلمة مرور السحب ⚠️',
        message: 'Your withdrawal password has been removed. Your account withdrawals are now less secured.',
        messageAr: 'تم إزالة كلمة مرور السحب. عمليات السحب من حسابك أصبحت أقل أماناً.',
        link: '/settings',
      }).catch(() => { });

      res.json({ success: true, message: "Withdrawal password removed" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== SESSIONS ====================

  app.get("/api/user/sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sessions = await storage.getUserSessions(req.user!.id);
      res.json(sessions);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/sessions/:id/revoke", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Verify session belongs to the authenticated user (prevents IDOR)
      const sessions = await storage.getUserSessions(req.user!.id);
      const ownsSession = sessions.some((s: { id: string }) => s.id === req.params.id);
      if (!ownsSession) {
        return res.status(403).json({ error: "Cannot revoke sessions belonging to other users" });
      }
      await storage.revokeUserSession(req.params.id);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/user/sessions/revoke-all", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { exceptCurrent } = req.body;
      await storage.revokeAllUserSessions(req.user!.id, exceptCurrent);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
