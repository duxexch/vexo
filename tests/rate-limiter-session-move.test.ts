import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sessionMoveRateLimiter, sessionUserMoveRateLimiter, resetRateLimit } from "../server/lib/rate-limiter";

describe("session move rate limiters", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        // Clear module-global in-memory limiter state to avoid cross-test leakage
        resetRateLimit("move:session:s1");
        resetRateLimit("move:session-user:s1:u1");
        resetRateLimit("move:session-user:s1:uA");
        resetRateLimit("move:session-user:s1:uB");
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects after exceeding sessionMoveRateLimiter maxMessages within window", () => {
        const sessionId = "s1";

        // Config: 20 moves per 2000ms
        for (let i = 0; i < 20; i++) {
            const res = sessionMoveRateLimiter.check(sessionId);
            expect(res.allowed).toBe(true);
        }

        const rejected = sessionMoveRateLimiter.check(sessionId);
        expect(rejected.allowed).toBe(false);
        expect(rejected.retryAfterMs).toBeGreaterThan(0);
    });

    it("resets after windowMs passes for sessionMoveRateLimiter", () => {
        const sessionId = "s1";

        for (let i = 0; i < 20; i++) {
            expect(sessionMoveRateLimiter.check(sessionId).allowed).toBe(true);
        }
        const rejected = sessionMoveRateLimiter.check(sessionId);
        expect(rejected.allowed).toBe(false);

        vi.advanceTimersByTime(2000);
        const allowedAgain = sessionMoveRateLimiter.check(sessionId);
        expect(allowedAgain.allowed).toBe(true);
    });

    it("rejects after exceeding sessionUserMoveRateLimiter maxMessages within window", () => {
        const sessionId = "s1";
        const userId = "u1";

        // Config: 10 moves per 2000ms for session+user
        for (let i = 0; i < 10; i++) {
            const res = sessionUserMoveRateLimiter.check(sessionId, userId);
            expect(res.allowed).toBe(true);
        }

        const rejected = sessionUserMoveRateLimiter.check(sessionId, userId);
        expect(rejected.allowed).toBe(false);
        expect(rejected.retryAfterMs).toBeGreaterThan(0);
    });

    it("does not interfere across different users within same session", () => {
        const sessionId = "s1";

        const userA = "uA";
        const userB = "uB";

        for (let i = 0; i < 10; i++) {
            expect(sessionUserMoveRateLimiter.check(sessionId, userA).allowed).toBe(true);
        }

        // userB should still have quota
        const resB = sessionUserMoveRateLimiter.check(sessionId, userB);
        expect(resB.allowed).toBe(true);
    });
});
