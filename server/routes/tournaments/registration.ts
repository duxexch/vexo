import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and, sql, count } from "drizzle-orm";
import { tournaments, tournamentParticipants, users } from "@shared/schema";
import { authMiddleware, AuthRequest, sensitiveRateLimiter } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "../helpers";

export function registerTournamentRegistrationRoutes(app: Express): void {

  // Register for tournament
  app.post("/api/tournaments/:id/register", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (tournament.status !== 'registration' && tournament.status !== 'upcoming') {
        return res.status(400).json({ error: "Registration is closed" });
      }

      // SECURITY: Atomic registration with transaction to prevent race conditions
      const participant = await db.transaction(async (tx) => {
        // Check max players
        const [{ count: currentCount }] = await tx
          .select({ count: count() })
          .from(tournamentParticipants)
          .where(eq(tournamentParticipants.tournamentId, id));

        if (Number(currentCount) >= tournament.maxPlayers) {
          throw new Error("Tournament is full");
        }

        // Check already registered
        const [existing] = await tx.select()
          .from(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, id),
            eq(tournamentParticipants.userId, userId),
          ));

        if (existing) throw new Error("Already registered");

        // Deduct entry fee if any (with row lock)
        if (parseFloat(tournament.entryFee) > 0) {
          const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
          if (!user || parseFloat(user.balance) < parseFloat(tournament.entryFee)) {
            throw new Error("Insufficient balance");
          }
          await tx.update(users)
            .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) - ${parseFloat(tournament.entryFee)})::text` })
            .where(eq(users.id, userId));
        }

        const [newParticipant] = await tx.insert(tournamentParticipants).values({
          tournamentId: id,
          userId,
          seed: Number(currentCount) + 1,
        }).returning();

        // Update prize pool
        if (parseFloat(tournament.entryFee) > 0) {
          await tx.update(tournaments)
            .set({ prizePool: sql`(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) + ${parseFloat(tournament.entryFee)})::text` })
            .where(eq(tournaments.id, id));
        }

        // Auto-start registration if needed
        if (tournament.status === 'upcoming') {
          await tx.update(tournaments)
            .set({ status: 'registration' })
            .where(eq(tournaments.id, id));
        }

        return newParticipant;
      });

      res.json(participant);

      // Send registration confirmation notification (non-blocking)
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
      }).catch(() => {});
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg === "Tournament is full" || msg === "Already registered" || msg === "Insufficient balance") {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });

  // Unregister from tournament
  app.delete("/api/tournaments/:id/register", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (tournament.status !== 'registration' && tournament.status !== 'upcoming') {
        return res.status(400).json({ error: "Cannot withdraw after tournament started" });
      }

      // SECURITY: Atomic unregister + refund in transaction
      await db.transaction(async (tx) => {
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
        if (parseFloat(tournament.entryFee) > 0) {
          await tx.update(users)
            .set({ balance: sql`(CAST(${users.balance} AS DECIMAL(18,2)) + ${parseFloat(tournament.entryFee)})::text` })
            .where(eq(users.id, userId));
          await tx.update(tournaments)
            .set({ prizePool: sql`(CAST(${tournaments.prizePool} AS DECIMAL(18,2)) - ${parseFloat(tournament.entryFee)})::text` })
            .where(eq(tournaments.id, id));
        }
      });

      res.json({ success: true });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg === "Not registered") {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });
}
