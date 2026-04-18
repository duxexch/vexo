import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  users,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import {
  autoAdvanceTournamentByes,
  canDeleteTournament,
  settleTournamentPrizes,
} from "../../lib/tournament-utils";

export function registerTournamentMatchRoutes(app: Express) {

  app.post("/api/admin/tournaments/matches/:matchId/result", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const { winnerId, player1Score, player2Score } = req.body;

      if (typeof winnerId !== 'string' || winnerId.length === 0) {
        return res.status(400).json({ error: "Winner is required" });
      }

      const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
      if (!match) return res.status(404).json({ error: "Match not found" });
      if (match.status === 'completed') return res.status(400).json({ error: "Match already completed" });

      if (!match.player1Id || !match.player2Id) {
        return res.status(400).json({ error: "Cannot report result for a non-ready match" });
      }

      if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
        return res.status(400).json({ error: "Winner must be one of the match players" });
      }

      const safePlayer1Score = Math.max(0, Number.parseInt(String(player1Score ?? 0), 10) || 0);
      const safePlayer2Score = Math.max(0, Number.parseInt(String(player2Score ?? 0), 10) || 0);

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, match.tournamentId));
      if (!tournament) return res.status(500).json({ error: "Tournament not found" });

      if (tournament.status !== 'in_progress') {
        return res.status(400).json({ error: "Tournament is not in progress" });
      }

      const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

      await db.transaction(async (tx) => {
        const [updatedMatch] = await tx.update(tournamentMatches)
          .set({
            winnerId,
            player1Score: safePlayer1Score,
            player2Score: safePlayer2Score,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(and(
            eq(tournamentMatches.id, matchId),
            sql`${tournamentMatches.status} <> 'completed'`,
          ))
          .returning({ id: tournamentMatches.id });

        if (!updatedMatch) {
          throw new Error("Match already completed");
        }

        await tx.update(tournamentParticipants)
          .set({ wins: sql`${tournamentParticipants.wins} + 1` })
          .where(and(
            eq(tournamentParticipants.tournamentId, match.tournamentId),
            eq(tournamentParticipants.userId, winnerId),
          ));

        if (loserId) {
          await tx.update(tournamentParticipants)
            .set({ losses: sql`${tournamentParticipants.losses} + 1`, isEliminated: true })
            .where(and(
              eq(tournamentParticipants.tournamentId, match.tournamentId),
              eq(tournamentParticipants.userId, loserId),
            ));
        }

        // Advance winner to next round
        if (match.round < tournament.totalRounds) {
          const nextMatchNum = Math.ceil(match.matchNumber / 2);
          const isTopSlot = match.matchNumber % 2 === 1;
          await tx.update(tournamentMatches)
            .set(isTopSlot ? { player1Id: winnerId } : { player2Id: winnerId })
            .where(and(
              eq(tournamentMatches.tournamentId, match.tournamentId),
              eq(tournamentMatches.round, match.round + 1),
              eq(tournamentMatches.matchNumber, nextMatchNum),
            ));
        }
      });

      await autoAdvanceTournamentByes(match.tournamentId, tournament.totalRounds);

      const [finalMatch] = await db.select({
        player1Id: tournamentMatches.player1Id,
        player2Id: tournamentMatches.player2Id,
        winnerId: tournamentMatches.winnerId,
        status: tournamentMatches.status,
      })
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.tournamentId, match.tournamentId),
          eq(tournamentMatches.round, tournament.totalRounds),
          eq(tournamentMatches.matchNumber, 1),
        ));

      // Check if tournament is complete (including bye-driven completion after propagation)
      if (finalMatch?.status === 'completed' && finalMatch.winnerId) {
        await db.update(tournaments)
          .set({
            status: 'completed',
            winnerId: finalMatch.winnerId,
            currentRound: tournament.totalRounds,
            endsAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tournaments.id, match.tournamentId));

        const settlementResult = await settleTournamentPrizes(match.tournamentId);
        if (!settlementResult.settled && settlementResult.reason !== "Prizes already settled") {
          throw new Error(settlementResult.reason || "Failed to settle tournament prizes");
        }
      } else {
        const [nextRoundMatch] = await db.select({ round: tournamentMatches.round })
          .from(tournamentMatches)
          .where(and(
            eq(tournamentMatches.tournamentId, match.tournamentId),
            sql`${tournamentMatches.status} <> 'completed'`,
          ))
          .orderBy(tournamentMatches.round)
          .limit(1);

        const nextRound = nextRoundMatch?.round;
        if (nextRound && nextRound !== tournament.currentRound) {
          await db.update(tournaments)
            .set({ currentRound: nextRound, updatedAt: new Date() })
            .where(eq(tournaments.id, match.tournamentId));
        }
      }

      res.json({ success: true });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message === "Match already completed") {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/admin/tournaments/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (!canDeleteTournament(tournament.status)) {
        return res.status(400).json({
          error: `Cannot delete tournament in status ${tournament.status}. Cancel or finish lifecycle first.`,
        });
      }

      const shouldRefundOnDelete = parseFloat(tournament.entryFee) > 0
        && (tournament.status === 'upcoming' || tournament.status === 'registration');

      await db.transaction(async (tx) => {
        if (shouldRefundOnDelete) {
          const participants = await tx.select().from(tournamentParticipants)
            .where(eq(tournamentParticipants.tournamentId, id));

          for (const participant of participants) {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${tournament.entryFee})::text` })
              .where(eq(users.id, participant.userId));
          }
        }

        await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
        await tx.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
        await tx.delete(tournaments).where(eq(tournaments.id, id));
      });

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: JSON.stringify({ name: tournament.name, status: tournament.status }),
        newValue: JSON.stringify({ refunded: shouldRefundOnDelete }),
        reason: "Tournament deleted",
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
