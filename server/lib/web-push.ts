import { logger } from "./logger";

interface VapidConfig {
    publicKey: string;
    privateKey: string;
    subject: string;
}

export interface PushSubscriptionRecord {
    endpoint: string;
    p256dhKey: string;
    authKey: string;
}

export interface SendWebPushResult {
    sent: boolean;
    deactivate: boolean;
    statusCode?: number;
}

let cachedWebPushModule: typeof import("web-push") | null = null;
let vapidConfigured = false;
let warnedMissingVapid = false;

function getVapidConfig(): VapidConfig | null {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:support@vex-games.com";

    if (!publicKey || !privateKey) {
        return null;
    }

    return { publicKey, privateKey, subject };
}

async function getWebPushModule(): Promise<typeof import("web-push")> {
    if (cachedWebPushModule) {
        return cachedWebPushModule;
    }

    const loaded = await import("web-push");
    cachedWebPushModule = loaded.default ?? loaded;
    return cachedWebPushModule;
}

async function ensureVapidConfigured(): Promise<(typeof import("web-push")) | null> {
    const config = getVapidConfig();
    if (!config) {
        if (!warnedMissingVapid) {
            warnedMissingVapid = true;
            logger.warn("[WebPush] WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY are not configured.");
        }
        return null;
    }

    const webPush = await getWebPushModule();
    if (!vapidConfigured) {
        webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
        vapidConfigured = true;
    }

    return webPush;
}

export function isWebPushEnabled(): boolean {
    return Boolean(getVapidConfig());
}

export function getWebPushPublicKey(): string | null {
    return getVapidConfig()?.publicKey ?? null;
}

export async function sendWebPushNotification(
    subscription: PushSubscriptionRecord,
    payload: string,
): Promise<SendWebPushResult> {
    const webPush = await ensureVapidConfigured();
    if (!webPush) {
        return { sent: false, deactivate: false };
    }

    try {
        await webPush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dhKey,
                auth: subscription.authKey,
            },
        }, payload, {
            TTL: 120,
            urgency: "high",
        });

        return { sent: true, deactivate: false };
    } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
            return { sent: false, deactivate: true, statusCode };
        }

        logger.error("[WebPush] Failed to send push notification", {
            endpoint: subscription.endpoint,
            statusCode,
            error,
        });

        return { sent: false, deactivate: false, statusCode };
    }
}
