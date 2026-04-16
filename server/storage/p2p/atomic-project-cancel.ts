import {
  p2pTrades, p2pOffers,
  projectCurrencyWallets, projectCurrencyLedger,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

type ProjectTradeSettlementResult = {
  success: boolean;
  trade?: P2PTrade;
  error?: string;
  transitioned?: boolean;
};

// ATOMIC P2P trade cancellation with PROJECT CURRENCY escrow refund
export async function cancelP2PTradeProjectCurrencyAtomic(tradeId: string, cancelledByUserId: string, reason?: string): Promise<ProjectTradeSettlementResult> {
  return await db.transaction(async (tx) => {
    // 1. Lock and verify trade
    const [trade] = await tx
      .select()
      .from(p2pTrades)
      .where(eq(p2pTrades.id, tradeId))
      .for('update');

    if (!trade) {
      return { success: false, error: 'Trade not found' };
    }

    if (trade.buyerId !== cancelledByUserId && trade.sellerId !== cancelledByUserId) {
      return { success: false, error: 'Not authorized to cancel this trade' };
    }

    // Idempotency: already cancelled - return success
    if (trade.status === 'cancelled') {
      return { success: true, trade, transitioned: false };
    }

    if (trade.status === 'completed') {
      return { success: false, error: 'Cannot cancel a completed trade' };
    }

    if (trade.status === 'confirmed') {
      return { success: false, error: 'Confirmed trades cannot be cancelled' };
    }

    if (trade.status === 'disputed') {
      return { success: false, error: 'Disputed trades must be resolved through dispute flow' };
    }

    if (trade.status !== 'pending' && trade.status !== 'paid') {
      return { success: false, error: 'Only pending or paid trades can be cancelled' };
    }

    const escrowAmount = parseFloat(trade.escrowAmount);
    const tradeAmount = parseFloat(trade.amount);

    // Get tracked escrow split for accurate refunds
    const escrowEarnedAmount = parseFloat(trade.escrowEarnedAmount || '0');
    const escrowPurchasedAmount = parseFloat(trade.escrowPurchasedAmount || '0');

    // 2. Refund escrow to seller if funds were held - using tracked split for accuracy
    if (escrowAmount > 0) {
      const [sellerWallet] = await tx
        .select()
        .from(projectCurrencyWallets)
        .where(eq(projectCurrencyWallets.userId, trade.sellerId))
        .for('update');

      if (sellerWallet) {
        const currentEarned = parseFloat(sellerWallet.earnedBalance);
        const currentPurchased = parseFloat(sellerWallet.purchasedBalance);

        // Refund to correct balance types using tracked split
        const newEarnedBalance = (currentEarned + escrowEarnedAmount).toFixed(8);
        const newPurchasedBalance = (currentPurchased + escrowPurchasedAmount).toFixed(8);

        await tx.update(projectCurrencyWallets)
          .set({
            earnedBalance: newEarnedBalance,
            purchasedBalance: newPurchasedBalance,
            updatedAt: new Date()
          })
          .where(eq(projectCurrencyWallets.userId, trade.sellerId));

        // Create separate refund ledger entries for earned and purchased
        if (escrowEarnedAmount > 0) {
          await tx.insert(projectCurrencyLedger).values({
            walletId: sellerWallet.id,
            userId: trade.sellerId,
            type: 'p2p_refund',
            amount: escrowEarnedAmount.toFixed(8),
            balanceBefore: currentEarned.toFixed(8),
            balanceAfter: newEarnedBalance,
            description: `P2P trade ${tradeId} - escrow refund (earned)`,
            referenceId: tradeId,
            metadata: JSON.stringify({ balanceType: 'earned' })
          });
        }

        if (escrowPurchasedAmount > 0) {
          await tx.insert(projectCurrencyLedger).values({
            walletId: sellerWallet.id,
            userId: trade.sellerId,
            type: 'p2p_refund',
            amount: escrowPurchasedAmount.toFixed(8),
            balanceBefore: currentPurchased.toFixed(8),
            balanceAfter: newPurchasedBalance,
            description: `P2P trade ${tradeId} - escrow refund (purchased)`,
            referenceId: tradeId,
            metadata: JSON.stringify({ balanceType: 'purchased' })
          });
        }
      }
    }

    // 3. Restore offer availability
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
            status: 'active',
            updatedAt: new Date()
          })
          .where(eq(p2pOffers.id, trade.offerId));
      }
    }

    // 4. Update trade status
    const [updatedTrade] = await tx.update(p2pTrades)
      .set({
        status: 'cancelled',
        cancelReason: reason || 'Cancelled by user',
        cancelledAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(p2pTrades.id, tradeId))
      .returning();

    return { success: true, trade: updatedTrade, transitioned: true };
  });
}
