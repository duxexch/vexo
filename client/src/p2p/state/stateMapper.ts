import { mapOfferState, type OfferStateModel } from "@/p2p/state/offerState";
import { mapTradeState, type TradeStateModel } from "@/p2p/state/tradeState";

export interface P2PStateModel {
    status: string;
    label: string;
    bucket: OfferStateModel["bucket"] | TradeStateModel["bucket"];
    uiMode: "browse" | "create" | "manage" | "trade" | "dispute";
    primaryAction?: "pay" | "confirm" | "trade" | "share" | "cancel" | "dispute" | "view";
    allowedActions: Array<NonNullable<P2PStateModel["primaryAction"]>>;
    isLocked: boolean;
}

interface P2PStatusLike {
    status: string;
}

function readStatus(input: string | P2PStatusLike): string {
    return typeof input === "string" ? input : input.status;
}

export function mapOfferStatusToUiState(input: string | P2PStatusLike): P2PStateModel {
    const status = readStatus(input);
    const mapped = mapOfferState(status);
    const uiMode = mapped.bucket === "active" ? "browse" : "manage";

    return {
        status,
        label: mapped.label,
        bucket: mapped.bucket,
        uiMode,
        primaryAction: mapped.bucket === "active" ? "trade" : undefined,
        allowedActions: mapped.bucket === "active" ? ["trade", "share"] : ["view"],
        isLocked: mapped.bucket === "cancelled" || mapped.bucket === "resolved",
    };
}

export function mapTradeStatusToUiState(input: string | P2PStatusLike): P2PStateModel {
    const status = readStatus(input);
    const mapped = mapTradeState(status);

    return {
        status,
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

export function mapOfferUiState(input: string | P2PStatusLike): P2PStateModel {
    return mapOfferStatusToUiState(input);
}

export function mapOfferEntityUiState(input: { status: string }): P2PStateModel {
    return mapOfferStatusToUiState(input.status);
}

export function mapTradeUiState(input: string | P2PStatusLike): P2PStateModel {
    return mapTradeStatusToUiState(input);
}

export function mapTradeEntityUiState(input: { status: string }): P2PStateModel {
    return mapTradeStatusToUiState(input.status);
}
