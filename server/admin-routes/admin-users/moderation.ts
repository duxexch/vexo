import type { Express, Response } from "express";
import { users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { toSafeUser } from "../../lib/safe-user";

export function registerUserModerationRoutes(app: Express) {

  // Ban user
  app.post("/api/admin/users/:id/ban", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [targetUser] = await db.select({ id: users.id, status: users.status, role: users.role })
        .from(users).where(eq(users.id, id)).limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role === 'admin' && targetUser.id !== req.admin!.id) {
        return res.status(403).json({ error: "Cannot ban another admin" });
      }
      if (targetUser.id === req.admin!.id) {
        return res.status(400).json({ error: "Cannot ban yourself" });
      }
      if (targetUser.status === 'banned') {
        return res.status(400).json({ error: "User is already banned" });
      }

      const [updated] = await db.update(users)
        .set({ status: "banned", updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "user_ban", "user", id, { reason }, req);

      await sendNotification(id, {
        type: 'security',
        priority: 'urgent',
        title: 'Account Banned',
        titleAr: 'تم حظر الحساب',
        message: `Your account has been banned.${reason ? ' Reason: ' + reason : ''} Contact support for assistance.`,
        messageAr: `تم حظر حسابك.${reason ? ' السبب: ' + reason : ''} تواصل مع الدعم للمساعدة.`,
        link: '/support',
      }).catch(() => { });

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Unban user
  app.post("/api/admin/users/:id/unban", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [targetUser] = await db.select({ id: users.id, status: users.status })
        .from(users).where(eq(users.id, id)).limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.status !== 'banned' && targetUser.status !== 'suspended') {
        return res.status(400).json({ error: "User is not banned or suspended" });
      }

      const [updated] = await db.update(users)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "user_unban", "user", id, { reason }, req);

      await sendNotification(id, {
        type: 'success',
        priority: 'high',
        title: 'Account Reactivated',
        titleAr: 'تم إعادة تفعيل الحساب',
        message: `Your account has been reactivated.${reason ? ' Note: ' + reason : ''} Welcome back!`,
        messageAr: `تم إعادة تفعيل حسابك.${reason ? ' ملاحظة: ' + reason : ''} مرحباً بعودتك!`,
        link: '/',
      }).catch(() => { });

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Suspend user
  app.post("/api/admin/users/:id/suspend", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const [targetUser] = await db.select({ id: users.id, status: users.status, role: users.role })
        .from(users).where(eq(users.id, id)).limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ error: "Cannot suspend an admin" });
      }
      if (targetUser.id === req.admin!.id) {
        return res.status(400).json({ error: "Cannot suspend yourself" });
      }
      if (targetUser.status === 'suspended') {
        return res.status(400).json({ error: "User is already suspended" });
      }

      const [updated] = await db.update(users)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req.admin!.id, "user_suspend", "user", id, { reason }, req);

      await sendNotification(id, {
        type: 'security',
        priority: 'high',
        title: 'Account Suspended',
        titleAr: 'تم إيقاف الحساب',
        message: `Your account has been suspended.${reason ? ' Reason: ' + reason : ''} Contact support for more information.`,
        messageAr: `تم إيقاف حسابك.${reason ? ' السبب: ' + reason : ''} تواصل مع الدعم لمزيد من المعلومات.`,
        link: '/support',
      }).catch(() => { });

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
