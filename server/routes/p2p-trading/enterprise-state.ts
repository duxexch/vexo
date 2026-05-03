import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import {
    mapTradeStatusToEnterpriseAccountingState,
    mapTradeStatusToEnterpriseBusinessState,
    mapTradeStatusToEnterpriseOperationalState,
} from "./enterprise-bridge";
import { getErrorMessage } from "./helpers";
import { isP2PFinancialIdempotencyKey } from "../../../shared/p2p-enterprise";

/**
 * Read-only enterprise projection for the legacy P2P trade model.
 * This does not change any live workflow. It exposes the new business /
 * operational / accounting state layers for UI, admin, and reconciliation
 * consumers.
 */
function assertEnterpriseFinality(trade: {
    status: string;
    runtime?: {
        escrowState?: string;
        ledgerState?: string;
        idempotencyConfirmed?: boolean;
        finalityHash?: string;
        ledgerCommitId?: string;
        escrowReleaseTx?: string;
    } | null;
}): { ok: boolean; reason?: string } {
    if (trade.status !== "completed") {
        return { ok: false, reason: "Trade is not in a completed state" };
    }

    if (trade.runtime?.escrowState !== "released") {
        return { ok: false, reason: "Escrow finality has not been confirmed" };
    }

    if (trade.runtime?.ledgerState !== "committed") {
        return { ok: false, reason: "Ledger finality has not been confirmed" };
    }

    if (trade.runtime?.idempotencyConfirmed !== true) {
        return { ok: false, reason: "Idempotency has not been confirmed" };
    }

    if (
        !trade.runtime?.finalityHash
        || !trade.runtime?.ledgerCommitId
        || !trade.runtime?.escrowReleaseTx
    ) {
        return { ok: false, reason: "Finality proof is incomplete" };
    }

    if (!isP2PFinancialIdempotencyKey(trade.runtime.ledgerCommitId)) {
        return { ok: false, reason: "Ledger commit reference is invalid" };
    }

    return { ok: true };
}

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

            const finality = assertEnterpriseFinality(trade as typeof trade & {
                runtime?: {
                    escrowState?: string;
                    ledgerState?: string;
                    idempotencyConfirmed?: boolean;
                    finalityHash?: string;
                    ledgerCommitId?: string;
                    escrowReleaseTx?: string;
                } | null;
            });
            if (!finality.ok) {
                return res.status(409).json({
                    error: finality.reason || "Trade finality is not verified",
                    tradeId: trade.id,
                    tradeStatus: trade.status,
                    generatedAt: new Date().toISOString(),
                });
            }

            res.json({
                tradeId: trade.id,
                tradeStatus: trade.status,
                finality: {
                    verified: true,
                    proofHash: (trade as { runtime?: { finalityHash?: string } }).runtime?.finalityHash,
                    ledgerCommitId: (trade as { runtime?: { ledgerCommitId?: string } }).runtime?.ledgerCommitId,
                    escrowReleaseTx: (trade as { runtime?: { escrowReleaseTx?: string } }).runtime?.escrowReleaseTx,
                },
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
