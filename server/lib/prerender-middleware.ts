import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger";

const CRAWLER_SIGNATURES = [
    "googlebot",
    "bingbot",
    "yandexbot",
    "baiduspider",
    "duckduckbot",
    "yahoo",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
    "slackbot",
    "embedly",
    "quora link preview",
    "showyoubot",
    "outbrain",
    "pinterest",
    "developers.google.com/+/web/snippet",
    "google page speed",
    "whatsapp",
    "telegrambot",
    "discordbot",
    "applebot",
    "redditbot",
    "bitlybot",
    "vkshare",
    "rogerbot",
    "linkedin",
    "facebot",
    "nuzzel",
    "skypeuripreview",
    "headlesschrome",
    "chrome-lighthouse",
];

const SKIP_PATH_PREFIXES = [
    "/api",
    "/ws",
    "/socket",
    "/uploads",
    "/storage",
    "/downloads",
];

const STATIC_FILE_PATTERN = /\.(?:js|mjs|cjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|map|json|xml|txt|pdf|zip|mp4|webm|mp3|wav|ogg|m4a|avif|heic)$/i;

const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function isCrawlerRequest(req: Request): boolean {
    if (Object.prototype.hasOwnProperty.call(req.query, "_escaped_fragment_")) {
        return true;
    }

    const userAgent = typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].toLowerCase()
        : "";

    if (!userAgent) {
        return false;
    }

    return CRAWLER_SIGNATURES.some((signature) => userAgent.includes(signature));
}

function shouldSkipRequest(req: Request): boolean {
    if (req.method !== "GET") {
        return true;
    }

    const path = req.path.toLowerCase();

    if (SKIP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        return true;
    }

    if (STATIC_FILE_PATTERN.test(path)) {
        return true;
    }

    if (typeof req.headers["x-prerender"] === "string") {
        return true;
    }

    if (typeof req.headers["x-prerender-token"] === "string") {
        return true;
    }

    const userAgent = typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].toLowerCase()
        : "";
    if (userAgent.includes("prerender")) {
        // Requests from prerender render workers must reach the app directly
        // to avoid recursive proxying back to the prerender upstream.
        return true;
    }

    const accept = typeof req.headers.accept === "string" ? req.headers.accept.toLowerCase() : "";
    if (accept && !accept.includes("text/html") && !accept.includes("*/*")) {
        return true;
    }

    return false;
}

// Only HTTP(S) protocols are valid for the public URL we hand to the
// prerender upstream — anything else (file:, javascript:, data:, …) is
// either nonsense or an SSRF attempt.
const ALLOWED_PUBLIC_PROTOCOLS = new Set(["http", "https"]);

// Strict hostname allowlist for the `Host` header, populated from
// `PRERENDER_PUBLIC_HOSTS` (comma-separated). When empty we still
// resolve a public URL but only after sanitization, so a forged
// `Host:` cannot steer the upstream call to a different origin.
function parsePublicHostAllowlist(): Set<string> {
    return new Set(
        (process.env.PRERENDER_PUBLIC_HOSTS || "")
            .split(",")
            .map((h) => h.trim().toLowerCase())
            .filter(Boolean),
    );
}

function resolvePublicUrl(
    req: Request,
    publicHostAllowlist: Set<string>,
): URL | null {
    const host = req.get("host");
    if (!host) {
        return null;
    }

    const forwardedProtoHeader = req.headers["x-forwarded-proto"];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
        ? forwardedProtoHeader[0]
        : forwardedProtoHeader;

    const rawProtocol = typeof forwardedProto === "string" && forwardedProto.trim().length > 0
        ? forwardedProto.split(",")[0].trim()
        : req.protocol;
    const protocol = rawProtocol.toLowerCase();

    if (!ALLOWED_PUBLIC_PROTOCOLS.has(protocol)) {
        return null;
    }

    // Validate the host header before letting it influence the upstream
    // URL. URL parsing alone is not enough — `evil.example?@trusted.com`
    // is a legal hostname but a clear redirection attempt.
    let parsed: URL;
    try {
        parsed = new URL(req.originalUrl, `${protocol}://${host}`);
    } catch {
        return null;
    }

    if (!ALLOWED_PUBLIC_PROTOCOLS.has(parsed.protocol.replace(/:$/, ""))) {
        return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (publicHostAllowlist.size > 0 && !publicHostAllowlist.has(hostname)) {
        return null;
    }

    return parsed;
}

function copyProxyHeaders(source: Headers, res: Response): void {
    for (const [headerName, headerValue] of source.entries()) {
        if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
            continue;
        }
        res.setHeader(headerName, headerValue);
    }
}

