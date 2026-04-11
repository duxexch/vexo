import {
  p2pTrades,
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

// ATOMIC P2P trade completion with PROJECT CURRENCY escrow release
export async function completeP2PTradeProjectCurrencyAtomic(tradeId: string, completedByUserId: string): Promise<ProjectTradeSettlementResult> {
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

    // 2. Get or create buyer's project currency wallet
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

    const buyerTotalBefore = parseFloat(buyerWallet.earnedBalance) + parseFloat(buyerWallet.purchasedBalance);
    const newEarnedBalance = (parseFloat(buyerWallet.earnedBalance) + releaseAmount).toFixed(8);

    await tx.update(projectCurrencyWallets)
      .set({ earnedBalance: newEarnedBalance, updatedAt: new Date() })
      .where(eq(projectCurrencyWallets.userId, trade.buyerId));

    // 3. Update trade status
    const [updatedTrade] = await tx.update(p2pTrades)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(p2pTrades.id, tradeId))
      .returning();

    // 4. Create ledger entry for audit
    await tx.insert(projectCurrencyLedger).values({
      walletId: buyerWallet.id,
      userId: trade.buyerId,
      type: 'p2p_received',
      amount: releaseAmount.toFixed(8),
      balanceBefore: buyerTotalBefore.toFixed(8),
      balanceAfter: (buyerTotalBefore + releaseAmount).toFixed(8),
      description: `P2P trade ${tradeId} - funds received`,
      referenceId: tradeId,
      metadata: JSON.stringify({ balanceType: 'earned' })
    });

    return { success: true, trade: updatedTrade, transitioned: true };
  });
}
