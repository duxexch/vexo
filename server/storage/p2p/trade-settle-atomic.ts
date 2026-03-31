import {
  users, transactions,
  p2pTrades, p2pOffers,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// ATOMIC P2P trade completion with escrow release
export async function completeP2PTradeAtomic(tradeId: string, completedByUserId: string): Promise<{ success: boolean; trade?: P2PTrade; error?: string }> {
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

    // Idempotency: already completed - return success
    if (trade.status === 'completed') {
      return { success: true, trade };
    }

    if (trade.sellerId !== completedByUserId) {
      return { success: false, error: 'Only the seller can complete the trade' };
    }

    if (trade.status !== 'confirmed') {
      return { success: false, error: 'Trade payment not confirmed yet' };
    }

    const escrowAmount = parseFloat(trade.escrowAmount);
    const platformFee = parseFloat(trade.platformFee || '0');
    const releaseAmount = escrowAmount - platformFee;

    // 2. Lock buyer's balance and credit
    const [buyer] = await tx
      .select()
      .from(users)
      .where(eq(users.id, trade.buyerId))
      .for('update');

    if (!buyer) {
      return { success: false, error: 'Buyer not found' };
    }

    const buyerBalance = parseFloat(buyer.balance);
    const newBuyerBalance = (buyerBalance + releaseAmount).toFixed(2);

    await tx.update(users)
      .set({ balance: newBuyerBalance, updatedAt: new Date() })
      .where(eq(users.id, trade.buyerId));

    // 3. Update trade status
    const [updatedTrade] = await tx.update(p2pTrades)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(p2pTrades.id, tradeId))
      .returning();

    // 4. Create transaction record for audit
    await tx.insert(transactions).values({
      userId: trade.buyerId,
      type: 'deposit',
      amount: releaseAmount.toFixed(2),
      balanceBefore: buyerBalance.toFixed(2),
      balanceAfter: newBuyerBalance,
      status: 'completed',
      description: `P2P trade ${tradeId} - funds received`,
      processedAt: new Date()
    });

    return { success: true, trade: updatedTrade };
  });
}

// ATOMIC P2P trade cancellation with escrow refund and offer restoration
export async function cancelP2PTradeAtomic(tradeId: string, cancelledByUserId: string, reason?: string): Promise<{ success: boolean; trade?: P2PTrade; error?: string }> {
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

    // Idempotency: already cancelled - return success
    if (trade.status === 'cancelled') {
      return { success: true, trade };
    }

    if (trade.buyerId !== cancelledByUserId && trade.sellerId !== cancelledByUserId) {
      return { success: false, error: 'Not authorized to cancel this trade' };
    }

    if (trade.status === 'completed') {
      return { success: false, error: 'Cannot cancel a completed trade' };
    }

    const escrowAmount = parseFloat(trade.escrowAmount);
    const tradeAmount = parseFloat(trade.amount);

    // 2. Refund escrow to seller if funds were held
    if (escrowAmount > 0) {
      const [seller] = await tx
        .select()
        .from(users)
        .where(eq(users.id, trade.sellerId))
        .for('update');

      if (seller) {
        const sellerBalance = parseFloat(seller.balance);
        const newSellerBalance = (sellerBalance + escrowAmount).toFixed(2);

        await tx.update(users)
          .set({ balance: newSellerBalance, updatedAt: new Date() })
          .where(eq(users.id, trade.sellerId));

        // Create refund transaction record
        await tx.insert(transactions).values({
          userId: trade.sellerId,
          type: 'deposit',
          amount: trade.escrowAmount,
          balanceBefore: sellerBalance.toFixed(2),
          balanceAfter: newSellerBalance,
          status: 'completed',
          description: `P2P trade ${tradeId} - escrow refund`,
          processedAt: new Date()
        });
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

    return { success: true, trade: updatedTrade };
  });
}
