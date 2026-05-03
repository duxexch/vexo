import { describe, expect, it } from "vitest";
import {
    createP2PReplayEvent,
    replayP2PEvents,
} from "../server/storage/p2p/runtime";

describe("P2P seal integrity", () => {
    it("fails replay validation when events are reordered", () => {
        const event1 = createP2PReplayEvent({
            eventType: "TradeCreated",
            aggregateType: "trade",
            aggregateId: "trade-1",
            payload: { tradeId: "trade-1", status: "created" },
            prevHash: null,
            createdAt: "2026-05-03T00:00:00.000Z",
        });

        const event2 = createP2PReplayEvent({
            eventType: "EscrowLocked",
            aggregateType: "trade",
            aggregateId: "trade-1",
            payload: { tradeId: "trade-1", status: "locked" },
            prevHash: event1.seal,
            createdAt: "2026-05-03T00:00:01.000Z",
        });

        expect(() => replayP2PEvents([event2, event1])).toThrowError(
            "LEDGER INTEGRITY VIOLATION: Invalid seal chain",
        );
    });
});
