import { EventEmitter } from "node:events";
import type { AuthenticatedSocket } from "../../server/websocket/shared";

export type HarnessEvent =
    | { type: "connect"; clientId: string }
    | { type: "disconnect"; clientId: string }
    | { type: "message"; clientId: string; payload: unknown }
    | { type: "deliver"; fromClientId: string; toClientId: string; payload: unknown }
    | { type: "advance" };

export interface HarnessSentMessage {
    clientId: string;
    payload: unknown;
}

export interface HarnessClient extends AuthenticatedSocket {
    clientId: string;
    sent: HarnessSentMessage[];
    connect(): void;
    disconnect(): void;
    emitJson(payload: unknown): void;
}

type ScheduledItem = {
    order: number;
    run: () => void;
};

type HarnessLink = {
    fromClientId: string;
    toClientId: string;
    match?: (payload: unknown) => boolean;
};

function clonePayload<T>(payload: T): T {
    return payload === undefined ? payload : JSON.parse(JSON.stringify(payload)) as T;
}

function setSocketState(socket: object, readyState: number): void {
    Object.defineProperty(socket, "readyState", {
        configurable: true,
        value: readyState,
        writable: true,
    });
}

function setAliveFlag(socket: object, isAlive: boolean): void {
    Object.defineProperty(socket, "isAlive", {
        configurable: true,
        value: isAlive,
        writable: true,
    });
}

function isClientEvent(event: HarnessEvent): event is Extract<HarnessEvent, { clientId: string }> {
    return "clientId" in event;
}

function isDeliverEvent(event: HarnessEvent): event is Extract<HarnessEvent, { type: "deliver" }> {
    return event.type === "deliver";
}

export class WebSocketEventSimulationHarness {
    private readonly queue: ScheduledItem[] = [];
    private readonly emitter = new EventEmitter();
    private orderCounter = 0;
    readonly clients = new Map<string, HarnessClient>();
    readonly transcript: HarnessSentMessage[] = [];
    readonly eventGraph: HarnessEvent[] = [];
    private readonly links: HarnessLink[] = [];

    createClient(clientId: string): HarnessClient {
        const sent: HarnessSentMessage[] = [];
        const harness = this;
        const emitter = new EventEmitter();

        const client = {
            clientId,
            sent,
            userId: undefined,
            username: undefined,
            role: undefined,
            clientIp: undefined,
            tokenFingerprint: undefined,
            isAlive: true,
            activeChallengeId: undefined,
            activeChallengeRole: undefined,
            on: emitter.on.bind(emitter),
            once: emitter.once.bind(emitter),
            off: emitter.off.bind(emitter),
            emit: emitter.emit.bind(emitter),
            addListener: emitter.addListener.bind(emitter),
            removeListener: emitter.removeListener.bind(emitter),
            send(data: string | Buffer | ArrayBufferLike | Buffer[]): void {
                const payload = typeof data === "string" ? JSON.parse(data) : data;
                const message = { clientId, payload };
                sent.push(message);
                harness.transcript.push(message);
            },
            close(): void {
                setSocketState(this, 3);
                setAliveFlag(this, false);
            },
            connect(): void {
                harness.schedule({ type: "connect", clientId });
            },
            disconnect(): void {
                harness.schedule({ type: "disconnect", clientId });
            },
            emitJson(payload: unknown): void {
                harness.schedule({ type: "message", clientId, payload: clonePayload(payload) });
            },
        } as unknown as HarnessClient;

        setSocketState(client, 1);
        setAliveFlag(client, true);

        this.clients.set(clientId, client);
        return client;
    }

    link(fromClientId: string, toClientId: string, match?: (payload: unknown) => boolean): void {
        this.links.push({ fromClientId, toClientId, match });
    }

    getClient(clientId: string): HarnessClient {
        const client = this.clients.get(clientId);
        if (!client) {
            throw new Error(`Unknown harness client: ${clientId}`);
        }
        return client;
    }

    schedule(event: HarnessEvent): void {
        const order = this.orderCounter += 1;
        this.eventGraph.push(clonePayload(event));
        this.queue.push({
            order,
            run: () => this.dispatch(event),
        });
        this.queue.sort((a, b) => a.order - b.order);
    }

    async replay(): Promise<void> {
        while (this.queue.length > 0) {
            const next = this.queue.shift();
            if (!next) break;
            next.run();
            this.emitter.emit("step", next.order);
            await Promise.resolve();
        }
    }

    async step(): Promise<void> {
        const next = this.queue.shift();
        if (!next) return;
        next.run();
        this.emitter.emit("step", next.order);
        await Promise.resolve();
    }

    clear(): void {
        this.queue.length = 0;
        this.transcript.length = 0;
        this.eventGraph.length = 0;
        this.clients.clear();
        this.links.length = 0;
    }

    onStep(listener: (order: number) => void): void {
        this.emitter.on("step", listener);
    }

    offStep(listener: (order: number) => void): void {
        this.emitter.off("step", listener);
    }

    private dispatch(event: HarnessEvent): void {
        if (isDeliverEvent(event)) {
            this.deliver(event.fromClientId, event.toClientId, event.payload);
            return;
        }

        if (!isClientEvent(event)) {
            return;
        }

        const client = this.clients.get(event.clientId);
        if (!client) {
            return;
        }

        if (event.type === "connect") {
            setSocketState(client, 1);
            setAliveFlag(client, true);
            return;
        }

        if (event.type === "disconnect") {
            setSocketState(client, 3);
            setAliveFlag(client, false);
            return;
        }

        if (event.type === "message") {
            const payload = clonePayload(event.payload);
            client.emit("message", payload);
            this.forwardLinkedPayload(event.clientId, payload);
        }
    }

    private forwardLinkedPayload(fromClientId: string, payload: unknown): void {
        for (const link of this.links) {
            if (link.fromClientId !== fromClientId) continue;
            if (link.match && !link.match(payload)) continue;
            this.schedule({ type: "deliver", fromClientId, toClientId: link.toClientId, payload: clonePayload(payload) });
        }
    }

    private deliver(fromClientId: string, toClientId: string, payload: unknown): void {
        const target = this.clients.get(toClientId);
        if (!target) {
            return;
        }

        if (target.readyState !== 1) {
            return;
        }

        const message = { clientId: toClientId, payload: clonePayload(payload) };
        target.sent.push(message);
        this.transcript.push(message);

        this.emitter.emit("deliver", { fromClientId, toClientId });
    }
}
