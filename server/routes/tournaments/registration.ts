import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and, sql, count } from "drizzle-orm";
import { tournaments, tournamentParticipants, users } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "../helpers";
import { isTournamentRegistrationOpen } from "../../lib/tournament-utils";

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
          .where(eq(tournaments.id, id))
          .for('update');

        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        if (!isTournamentRegistrationOpen(lockedTournament)) {
          throw new Error("Registration is closed");
        }

        // Check already registered first for deterministic UX.
        const [existing] = await tx.select()
          .from(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, id),
            eq(tournamentParticipants.userId, userId),
          ));

        if (existing) {
          throw new Error("Already registered");
        }

        const [{ count: currentCount }] = await tx
          .select({ count: count() })
          .from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));

        if (Number(currentCount) >= lockedTournament.maxPlayers) {
          throw new Error("Tournament is full");
        }

        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee);

        // Deduct entry fee if any (with row lock)
        if (entryFeeValue > 0) {
          const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
          if (!user || Number.parseFloat(user.balance) < entryFeeValue) {
            throw new Error("Insufficient balance");
          }

          await tx.update(users)
            .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) - ${entryFeeValue})::text` })
            .where(eq(users.id, userId));
        }

        const [newParticipant] = await tx.insert(tournamentParticipants).values({
          tournamentId: id,
          userId,
          seed: Number(currentCount) + 1,
        }).returning();

        // Update prize pool
        if (entryFeeValue > 0) {
          await tx.update(tournaments)
            .set({ prizePool: sql`(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) + ${entryFeeValue})::text` })
            .where(eq(tournaments.id, id));
        }

        // Normalize status to registration once first participant joins in a valid window.
        if (lockedTournament.status === 'upcoming') {
          await tx.update(tournaments)
            .set({ status: 'registration' })
            .where(eq(tournaments.id, id));
        }

        return { participant: newParticipant, tournament: lockedTournament };
      });

      res.json(registrationResult.participant);

      // Send registration confirmation notification (non-blocking)
      const tournament = registrationResult.tournament;
      const tName = tournament.name || 'Tournament';
      const tNameAr = tournament.nameAr || tName;
      const fee = parseFloat(tournament.entryFee) > 0 ? ` (Fee: $${tournament.entryFee})` : '';
      const feeAr = parseFloat(tournament.entryFee) > 0 ? ` (الرسوم: $${tournament.entryFee})` : '';
      sendNotification(userId, {
        type: 'announcement',
        priority: 'normal',
        title: 'Tournament Registration Confirmed',
        titleAr: 'تم تأكيد التسجيل في البطولة',
        message: `You have successfully registered for "${tName}".${fee}`,
        messageAr: `تم تسجيلك بنجاح في "${tNameAr}".${feeAr}`,
        link: `/tournaments/${id}`,
        metadata: JSON.stringify({ tournamentId: id, action: 'tournament_registered' }),
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
          .where(eq(tournaments.id, id))
          .for('update');

        if (!lockedTournament) {
          throw new Error("Tournament not found");
        }

        if (!isTournamentRegistrationOpen(lockedTournament)) {
          throw new Error("Cannot withdraw after registration closed");
        }

        const result = await tx.delete(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, id),
            eq(tournamentParticipants.userId, userId),
          ))
          .returning();

        if (result.length === 0) {
          throw new Error("Not registered");
        }

        // Refund entry fee
        const entryFeeValue = Number.parseFloat(lockedTournament.entryFee);
        if (entryFeeValue > 0) {
          await tx.update(users)
            .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${entryFeeValue})::text` })
            .where(eq(users.id, userId));

          await tx.update(tournaments)
            .set({ prizePool: sql`GREATEST(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) - ${entryFeeValue}, 0)::text` })
            .where(eq(tournaments.id, id));
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
