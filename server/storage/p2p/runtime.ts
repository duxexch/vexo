import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type P2PRuntimeActionType =
    | "ledger.write"
    | "ledger.batch.write"
    | "trade.state.mutate"
    | "escrow.mutate"
    | "dispute.resolve"
    | "event.append"
    | "projection.read";

export type P2PExecutionContext = {
    orchestrated: boolean;
    actionType: P2PRuntimeActionType;
    actorUserId: string;
    traceId: string;
    callPath: string[];
};

export type P2PReplayEvent = {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    createdAt: string;
    seal: string;
    prevHash: string | null;
};

export type P2PReplaySnapshot = {
    tradeStates: Map<string, unknown>;
    ledgerEntries: unknown[];
    projections: Map<string, unknown>;
    lastSeal: string | null;
};

const p2pRuntimeStore = new AsyncLocalStorage<P2PExecutionContext>();

export function withP2PExecutionContext<T>(
    context: Omit<P2PExecutionContext, "callPath">,
    run: () => T,
): T {
    return p2pRuntimeStore.run(
        {
            ...context,
            callPath: captureCallPath(),
        },
        run,
    );
}

export function getP2PExecutionContext(): P2PExecutionContext | undefined {
    return p2pRuntimeStore.getStore();
}

export function assertP2POrchestratedAccess(actionType: P2PRuntimeActionType): void {
    const context = getP2PExecutionContext();
    if (!context?.orchestrated) {
        throw new Error("FINANCIAL SAFETY VIOLATION: Direct financial access is forbidden");
    }

    if (context.actionType !== actionType && context.actionType !== "ledger.batch.write") {
        throw new Error("UNAUTHORIZED FINANCIAL ACCESS PATH");
    }

    validateCallStack(context.callPath);
}

export function validateCallStack(callPath: string[] = captureCallPath()): void {
    const joined = callPath.join(" > ").toLowerCase();

    if (joined.includes("ledger") && !joined.includes("orchestrator")) {
        throw new Error("UNAUTHORIZED FINANCIAL ACCESS PATH");
    }

    if (
        (joined.includes("ledger") || joined.includes("escrow") || joined.includes("dispute")) &&
        !joined.includes("p2p-core") &&
        !joined.includes("orchestrator")
    ) {
        throw new Error("UNAUTHORIZED FINANCIAL ACCESS PATH");
    }
}

export function forbidDirectLedgerAccess(): never {
    throw new Error("FINANCIAL SAFETY VIOLATION: Direct ledger mutation is forbidden");
}

export function createLedgerSeal(input: {
    entries: unknown;
    state: unknown;
    event: unknown;
    prevHash: string | null;
    timestamp?: string;
}): { seal: string; prevHash: string | null; timestamp: string } {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const payload = JSON.stringify({
        entries: input.entries,
        state: input.state,
        event: input.event,
        prevHash: input.prevHash,
        timestamp,
    });
    const seal = createHash("sha256").update(payload).digest("hex");

    return {
        seal,
        prevHash: input.prevHash,
        timestamp,
    };
}

export function replayP2PEvents(events: P2PReplayEvent[]): P2PReplaySnapshot {
    const snapshot: P2PReplaySnapshot = {
        tradeStates: new Map<string, unknown>(),
        ledgerEntries: [],
        projections: new Map<string, unknown>(),
        lastSeal: null,
    };

    let previousSeal: string | null = null;
    for (const event of events) {
        validateReplaySeal(event, previousSeal);
        snapshot.lastSeal = event.seal;
        previousSeal = event.seal;

        if (event.eventType.startsWith("Trade")) {
            snapshot.tradeStates.set(event.aggregateId, event.payload);
        }

        if (event.eventType.startsWith("Ledger")) {
            snapshot.ledgerEntries.push({
                aggregateId: event.aggregateId,
                payload: event.payload,
                createdAt: event.createdAt,
            });
        }

        snapshot.projections.set(event.aggregateId, {
            eventType: event.eventType,
            payload: event.payload,
            createdAt: event.createdAt,
        });
    }

    return snapshot;
}

export function validateReplaySeal(event: P2PReplayEvent, prevSeal: string | null): void {
    if (event.prevHash !== prevSeal) {
        throw new Error("LEDGER INTEGRITY VIOLATION: Invalid seal chain");
    }

    const recomputed = createLedgerSeal({
        entries: event.payload,
        state: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
        },
        event: {
            eventType: event.eventType,
            createdAt: event.createdAt,
        },
        prevHash: event.prevHash,
        timestamp: event.createdAt,
    });

    if (recomputed.seal !== event.seal) {
        throw new Error("LEDGER INTEGRITY VIOLATION: Seal mismatch");
    }
}

export function createP2PReplayEvent(input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    createdAt?: string;
    prevHash: string | null;
}): P2PReplayEvent {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const seal = createLedgerSeal({
        entries: input.payload,
        state: {
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
        },
        event: {
            eventType: input.eventType,
            createdAt,
        },
        prevHash: input.prevHash,
        timestamp: createdAt,
    }).seal;

    return {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        createdAt,
        seal,
        prevHash: input.prevHash,
    };
}

function captureCallPath(): string[] {
    const stack = new Error().stack ?? "";
    return stack
        .split("\n")
        .slice(2)
        .map((line) => line.trim())
        .filter(Boolean);
}
