import {
  users, transactions,
  p2pTrades, p2pOffers,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { adjustUserCurrencyBalance } from "../../lib/wallet-balances";

type TradeSettlementResult = {
  success: boolean;
  trade?: P2PTrade;
  error?: string;
  transitioned?: boolean;
};

// ATOMIC P2P trade completion with escrow release
export async function completeP2PTradeAtomic(tradeId: string, completedByUserId: string): Promise<TradeSettlementResult> {
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

    if (trade.sellerId !== completedByUserId) {
      return { success: false, error: 'Only the seller can complete the trade' };
    }

    // Idempotency: already completed - return success
    if (trade.status === 'completed') {
      return { success: true, trade, transitioned: false };
    }

    if (trade.status !== 'confirmed') {
      return { success: false, error: 'Trade payment not confirmed yet' };
    }

    const escrowAmount = parseFloat(trade.escrowAmount);
    const platformFee = parseFloat(trade.platformFee || '0');

    if (!Number.isFinite(escrowAmount) || escrowAmount < 0 || !Number.isFinite(platformFee) || platformFee < 0) {
      return { success: false, error: 'Invalid escrow/fee configuration' };
    }

    const releaseAmount = escrowAmount - platformFee;

    if (releaseAmount < 0) {
      return { success: false, error: 'Invalid escrow/fee configuration' };
    }

    // 2. Lock buyer row, then credit through wallet helper. The buyer is paid
    //    in the same currency the seller's escrow was held in (trade.walletCurrency
    //    NULL = legacy primary path).
    const [buyer] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, trade.buyerId))
      .for('update');

    if (!buyer) {
      return { success: false, error: 'Buyer not found' };
    }

    const adjusted = await adjustUserCurrencyBalance(
      tx,
      trade.buyerId,
      trade.walletCurrency ?? null,
      releaseAmount,
      { allowCreate: true, allowOutsideAllowList: true },
    );

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
      balanceBefore: adjusted.balanceBefore.toFixed(2),
      balanceAfter: adjusted.balanceAfter.toFixed(2),
      status: 'completed',
      description: `P2P trade ${tradeId} - funds received`,
      processedAt: new Date()
    });

    return { success: true, trade: updatedTrade, transitioned: true };
  });
}

// ATOMIC P2P trade cancellation with escrow refund and offer restoration
export async function cancelP2PTradeAtomic(tradeId: string, cancelledByUserId: string, reason?: string): Promise<TradeSettlementResult> {
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

    // 2. Refund escrow to seller (in the wallet it was held in) if funds were held.
    if (escrowAmount > 0) {
      const [seller] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, trade.sellerId))
        .for('update');

      if (seller) {
        const adjusted = await adjustUserCurrencyBalance(
          tx,
          trade.sellerId,
          trade.walletCurrency ?? null,
          escrowAmount,
          { allowCreate: true, allowOutsideAllowList: true },
        );

        // Create refund transaction record
        await tx.insert(transactions).values({
          userId: trade.sellerId,
          type: 'deposit',
          amount: trade.escrowAmount,
          balanceBefore: adjusted.balanceBefore.toFixed(2),
          balanceAfter: adjusted.balanceAfter.toFixed(2),
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

    return { success: true, trade: updatedTrade, transitioned: true };
  });
}

// Resolve disputed/base-currency trade atomically in favor of buyer or seller.
export async function resolveP2PDisputedTradeAtomic(
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

    // Buyer wins: release escrow minus fee to buyer (in escrow's wallet currency).
    if (winnerUserId === trade.buyerId) {
      const platformFee = parseFloat(trade.platformFee || '0');
      const releaseAmount = escrowAmount - platformFee;

      if (releaseAmount < 0) {
        return { success: false, error: 'Invalid escrow/fee configuration' };
      }

      const [buyer] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, trade.buyerId))
        .for('update');

      if (!buyer) {
        return { success: false, error: 'Buyer not found' };
      }

      const adjusted = await adjustUserCurrencyBalance(
        tx,
        trade.buyerId,
        trade.walletCurrency ?? null,
        releaseAmount,
        { allowCreate: true, allowOutsideAllowList: true },
      );

      const [updatedTrade] = await tx.update(p2pTrades)
        .set({
          status: 'completed',
          completedAt: new Date(),
          cancelReason: null,
          updatedAt: new Date(),
        })
        .where(eq(p2pTrades.id, tradeId))
        .returning();

      await tx.insert(transactions).values({
        userId: trade.buyerId,
        type: 'deposit',
        amount: releaseAmount.toFixed(2),
        balanceBefore: adjusted.balanceBefore.toFixed(2),
        balanceAfter: adjusted.balanceAfter.toFixed(2),
        status: 'completed',
        description: `P2P dispute resolution ${tradeId} - buyer awarded`,
        processedAt: new Date(),
      });

      return { success: true, trade: updatedTrade };
    }

    // Seller wins: refund full escrow back to seller (in the wallet it was held in)
    // and cancel trade.
    const [seller] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, trade.sellerId))
      .for('update');

    if (!seller) {
      return { success: false, error: 'Seller not found' };
    }

    const adjusted = await adjustUserCurrencyBalance(
      tx,
      trade.sellerId,
      trade.walletCurrency ?? null,
      escrowAmount,
      { allowCreate: true, allowOutsideAllowList: true },
    );

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

    await tx.insert(transactions).values({
      userId: trade.sellerId,
      type: 'deposit',
      amount: trade.escrowAmount,
      balanceBefore: adjusted.balanceBefore.toFixed(2),
      balanceAfter: adjusted.balanceAfter.toFixed(2),
      status: 'completed',
      description: `P2P dispute resolution ${tradeId} - seller refund`,
      processedAt: new Date(),
    });

    return { success: true, trade: updatedTrade };
  });
}
