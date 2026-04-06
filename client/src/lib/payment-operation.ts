import { apiRequest } from "./queryClient";

export type PaymentOperationType =
    | "deposit"
    | "withdraw"
    | "convert"
    | "p2p_trade_create"
    | "p2p_trade_pay"
    | "p2p_trade_confirm";

function randomBytesHex(byteLength: number): string {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
        throw new Error("Secure random generator is unavailable in this environment.");
    }

    const bytes = new Uint8Array(byteLength);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createPaymentOperationToken(): string {
    const cryptoApi = globalThis.crypto;
    const uuidPart = cryptoApi && typeof cryptoApi.randomUUID === "function"
        ? cryptoApi.randomUUID().replace(/-/g, "")
        : "";

    const token = `${uuidPart}${randomBytesHex(32)}`.slice(0, 64);
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
