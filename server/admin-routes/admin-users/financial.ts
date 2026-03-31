import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { toSafeUser } from "../../lib/safe-user";

export function registerUserFinancialRoutes(app: Express) {

  // Adjust user balance (add or subtract)
  app.post("/api/admin/users/:id/balance-adjust", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, type, reason } = req.body;

      if (!type || !['add', 'subtract'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'add' or 'subtract'" });
      }

      const adjustAmount = parseFloat(amount);
      if (isNaN(adjustAmount) || adjustAmount <= 0 || adjustAmount > 1000000) {
        return res.status(400).json({ error: "Amount must be a positive number up to 1,000,000" });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ error: "A reason is required (minimum 3 characters)" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const currentBalance = parseFloat(user.balance);
      const newBalance = type === "add" ? currentBalance + adjustAmount : currentBalance - adjustAmount;

      if (newBalance < 0) {
        return res.status(400).json({ error: "Balance cannot be negative" });
      }

      const [updated] = await db.update(users)
        .set({ balance: String(newBalance), updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await storage.createTransaction({
        userId: id,
        type: type === "add" ? "bonus" : "withdrawal",
        status: "completed",
        amount: String(adjustAmount),
        balanceBefore: String(currentBalance),
        balanceAfter: String(newBalance),
        description: `Admin adjustment: ${reason}`,
        adminNote: reason
      });

      await logAdminAction(req.admin!.id, "user_balance_adjust", "user", id, {
        previousValue: String(currentBalance),
        newValue: String(newBalance),
        reason
      }, req);

      const adjustLabel = type === 'add' ? { en: 'credited to', ar: 'أضيفت إلى' } : { en: 'deducted from', ar: 'خصمت من' };
      await sendNotification(id, {
        type: 'transaction',
        priority: 'high',
        title: 'Balance Updated',
        titleAr: 'تحديث الرصيد',
        message: `$${adjustAmount.toFixed(2)} has been ${adjustLabel.en} your account. Reason: ${reason}`,
        messageAr: `$${adjustAmount.toFixed(2)} ${adjustLabel.ar} حسابك. السبب: ${reason}`,
        link: '/wallet',
        metadata: JSON.stringify({ type: 'balance_adjust', amount: adjustAmount, balanceAfter: newBalance }),
      }).catch(() => { });

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Send reward to user
  app.post("/api/admin/users/:id/reward", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const currentBalance = parseFloat(user.balance);
      const rewardAmount = parseFloat(amount);

      if (isNaN(rewardAmount) || rewardAmount <= 0 || rewardAmount > 1000000) {
        return res.status(400).json({ error: "Reward amount must be a positive number up to 1,000,000" });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ error: "A reason is required (minimum 3 characters)" });
      }

      const newBalance = currentBalance + rewardAmount;

      const [updated] = await db.update(users)
        .set({ balance: String(newBalance), updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await storage.createTransaction({
        userId: id,
        type: "bonus",
        status: "completed",
        amount: String(rewardAmount),
        balanceBefore: String(currentBalance),
        balanceAfter: String(newBalance),
        description: `Reward: ${reason}`,
        adminNote: `Sent by admin: ${reason}`
      });

      await logAdminAction(req.admin!.id, "reward_sent", "user", id, {
        newValue: String(rewardAmount),
        reason
      }, req);

      await sendNotification(id, {
        type: 'promotion',
        priority: 'high',
        title: 'Reward Received! 🎁',
        titleAr: 'حصلت على مكافأة! 🎁',
        message: `You received a $${rewardAmount.toFixed(2)} reward! Reason: ${reason}`,
        messageAr: `حصلت على مكافأة بقيمة $${rewardAmount.toFixed(2)}! السبب: ${reason}`,
        link: '/wallet',
        metadata: JSON.stringify({ type: 'reward', amount: rewardAmount }),
      }).catch(() => { });

      res.json({ ...toSafeUser(updated), rewardSent: rewardAmount });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Toggle P2P trading ban
  app.post("/api/admin/users/:id/p2p-ban", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason, banned } = req.body;

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [updated] = await db.update(users)
        .set({
          p2pBanned: banned ?? true,
          p2pBanReason: banned ? reason : null,
          p2pBannedAt: banned ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req.admin!.id, banned ? "p2p_ban" : "p2p_unban", "user", id, {
        previousValue: String(user.p2pBanned),
        newValue: String(banned),
        reason
      }, req);

      if (banned) {
        await sendNotification(id, {
          type: 'warning',
          priority: 'high',
          title: 'P2P Trading Restricted',
          titleAr: 'تم تقييد تداول P2P',
          message: `Your P2P trading access has been restricted.${reason ? ' Reason: ' + reason : ''} Contact support for assistance.`,
          messageAr: `تم تقييد وصولك لتداول P2P.${reason ? ' السبب: ' + reason : ''} تواصل مع الدعم للمساعدة.`,
          link: '/p2p',
        }).catch(() => { });
      } else {
        await sendNotification(id, {
          type: 'success',
          priority: 'normal',
          title: 'P2P Trading Restored',
          titleAr: 'تم استعادة تداول P2P',
          message: 'Your P2P trading access has been restored. You can now trade again.',
          messageAr: 'تم استعادة وصولك لتداول P2P. يمكنك التداول مرة أخرى.',
          link: '/p2p',
        }).catch(() => { });
      }

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
