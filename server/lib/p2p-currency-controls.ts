export const DEFAULT_P2P_CURRENCY_CODES = ["USD", "USDT", "EUR", "GBP", "SAR", "AED", "EGP"] as const;

const CURRENCY_CODE_PATTERN = /^[A-Z0-9._-]{2,16}$/;

type P2PSettingsCurrencyColumns = {
    p2pBuyCurrencies?: string[] | null;
    p2pSellCurrencies?: string[] | null;
    depositEnabledCurrencies?: string[] | null;
};

export interface P2PCurrencyControls {
    p2pBuyCurrencies: string[];
    p2pSellCurrencies: string[];
    depositEnabledCurrencies: string[];
    allowedP2PCurrencies: string[];
}

export function normalizeCurrencyCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;

    const normalized = raw.trim().toUpperCase();
    if (!normalized || !CURRENCY_CODE_PATTERN.test(normalized)) {
        return null;
    }

    return normalized;
}

function normalizeCurrencyArray(raw: unknown[]): string[] {
    const deduped = new Set<string>();

    for (const item of raw) {
        const normalized = normalizeCurrencyCode(item);
        if (normalized) {
            deduped.add(normalized);
        }
    }

    return Array.from(deduped);
}

function resolveListWithFallback(raw: unknown, fallback: readonly string[]): string[] {
    if (!Array.isArray(raw)) {
        return [...fallback];
    }

    return normalizeCurrencyArray(raw);
}

export function resolveP2PCurrencyControls(settings?: P2PSettingsCurrencyColumns | null): P2PCurrencyControls {
    const p2pBuyCurrencies = resolveListWithFallback(settings?.p2pBuyCurrencies, DEFAULT_P2P_CURRENCY_CODES);
    const p2pSellCurrencies = resolveListWithFallback(settings?.p2pSellCurrencies, DEFAULT_P2P_CURRENCY_CODES);
    const depositEnabledCurrencies = resolveListWithFallback(settings?.depositEnabledCurrencies, DEFAULT_P2P_CURRENCY_CODES);

    return {
        p2pBuyCurrencies,
        p2pSellCurrencies,
        depositEnabledCurrencies,
        allowedP2PCurrencies: Array.from(new Set([...p2pBuyCurrencies, ...p2pSellCurrencies])),
    };
}

export function isCurrencyAllowedForOfferType(
    offerType: unknown,
    currencyCode: unknown,
    controls: P2PCurrencyControls,
): boolean {
    const normalizedCurrency = normalizeCurrencyCode(currencyCode);
    if (!normalizedCurrency) {
        return false;
    }

    if (offerType === "buy") {
        return controls.p2pBuyCurrencies.includes(normalizedCurrency);
    }

    if (offerType === "sell") {
        return controls.p2pSellCurrencies.includes(normalizedCurrency);
    }

    return false;
}
