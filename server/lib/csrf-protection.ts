import crypto from "crypto";
import type { Request, Response } from "express";

const CSRF_COOKIE_NAME = "vex_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function readSingleHeaderValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : "";
    }

    return typeof value === "string" ? value : "";
}

function hasValidTokenShape(token: string): boolean {
    return CSRF_TOKEN_PATTERN.test(token);
}

function constantTimeEqual(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, "utf8");
    const rightBytes = Buffer.from(right, "utf8");

    if (leftBytes.length !== rightBytes.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function issueCsrfToken(res: Response, secureCookie: boolean): string {
    const csrfToken = crypto.randomBytes(32).toString("base64url");

    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: secureCookie,
        path: "/",
    });

    return csrfToken;
}

export function validateCsrfToken(req: Request): boolean {
    const cookieToken = typeof req.cookies?.[CSRF_COOKIE_NAME] === "string"
        ? req.cookies[CSRF_COOKIE_NAME]
        : "";
    const headerToken = readSingleHeaderValue(req.headers[CSRF_HEADER_NAME]);

    if (!hasValidTokenShape(cookieToken) || !hasValidTokenShape(headerToken)) {
        return false;
    }

    return constantTimeEqual(cookieToken, headerToken);
}
