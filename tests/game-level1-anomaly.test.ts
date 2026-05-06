import { describe, expect, it } from "vitest";
import {
    evaluateAndRecordSubmission,
    evaluateAndRecordInvalid,
} from "../server/lib/game-level1-anomaly";

describe("game level1 anomaly detector (rule-based)", () => {
    it("blocks when submission rate exceeds threshold (move_rate_abuse)", () => {
        const sessionId = "s-l1-rate";
        const userId = "u-l1-rate";

        // Aim:
        // - Trigger move_rate_abuse when rateCount becomes 26 (RATE_MAX_SUBMISSIONS=25 => condition is >25)
        // - Avoid timing_regular_fast by making inter-arrival times have high std-dev (> TIMING_MAX_STD_DEV_MS=30)
        //
        // Create 26 submissions within <2000ms total:
        // - First submission at t=0
        // - Then alternate intervals: 0ms and 153ms
        //   avg ~ 76.5ms (<=220) BUT sd is large (~76.5) so timing_regular_fast should NOT trigger.
        const base = 0;

        const submit = (now: number) =>
            evaluateAndRecordSubmission({ sessionId, userId, now });

        // count=1 at t=0
        let now = base;
        let decision = submit(now);

        // Bring rateCount to 25 (still should not be blocked by rate abuse)
        // Need 24 more submissions, with 24 intervals total.
        for (let i = 0; i < 24; i++) {
            const intervalMs = i % 2 === 0 ? 0 : 153;
            now += intervalMs;
            decision = submit(now);
        }

        expect(decision.blocked).toBe(false);

        // One more beyond max should trigger move_rate_abuse (rateCount becomes 26 => blocked)
        now += 0; // keep inside the window
        const blockedDecision = submit(now);

        expect(blockedDecision.blocked).toBe(true);
        expect(blockedDecision.anomalies).toContain("move_rate_abuse");
    });

    it("blocks when invalid-move spam exceeds threshold (invalid_move_spam)", () => {
        const sessionId = "s-l1-invalid";
        const userId = "u-l1-invalid";
        const start = 0;

        // INVALID_MAX_ATTEMPTS = 6, blocks when invalidCount > 6
        // => 7th invalid should block.
        let blocked = false;
        for (let i = 0; i < 7; i++) {
            const decision = evaluateAndRecordInvalid({
                sessionId,
                userId,
                now: start,
            });
            blocked = decision.blocked;
            if (i < 6) expect(decision.blocked).toBe(false);
        }

        expect(blocked).toBe(true);

        const finalDecision = evaluateAndRecordInvalid({
            sessionId,
            userId,
            now: start,
        });
        // After blocked it stays blocked unless we reset window/stale.
        expect(finalDecision.blocked).toBe(true);
        expect(finalDecision.anomalies).toContain("invalid_move_spam");
    });

    it("detects timing regularity (timing_regular_fast) with stable short intervals", () => {
        const sessionId = "s-l1-timing";
        const userId = "u-l1-timing";

        // Use 5 submissions with constant 100ms intervals:
        // intervals: 100, 100, 100, 100 => avg 100, sd 0
        // TIMING_MIN_SAMPLES = 4 => needs at least 4 intervals recorded
        const base = 0;
        const decisions = [];

        decisions.push(
            evaluateAndRecordSubmission({ sessionId, userId, now: base }),
        );
        decisions.push(
            evaluateAndRecordSubmission({ sessionId, userId, now: base + 100 }),
        );
        decisions.push(
            evaluateAndRecordSubmission({ sessionId, userId, now: base + 200 }),
        );
        decisions.push(
            evaluateAndRecordSubmission({ sessionId, userId, now: base + 300 }),
        );
        const last = evaluateAndRecordSubmission({ sessionId, userId, now: base + 400 });

        // Should become blocked only once enough intervals exist (>=4)
        expect(last.blocked).toBe(true);
        expect(last.anomalies).toContain("timing_regular_fast");
    });

    it("does not block on low rate / no anomalies", () => {
        const sessionId = "s-l1-ok";
        const userId = "u-l1-ok";

        const decision = evaluateAndRecordSubmission({
            sessionId,
            userId,
            now: 0,
        });

        expect(decision.blocked).toBe(false);

        const decision2 = evaluateAndRecordSubmission({
            sessionId,
            userId,
            now: 10_000,
        });

        expect(decision2.blocked).toBe(false);
    });
});
