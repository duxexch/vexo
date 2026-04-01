import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, or, ilike, sql, gte } from "drizzle-orm";
import { users, projectCurrencyWallets, projectCurrencyLedger, challenges as challengesTable, liveGameSessions, challengeGameSessions, games, gameplaySettings, gameMatches } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { broadcastChallengeUpdate, broadcastToUser } from "../../websocket";
import { sendNotification } from "../../websocket";
import { getErrorMessage, challengeJoinLocks, isFriendChallengePendingAcceptance } from "./helpers";
import { getGameEngine } from "../../game-engines";

type ChallengeRow = typeof challengesTable.$inferSelect;

function buildInitialChallengeState(challenge: ChallengeRow): { gameState: string; currentTurn: string } {
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
        gameState = engine.initializeWithPlayers(playerIds);
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

export function registerJoinRoute(app: Express) {
  app.post("/api/challenges/:id/join", authMiddleware, async (req: AuthRequest, res: Response) => {
    const challengeId = req.params.id;

    // Acquire lock for this challenge
    if (challengeJoinLocks.has(challengeId)) {
      return res.status(400).json({ error: "Challenge is no longer available" });
    }
    challengeJoinLocks.add(challengeId);

    try {
      // Read challenge from DB instead of memory
      const userId = req.user!.id;
      const [dbChallenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, challengeId)).limit(1);
      if (!dbChallenge) {
        challengeJoinLocks.delete(challengeId);
        return res.status(404).json({ error: "Challenge not found" });
      }
      if (dbChallenge.player1Id === req.user!.id) {
        challengeJoinLocks.delete(challengeId);
        return res.status(400).json({ error: "Cannot join your own challenge" });
      }
      if (dbChallenge.status !== 'waiting') {
        challengeJoinLocks.delete(challengeId);
        return res.status(400).json({ error: "Challenge is no longer available" });
      }

      if (isFriendChallengePendingAcceptance(dbChallenge) && dbChallenge.friendAccountId !== userId) {
        challengeJoinLocks.delete(challengeId);
        return res.status(403).json({ error: "This challenge is reserved for the invited friend" });
      }

      // Check free play daily limit for joining player
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
            challengeJoinLocks.delete(challengeId);
            return res.status(400).json({ error: "Daily free play limit reached" });
          }
        }
      }

      // Use DB challenge for financial logic
      const challenge = dbChallenge;

      const [currencyModeSetting] = await db.select({ value: gameplaySettings.value })
        .from(gameplaySettings)
        .where(eq(gameplaySettings.key, 'play_gift_currency_mode'))
        .limit(1);
      const enforceProjectOnly = !currencyModeSetting || currencyModeSetting.value !== 'mixed';
      if (enforceProjectOnly && (challenge.currencyType || 'usd') === 'usd') {
        challengeJoinLocks.delete(challengeId);
        return res.status(400).json({
          error: 'Real-money gameplay is disabled. Convert to project currency to join games.',
        });
      }

      // Financial safety: Check and deduct balance using transaction with row-level locking
      const betAmount = parseFloat(String(challenge.betAmount));
      const currencyType = challenge.currencyType || 'usd';

      const txResult = await db.transaction(async (tx) => {
        if (currencyType === 'project') {
          // Handle project currency entry
          const [wallet] = await tx.select()
            .from(projectCurrencyWallets)
            .where(eq(projectCurrencyWallets.userId, userId))
            .for('update');

          if (!wallet) {
            throw new Error('Project currency wallet not found');
          }

          // Deduct from earned first, then purchased
          let earnedBalance = parseFloat(wallet.earnedBalance);
          let purchasedBalance = parseFloat(wallet.purchasedBalance);
          const totalBalance = earnedBalance + purchasedBalance;

          if (totalBalance < betAmount) {
            throw new Error('Insufficient project currency balance to join this challenge');
          }

          // Deduct from earned first, then purchased
          let remaining = betAmount;
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

          await tx.insert(projectCurrencyLedger).values({
            walletId: wallet.id,
            userId: userId,
            type: 'game_stake',
            amount: (-betAmount).toFixed(2),
            balanceBefore: (parseFloat(wallet.earnedBalance) + parseFloat(wallet.purchasedBalance)).toFixed(2),
            balanceAfter: newTotal,
            description: `Game entry for challenge ${challengeId}`,
            referenceId: challengeId
          });
        } else {
          // Handle USD entry (original logic)
          const [userRecord] = await tx.select()
            .from(users)
            .where(eq(users.id, userId))
            .for('update');

          if (!userRecord) {
            throw new Error('User not found');
          }

          const currentBalance = parseFloat(userRecord.balance);
          if (currentBalance < betAmount) {
            throw new Error('Insufficient balance to join this challenge');
          }

          // Deduct balance
          await tx.update(users)
            .set({ balance: (currentBalance - betAmount).toString() })
            .where(eq(users.id, userId));
        }

        // Get current challenge state with lock
        const [lockedChallenge] = await tx.select()
          .from(challengesTable)
          .where(eq(challengesTable.id, challengeId))
          .for('update');

        if (!lockedChallenge || lockedChallenge.status !== 'waiting') {
          throw new Error('Challenge is no longer available - already taken or cancelled');
        }

        if (isFriendChallengePendingAcceptance(lockedChallenge)) {
          if (lockedChallenge.friendAccountId !== userId) {
            throw new Error('This challenge is reserved for the invited friend');
          }

          const required = lockedChallenge.requiredPlayers || 2;
          const current = Math.max(lockedChallenge.currentPlayers || 1, 1);
          const newPlayerCount = Math.min(current + 1, required);

          const updateFields: Record<string, unknown> = {
            currentPlayers: newPlayerCount,
            updatedAt: new Date(),
          };

          if (newPlayerCount >= required) {
            updateFields.status = 'active';
            updateFields.startedAt = new Date();
          }

          const updateResult = await tx.update(challengesTable)
            .set(updateFields)
            .where(eq(challengesTable.id, challengeId))
            .returning();

          if (updateResult.length === 0) {
            throw new Error('Failed to update challenge');
          }

          return { challenge: updateResult[0], isGameStarting: newPlayerCount >= required };
        }

        // Check if user already joined
        if (lockedChallenge.player1Id === userId ||
          lockedChallenge.player2Id === userId ||
          lockedChallenge.player3Id === userId ||
          lockedChallenge.player4Id === userId) {
          throw new Error('You have already joined this challenge');
        }

        const required = lockedChallenge.requiredPlayers || 2;
        const current = lockedChallenge.currentPlayers || 1;

        // Determine which slot to fill and update fields
        let updateFields: Record<string, unknown> = { updatedAt: new Date() };

        if (!lockedChallenge.player2Id) {
          updateFields.player2Id = userId;
        } else if (required >= 3 && !lockedChallenge.player3Id) {
          updateFields.player3Id = userId;
        } else if (required >= 4 && !lockedChallenge.player4Id) {
          updateFields.player4Id = userId;
        } else {
          throw new Error('Challenge is full');
        }

        const newPlayerCount = current + 1;
        updateFields.currentPlayers = newPlayerCount;

        // If all players joined, start the game
        if (newPlayerCount >= required) {
          updateFields.status = 'active';
          updateFields.startedAt = new Date();
        }

        const updateResult = await tx.update(challengesTable)
          .set(updateFields)
          .where(eq(challengesTable.id, challengeId))
          .returning();

        if (updateResult.length === 0) {
          throw new Error('Failed to update challenge');
        }

        return { challenge: updateResult[0], isGameStarting: newPlayerCount >= required };

      }) as { challenge: Record<string, unknown>; isGameStarting: boolean };

      // Release lock after success
      challengeJoinLocks.delete(challengeId);

      // Fetch updated challenge from DB for accurate broadcast
      const [updatedChallenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, challengeId)).limit(1);

      // Get all players info
      const player1 = await storage.getUser(updatedChallenge!.player1Id);
      const player2 = updatedChallenge!.player2Id ? await storage.getUser(updatedChallenge!.player2Id) : null;
      const player3 = updatedChallenge!.player3Id ? await storage.getUser(updatedChallenge!.player3Id) : null;
      const player4 = updatedChallenge!.player4Id ? await storage.getUser(updatedChallenge!.player4Id) : null;

      // If game is not starting yet (waiting for more players), just broadcast player joined
      if (!txResult.isGameStarting) {
        const enrichedChallenge = {
          ...updatedChallenge,
          player1Name: player1?.nickname || player1?.username,
          player2Name: player2?.nickname || player2?.username,
          player3Name: player3?.nickname || player3?.username,
          player4Name: player4?.nickname || player4?.username,
          waitingForPlayers: (updatedChallenge!.requiredPlayers || 2) - (updatedChallenge!.currentPlayers || 1),
        };

        // Broadcast player joined event
        broadcastChallengeUpdate('joined', enrichedChallenge);

        // Notify existing players that someone joined
        const existingPlayerIds = [updatedChallenge!.player1Id, updatedChallenge!.player2Id, updatedChallenge!.player3Id].filter(id => id && id !== userId);
        const joiner = await storage.getUser(userId);
        existingPlayerIds.forEach(playerId => {
          broadcastToUser(playerId!, {
            type: 'player_joined',
            payload: {
              challengeId,
              playerId: userId,
              playerName: joiner?.nickname || joiner?.username,
              currentPlayers: updatedChallenge!.currentPlayers,
              requiredPlayers: updatedChallenge!.requiredPlayers,
            }
          });
        });

        // Persist notification to challenge creator that someone joined
        const joinerName = joiner?.nickname || joiner?.username || 'Someone';
        sendNotification(updatedChallenge!.player1Id, {
          type: 'system',
          priority: 'normal',
          title: `Player Joined Your Challenge`,
          titleAr: `لاعب انضم لتحديك`,
          message: `${joinerName} joined your ${updatedChallenge!.gameType} challenge. ${(updatedChallenge!.requiredPlayers || 2) - (updatedChallenge!.currentPlayers || 1)} more players needed.`,
          messageAr: `${joinerName} انضم لتحدي ${updatedChallenge!.gameType} الخاص بك. مطلوب ${(updatedChallenge!.requiredPlayers || 2) - (updatedChallenge!.currentPlayers || 1)} لاعبين آخرين.`,
          link: '/challenges',
          metadata: JSON.stringify({ challengeId }),
        }).catch(() => { });

        return res.json(enrichedChallenge);
      }

      // Game is starting! Create session and notify all players
      const gameType = updatedChallenge!.gameType.toLowerCase();
      const [gameRecord] = await db.select().from(games).where(ilike(games.name, gameType)).limit(1);
      let gameId: string;
      if (!gameRecord) {
        const gameTypeName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
        const [fallbackRecord] = await db.select().from(games).where(eq(games.name, gameTypeName)).limit(1);
        if (!fallbackRecord) {
          console.error(`[Challenge Join] Game not found in games table: ${gameType}`);
          throw new Error(`Game configuration not found: ${gameType}`);
        }
        gameId = fallbackRecord.id;
      } else {
        gameId = gameRecord.id;
      }

      const { gameState, currentTurn } = buildInitialChallengeState(updatedChallenge!);

      // Create live game session for this challenge
      const [gameSession] = await db.insert(liveGameSessions).values({
        challengeId: challengeId,
        gameId: gameId,
        gameType: updatedChallenge!.gameType,
        player1Id: updatedChallenge!.player1Id,
        player2Id: updatedChallenge!.player2Id,
        player3Id: updatedChallenge!.player3Id,
        player4Id: updatedChallenge!.player4Id,
        currentTurn: currentTurn,
        status: 'in_progress',
        gameState,
      }).returning();

      // Keep legacy /challenge/:id/play websocket flow working by creating challenge_game_sessions.
      await db.insert(challengeGameSessions).values({
        challengeId: challengeId,
        gameType: updatedChallenge!.gameType,
        currentTurn: currentTurn,
        player1TimeRemaining: updatedChallenge!.timeLimit || 300,
        player2TimeRemaining: updatedChallenge!.timeLimit || 300,
        gameState,
        status: 'playing',
      });

      const enrichedChallenge = {
        ...updatedChallenge,
        sessionId: gameSession.id,
        player1Name: player1?.nickname || player1?.username,
        player2Name: player2?.nickname || player2?.username,
        player3Name: player3?.nickname || player3?.username,
        player4Name: player4?.nickname || player4?.username,
        player1Rating: { wins: player1?.gamesWon || 0, losses: player1?.gamesLost || 0, winRate: 50, rank: "silver" },
        player2Rating: { wins: player2?.gamesWon || 0, losses: player2?.gamesLost || 0, winRate: 50, rank: "silver" },
      };

      // Broadcast that challenge started for real-time updates
      broadcastChallengeUpdate('started', enrichedChallenge);

      // Send game_start notification to ALL players
      const allPlayerIds = [
        updatedChallenge!.player1Id,
        updatedChallenge!.player2Id,
        updatedChallenge!.player3Id,
        updatedChallenge!.player4Id,
      ].filter(id => id) as string[];

      // Persistent notification for game start
      for (const playerId of allPlayerIds) {
        await sendNotification(playerId, {
          type: 'system',
          priority: 'high',
          title: 'Game Starting! 🎮',
          titleAr: 'اللعبة تبدأ! 🎮',
          message: `Your ${updatedChallenge!.gameType} match is starting now! Bet: $${updatedChallenge!.betAmount}`,
          messageAr: `مباراة ${updatedChallenge!.gameType} الخاصة بك تبدأ الآن! الرهان: $${updatedChallenge!.betAmount}`,
          link: `/challenge/${challengeId}/play`,
          metadata: JSON.stringify({ challengeId, sessionId: gameSession.id, gameType: updatedChallenge!.gameType }),
        }).catch(() => { });
      }

      const gameStartMessage = {
        type: 'game_start',
        payload: {
          challengeId: challengeId,
          sessionId: gameSession.id,
          gameType: updatedChallenge!.gameType,
          betAmount: updatedChallenge!.betAmount,
          requiredPlayers: updatedChallenge!.requiredPlayers,
          player1Id: updatedChallenge!.player1Id,
          player1Name: player1?.nickname || player1?.username,
          player2Id: updatedChallenge!.player2Id,
          player2Name: player2?.nickname || player2?.username,
          player3Id: updatedChallenge!.player3Id,
          player3Name: player3?.nickname || player3?.username,
          player4Id: updatedChallenge!.player4Id,
          player4Name: player4?.nickname || player4?.username,
          redirectUrl: `/challenge/${challengeId}/play`,
        }
      };

      // Notify all players to redirect to the game
      allPlayerIds.forEach(playerId => {
        broadcastToUser(playerId, gameStartMessage);
      });

      res.json(enrichedChallenge);
    } catch (error: unknown) {
      challengeJoinLocks.delete(challengeId);
      const errorMessage = getErrorMessage(error);

      if (errorMessage.includes('This challenge is reserved for the invited friend')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (
        errorMessage.includes('Insufficient') ||
        errorMessage.includes('already joined') ||
        errorMessage.includes('Challenge is full')
      ) {
        return res.status(400).json({ error: errorMessage });
      }

      if (errorMessage.includes('no longer available') || errorMessage.includes('already taken')) {
        return res.status(409).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  });
}
