import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, sql, gte, ilike } from "drizzle-orm";
import {
  users,
  projectCurrencyWallets,
  challenges as challengesTable,
  gameplaySettings,
  gameMatches,
  games,
  challengeGameSessions,
  liveGameSessions,
} from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { broadcastChallengeUpdate, broadcastNotification } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";
import { getGameEngine } from "../../game-engines";
import { getBadgeEntitlementForUser } from "../../lib/user-badge-entitlements";

const SAM9_BOT_USER_ID = "bot-sam9";
const SAM9_BOT_USERNAME = "bot_sam9_challenge_ai";
const SAM9_MIN_BANKROLL = 1_000_000;
const SAM9_SUPPORTED_GAME_TYPES = new Set(["domino", "backgammon", "tarneeb", "baloot"]);
const SAM9_SOLO_MODE_KEY = "sam9_solo_mode";
const SAM9_SOLO_FIXED_FEE_KEY = "sam9_solo_fixed_fee";

type Sam9SoloMode = "competitive" | "friendly_fixed_fee";

interface Sam9SoloSettings {
  mode: Sam9SoloMode;
  fixedFee: number;
}

function normalizeSam9SoloMode(value: unknown): Sam9SoloMode {
  return value === "friendly_fixed_fee" ? "friendly_fixed_fee" : "competitive";
}

function normalizeSam9FixedFee(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Number(parsed.toFixed(2));
}

async function getSam9SoloSettings(): Promise<Sam9SoloSettings> {
  const [modeSetting] = await db.select({ value: gameplaySettings.value })
    .from(gameplaySettings)
    .where(eq(gameplaySettings.key, SAM9_SOLO_MODE_KEY))
    .limit(1);

  const [fixedFeeSetting] = await db.select({ value: gameplaySettings.value })
    .from(gameplaySettings)
    .where(eq(gameplaySettings.key, SAM9_SOLO_FIXED_FEE_KEY))
    .limit(1);

  return {
    mode: normalizeSam9SoloMode(modeSetting?.value),
    fixedFee: normalizeSam9FixedFee(fixedFeeSetting?.value),
  };
}

type ChallengeSessionSeed = Pick<
  typeof challengesTable.$inferSelect,
  "gameType" | "timeLimit" | "dominoTargetScore" | "player1Id" | "player2Id" | "player3Id" | "player4Id"
>;

