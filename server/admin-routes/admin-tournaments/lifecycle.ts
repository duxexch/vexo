import type { Express, Response } from "express";
import {
  tournaments, tournamentParticipants,
  transactions,
  users, type TournamentStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
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

      const nextStatus = newStatus as TournamentStatus;
      const statusUpdateResult = await db.transaction(async (tx) => {
        const [lockedTournament] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for('update');
        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        const oldStatus = lockedTournament.status;
        if (!isAllowedTournamentStatusTransition(oldStatus, nextStatus)) {
          throw new Error(`Invalid tournament status transition from ${oldStatus} to ${nextStatus}`);
        }

        const participants = await tx.select({ userId: tournamentParticipants.userId })
          .from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));

        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee || "0");
        const normalizedEntryFee = Number.isFinite(entryFeeValue)
          ? Number(entryFeeValue.toFixed(2))
          : 0;

        const shouldRefundOnCancel = nextStatus === 'cancelled'
          && normalizedEntryFee > 0
          && (oldStatus === 'upcoming' || oldStatus === 'registration');

        const refundedUserIds: string[] = [];

        if (shouldRefundOnCancel) {
          for (const participant of participants) {
            const [user] = await tx.select({ balance: users.balance })
              .from(users)
              .where(eq(users.id, participant.userId))
              .for('update');

            if (!user) {
              continue;
            }

            const balanceBeforeValue = Number.parseFloat(user.balance || "0");
            const balanceAfterValue = Number((balanceBeforeValue + normalizedEntryFee).toFixed(2));
            const refundReferenceId = `tournament-cancel-refund:${id}:${participant.userId}`;

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
              description: `Tournament cancelled refund (${lockedTournament.name || "Tournament"})`,
              referenceId: refundReferenceId,
              processedAt: new Date(),
            });

            refundedUserIds.push(participant.userId);
          }

          const totalRefundAmount = Number((normalizedEntryFee * refundedUserIds.length).toFixed(2));
          if (totalRefundAmount > 0) {
            await tx.update(tournaments)
              .set({
                prizePool: sql`GREATEST(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) - ${totalRefundAmount}, 0)::text`,
                updatedAt: new Date(),
              })
              .where(eq(tournaments.id, id));
          }
        }

        await tx.update(tournaments)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(tournaments.id, id));

        return {
          oldStatus,
          shouldRefundOnCancel,
          participantUserIds: participants.map((participant) => participant.userId),
          refundedUserIds,
          tournamentName: lockedTournament.name,
          tournamentNameAr: lockedTournament.nameAr,
          entryFee: lockedTournament.entryFee,
        };
      });

      if (nextStatus === 'cancelled') {
        const tName = statusUpdateResult.tournamentName || 'Tournament';
        const tNameAr = statusUpdateResult.tournamentNameAr || tName;
        const refundedUserIdSet = new Set(statusUpdateResult.refundedUserIds);

        for (const participantUserId of statusUpdateResult.participantUserIds) {
          if (statusUpdateResult.shouldRefundOnCancel && refundedUserIdSet.has(participantUserId)) {
            sendNotification(participantUserId, {
              type: 'transaction',
              priority: 'high',
              title: 'Tournament Cancelled — Refunded',
              titleAr: 'تم إلغاء البطولة — تم الاسترداد',
              message: `"${tName}" has been cancelled. Your entry fee of $${statusUpdateResult.entryFee} has been refunded.`,
              messageAr: `تم إلغاء "${tNameAr}". تم استرداد رسوم الدخول $${statusUpdateResult.entryFee}.`,
              link: '/tournaments',
              metadata: JSON.stringify({ tournamentId: id, action: 'tournament_cancelled_refund', refund: statusUpdateResult.entryFee }),
            }).catch(() => { });
          } else {
            sendNotification(participantUserId, {
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
        previousValue: statusUpdateResult.oldStatus,
        newValue: nextStatus,
        reason: `Tournament status changed from ${statusUpdateResult.oldStatus} to ${nextStatus}`,
        metadata: JSON.stringify({
          refunded: statusUpdateResult.shouldRefundOnCancel,
          refundedCount: statusUpdateResult.refundedUserIds.length,
        }),
      }, req);

      res.json({
        success: true,
        refunded: statusUpdateResult.shouldRefundOnCancel,
        refundedCount: statusUpdateResult.refundedUserIds.length,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message === "Tournament not found") {
        return res.status(404).json({ error: message });
      }

      if (message.startsWith("Invalid tournament status transition")) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
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
