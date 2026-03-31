import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants, tournamentMatches,
  users, type TournamentStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { sendNotification } from "../../websocket";

export function registerTournamentLifecycleRoutes(app: Express) {

  app.put("/api/admin/tournaments/:id/status", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status: newStatus } = req.body;

      const validStatuses = ['upcoming', 'registration', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const oldStatus = tournament.status;

      // If cancelling, refund all participants
      if (newStatus === 'cancelled' && parseFloat(tournament.entryFee) > 0) {
        const participants = await db.select().from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));
        for (const p of participants) {
          await db.update(users)
            .set({ balance: sql`${users.balance} + ${tournament.entryFee}` })
            .where(eq(users.id, p.userId));
        }

        // Notify all participants about cancellation + refund
        const tName = tournament.name || 'Tournament';
        const tNameAr = tournament.nameAr || tName;
        for (const p of participants) {
          sendNotification(p.userId, {
            type: 'transaction',
            priority: 'high',
            title: 'Tournament Cancelled — Refunded',
            titleAr: 'تم إلغاء البطولة — تم الاسترداد',
            message: `"${tName}" has been cancelled. Your entry fee of $${tournament.entryFee} has been refunded.`,
            messageAr: `تم إلغاء "${tNameAr}". تم استرداد رسوم الدخول $${tournament.entryFee}.`,
            link: '/tournaments',
            metadata: JSON.stringify({ tournamentId: id, action: 'tournament_cancelled_refund', refund: tournament.entryFee }),
          }).catch(() => {});
        }
      }

      // If cancelling with no fee, still notify participants
      if (newStatus === 'cancelled' && parseFloat(tournament.entryFee) <= 0) {
        const participants = await db.select().from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));
        const tName = tournament.name || 'Tournament';
        const tNameAr = tournament.nameAr || tName;
        for (const p of participants) {
          sendNotification(p.userId, {
            type: 'announcement',
            priority: 'high',
            title: 'Tournament Cancelled',
            titleAr: 'تم إلغاء البطولة',
            message: `"${tName}" has been cancelled.`,
            messageAr: `تم إلغاء "${tNameAr}".`,
            link: '/tournaments',
            metadata: JSON.stringify({ tournamentId: id, action: 'tournament_cancelled' }),
          }).catch(() => {});
        }
      }

      await db.update(tournaments)
        .set({ status: newStatus as TournamentStatus, updatedAt: new Date() })
        .where(eq(tournaments.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: oldStatus,
        newValue: newStatus,
        reason: `Tournament status changed from ${oldStatus} to ${newStatus}`,
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/tournaments/:id/start", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (tournament.status === 'in_progress' || tournament.status === 'completed') {
        return res.status(400).json({ error: "Tournament already started or completed" });
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
      for (let i = 0; i < shuffled.length; i++) {
        await db.update(tournamentParticipants)
          .set({ seed: i + 1 })
          .where(eq(tournamentParticipants.id, shuffled[i].id));
      }

      // Generate first round matches (single elimination)
      const totalSlots = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
      const totalRounds = Math.ceil(Math.log2(totalSlots));
      const firstRoundMatches = totalSlots / 2;

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

      if (matchValues.length > 0) {
        await db.insert(tournamentMatches).values(matchValues);
      }

      // Generate placeholder matches for subsequent rounds
      for (let r = 2; r <= totalRounds; r++) {
        const roundMatches = totalSlots / Math.pow(2, r);
        const placeholders: MatchInsert[] = [];
        for (let m = 0; m < roundMatches; m++) {
          placeholders.push({
            tournamentId: id,
            round: r,
            matchNumber: m + 1,
            player1Id: null,
            player2Id: null,
            status: 'pending',
          });
        }
        if (placeholders.length > 0) {
          await db.insert(tournamentMatches).values(placeholders);
        }
      }

      // Handle byes
      const byeMatches = matchValues.filter((m: MatchInsert) => m.status === 'bye');
      for (const bye of byeMatches) {
        const winnerId = bye.player1Id || bye.player2Id;
        if (winnerId) {
          await db.update(tournamentMatches)
            .set({ winnerId, status: 'completed' })
            .where(and(
              eq(tournamentMatches.tournamentId, id),
              eq(tournamentMatches.round, 1),
              eq(tournamentMatches.matchNumber, bye.matchNumber!),
            ));
          const nextMatchNum = Math.ceil(bye.matchNumber! / 2);
          const isTopSlot = bye.matchNumber! % 2 === 1;
          await db.update(tournamentMatches)
            .set(isTopSlot ? { player1Id: winnerId } : { player2Id: winnerId })
            .where(and(
              eq(tournamentMatches.tournamentId, id),
              eq(tournamentMatches.round, 2),
              eq(tournamentMatches.matchNumber, nextMatchNum),
            ));
        }
      }

      await db.update(tournaments)
        .set({
          status: 'in_progress',
          currentRound: 1,
          totalRounds,
          startsAt: tournament.startsAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        newValue: JSON.stringify({ totalRounds, participants: shuffled.length }),
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
        }).catch(() => {});
      }

      res.json({ success: true, totalRounds, firstRoundMatches: matchValues.length });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
