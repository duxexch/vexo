import type { Express, Response } from "express";
import { users, transactions, complaints, adminAuditLogs, type AdminAuditAction } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql, like, or, gte, count } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "./helpers";
import { toSafeUsers } from "../lib/safe-user";
import { escapeSqlLikePattern, parseStringQueryParam } from "../lib/input-security";

export function registerAdminDashboardRoutes(app: Express) {

  // ==================== DASHBOARD STATS ====================

  app.get("/api/admin/stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const [
        totalUsersResult,
        activeUsersResult,
        totalTransactionsResult,
        pendingDepositsResult,
        pendingWithdrawalsResult,
        openComplaintsResult,
        totalBalanceResult
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.status, "active")),
        db.select({ count: sql<number>`count(*)` }).from(transactions),
        db.select({ count: sql<number>`count(*)`, sum: sql<string>`coalesce(sum(amount), 0)` })
          .from(transactions)
          .where(and(eq(transactions.type, "deposit"), eq(transactions.status, "pending"))),
        db.select({ count: sql<number>`count(*)`, sum: sql<string>`coalesce(sum(amount), 0)` })
          .from(transactions)
          .where(and(eq(transactions.type, "withdrawal"), eq(transactions.status, "pending"))),
        db.select({ count: sql<number>`count(*)` }).from(complaints).where(eq(complaints.status, "open")),
        db.select({ sum: sql<string>`coalesce(sum(balance), 0)` }).from(users),
      ]);

      res.json({
        totalUsers: Number(totalUsersResult[0]?.count || 0),
        activeUsers: Number(activeUsersResult[0]?.count || 0),
        totalTransactions: Number(totalTransactionsResult[0]?.count || 0),
        pendingDeposits: {
          count: Number(pendingDepositsResult[0]?.count || 0),
          amount: pendingDepositsResult[0]?.sum || "0"
        },
        pendingWithdrawals: {
          count: Number(pendingWithdrawalsResult[0]?.count || 0),
          amount: pendingWithdrawalsResult[0]?.sum || "0"
        },
        openComplaints: Number(openComplaintsResult[0]?.count || 0),
        totalUserBalance: totalBalanceResult[0]?.sum || "0"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== GLOBAL SEARCH ====================

  app.get("/api/admin/search", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { q, type } = req.query;
      const query = parseStringQueryParam(q, 120);

      if (!query || query.length < 2) {
        return res.json({ users: [], transactions: [], complaints: [] });
      }

      // Escape SQL LIKE wildcards to prevent enumeration attacks
      const escaped = escapeSqlLikePattern(query);
      const searchPattern = `%${escaped}%`;

      const [usersResult, transactionsResult, complaintsResult] = await Promise.all([
        type === "all" || type === "users" ?
          db.select().from(users)
            .where(or(
              like(users.username, searchPattern),
              like(users.email || "", searchPattern),
              like(users.accountId || "", searchPattern),
              like(users.phone || "", searchPattern)
            ))
            .limit(10) : Promise.resolve([]),
        type === "all" || type === "transactions" ?
          db.select().from(transactions)
            .where(or(
              like(transactions.id, searchPattern),
              like(transactions.referenceId || "", searchPattern),
              like(transactions.description || "", searchPattern)
            ))
            .limit(10) : Promise.resolve([]),
        type === "all" || type === "complaints" ?
          db.select().from(complaints)
            .where(or(
              like(complaints.subject, searchPattern),
              like(complaints.description, searchPattern),
              like(complaints.ticketNumber, searchPattern)
            ))
            .limit(10) : Promise.resolve([])
      ]);

      res.json({
        users: toSafeUsers(usersResult),
        transactions: transactionsResult,
        complaints: complaintsResult
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== ANALYTICS ====================

  app.get("/api/admin/analytics", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { period = "7d" } = req.query;

      let dateFilter: Date;
      switch (period) {
        case "24h": dateFilter = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
        case "7d": dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
        case "30d": dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
        default: dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      const [
        newUsers,
        depositsInPeriod,
        withdrawalsInPeriod,
        activeTransactions
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` })
          .from(users)
          .where(gte(users.createdAt, dateFilter)),
        db.select({
          count: sql<number>`count(*)`,
          total: sql<string>`coalesce(sum(amount), 0)`
        })
          .from(transactions)
          .where(and(
            eq(transactions.type, "deposit"),
            eq(transactions.status, "completed"),
            gte(transactions.createdAt, dateFilter)
          )),
        db.select({
          count: sql<number>`count(*)`,
          total: sql<string>`coalesce(sum(amount), 0)`
        })
          .from(transactions)
          .where(and(
            eq(transactions.type, "withdrawal"),
            eq(transactions.status, "completed"),
            gte(transactions.createdAt, dateFilter)
          )),
        db.select({ count: sql<number>`count(*)` })
          .from(transactions)
          .where(gte(transactions.createdAt, dateFilter))
      ]);

      res.json({
        period,
        newUsers: Number(newUsers[0]?.count || 0),
        deposits: {
          count: Number(depositsInPeriod[0]?.count || 0),
          total: depositsInPeriod[0]?.total || "0"
        },
        withdrawals: {
          count: Number(withdrawalsInPeriod[0]?.count || 0),
          total: withdrawalsInPeriod[0]?.total || "0"
        },
        totalTransactions: Number(activeTransactions[0]?.count || 0)
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ==================== AUDIT LOGS ====================

  app.get("/api/admin/audit-logs", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { limit = "50", action } = req.query;

      let query = db.select().from(adminAuditLogs);

      if (action) {
        query = query.where(eq(adminAuditLogs.action, action as AdminAuditAction)) as typeof query;
      }

      const result = await query
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(Number(limit));

      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
