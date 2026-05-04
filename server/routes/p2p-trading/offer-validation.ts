import type { User } from "@shared/schema";
import { sanitizePlainText } from "../../lib/input-security";
import {
    assertP2PDealInvariant,
    normalizeP2PDealKind,
    type P2PInternalDealKind,
    type P2PExecutionMode,
} from "@shared/p2p-enterprise";

export const ALLOWED_PAYMENT_TIME_LIMITS = new Set([15, 30, 45, 60]);
export const MAX_NEGOTIATION_FIELD_LENGTH = 2000;
export const MAX_NEGOTIATED_TERMS_LENGTH = 4000;
export const MAX_NEGOTIATED_ADMIN_FEE_RATE = 0.2;
export const P2P_DISPUTE_MINIMUM_REASONS = ["not_received", "invalid_delivery"] as const;
export type P2PDisputeMinimumReason = (typeof P2P_DISPUTE_MINIMUM_REASONS)[number];
export function isP2PDisputeMinimumReason(value: unknown): value is P2PDisputeMinimumReason {
    return typeof value === "string" && (P2P_DISPUTE_MINIMUM_REASONS as readonly string[]).includes(value);
}

export interface OfferValidationResult {
    ok: true;
    dealKind: P2PInternalDealKind;
    executionMode: P2PExecutionMode | null;
    normalizedCurrency: string;
    normalizedFiatCurrency: string;
    selectedPaymentMethodNames: string[];
    parsedAmount: number;
    parsedPrice: number;
    parsedMinLimit: number;
    parsedMaxLimit: number;
    parsedPaymentTimeLimit: number;
    safeTerms: string;
    safeAutoReply: string;
    safeDigitalProductType: string;
    safeExchangeOffered: string;
    safeExchangeRequested: string;
    normalizedVisibility: "public" | "private_friend";
    normalizedTargetUserId: string | null;
    normalizedSupportMediationRequested: boolean;
    normalizedRequestedAdminFeePercentage: string | null;
}

export interface OfferValidationError {
    ok: false;
    status: number;
    error: string;
}

export type OfferValidationOutcome = OfferValidationResult | OfferValidationError;

export interface OfferValidationInput {
    user: User;
    type: unknown;
    amount: unknown;
    price: unknown;
    currency: unknown;
    fiatCurrency: unknown;
    minLimit: unknown;
    maxLimit: unknown;
    paymentMethods: unknown;
    paymentMethodIds: unknown;
    paymentTimeLimit: unknown;
    terms: unknown;
    autoReply: unknown;
    dealKind: unknown;
    digitalProductType: unknown;
    exchangeOffered: unknown;
    exchangeRequested: unknown;
    supportMediationRequested: unknown;
    requestedAdminFeePercentage: unknown;
    executionMode: unknown;
    visibility: unknown;
    targetUserId: unknown;
    allowedCurrenciesForType: string[];
    minTradeAmount?: number;
    maxTradeAmount?: number;
    availableBalanceForSell?: number;
    ownedPaymentMethodIds: string[];
    ownedPaymentMethodNames: string[];
    ownedPaymentMethodTypes: string[];
    isMutualFriend: (userId: string, targetUserId: string) => Promise<boolean>;
    isBlockedEitherWay: (userId: string, targetUserId: string) => Promise<boolean>;
    getUserById: (userId: string) => Promise<User | null>;
}

function normalizePaymentSelector(raw: string): string {
    return raw.trim().toLowerCase();
}

function fail(status: number, error: string): OfferValidationError {
    return { ok: false, status, error };
}

function parsePositiveNumber(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function parseNegotiatedAdminFeeRate(rawValue: unknown): string | null {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_NEGOTIATED_ADMIN_FEE_RATE) {
        return null;
    }

    return parsed.toFixed(4);
}

