import {
  users, transactions,
  p2pTrades, p2pOffers, p2pTraderProfiles, badgeCatalog, userBadges,
  type P2PTrade,
} from "@shared/schema";
import { db } from "../../db";
import { and, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { resolveEffectiveP2PMonthlyLimit } from "../../lib/user-badge-entitlements";

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
  const tradeFiatAmount = parseFloat(params.fiatAmount);
  if (isNaN(tradeAmount) || tradeAmount <= 0) {
    return { success: false, error: 'Invalid amount' };
  }

  if (isNaN(tradeFiatAmount) || tradeFiatAmount <= 0) {
    return { success: false, error: 'Invalid fiat amount' };
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

    // 2. Lock participant profiles and enforce trading permission + monthly limit atomically.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const participantIds = Array.from(new Set([params.buyerId, params.sellerId])).sort((a, b) => a.localeCompare(b));

    for (const participantId of participantIds) {
      const [profile] = await tx
        .select({
          canTradeP2P: p2pTraderProfiles.canTradeP2P,
          monthlyTradeLimit: p2pTraderProfiles.monthlyTradeLimit,
        })
        .from(p2pTraderProfiles)
        .where(eq(p2pTraderProfiles.userId, participantId))
        .limit(1)
        .for('update');

      const [badgeEntitlements] = await tx
        .select({
          grantsP2pPrivileges: sql<boolean>`coalesce(bool_or(${badgeCatalog.grantsP2pPrivileges}), false)`,
          maxP2PMonthlyLimit: sql<string | null>`max(${badgeCatalog.p2pMonthlyLimit})`,
        })
        .from(userBadges)
        .innerJoin(badgeCatalog, eq(userBadges.badgeId, badgeCatalog.id))
        .where(and(
          eq(userBadges.userId, participantId),
          eq(badgeCatalog.isActive, true),
        ));

      const participantRole = participantId === params.buyerId ? 'Buyer' : 'Seller';

      const canTradeP2P = Boolean(profile?.canTradeP2P) || Boolean(badgeEntitlements?.grantsP2pPrivileges);
      const baseMonthlyLimit = profile?.monthlyTradeLimit !== null && profile?.monthlyTradeLimit !== undefined
        ? Number(profile.monthlyTradeLimit)
        : null;
      const badgeMonthlyLimit = badgeEntitlements?.maxP2PMonthlyLimit !== null && badgeEntitlements?.maxP2PMonthlyLimit !== undefined
        ? Number(badgeEntitlements.maxP2PMonthlyLimit)
        : null;
      const monthlyLimit = resolveEffectiveP2PMonthlyLimit(baseMonthlyLimit, badgeMonthlyLimit, Boolean(profile));

      if (!canTradeP2P) {
        return { success: false, error: `${participantRole} is not approved for P2P trading` };
      }

      if (monthlyLimit !== null) {
        const [usageRow] = await tx
          .select({
            total: sql<string>`coalesce(sum(cast(${p2pTrades.fiatAmount} as numeric)), 0)`,
          })
          .from(p2pTrades)
          .where(and(
            or(eq(p2pTrades.buyerId, participantId), eq(p2pTrades.sellerId, participantId)),
            ne(p2pTrades.status, 'cancelled'),
            gte(p2pTrades.createdAt, monthStart),
            lt(p2pTrades.createdAt, nextMonthStart),
          ));

        const monthlyUsed = Number(usageRow?.total || 0);
        if ((monthlyUsed + tradeFiatAmount) > monthlyLimit) {
          return { success: false, error: `${participantRole} monthly trading limit exceeded` };
        }
      }
    }

    // 3. Lock seller's balance and debit escrow
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

    // 4. Debit seller's balance (escrow hold)
    const newSellerBalance = (sellerBalance - tradeAmount).toFixed(2);
    await tx.update(users)
      .set({ balance: newSellerBalance, updatedAt: new Date() })
      .where(eq(users.id, params.sellerId));

    // 5. Update offer availability
    const newAvailable = (availableAmount - tradeAmount).toFixed(8);
    await tx.update(p2pOffers)
      .set({
        availableAmount: newAvailable,
        status: parseFloat(newAvailable) <= 0 ? 'completed' : 'active',
        updatedAt: new Date()
      })
      .where(eq(p2pOffers.id, params.offerId));

    // 6. Create the trade record
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

    // 7. Create escrow transaction record for audit
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
