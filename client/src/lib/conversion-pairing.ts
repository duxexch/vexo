import type { Transaction } from "@shared/schema";

/**
 * Groups paired `currency_conversion` transaction legs so the wallet UI can
 * render a single row per conversion (showing source amount, destination
 * amount, fee, and effective rate) instead of two confusing single-leg rows.
 *
 * Pairing rules (in priority order):
 *   1. Mutual `referenceId`: legs A and B where A.referenceId === B.id AND
 *      B.referenceId === A.id. Written by `executeWalletConversion`.
 *   2. Identical `description`: written by `reverseWalletConversion`, whose
 *      reversal legs share a `Reversal: …` description string but each leg's
 *      `referenceId` points at the ORIGINAL legs (not at each other), so the
 *      mutual-ref check does not catch them.
 *
 * Non-conversion transactions are returned in place. Conversion legs whose
 * partner is not in the input array (e.g. partner falls on an earlier page)
 * are returned as orphan transactions so the user still sees them.
 */

export interface ConversionPairItem {
  kind: "conversion-pair";
  pairKey: string;
  debit: Transaction;
  credit: Transaction;
  feePct: number | null;
  feeAmount: number | null;
  effectiveRate: number;
  isReversal: boolean;
}

export type TransactionListItem = Transaction | ConversionPairItem;

export function isConversionPair(item: TransactionListItem): item is ConversionPairItem {
  return (item as ConversionPairItem).kind === "conversion-pair";
}

// Pulls the fee percent out of the conversion description string written by
// `executeWalletConversion` (and reused, with a `Reversal:` prefix, by
// `reverseWalletConversion`). Format: `... fee 1.50%)`.
export function parseFeePctFromDescription(desc: string | null | undefined): number | null {
  if (!desc) return null;
  const match = desc.match(/fee\s+([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function buildConversionPair(a: Transaction, b: Transaction): ConversionPairItem {
  const aBefore = Number.parseFloat(a.balanceBefore ?? "0");
  const aAfter = Number.parseFloat(a.balanceAfter ?? "0");
  const aIsDebit = aAfter - aBefore < 0;
  const debit = aIsDebit ? a : b;
  const credit = aIsDebit ? b : a;

  const debitAmount = Number.parseFloat(debit.amount);
  const creditAmount = Number.parseFloat(credit.amount);
  // Effective rate = how many destination units the user got per 1 source
  // unit (already net of any fee, since `creditAmount` is the net amount).
  const effectiveRate = debitAmount > 0 && Number.isFinite(creditAmount)
    ? creditAmount / debitAmount
    : 0;

  const desc = debit.description || credit.description || "";
  const feePct = parseFeePctFromDescription(desc);
  let feeAmount: number | null = null;
  if (feePct !== null && feePct > 0 && feePct < 100 && Number.isFinite(creditAmount)) {
    // Net = Gross * (1 - feePct/100) ⇒ Gross = Net / (1 - feePct/100).
    const gross = creditAmount / (1 - feePct / 100);
    feeAmount = Math.round((gross - creditAmount) * 100) / 100;
  } else if (feePct === 0) {
    feeAmount = 0;
  }

  return {
    kind: "conversion-pair",
    pairKey: [debit.id, credit.id].sort().join("+"),
    debit,
    credit,
    feePct,
    feeAmount,
    effectiveRate,
    isReversal: desc.startsWith("Reversal:"),
  };
}

function balanceDirection(tx: Transaction): "debit" | "credit" | "flat" {
  const before = Number.parseFloat(tx.balanceBefore ?? "0");
  const after = Number.parseFloat(tx.balanceAfter ?? "0");
  const delta = after - before;
  if (!Number.isFinite(delta) || delta === 0) return "flat";
  return delta < 0 ? "debit" : "credit";
}

export function groupConversionPairs(txs: Transaction[]): TransactionListItem[] {
  const byId = new Map<string, Transaction>();
  for (const tx of txs) {
    byId.set(tx.id, tx);
  }
  const visited = new Set<string>();
  const items: TransactionListItem[] = [];

  for (const tx of txs) {
    if (visited.has(tx.id)) continue;
    visited.add(tx.id);

    if (tx.type !== "currency_conversion") {
      items.push(tx);
      continue;
    }

    let partner: Transaction | undefined;
    // Primary: mutual `referenceId` (executeWalletConversion case).
    if (tx.referenceId) {
      const cand = byId.get(tx.referenceId);
      if (
        cand
        && !visited.has(cand.id)
        && cand.type === "currency_conversion"
        && cand.referenceId === tx.id
      ) {
        partner = cand;
      }
    }
    // Fallback: identical description string (reversal pairs). To avoid
    // accidentally collapsing two unrelated orphan rows that happen to share
    // a description (e.g. two identical conversions made minutes apart and
    // their referenceIds fell off opposite pages), require:
    //   - opposite balance directions (one leg's balance went down, the
    //     other's went up — a true conversion always has both),
    //   - createdAt timestamps within 60s of each other (paired legs are
    //     written inside the same transaction).
    if (!partner && tx.description) {
      const txDir = balanceDirection(tx);
      const txTime = new Date(tx.createdAt).getTime();
      partner = txs.find((other) => {
        if (other.id === tx.id) return false;
        if (visited.has(other.id)) return false;
        if (other.type !== "currency_conversion") return false;
        if (other.description !== tx.description) return false;
        const otherDir = balanceDirection(other);
        if (txDir === "flat" || otherDir === "flat") return false;
        if (txDir === otherDir) return false;
        const otherTime = new Date(other.createdAt).getTime();
        if (!Number.isFinite(txTime) || !Number.isFinite(otherTime)) return false;
        return Math.abs(otherTime - txTime) <= 60_000;
      });
    }

    if (partner) {
      visited.add(partner.id);
      items.push(buildConversionPair(tx, partner));
    } else {
      items.push(tx);
    }
  }
  return items;
}