function validateCommonOfferFields(input: OfferValidationInput) {
    if (!input.type || !["buy", "sell"].includes(String(input.type))) {
        return fail(400, "Type must be 'buy' or 'sell'");
    }

    const parsedAmount = parsePositiveNumber(input.amount);
    const parsedPrice = parsePositiveNumber(input.price);
    const parsedMinLimit = parsePositiveNumber(input.minLimit);
    const parsedMaxLimit = parsePositiveNumber(input.maxLimit);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
        return fail(400, "Amount must be a positive number up to 1,000,000");
    }

    if (Number.isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 100000) {
        return fail(400, "Price must be a positive number");
    }

    if (Number.isNaN(parsedMinLimit) || parsedMinLimit <= 0) {
        return fail(400, "Min limit must be a positive number");
    }

    if (Number.isNaN(parsedMaxLimit) || parsedMaxLimit <= 0 || parsedMaxLimit < parsedMinLimit) {
        return fail(400, "Max limit must be >= min limit");
    }

    if (parsedMaxLimit > parsedAmount) {
        return fail(400, "Max limit cannot exceed total amount");
    }

    if (typeof input.minTradeAmount === "number" && typeof input.maxTradeAmount === "number") {
        if (parsedMinLimit < input.minTradeAmount || parsedMaxLimit > input.maxTradeAmount) {
            return fail(400, `Trade limits must be between ${input.minTradeAmount} and ${input.maxTradeAmount}`);
        }
    }

    const normalizedCurrency = String(input.currency || "").trim().toUpperCase();
    if (!normalizedCurrency || !input.allowedCurrenciesForType.includes(normalizedCurrency)) {
        return fail(400, `Currency must be one of: ${input.allowedCurrenciesForType.join(", ")}`);
    }

    const normalizedFiatCurrency = String(input.fiatCurrency || normalizedCurrency).trim().toUpperCase();
    if (!normalizedFiatCurrency) {
        return fail(400, "Quote currency is required");
    }

    const selectedPaymentMethodNames: string[] = [];
    const selectedPaymentMethodIds = Array.isArray(input.paymentMethodIds)
        ? input.paymentMethodIds.filter((methodId): methodId is string => typeof methodId === "string" && methodId.trim().length > 0)
        : [];
    const legacyPaymentMethodSelectors = Array.isArray(input.paymentMethods)
        ? input.paymentMethods.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : (typeof input.paymentMethods === "string" && input.paymentMethods.trim().length > 0 ? [input.paymentMethods] : []);

    if (selectedPaymentMethodIds.length > 0) {
        for (const methodId of selectedPaymentMethodIds) {
            if (!input.ownedPaymentMethodIds.includes(methodId)) {
                return fail(400, "One or more selected payment methods are invalid or inactive");
            }
        }
    }

    if (selectedPaymentMethodIds.length === 0 && legacyPaymentMethodSelectors.length === 0) {
        return fail(400, "Select at least one of your active payment methods");
    }

    const methodsByName = new Map(
        input.ownedPaymentMethodNames.map((methodName) => [normalizePaymentSelector(methodName), methodName]),
    );
    const methodsByType = new Map(
        input.ownedPaymentMethodTypes.map((methodType) => [normalizePaymentSelector(methodType), methodType]),
    );

    if (selectedPaymentMethodIds.length === 0) {
        for (const selector of legacyPaymentMethodSelectors) {
            const normalizedSelector = normalizePaymentSelector(selector);
            const selected = methodsByName.get(normalizedSelector) || methodsByType.get(normalizedSelector);
            if (selected) {
                selectedPaymentMethodNames.push(selected);
            }
        }

        if (selectedPaymentMethodNames.length === 0) {
            return fail(400, "Select at least one of your active payment methods");
        }
    } else {
        selectedPaymentMethodNames.push(...selectedPaymentMethodIds);
    }

    if (selectedPaymentMethodNames.length > 5) {
        return fail(400, "A maximum of 5 payment methods is allowed per offer");
    }

    const parsedPaymentTimeLimit = Number(input.paymentTimeLimit ?? 15);
    if (!Number.isInteger(parsedPaymentTimeLimit) || !ALLOWED_PAYMENT_TIME_LIMITS.has(parsedPaymentTimeLimit)) {
        return fail(400, `Payment time limit must be one of: ${Array.from(ALLOWED_PAYMENT_TIME_LIMITS).join(", ")}`);
    }

    const safeTerms = typeof input.terms === "string"
        ? sanitizePlainText(input.terms, { maxLength: 1200 }).trim()
        : "";
    const safeAutoReply = typeof input.autoReply === "string"
        ? sanitizePlainText(input.autoReply, { maxLength: 500 }).trim()
        : "";

    if (!safeTerms) {
        return fail(400, "Offer terms are required");
    }

    if (!safeAutoReply) {
        return fail(400, "Auto reply is required");
    }

    const dealKind = normalizeP2PDealKind(input.dealKind);
    const safeDigitalProductType = typeof input.digitalProductType === "string"
        ? sanitizePlainText(input.digitalProductType, { maxLength: 120 }).trim()
        : "";
    const safeExchangeOffered = typeof input.exchangeOffered === "string"
        ? sanitizePlainText(input.exchangeOffered, { maxLength: MAX_NEGOTIATION_FIELD_LENGTH }).trim()
        : "";
    const safeExchangeRequested = typeof input.exchangeRequested === "string"
        ? sanitizePlainText(input.exchangeRequested, { maxLength: MAX_NEGOTIATION_FIELD_LENGTH }).trim()
        : "";
    const normalizedSupportMediationRequested = input.supportMediationRequested === true;
    const normalizedRequestedAdminFeePercentage = parseNegotiatedAdminFeeRate(input.requestedAdminFeePercentage);

    if (input.requestedAdminFeePercentage !== undefined
        && input.requestedAdminFeePercentage !== null
        && input.requestedAdminFeePercentage !== ""
        && !normalizedRequestedAdminFeePercentage) {
        return fail(400, `Requested admin fee must be between 0 and ${MAX_NEGOTIATED_ADMIN_FEE_RATE}`);
    }

    return {
        ok: true as const,
        dealKind,
        normalizedCurrency,
        normalizedFiatCurrency,
        selectedPaymentMethodNames,
        parsedAmount,
        parsedPrice,
        parsedMinLimit,
        parsedMaxLimit,
        parsedPaymentTimeLimit,
        safeTerms,
        safeAutoReply,
        safeDigitalProductType,
        safeExchangeOffered,
        safeExchangeRequested,
        normalizedSupportMediationRequested,
        normalizedRequestedAdminFeePercentage,
    };
}

