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
 *
 * Returns an array per tournament so a tournament that was first cancelled
 * (cancel-refund) and later deleted (delete-refund) shows both refunds in
 * the banner — not just the most recent one.
 */
async function loadUserRefundsByTournament(
  userId: string,
  tournamentIds: string[],
): Promise<Map<string, UserRefundSummary[]>> {
  const map = new Map<string, UserRefundSummary[]>();
  if (tournamentIds.length === 0) {
    return map;
  }

  const usdRefundIds = tournamentIds.flatMap((id) => [
    `tournament-cancel-refund:${id}:${userId}`,
    `tournament-delete-refund:${id}:${userId}`,
  ]);

  // Order by createdAt DESC in SQL so when duplicates of the SAME reason
  // exist (e.g. a retry insert) the most recent within that reason wins.
  // The shared picker then dedups by (tournamentId, reason) but keeps both
  // a cancel-refund and a delete-refund when both are present.
  const [usdRows, projectRows] = await Promise.all([
    db
      .select({
        amount: transactions.amount,
        referenceId: transactions.referenceId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "refund"),
          inArray(transactions.referenceId, usdRefundIds),
        ),
      )
      .orderBy(desc(transactions.createdAt)),
    db
      .select({
        amount: projectCurrencyLedger.amount,
        referenceId: projectCurrencyLedger.referenceId,
        referenceType: projectCurrencyLedger.referenceType,
        createdAt: projectCurrencyLedger.createdAt,
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
      )
      .orderBy(desc(projectCurrencyLedger.createdAt)),
  ]);

  // Merge USD + project rows. The picker dedups within each (tournament,
  // reason) pair (latest createdAt wins), then returns a chronological
  // list per tournament. Sharing one implementation between the
  // production path and the unit test prevents logic drift.
  return pickRefundsPerTournament([
    ...usdRows.map((r) => ({ ...r, currency: "usd" as const })),
    ...projectRows.map((r) => ({ ...r, currency: "project" as const })),
  ]);
}

interface RefundRow {
  referenceId: string | null;
  amount: string;
  currency: TournamentCurrencyType;
  createdAt: Date;
}

/**
 * Group refund rows by tournament id, keeping at most one row per
 * (tournamentId, reason) — the one with the most recent createdAt wins
 * for that reason. The result per tournament is sorted by createdAt ASC
 * so callers render them in the order they happened ("cancelled first,
 * then deleted"). Pure / no I/O so it can be unit-tested directly.
 */
function pickRefundsPerTournament(rows: RefundRow[]): Map<string, UserRefundSummary[]> {
  // First pass: dedup by (tournamentId, reason) keeping the latest row.
  const latestByKey = new Map<string, { row: RefundRow; tournamentId: string; reason: UserRefundSummary["reason"] }>();
  for (const row of rows) {
    if (!row.referenceId) continue;
    const match = REFUND_REFERENCE_REGEX.exec(row.referenceId);
    if (!match) continue;
    const tournamentId = match[2];
    const reason: UserRefundSummary["reason"] = match[1] === "delete" ? "deleted" : "cancelled";
    const key = `${tournamentId}::${reason}`;
    const existing = latestByKey.get(key);
    if (!existing || row.createdAt.getTime() > existing.row.createdAt.getTime()) {
      latestByKey.set(key, { row, tournamentId, reason });
    }
  }

  // Second pass: bucket by tournamentId, sort each bucket chronologically,
  // and project to the public UserRefundSummary shape (no createdAt leaks
  // into the API response).
  type WithSortKey = UserRefundSummary & { __sortAt: number };
  const buckets = new Map<string, WithSortKey[]>();
  for (const { row, tournamentId, reason } of latestByKey.values()) {
    const bucket = buckets.get(tournamentId) ?? [];
    bucket.push({
      amount: row.amount,
      currency: row.currency,
      reason,
      __sortAt: row.createdAt.getTime(),
    });
    buckets.set(tournamentId, bucket);
  }
  const result = new Map<string, UserRefundSummary[]>();
  // Tie-breaker for equal timestamps: cancelled comes before deleted so the
  // narrative order ("cancelled first, then deleted") stays stable even when
  // both refund rows happen to share an exact createdAt.
  const reasonRank: Record<UserRefundSummary["reason"], number> = { cancelled: 0, deleted: 1 };
  for (const [tournamentId, bucket] of buckets.entries()) {
    bucket.sort((a, b) => {
      if (a.__sortAt !== b.__sortAt) return a.__sortAt - b.__sortAt;
      return reasonRank[a.reason] - reasonRank[b.reason];
    });
    result.set(
      tournamentId,
      bucket.map(({ amount, currency, reason }) => ({ amount, currency, reason })),
    );
  }
  return result;
}

/** Test-only re-export of the dedup picker. */
export const __pickRefundsPerTournamentForTest = pickRefundsPerTournament;

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
          const refunds = refundsByTournament.get(row.id) ?? [];
          return {
            ...row,
            userRefunds: refunds.map((refund) => ({
              amount: refund.amount,
              currency: normalizeTournamentCurrencyType(refund.currency),
              reason: refund.reason,
            })),
          };
        });
        res.json(enriched);
        return;
      }

      res.json(result.map((row) => ({ ...row, userRefunds: [] })));
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

      let userRefunds: { amount: string; currency: TournamentCurrencyType; reason: "cancelled" | "deleted" }[] = [];
      if (viewerId) {
        const refundsByTournament = await loadUserRefundsByTournament(viewerId, [tournamentId]);
        const refunds = refundsByTournament.get(tournamentId) ?? [];
        userRefunds = refunds.map((refund) => ({
          amount: refund.amount,
          currency: normalizeTournamentCurrencyType(refund.currency),
          reason: refund.reason,
        }));
      }

      res.json({
        ...tournament,
        participants,
        matches,
        isRegistered,
        participantCount: participants.length,
        userRefunds,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
