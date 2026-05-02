export interface PublicRtcIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
    credentialType?: "password";
}

export interface PublicRtcSettings {
    iceServers?: PublicRtcIceServer[];
    iceTransportPolicy?: "all" | "relay";
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

function normalizeIceServer(server: PublicRtcIceServer): RTCIceServer | null {
    const urls = Array.isArray(server.urls)
        ? server.urls.map((url) => url.trim()).filter(Boolean)
        : typeof server.urls === "string"
            ? server.urls.trim()
            : "";

    const hasUrls = Array.isArray(urls) ? urls.length > 0 : urls.length > 0;
    if (!hasUrls) {
        return null;
    }

    const normalized: RTCIceServer = { urls };
    if (server.username) {
        normalized.username = server.username;
    }
    if (server.credential) {
        normalized.credential = server.credential;
    }

    return normalized;
}

export function buildRtcConfiguration(rtcSettings: PublicRtcSettings | undefined | null): RTCConfiguration {
    const iceServers = (rtcSettings?.iceServers || [])
        .map(normalizeIceServer)
        .filter((server): server is RTCIceServer => Boolean(server));

    const config: RTCConfiguration = {
        iceServers: iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS,
    };

    if (rtcSettings?.iceTransportPolicy === "relay" || rtcSettings?.iceTransportPolicy === "all") {
        config.iceTransportPolicy = rtcSettings.iceTransportPolicy;
    }

    return config;
}
