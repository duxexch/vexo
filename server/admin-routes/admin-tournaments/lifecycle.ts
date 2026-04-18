import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants,
  users, type TournamentStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { sendNotification } from "../../websocket";
import {
  isAllowedTournamentStatusTransition,
  startTournamentBracket,
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
      const startResult = await startTournamentBracket(id);
      if (!startResult.success) {
        if (startResult.reason === "Tournament not found") {
          return res.status(404).json({ error: startResult.reason });
        }

        return res.status(400).json({ error: startResult.reason || "Tournament cannot be started" });
      }

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        newValue: JSON.stringify({
          totalRounds: startResult.totalRounds,
          participants: startResult.participantCount,
          currentRound: startResult.currentRound,
        }),
        reason: "Tournament started, bracket generated",
      }, req);

      res.json({
        success: true,
        totalRounds: startResult.totalRounds,
        firstRoundMatches: startResult.firstRoundMatches,
        currentRound: startResult.currentRound,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/tournaments/:id/publish", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { isPublished } = req.body;

      if (typeof isPublished !== "boolean") {
        return res.status(400).json({ error: "isPublished boolean is required" });
      }

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      await db.update(tournaments)
        .set({
          isPublished,
          publishedAt: isPublished ? (tournament.publishedAt || new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, id));

      await logAdminAction(req.admin!.id, "settings_change", "tournament", id, {
        previousValue: JSON.stringify({ isPublished: tournament.isPublished }),
        newValue: JSON.stringify({ isPublished }),
        reason: isPublished ? "Tournament published" : "Tournament unpublished",
      }, req);

      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