async function ensureSam9BotUser(): Promise<{ id: string; username: string }> {
  const [existingById] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, SAM9_BOT_USER_ID))
    .limit(1);

  if (existingById) {
    await db.insert(projectCurrencyWallets).values({
      userId: existingById.id,
      purchasedBalance: SAM9_MIN_BANKROLL.toFixed(2),
      earnedBalance: "0.00",
      totalBalance: SAM9_MIN_BANKROLL.toFixed(2),
      totalConverted: "0.00",
      totalSpent: "0.00",
      totalEarned: "0.00",
      lockedBalance: "0.00",
    }).onConflictDoNothing();
    return existingById;
  }

  const password = `sam9-bot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const [created] = await db.insert(users).values({
    id: SAM9_BOT_USER_ID,
    username: SAM9_BOT_USERNAME,
    accountId: "SAM9-GAME-BOT",
    password,
    role: "player",
    status: "active",
    balance: SAM9_MIN_BANKROLL.toFixed(2),
  }).returning({
    id: users.id,
    username: users.username,
  });

  if (!created) {
    throw new Error("Failed to create SAM9 bot account");
  }

  await db.insert(projectCurrencyWallets).values({
    userId: created.id,
    purchasedBalance: SAM9_MIN_BANKROLL.toFixed(2),
    earnedBalance: "0.00",
    totalBalance: SAM9_MIN_BANKROLL.toFixed(2),
    totalConverted: "0.00",
    totalSpent: "0.00",
    totalEarned: "0.00",
    lockedBalance: "0.00",
  }).onConflictDoNothing();

  return created;
}

function buildInitialChallengeState(challenge: ChallengeSessionSeed): { gameState: string; currentTurn: string } {
  const gameType = challenge.gameType.toLowerCase();
  const engine = getGameEngine(gameType);
  const playerIds = [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id]
    .filter(Boolean) as string[];

  let gameState = JSON.stringify({ initialized: true, gameType });

  if (engine && playerIds.length >= 2) {
    try {
      if (gameType === "tarneeb") {
        gameState = engine.initializeWithPlayers(playerIds, 31);
      } else if (gameType === "baloot") {
        gameState = engine.initializeWithPlayers(playerIds, 152);
      } else if (gameType === "domino") {
        const targetScore = challenge.dominoTargetScore === 201 ? 201 : 101;
        gameState = engine.initializeWithPlayers(playerIds, targetScore);
      } else if (gameType === "chess") {
        const incrementMs = challenge.timeLimit === 180 ? 2000 : challenge.timeLimit === 900 ? 10000 : 0;
        gameState = engine.initializeWithPlayers(playerIds[0], playerIds[1], {
          timeMs: Math.max(60, challenge.timeLimit || 300) * 1000,
          incrementMs,
        });
      } else {
        gameState = engine.initializeWithPlayers(playerIds[0], playerIds[1]);
      }
    } catch {
      gameState = engine.createInitialState();
    }
  }

  let currentTurn = challenge.player1Id;
  try {
    const parsed = JSON.parse(gameState) as { currentPlayer?: string; currentTurn?: string };
    if (parsed.currentPlayer) {
      currentTurn = parsed.currentPlayer;
    } else if (parsed.currentTurn === "white") {
      currentTurn = challenge.player1Id;
    } else if (parsed.currentTurn === "black") {
      currentTurn = challenge.player2Id || challenge.player1Id;
    } else if (parsed.currentTurn) {
      currentTurn = parsed.currentTurn;
    }
  } catch {
    // Keep fallback currentTurn
  }

  return { gameState, currentTurn };
}

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
  app.get("/api/challenges/sam9-solo-config", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const settings = await getSam9SoloSettings();
      res.json({
        ...settings,
        supportedGames: Array.from(SAM9_SUPPORTED_GAME_TYPES),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

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
      const normalizedGameType = String(gameType || "").toLowerCase();
      const normalizedOpponentType = String(opponentType || "random").toLowerCase();
      const isSam9Challenge = normalizedOpponentType === "sam9";
      const sam9SoloSettings = isSam9Challenge ? await getSam9SoloSettings() : null;
      const isSam9FriendlyFixedFee = Boolean(isSam9Challenge && sam9SoloSettings?.mode === "friendly_fixed_fee");

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
      const VALID_OPPONENT_TYPES = ['anyone', 'friend', 'random', 'sam9'];
      if (normalizedOpponentType && !VALID_OPPONENT_TYPES.includes(normalizedOpponentType)) {
        return res.status(400).json({ error: "Invalid opponent type" });
      }

      if (isSam9Challenge && !SAM9_SUPPORTED_GAME_TYPES.has(normalizedGameType)) {
        return res.status(400).json({
          error: "SAM9 solo mode is currently available for Domino, Backgammon, Tarneeb, and Baloot only",
        });
      }

      // Validate required players (2 or 4)
      const numPlayers = parseInt(String(requiredPlayers)) || 2;
      if (numPlayers !== 2 && numPlayers !== 4) {
        return res.status(400).json({ error: "Required players must be 2 or 4" });
      }
      const effectiveRequiredPlayers = isSam9Challenge ? 2 : numPlayers;
      const parsedBetAmount = parseFloat(String(betAmount || 0));
      const stakeChargeAmount = isSam9FriendlyFixedFee
        ? normalizeSam9FixedFee(sam9SoloSettings?.fixedFee)
        : parsedBetAmount;
      const persistedBetAmount = isSam9FriendlyFixedFee ? 0 : parsedBetAmount;
      const shouldDeductSam9CounterStake = isSam9Challenge && !isSam9FriendlyFixedFee;

      // Validate amount is positive
      if (isNaN(stakeChargeAmount) || !isFinite(stakeChargeAmount) || stakeChargeAmount < 0) {
        return res.status(400).json({ error: "Invalid challenge amount" });
      }

      // SECURITY: Validate betAmount is a reasonable precision (max 2 decimal places for USD)
      if (effectiveCurrencyType === 'usd' && stakeChargeAmount > 0 && stakeChargeAmount < 0.01) {
        return res.status(400).json({ error: "Minimum bet amount is $0.01" });
      }

      // VALIDATION: Verify game exists and is active in database (Single Source of Truth)
      let gameConfig;
      if (isSam9FriendlyFixedFee) {
        gameConfig = await storage.getMultiplayerGameByKey(normalizedGameType);
        if (!gameConfig) {
          return res.status(400).json({ error: `Game '${normalizedGameType}' does not exist` });
        }
        if (!gameConfig.isActive) {
          return res.status(400).json({ error: `Game '${normalizedGameType}' is currently inactive` });
        }
      } else {
        const validation = await storage.validateGameConfig(gameType, String(parsedBetAmount));
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
        gameConfig = validation.game!;
      }
      let timeLimit = gameConfig.defaultTimeLimit || 300;

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

      if (normalizedOpponentType === 'friend' && !friendAccountId) {
        return res.status(400).json({ error: 'friendAccountId is required for friend challenges' });
      }

      const challengeVisibility = normalizedOpponentType === 'friend' ? 'private' : visibility;

      // SECURITY: Prevent self-friend challenge
      if (normalizedOpponentType === 'friend' && friendAccountId) {
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
      const badgeEntitlements = await getBadgeEntitlementForUser(userId);
      const badgeMaxStake = badgeEntitlements.maxChallengeMaxAmount;
      const effectiveMaxStake = badgeMaxStake !== null
        ? Math.max(maxStake, badgeMaxStake)
        : maxStake;
      if (!isSam9FriendlyFixedFee && minStake > 0 && parsedBetAmount < minStake) {
        return res.status(400).json({ error: `Minimum stake is ${formatChallengeAmount(minStake, effectiveCurrencyType)}` });
      }
      if (!isSam9FriendlyFixedFee && effectiveMaxStake > 0 && parsedBetAmount > effectiveMaxStake) {
        return res.status(400).json({ error: `Maximum stake is ${formatChallengeAmount(effectiveMaxStake, effectiveCurrencyType)}` });
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
      const sam9BotUser = isSam9Challenge ? await ensureSam9BotUser() : null;

      const { challenge: dbChallenge, sessionId: sam9SessionId } = await db.transaction(async (tx) => {
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

          if (totalBalance < stakeChargeAmount) {
            throw new Error("Insufficient project currency balance to create this challenge");
          }

          // Deduct from earned first, then purchased
          let remaining = stakeChargeAmount;
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

          if (shouldDeductSam9CounterStake && sam9BotUser) {
            let [sam9Wallet] = await tx.select()
              .from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, sam9BotUser.id))
              .for('update');

            if (!sam9Wallet) {
              const [createdWallet] = await tx.insert(projectCurrencyWallets).values({
                userId: sam9BotUser.id,
                purchasedBalance: SAM9_MIN_BANKROLL.toFixed(2),
                earnedBalance: '0.00',
                totalBalance: SAM9_MIN_BANKROLL.toFixed(2),
                totalConverted: '0.00',
                totalSpent: '0.00',
                totalEarned: '0.00',
                lockedBalance: '0.00',
              }).returning();
              sam9Wallet = createdWallet;
            }

            let sam9EarnedBalance = parseFloat(sam9Wallet.earnedBalance);
            let sam9PurchasedBalance = parseFloat(sam9Wallet.purchasedBalance);
            let sam9TotalBalance = sam9EarnedBalance + sam9PurchasedBalance;

            if (sam9TotalBalance < stakeChargeAmount) {
              sam9PurchasedBalance = SAM9_MIN_BANKROLL;
              sam9EarnedBalance = 0;
              sam9TotalBalance = sam9PurchasedBalance;
            }

            let sam9Remaining = stakeChargeAmount;
            if (sam9EarnedBalance >= sam9Remaining) {
              sam9EarnedBalance -= sam9Remaining;
              sam9Remaining = 0;
            } else {
              sam9Remaining -= sam9EarnedBalance;
              sam9EarnedBalance = 0;
              sam9PurchasedBalance -= sam9Remaining;
            }

            const sam9NewTotal = (sam9EarnedBalance + sam9PurchasedBalance).toFixed(8);
            await tx.update(projectCurrencyWallets)
              .set({
                earnedBalance: sam9EarnedBalance.toFixed(8),
                purchasedBalance: sam9PurchasedBalance.toFixed(8),
                totalBalance: sam9NewTotal,
                updatedAt: new Date(),
              })
              .where(eq(projectCurrencyWallets.userId, sam9BotUser.id));
          }
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
          if (currentBalance < stakeChargeAmount) {
            throw new Error('Insufficient balance to create this challenge');
          }

          // Deduct balance
          await tx.update(users)
            .set({ balance: (currentBalance - stakeChargeAmount).toString() })
            .where(eq(users.id, userId));

          if (shouldDeductSam9CounterStake && sam9BotUser) {
            const [sam9Record] = await tx.select()
              .from(users)
              .where(eq(users.id, sam9BotUser.id))
              .for('update');

            if (!sam9Record) {
              throw new Error('SAM9 bot account not found');
            }

            let sam9Balance = parseFloat(sam9Record.balance);
            if (sam9Balance < stakeChargeAmount) {
              sam9Balance = SAM9_MIN_BANKROLL;
            }

            await tx.update(users)
              .set({ balance: (sam9Balance - stakeChargeAmount).toFixed(2) })
              .where(eq(users.id, sam9BotUser.id));
          }
        }

        // Insert challenge into database
        const [createdChallenge] = await tx.insert(challengesTable).values({
          gameType,
          betAmount: persistedBetAmount.toFixed(2),
          currencyType: effectiveCurrencyType,
          visibility: challengeVisibility,
          status: isSam9Challenge ? 'active' : 'waiting',
          player1Id: userId,
          player2Id: normalizedOpponentType === 'friend'
            ? friendAccountId
            : (isSam9Challenge ? sam9BotUser?.id || null : null),
          player3Id: null,
          player4Id: null,
          requiredPlayers: effectiveRequiredPlayers,
          currentPlayers: isSam9Challenge ? 2 : 1,
          opponentType: normalizedOpponentType,
          friendAccountId: normalizedOpponentType === 'friend' ? friendAccountId : null,
          dominoTargetScore: parsedDominoTargetScore,
          timeLimit,
          startedAt: isSam9Challenge ? new Date() : null,
          player1Score: 0,
          player2Score: 0,
          player3Score: 0,
          player4Score: 0,
        }).returning();

        let sessionId: string | null = null;

        if (isSam9Challenge) {
          const [gameRecord] = await tx.select().from(games).where(ilike(games.name, normalizedGameType)).limit(1);
          let gameId: string;

          if (!gameRecord) {
            const gameTypeName = normalizedGameType.charAt(0).toUpperCase() + normalizedGameType.slice(1);
            const [fallbackRecord] = await tx.select().from(games).where(eq(games.name, gameTypeName)).limit(1);
            if (!fallbackRecord) {
              throw new Error(`Game configuration not found: ${normalizedGameType}`);
            }
            gameId = fallbackRecord.id;
          } else {
            gameId = gameRecord.id;
          }

          const { gameState, currentTurn } = buildInitialChallengeState(createdChallenge);

          const [liveSession] = await tx.insert(liveGameSessions).values({
            challengeId: createdChallenge.id,
            gameId,
            gameType: createdChallenge.gameType,
            player1Id: createdChallenge.player1Id,
            player2Id: createdChallenge.player2Id,
            player3Id: createdChallenge.player3Id,
            player4Id: createdChallenge.player4Id,
            currentTurn,
            status: 'in_progress',
            gameState,
          }).returning();

          sessionId = liveSession.id;

          await tx.insert(challengeGameSessions).values({
            challengeId: createdChallenge.id,
            gameType: createdChallenge.gameType,
            currentTurn,
            player1TimeRemaining: createdChallenge.timeLimit || 300,
            player2TimeRemaining: createdChallenge.timeLimit || 300,
            gameState,
            status: 'playing',
          });
        }

        return { challenge: createdChallenge, sessionId };
      });

      // Get player details for response
      const player1 = await storage.getUser(req.user!.id);
      const player2 = dbChallenge.player2Id ? await storage.getUser(dbChallenge.player2Id) : null;
      const gamesWon = player1?.gamesWon || 0;
      const gamesLost = player1?.gamesLost || 0;
      const totalGames = gamesWon + gamesLost;
      const winRate = totalGames > 0 ? Math.round((gamesWon / totalGames) * 100) : 50;
      const rank = winRate >= 80 ? "diamond" : winRate >= 60 ? "gold" : winRate >= 40 ? "silver" : "bronze";

      const p2GamesWon = player2?.gamesWon || 0;
      const p2GamesLost = player2?.gamesLost || 0;
      const p2TotalGames = p2GamesWon + p2GamesLost;
      const p2WinRate = p2TotalGames > 0 ? Math.round((p2GamesWon / p2TotalGames) * 100) : 50;
      const p2Rank = p2WinRate >= 80 ? "diamond" : p2WinRate >= 60 ? "gold" : p2WinRate >= 40 ? "silver" : "bronze";

      const challenge = {
        ...dbChallenge,
        sessionId: sam9SessionId,
        chessSystem: normalizedGameType === 'chess' ? (typeof chessSystem === 'string' && chessSystem ? chessSystem : 'rapid_10_0') : null,
        player1Name: req.user!.username,
        player1Rating: { wins: gamesWon, losses: gamesLost, winRate, rank },
        player2Name: normalizedOpponentType === 'sam9'
          ? 'SAM9'
          : (player2?.nickname || player2?.username || null),
        player2Rating: player2
          ? { wins: p2GamesWon, losses: p2GamesLost, winRate: p2WinRate, rank: p2Rank }
          : null,
        spectatorCount: 0,
        totalBets: 0,
        houseFee: gameConfig.houseFee,
      };

      // Broadcast new challenge to all connected clients for real-time updates
      broadcastChallengeUpdate(isSam9Challenge ? 'started' : 'created', challenge);

      // Notify targeted friend if this is a friend challenge
      if (normalizedOpponentType === 'friend' && friendAccountId) {
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
