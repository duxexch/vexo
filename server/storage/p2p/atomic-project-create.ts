import {
  p2pTrades, p2pOffers,
  projectCurrencyWallets, projectCurrencyLedger,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// ==================== ATOMIC P2P TRADE CREATION (PROJECT CURRENCY) ====================

export async function createP2PTradeProjectCurrencyAtomic(params: {
  offerId: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  fiatAmount: string;
  price: string;
  paymentMethod: string;
  platformFee: string;
  expiresAt: Date;
}): Promise<{ success: boolean; trade?: P2PTrade; error?: string }> {
  const tradeAmount = parseFloat(params.amount);
  if (isNaN(tradeAmount) || tradeAmount <= 0) {
    return { success: false, error: 'Invalid amount' };
  }

  return await db.transaction(async (tx) => {
    // 1. Lock the offer row and verify availability
    const [offer] = await tx
      .select()
      .from(p2pOffers)
      .where(eq(p2pOffers.id, params.offerId))
      .for('update');

    if (!offer) {
      return { success: false, error: 'Offer not found' };
    }

    if (offer.status !== 'active') {
      return { success: false, error: 'Offer is no longer active' };
    }

    const availableAmount = parseFloat(offer.availableAmount);
    if (tradeAmount > availableAmount) {
      return { success: false, error: `Insufficient available amount. Maximum: ${availableAmount}` };
    }

    // 2. Lock seller's PROJECT CURRENCY wallet and debit escrow
    const [sellerWallet] = await tx
      .select()
      .from(projectCurrencyWallets)
      .where(eq(projectCurrencyWallets.userId, params.sellerId))
      .for('update');

    if (!sellerWallet) {
      return { success: false, error: 'Seller project currency wallet not found' };
    }

    // Calculate total balance (deduct from earned first)
    let earnedBalance = parseFloat(sellerWallet.earnedBalance);
    let purchasedBalance = parseFloat(sellerWallet.purchasedBalance);
    const totalBalance = earnedBalance + purchasedBalance;

    if (totalBalance < tradeAmount) {
      return { success: false, error: 'Seller has insufficient project currency for escrow' };
    }

    // Deduct from earned first, then purchased - track amounts for accurate refunds
    let remaining = tradeAmount;
    let earnedDeducted = 0;
    let purchasedDeducted = 0;
    
    if (earnedBalance >= remaining) {
      earnedDeducted = remaining;
      earnedBalance -= remaining;
      remaining = 0;
    } else {
      earnedDeducted = earnedBalance;
      remaining -= earnedBalance;
      earnedBalance = 0;
      purchasedDeducted = remaining;
      purchasedBalance -= remaining;
    }

    // 3. Debit seller's project currency (escrow hold)
    await tx.update(projectCurrencyWallets)
      .set({ 
        earnedBalance: earnedBalance.toFixed(8),
        purchasedBalance: purchasedBalance.toFixed(8),
        updatedAt: new Date() 
      })
      .where(eq(projectCurrencyWallets.userId, params.sellerId));

    // 4. Update offer availability
    const newAvailable = (availableAmount - tradeAmount).toFixed(8);
    await tx.update(p2pOffers)
      .set({
        availableAmount: newAvailable,
        status: parseFloat(newAvailable) <= 0 ? 'completed' : 'active',
        updatedAt: new Date()
      })
      .where(eq(p2pOffers.id, params.offerId));

    // 5. Create the trade record with currencyType='project' - track escrow split for accurate refunds
    const [trade] = await tx.insert(p2pTrades).values({
      offerId: params.offerId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      status: 'pending',
      amount: params.amount,
      fiatAmount: params.fiatAmount,
      price: params.price,
      paymentMethod: params.paymentMethod,
      escrowAmount: params.amount,
      escrowEarnedAmount: earnedDeducted.toFixed(8),
      escrowPurchasedAmount: purchasedDeducted.toFixed(8),
      platformFee: params.platformFee,
      currencyType: 'project',
      expiresAt: params.expiresAt,
    }).returning();

    // 6. Create ledger entries for audit - separate entries for earned and purchased
    if (earnedDeducted > 0) {
      await tx.insert(projectCurrencyLedger).values({
        walletId: sellerWallet.id,
        userId: params.sellerId,
        type: 'p2p_escrow',
        amount: (-earnedDeducted).toFixed(8),
        balanceBefore: (parseFloat(sellerWallet.earnedBalance)).toFixed(8),
        balanceAfter: earnedBalance.toFixed(8),
        description: `P2P trade ${trade.id} - escrow hold (earned)`,
        referenceId: trade.id,
        metadata: JSON.stringify({ balanceType: 'earned' })
      });
    }
    
    if (purchasedDeducted > 0) {
      await tx.insert(projectCurrencyLedger).values({
        walletId: sellerWallet.id,
        userId: params.sellerId,
        type: 'p2p_escrow',
        amount: (-purchasedDeducted).toFixed(8),
        balanceBefore: (parseFloat(sellerWallet.purchasedBalance)).toFixed(8),
        balanceAfter: purchasedBalance.toFixed(8),
        description: `P2P trade ${trade.id} - escrow hold (purchased)`,
        referenceId: trade.id,
        metadata: JSON.stringify({ balanceType: 'purchased' })
      });
    }

    return { success: true, trade };
  });
}
