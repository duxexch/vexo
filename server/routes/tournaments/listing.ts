import type { Express, Response } from "express";
import { db } from "../../db";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { tournaments, tournamentParticipants, tournamentMatches, users, transactions, projectCurrencyLedger, type TournamentStatus } from "@shared/schema";
import { optionalAuthMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "../helpers";
import { normalizeTournamentGameType } from "../../lib/tournament-utils";
import { normalizeTournamentCurrencyType, type TournamentCurrencyType } from "@shared/tournament-currency";

interface UserRefundSummary {
  amount: string;
  currency: TournamentCurrencyType;
  reason: "cancelled" | "deleted";
}

const REFUND_REFERENCE_REGEX = /^tournament-(cancel|delete)-refund:([^:]+):/;

/**
 * Look up the current user's tournament-cancel/delete refund rows across the
 * USD `transactions` table and the project-currency `project_currency_ledger`,
 * keyed by tournament id. Used to surface "Refunded $X" / "Refunded VXC X"
 * indicators on the tournament list and detail pages so players don't have to
 * cross-reference their wallet history. Restricted to the supplied
 * `tournamentIds` to keep the query bounded by what the page actually shows.
 */
async function loadUserRefundsByTournament(
  userId: string,
  tournamentIds: string[],
): Promise<Map<string, UserRefundSummary>> {
  const map = new Map<string, UserRefundSummary>();
  if (tournamentIds.length === 0) {
    return map;
  }

  const usdRefundIds = tournamentIds.flatMap((id) => [
    `tournament-cancel-refund:${id}:${userId}`,
    `tournament-delete-refund:${id}:${userId}`,
  ]);

  const [usdRows, projectRows] = await Promise.all([
    db
      .select({
        amount: transactions.amount,
        referenceId: transactions.referenceId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "refund"),
          inArray(transactions.referenceId, usdRefundIds),
        ),
      ),
    db
      .select({
        amount: projectCurrencyLedger.amount,
        referenceId: projectCurrencyLedger.referenceId,
        referenceType: projectCurrencyLedger.referenceType,
      })
      .from(projectCurrencyLedger)
      .where(
        and(
          eq(projectCurrencyLedger.userId, userId),
          inArray(projectCurrencyLedger.referenceType, [
            "tournament_cancel_refund",
            "tournament_delete_refund",
          ]),
          inArray(projectCurrencyLedger.referenceId, usdRefundIds),
        ),
      ),
  ]);

  const ingest = (
    referenceId: string | null,
    amount: string,
    currency: TournamentCurrencyType,
  ) => {
    if (!referenceId) return;
    const match = REFUND_REFERENCE_REGEX.exec(referenceId);
    if (!match) return;
    const reason: UserRefundSummary["reason"] = match[1] === "delete" ? "deleted" : "cancelled";
    const tournamentId = match[2];
    // Keep the latest refund only; cancel + delete shouldn't both fire for one
    // tournament+user pair, but if a duplicate ever appears, prefer the
    // last-inserted row (delete supersedes cancel by lifecycle order).
    const existing = map.get(tournamentId);
    if (existing && existing.reason === "deleted" && reason === "cancelled") {
      return;
    }
    map.set(tournamentId, { amount, currency, reason });
  };

  for (const row of usdRows) {
    ingest(row.referenceId, row.amount, "usd");
  }
  for (const row of projectRows) {
    ingest(row.referenceId, row.amount, "project");
  }

  return map;
}

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

      const viewerId = req.user?.id;
      if (viewerId) {
        const refundsByTournament = await loadUserRefundsByTournament(
          viewerId,
          result.map((row) => row.id),
        );
        const enriched = result.map((row) => {
          const refund = refundsByTournament.get(row.id);
          return refund
            ? {
                ...row,
                userRefund: {
                  amount: refund.amount,
                  currency: normalizeTournamentCurrencyType(refund.currency),
                  reason: refund.reason,
                },
              }
            : { ...row, userRefund: null };
        });
        res.json(enriched);
        return;
      }

      res.json(result.map((row) => ({ ...row, userRefund: null })));
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

      let userRefund: { amount: string; currency: TournamentCurrencyType; reason: "cancelled" | "deleted" } | null = null;
      if (viewerId) {
        const refundsByTournament = await loadUserRefundsByTournament(viewerId, [tournamentId]);
        const refund = refundsByTournament.get(tournamentId);
        if (refund) {
          userRefund = {
            amount: refund.amount,
            currency: normalizeTournamentCurrencyType(refund.currency),
            reason: refund.reason,
          };
        }
      }

      res.json({
        ...tournament,
        participants,
        matches,
        isRegistered,
        participantCount: participants.length,
        userRefund,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
