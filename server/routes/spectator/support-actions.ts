import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { calculateOdds, calculatePotentialWinnings, type PlayerStats } from "../../lib/odds-calculator";
import { getErrorMessage } from "../helpers";
import {
  getChallengeOpposingParticipantIds,
  getChallengeParticipantIds,
  getChallengeReadAccess,
  getChallengeSameSideParticipantIds,
} from "../challenges/helpers";

function normalizeHouseFeePercent(raw: string | number | null | undefined): number {
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  // Backward compatibility: support both "5" (percent) and "0.05" (decimal rate).
  if (parsed > 0 && parsed < 1) {
    return parsed * 100;
  }

  return Math.min(parsed, 100);
}

function buildPlayerStats(player: {
  gamesWon?: number | null;
  gamesLost?: number | null;
  gamesPlayed?: number | null;
  currentWinStreak?: number | null;
  longestWinStreak?: number | null;
  chessWon?: number | null;
  chessPlayed?: number | null;
  backgammonWon?: number | null;
  backgammonPlayed?: number | null;
  dominoWon?: number | null;
  dominoPlayed?: number | null;
  tarneebWon?: number | null;
  tarneebPlayed?: number | null;
  balootWon?: number | null;
  balootPlayed?: number | null;
}): PlayerStats {
  return {
    gamesWon: player.gamesWon || 0,
    gamesLost: player.gamesLost || 0,
    gamesPlayed: player.gamesPlayed || 0,
    currentWinStreak: player.currentWinStreak || 0,
    longestWinStreak: player.longestWinStreak || 0,
    chessWon: player.chessWon || 0,
    chessPlayed: player.chessPlayed || 0,
    backgammonWon: player.backgammonWon || 0,
    backgammonPlayed: player.backgammonPlayed || 0,
    dominoWon: player.dominoWon || 0,
    dominoPlayed: player.dominoPlayed || 0,
    tarneebWon: player.tarneebWon || 0,
    tarneebPlayed: player.tarneebPlayed || 0,
    balootWon: player.balootWon || 0,
    balootPlayed: player.balootPlayed || 0,
  };
}

type NormalizedPlayerStats = Required<
  Pick<
    PlayerStats,
    | "gamesWon"
    | "gamesLost"
    | "gamesPlayed"
    | "currentWinStreak"
    | "longestWinStreak"
    | "chessWon"
    | "chessPlayed"
    | "backgammonWon"
    | "backgammonPlayed"
    | "dominoWon"
    | "dominoPlayed"
    | "tarneebWon"
    | "tarneebPlayed"
    | "balootWon"
    | "balootPlayed"
  >
>;

