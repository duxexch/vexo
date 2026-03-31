import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users, transactions, type UserRole, type UserStatus } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc, and } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { toSafeUser, toSafeUsers } from "../../lib/safe-user";

export function registerUserCrudRoutes(app: Express) {

  // List users with optional role/status filtering
  app.get("/api/admin/users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { role, status, limit = "50", offset = "0" } = req.query;

      let query = db.select().from(users);
      const conditions = [];

      if (role) conditions.push(eq(users.role, role as UserRole));
      if (status) conditions.push(eq(users.status, status as UserStatus));

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const result = await query
        .orderBy(desc(users.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));

      res.json(toSafeUsers(result));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get single user with recent transactions
  app.get("/api/admin/users/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userTransactions = await db.select()
        .from(transactions)
        .where(eq(transactions.userId, req.params.id))
        .orderBy(desc(transactions.createdAt))
        .limit(20);

      res.json({
        user: toSafeUser(user),
        transactions: userTransactions
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update user profile fields (whitelisted)
  app.patch("/api/admin/users/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Whitelist allowed fields — prevent balance/password/role manipulation
      const adminAllowedFields = ['status', 'firstName', 'lastName', 'email', 'phone', 'avatarUrl', 'country', 'language', 'nickname'];
      const sanitize = (v: unknown) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').slice(0, 255) : v;

      const updates: Record<string, any> = {};
      for (const key of adminAllowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = sanitize(req.body[key]);
        }
      }

      // Validate status enum if provided
      if (updates.status && !['active', 'suspended', 'banned', 'inactive'].includes(updates.status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      const updated = await storage.updateUser(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await logAdminAction(req.admin!.id, "user_update", "user", id, {
        previousValue: JSON.stringify({ status: existing.status }),
        newValue: JSON.stringify(updates)
      }, req);

      // Notify user if status changed
      if (updates.status && updates.status !== existing.status) {
        const statusLabels: Record<string, { en: string; ar: string }> = {
          active: { en: 'Active', ar: 'نشط' },
          suspended: { en: 'Suspended', ar: 'موقوف' },
          banned: { en: 'Banned', ar: 'محظور' },
          inactive: { en: 'Inactive', ar: 'غير نشط' },
        };
        const label = statusLabels[updates.status] || { en: updates.status, ar: updates.status };
        await sendNotification(id, {
          type: 'security',
          priority: 'high',
          title: `Account Status Updated`,
          titleAr: `تحديث حالة الحساب`,
          message: `Your account status has been changed to: ${label.en}`,
          messageAr: `تم تغيير حالة حسابك إلى: ${label.ar}`,
          link: '/settings',
        }).catch(() => { });
      }

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
