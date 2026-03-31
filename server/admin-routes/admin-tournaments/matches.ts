import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  users,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerTournamentMatchRoutes(app: Express) {

  app.post("/api/admin/tournaments/matches/:matchId/result", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const { winnerId, player1Score, player2Score } = req.body;

      const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (match.status === 'completed') return res.status(400).json({ error: "Match already completed" });

      await db.update(tournamentMatches)
        .set({
          winnerId,
          player1Score: player1Score ?? 0,
          player2Score: player2Score ?? 0,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(tournamentMatches.id, matchId));

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

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, match.tournamentId));
      if (!tournament) return res.status(500).json({ error: "Tournament not found" });

      // Advance winner to next round
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

      // Check if tournament is complete
      if (match.round === tournament.totalRounds) {
        await db.update(tournaments)
          .set({
            status: 'completed',
            winnerId,
            endsAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tournaments.id, match.tournamentId));

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
      } else {
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

  app.delete("/api/admin/tournaments/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      // Refund participants if there was an entry fee
      if (parseFloat(tournament.entryFee) > 0) {
        const participants = await db.select().from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));
        for (const p of participants) {
          await db.update(users)
            .set({ balance: sql`${users.balance} + ${tournament.entryFee}` })
            .where(eq(users.id, p.userId));
        }
      }

      await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
      await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
      await db.delete(tournaments).where(eq(tournaments.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: JSON.stringify({ name: tournament.name, status: tournament.status }),
        reason: "Tournament deleted",
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
