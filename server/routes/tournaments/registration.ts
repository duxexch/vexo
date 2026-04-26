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
import { adjustUserCurrencyBalance, getEffectiveAllowedCurrencies } from "../../lib/wallet-balances";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

type InsufficientBalanceWalletKind = "cash" | "project";
type InsufficientBalanceCurrency = "usd" | "project";

class InsufficientBalanceError extends Error {
  readonly walletKind: InsufficientBalanceWalletKind;
  readonly currency: InsufficientBalanceCurrency;
  readonly required: number;
  readonly available: number;

  constructor(args: {
    walletKind: InsufficientBalanceWalletKind;
    currency: InsufficientBalanceCurrency;
    required: number;
    available: number;
  }) {
    super(
      args.walletKind === "project"
        ? "Insufficient project balance"
        : "Insufficient cash balance",
    );
    this.name = "InsufficientBalanceError";
    this.walletKind = args.walletKind;
    this.currency = args.currency;
    this.required = Number.isFinite(args.required) ? args.required : 0;
    this.available = Number.isFinite(args.available) ? args.available : 0;
  }
}

export function registerTournamentRegistrationRoutes(app: Express): void {

  // Register for tournament
  app.post("/api/tournaments/:id/register", sensitiveRateLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // Optional: client may pick which sub-wallet to debit (cash/USD path only).
      // When omitted, server auto-picks the user's primary balance currency.
      // Malformed strings (non-currency values, unknown codes) are rejected
      // with a 400 instead of silently falling back to primary.
      const rawWalletCurrency = req.body?.walletCurrency;
      let requestedWalletCurrency: string | null = null;
      if (rawWalletCurrency !== undefined && rawWalletCurrency !== null) {
        if (typeof rawWalletCurrency !== "string") {
          return res.status(400).json({
            error: "walletCurrency must be a string ISO currency code",
            code: "INVALID_WALLET_CURRENCY",
          });
        }
        const normalized = normalizeCurrencyCode(rawWalletCurrency);
        if (!normalized) {
          return res.status(400).json({
            error: `Unknown wallet currency: ${rawWalletCurrency}`,
            code: "INVALID_WALLET_CURRENCY",
          });
        }
        requestedWalletCurrency = normalized;
      }

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

        // Wallet currency stored on the participant row when paid from a sub-wallet.
        // Defaults to NULL for the legacy primary-balance path so existing rows
        // (and single-currency users) are unaffected.
        let participantWalletCurrency: string | null = null;

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
              throw new InsufficientBalanceError({
                walletKind: "project",
                currency: "project",
                required: normalizedEntryFee,
                available: 0,
              });
            }

            let earnedBalance = Number.parseFloat(wallet.earnedBalance || "0");
            let purchasedBalance = Number.parseFloat(wallet.purchasedBalance || "0");
            const totalBefore = earnedBalance + purchasedBalance;

            if (!Number.isFinite(totalBefore) || totalBefore < normalizedEntryFee) {
              throw new InsufficientBalanceError({
                walletKind: "project",
                currency: "project",
                required: normalizedEntryFee,
                available: Number.isFinite(totalBefore) ? totalBefore : 0,
              });
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
            // Cash path: lock the user row, then route the debit through
            // adjustUserCurrencyBalance so multi-currency users may pay from
            // any of their allowed wallets (primary or sub).
            const [userRow] = await tx.select({
              balance: users.balance,
              balanceCurrency: users.balanceCurrency,
              multiCurrencyEnabled: users.multiCurrencyEnabled,
              allowedCurrencies: users.allowedCurrencies,
            }).from(users).where(eq(users.id, userId)).for('update');
            if (!userRow) {
              throw new InsufficientBalanceError({
                walletKind: "cash",
                currency: "usd",
                required: normalizedEntryFee,
                available: 0,
              });
            }

            const primaryCurrency = normalizeCurrencyCode(userRow.balanceCurrency) || "USD";
            const allowedForUser = getEffectiveAllowedCurrencies(userRow);

            // Pick wallet: explicit request from client (if allowed) else primary.
            let chosenCurrency = primaryCurrency;
            if (requestedWalletCurrency && requestedWalletCurrency !== primaryCurrency) {
              if (!allowedForUser.includes(requestedWalletCurrency)) {
                throw new Error(`WALLET_NOT_ALLOWED:${requestedWalletCurrency}`);
              }
              chosenCurrency = requestedWalletCurrency;
            }

            // Read balance-before for both the transactions row and the
            // InsufficientBalanceError payload (so the UI can render need/have).
            let balanceBeforeValue = 0;
            if (chosenCurrency === primaryCurrency) {
              balanceBeforeValue = Number.parseFloat(userRow.balance || "0");
            } else {
              const { userCurrencyWallets } = await import("@shared/schema");
              const [sub] = await tx.select({ balance: userCurrencyWallets.balance })
                .from(userCurrencyWallets)
                .where(and(
                  eq(userCurrencyWallets.userId, userId),
                  eq(userCurrencyWallets.currencyCode, chosenCurrency),
                ))
                .for('update');
              balanceBeforeValue = sub ? Number.parseFloat(sub.balance || "0") : 0;
            }

            if (!Number.isFinite(balanceBeforeValue) || balanceBeforeValue < normalizedEntryFee) {
              throw new InsufficientBalanceError({
                walletKind: "cash",
                currency: "usd",
                required: normalizedEntryFee,
                available: Number.isFinite(balanceBeforeValue) ? balanceBeforeValue : 0,
              });
            }

            let adjusted;
            try {
              adjusted = await adjustUserCurrencyBalance(tx, userId, chosenCurrency, -normalizedEntryFee);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.startsWith("Insufficient")) {
                throw new InsufficientBalanceError({
                  walletKind: "cash",
                  currency: "usd",
                  required: normalizedEntryFee,
                  available: balanceBeforeValue,
                });
              }
              throw err;
            }

            // Record the participant's chosen wallet for refund/payout symmetry.
            // NULL when the user paid from their primary balance (legacy behaviour).
            participantWalletCurrency = adjusted.isPrimary ? null : chosenCurrency;

            await tx.insert(transactions).values({
              userId,
              type: "stake",
              status: "completed",
              amount: normalizedEntryFee.toFixed(2),
              balanceBefore: adjusted.balanceBefore.toFixed(2),
              balanceAfter: adjusted.balanceAfter.toFixed(2),
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
          walletCurrency: participantWalletCurrency,
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
      if (error instanceof InsufficientBalanceError) {
        return res.status(400).json({
          error: error.message,
          walletKind: error.walletKind,
          currency: error.currency,
          required: error.required.toFixed(2),
          available: error.available.toFixed(2),
        });
      }
      const msg = getErrorMessage(error);
      if (msg.startsWith("WALLET_NOT_ALLOWED:")) {
        const currency = msg.split(":")[1] || "";
        return res.status(400).json({
          error: `Wallet currency ${currency} is not on your allow-list`,
          code: "WALLET_NOT_ALLOWED",
          currency,
        });
      }
      if (
        msg === "Tournament is full"
        || msg === "Already registered"
        || msg === "Insufficient balance"
        || msg === "Insufficient cash balance"
        || msg === "Insufficient project balance"
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

        const removedParticipant = result[0];

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
            // Cash refund: send back to whichever wallet the user paid from.
            // walletCurrency on the participant row is NULL for the legacy
            // primary-balance path, so adjustUserCurrencyBalance(..., null) →
            // primary debit/credit. {allowCreate} so the sub-wallet exists if
            // the admin has since narrowed the user's allow-list.
            const refundCurrency = removedParticipant?.walletCurrency ?? null;
            const adjusted = await adjustUserCurrencyBalance(
              tx,
              userId,
              refundCurrency,
              normalizedEntryFee,
              { allowCreate: true, allowOutsideAllowList: true },
            );

            await tx.insert(transactions).values({
              userId,
              type: "refund",
              status: "completed",
              amount: normalizedEntryFee.toFixed(2),
              balanceBefore: adjusted.balanceBefore.toFixed(2),
              balanceAfter: adjusted.balanceAfter.toFixed(2),
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
