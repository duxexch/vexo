import { useMemo } from "react";
import { mapTradeUiState, type P2PStateModel } from "@/p2p/state/stateMapper";

export interface TradeLike {
    status: string;
}

export function useTradeUiState(trade: TradeLike | null | undefined): P2PStateModel | null {
    return useMemo(() => {
        if (!trade) {
            return null;
        }

        return mapTradeUiState(trade.status);
    }, [trade?.status]);
}
