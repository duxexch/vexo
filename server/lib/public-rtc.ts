interface PublicRtcIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
    credentialType?: "password";
}

export interface PublicRtcSettings {
    iceServers: PublicRtcIceServer[];
    iceTransportPolicy?: "all" | "relay";
}

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

function parseCsv(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeIceServer(raw: unknown): PublicRtcIceServer | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const candidate = raw as Record<string, unknown>;
    const urls = candidate.urls;
    const hasValidUrl =
        typeof urls === "string"
        || (Array.isArray(urls) && urls.every((url) => typeof url === "string" && url.trim().length > 0));

    if (!hasValidUrl) {
        return null;
    }

    const normalized: PublicRtcIceServer = {
        urls: Array.isArray(urls) ? urls.map((url) => url.trim()) : urls.trim(),
    };

    if (typeof candidate.username === "string" && candidate.username.trim().length > 0) {
        normalized.username = candidate.username.trim();
    }

    if (typeof candidate.credential === "string" && candidate.credential.trim().length > 0) {
        normalized.credential = candidate.credential.trim();
        normalized.credentialType = "password";
    }

    return normalized;
}

function parseIceServersFromJson(value: string | undefined): PublicRtcIceServer[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map(normalizeIceServer).filter((server): server is PublicRtcIceServer => Boolean(server));
    } catch {
        return [];
    }
}

export function getPublicRtcSettingsFromEnv(): PublicRtcSettings {
    const policyRaw = (process.env.PUBLIC_RTC_ICE_TRANSPORT_POLICY || "").trim().toLowerCase();
    const policy = policyRaw === "relay" ? "relay" : "all";

    const fromJson = parseIceServersFromJson(process.env.PUBLIC_RTC_ICE_SERVERS_JSON);
    if (fromJson.length > 0) {
        return {
            iceServers: fromJson,
            iceTransportPolicy: policy,
        };
    }

    const stunUrls = parseCsv(process.env.PUBLIC_RTC_STUN_URLS);
    const turnUrls = parseCsv(process.env.PUBLIC_RTC_TURN_URLS);
    const turnUsername = (process.env.PUBLIC_RTC_TURN_USERNAME || "").trim();
    const turnCredential = (process.env.PUBLIC_RTC_TURN_CREDENTIAL || "").trim();

    const iceServers: PublicRtcIceServer[] = [];

    const effectiveStunUrls = stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS;
    iceServers.push({ urls: effectiveStunUrls });

    if (turnUrls.length > 0) {
        const turnServer: PublicRtcIceServer = { urls: turnUrls };
        if (turnUsername.length > 0) {
            turnServer.username = turnUsername;
        }
        if (turnCredential.length > 0) {
            turnServer.credential = turnCredential;
            turnServer.credentialType = "password";
        }
        iceServers.push(turnServer);
    }

    return {
        iceServers,
        iceTransportPolicy: policy,
    };
}