export type TradeStatus =
    | "initiated"
    | "pending"
    | "awaiting_payment"
    | "paid"
    | "payment_sent"
    | "awaiting_confirmation"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "disputed"
    | "frozen";

export interface TradeStateModel {
    bucket: "pending" | "active" | "resolved" | "cancelled";
    label: string;
}

const TRADE_STATUS_BUCKETS: Record<TradeStatus, TradeStateModel["bucket"]> = {
    initiated: "pending",
    pending: "pending",
    awaiting_payment: "pending",
    paid: "active",
    payment_sent: "active",
    awaiting_confirmation: "active",
    confirmed: "active",
    completed: "resolved",
    cancelled: "cancelled",
    disputed: "active",
    frozen: "pending",
};

const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
    initiated: "Trade started",
    pending: "Waiting for payment",
    awaiting_payment: "Waiting for payment",
    paid: "Payment marked",
    payment_sent: "Payment sent",
    awaiting_confirmation: "Waiting for confirmation",
    confirmed: "Waiting for confirmation",
    completed: "Trade completed",
    cancelled: "Trade cancelled",
    disputed: "Under review",
    frozen: "Frozen",
};

export function mapTradeState(status: string): TradeStateModel {
    const normalizedStatus = status as TradeStatus;
    return {
        bucket: TRADE_STATUS_BUCKETS[normalizedStatus] || "pending",
        label: TRADE_STATUS_LABELS[normalizedStatus] || status,
    };
}
