import type { Express, Response } from "express";
import { tournaments, tournamentParticipants, tournamentMatches, users } from "@shared/schema";
import type { TournamentStatus } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import {
  normalizeTournamentGameType,
  normalizeTournamentPayload,
} from "../../lib/tournament-utils";

function isTournamentValidationError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("required") ||
    lowered.includes("invalid") ||
    lowered.includes("unsupported") ||
    lowered.includes("must") ||
    lowered.includes("cannot")
  );
}

async function ensureUniqueTournamentShareSlug(baseSlug: string): Promise<string> {
  const normalizedBase = String(baseSlug || "tournament").trim().toLowerCase() || "tournament";
  let candidate = normalizedBase;

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const [existing] = await db.select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.shareSlug, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${normalizedBase}-${attempt + 1}`;
  }

  return `${normalizedBase}-${Date.now().toString(36)}`;
}

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
        participantCount: sql<number>`(SELECT COUNT(*) FROM tournament_participants WHERE tournament_id = ${tournaments.id})`.as('participant_count'),
      }).from(tournaments)
        .orderBy(desc(tournaments.createdAt))
        .$dynamic();

      const conditions = [];
      if (status && typeof status === 'string' && status !== 'all') {
        conditions.push(eq(tournaments.status, status as TournamentStatus));
      }
      if (gameType && typeof gameType === 'string') {
        conditions.push(eq(tournaments.gameType, normalizeTournamentGameType(gameType)));
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
      const normalizedPayload = normalizeTournamentPayload(req.body as Record<string, unknown>);
      const uniqueShareSlug = await ensureUniqueTournamentShareSlug(normalizedPayload.shareSlug);
      const publishedAt = normalizedPayload.isPublished ? new Date() : null;

      const [tournament] = await db.insert(tournaments).values({
        name: normalizedPayload.name,
        nameAr: normalizedPayload.nameAr,
        description: normalizedPayload.description,
        descriptionAr: normalizedPayload.descriptionAr,
        isPublished: normalizedPayload.isPublished,
        publishedAt,
        shareSlug: uniqueShareSlug,
        coverImageUrl: normalizedPayload.coverImageUrl,
        promoVideoUrl: normalizedPayload.promoVideoUrl,
        gameType: normalizedPayload.gameType,
        format: normalizedPayload.format as "single_elimination" | "double_elimination" | "round_robin" | "swiss",
        maxPlayers: normalizedPayload.maxPlayers,
        minPlayers: normalizedPayload.minPlayers,
        autoStartOnFull: normalizedPayload.autoStartOnFull,
        autoStartPlayerCount: normalizedPayload.autoStartPlayerCount,
        entryFee: normalizedPayload.entryFee,
        prizePool: normalizedPayload.prizePool,
        prizeDistributionMethod: normalizedPayload.prizeDistributionMethod,
        prizeDistribution: normalizedPayload.prizeDistribution,
        totalRounds: normalizedPayload.totalRounds,
        status: 'upcoming',
        startsAt: normalizedPayload.startsAt,
        endsAt: normalizedPayload.endsAt,
        registrationStartsAt: normalizedPayload.registrationStartsAt,
        registrationEndsAt: normalizedPayload.registrationEndsAt,
        createdBy: req.admin!.id,
      }).returning();

      await logAdminAction(req.admin!.id, "settings_change", "tournament", tournament.id, {
        newValue: JSON.stringify({
          name: normalizedPayload.name,
          gameType: normalizedPayload.gameType,
          format: normalizedPayload.format,
          isPublished: normalizedPayload.isPublished,
          shareSlug: uniqueShareSlug,
          autoStartOnFull: normalizedPayload.autoStartOnFull,
          autoStartPlayerCount: normalizedPayload.autoStartPlayerCount,
          prizeDistributionMethod: normalizedPayload.prizeDistributionMethod,
          maxPlayers: normalizedPayload.maxPlayers,
          entryFee: normalizedPayload.entryFee,
          prizePool: normalizedPayload.prizePool,
        }),
        reason: "Tournament created",
      }, req);

      res.json(tournament);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (isTournamentValidationError(message)) {
        return res.status(400).json({ error: message });
      }

      res.status(500).json({ error: message });
    }
  });
}
