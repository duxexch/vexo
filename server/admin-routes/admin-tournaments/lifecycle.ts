import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  users, type TournamentStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { sendNotification } from "../../websocket";
import {
  autoAdvanceTournamentByes,
  isAllowedTournamentStatusTransition,
} from "../../lib/tournament-utils";

export function registerTournamentLifecycleRoutes(app: Express) {

  app.put("/api/admin/tournaments/:id/status", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status: newStatus } = req.body;

      const validStatuses: TournamentStatus[] = ['upcoming', 'registration', 'in_progress', 'completed', 'cancelled'];
      if (typeof newStatus !== 'string' || !validStatuses.includes(newStatus as TournamentStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const nextStatus = newStatus as TournamentStatus;
      const oldStatus = tournament.status;

      if (!isAllowedTournamentStatusTransition(oldStatus, nextStatus)) {
        return res.status(400).json({
          error: `Invalid tournament status transition from ${oldStatus} to ${nextStatus}`,
        });
      }

      const participants = await db.select()
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, id));

      const shouldRefundOnCancel = nextStatus === 'cancelled'
        && parseFloat(tournament.entryFee) > 0
        && (oldStatus === 'upcoming' || oldStatus === 'registration');

      await db.transaction(async (tx) => {
        if (shouldRefundOnCancel) {
          for (const participant of participants) {
            await tx.update(users)
              .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${tournament.entryFee})::text` })
              .where(eq(users.id, participant.userId));
          }
        }

        await tx.update(tournaments)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(tournaments.id, id));
      });

      if (nextStatus === 'cancelled') {
        const tName = tournament.name || 'Tournament';
        const tNameAr = tournament.nameAr || tName;

        for (const participant of participants) {
          if (shouldRefundOnCancel) {
            sendNotification(participant.userId, {
              type: 'transaction',
              priority: 'high',
              title: 'Tournament Cancelled — Refunded',
              titleAr: 'تم إلغاء البطولة — تم الاسترداد',
              message: `"${tName}" has been cancelled. Your entry fee of $${tournament.entryFee} has been refunded.`,
              messageAr: `تم إلغاء "${tNameAr}". تم استرداد رسوم الدخول $${tournament.entryFee}.`,
              link: '/tournaments',
              metadata: JSON.stringify({ tournamentId: id, action: 'tournament_cancelled_refund', refund: tournament.entryFee }),
            }).catch(() => { });
          } else {
            sendNotification(participant.userId, {
              type: 'announcement',
              priority: 'high',
              title: 'Tournament Cancelled',
              titleAr: 'تم إلغاء البطولة',
              message: `"${tName}" has been cancelled.`,
              messageAr: `تم إلغاء "${tNameAr}".`,
              link: '/tournaments',
              metadata: JSON.stringify({ tournamentId: id, action: 'tournament_cancelled' }),
            }).catch(() => { });
          }
        }
      }

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: oldStatus,
        newValue: nextStatus,
        reason: `Tournament status changed from ${oldStatus} to ${nextStatus}`,
        metadata: JSON.stringify({ refunded: shouldRefundOnCancel }),
      }, req);

      res.json({ success: true, refunded: shouldRefundOnCancel });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/tournaments/:id/start", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (tournament.status === 'in_progress' || tournament.status === 'completed' || tournament.status === 'cancelled') {
        return res.status(400).json({ error: "Tournament already started or completed" });
      }

      if (tournament.status !== 'registration' && tournament.status !== 'upcoming') {
        return res.status(400).json({ error: `Tournament cannot be started from status ${tournament.status}` });
      }

      const participants = await db.select()
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, id))
        .orderBy(tournamentParticipants.seed);

      if (participants.length < (tournament.minPlayers || 4)) {
        return res.status(400).json({ error: `Need at least ${tournament.minPlayers} players` });
      }

      // Shuffle participants for fair seeding
      const shuffled = [...participants].sort(() => Math.random() - 0.5);

      // Generate first round matches (single elimination)
      const totalSlots = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
      const totalRounds = Math.ceil(Math.log2(totalSlots));
      const firstRoundMatches = totalSlots / 2;
      const now = new Date();

      type MatchInsert = typeof tournamentMatches.$inferInsert;
      const matchValues: MatchInsert[] = [];
      for (let m = 0; m < firstRoundMatches; m++) {
        const p1 = shuffled[m * 2];
        const p2 = shuffled[m * 2 + 1];
        matchValues.push({
          tournamentId: id,
          round: 1,
          matchNumber: m + 1,
          player1Id: p1?.userId || null,
          player2Id: p2?.userId || null,
          status: (!p1 || !p2) ? 'bye' : 'pending',
        });
      }

      await db.transaction(async (tx) => {
        for (let i = 0; i < shuffled.length; i += 1) {
          await tx.update(tournamentParticipants)
            .set({ seed: i + 1 })
            .where(eq(tournamentParticipants.id, shuffled[i].id));
        }

        await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

        if (matchValues.length > 0) {
          await tx.insert(tournamentMatches).values(matchValues);
        }

        // Generate placeholder matches for subsequent rounds
        for (let round = 2; round <= totalRounds; round += 1) {
          const roundMatches = totalSlots / Math.pow(2, round);
          const placeholders: MatchInsert[] = [];

          for (let matchNumber = 0; matchNumber < roundMatches; matchNumber += 1) {
            placeholders.push({
              tournamentId: id,
              round,
              matchNumber: matchNumber + 1,
              player1Id: null,
              player2Id: null,
              status: 'pending',
            });
          }

          if (placeholders.length > 0) {
            await tx.insert(tournamentMatches).values(placeholders);
          }
        }

        await tx.update(tournaments)
          .set({
            status: 'in_progress',
            currentRound: 1,
            totalRounds,
            startsAt: tournament.startsAt || now,
            updatedAt: now,
          })
          .where(eq(tournaments.id, id));
      });

      await autoAdvanceTournamentByes(id, totalRounds);

      const [nextRound] = await db.select({ round: tournamentMatches.round })
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.tournamentId, id),
          sql`${tournamentMatches.status} <> 'completed'`,
        ))
        .orderBy(tournamentMatches.round)
        .limit(1);

      const currentRound = nextRound?.round ?? totalRounds;
      if (currentRound !== 1) {
        await db.update(tournaments)
          .set({ currentRound, updatedAt: new Date() })
          .where(eq(tournaments.id, id));
      }

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        newValue: JSON.stringify({ totalRounds, participants: shuffled.length, currentRound }),
        reason: "Tournament started, bracket generated",
      }, req);

      // Notify all participants that tournament has started
      const tName = tournament.name || 'Tournament';
      const tNameAr = tournament.nameAr || tName;
      for (const p of shuffled) {
        sendNotification(p.userId, {
          type: 'announcement',
          priority: 'high',
          title: 'Tournament Started!',
          titleAr: 'بدأت البطولة!',
          message: `"${tName}" has started! Check your bracket and prepare for your matches.`,
          messageAr: `بدأت "${tNameAr}"! تحقق من جدول المباريات واستعد.`,
          link: `/tournaments/${id}`,
          metadata: JSON.stringify({ tournamentId: id, action: 'tournament_started', totalRounds }),
        }).catch(() => { });
      }

      res.json({ success: true, totalRounds, firstRoundMatches: matchValues.length, currentRound });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
