import type { Express, Response } from "express";
import {
  p2pDisputes, p2pTrades,
  type P2pDisputeStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, gte, lte, type SQL } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage } from "../helpers";
import { getP2PUsernameMap } from "../../lib/p2p-username";

export function registerDisputeListingRoutes(app: Express) {

  // Enhanced dispute listing with filters, sorting, and real-time alerts
  app.get("/api/admin/p2p/disputes", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status, sortBy, sortOrder, dateFrom, dateTo } = req.query;

      const conditions: SQL[] = [];

      // Filter by status
      if (status && status !== "all") {
        conditions.push(eq(p2pDisputes.status, String(status) as P2pDisputeStatus));
      }

      // Filter by date range
      if (dateFrom) {
        conditions.push(gte(p2pDisputes.createdAt, new Date(String(dateFrom))));
      }
      if (dateTo) {
        conditions.push(lte(p2pDisputes.createdAt, new Date(String(dateTo))));
      }

      // Build query
      let disputes;
      if (conditions.length > 0) {
        disputes = await db.select()
          .from(p2pDisputes)
          .where(and(...conditions))
          .orderBy(sortOrder === "asc" ? p2pDisputes.createdAt : desc(p2pDisputes.createdAt))
          .limit(200);
      } else {
        disputes = await db.select()
          .from(p2pDisputes)
          .orderBy(sortOrder === "asc" ? p2pDisputes.createdAt : desc(p2pDisputes.createdAt))
          .limit(200);
      }

      // Enrich with user info and trade value
      const usernamesByUserId = await getP2PUsernameMap(disputes.flatMap((dispute) => [
        dispute.initiatorId,
        dispute.respondentId,
      ]));

      const disputesWithDetails = await Promise.all(disputes.map(async (dispute) => {
        const [trade] = await db.select().from(p2pTrades).where(eq(p2pTrades.id, dispute.tradeId));

        return {
          ...dispute,
          initiatorName: usernamesByUserId.get(dispute.initiatorId) || "trader_user",
          respondentName: usernamesByUserId.get(dispute.respondentId) || "trader_user",
          tradeAmount: trade?.amount || "0",
          tradeCurrency: "USD",
        };
      }));

      // Sort by criticality if requested (open disputes first, then by date)
      if (sortBy === "criticality") {
        disputesWithDetails.sort((a, b) => {
          const statusOrder: Record<string, number> = { open: 0, investigating: 1, resolved: 2, closed: 3 };
          const statusDiff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          if (statusDiff !== 0) return statusDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }

      res.json(disputesWithDetails);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
