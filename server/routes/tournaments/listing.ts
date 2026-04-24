import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { tournaments, tournamentParticipants, tournamentMatches, users, type TournamentStatus } from "@shared/schema";
import { optionalAuthMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "../helpers";
import { normalizeTournamentGameType } from "../../lib/tournament-utils";

export function registerTournamentListingRoutes(app: Express): void {

  // List all tournaments (with filters)
  app.get("/api/tournaments", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status, gameType } = req.query;

      const isRegisteredExpression = req.user?.id
        ? sql<boolean>`EXISTS(SELECT 1 FROM tournament_participants tp WHERE tp.tournament_id = "tournaments"."id" AND tp.user_id = ${req.user.id})`
        : sql<boolean>`false`;

      let query = db.select({
        id: tournaments.id,
        name: tournaments.name,
        nameAr: tournaments.nameAr,
        description: tournaments.description,
        descriptionAr: tournaments.descriptionAr,
        isPublished: tournaments.isPublished,
        publishedAt: tournaments.publishedAt,
        shareSlug: tournaments.shareSlug,
        coverImageUrl: tournaments.coverImageUrl,
        promoVideoUrl: tournaments.promoVideoUrl,
        gameType: tournaments.gameType,
        format: tournaments.format,
        status: tournaments.status,
        maxPlayers: tournaments.maxPlayers,
        minPlayers: tournaments.minPlayers,
        autoStartOnFull: tournaments.autoStartOnFull,
        autoStartPlayerCount: tournaments.autoStartPlayerCount,
        entryFee: tournaments.entryFee,
        prizePool: tournaments.prizePool,
        currency: tournaments.currency,
        prizeDistributionMethod: tournaments.prizeDistributionMethod,
        prizeDistribution: tournaments.prizeDistribution,
        currentRound: tournaments.currentRound,
        totalRounds: tournaments.totalRounds,
        registrationStartsAt: tournaments.registrationStartsAt,
        registrationEndsAt: tournaments.registrationEndsAt,
        startsAt: tournaments.startsAt,
        endsAt: tournaments.endsAt,
        winnerId: tournaments.winnerId,
        createdAt: tournaments.createdAt,
        participantCount: sql<number>`(SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = "tournaments"."id")`.as('participant_count'),
        isRegistered: isRegisteredExpression.as('is_registered'),
      }).from(tournaments)
        .orderBy(desc(tournaments.createdAt))
        .$dynamic();

      const conditions = [eq(tournaments.isPublished, true)];
      if (status && typeof status === 'string') {
        conditions.push(eq(tournaments.status, status as TournamentStatus));
      }
      if (gameType && typeof gameType === 'string') {
        conditions.push(eq(tournaments.gameType, normalizeTournamentGameType(gameType)));
      }
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const result = await query.limit(50);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get single tournament with bracket
  app.get("/api/tournaments/:id", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [tournament] = await db.select()
        .from(tournaments)
        .where(or(
          eq(tournaments.id, id),
          eq(tournaments.shareSlug, id),
        ));
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!tournament.isPublished) return res.status(404).json({ error: "Tournament not found" });
      const tournamentId = tournament.id;

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
        profilePicture: users.profilePicture,
      })
        .from(tournamentParticipants)
        .leftJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(eq(tournamentParticipants.tournamentId, tournamentId))
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
        .where(eq(tournamentMatches.tournamentId, tournamentId))
        .orderBy(tournamentMatches.round, tournamentMatches.matchNumber);

      // Check if user is registered
      const viewerId = req.user?.id;
      const isRegistered = Boolean(viewerId) && participants.some((p) => p.userId === viewerId);

      res.json({
        ...tournament,
        participants,
        matches,
        isRegistered,
        participantCount: participants.length,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
