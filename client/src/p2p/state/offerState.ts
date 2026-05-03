export type OfferStatus =
    | "draft"
    | "pending_approval"
    | "active"
    | "paused"
    | "rejected"
    | "expired"
    | "cancelled"
    | "inactive"
    | "completed";

export type P2PStatusBucket = "pending" | "active" | "resolved" | "cancelled";

export interface OfferStateModel {
    bucket: P2PStatusBucket;
    label: string;
}

const OFFER_STATUS_BUCKETS: Record<OfferStatus, P2PStatusBucket> = {
    draft: "pending",
    pending_approval: "pending",
    active: "active",
    paused: "pending",
    rejected: "cancelled",
    expired: "pending",
    cancelled: "cancelled",
    inactive: "pending",
    completed: "resolved",
};

const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
    draft: "Draft",
    pending_approval: "Waiting for review",
    active: "Live",
    paused: "Paused",
    rejected: "Rejected",
    expired: "Expired",
    cancelled: "Cancelled",
    inactive: "Paused",
    completed: "Completed",
};

export function mapOfferState(status: string): OfferStateModel {
    const normalizedStatus = status as OfferStatus;
    return {
        bucket: OFFER_STATUS_BUCKETS[normalizedStatus] || "pending",
        label: OFFER_STATUS_LABELS[normalizedStatus] || status,
    };
}