function validateDigitalOfferFields(
    input: OfferValidationInput,
    base: Exclude<ReturnType<typeof validateCommonOfferFields>, OfferValidationError>,
) {
    if (base.dealKind !== "digital_product") {
        assertP2PDealInvariant({
            dealKind: base.dealKind,
            executionMode: null,
        });

        return {
            ...base,
            executionMode: null,
        };
    }

    const executionModeRaw = typeof input.executionMode === "string" ? input.executionMode.trim() : "";
    if (!executionModeRaw || !["instant", "negotiated"].includes(executionModeRaw)) {
        return fail(400, "Execution mode is required for digital products");
    }

    if (!base.safeDigitalProductType) {
        return fail(400, "Digital product type is required");
    }

    if (!base.safeExchangeOffered) {
        return fail(400, "Exchange offered description is required");
    }

    if (!base.safeExchangeRequested) {
        return fail(400, "Exchange requested description is required");
    }

    if (executionModeRaw === "instant") {
        if (base.normalizedRequestedAdminFeePercentage !== null || base.normalizedSupportMediationRequested) {
            return fail(400, "Instant digital offers cannot request negotiation support or admin fee overrides");
        }

        assertP2PDealInvariant({
            dealKind: base.dealKind,
            executionMode: "instant",
        });

        return {
            ...base,
            executionMode: "instant" as const,
            normalizedSupportMediationRequested: false,
            normalizedRequestedAdminFeePercentage: null,
        };
    }

    assertP2PDealInvariant({
        dealKind: base.dealKind,
        executionMode: "negotiated",
    });

    return {
        ...base,
        executionMode: "negotiated" as const,
    };
}


async function validateVisibility(
    input: OfferValidationInput,
    normalizedVisibility: "public" | "private_friend",
): Promise<OfferValidationOutcome | { normalizedTargetUserId: string | null }> {
    let normalizedTargetUserId: string | null = null;

    if (normalizedVisibility !== "private_friend") {
        return { normalizedTargetUserId };
    }

    if (typeof input.targetUserId !== "string" || input.targetUserId.trim().length === 0) {
        return fail(400, "Target friend is required for private offers");
    }

    normalizedTargetUserId = input.targetUserId.trim();
    if (normalizedTargetUserId === input.user.id) {
        return fail(400, "You cannot target yourself");
    }

    const [targetUser, isMutualFriend, blockedEitherWay] = await Promise.all([
        input.getUserById(normalizedTargetUserId),
        input.isMutualFriend(input.user.id, normalizedTargetUserId),
        input.isBlockedEitherWay(input.user.id, normalizedTargetUserId),
    ]);

    if (!targetUser) {
        return fail(404, "Target user not found");
    }

    if (!isMutualFriend) {
        return fail(403, "Private offers can only target mutual friends");
    }

    if (blockedEitherWay) {
        return fail(403, "Cannot target a blocked user");
    }

    return { normalizedTargetUserId };
}

