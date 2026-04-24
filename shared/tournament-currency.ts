export const TOURNAMENT_CURRENCY_TYPES = ["usd", "project"] as const;

export type TournamentCurrencyType = typeof TOURNAMENT_CURRENCY_TYPES[number];

export const TOURNAMENT_CURRENCY_OPTIONS: ReadonlyArray<{
  value: TournamentCurrencyType;
  label: string;
  short: string;
}> = [
  { value: "usd", label: "USD ($)", short: "$" },
  { value: "project", label: "Project Currency (VXC)", short: "VXC" },
];

export function normalizeTournamentCurrencyType(
  value: unknown,
): TournamentCurrencyType {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if ((TOURNAMENT_CURRENCY_TYPES as readonly string[]).includes(normalized)) {
      return normalized as TournamentCurrencyType;
    }
  }
  return "usd";
}

export function getTournamentCurrencySymbol(
  currency: unknown,
): string {
  return normalizeTournamentCurrencyType(currency) === "project" ? "VXC" : "$";
}

export function formatTournamentAmountText(
  amount: string | number | null | undefined,
  currency: unknown,
): string {
  const numericAmount =
    typeof amount === "number"
      ? amount
      : Number.parseFloat(String(amount ?? "0"));
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  if (normalizeTournamentCurrencyType(currency) === "project") {
    return `VXC ${safeAmount.toFixed(2)}`;
  }
  return `$${safeAmount.toFixed(2)}`;
}
