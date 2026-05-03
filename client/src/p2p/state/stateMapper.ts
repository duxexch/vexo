import { mapOfferState, type OfferStateModel } from "@/p2p/state/offerState";
import { mapTradeState, type TradeStateModel } from "@/p2p/state/tradeState";

export interface P2PStateModel {
    label: string;
    bucket: OfferStateModel["bucket"] | TradeStateModel["bucket"];
    uiMode: "browse" | "create" | "manage" | "trade" | "dispute";
    primaryAction?: string;
    allowedActions: string[];
    isLocked: boolean;
}

export function mapOfferUiState(status: string): P2PStateModel {
    const mapped = mapOfferState(status);

    return {
        label: mapped.label,
        bucket: mapped.bucket,
        uiMode: mapped.bucket === "active" ? "browse" : "manage",
        primaryAction: mapped.bucket === "active" ? "trade" : undefined,
        allowedActions: mapped.bucket === "active" ? ["trade", "share"] : ["view"],
        isLocked: mapped.bucket === "cancelled" || mapped.bucket === "resolved",
    };
}

export function mapTradeUiState(status: string): P2PStateModel {
    const mapped = mapTradeState(status);

    return {
        label: mapped.label,
        bucket: mapped.bucket,
        uiMode: mapped.bucket === "resolved" ? "trade" : "manage",
        primaryAction: mapped.bucket === "pending" ? "pay" : mapped.bucket === "active" ? "confirm" : undefined,
        allowedActions:
            mapped.bucket === "pending"
                ? ["pay", "cancel"]
                : mapped.bucket === "active"
                    ? ["confirm", "dispute", "cancel"]
                    : ["view"],
        isLocked: mapped.bucket === "resolved" || mapped.bucket === "cancelled",
    };
}