export function enforceInstantRules(input: {
    executionMode: P2PExecutionMode | null;
    supportMediationRequested: boolean;
    requestedAdminFeePercentage: string | null;
}): OfferValidationError | null {
    if (input.executionMode !== "instant") {
        return null;
    }

    if (input.supportMediationRequested || input.requestedAdminFeePercentage !== null) {
        return fail(400, "Instant digital offers cannot request negotiation support or admin fee overrides");
    }

    return null;
}

export function enforceNegotiatedRules(input: {
    executionMode: P2PExecutionMode | null;
    supportMediationRequested: boolean;
    requestedAdminFeePercentage: string | null;
}): OfferValidationError | null {
    if (input.executionMode !== "negotiated") {
        return null;
    }

    return null;
}

export async function validateOfferCreation(input: OfferValidationInput): Promise<OfferValidationOutcome> {
    const commonValidation = validateCommonOfferFields(input);
    if (!commonValidation.ok) {
        return commonValidation;
    }

    const digitalValidation = validateDigitalOfferFields(input, commonValidation);
    if (!digitalValidation.ok) {
        return digitalValidation;
    }

    if (digitalValidation.dealKind === "digital_product" && !digitalValidation.executionMode) {
        return fail(400, "Execution mode is required for digital products");
    }

    const instantRulesError = enforceInstantRules({
        executionMode: digitalValidation.executionMode,
        supportMediationRequested: digitalValidation.normalizedSupportMediationRequested,
        requestedAdminFeePercentage: digitalValidation.normalizedRequestedAdminFeePercentage,
    });
    if (instantRulesError) {
        return instantRulesError;
    }

    const negotiatedRulesError = enforceNegotiatedRules({
        executionMode: digitalValidation.executionMode,
        supportMediationRequested: digitalValidation.normalizedSupportMediationRequested,
        requestedAdminFeePercentage: digitalValidation.normalizedRequestedAdminFeePercentage,
    });
    if (negotiatedRulesError) {
        return negotiatedRulesError;
    }

    const normalizedVisibility = typeof input.visibility === "string" && input.visibility.trim() === "private_friend"
        ? "private_friend"
        : "public";

    const visibilityValidation = await validateVisibility(input, normalizedVisibility);
    if ("ok" in visibilityValidation && visibilityValidation.ok === false) {
        return visibilityValidation;
    }

    return {
        ok: true,
        dealKind: digitalValidation.dealKind,
        executionMode: digitalValidation.executionMode,
        normalizedCurrency: digitalValidation.normalizedCurrency,
        normalizedFiatCurrency: digitalValidation.normalizedFiatCurrency,
        selectedPaymentMethodNames: digitalValidation.selectedPaymentMethodNames,
        parsedAmount: digitalValidation.parsedAmount,
        parsedPrice: digitalValidation.parsedPrice,
        parsedMinLimit: digitalValidation.parsedMinLimit,
        parsedMaxLimit: digitalValidation.parsedMaxLimit,
        parsedPaymentTimeLimit: digitalValidation.parsedPaymentTimeLimit,
        safeTerms: digitalValidation.safeTerms,
        safeAutoReply: digitalValidation.safeAutoReply,
        safeDigitalProductType: digitalValidation.safeDigitalProductType,
        safeExchangeOffered: digitalValidation.safeExchangeOffered,
        safeExchangeRequested: digitalValidation.safeExchangeRequested,
        normalizedVisibility,
        normalizedTargetUserId: visibilityValidation.normalizedTargetUserId,
        normalizedSupportMediationRequested: digitalValidation.normalizedSupportMediationRequested,
        normalizedRequestedAdminFeePercentage: digitalValidation.normalizedRequestedAdminFeePercentage,
    };
}
