import type { Express, Response } from "express";
import { storage } from "../../storage";
import { challenges, transactions } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, gte, sql, type SQL } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";

export function registerChallengeListingRoutes(app: Express) {

  app.get("/api/admin/challenges", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status, gameType, page = '1', limit = '20' } = req.query;
      const pageNum = Math.max(1, parseInt(String(page)));
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
      const offset = (pageNum - 1) * limitNum;

      let conditions: SQL[] = [];
      if (status && status !== 'all') {
        conditions.push(eq(challenges.status, String(status)));
      }
      if (gameType && gameType !== 'all') {
        conditions.push(eq(challenges.gameType, String(gameType)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(challenges)
        .where(whereClause);

      const challengeList = await db.select()
        .from(challenges)
        .where(whereClause)
        .orderBy(desc(challenges.createdAt))
        .limit(limitNum)
        .offset(offset);

      const enriched = await Promise.all(challengeList.map(async (c) => {
        const player1 = await storage.getUser(c.player1Id);
        const player2 = c.player2Id ? await storage.getUser(c.player2Id) : null;
        return {
          ...c,
          player1Name: player1?.nickname || player1?.username || 'Unknown',
          player2Name: player2 ? (player2.nickname || player2.username || 'Unknown') : null,
        };
      }));

      res.json({
        challenges: enriched,
        total: Number(countResult?.count || 0),
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(Number(countResult?.count || 0) / limitNum),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/challenge-stats", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const [totalChallenges] = await db.select({ count: sql<number>`count(*)` }).from(challenges);
      const [waitingChallenges] = await db.select({ count: sql<number>`count(*)` }).from(challenges).where(eq(challenges.status, 'waiting'));
      const [activeChallenges] = await db.select({ count: sql<number>`count(*)` }).from(challenges).where(eq(challenges.status, 'active'));
      const [completedChallenges] = await db.select({ count: sql<number>`count(*)` }).from(challenges).where(eq(challenges.status, 'completed'));
      const [cancelledChallenges] = await db.select({ count: sql<number>`count(*)` }).from(challenges).where(eq(challenges.status, 'cancelled'));
      
      const [totalCommission] = await db.select({ 
        total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL(18,2))), 0)` 
      }).from(transactions).where(eq(transactions.type, 'commission'));
      
      const [totalVolume] = await db.select({ 
        total: sql<string>`COALESCE(SUM(CAST(bet_amount AS DECIMAL(18,2))), 0)` 
      }).from(challenges).where(eq(challenges.status, 'completed'));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [todayChallenges] = await db.select({ count: sql<number>`count(*)` })
        .from(challenges)
        .where(gte(challenges.createdAt, today));
      const [todayCommission] = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL(18,2))), 0)`
      }).from(transactions).where(and(
        eq(transactions.type, 'commission'),
        gte(transactions.createdAt, today)
      ));

      res.json({
        total: Number(totalChallenges?.count || 0),
        waiting: Number(waitingChallenges?.count || 0),
        active: Number(activeChallenges?.count || 0),
        completed: Number(completedChallenges?.count || 0),
        cancelled: Number(cancelledChallenges?.count || 0),
        totalCommission: parseFloat(totalCommission?.total || '0'),
        totalVolume: parseFloat(totalVolume?.total || '0'),
        todayChallenges: Number(todayChallenges?.count || 0),
        todayCommission: parseFloat(todayCommission?.total || '0'),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
