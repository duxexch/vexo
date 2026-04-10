import { currencies } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { normalizeCurrencyCode } from "./p2p-currency-controls";

const USD_CURRENCY_CODE = "USD";

export interface DepositFxSnapshot {
    operationalCurrencies: string[];
    missingRateCurrencies: string[];
    usdRateByCurrency: Record<string, number>;
    currencySymbolByCode: Record<string, string>;
}

function parseExchangeRate(rawRate: unknown): number | null {
    const parsed = Number(rawRate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function roundToCents(rawValue: number): number {
    return Math.round((rawValue + Number.EPSILON) * 100) / 100;
}

export async function getDepositFxSnapshot(policyCurrencies: string[]): Promise<DepositFxSnapshot> {
    const normalizedPolicyCurrencies = Array.from(
        new Set(
            (policyCurrencies || [])
                .map((currencyCode) => normalizeCurrencyCode(currencyCode))
                .filter((currencyCode): currencyCode is string => Boolean(currencyCode)),
        ),
    );

    const targetCurrencies = normalizedPolicyCurrencies.includes(USD_CURRENCY_CODE)
        ? normalizedPolicyCurrencies
        : [...normalizedPolicyCurrencies, USD_CURRENCY_CODE];

    const rateRows = targetCurrencies.length > 0
        ? await db
            .select({
                code: currencies.code,
                exchangeRate: currencies.exchangeRate,
                symbol: currencies.symbol,
            })
            .from(currencies)
            .where(
                and(
                    eq(currencies.isActive, true),
                    inArray(currencies.code, targetCurrencies),
                ),
            )
        : [];

    const usdRateByCurrency: Record<string, number> = {
        [USD_CURRENCY_CODE]: 1,
    };
    const currencySymbolByCode: Record<string, string> = {
        [USD_CURRENCY_CODE]: "$",
    };

    for (const row of rateRows) {
        const normalizedCode = normalizeCurrencyCode(row.code);
        if (!normalizedCode) {
            continue;
        }

        const parsedRate = parseExchangeRate(row.exchangeRate);
        if (!parsedRate) {
            continue;
        }

        usdRateByCurrency[normalizedCode] = parsedRate;

        const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
        if (symbol) {
            currencySymbolByCode[normalizedCode] = symbol;
        }
    }

    const operationalCurrencies = normalizedPolicyCurrencies.filter((currencyCode) => {
        const rate = usdRateByCurrency[currencyCode];
        return Number.isFinite(rate) && rate > 0;
    });

    const missingRateCurrencies = normalizedPolicyCurrencies.filter(
        (currencyCode) => !operationalCurrencies.includes(currencyCode),
    );

    return {
        operationalCurrencies,
        missingRateCurrencies,
        usdRateByCurrency,
        currencySymbolByCode,
    };
}

export function convertDepositAmountToUsd(amount: number, currencyCode: string, usdRateByCurrency: Record<string, number>): {
    creditedAmountUsd: number;
    usdToDepositRate: number;
    depositToUsdRate: number;
} | null {
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    const normalizedCurrency = normalizeCurrencyCode(currencyCode);
    if (!normalizedCurrency) {
        return null;
    }

    const usdToDepositRate = usdRateByCurrency[normalizedCurrency];
    if (!Number.isFinite(usdToDepositRate) || usdToDepositRate <= 0) {
        return null;
    }

    const depositToUsdRate = 1 / usdToDepositRate;
    const creditedAmountUsd = roundToCents(amount * depositToUsdRate);

    return {
        creditedAmountUsd,
        usdToDepositRate,
        depositToUsdRate,
    };
}

export function convertUsdAmountToCurrency(amountUsd: number, currencyCode: string, usdRateByCurrency: Record<string, number>): {
    convertedAmount: number;
    usdToCurrencyRate: number;
    currencyToUsdRate: number;
} | null {
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
        return null;
    }

    const normalizedCurrency = normalizeCurrencyCode(currencyCode);
    if (!normalizedCurrency) {
        return null;
    }

    const usdToCurrencyRate = usdRateByCurrency[normalizedCurrency];
    if (!Number.isFinite(usdToCurrencyRate) || usdToCurrencyRate <= 0) {
        return null;
    }

    const currencyToUsdRate = 1 / usdToCurrencyRate;
    const convertedAmount = roundToCents(amountUsd * usdToCurrencyRate);

    return {
        convertedAmount,
        usdToCurrencyRate,
        currencyToUsdRate,
    };
}
