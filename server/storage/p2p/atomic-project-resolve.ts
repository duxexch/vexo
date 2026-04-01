import {
    p2pOffers,
    p2pTrades,
    projectCurrencyLedger,
    projectCurrencyWallets,
    type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export async function resolveP2PDisputedTradeProjectCurrencyAtomic(
    tradeId: string,
    winnerUserId: string,
    reason?: string,
): Promise<{ success: boolean; trade?: P2PTrade; error?: string }> {
    return await db.transaction(async (tx) => {
        const [trade] = await tx
            .select()
            .from(p2pTrades)
            .where(eq(p2pTrades.id, tradeId))
            .for('update');

        if (!trade) {
            return { success: false, error: 'Trade not found' };
        }

        if (trade.status === 'completed' || trade.status === 'cancelled') {
            return { success: true, trade };
        }

        if (winnerUserId !== trade.buyerId && winnerUserId !== trade.sellerId) {
            return { success: false, error: 'Winner must be one of trade parties' };
        }

        if (!['disputed', 'pending', 'paid', 'confirmed'].includes(trade.status)) {
            return { success: false, error: `Unsupported trade status for dispute resolution: ${trade.status}` };
        }

        const escrowAmount = parseFloat(trade.escrowAmount);
        const tradeAmount = parseFloat(trade.amount);

        // Buyer wins: release escrow minus fee to buyer earned balance.
        if (winnerUserId === trade.buyerId) {
            const platformFee = parseFloat(trade.platformFee || '0');
            const releaseAmount = escrowAmount - platformFee;

            if (releaseAmount < 0) {
                return { success: false, error: 'Invalid escrow/fee configuration' };
            }

            let [buyerWallet] = await tx
                .select()
                .from(projectCurrencyWallets)
                .where(eq(projectCurrencyWallets.userId, trade.buyerId))
                .for('update');

            if (!buyerWallet) {
                const [created] = await tx.insert(projectCurrencyWallets)
                    .values({ userId: trade.buyerId })
                    .returning();
                buyerWallet = created;
            }

            const earnedBefore = parseFloat(buyerWallet.earnedBalance);
            const purchasedBefore = parseFloat(buyerWallet.purchasedBalance);
            const totalBefore = earnedBefore + purchasedBefore;
            const newEarned = (earnedBefore + releaseAmount).toFixed(8);
            const totalAfter = (totalBefore + releaseAmount).toFixed(8);

            await tx.update(projectCurrencyWallets)
                .set({ earnedBalance: newEarned, updatedAt: new Date() })
                .where(eq(projectCurrencyWallets.userId, trade.buyerId));

            const [updatedTrade] = await tx.update(p2pTrades)
                .set({
                    status: 'completed',
                    completedAt: new Date(),
                    cancelReason: null,
                    updatedAt: new Date(),
                })
                .where(eq(p2pTrades.id, tradeId))
                .returning();

            await tx.insert(projectCurrencyLedger).values({
                walletId: buyerWallet.id,
                userId: trade.buyerId,
                type: 'p2p_received',
                amount: releaseAmount.toFixed(8),
                balanceBefore: totalBefore.toFixed(8),
                balanceAfter: totalAfter,
                description: `P2P dispute resolution ${tradeId} - buyer awarded`,
                referenceId: tradeId,
                metadata: JSON.stringify({ balanceType: 'earned' }),
            });

            return { success: true, trade: updatedTrade };
        }

        // Seller wins: refund escrow with original split and cancel trade.
        const [sellerWallet] = await tx
            .select()
            .from(projectCurrencyWallets)
            .where(eq(projectCurrencyWallets.userId, trade.sellerId))
            .for('update');

        if (!sellerWallet) {
            return { success: false, error: 'Seller project currency wallet not found' };
        }

        const earnedRefund = parseFloat(trade.escrowEarnedAmount || '0');
        const purchasedRefund = parseFloat(trade.escrowPurchasedAmount || '0');
        const earnedBefore = parseFloat(sellerWallet.earnedBalance);
        const purchasedBefore = parseFloat(sellerWallet.purchasedBalance);

        const newEarned = (earnedBefore + earnedRefund).toFixed(8);
        const newPurchased = (purchasedBefore + purchasedRefund).toFixed(8);

        await tx.update(projectCurrencyWallets)
            .set({ earnedBalance: newEarned, purchasedBalance: newPurchased, updatedAt: new Date() })
            .where(eq(projectCurrencyWallets.userId, trade.sellerId));

        if (trade.offerId && tradeAmount > 0) {
            const [offer] = await tx
                .select()
                .from(p2pOffers)
                .where(eq(p2pOffers.id, trade.offerId))
                .for('update');

            if (offer) {
                const currentAvailable = parseFloat(offer.availableAmount);
                const restoredAvailable = (currentAvailable + tradeAmount).toFixed(8);
                await tx.update(p2pOffers)
                    .set({
                        availableAmount: restoredAvailable,
                        status: offer.status === 'cancelled' ? 'cancelled' : 'active',
                        updatedAt: new Date(),
                    })
                    .where(eq(p2pOffers.id, trade.offerId));
            }
        }

        const [updatedTrade] = await tx.update(p2pTrades)
            .set({
                status: 'cancelled',
                cancelReason: reason || 'Dispute resolved in favor of seller',
                cancelledAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(p2pTrades.id, tradeId))
            .returning();

        if (earnedRefund > 0) {
            await tx.insert(projectCurrencyLedger).values({
                walletId: sellerWallet.id,
                userId: trade.sellerId,
                type: 'p2p_refund',
                amount: earnedRefund.toFixed(8),
                balanceBefore: earnedBefore.toFixed(8),
                balanceAfter: newEarned,
                description: `P2P dispute resolution ${tradeId} - seller earned refund`,
                referenceId: tradeId,
                metadata: JSON.stringify({ balanceType: 'earned' }),
            });
        }

        if (purchasedRefund > 0) {
            await tx.insert(projectCurrencyLedger).values({
                walletId: sellerWallet.id,
                userId: trade.sellerId,
                type: 'p2p_refund',
                amount: purchasedRefund.toFixed(8),
                balanceBefore: purchasedBefore.toFixed(8),
                balanceAfter: newPurchased,
                description: `P2P dispute resolution ${tradeId} - seller purchased refund`,
                referenceId: tradeId,
                metadata: JSON.stringify({ balanceType: 'purchased' }),
            });
        }

        return { success: true, trade: updatedTrade };
    });
}