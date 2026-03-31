import {
  users, transactions,
  p2pTrades, p2pOffers,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// ==================== ATOMIC P2P TRADE CREATION (BASE CURRENCY) ====================

export async function createP2PTradeAtomic(params: {
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

    // 2. Lock seller's balance and debit escrow
    const [seller] = await tx
      .select()
      .from(users)
      .where(eq(users.id, params.sellerId))
      .for('update');

    if (!seller) {
      return { success: false, error: 'Seller not found' };
    }

    const sellerBalance = parseFloat(seller.balance);
    if (sellerBalance < tradeAmount) {
      return { success: false, error: 'Seller has insufficient balance for escrow' };
    }

    // 3. Debit seller's balance (escrow hold)
    const newSellerBalance = (sellerBalance - tradeAmount).toFixed(2);
    await tx.update(users)
      .set({ balance: newSellerBalance, updatedAt: new Date() })
      .where(eq(users.id, params.sellerId));

    // 4. Update offer availability
    const newAvailable = (availableAmount - tradeAmount).toFixed(8);
    await tx.update(p2pOffers)
      .set({
        availableAmount: newAvailable,
        status: parseFloat(newAvailable) <= 0 ? 'completed' : 'active',
        updatedAt: new Date()
      })
      .where(eq(p2pOffers.id, params.offerId));

    // 5. Create the trade record
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
      platformFee: params.platformFee,
      expiresAt: params.expiresAt,
    }).returning();

    // 6. Create escrow transaction record for audit
    await tx.insert(transactions).values({
      userId: params.sellerId,
      type: 'withdrawal',
      amount: params.amount,
      balanceBefore: sellerBalance.toFixed(2),
      balanceAfter: newSellerBalance,
      status: 'completed',
      description: `P2P trade ${trade.id} - escrow hold`,
      processedAt: new Date()
    });

    return { success: true, trade };
  });
}
