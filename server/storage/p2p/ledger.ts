import { db } from "../../db";
import {
    p2pTrades,
    p2pOffers,
    p2pTransactionLogs,
    type P2PTrade,
    type P2POffer,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
    createP2PAuditRef,
    isP2PReconciliationHealthy,
    type P2PActionRecommendation,
    type P2PLedgerAccountType,
    type P2PLedgerEntry,
    type P2PLedgerEntryType,
    type P2PLedgerReferenceType,
    type P2PAccountingState,
    type P2PBusinessState,
    type P2POperationalState,
    type P2PReconciliationRun,
    type P2PReconciliationStatus,
    type P2PRiskScore,
    type P2PRiskTier,
    type P2PTradeStateEvent,
} from "../../../shared/p2p-enterprise";

export type P2PLedgerPostingInput = {
    userId: string;
    tradeId?: string | null;
    offerId?: string | null;
    type: P2PLedgerEntryType;
    amount: string;
    currency: string;
    fee?: string;
    referenceType: P2PLedgerReferenceType;
    referenceId: string;
    ledgerAccountType: P2PLedgerAccountType;
    balanceBefore: string;
    balanceAfter: string;
    idempotencyKey: string;
};

export type P2PTradeProjection = {
    trade: P2PTrade;
    offer?: P2POffer;
    enterpriseState: {
        business: P2PBusinessState;
        operational: P2POperationalState;
        accounting: P2PAccountingState;
    };
};

export async function buildP2PTradeProjection(tradeId: string): Promise<P2PTradeProjection | undefined> {
    const [trade] = await db.select().from(p2pTrades).where(eq(p2pTrades.id, tradeId)).limit(1);
    if (!trade) {
        return undefined;
    }

    const [offer] = await db.select().from(p2pOffers).where(eq(p2pOffers.id, trade.offerId)).limit(1);

    return {
        trade,
        offer,
        enterpriseState: {
            business: trade.status === "completed" || trade.status === "cancelled" ? "expired" : "active",
            operational: trade.status === "pending"
                ? "awaiting_payment"
                : trade.status === "paid"
                    ? "payment_sent"
                    : trade.status === "confirmed"
                        ? "awaiting_confirmation"
                        : trade.status === "completed"
                            ? "completed"
                            : trade.status === "cancelled"
                                ? "cancelled"
                                : "disputed",
            accounting: trade.status === "pending"
                ? "no_funds"
                : trade.status === "paid"
                    ? "funds_reserved"
                    : trade.status === "confirmed"
                        ? "funds_locked_in_escrow"
                        : trade.status === "completed"
                            ? "funds_released"
                            : trade.status === "cancelled"
                                ? "funds_refunded"
                                : "funds_locked_in_escrow",
        },
    };
}

export async function appendP2PTradeLedgerLog(params: {
    tradeId: string;
    userId: string;
    action: string;
    description: string;
    descriptionAr?: string | null;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    await db.insert(p2pTransactionLogs).values({
        tradeId: params.tradeId,
        userId: params.userId,
        action: params.action as never,
        description: params.description,
        descriptionAr: params.descriptionAr ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: null,
        userAgent: null,
    });
}

export function createP2PLedgerEntry(input: P2PLedgerPostingInput): P2PLedgerEntry {
    return {
        entryId: createP2PAuditRef("p2p_ledger"),
        userId: input.userId,
        tradeId: input.tradeId ?? null,
        offerId: input.offerId ?? null,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        fee: input.fee ?? "0",
        balanceBefore: input.balanceBefore,
        balanceAfter: input.balanceAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        ledgerAccountType: input.ledgerAccountType,
        timestamp: new Date().toISOString(),
        idempotencyKey: input.idempotencyKey,
        auditRef: createP2PAuditRef("p2p_audit"),
    };
}

export function createP2PTradeStateEvent(input: {
    tradeId: string;
    fromBusinessState: P2PBusinessState;
    toBusinessState: P2PBusinessState;
    fromOperationalState: P2POperationalState;
    toOperationalState: P2POperationalState;
    fromAccountingState: P2PAccountingState;
    toAccountingState: P2PAccountingState;
    actorUserId: string;
    reason: string;
    idempotencyKey: string;
}): P2PTradeStateEvent {
    return {
        eventId: createP2PAuditRef("p2p_state"),
        tradeId: input.tradeId,
        fromBusinessState: input.fromBusinessState,
        toBusinessState: input.toBusinessState,
        fromOperationalState: input.fromOperationalState,
        toOperationalState: input.toOperationalState,
        fromAccountingState: input.fromAccountingState,
        toAccountingState: input.toAccountingState,
        actorUserId: input.actorUserId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        timestamp: new Date().toISOString(),
    };
}

export function createP2PReconciliationRun(input: {
    businessDate: string;
    totalOffersCreated: number;
    totalTradesOpened: number;
    totalEscrowLocked: string;
    completedTrades: number;
    cancelledTrades: number;
    disputedTrades: number;
    totalFeesCollected: string;
    walletBalanceTotal: string;
    ledgerBalanceTotal: string;
    mismatchCount: number;
    generatedAt?: string;
}): P2PReconciliationRun {
    return {
        id: createP2PAuditRef("p2p_recon"),
        businessDate: input.businessDate,
        totalOffersCreated: input.totalOffersCreated,
        totalTradesOpened: input.totalTradesOpened,
        totalEscrowLocked: input.totalEscrowLocked,
        completedTrades: input.completedTrades,
        cancelledTrades: input.cancelledTrades,
        disputedTrades: input.disputedTrades,
        totalFeesCollected: input.totalFeesCollected,
        walletBalanceTotal: input.walletBalanceTotal,
        ledgerBalanceTotal: input.ledgerBalanceTotal,
        mismatchCount: input.mismatchCount,
        status: isP2PReconciliationHealthy(input.mismatchCount),
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        auditRef: createP2PAuditRef("p2p_audit"),
    };
}

export function createP2PRiskScore(input: {
    userId: string;
    score: number;
    trustTier: P2PRiskTier;
    actionRecommendation: P2PActionRecommendation;
    signals?: Record<string, unknown>;
    tradeId?: string | null;
    createdAt?: string;
}): P2PRiskScore {
    return {
        id: createP2PAuditRef("p2p_risk"),
        userId: input.userId,
        tradeId: input.tradeId ?? null,
        score: input.score,
        trustTier: input.trustTier,
        signals: input.signals ?? {},
        actionRecommendation: input.actionRecommendation,
        createdAt: input.createdAt ?? new Date().toISOString(),
    };
}
