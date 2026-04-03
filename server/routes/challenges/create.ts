import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, sql, gte } from "drizzle-orm";
import { users, projectCurrencyWallets, challenges as challengesTable, gameplaySettings, gameMatches } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { broadcastChallengeUpdate, broadcastNotification } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";

function normalizeChallengeCurrencyType(currencyType: unknown): "project" | "usd" {
  return currencyType === "project" ? "project" : "usd";
}

function formatChallengeAmount(amount: number, currencyType: unknown): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrencyType = normalizeChallengeCurrencyType(currencyType);
  if (normalizedCurrencyType === "project") {
    return `VXC ${safeAmount.toFixed(2)}`;
  }
  return `$${safeAmount.toFixed(2)}`;
}

export function registerCreateRoute(app: Express) {
  app.post("/api/challenges", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const {
        gameType,
        betAmount,
        opponentType,
        friendAccountId,
        visibility = 'public',
        currencyType = 'project',
        requiredPlayers = 2,
        chessSystem,
        dominoTargetScore,
      } = req.body;

      const [currencyModeSetting] = await db.select({ value: gameplaySettings.value })
        .from(gameplaySettings)
        .where(eq(gameplaySettings.key, 'play_gift_currency_mode'))
        .limit(1);
      const enforceProjectOnly = !currencyModeSetting || currencyModeSetting.value !== 'mixed';

      if (enforceProjectOnly && currencyType === 'usd') {
        return res.status(400).json({
          error: "Real-money gameplay is disabled. Convert to project currency to play.",
        });
      }

      const effectiveCurrencyType = enforceProjectOnly ? 'project' : currencyType;

      const CHESS_SYSTEMS: Record<string, { label: string; timeLimitSeconds: number }> = {
        bullet_1_0: { label: 'Bullet 1+0', timeLimitSeconds: 60 },
        blitz_3_2: { label: 'Blitz 3+2', timeLimitSeconds: 180 },
        blitz_5_0: { label: 'Blitz 5+0', timeLimitSeconds: 300 },
        rapid_10_0: { label: 'Rapid 10+0', timeLimitSeconds: 600 },
        rapid_15_10: { label: 'Rapid 15+10', timeLimitSeconds: 900 },
        classical_30_0: { label: 'Classical 30+0', timeLimitSeconds: 1800 },
      };

      // SECURITY: Validate currencyType whitelist — prevent arbitrary currency injection
      const VALID_CURRENCIES = ['usd', 'project'];
      if (!VALID_CURRENCIES.includes(effectiveCurrencyType)) {
        return res.status(400).json({ error: "Invalid currency type" });
      }

      // SECURITY: Validate visibility whitelist — prevent XSS/injection via stored visibility
      const VALID_VISIBILITY = ['public', 'private'];
      if (!VALID_VISIBILITY.includes(visibility)) {
        return res.status(400).json({ error: "Invalid visibility. Must be 'public' or 'private'" });
      }

      // SECURITY: Validate opponentType whitelist
      const VALID_OPPONENT_TYPES = ['anyone', 'friend', 'random'];
      if (opponentType && !VALID_OPPONENT_TYPES.includes(opponentType)) {
        return res.status(400).json({ error: "Invalid opponent type" });
      }

      // Validate required players (2 or 4)
      const numPlayers = parseInt(String(requiredPlayers)) || 2;
      if (numPlayers !== 2 && numPlayers !== 4) {
        return res.status(400).json({ error: "Required players must be 2 or 4" });
      }
      const parsedBetAmount = parseFloat(String(betAmount || 0));

      // Validate amount is positive
      if (isNaN(parsedBetAmount) || !isFinite(parsedBetAmount) || parsedBetAmount <= 0) {
        return res.status(400).json({ error: "Invalid challenge amount" });
      }

      // SECURITY: Validate betAmount is a reasonable precision (max 2 decimal places for USD)
      if (effectiveCurrencyType === 'usd' && parsedBetAmount < 0.01) {
        return res.status(400).json({ error: "Minimum bet amount is $0.01" });
      }

      // VALIDATION: Verify game exists and is active in database (Single Source of Truth)
      const validation = await storage.validateGameConfig(gameType, String(betAmount || 0));
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const gameConfig = validation.game!;
      let timeLimit = gameConfig.defaultTimeLimit || 300;

      const normalizedGameType = String(gameType || '').toLowerCase();
      let parsedDominoTargetScore: number | null = null;

      if (normalizedGameType === 'domino') {
        const targetValue = Number(dominoTargetScore ?? 101);
        if (!Number.isInteger(targetValue) || ![101, 201].includes(targetValue)) {
          return res.status(400).json({ error: 'Invalid domino target score. Allowed values: 101 or 201' });
        }
        parsedDominoTargetScore = targetValue;
      } else if (dominoTargetScore !== undefined && dominoTargetScore !== null) {
        return res.status(400).json({ error: 'dominoTargetScore can only be used with domino challenges' });
      }

      if (normalizedGameType === 'chess') {
        const selectedChessSystem = typeof chessSystem === 'string' && chessSystem.trim().length > 0
          ? chessSystem.trim()
          : 'rapid_10_0';

        if (!CHESS_SYSTEMS[selectedChessSystem]) {
          return res.status(400).json({ error: 'Invalid chess system' });
        }

        timeLimit = CHESS_SYSTEMS[selectedChessSystem].timeLimitSeconds;
      } else if (chessSystem) {
        return res.status(400).json({ error: 'chessSystem can only be used with chess challenges' });
      }
      const userId = req.user!.id;

      if (opponentType === 'friend' && !friendAccountId) {
        return res.status(400).json({ error: 'friendAccountId is required for friend challenges' });
      }

      const challengeVisibility = opponentType === 'friend' ? 'private' : visibility;

      // SECURITY: Prevent self-friend challenge
      if (opponentType === 'friend' && friendAccountId) {
        if (friendAccountId === userId) {
          return res.status(400).json({ error: "You cannot challenge yourself" });
        }
        // SECURITY: Validate friendAccountId is a real user
        const friendUser = await storage.getUser(friendAccountId);
        if (!friendUser) {
          return res.status(400).json({ error: "Friend account not found" });
        }
      }

      // ==================== SECURITY: Challenge Settings Enforcement ====================
      const challengeConfig = await storage.getChallengeSettings(gameType);

      // SECURITY: Check if this game type is enabled for challenges
      if (!challengeConfig.isEnabled) {
        return res.status(403).json({ error: "Challenges are currently disabled for this game type" });
      }

      // SECURITY: Enforce min/max stake limits from admin settings
      const minStake = parseFloat(challengeConfig.minStake);
      const maxStake = parseFloat(challengeConfig.maxStake);
      if (minStake > 0 && parsedBetAmount < minStake) {
        return res.status(400).json({ error: `Minimum stake is ${formatChallengeAmount(minStake, effectiveCurrencyType)}` });
      }
      if (maxStake > 0 && parsedBetAmount > maxStake) {
        return res.status(400).json({ error: `Maximum stake is ${formatChallengeAmount(maxStake, effectiveCurrencyType)}` });
      }

      // SECURITY: Limit concurrent active challenges to prevent balance drain exploit
      const maxConcurrent = challengeConfig.maxConcurrentChallenges;
      const [activeCount] = await db.select({ count: sql<number>`count(*)` })
        .from(challengesTable)
        .where(and(
          eq(challengesTable.player1Id, userId),
          eq(challengesTable.status, 'waiting')
        ));
      if (Number(activeCount?.count || 0) >= maxConcurrent) {
        return res.status(400).json({ error: `You already have ${maxConcurrent} active challenges. Cancel one first.` });
      }

      // Check free play daily limit
      const freePlayLimitSetting = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, "freePlayLimit")).limit(1);
      if (freePlayLimitSetting.length > 0) {
        const limit = parseInt(freePlayLimitSetting[0].value) || 0;
        if (limit > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const [matchCount] = await db.select({ count: sql<number>`count(*)` }).from(gameMatches)
            .where(and(
              or(eq(gameMatches.player1Id, userId), eq(gameMatches.player2Id, userId)),
              gte(gameMatches.createdAt, today)
            ));
          if (Number(matchCount?.count || 0) >= limit) {
            return res.status(400).json({ error: "Daily free play limit reached" });
          }
        }
      }

      // Use transaction to check balance and deduct + create challenge atomically
      const [dbChallenge] = await db.transaction(async (tx) => {
        if (effectiveCurrencyType === 'project') {
          // Check if project currency is enabled for games
          const settings = await storage.getProjectCurrencySettings();
          if (!settings?.isActive || !settings?.useInGames) {
            throw new Error("Project currency is not available for games");
          }

          // Lock and check user's project currency balance
          const [wallet] = await tx.select()
            .from(projectCurrencyWallets)
            .where(eq(projectCurrencyWallets.userId, userId))
            .for('update');

          if (!wallet) {
            throw new Error('Project currency wallet not found');
          }

          let earnedBalance = parseFloat(wallet.earnedBalance);
          let purchasedBalance = parseFloat(wallet.purchasedBalance);
          const totalBalance = earnedBalance + purchasedBalance;

          if (totalBalance < parsedBetAmount) {
            throw new Error("Insufficient project currency balance to create this challenge");
          }

          // Deduct from earned first, then purchased
          let remaining = parsedBetAmount;
          if (earnedBalance >= remaining) {
            earnedBalance -= remaining;
            remaining = 0;
          } else {
            remaining -= earnedBalance;
            earnedBalance = 0;
            purchasedBalance -= remaining;
          }

          const newTotal = (earnedBalance + purchasedBalance).toFixed(8);
          await tx.update(projectCurrencyWallets)
            .set({
              earnedBalance: earnedBalance.toFixed(8),
              purchasedBalance: purchasedBalance.toFixed(8),
              totalBalance: newTotal,
              updatedAt: new Date()
            })
            .where(eq(projectCurrencyWallets.userId, userId));
        } else {
          // Check and deduct USD balance
          const [userRecord] = await tx.select()
            .from(users)
            .where(eq(users.id, userId))
            .for('update');

          if (!userRecord) {
            throw new Error('User not found');
          }

          const currentBalance = parseFloat(userRecord.balance);
          if (currentBalance < parsedBetAmount) {
            throw new Error('Insufficient balance to create this challenge');
          }

          // Deduct balance
          await tx.update(users)
            .set({ balance: (currentBalance - parsedBetAmount).toString() })
            .where(eq(users.id, userId));
        }

        // Insert challenge into database
        return await tx.insert(challengesTable).values({
          gameType,
          betAmount: parsedBetAmount.toFixed(2),
          currencyType: effectiveCurrencyType,
          visibility: challengeVisibility,
          status: 'waiting',
          player1Id: userId,
          player2Id: opponentType === 'friend' ? friendAccountId : null,
          player3Id: null,
          player4Id: null,
          requiredPlayers: numPlayers,
          currentPlayers: 1,
          opponentType,
          friendAccountId: opponentType === 'friend' ? friendAccountId : null,
          dominoTargetScore: parsedDominoTargetScore,
          timeLimit,
          player1Score: 0,
          player2Score: 0,
          player3Score: 0,
          player4Score: 0,
        }).returning();
      });

      // Get player details for response
      const player1 = await storage.getUser(req.user!.id);
      const gamesWon = player1?.gamesWon || 0;
      const gamesLost = player1?.gamesLost || 0;
      const totalGames = gamesWon + gamesLost;
      const winRate = totalGames > 0 ? Math.round((gamesWon / totalGames) * 100) : 50;
      const rank = winRate >= 80 ? "diamond" : winRate >= 60 ? "gold" : winRate >= 40 ? "silver" : "bronze";

      const challenge = {
        ...dbChallenge,
        chessSystem: normalizedGameType === 'chess' ? (typeof chessSystem === 'string' && chessSystem ? chessSystem : 'rapid_10_0') : null,
        player1Name: req.user!.username,
        player1Rating: { wins: gamesWon, losses: gamesLost, winRate, rank },
        player2Name: null,
        player2Rating: null,
        spectatorCount: 0,
        totalBets: 0,
        houseFee: gameConfig.houseFee,
      };

      // Broadcast new challenge to all connected clients for real-time updates
      broadcastChallengeUpdate('created', challenge);

      // Notify targeted friend if this is a friend challenge
      if (opponentType === 'friend' && friendAccountId) {
        const gameName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
        const formattedChallengeAmount = formatChallengeAmount(parsedBetAmount, effectiveCurrencyType);
        sendNotification(friendAccountId, {
          type: 'system',
          priority: 'high',
          title: `You've Been Challenged! ⚔️`,
          titleAr: `تم تحديك! ⚔️`,
          message: `${player1?.nickname || player1?.username} challenged you to a ${gameName} game for ${formattedChallengeAmount}!`,
          messageAr: `${player1?.nickname || player1?.username} تحداك في لعبة ${gameName} بقيمة ${formattedChallengeAmount}!`,
          link: `/challenges`,
          metadata: JSON.stringify({ challengeId: dbChallenge.id, gameType, betAmount: parsedBetAmount }),
        }).catch(() => { });
      }

      // Notify followers of the challenger about the new challenge
      const followers = await storage.getUserFollowers(req.user!.id);
      if (followers.length > 0) {
        const followerIds = followers.map(f => f.userId);
        const gameName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
        const formattedChallengeAmount = formatChallengeAmount(parsedBetAmount, effectiveCurrencyType);

        await broadcastNotification({
          type: "system",
          priority: "normal",
          title: "New Challenge",
          titleAr: "تحدي جديد",
          message: `${player1?.nickname || player1?.username} started a ${gameName} challenge for ${formattedChallengeAmount}! Watch and support now.`,
          messageAr: `${player1?.nickname || player1?.username} بدأ تحدي ${gameName} بقيمة ${formattedChallengeAmount}! شاهد وادعم الآن.`,
          link: `/watch/${dbChallenge.id}`,
          metadata: JSON.stringify({
            challengeId: dbChallenge.id,
            gameType,
            betAmount: parsedBetAmount,
            action: 'watch_and_support'
          }),
        }, followerIds);
      }

      res.json(challenge);
    } catch (error: unknown) {
      // Return 400 for balance/validation errors
      if (getErrorMessage(error).includes('Insufficient') ||
        getErrorMessage(error).includes('not found') ||
        getErrorMessage(error).includes('not available') ||
        getErrorMessage(error).includes('Invalid')) {
        return res.status(400).json({ error: getErrorMessage(error) });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