function aggregatePlayerStats(players: PlayerStats[]): PlayerStats {
  if (players.length === 0) {
    return {
      gamesWon: 0,
      gamesLost: 0,
      gamesPlayed: 0,
      currentWinStreak: 0,
      longestWinStreak: 0,
      chessWon: 0,
      chessPlayed: 0,
      backgammonWon: 0,
      backgammonPlayed: 0,
      dominoWon: 0,
      dominoPlayed: 0,
      tarneebWon: 0,
      tarneebPlayed: 0,
      balootWon: 0,
      balootPlayed: 0,
    };
  }

  const zeroStats: NormalizedPlayerStats = {
    gamesWon: 0,
    gamesLost: 0,
    gamesPlayed: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    chessWon: 0,
    chessPlayed: 0,
    backgammonWon: 0,
    backgammonPlayed: 0,
    dominoWon: 0,
    dominoPlayed: 0,
    tarneebWon: 0,
    tarneebPlayed: 0,
    balootWon: 0,
    balootPlayed: 0,
  };

  const total = players.reduce<NormalizedPlayerStats>((acc, item) => {
    acc.gamesWon += item.gamesWon;
    acc.gamesLost += item.gamesLost;
    acc.gamesPlayed += item.gamesPlayed;
    acc.currentWinStreak += item.currentWinStreak;
    acc.longestWinStreak += item.longestWinStreak || 0;
    acc.chessWon += item.chessWon || 0;
    acc.chessPlayed += item.chessPlayed || 0;
    acc.backgammonWon += item.backgammonWon || 0;
    acc.backgammonPlayed += item.backgammonPlayed || 0;
    acc.dominoWon += item.dominoWon || 0;
    acc.dominoPlayed += item.dominoPlayed || 0;
    acc.tarneebWon += item.tarneebWon || 0;
    acc.tarneebPlayed += item.tarneebPlayed || 0;
    acc.balootWon += item.balootWon || 0;
    acc.balootPlayed += item.balootPlayed || 0;
    return acc;
  }, zeroStats);

  const count = players.length;
  return {
    gamesWon: Math.round(total.gamesWon / count),
    gamesLost: Math.round(total.gamesLost / count),
    gamesPlayed: Math.round(total.gamesPlayed / count),
    currentWinStreak: Math.round(total.currentWinStreak / count),
    longestWinStreak: Math.round(total.longestWinStreak / count),
    chessWon: Math.round(total.chessWon / count),
    chessPlayed: Math.round(total.chessPlayed / count),
    backgammonWon: Math.round(total.backgammonWon / count),
    backgammonPlayed: Math.round(total.backgammonPlayed / count),
    dominoWon: Math.round(total.dominoWon / count),
    dominoPlayed: Math.round(total.dominoPlayed / count),
    tarneebWon: Math.round(total.tarneebWon / count),
    tarneebPlayed: Math.round(total.tarneebPlayed / count),
    balootWon: Math.round(total.balootWon / count),
    balootPlayed: Math.round(total.balootPlayed / count),
  };
}

type SupportCurrencyType = "project" | "usd";

function normalizeSupportCurrencyType(currencyType: unknown): SupportCurrencyType {
  return currencyType === "project" ? "project" : "usd";
}

