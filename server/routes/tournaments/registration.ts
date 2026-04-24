import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and, or, sql, count } from "drizzle-orm";
import { tournaments, tournamentParticipants, transactions, users, projectCurrencyWallets, projectCurrencyLedger } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "../helpers";
import {
  isTournamentRegistrationOpen,
  tryAutoStartTournament,
  normalizeTournamentCurrencyType,
  formatTournamentAmountText,
} from "../../lib/tournament-utils";

export function registerTournamentRegistrationRoutes(app: Express): void {

  // Register for tournament
  app.post("/api/tournaments/:id/register", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // SECURITY: Atomic registration with transaction to prevent race conditions
      const registrationResult = await db.transaction(async (tx) => {
        const [lockedTournament] = await tx.select()
          .from(tournaments)
          .where(or(
            eq(tournaments.id, id),
            eq(tournaments.shareSlug, id),
          ))
          .for('update');

        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        const tournamentId = lockedTournament.id;

        if (!isTournamentRegistrationOpen(lockedTournament)) {
          throw new Error("Registration is closed");
        }

        // Check already registered first for deterministic UX.
        const [existing] = await tx.select()
          .from(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
          ));

        if (existing) {
          throw new Error("Already registered");
        }

        const [{ count: currentCount }] = await tx
          .select({ count: count() })
          .from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, tournamentId));

        if (Number(currentCount) >= lockedTournament.maxPlayers) {
          throw new Error("Tournament is full");
        }

        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee || "0");
        const normalizedEntryFee = Number.isFinite(entryFeeValue)
          ? Number(entryFeeValue.toFixed(2))
          : 0;

        const tournamentCurrency = normalizeTournamentCurrencyType(lockedTournament.currency);

        // Deduct entry fee if any (with row lock)
        if (normalizedEntryFee > 0) {
          const entryReferenceId = `tournament-entry:${tournamentId}:${userId}`;

          if (tournamentCurrency === "project") {
            await tx.insert(projectCurrencyWallets).values({ userId }).onConflictDoNothing();

            const [wallet] = await tx.select()
              .from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, userId))
              .for('update');

            if (!wallet) {
              throw new Error("Insufficient balance");
            }

            let earnedBalance = Number.parseFloat(wallet.earnedBalance || "0");
            let purchasedBalance = Number.parseFloat(wallet.purchasedBalance || "0");
            const totalBefore = earnedBalance + purchasedBalance;

            if (!Number.isFinite(totalBefore) || totalBefore < normalizedEntryFee) {
              throw new Error("Insufficient balance");
            }

            let remaining = normalizedEntryFee;
            if (earnedBalance >= remaining) {
              earnedBalance -= remaining;
              remaining = 0;
            } else {
              remaining -= earnedBalance;
              earnedBalance = 0;
              purchasedBalance -= remaining;
            }

            const newTotal = (earnedBalance + purchasedBalance).toFixed(2);

            await tx.update(projectCurrencyWallets)
              .set({
                earnedBalance: earnedBalance.toFixed(2),
                purchasedBalance: purchasedBalance.toFixed(2),
                totalBalance: newTotal,
                totalSpent: sql`(CAST(${projectCurrencyWallets.totalSpent} AS DECIMAL(15,2)) + ${normalizedEntryFee})`,
                updatedAt: new Date(),
              })
              .where(eq(projectCurrencyWallets.id, wallet.id));

            await tx.insert(projectCurrencyLedger).values({
              userId,
              walletId: wallet.id,
              type: "game_stake",
              amount: (-normalizedEntryFee).toFixed(2),
              balanceBefore: totalBefore.toFixed(2),
              balanceAfter: newTotal,
              referenceId: entryReferenceId,
              referenceType: "tournament_entry",
              description: `Tournament entry fee (${lockedTournament.name || "Tournament"})`,
            });
          } else {
            const [user] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).for('update');
            const balanceBeforeValue = Number.parseFloat(user?.balance || "0");
            if (!user || !Number.isFinite(balanceBeforeValue) || balanceBeforeValue < normalizedEntryFee) {
              throw new Error("Insufficient balance");
            }

            const balanceAfterValue = Number((balanceBeforeValue - normalizedEntryFee).toFixed(2));

            await tx.update(users)
              .set({ balance: balanceAfterValue.toFixed(2) })
              .where(eq(users.id, userId));

            await tx.insert(transactions).values({
              userId,
              type: "stake",
              status: "completed",
              amount: normalizedEntryFee.toFixed(2),
              balanceBefore: balanceBeforeValue.toFixed(2),
              balanceAfter: balanceAfterValue.toFixed(2),
              description: `Tournament entry fee (${lockedTournament.name || "Tournament"})`,
              referenceId: entryReferenceId,
              processedAt: new Date(),
            });
          }
        }

        const [newParticipant] = await tx.insert(tournamentParticipants).values({
          tournamentId,
          userId,
          seed: Number(currentCount) + 1,
        }).returning();

        // Update prize pool
        if (normalizedEntryFee > 0) {
          await tx.update(tournaments)
            .set({ prizePool: sql`(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) + ${normalizedEntryFee})` })
            .where(eq(tournaments.id, tournamentId));
        }

        // Normalize status to registration once first participant joins in a valid window.
        if (lockedTournament.status === 'upcoming') {
          await tx.update(tournaments)
            .set({ status: 'registration' })
            .where(eq(tournaments.id, tournamentId));
        }

        return { participant: newParticipant, tournament: lockedTournament };
      });

      const tournamentId = registrationResult.tournament.id;
      let autoStarted = false;
      try {
        const autoStartResult = await tryAutoStartTournament(tournamentId);
        autoStarted = autoStartResult.success;
      } catch {
        autoStarted = false;
      }

      res.json({
        ...registrationResult.participant,
        autoStarted,
      });

      // Send registration confirmation notification (non-blocking)
      const tournament = registrationResult.tournament;
      const tName = tournament.name || 'Tournament';
      const tNameAr = tournament.nameAr || tName;
      const formattedFee = formatTournamentAmountText(tournament.entryFee, tournament.currency);
      const fee = parseFloat(tournament.entryFee) > 0 ? ` (Fee: ${formattedFee})` : '';
      const feeAr = parseFloat(tournament.entryFee) > 0 ? ` (الرسوم: ${formattedFee})` : '';
      const tournamentPath = tournament.shareSlug || tournament.id;
      sendNotification(userId, {
        type: 'announcement',
        priority: 'normal',
        title: 'Tournament Registration Confirmed',
        titleAr: 'تم تأكيد التسجيل في البطولة',
        message: `You have successfully registered for "${tName}".${fee}`,
        messageAr: `تم تسجيلك بنجاح في "${tNameAr}".${feeAr}`,
        link: `/tournaments/${tournamentPath}`,
        metadata: JSON.stringify({ tournamentId: tournament.id, action: 'tournament_registered' }),
      }).catch(() => { });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (
        msg === "Tournament is full"
        || msg === "Already registered"
        || msg === "Insufficient balance"
        || msg === "Registration is closed"
      ) {
        return res.status(400).json({ error: msg });
      }
      if (msg === "Tournament not found") {
        return res.status(404).json({ error: msg });
      }

      res.status(500).json({ error: msg });
    }
  });

  // Unregister from tournament
  app.delete("/api/tournaments/:id/register", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // SECURITY: Atomic unregister + refund in transaction
      await db.transaction(async (tx) => {
        const [lockedTournament] = await tx.select()
          .from(tournaments)
          .where(or(
            eq(tournaments.id, id),
            eq(tournaments.shareSlug, id),
          ))
          .for('update');

        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        const tournamentId = lockedTournament.id;

        if (!isTournamentRegistrationOpen(lockedTournament)) {
          throw new Error("Cannot withdraw after registration closed");
        }

        const result = await tx.delete(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
          ))
          .returning();

        if (result.length === 0) {
          throw new Error("Not registered");
        }

        // Refund entry fee
        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee || "0");
        const normalizedEntryFee = Number.isFinite(entryFeeValue)
          ? Number(entryFeeValue.toFixed(2))
          : 0;

        if (normalizedEntryFee > 0) {
          const refundReferenceId = `tournament-unregister-refund:${tournamentId}:${userId}`;
          const tournamentCurrency = normalizeTournamentCurrencyType(lockedTournament.currency);

          if (tournamentCurrency === "project") {
            await tx.insert(projectCurrencyWallets).values({ userId }).onConflictDoNothing();

            const [wallet] = await tx.select()
              .from(projectCurrencyWallets)
              .where(eq(projectCurrencyWallets.userId, userId))
              .for('update');

            if (!wallet) {
              throw new Error("User not found");
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
              userId,
              walletId: wallet.id,
              type: "refund",
              amount: normalizedEntryFee.toFixed(2),
              balanceBefore: totalBalance.toFixed(2),
              balanceAfter: newTotal,
              referenceId: refundReferenceId,
              referenceType: "tournament_withdraw_refund",
              description: `Tournament withdrawal refund (${lockedTournament.name || "Tournament"})`,
            });
          } else {
            const [user] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).for('update');
            if (!user) {
              throw new Error("User not found");
            }

            const balanceBeforeValue = Number.parseFloat(user.balance || "0");
            const balanceAfterValue = Number((balanceBeforeValue + normalizedEntryFee).toFixed(2));

            await tx.update(users)
              .set({ balance: balanceAfterValue.toFixed(2) })
              .where(eq(users.id, userId));

            await tx.insert(transactions).values({
              userId,
              type: "refund",
              status: "completed",
              amount: normalizedEntryFee.toFixed(2),
              balanceBefore: balanceBeforeValue.toFixed(2),
              balanceAfter: balanceAfterValue.toFixed(2),
              description: `Tournament withdrawal refund (${lockedTournament.name || "Tournament"})`,
              referenceId: refundReferenceId,
              processedAt: new Date(),
            });
          }

          await tx.update(tournaments)
            .set({ prizePool: sql`GREATEST(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) - ${normalizedEntryFee}, 0)` })
            .where(eq(tournaments.id, tournamentId));
        }
      });

      res.json({ success: true });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg === "Not registered" || msg === "Cannot withdraw after registration closed") {
        return res.status(400).json({ error: msg });
      }
      if (msg === "Tournament not found") {
        return res.status(404).json({ error: msg });
      }

      res.status(500).json({ error: msg });
    }
  });
}
