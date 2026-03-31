import type { Express, Response } from "express";
import { AuthRequest, authMiddleware, adminMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, and, or, sql } from "drizzle-orm";
import { users, agents, affiliates, transactions, complaints, games } from "@shared/schema";

export function registerDashboardStatsRoutes(app: Express): void {

  app.get("/api/dashboard/stats", authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const [agentsCount] = await db.select({ count: sql<number>`count(*)` }).from(agents);
      const [affiliatesCount] = await db.select({ count: sql<number>`count(*)` }).from(affiliates);
      const [gamesCount] = await db.select({ count: sql<number>`count(*)` }).from(games);
      const [pendingTxCount] = await db.select({ count: sql<number>`count(*)` }).from(transactions)
        .where(eq(transactions.status, "pending"));
      const [openComplaintsCount] = await db.select({ count: sql<number>`count(*)` }).from(complaints)
        .where(or(eq(complaints.status, "open"), eq(complaints.status, "assigned")));

      const [depositSum] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
        .from(transactions).where(and(eq(transactions.type, "deposit"), eq(transactions.status, "completed")));
      const [withdrawalSum] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
        .from(transactions).where(and(eq(transactions.type, "withdrawal"), eq(transactions.status, "completed")));

      const totalDeposits = parseFloat(depositSum?.total || "0");
      const totalWithdrawals = parseFloat(withdrawalSum?.total || "0");

      res.json({
        totalUsers: Number(usersCount?.count || 0), totalAgents: Number(agentsCount?.count || 0),
        totalAffiliates: Number(affiliatesCount?.count || 0), totalGames: Number(gamesCount?.count || 0),
        pendingTransactions: Number(pendingTxCount?.count || 0), openComplaints: Number(openComplaintsCount?.count || 0),
        totalDeposits, totalWithdrawals, netRevenue: totalDeposits - totalWithdrawals,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