async function reserveUsdSupportAmount(userId: string, supportAmount: number): Promise<{ success: boolean; error?: string }> {
  try {
    await db.transaction(async (tx) => {
      const [userRecord] = await tx
        .select({ id: users.id, balance: users.balance })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");

      if (!userRecord) {
        throw new Error("User not found");
      }

      const currentBalance = parseFloat(String(userRecord.balance || "0"));
      if (!Number.isFinite(currentBalance) || currentBalance < supportAmount) {
        throw new Error("Insufficient USD balance");
      }

      await tx
        .update(users)
        .set({ balance: (currentBalance - supportAmount).toFixed(2) })
        .where(eq(users.id, userId));
    });

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function releaseReservedSupportAmount(
  userId: string,
  supportAmount: number,
  currencyType: SupportCurrencyType,
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isFinite(supportAmount) || supportAmount <= 0) {
    return { success: true };
  }

  if (currencyType === "project") {
    const wallet = await storage.getProjectCurrencyWallet(userId);
    if (!wallet) {
      return { success: false, error: "Project currency wallet not found" };
    }

    const unlockResult = await storage.unlockProjectCurrencyBalance(wallet.id, supportAmount.toFixed(8));
    return unlockResult.success ? { success: true } : { success: false, error: unlockResult.error || "Failed to unlock project balance" };
  }

  try {
    await db
      .update(users)
      .set({
        balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${supportAmount.toFixed(2)})::text`,
      })
      .where(eq(users.id, userId));
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export function registerSupportActionRoutes(app: Express): void {

  // Place a support on a challenge
  app.post("/api/challenges/:challengeId/support", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { playerId, amount, mode } = req.body;
      const supporterId = req.user!.id;
      const challengeId = req.params.challengeId;

      if (!playerId || !amount || !mode) {
        return res.status(400).json({ error: "playerId, amount, and mode are required" });
      }

      if (mode !== "instant" && mode !== "wait_for_match") {
        return res.status(400).json({ error: "mode must be 'instant' or 'wait_for_match'" });
      }

      const supportAmount = parseFloat(amount);
      if (isNaN(supportAmount) || supportAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const { challenges } = await import("@shared/schema");
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, supporterId);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      if (challenge.status !== "waiting" && challenge.status !== "active") {
        return res.status(400).json({ error: "Challenge is not accepting supports" });
      }

      const supportCurrencyType = normalizeSupportCurrencyType(challenge.currencyType);

      const participantIds = getChallengeParticipantIds(challenge);

      if (!participantIds.includes(playerId)) {
        return res.status(400).json({ error: "Invalid player ID for this challenge" });
      }

      if (participantIds.includes(supporterId)) {
        return res.status(400).json({ error: "Players cannot support themselves" });
      }

      const settings = await storage.getSupportSettings(challenge.gameType);
      if (!settings?.isEnabled) {
        return res.status(400).json({ error: "Support is not enabled for this game type" });
      }

      const minAmount = parseFloat(settings.minSupportAmount);
      const maxAmount = parseFloat(settings.maxSupportAmount);
      if (supportAmount < minAmount || supportAmount > maxAmount) {
        return res.status(400).json({
          error: `Support amount must be between ${minAmount} and ${maxAmount}`
        });
      }

      if (mode === "instant" && !settings.allowInstantMatch) {
        return res.status(400).json({ error: "Instant match is not allowed for this game type" });
      }

      if (supportCurrencyType === "project") {
        const wallet = await storage.getOrCreateProjectCurrencyWallet(supporterId);
        const availableBalance = parseFloat(wallet.purchasedBalance) + parseFloat(wallet.earnedBalance) - parseFloat(wallet.lockedBalance);
        if (availableBalance < supportAmount) {
          return res.status(400).json({ error: "Insufficient project currency balance" });
        }

        const lockResult = await storage.lockProjectCurrencyBalance(wallet.id, supportAmount.toFixed(8));
        if (!lockResult.success) {
          return res.status(400).json({ error: lockResult.error || "Failed to lock balance" });
        }
      } else {
        const reserveUsdResult = await reserveUsdSupportAmount(supporterId, supportAmount);
        if (!reserveUsdResult.success) {
          const reserveError = reserveUsdResult.error || "Failed to reserve USD balance";
          const normalizedReserveError = reserveError.toLowerCase();
          if (normalizedReserveError.includes("insufficient")) {
            return res.status(400).json({ error: "Insufficient USD balance" });
          }
          return res.status(400).json({ error: reserveError });
        }
      }

      let odds: number;
      let potentialWinnings: number;

      if (mode === "instant") {
        const instantOdds = Number.parseFloat(settings.instantMatchOdds);
        odds = Number.isFinite(instantOdds) && instantOdds > 1 ? instantOdds : 1.8;
        const winningsCalc = calculatePotentialWinnings(supportAmount, odds);
        potentialWinnings = winningsCalc.potentialWinnings;
      } else {
        const participantUsers = await Promise.all(participantIds.map((id) => storage.getUser(id)));
        const targetPlayer = participantUsers.find((player) => player?.id === playerId);

        if (!targetPlayer) {
          await releaseReservedSupportAmount(supporterId, supportAmount, supportCurrencyType);
          return res.status(404).json({ error: "Target player not found" });
        }

        const targetSideIds = getChallengeSameSideParticipantIds(challenge, playerId);
        const opposingPlayerIds = getChallengeOpposingParticipantIds(challenge, playerId);

        const targetSideUsers = participantUsers
          .filter((player): player is NonNullable<typeof player> => Boolean(player && targetSideIds.includes(player.id)));

        const opponentUsers = participantUsers
          .filter((player): player is NonNullable<typeof player> => Boolean(player && opposingPlayerIds.includes(player.id)));

        if (opponentUsers.length === 0) {
          await releaseReservedSupportAmount(supporterId, supportAmount, supportCurrencyType);
          return res.status(400).json({ error: "No opponents available for odds calculation" });
        }

        const targetStats = aggregatePlayerStats(
          (targetSideUsers.length > 0 ? targetSideUsers : [targetPlayer]).map((player) => buildPlayerStats(player)),
        );
        const opponentStats = aggregatePlayerStats(opponentUsers.map((player) => buildPlayerStats(player)));
        const oddsResult = calculateOdds(targetStats, opponentStats, settings, challenge.gameType);
        odds = oddsResult.player1Odds;
        const winningsCalc = calculatePotentialWinnings(supportAmount, odds);
        potentialWinnings = winningsCalc.potentialWinnings;
      }

      const houseFeePercent = normalizeHouseFeePercent(settings.houseFeePercent);
      const houseFee = supportAmount * (houseFeePercent / 100);

      const support = await storage.createSpectatorSupport({
        challengeId,
        supporterId,
        supportedPlayerId: playerId,
        amount: supportAmount.toFixed(2),
        odds: odds.toFixed(2),
        potentialWinnings: potentialWinnings.toFixed(2),
        mode,
        status: "pending",
        houseFee: houseFee.toFixed(2),
      });

      if (mode === "wait_for_match") {
        const opposingPlayerIds = getChallengeOpposingParticipantIds(challenge, playerId);

        if (opposingPlayerIds.length === 0) {
          await releaseReservedSupportAmount(supporterId, supportAmount, supportCurrencyType);
          return res.status(400).json({ error: "No opposing players available for support matching" });
        }

        const pendingSupportGroups = await Promise.all(
          opposingPlayerIds.map((id) => storage.getPendingSupportsForPlayer(challengeId, id)),
        );

        const matchingSupport = pendingSupportGroups
          .flat()
          .filter((s) => s.supporterId !== supporterId)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .find((s) => parseFloat(s.amount) === supportAmount);

        if (matchingSupport) {
          const totalPool = supportAmount + parseFloat(matchingSupport.amount);
          const totalHouseFee = houseFee + parseFloat(matchingSupport.houseFee);

          const matched = await storage.createMatchedSupport({
            challengeId,
            support1Id: support.id,
            support2Id: matchingSupport.id,
            totalPool: totalPool.toFixed(2),
            houseFeeTotal: totalHouseFee.toFixed(2),
          });

          await storage.updateSpectatorSupport(support.id, {
            status: "matched",
            matchedSupportId: matchingSupport.id,
          });
          await storage.updateSpectatorSupport(matchingSupport.id, {
            status: "matched",
            matchedSupportId: support.id,
          });

          return res.status(201).json({
            support,
            matched: true,
            matchedSupport: matched,
          });
        }
      }

      res.status(201).json({
        support,
        matched: false,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Cancel a pending support
  app.delete("/api/supports/:supportId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challenges } = await import("@shared/schema");
      const support = await storage.getSpectatorSupport(req.params.supportId);

      if (!support) {
        return res.status(404).json({ error: "Support not found" });
      }

      if (support.supporterId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to cancel this support" });
      }

      if (support.status !== "pending") {
        return res.status(400).json({ error: "Only pending supports can be cancelled" });
      }

      const [challenge] = await db
        .select({ currencyType: challenges.currencyType })
        .from(challenges)
        .where(eq(challenges.id, support.challengeId))
        .limit(1);

      const supportCurrencyType = normalizeSupportCurrencyType(challenge?.currencyType);
      const supportAmount = parseFloat(String(support.amount || "0"));
      const releaseResult = await releaseReservedSupportAmount(support.supporterId, supportAmount, supportCurrencyType);
      if (!releaseResult.success) {
        return res.status(400).json({ error: releaseResult.error || "Failed to refund support amount" });
      }

      await storage.updateSpectatorSupport(support.id, { status: "cancelled" });

      res.json({ success: true, message: "Support cancelled and funds refunded" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get current user's supports
  app.get("/api/my-supports", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const supports = await storage.getSpectatorSupportsByUser(req.user!.id);
      res.json(supports);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
