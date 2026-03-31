import type { Express, Response } from "express";
import { tournaments, tournamentParticipants, tournamentMatches, users } from "@shared/schema";
import type { TournamentStatus } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerTournamentCrudRoutes(app: Express) {

  app.get("/api/admin/tournaments", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status, gameType } = req.query;
      let query = db.select({
        id: tournaments.id,
        name: tournaments.name,
        nameAr: tournaments.nameAr,
        description: tournaments.description,
        descriptionAr: tournaments.descriptionAr,
        gameType: tournaments.gameType,
        format: tournaments.format,
        status: tournaments.status,
        maxPlayers: tournaments.maxPlayers,
        minPlayers: tournaments.minPlayers,
        entryFee: tournaments.entryFee,
        prizePool: tournaments.prizePool,
        prizeDistribution: tournaments.prizeDistribution,
        currentRound: tournaments.currentRound,
        totalRounds: tournaments.totalRounds,
        registrationStartsAt: tournaments.registrationStartsAt,
        registrationEndsAt: tournaments.registrationEndsAt,
        startsAt: tournaments.startsAt,
        endsAt: tournaments.endsAt,
        winnerId: tournaments.winnerId,
        createdAt: tournaments.createdAt,
        participantCount: sql<number>`(SELECT COUNT(*) FROM tournament_participants WHERE tournament_id = ${tournaments.id})`.as('participant_count'),
      }).from(tournaments)
        .orderBy(desc(tournaments.createdAt))
        .$dynamic();

      const conditions = [];
      if (status && typeof status === 'string' && status !== 'all') {
        conditions.push(eq(tournaments.status, status as TournamentStatus));
      }
      if (gameType && typeof gameType === 'string') {
        conditions.push(eq(tournaments.gameType, gameType));
      }
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const result = await query.limit(100);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/tournaments/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const participants = await db.select({
        id: tournamentParticipants.id,
        userId: tournamentParticipants.userId,
        seed: tournamentParticipants.seed,
        isEliminated: tournamentParticipants.isEliminated,
        wins: tournamentParticipants.wins,
        losses: tournamentParticipants.losses,
        placement: tournamentParticipants.placement,
        prizeWon: tournamentParticipants.prizeWon,
        username: users.username,
        nickname: users.nickname,
      })
        .from(tournamentParticipants)
        .leftJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(eq(tournamentParticipants.tournamentId, id))
        .orderBy(tournamentParticipants.seed);

      const matches = await db.select({
        id: tournamentMatches.id,
        round: tournamentMatches.round,
        matchNumber: tournamentMatches.matchNumber,
        player1Id: tournamentMatches.player1Id,
        player2Id: tournamentMatches.player2Id,
        winnerId: tournamentMatches.winnerId,
        player1Score: tournamentMatches.player1Score,
        player2Score: tournamentMatches.player2Score,
        status: tournamentMatches.status,
        scheduledAt: tournamentMatches.scheduledAt,
        completedAt: tournamentMatches.completedAt,
        challengeId: tournamentMatches.challengeId,
      })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id))
        .orderBy(tournamentMatches.round, tournamentMatches.matchNumber);

      res.json({
        ...tournament,
        participants,
        matches,
        participantCount: participants.length,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/tournaments", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { name, nameAr, description, descriptionAr, gameType, format,
              maxPlayers, minPlayers, entryFee, prizePool,
              startsAt, endsAt, registrationStartsAt, registrationEndsAt } = req.body;

      if (!name || !nameAr || !gameType) {
        return res.status(400).json({ error: "Name, Arabic name, and game type are required" });
      }

      const rounds = Math.ceil(Math.log2(maxPlayers || 16));

      const [tournament] = await db.insert(tournaments).values({
        name,
        nameAr,
        description: description || null,
        descriptionAr: descriptionAr || null,
        gameType,
        format: format || 'single_elimination',
        maxPlayers: maxPlayers || 16,
        minPlayers: minPlayers || 4,
        entryFee: entryFee || '0.00',
        prizePool: prizePool || '0.00',
        totalRounds: rounds,
        status: 'upcoming',
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        registrationStartsAt: registrationStartsAt ? new Date(registrationStartsAt) : null,
        registrationEndsAt: registrationEndsAt ? new Date(registrationEndsAt) : null,
        createdBy: req.admin!.id,
      }).returning();

      await logAdminAction(req.admin!.id, "settings_change", "tournament", tournament.id, {
        newValue: JSON.stringify({ name, gameType, format, maxPlayers, entryFee, prizePool }),
        reason: "Tournament created",
      }, req);

      res.json(tournament);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
