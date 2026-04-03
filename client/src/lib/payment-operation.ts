import { apiRequest } from "./queryClient";

export type PaymentOperationType =
    | "deposit"
    | "withdraw"
    | "convert"
    | "p2p_trade_create"
    | "p2p_trade_pay"
    | "p2p_trade_confirm";

function randomSegment(): string {
    return Math.random().toString(36).slice(2, 12);
}

export function createPaymentOperationToken(): string {
    const uuidPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}${randomSegment()}${randomSegment()}`;

    const token = `${uuidPart}${randomSegment()}`.slice(0, 64);
    return token;
}

export async function apiRequestWithPaymentToken(
    method: string,
    url: string,
    data: unknown,
    operation: PaymentOperationType,
): Promise<Response> {
    const token = createPaymentOperationToken();
    return apiRequest(method, url, data, {
        headers: {
            "x-operation-token": token,
            "x-payment-operation": operation,
        },
    });
}

export async function cancelPendingPaymentToken(token: string): Promise<Response> {
    return apiRequest("POST", "/api/financial/operation-token/cancel", { token });
}
