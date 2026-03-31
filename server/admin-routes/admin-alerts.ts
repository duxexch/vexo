import type { Express, Response } from "express";
import { storage } from "../storage";
import {
  users, transactions, complaints,
  p2pDisputes, p2pTrades,
} from "@shared/schema";
import { db } from "../db";
import { eq, or, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "./helpers";
import { aiMonitor } from "../lib/ai-monitor";
import { getAdaptiveAiHealthSnapshot } from "../lib/adaptive-ai";
import { getAiAgentHealth } from "../lib/ai-agent-client";

export function registerAdminAlertsRoutes(app: Express) {

  // ==================== ADMIN ALERTS (Real-time Admin Notifications) ====================

  app.get("/api/admin/alerts", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { unreadOnly, type, severity, limit } = req.query;
      const alerts = await storage.listAdminAlerts({
        unreadOnly: unreadOnly === 'true',
        type: type as string | undefined,
        severity: severity as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });
      res.json(alerts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/alerts/ai-monitor", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [health, aiAgentHealth, systemAlerts] = await Promise.all([
        getAdaptiveAiHealthSnapshot(),
        getAiAgentHealth(),
        storage.listAdminAlerts({ type: 'system_alert', limit: 120 }),
      ]);

      const recentAiAlerts = systemAlerts
        .filter((alert) => {
          if (alert.entityType === 'ai_system') {
            return true;
          }

          if (alert.metadata) {
            try {
              const meta = JSON.parse(alert.metadata) as { errorType?: string; anomalyType?: string };
              if (meta.errorType || meta.anomalyType) {
                return true;
              }
            } catch {
              // Ignore malformed metadata
            }
          }

          const title = (alert.title || '').toLowerCase();
          return title.includes('ai');
        })
        .slice(0, 40);

      res.json({
        stats: aiMonitor.getStats(),
        health,
        aiAgentHealth,
        recentAlerts: recentAiAlerts,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/alerts/count", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const count = await storage.getUnreadAdminAlertCount();
      res.json({ count });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/alerts/unread-by-section", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const counts = await storage.getUnreadAdminAlertCountByDeepLink();
      res.json(counts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/alerts/unread-entities", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { deepLink } = req.query;
      if (!deepLink || typeof deepLink !== 'string') {
        return res.status(400).json({ error: "deepLink query parameter is required" });
      }
      const entityIds = await storage.getUnreadAlertEntityIds(deepLink);
      res.json({ entityIds });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/alerts/:id/read", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const alert = await storage.markAdminAlertAsRead(id, req.admin!.id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json(alert);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/alerts/read-by-entity", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { entityType, entityId } = req.body;
      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId are required" });
      }
      const alert = await storage.markAdminAlertReadByEntity(entityType, entityId, req.admin!.id);
      res.json({ success: true, alert: alert || null });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/alerts/read-all", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const count = await storage.markAllAdminAlertsAsRead(req.admin!.id);
      res.json({ success: true, count });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/alerts/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteAdminAlert(id);
      if (!success) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Pending counts for admin sidebar badges
  app.get("/api/admin/pending-counts", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [pendingVerifications] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.idVerificationStatus, 'pending'));

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [newUsersToday] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.createdAt} >= ${todayStart}`);

      const [pendingDeposits] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(sql`${transactions.type} = 'deposit' AND ${transactions.status} = 'pending'`);

      const [pendingWithdrawals] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(sql`${transactions.type} = 'withdrawal' AND ${transactions.status} = 'pending'`);

      const [openComplaints] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(complaints)
        .where(or(eq(complaints.status, 'open'), eq(complaints.status, 'assigned')));

      const [openDisputes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(p2pDisputes)
        .where(eq(p2pDisputes.status, 'open'));

      const [activeTrades] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(p2pTrades)
        .where(or(eq(p2pTrades.status, 'pending'), eq(p2pTrades.status, 'disputed')));

      const unreadAlerts = await storage.getUnreadAdminAlertCount();

      res.json({
        idVerification: pendingVerifications?.count || 0,
        newUsersToday: newUsersToday?.count || 0,
        deposits: pendingDeposits?.count || 0,
        withdrawals: pendingWithdrawals?.count || 0,
        transactions: (pendingDeposits?.count || 0) + (pendingWithdrawals?.count || 0),
        complaints: openComplaints?.count || 0,
        disputes: openDisputes?.count || 0,
        p2p: (activeTrades?.count || 0) + (openDisputes?.count || 0),
        alerts: unreadAlerts,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