export function createPrerenderMiddleware() {
    const token = (process.env.PRERENDER_TOKEN || process.env.PRERENDER_IO_TOKEN || "").trim();
    const rawServiceBase = (process.env.PRERENDER_SERVICE_URL || "https://service.prerender.io").trim();
    const timeoutMsRaw = Number.parseInt(process.env.PRERENDER_TIMEOUT_MS || "10000", 10);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 10000;

    if (!token) {
        logger.info("[SEO] Prerender disabled (missing PRERENDER_TOKEN)");
        return (_req: Request, _res: Response, next: NextFunction) => next();
    }

    // Parse the upstream once so we can pin the outbound origin and
    // refuse any URL whose origin doesn't match it. This is what
    // prevents a forged Host/X-Forwarded-Proto header from steering the
    // outbound `fetch` to a different host (CodeQL alert #134).
    let upstreamBase: URL;
    try {
        upstreamBase = new URL(rawServiceBase);
    } catch {
        logger.warn(`[SEO] Prerender disabled (invalid PRERENDER_SERVICE_URL: ${rawServiceBase})`);
        return (_req: Request, _res: Response, next: NextFunction) => next();
    }
    if (!ALLOWED_PUBLIC_PROTOCOLS.has(upstreamBase.protocol.replace(/:$/, ""))) {
        logger.warn(`[SEO] Prerender disabled (unsupported PRERENDER_SERVICE_URL protocol: ${upstreamBase.protocol})`);
        return (_req: Request, _res: Response, next: NextFunction) => next();
    }
    const upstreamOrigin = upstreamBase.origin;
    const upstreamBasePath = upstreamBase.pathname.replace(/\/+$/, "");

    const publicHostAllowlist = parsePublicHostAllowlist();

    logger.info(
        `[SEO] Prerender enabled with upstream ${upstreamOrigin}${upstreamBasePath} (host allowlist: ${publicHostAllowlist.size > 0 ? Array.from(publicHostAllowlist).join(",") : "<none>"})`,
    );

    return async (req: Request, res: Response, next: NextFunction) => {
        if (shouldSkipRequest(req) || !isCrawlerRequest(req)) {
            return next();
        }

        const publicUrl = resolvePublicUrl(req, publicHostAllowlist);
        if (!publicUrl) {
            return next();
        }

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            // Build the upstream URL by treating the (validated) public
            // URL as a path segment under the fixed upstream base. We
            // re-validate the resulting origin against the configured
            // upstream so even a buggy URL constructor branch can't
            // exfiltrate the request to a different host.
            const upstreamUrl = new URL(
                `${upstreamBasePath}/${encodeURIComponent(publicUrl.toString())}`,
                upstreamBase,
            );
            if (upstreamUrl.origin !== upstreamOrigin) {
                logger.warn(`[SEO] Prerender refused: upstream origin drift (${upstreamUrl.origin} != ${upstreamOrigin})`);
                return next();
            }

            const upstreamHeaders = new Headers({
                "X-Prerender-Token": token,
                "User-Agent": typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "",
                "X-Prerender-Int-Type": "Node",
            });

            if (req.ip) {
                upstreamHeaders.set("X-Forwarded-For", req.ip);
            }

            const upstreamResponse = await fetch(upstreamUrl, {
                method: "GET",
                headers: upstreamHeaders,
                signal: abortController.signal,
            });

            logger.info(`[SEO] Prerender upstream response ${upstreamResponse.status} for ${publicUrl}`);

            // If upstream is failing, serve the normal app response instead of breaking crawlers.
            if (upstreamResponse.status >= 500) {
                return next();
            }

            copyProxyHeaders(upstreamResponse.headers, res);
            res.status(upstreamResponse.status);

            const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
            return res.send(responseBuffer);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[SEO] Prerender upstream failed, falling back to app render: ${message}`);
            return next();
        } finally {
            clearTimeout(timeoutId);
        }
    };
}
