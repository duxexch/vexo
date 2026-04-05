import {
    p2pTrades,
    type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

type PaymentTransitionResult = {
    success: boolean;
    trade?: P2PTrade;
    error?: string;
    transitioned?: boolean;
};

export async function markP2PTradePaidAtomic(
    tradeId: string,
    buyerId: string,
    paymentReference?: unknown,
): Promise<PaymentTransitionResult> {
    return await db.transaction(async (tx) => {
        const [trade] = await tx
            .select()
            .from(p2pTrades)
            .where(eq(p2pTrades.id, tradeId))
            .for('update');

        if (!trade) {
            return { success: false, error: 'Trade not found' };
        }

        if (trade.buyerId !== buyerId) {
            return { success: false, error: 'Only the buyer can mark payment' };
        }

        if (trade.status === 'paid') {
            return { success: true, trade, transitioned: false };
        }

        if (trade.status !== 'pending') {
            return { success: false, error: 'Trade is not in pending status' };
        }

        const normalizedPaymentReference = typeof paymentReference === 'string'
            ? paymentReference.trim().slice(0, 255)
            : null;

        const [updatedTrade] = await tx.update(p2pTrades)
            .set({
                status: 'paid',
                paymentReference: normalizedPaymentReference,
                paidAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(p2pTrades.id, tradeId))
            .returning();

        return { success: true, trade: updatedTrade, transitioned: true };
    });
}

export async function confirmP2PTradePaymentAtomic(
    tradeId: string,
    sellerId: string,
): Promise<PaymentTransitionResult> {
    return await db.transaction(async (tx) => {
        const [trade] = await tx
            .select()
            .from(p2pTrades)
            .where(eq(p2pTrades.id, tradeId))
            .for('update');

        if (!trade) {
            return { success: false, error: 'Trade not found' };
        }

        if (trade.sellerId !== sellerId) {
            return { success: false, error: 'Only the seller can confirm payment' };
        }

        if (trade.status === 'confirmed') {
            return { success: true, trade, transitioned: false };
        }

        if (trade.status !== 'paid') {
            return { success: false, error: 'Trade payment not marked yet' };
        }

        const [updatedTrade] = await tx.update(p2pTrades)
            .set({
                status: 'confirmed',
                confirmedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(p2pTrades.id, tradeId))
            .returning();

        return { success: true, trade: updatedTrade, transitioned: true };
    });
}