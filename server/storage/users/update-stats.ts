import {
  users,
  type User,
} from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// ==================== GAME STATS UPDATE ====================

export async function updateGameStats(
  sessionId: string,
  gameType: string,
  winnerId: string | null,
  player1Id: string,
  player2Id: string | null,
  isDraw: boolean = false,
  winAmount: string = "0"
): Promise<{ success: boolean; error?: string }> {
  const playerIds = [player1Id, player2Id].filter(Boolean) as string[];
  if (playerIds.length === 0) {
    return { success: false, error: 'No players to update' };
  }

  const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot', 'languageduel'];
  const isValidGameType = validGameTypes.includes(gameType);

  return await db.transaction(async (tx) => {
    const sortedIds = [...playerIds].sort();
    const lockedUsers: Record<string, User> = {};

    for (const id of sortedIds) {
      const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (user) lockedUsers[id] = user;
    }

    for (const playerId of playerIds) {
      const user = lockedUsers[playerId];
      if (!user) continue;

      const isWinner = winnerId === playerId;
      const isLoser = winnerId && winnerId !== playerId && !isDraw;

      const updates: Record<string, unknown> = {
        gamesPlayed: user.gamesPlayed + 1,
        updatedAt: new Date()
      };

      if (isValidGameType) {
        const playedField = `${gameType}Played`;
        updates[playedField] = (user as unknown as Record<string, number>)[playedField] + 1;
      }

      if (isWinner) {
        updates.gamesWon = user.gamesWon + 1;
        updates.currentWinStreak = user.currentWinStreak + 1;
        updates.longestWinStreak = Math.max(user.longestWinStreak, user.currentWinStreak + 1);

        if (isValidGameType) {
          const wonField = `${gameType}Won`;
          updates[wonField] = (user as unknown as Record<string, number>)[wonField] + 1;
        }

        if (winAmount && parseFloat(winAmount) > 0) {
          updates.totalEarnings = (parseFloat(user.totalEarnings) + parseFloat(winAmount)).toFixed(2);
        }
      } else if (isLoser) {
        updates.gamesLost = user.gamesLost + 1;
        updates.currentWinStreak = 0;
      } else if (isDraw) {
        updates.gamesDraw = user.gamesDraw + 1;
        updates.currentWinStreak = 0;
      }

      await tx.update(users).set(updates).where(eq(users.id, playerId));
    }

    return { success: true };
  });
}
