import { db } from "../db";
import {
  p2pFreezeBenefitConsumptions,
  p2pFreezeProgramConfigs,
  p2pFreezeRequests,
  p2pTrades,
} from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function formatDecimal8(value: number): string {
  return Math.max(value, 0).toFixed(8);
}

export interface ApplyP2PFreezeBenefitInput {
  tradeId: string;
  buyerId: string;
  currencyCode: string;
  tradeAmount: number;
  completedAt: Date;
  baseFreezeHours: number;
}

export interface ApplyP2PFreezeBenefitResult {
  freezeHoursApplied: number;
  freezeReductionPercent: number;
  freezeUntil: Date;
  consumedAmount: number;
  sourceRequestId: string | null;
}

interface LockedFreezeRow {
  id: string;
  remaining_amount: string;
}

export async function applyP2PFreezeBenefitForCompletedTrade(
  input: ApplyP2PFreezeBenefitInput,
): Promise<ApplyP2PFreezeBenefitResult> {
  const tradeAmount = toNumber(input.tradeAmount, 0);
  const safeBaseFreezeHours = Math.max(1, Math.floor(toNumber(input.baseFreezeHours, 24)));

  return db.transaction(async (tx) => {
    const [existingTrade] = await tx
      .select({
        freezeHoursApplied: p2pTrades.freezeHoursApplied,
        freezeReductionPercent: p2pTrades.freezeReductionPercent,
        freezeUntil: p2pTrades.freezeUntil,
      })
      .from(p2pTrades)
      .where(eq(p2pTrades.id, input.tradeId))
      .limit(1);

    if (existingTrade?.freezeUntil && existingTrade.freezeHoursApplied) {
      return {
        freezeHoursApplied: toNumber(existingTrade.freezeHoursApplied, safeBaseFreezeHours),
        freezeReductionPercent: toNumber(existingTrade.freezeReductionPercent, 0),
        freezeUntil: new Date(existingTrade.freezeUntil),
        consumedAmount: 0,
        sourceRequestId: null,
      };
    }

    let freezeReductionPercent = 0;
    let freezeHoursApplied = safeBaseFreezeHours;
    let consumedAmount = 0;
    let sourceRequestId: string | null = null;

    const [config] = await tx
      .select({
        id: p2pFreezeProgramConfigs.id,
        baseReductionPercent: p2pFreezeProgramConfigs.baseReductionPercent,
        maxReductionPercent: p2pFreezeProgramConfigs.maxReductionPercent,
      })
      .from(p2pFreezeProgramConfigs)
      .where(and(
        eq(p2pFreezeProgramConfigs.currencyCode, input.currencyCode),
        eq(p2pFreezeProgramConfigs.isEnabled, true),
      ))
      .limit(1);

    if (config && tradeAmount > 0) {
      const lockedRowsRaw = await tx.execute(sql`
        SELECT id, remaining_amount
        FROM p2p_freeze_requests
        WHERE user_id = ${input.buyerId}
          AND currency_code = ${input.currencyCode}
          AND status = 'approved'
          AND remaining_amount > 0
        ORDER BY approved_at ASC NULLS LAST, created_at ASC
        FOR UPDATE
      `);

      const lockedRows = ((lockedRowsRaw.rows || []) as unknown) as LockedFreezeRow[];
      const totalRemaining = lockedRows.reduce((acc, row) => acc + toNumber(row.remaining_amount, 0), 0);

      if (totalRemaining > 0) {
        const baseReductionPercent = clamp(toNumber(config.baseReductionPercent, 50), 0, 100);
        const maxReductionPercent = clamp(toNumber(config.maxReductionPercent, 90), 0, 100);
        const coverageRatio = totalRemaining / tradeAmount;

        freezeReductionPercent = clamp(baseReductionPercent * coverageRatio, 0, maxReductionPercent);
        freezeHoursApplied = Math.max(
          1,
          Math.round(safeBaseFreezeHours * (1 - (freezeReductionPercent / 100))),
        );

        consumedAmount = Math.min(totalRemaining, tradeAmount);

        let amountLeftToConsume = consumedAmount;
        for (const row of lockedRows) {
          if (amountLeftToConsume <= 0) {
            break;
          }

          const available = toNumber(row.remaining_amount, 0);
          if (available <= 0) {
            continue;
          }

          const consume = Math.min(available, amountLeftToConsume);
          const nextRemaining = Math.max(0, available - consume);
          const nextStatus = nextRemaining <= 0 ? "exhausted" : "approved";

          await tx
            .update(p2pFreezeRequests)
            .set({
              remainingAmount: formatDecimal8(nextRemaining),
              status: nextStatus,
              updatedAt: new Date(),
            })
            .where(eq(p2pFreezeRequests.id, row.id));

          await tx.insert(p2pFreezeBenefitConsumptions).values({
            requestId: row.id,
            tradeId: input.tradeId,
            amountCovered: formatDecimal8(consume),
            reductionPercent: freezeReductionPercent.toFixed(2),
            freezeHoursApplied,
          });

          if (!sourceRequestId) {
            sourceRequestId = row.id;
          }

          amountLeftToConsume -= consume;
        }
      }
    }

    const freezeUntil = new Date(input.completedAt.getTime() + (freezeHoursApplied * 60 * 60 * 1000));

    await tx
      .update(p2pTrades)
      .set({
        freezeHoursApplied,
        freezeReductionPercent: freezeReductionPercent.toFixed(2),
        freezeUntil,
        freezeBenefitSourceRequestId: sourceRequestId,
        updatedAt: new Date(),
      })
      .where(eq(p2pTrades.id, input.tradeId));

    return {
      freezeHoursApplied,
      freezeReductionPercent,
      freezeUntil,
      consumedAmount,
      sourceRequestId,
    };
  });
}
