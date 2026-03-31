import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { tournaments, tournamentParticipants, tournamentMatches } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "../helpers";

export function registerTournamentResultRoutes(app: Express): void {

  // Admin: Report match result
  app.post("/api/admin/tournaments/matches/:matchId/result", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: "Admin only" });
      }

      const { matchId } = req.params;
      const { winnerId, player1Score, player2Score } = req.body;

      const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (match.status === 'completed') return res.status(400).json({ error: "Match already completed" });

      // Update match result
      await db.update(tournamentMatches)
        .set({
          winnerId,
          player1Score: player1Score ?? 0,
          player2Score: player2Score ?? 0,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(tournamentMatches.id, matchId));

      // Update participant stats
      const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
      await db.update(tournamentParticipants)
        .set({ wins: sql`${tournamentParticipants.wins} + 1` })
        .where(and(
          eq(tournamentParticipants.tournamentId, match.tournamentId),
          eq(tournamentParticipants.userId, winnerId),
        ));
      if (loserId) {
        await db.update(tournamentParticipants)
          .set({ losses: sql`${tournamentParticipants.losses} + 1`, isEliminated: true })
          .where(and(
            eq(tournamentParticipants.tournamentId, match.tournamentId),
            eq(tournamentParticipants.userId, loserId),
          ));
      }

      // Get tournament info
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, match.tournamentId));
      if (!tournament) return res.status(500).json({ error: "Tournament not found" });

      // Advance winner
      if (match.round < tournament.totalRounds) {
        const nextMatchNum = Math.ceil(match.matchNumber / 2);
        const isTopSlot = match.matchNumber % 2 === 1;
        await db.update(tournamentMatches)
          .set(isTopSlot ? { player1Id: winnerId } : { player2Id: winnerId })
          .where(and(
            eq(tournamentMatches.tournamentId, match.tournamentId),
            eq(tournamentMatches.round, match.round + 1),
            eq(tournamentMatches.matchNumber, nextMatchNum),
          ));
      }

      // Notify match winner & loser (non-blocking)
      const tName = tournament.name || 'Tournament';
      const tNameAr = tournament.nameAr || tName;
      const roundLabel = `Round ${match.round}`;
      const roundLabelAr = `الجولة ${match.round}`;

      // Only send match-level notifications for non-final matches (finals handled below)
      if (match.round !== tournament.totalRounds) {
        sendNotification(winnerId, {
          type: 'success',
          priority: 'high',
          title: 'Match Won — Advanced!',
          titleAr: 'فزت بالمباراة — تأهلت!',
          message: `You won your ${roundLabel} match in "${tName}" and advance to the next round!`,
          messageAr: `فزت بمباراة ${roundLabelAr} في "${tNameAr}" وتأهلت للجولة التالية!`,
          link: `/tournaments/${match.tournamentId}`,
          metadata: JSON.stringify({ tournamentId: match.tournamentId, action: 'tournament_match_won', round: match.round }),
        }).catch(() => {});
        if (loserId) {
          sendNotification(loserId, {
            type: 'announcement',
            priority: 'normal',
            title: 'Tournament Match Lost',
            titleAr: 'خسرت مباراة البطولة',
            message: `You were eliminated in ${roundLabel} of "${tName}". Better luck next time!`,
            messageAr: `تم إقصاؤك في ${roundLabelAr} من "${tNameAr}". حظاً أوفر في المرة القادمة!`,
            link: `/tournaments/${match.tournamentId}`,
            metadata: JSON.stringify({ tournamentId: match.tournamentId, action: 'tournament_match_lost', round: match.round }),
          }).catch(() => {});
        }
      }

      // Check if tournament is complete (final match)
      if (match.round === tournament.totalRounds) {
        await db.update(tournaments)
          .set({
            status: 'completed',
            winnerId,
            endsAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tournaments.id, match.tournamentId));

        // Set winner placement
        await db.update(tournamentParticipants)
          .set({ placement: 1 })
          .where(and(
            eq(tournamentParticipants.tournamentId, match.tournamentId),
            eq(tournamentParticipants.userId, winnerId),
          ));
        if (loserId) {
          await db.update(tournamentParticipants)
            .set({ placement: 2 })
            .where(and(
              eq(tournamentParticipants.tournamentId, match.tournamentId),
              eq(tournamentParticipants.userId, loserId),
            ));
        }

        // Notify tournament winner
        const tName = tournament.name || 'Tournament';
        const tNameAr = tournament.nameAr || tName;
        const prize = parseFloat(tournament.prizePool) > 0 ? ` Prize: $${tournament.prizePool}` : '';
        const prizeAr = parseFloat(tournament.prizePool) > 0 ? ` الجائزة: $${tournament.prizePool}` : '';
        sendNotification(winnerId, {
          type: 'success',
          priority: 'urgent',
          title: 'Tournament Champion! 🏆',
          titleAr: 'بطل البطولة! 🏆',
          message: `Congratulations! You won "${tName}"!${prize}`,
          messageAr: `تهانينا! فزت ببطولة "${tNameAr}"!${prizeAr}`,
          link: `/tournaments/${match.tournamentId}`,
          metadata: JSON.stringify({ tournamentId: match.tournamentId, action: 'tournament_won', placement: 1 }),
        }).catch(() => {});
        if (loserId) {
          sendNotification(loserId, {
            type: 'announcement',
            priority: 'high',
            title: 'Tournament Runner-Up',
            titleAr: 'الوصيف في البطولة',
            message: `Great effort! You finished 2nd in "${tName}".`,
            messageAr: `أداء رائع! حصلت على المركز الثاني في "${tNameAr}".`,
            link: `/tournaments/${match.tournamentId}`,
            metadata: JSON.stringify({ tournamentId: match.tournamentId, action: 'tournament_runner_up', placement: 2 }),
          }).catch(() => {});
        }
      } else {
        // Update current round
        const allRoundMatches = await db.select()
          .from(tournamentMatches)
          .where(and(
            eq(tournamentMatches.tournamentId, match.tournamentId),
            eq(tournamentMatches.round, match.round),
          ));
        const allCompleted = allRoundMatches.every(m => m.status === 'completed' || m.status === 'bye');
        if (allCompleted) {
          await db.update(tournaments)
            .set({ currentRound: match.round + 1, updatedAt: new Date() })
            .where(eq(tournaments.id, match.tournamentId));
        }
      }

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
