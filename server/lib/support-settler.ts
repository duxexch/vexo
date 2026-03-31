import { storage } from "../storage";
import type { SpectatorSupport, MatchedSupport } from "@shared/schema";
import { getErrorMessage } from "../routes/helpers";

interface SettlementResult {
  success: boolean;
  settledMatches: number;
  refundedSupports: number;
  errors: string[];
}

export async function settleSpectatorSupports(
  challengeId: string,
  winnerId: string | null,
  winnerTeamPlayerIds: string[] = []
): Promise<SettlementResult> {
  const result: SettlementResult = {
    success: true,
    settledMatches: 0,
    refundedSupports: 0,
    errors: [],
  };

  try {
    const winnerIds = winnerTeamPlayerIds.length > 0
      ? winnerTeamPlayerIds
      : (winnerId ? [winnerId] : []);
    const winnerSet = new Set(winnerIds);

    const matchedSupports = await storage.getMatchedSupportsByChallenge(challengeId);

    for (const matched of matchedSupports) {
      if (matched.settledAt) {
        continue;
      }

      try {
        const support1 = await storage.getSpectatorSupport(matched.support1Id);
        const support2 = await storage.getSpectatorSupport(matched.support2Id);

        if (!support1 || !support2) {
          result.errors.push(`Missing support entries for matched support ${matched.id}`);
          continue;
        }

        const support1BackedWinner = winnerSet.has(support1.supportedPlayerId);
        const winningSupport = support1BackedWinner ? support1 : support2;
        const losingSupport = support1BackedWinner ? support2 : support1;

        const totalPool = parseFloat(matched.totalPool);
        const houseFee = parseFloat(matched.houseFeeTotal);
        const netPool = totalPool - houseFee;
        const winnerStakeAmount = parseFloat(winningSupport.amount);
        const winnerProfit = netPool - winnerStakeAmount; // Only the profit portion (loser's stake minus house fee)

        await storage.updateSpectatorSupport(winningSupport.id, {
          status: "won",
          actualWinnings: netPool.toFixed(2),
          settledAt: new Date(),
        });

        await storage.updateSpectatorSupport(losingSupport.id, {
          status: "lost",
          actualWinnings: "0.00",
          settledAt: new Date(),
        });

        // LOSER: Forfeit locked balance (deduct from locked without returning to available)
        const loserWallet = await storage.getProjectCurrencyWallet(losingSupport.supporterId);
        if (loserWallet) {
          const forfeitResult = await storage.forfeitLockedProjectCurrencyBalance(
            loserWallet.id,
            losingSupport.amount
          );
          if (!forfeitResult.success) {
            result.errors.push(
              `Failed to forfeit balance for loser ${losingSupport.supporterId}: ${forfeitResult.error}`
            );
          }
        }

        // WINNER: Unlock their original stake (return locked → available)
        const winnerWallet = await storage.getProjectCurrencyWallet(winningSupport.supporterId);
        if (winnerWallet) {
          const unlockWinnerResult = await storage.unlockProjectCurrencyBalance(
            winnerWallet.id,
            winningSupport.amount
          );
          if (!unlockWinnerResult.success) {
            result.errors.push(
              `Failed to unlock balance for winner ${winningSupport.supporterId}: ${unlockWinnerResult.error}`
            );
          }
        }

        // WINNER: Credit only the PROFIT (loser's stake minus house fee), not the full pool
        if (winnerProfit > 0) {
          const earnResult = await storage.earnProjectCurrencyAtomic(
            winningSupport.supporterId,
            winnerProfit.toFixed(2),
            "support_winnings",
            matched.id,
            `Support winnings for challenge ${challengeId}`
          );

          if (!earnResult.success) {
            result.errors.push(
              `Failed to credit winnings to ${winningSupport.supporterId}: ${earnResult.error}`
            );
          }
        }

        await storage.settleMatchedSupport(matched.id, winningSupport.supportedPlayerId, winningSupport.id);
        result.settledMatches++;
      } catch (error: unknown) {
        result.errors.push(`Error settling matched support ${matched.id}: ${getErrorMessage(error)}`);
      }
    }

    const allSupports = await storage.getSpectatorSupportsByChallenge(challengeId);
    const pendingSupports = allSupports.filter((s) => s.status === "pending");

    for (const support of pendingSupports) {
      try {
        const wallet = await storage.getProjectCurrencyWallet(support.supporterId);
        if (wallet) {
          const unlockResult = await storage.unlockProjectCurrencyBalance(
            wallet.id,
            support.amount
          );
          if (!unlockResult.success) {
            result.errors.push(
              `Failed to refund support ${support.id}: ${unlockResult.error}`
            );
            continue;
          }
        }

        await storage.updateSpectatorSupport(support.id, {
          status: "refunded",
          settledAt: new Date(),
        });
        result.refundedSupports++;
      } catch (error: unknown) {
        result.errors.push(`Error refunding support ${support.id}: ${getErrorMessage(error)}`);
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }
  } catch (error: unknown) {
    result.success = false;
    result.errors.push(`Fatal error in settlement: ${getErrorMessage(error)}`);
  }

  console.log(
    `[SupportSettler] Challenge ${challengeId} settlement: ${result.settledMatches} matches settled, ${result.refundedSupports} refunded, ${result.errors.length} errors`
  );

  return result;
}

export async function refundPendingSupports(challengeId: string): Promise<SettlementResult> {
  const result: SettlementResult = {
    success: true,
    settledMatches: 0,
    refundedSupports: 0,
    errors: [],
  };

  try {
    const allSupports = await storage.getSpectatorSupportsByChallenge(challengeId);
    const pendingOrMatchedSupports = allSupports.filter(
      (s) => s.status === "pending" || s.status === "matched"
    );

    for (const support of pendingOrMatchedSupports) {
      try {
        const wallet = await storage.getProjectCurrencyWallet(support.supporterId);
        if (wallet) {
          const unlockResult = await storage.unlockProjectCurrencyBalance(
            wallet.id,
            support.amount
          );
          if (!unlockResult.success) {
            result.errors.push(
              `Failed to refund support ${support.id}: ${unlockResult.error}`
            );
            continue;
          }
        }

        await storage.updateSpectatorSupport(support.id, {
          status: "refunded",
          settledAt: new Date(),
        });
        result.refundedSupports++;
      } catch (error: unknown) {
        result.errors.push(`Error refunding support ${support.id}: ${getErrorMessage(error)}`);
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }
  } catch (error: unknown) {
    result.success = false;
    result.errors.push(`Fatal error in refund: ${getErrorMessage(error)}`);
  }

  console.log(
    `[SupportSettler] Challenge ${challengeId} refund: ${result.refundedSupports} refunded, ${result.errors.length} errors`
  );

  return result;
}
