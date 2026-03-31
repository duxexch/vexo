import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import { tournaments, tournamentParticipants, tournamentMatches } from "@shared/schema";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "../helpers";

export function registerTournamentSetupRoutes(app: Express): void {

  // Admin: Create tournament
  app.post("/api/admin/tournaments", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Enforce admin role check via middleware pattern
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: "Admin only" });
      }

      const { name, nameAr, description, descriptionAr, gameType, format, maxPlayers, minPlayers, entryFee, startsAt, registrationStartsAt, registrationEndsAt } = req.body;

      // Calculate total rounds for single elimination
      const rounds = Math.ceil(Math.log2(maxPlayers || 16));

      const [tournament] = await db.insert(tournaments).values({
        name,
        nameAr,
        description,
        descriptionAr,
        gameType,
        format: format || 'single_elimination',
        maxPlayers: maxPlayers || 16,
        minPlayers: minPlayers || 4,
        entryFee: entryFee || '0.00',
        prizePool: '0.00',
        totalRounds: rounds,
        status: 'upcoming',
        startsAt: startsAt ? new Date(startsAt) : null,
        registrationStartsAt: registrationStartsAt ? new Date(registrationStartsAt) : null,
        registrationEndsAt: registrationEndsAt ? new Date(registrationEndsAt) : null,
        createdBy: req.user!.id,
      }).returning();

      res.json(tournament);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Start tournament (generate bracket)
  app.post("/api/admin/tournaments/:id/start", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: "Admin only" });
      }

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

      // Update seeds
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

      // Handle byes — auto-advance players with no opponent
      const byeMatches = matchValues.filter((m: MatchInsert) => m.status === 'bye');
      for (const bye of byeMatches) {
        const winnerId = bye.player1Id || bye.player2Id;
        if (winnerId) {
          await db.update(tournamentMatches)
            .set({ winnerId, status: 'completed' })
            .where(and(
              eq(tournamentMatches.tournamentId, id),
              eq(tournamentMatches.round, 1),
              eq(tournamentMatches.matchNumber, bye.matchNumber),
            ));
          // Advance winner to next round
          const nextMatchNum = Math.ceil(bye.matchNumber / 2);
          const isTopSlot = bye.matchNumber % 2 === 1;
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
          startsAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, id));

      res.json({ success: true, totalRounds, firstRoundMatches: matchValues.length });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
