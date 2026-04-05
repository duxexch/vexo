import type { Express, Response } from "express";
import { db } from "../../db";
import {
  p2pDisputes,
  p2pDisputeRules,
  p2pPrewrittenResponses,
  p2pTrades,
  users,
} from "@shared/schema";
import { eq, or, desc, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage, prewrittenResponses, disputeRules, formatDispute } from "./helpers";
import { getP2PUsernameMap } from "../../lib/p2p-username";

/** GET /api/p2p/prewritten-responses, GET /api/p2p/dispute-rules, GET /api/p2p/disputes */
export function registerListingRoutes(app: Express) {

  app.get("/api/p2p/prewritten-responses", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({
          id: p2pPrewrittenResponses.id,
          category: p2pPrewrittenResponses.category,
          title: p2pPrewrittenResponses.title,
          titleAr: p2pPrewrittenResponses.titleAr,
          message: p2pPrewrittenResponses.message,
          messageAr: p2pPrewrittenResponses.messageAr,
        })
        .from(p2pPrewrittenResponses)
        .where(eq(p2pPrewrittenResponses.isActive, true))
        .orderBy(asc(p2pPrewrittenResponses.sortOrder), asc(p2pPrewrittenResponses.createdAt));

      if (rows.length === 0) {
        return res.json(prewrittenResponses);
      }

      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/dispute-rules", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({
          id: p2pDisputeRules.id,
          category: p2pDisputeRules.category,
          title: p2pDisputeRules.title,
          titleAr: p2pDisputeRules.titleAr,
          content: p2pDisputeRules.content,
          contentAr: p2pDisputeRules.contentAr,
          icon: p2pDisputeRules.icon,
        })
        .from(p2pDisputeRules)
        .where(eq(p2pDisputeRules.isActive, true))
        .orderBy(asc(p2pDisputeRules.sortOrder), asc(p2pDisputeRules.createdAt));

      if (rows.length === 0) {
        return res.json(disputeRules);
      }

      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // List disputes where user is initiator or respondent
  app.get("/api/p2p/disputes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const initiator = alias(users, "initiator");
      const respondent = alias(users, "respondent");

      const rows = await db
        .select({
          dispute_id: p2pDisputes.id,
          trade_id: p2pDisputes.tradeId,
          initiator_id: p2pDisputes.initiatorId,
          initiator_name: initiator.username,
          respondent_id: p2pDisputes.respondentId,
          respondent_name: respondent.username,
          dispute_status: p2pDisputes.status,
          reason: p2pDisputes.reason,
          description: p2pDisputes.description,
          dispute_created_at: p2pDisputes.createdAt,
          trade_amount: p2pTrades.amount,
          fiat_amount: p2pTrades.fiatAmount,
          currency_type: p2pTrades.currencyType,
        })
        .from(p2pDisputes)
        .innerJoin(p2pTrades, eq(p2pDisputes.tradeId, p2pTrades.id))
        .innerJoin(initiator, eq(p2pDisputes.initiatorId, initiator.id))
        .innerJoin(respondent, eq(p2pDisputes.respondentId, respondent.id))
        .where(
          or(
            eq(p2pDisputes.initiatorId, userId),
            eq(p2pDisputes.respondentId, userId),
          )
        )
        .orderBy(desc(p2pDisputes.createdAt));

      const usernamesByUserId = await getP2PUsernameMap(rows.flatMap((row) => [
        String(row.initiator_id),
        String(row.respondent_id),
      ]));

      res.json(rows.map((row) => formatDispute({
        ...row,
        initiator_name: usernamesByUserId.get(String(row.initiator_id)) || row.initiator_name,
        respondent_name: usernamesByUserId.get(String(row.respondent_id)) || row.respondent_name,
      })));
    } catch (error: unknown) {
      console.error("[P2P Disputes] GET /disputes error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
