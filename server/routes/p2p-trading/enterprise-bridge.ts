import type {
    P2PAccountingState,
    P2PBusinessState,
    P2POperationalState,
} from "../../../shared/p2p-enterprise";
import { p2pTradeStatusEnum } from "@shared/schema";
type P2PTradeStatus = (typeof p2pTradeStatusEnum.enumValues)[number];

export const P2P_ENTERPRISE_BRIDGE = {
    version: 1,
    business: {
        pending_approval: "draft",
        active: "active",
        negotiated: "negotiated",
        accepted: "accepted",
        completed: "expired",
        cancelled: "expired",
        rejected: "expired",
    } as Record<string, P2PBusinessState>,
    operational: {
        pending: "awaiting_payment",
        paid: "payment_sent",
        confirmed: "awaiting_confirmation",
        completed: "completed",
        cancelled: "cancelled",
        disputed: "disputed",
    } as Record<P2PTradeStatus, P2POperationalState>,
    accounting: {
        pending: "no_funds",
        paid: "funds_reserved",
        confirmed: "funds_locked_in_escrow",
        completed: "funds_released",
        cancelled: "funds_refunded",
        disputed: "funds_locked_in_escrow",
    } as Record<P2PTradeStatus, P2PAccountingState>,
} as const;

export function mapTradeStatusToEnterpriseBusinessState(status: P2PTradeStatus): P2PBusinessState {
    return P2P_ENTERPRISE_BRIDGE.business[status];
}

export function mapTradeStatusToEnterpriseOperationalState(status: P2PTradeStatus): P2POperationalState {
    return P2P_ENTERPRISE_BRIDGE.operational[status];
}

export function mapTradeStatusToEnterpriseAccountingState(status: P2PTradeStatus): P2PAccountingState {
    return P2P_ENTERPRISE_BRIDGE.accounting[status];
}
