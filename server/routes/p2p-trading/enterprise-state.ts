import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import {
    mapTradeStatusToEnterpriseAccountingState,
    mapTradeStatusToEnterpriseBusinessState,
    mapTradeStatusToEnterpriseOperationalState,
} from "./enterprise-bridge";
import { getErrorMessage } from "./helpers";

/**
 * Read-only enterprise projection for the legacy P2P trade model.
 * This does not change any live workflow. It exposes the new business /
 * operational / accounting state layers for UI, admin, and reconciliation
 * consumers.
 */
export function registerP2PEnterpriseStateRoutes(app: Express) {
    app.get("/api/p2p/trades/:id/enterprise-state", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const trade = await storage.getP2PTrade(req.params.id);
            if (!trade) {
                return res.status(404).json({ error: "Trade not found" });
            }

            if (trade.buyerId !== req.user!.id && trade.sellerId !== req.user!.id && req.user!.role !== "admin" && req.user!.role !== "super_admin") {
                return res.status(403).json({ error: "Not authorized to view this trade" });
            }

            res.json({
                tradeId: trade.id,
                tradeStatus: trade.status,
                enterpriseState: {
                    business: mapTradeStatusToEnterpriseBusinessState(trade.status),
                    operational: mapTradeStatusToEnterpriseOperationalState(trade.status),
                    accounting: mapTradeStatusToEnterpriseAccountingState(trade.status),
                },
                generatedAt: new Date().toISOString(),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
