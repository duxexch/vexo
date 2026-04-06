import crypto from "crypto";

export type RewardReferenceKind = "daily" | "ad" | "referral";

const REFERENCE_PREFIX: Record<RewardReferenceKind, string> = {
    daily: "DR",
    ad: "AD",
    referral: "RF",
};

export function createRewardReference(kind: RewardReferenceKind): string {
    const now = new Date();
    const y = now.getUTCFullYear().toString();
    const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const d = now.getUTCDate().toString().padStart(2, "0");
    const hh = now.getUTCHours().toString().padStart(2, "0");
    const mm = now.getUTCMinutes().toString().padStart(2, "0");
    const ss = now.getUTCSeconds().toString().padStart(2, "0");
    const timestamp = `${y}${m}${d}${hh}${mm}${ss}`;
    const entropy = crypto.randomBytes(4).toString("hex").toUpperCase();

    return `VEX-${REFERENCE_PREFIX[kind]}-${timestamp}-${entropy}`;
}