export type P2POfferKind = "standard" | "digital";

export type P2PInternalDealKind = "standard_asset" | "digital_product";

export type P2PDigitalTradeType =
    | "account_sale"
    | "asset_exchange"
    | "service_trade"
    | "hybrid_trade";

export type P2PBusinessState =
    | "draft"
    | "active"
    | "negotiated"
    | "accepted"
    | "expired";

export type P2POperationalState =
    | "awaiting_payment"
    | "payment_sent"
    | "awaiting_confirmation"
    | "completed"
    | "cancelled"
    | "disputed";

export type P2PAccountingState =
    | "no_funds"
    | "funds_reserved"
    | "funds_locked_in_escrow"
    | "funds_released"
    | "funds_refunded";

export type P2PLedgerEntryType = "debit" | "credit";

export type P2PLedgerReferenceType = "trade" | "dispute" | "refund" | "fee";

export type P2PLedgerAccountType =
    | "user_wallet"
    | "escrow"
    | "fee_account"
    | "system_account";

export type P2PReconciliationStatus = "ok" | "warning" | "failed";

export type P2PRiskTier = "low" | "medium" | "high" | "verified" | "restricted";

export type P2PActionRecommendation = "allow" | "review" | "hold" | "block";

export const P2P_PUBLIC_DEAL_KIND: Record<P2POfferKind, P2PInternalDealKind> = {
    standard: "standard_asset",
    digital: "digital_product",
};

export const P2P_INTERNAL_DEAL_KIND: Record<P2PInternalDealKind, P2POfferKind> = {
    standard_asset: "standard",
    digital_product: "digital",
};

export function normalizeP2PDealKind(rawValue: unknown): P2PInternalDealKind {
    if (rawValue === "digital" || rawValue === "digital_product") {
        return "digital_product";
    }

    return "standard_asset";
}

export function normalizeP2PPublicDealKind(rawValue: unknown): P2POfferKind {
    return normalizeP2PDealKind(rawValue) === "digital_product" ? "digital" : "standard";
}

export function isP2PStandardDeal(rawValue: unknown): boolean {
    return normalizeP2PDealKind(rawValue) === "standard_asset";
}

export function toP2PPublicDealKind(rawValue: unknown): P2POfferKind {
    return normalizeP2PDealKind(rawValue) === "digital_product" ? "digital" : "standard";
}

export function isP2PDigitalDeal(rawValue: unknown): boolean {
    return normalizeP2PDealKind(rawValue) === "digital_product";
}

export interface P2PLedgerEntry {
    entryId: string;
    userId: string;
    tradeId?: string | null;
    offerId?: string | null;
    type: P2PLedgerEntryType;
    amount: string;
    currency: string;
    fee: string;
    balanceBefore: string;
    balanceAfter: string;
    referenceType: P2PLedgerReferenceType;
    referenceId: string;
    ledgerAccountType: P2PLedgerAccountType;
    timestamp: string;
    idempotencyKey: string;
    auditRef: string;
}

export interface P2PTradeStateEvent {
    eventId: string;
    tradeId: string;
    fromBusinessState: P2PBusinessState;
    toBusinessState: P2PBusinessState;
    fromOperationalState: P2POperationalState;
    toOperationalState: P2POperationalState;
    fromAccountingState: P2PAccountingState;
    toAccountingState: P2PAccountingState;
    actorUserId: string;
    reason: string;
    idempotencyKey: string;
    timestamp: string;
}

export interface P2PReconciliationRun {
    id: string;
    businessDate: string;
    totalOffersCreated: number;
    totalTradesOpened: number;
    totalEscrowLocked: string;
    completedTrades: number;
    cancelledTrades: number;
    disputedTrades: number;
    totalFeesCollected: string;
    walletBalanceTotal: string;
    ledgerBalanceTotal: string;
    mismatchCount: number;
    status: P2PReconciliationStatus;
    generatedAt: string;
    auditRef: string;
}

export interface P2PRiskScore {
    id: string;
    userId: string;
    tradeId?: string | null;
    score: number;
    trustTier: P2PRiskTier;
    signals: Record<string, unknown>;
    actionRecommendation: P2PActionRecommendation;
    createdAt: string;
}

const validBusinessTransitions: Record<P2PBusinessState, P2PBusinessState[]> = {
    draft: ["active", "expired"],
    active: ["negotiated", "expired"],
    negotiated: ["accepted", "expired"],
    accepted: ["expired"],
    expired: [],
};

const validOperationalTransitions: Record<P2POperationalState, P2POperationalState[]> = {
    awaiting_payment: ["payment_sent", "cancelled", "disputed"],
    payment_sent: ["awaiting_confirmation", "disputed", "cancelled"],
    awaiting_confirmation: ["completed", "disputed", "cancelled"],
    completed: [],
    cancelled: [],
    disputed: ["completed", "cancelled"],
};

const validAccountingTransitions: Record<P2PAccountingState, P2PAccountingState[]> = {
    no_funds: ["funds_reserved"],
    funds_reserved: ["funds_locked_in_escrow", "funds_refunded"],
    funds_locked_in_escrow: ["funds_released", "funds_refunded", "funds_locked_in_escrow"],
    funds_released: ["funds_released"],
    funds_refunded: ["funds_refunded"],
};

export function assertP2PBusinessTransition(from: P2PBusinessState, to: P2PBusinessState): void {
    const allowed = validBusinessTransitions[from] || [];
    if (!allowed.includes(to)) {
        throw new Error(`Invalid P2P business transition: ${from} -> ${to}`);
    }
}

export function assertP2POperationalTransition(from: P2POperationalState, to: P2POperationalState): void {
    const allowed = validOperationalTransitions[from] || [];
    if (!allowed.includes(to)) {
        throw new Error(`Invalid P2P operational transition: ${from} -> ${to}`);
    }
}

export function assertP2PAccountingTransition(from: P2PAccountingState, to: P2PAccountingState): void {
    const allowed = validAccountingTransitions[from] || [];
    if (!allowed.includes(to)) {
        throw new Error(`Invalid P2P accounting transition: ${from} -> ${to}`);
    }
}

export function isP2PFinancialIdempotencyKey(value: string): boolean {
    return value.trim().length >= 16;
}

export function createP2PAuditRef(prefix: string): string {
    return `${prefix}_${cryptoRandomSuffix()}`;
}

export function isP2PReconciliationHealthy(mismatchCount: number): P2PReconciliationStatus {
    if (mismatchCount === 0) {
        return "ok";
    }

    if (mismatchCount <= 5) {
        return "warning";
    }

    return "failed";
}

export function deriveP2PTradeStateEventIdempotencyKey(tradeId: string, action: string): string {
    return `p2p:${tradeId}:${action}`.slice(0, 128);
}

function cryptoRandomSuffix(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let output = "";
    for (let index = 0; index < 12; index += 1) {
        output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return output;
}
