import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  transactions,
  users,
  projectCurrencyWallets,
  projectCurrencyLedger,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import {
  autoAdvanceTournamentByes,
  canDeleteTournament,
  settleTournamentPrizes,
  normalizeTournamentCurrencyType,
} from "../../lib/tournament-utils";

export function registerTournamentMatchRoutes(app: Express) {

  app.post("/api/admin/tournaments/:id/settle-prizes", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select({
        id: tournaments.id,
        status: tournaments.status,
        prizesSettledAt: tournaments.prizesSettledAt,
      }).from(tournaments).where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (tournament.status !== "completed") {
        return res.status(400).json({ error: "Tournament must be completed before prize settlement" });
      }

      const settlementResult = await settleTournamentPrizes(id);
      if (!settlementResult.settled && settlementResult.reason !== "Prizes already settled") {
        return res.status(400).json({ error: settlementResult.reason || "Prize settlement failed" });
      }

      const alreadySettled = settlementResult.reason === "Prizes already settled" || Boolean(tournament.prizesSettledAt);

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        newValue: JSON.stringify({
          action: "settle_prizes",
          alreadySettled,
          payoutCount: settlementResult.payoutCount,
        }),
        reason: "Tournament prize settlement requested from admin panel",
      }, req);

      return res.json({
        success: true,
        alreadySettled,
        payoutCount: settlementResult.payoutCount,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

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
      const deleteResult = await db.transaction(async (tx) => {
        const [lockedTournament] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for('update');
        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        if (!canDeleteTournament(lockedTournament.status)) {
          throw new Error(`Cannot delete tournament in status ${lockedTournament.status}. Cancel or finish lifecycle first.`);
        }

        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee || "0");
        const normalizedEntryFee = Number.isFinite(entryFeeValue)
          ? Number(entryFeeValue.toFixed(2))
          : 0;

        const shouldRefundOnDelete = normalizedEntryFee > 0
          && (lockedTournament.status === 'upcoming' || lockedTournament.status === 'registration');

        let refundedCount = 0;
        const tournamentCurrency = normalizeTournamentCurrencyType(lockedTournament.currency);

        if (shouldRefundOnDelete) {
          const participants = await tx.select({ userId: tournamentParticipants.userId })
            .from(tournamentParticipants)
            .where(eq(tournamentParticipants.tournamentId, id));

          for (const participant of participants) {
            const refundReferenceId = `tournament-delete-refund:${id}:${participant.userId}`;

            if (tournamentCurrency === "project") {
              await tx.insert(projectCurrencyWallets).values({ userId: participant.userId }).onConflictDoNothing();

              const [wallet] = await tx.select()
                .from(projectCurrencyWallets)
                .where(eq(projectCurrencyWallets.userId, participant.userId))
                .for('update');

              if (!wallet) {
                continue;
              }

              const earnedBalance = Number.parseFloat(wallet.earnedBalance || "0");
              const totalBalance = Number.parseFloat(wallet.totalBalance || "0");
              const newEarned = (earnedBalance + normalizedEntryFee).toFixed(2);
              const newTotal = (totalBalance + normalizedEntryFee).toFixed(2);

              await tx.update(projectCurrencyWallets)
                .set({
                  earnedBalance: newEarned,
                  totalBalance: newTotal,
                  updatedAt: new Date(),
                })
                .where(eq(projectCurrencyWallets.id, wallet.id));

              await tx.insert(projectCurrencyLedger).values({
                userId: participant.userId,
                walletId: wallet.id,
                type: "refund",
                amount: normalizedEntryFee.toFixed(2),
                balanceBefore: totalBalance.toFixed(2),
                balanceAfter: newTotal,
                referenceId: refundReferenceId,
                referenceType: "tournament_delete_refund",
                description: `Tournament deleted refund (${lockedTournament.name || "Tournament"})`,
              });
            } else {
              const [user] = await tx.select({ balance: users.balance })
                .from(users)
                .where(eq(users.id, participant.userId))
                .for('update');

              if (!user) {
                continue;
              }

              const balanceBeforeValue = Number.parseFloat(user.balance || "0");
              const balanceAfterValue = Number((balanceBeforeValue + normalizedEntryFee).toFixed(2));

              await tx.update(users)
                .set({ balance: balanceAfterValue.toFixed(2) })
                .where(eq(users.id, participant.userId));

              await tx.insert(transactions).values({
                userId: participant.userId,
                type: "refund",
                status: "completed",
                amount: normalizedEntryFee.toFixed(2),
                balanceBefore: balanceBeforeValue.toFixed(2),
                balanceAfter: balanceAfterValue.toFixed(2),
                description: `Tournament deleted refund (${lockedTournament.name || "Tournament"})`,
                referenceId: refundReferenceId,
                processedAt: new Date(),
              });
            }

            refundedCount += 1;
          }

          const totalRefundAmount = Number((normalizedEntryFee * refundedCount).toFixed(2));
          if (totalRefundAmount > 0) {
            await tx.update(tournaments)
              .set({
                prizePool: sql`GREATEST(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) - ${totalRefundAmount}, 0)`,
                updatedAt: new Date(),
              })
              .where(eq(tournaments.id, id));
          }
        }

        await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
        await tx.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
        await tx.delete(tournaments).where(eq(tournaments.id, id));

        return {
          tournamentName: lockedTournament.name,
          tournamentStatus: lockedTournament.status,
          shouldRefundOnDelete,
          refundedCount,
        };
      });

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: JSON.stringify({ name: deleteResult.tournamentName, status: deleteResult.tournamentStatus }),
        newValue: JSON.stringify({
          refunded: deleteResult.shouldRefundOnDelete,
          refundedCount: deleteResult.refundedCount,
        }),
        reason: "Tournament deleted",
      }, req);

      res.json({
        success: true,
        refunded: deleteResult.shouldRefundOnDelete,
        refundedCount: deleteResult.refundedCount,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message === "Tournament not found") {
        return res.status(404).json({ error: message });
      }

      if (message.startsWith("Cannot delete tournament in status")) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });
}
