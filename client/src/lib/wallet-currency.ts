export interface WalletCurrencyConfig {
    balanceCurrency?: string;
    usdRateByCurrency?: Record<string, number>;
    currencySymbolByCode?: Record<string, string>;
}

const FALLBACK_SYMBOL_BY_CODE: Record<string, string> = {
    USD: "$",
    EUR: "EUR",
    GBP: "GBP",
    AED: "AED",
    SAR: "SAR",
    EGP: "EGP",
    USDT: "USDT",
};

export function normalizeCurrencyCode(value: string | null | undefined): string {
    if (!value || typeof value !== "string") {
        return "USD";
    }

    const normalized = value.trim().toUpperCase();
    return normalized || "USD";
}

export function getCurrencySymbol(currencyCode: string, symbolByCode?: Record<string, string>): string {
    const normalizedCode = normalizeCurrencyCode(currencyCode);
    const mappedSymbol = symbolByCode?.[normalizedCode];
    if (typeof mappedSymbol === "string" && mappedSymbol.trim().length > 0) {
        return mappedSymbol.trim();
    }

    return FALLBACK_SYMBOL_BY_CODE[normalizedCode] || normalizedCode;
}

export function convertUsdToWalletAmount(rawUsdAmount: string | number, config?: WalletCurrencyConfig): {
    amount: number;
    currency: string;
    symbol: string;
} {
    const usdAmount = typeof rawUsdAmount === "number" ? rawUsdAmount : Number(rawUsdAmount || 0);
    const safeUsdAmount = Number.isFinite(usdAmount) ? usdAmount : 0;

    const currency = normalizeCurrencyCode(config?.balanceCurrency);
    const rate = Number(config?.usdRateByCurrency?.[currency]);

    const amount = Number.isFinite(rate) && rate > 0
        ? Math.round(((safeUsdAmount * rate) + Number.EPSILON) * 100) / 100
        : Math.round((safeUsdAmount + Number.EPSILON) * 100) / 100;

    return {
        amount,
        currency,
        symbol: getCurrencySymbol(currency, config?.currencySymbolByCode),
    };
}

export function convertWalletToUsdAmount(rawWalletAmount: string | number, config?: WalletCurrencyConfig): number {
    const walletAmount = typeof rawWalletAmount === "number" ? rawWalletAmount : Number(rawWalletAmount || 0);
    const safeWalletAmount = Number.isFinite(walletAmount) ? walletAmount : 0;

    const currency = normalizeCurrencyCode(config?.balanceCurrency);
    const rate = Number(config?.usdRateByCurrency?.[currency]);
    if (!Number.isFinite(rate) || rate <= 0) {
        return Math.round((safeWalletAmount + Number.EPSILON) * 100) / 100;
    }

    return Math.round((((safeWalletAmount / rate)) + Number.EPSILON) * 100) / 100;
}

export function formatWalletAmountFromUsd(
    rawUsdAmount: string | number,
    config?: WalletCurrencyConfig,
    options?: { withCode?: boolean },
): string {
    const converted = convertUsdToWalletAmount(rawUsdAmount, config);
    const withCode = options?.withCode !== false;
    const baseText = `${converted.symbol}${converted.amount.toFixed(2)}`;
    if (!withCode || converted.symbol === converted.currency) {
        return withCode ? `${baseText} ${converted.currency}` : baseText;
    }
    return `${baseText} ${converted.currency}`;
}

export function formatWalletNativeAmount(
    rawAmount: string | number,
    currencyCode: string,
    symbolByCode?: Record<string, string>,
    options?: { withCode?: boolean },
): string {
    const amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount || 0);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const currency = normalizeCurrencyCode(currencyCode);
    const symbol = getCurrencySymbol(currency, symbolByCode);
    const withCode = options?.withCode !== false;
    const baseText = `${symbol}${safeAmount.toFixed(2)}`;
    if (!withCode || symbol === currency) {
        return withCode ? `${baseText} ${currency}` : baseText;
    }
    return `${baseText} ${currency}`;
}
