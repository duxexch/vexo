import { useMemo } from "react";
import { useTradeUiState } from "@/p2p/hooks/useTradeUiState";
import type { P2PStateModel } from "@/p2p/state/stateMapper";

export interface P2PUiStateInput {
    trade?: { status: string } | null;
}

export interface P2PUiStateOutput {
    trade: P2PStateModel | null;
}

export function useP2PUiState(input: P2PUiStateInput): P2PUiStateOutput {
    const trade = useTradeUiState(input.trade);

    return useMemo(() => {
        return {
            trade,
        };
    }, [trade]);
}
