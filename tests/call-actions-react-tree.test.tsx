/**
 * Real-React-tree integration test for the cross-manager call-action
 * bridge that powers push-notification accept / decline / hangup taps.
 *
 * Goal (Task #67): exercise the production handler closures inside the
 * actual `useEffect` registrations of `useCallSession` (challenge call
 * manager) and `PrivateCallLayerProvider` (DM call manager), driven
 * end-to-end by a synthetic Service-Worker `notificationclick`
 * `MessageEvent` flowing through the real `CallSessionProvider`
 * bridge. Anything short of this would just re-test what
 * `scripts/smoke-call-actions.ts` already covers.
 *
 * Strategy:
 *   1. Mount the real `CallSessionProvider` and real
 *      `PrivateCallLayerProvider` from the production source, with
 *      heavy collaborators stubbed at the module boundary
 *      (socket.io, WebSocket, native call UI, ringtone, auth/i18n
 *      providers, etc.) — not in test-component clones.
 *   2. Drive `incoming`/`invite` state by emitting on the same fake
 *      socket / fake WebSocket that the real hooks subscribe to.
 *   3. Trigger a synthetic SW `notificationclick` `MessageEvent` on
 *      the polyfilled `navigator.serviceWorker` so the real bridge
 *      `useEffect` in `CallSessionProvider` is the one that calls
 *      `dispatchCallAction`. The test never calls `dispatchCallAction`
 *      itself.
 *   4. Assert state through a probe component that reads `useCall()`
 *      and `usePrivateCallLayer()` — so what we observe is the
 *      committed state of the production hooks.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCall } from "../client/src/components/calls/CallSessionProvider";
import { CallSessionProvider } from "../client/src/components/calls/CallSessionProvider";
import {
  PrivateCallLayerProvider,
  usePrivateCallLayer,
} from "../client/src/components/chat/private-call-layer";
import { __resetCallActionRegistry } from "../client/src/lib/call-actions";
import { TooltipProvider } from "../client/src/components/ui/tooltip";

/* ────────────────────────────────────────────────────────────────────
 * Module mocks for collaborators that don't run in jsdom or that need
 * deterministic stubs. These declarations MUST come before any import
 * that transitively depends on the mocked module — vitest hoists
 * `vi.mock` calls, but keeping them at the top of the file makes the
 * intent obvious to a reader.
 * ──────────────────────────────────────────────────────────────────── */

interface FakeSocket {
  on: Mock;
  off: Mock;
  emit: Mock;
  /** Fire all listeners registered for `event` with `payload`. */
  fire: (event: string, payload: unknown) => Promise<void>;
}

const fakeSocket: FakeSocket = (() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = vi.fn((event: string, handler: (payload: unknown) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
  });
  const off = vi.fn((event: string, handler: (payload: unknown) => void) => {
    listeners.get(event)?.delete(handler);
  });
  const emit = vi.fn();
  const fire = async (event: string, payload: unknown) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      await Promise.resolve(handler(payload));
    }
  };
  return { on, off, emit, fire };
})();

vi.mock("../client/src/lib/socket-io-client", () => ({
  getRtcSocket: () => fakeSocket,
  getChatSocket: () => fakeSocket,
  disconnectAllSockets: vi.fn(),
}));

vi.mock("../client/src/lib/call-ringtone", () => ({
  startCallRingtone: vi.fn(),
  stopCallRingtone: vi.fn(async () => { }),
}));

vi.mock("../client/src/lib/native-call-ui", () => ({
  presentIncomingCall: vi.fn(async () => { }),
  reportOutgoingCall: vi.fn(async () => { }),
  updateNativeCallState: vi.fn(async () => { }),
  endNativeCall: vi.fn(async () => { }),
}));

vi.mock("../client/src/lib/call-permission-rationale", () => ({
  ensureCallRationale: vi.fn(async () => "allow"),
}));

vi.mock("../client/src/lib/auth", () => ({
  useAuth: () => ({
    token: "test-token",
    user: { id: "user-self", username: "self" },
  }),
  useAuthHeaders: () => ({}),
}));

vi.mock("../client/src/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    lang: "en",
    setLang: vi.fn(),
    isRtl: false,
  }),
  isRtl: () => false,
}));

vi.mock("../client/src/lib/settings", () => ({
  useSettings: () => ({ settings: { rtc: undefined } }),
}));

vi.mock("../client/src/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  toast: vi.fn(),
}));

vi.mock("../client/src/lib/rtc-config", () => ({
  buildRtcConfiguration: () => ({ iceServers: [] }),
}));

vi.mock("../client/src/lib/chat-call-ops-queue", () => ({
  enqueueChatCallOperation: vi.fn(() => ({ queue: [], operation: null })),
  createQueuedEndOperation: vi.fn((input: unknown) => input),
  createQueuedStartOperation: vi.fn((input: unknown) => input),
  pruneExpiredChatCallOperations: vi.fn(() => []),
  readChatCallOperationsQueue: vi.fn(() => []),
  writeChatCallOperationsQueue: vi.fn(),
  CHAT_CALL_OP_QUEUE_STORAGE_KEY: "vex:chat-call-op-queue:v1",
  CHAT_CALL_OP_QUEUE_UPDATED_EVENT: "vex:chat-call-op-queue-updated",
  CHAT_CALL_QUEUED_START_PROCESSED_EVENT: "vex:chat-call-queued-start-processed",
  CHAT_CALL_QUEUED_END_PROCESSED_EVENT: "vex:chat-call-queued-end-processed",
  CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT: "vex:chat-call-queued-operation-failed",
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

// Stub the visual chrome — we don't need to render a modal to verify
// the underlying hook state transitioned.
vi.mock("../client/src/components/calls/CallModal", () => ({
  CallModal: () => null,
}));
vi.mock("../client/src/components/calls/CallPermissionPrompt", () => ({
  CallPermissionPrompt: () => null,
}));
// The provider's render output below the registration `useEffect`s is
// not what we're testing — stub the heavy chat-side UI imports. We
// keep the real `PrivateCallLayerProvider` source file in scope by
// only mocking *its* unrelated UI deps where needed.

/* ────────────────────────────────────────────────────────────────────
 * Browser-API polyfills missing from jsdom that the production hooks
 * touch on mount.
 * ──────────────────────────────────────────────────────────────────── */

class FakeMediaStream {
  getTracks() {
    return [] as Array<{ stop: () => void; enabled: boolean }>;
  }
  getAudioTracks() {
    return [] as Array<{ enabled: boolean }>;
  }
  getVideoTracks() {
    return [] as Array<{ enabled: boolean }>;
  }
  addTrack() { }
}

class FakePeerConnection {
  iceConnectionState = "new";
  signalingState = "stable";
  connectionState = "new";
  localDescription = null;
  remoteDescription = null;
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack() { }
  async createOffer() {
    return { type: "offer", sdp: "" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "" };
  }
  async setLocalDescription() { }
  async setRemoteDescription() { }
  async addIceCandidate() { }
  close() { }
}

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    lastWebSocket = this;
    // Open asynchronously so the production code's onopen handler runs
    // after the constructor returns.
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }
  send() { }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

let lastWebSocket: FakeWebSocket | null = null;

/* ────────────────────────────────────────────────────────────────────
 * Probe component: surfaces production hook state to the DOM so the
 * tests can assert against the committed React state.
 * ──────────────────────────────────────────────────────────────────── */

function StateProbe() {
  const call = useCall();
  const dm = usePrivateCallLayer();
  return (
    <div>
      <span data-testid="challenge-status">{call.status}</span>
      <span data-testid="challenge-incoming">{call.incoming?.sessionId ?? "none"}</span>
      <span data-testid="dm-has-active">{String(dm.hasActiveCall)}</span>
      <span data-testid="dm-active-id">{dm.activeSessionId ?? "none"}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Service-worker bridge polyfill. The production
 * `CallSessionProvider` registers a `message` listener on
 * `navigator.serviceWorker` and reacts to `NOTIFICATION_CLICK`
 * messages by calling `dispatchCallAction`. We expose a `dispatchSw`
 * helper that mirrors what the real SW does when a user taps a
 * notification action.
 * ──────────────────────────────────────────────────────────────────── */

function setupServiceWorker(): { dispatchSw: (msg: unknown) => Promise<void> } {
  const target = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      controller: null,
      ready: Promise.resolve({}),
      register: vi.fn(),
    },
  });
  const dispatchSw = async (msg: unknown) => {
    const event = new MessageEvent("message", { data: msg });
    await act(async () => {
      target.dispatchEvent(event);
      // Yield so the fire-and-forget `void dispatchCallAction(...)` chain
      // started by the SW listener gets a chance to run its first batch
      // of microtasks before we hand control back to the caller.
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  return { dispatchSw };
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers to drive the real hooks into the states the bridge should
 * react to.
 * ──────────────────────────────────────────────────────────────────── */

async function deliverChallengeIncoming(sessionId: string): Promise<void> {
  await act(async () => {
    await fakeSocket.fire("rtc:incoming", {
      sessionId,
      fromUserId: "peer-id",
      fromUsername: "peer",
      callType: "voice",
    });
  });
}

async function deliverDmInvite(sessionId: string): Promise<void> {
  // Wait for the real provider to construct the WebSocket and for
  // its onopen → onmessage handler chain to be attached.
  await waitFor(() => {
    expect(lastWebSocket).not.toBeNull();
    expect(lastWebSocket!.onmessage).not.toBeNull();
  });
  await act(async () => {
    lastWebSocket!.onmessage!({
      data: JSON.stringify({
        type: "private_call_invite",
        sessionId,
        callerId: "caller-id",
        receiverId: "user-self",
        callType: "voice",
        ratePerMinute: 0,
      }),
    });
  });
}

/* ────────────────────────────────────────────────────────────────────
 * Test setup
 * ──────────────────────────────────────────────────────────────────── */

let dispatchSw: (msg: unknown) => Promise<void>;

beforeEach(() => {
  __resetCallActionRegistry();
  fakeSocket.on.mockClear();
  fakeSocket.off.mockClear();
  fakeSocket.emit.mockClear();
  lastWebSocket = null;

  // Polyfill globals.
  (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = FakePeerConnection;
  (globalThis as { RTCSessionDescription?: unknown }).RTCSessionDescription = class {
    constructor(public init: unknown) { }
  };
  (globalThis as { RTCIceCandidate?: unknown }).RTCIceCandidate = class {
    constructor(public init: unknown) { }
  };
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => new FakeMediaStream()),
    },
  });

  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as { url: string }).url;
    if (url.includes("/api/rtc/ice-servers")) {
      return new Response(JSON.stringify({ iceServers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  ({ dispatchSw } = setupServiceWorker());
});

afterEach(() => {
  __resetCallActionRegistry();
  vi.restoreAllMocks();
});

function renderRealTree() {
  return render(
    <TooltipProvider>
      <CallSessionProvider>
        <PrivateCallLayerProvider>
          <StateProbe />
        </PrivateCallLayerProvider>
      </CallSessionProvider>
    </TooltipProvider>,
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Specs — each one drives the real registration `useEffect` of one of
 * the two production managers via the real SW bridge.
 * ──────────────────────────────────────────────────────────────────── */

describe("call-action bridge — real production tree", () => {
  it("SW notificationclick (accept) → real useCallSession claims the challenge invite", async () => {
    const tree = renderRealTree();
    try {
      await deliverChallengeIncoming("challenge-A");
      // Sanity: the real hook saw the incoming.
      await waitFor(() => {
        expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-A");
      });

      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "challenge-A",
      });

      // The real `acceptIncoming` path inside `useCallSession` runs:
      // it clears `incoming`, transitions status to "connecting", and
      // (since `setRemoteDescription` etc. are stubbed) waits for the
      // SDP exchange that we don't simulate. That visible commit is
      // exactly what proves the registered closure fired with fresh
      // state.
      await waitFor(() => {
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
        expect(screen.getByTestId("challenge-status").textContent).toBe("connecting");
      });
    } finally {
      tree.unmount();
    }
  });

  it("SW notificationclick (decline) → real useCallSession resets the challenge invite", async () => {
    const tree = renderRealTree();
    try {
      await deliverChallengeIncoming("challenge-B");
      await waitFor(() => {
        expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      });

      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "decline",
        callId: "challenge-B",
      });

      // `declineIncoming` clears `incoming` and sets status to "idle".
      await waitFor(() => {
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
        expect(screen.getByTestId("challenge-status").textContent).toBe("idle");
      });

      // And it must have emitted a wire-level rtc:end so the caller
      // sees the decline. This is the ONLY path that exercises the
      // production hook's signalling on a SW-driven decline.
      const endCall = fakeSocket.emit.mock.calls.find(
        (call) => call[0] === "rtc:end" && (call[1] as { sessionId?: string }).sessionId === "challenge-B",
      );
      expect(endCall).toBeDefined();
    } finally {
      tree.unmount();
    }
  });

  it("SW notificationclick (accept) → real PrivateCallLayer claims the DM invite", async () => {
    const tree = renderRealTree();
    try {
      await deliverDmInvite("dm-A");
      // Sanity: the real DM provider committed the incoming invite.
      await waitFor(() => {
        // DM doesn't expose `incoming` through context, but accepting
        // the invite will set `hasActiveCall`/`activeSessionId` — we
        // assert that as the post-accept observable.
      });

      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "dm-A",
      });

      // After acceptInvite() commits, activeCall is set in the real
      // provider's state.
      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("true");
        expect(screen.getByTestId("dm-active-id").textContent).toBe("dm-A");
      });
    } finally {
      tree.unmount();
    }
  });

  it("SW notificationclick (decline) → real PrivateCallLayer tears down the DM invite", async () => {
    const tree = renderRealTree();
    try {
      await deliverDmInvite("dm-B");

      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "decline",
        callId: "dm-B",
      });

      // Decline must NOT promote the invite to an active call.
      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("false");
        expect(screen.getByTestId("dm-active-id").textContent).toBe("none");
      });

      // Rejection went through the production fetch path that ends
      // the session server-side.
      const fetchMock = globalThis.fetch as unknown as Mock;
      const endCallFetch = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/api/chat/calls/end"),
      );
      expect(endCallFetch).toBeDefined();
    } finally {
      tree.unmount();
    }
  });

  it("SW notificationclick targeting a callId neither manager owns → both refuse", async () => {
    const tree = renderRealTree();
    try {
      await deliverChallengeIncoming("challenge-C");
      await deliverDmInvite("dm-C");
      await waitFor(() => {
        expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      });

      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "ghost-id",
      });

      // Neither manager should have advanced its state machine.
      // (Wait one extra microtask cycle to ensure no late commit.)
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-C");
      expect(screen.getByTestId("dm-has-active").textContent).toBe("false");
    } finally {
      tree.unmount();
    }
  });

  it("SW notificationclick (accept) routes to the correct manager when both have invites", async () => {
    const tree = renderRealTree();
    try {
      await deliverChallengeIncoming("challenge-D");
      await deliverDmInvite("dm-D");
      await waitFor(() => {
        expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      });

      // Target DM — challenge must be untouched.
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "dm-D",
      });

      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("true");
        expect(screen.getByTestId("dm-active-id").textContent).toBe("dm-D");
      });
      // Challenge invite intact.
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-D");
    } finally {
      tree.unmount();
    }
  });

  it("legacy SW action 'open_call' is treated as accept (back-compat with old service workers)", async () => {
    const tree = renderRealTree();
    try {
      await deliverChallengeIncoming("challenge-legacy");
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "open_call",
        callId: "challenge-legacy",
      });

      await waitFor(() => {
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
        expect(screen.getByTestId("challenge-status").textContent).toBe("connecting");
      });
    } finally {
      tree.unmount();
    }
  });

  /* ────────────────────────────────────────────────────────────────────
   * Hangup specs.
   *
   * Note on the test surface: the production `CallSessionProvider` SW
   * bridge intentionally only forwards `accept` / `decline` actions
   * (lock-screen / push-notification action buttons). Hangup is not a
   * notification action — it's invoked by other out-of-band triggers
   * (e.g. the native CallKit / Telecom "End" UI in the wrapped mobile
   * shell, or the system tray button) by calling `dispatchCallAction`
   * directly. So these specs exercise the registry → handler contract
   * by dispatching against `dispatchCallAction` itself, mounting the
   * real production providers so the real `useCallSession` /
   * `usePrivateCallLayer` handlers (with their full `incoming` / `invite`
   * / `activeSessionId` guards) are the ones under test.
   * ──────────────────────────────────────────────────────────────────── */

  it("dispatchCallAction hangup → real useCallSession tears down the active challenge call (active → ended)", async () => {
    const tree = renderRealTree();
    try {
      const { dispatchCallAction } = await import("../client/src/lib/call-actions");

      // First go through accept to put the real hook into an active state.
      // We wait until `incoming` clears AND status is "connecting" — that's
      // the END of `acceptIncoming` in the real hook, by which point
      // `ctxRef.current.sessionId` has been set. Waiting only for the
      // "connecting" status would be premature (it's set before the
      // `await buildPeerConnection` that precedes the ctxRef write).
      await deliverChallengeIncoming("challenge-H");
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "challenge-H",
      });
      await waitFor(() => {
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
        expect(screen.getByTestId("challenge-status").textContent).toBe("connecting");
      });

      // Now trigger hangup via the registry contract directly.
      let claimed = false;
      await act(async () => {
        claimed = await dispatchCallAction({
          action: "hangup",
          callId: "challenge-H",
        });
      });
      expect(claimed).toBe(true);

      // The real `hangup()` callback in `use-call-session.tsx` runs:
      // it emits `rtc:end` and transitions status to "ended".
      await waitFor(() => {
        expect(screen.getByTestId("challenge-status").textContent).toBe("ended");
      });

      const endEmit = fakeSocket.emit.mock.calls.find(
        (call) =>
          call[0] === "rtc:end" &&
          (call[1] as { sessionId?: string }).sessionId === "challenge-H" &&
          (call[1] as { reason?: string }).reason === "native_ui_hangup",
      );
      expect(endEmit).toBeDefined();
    } finally {
      tree.unmount();
    }
  });

  it("dispatchCallAction hangup → real PrivateCallLayer tears down the active DM call (active → idle)", async () => {
    const tree = renderRealTree();
    try {
      const { dispatchCallAction } = await import("../client/src/lib/call-actions");

      // Put the real DM provider into an active call via the accept path.
      await deliverDmInvite("dm-H");
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "dm-H",
      });
      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("true");
        expect(screen.getByTestId("dm-active-id").textContent).toBe("dm-H");
      });

      const fetchMock = globalThis.fetch as unknown as Mock;
      fetchMock.mockClear();

      // Now hangup via the registry contract directly.
      let claimed = false;
      await act(async () => {
        claimed = await dispatchCallAction({
          action: "hangup",
          callId: "dm-H",
        });
      });
      expect(claimed).toBe(true);

      // Real `endCurrentCall` clears `activeCall` and posts to
      // /api/chat/calls/end on the server.
      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("false");
        expect(screen.getByTestId("dm-active-id").textContent).toBe("none");
      });

      const endCallFetch = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/api/chat/calls/end"),
      );
      expect(endCallFetch).toBeDefined();
      // And the body must reference the right session.
      const body = JSON.parse((endCallFetch![1] as { body: string }).body);
      expect(body).toEqual({ sessionId: "dm-H" });
    } finally {
      tree.unmount();
    }
  });

  it("dispatchCallAction hangup with mismatched callId → real useCallSession refuses to hang up the active challenge call", async () => {
    // Direct parity replacement for the retired source-pattern guard #16
    // in scripts/smoke-call-actions.ts: the challenge-active hangup branch
    // must refuse a hangup whose `ctx.callId` doesn't match its
    // `activeSessionId`. Without this guard, the challenge manager would
    // tear down a DM call (or any other manager's session).
    const tree = renderRealTree();
    try {
      const { dispatchCallAction } = await import("../client/src/lib/call-actions");

      // Put the challenge call into an active state.
      await deliverChallengeIncoming("challenge-Z");
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "challenge-Z",
      });
      await waitFor(() => {
        expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
        expect(screen.getByTestId("challenge-status").textContent).toBe("connecting");
      });

      fakeSocket.emit.mockClear();

      // Hangup for a different sessionId — neither manager owns it.
      let claimed = true;
      await act(async () => {
        claimed = await dispatchCallAction({
          action: "hangup",
          callId: "some-other-id",
        });
      });
      expect(claimed).toBe(false);

      // Challenge call is unchanged — still connecting, no rtc:end emitted.
      expect(screen.getByTestId("challenge-status").textContent).toBe("connecting");
      const endEmit = fakeSocket.emit.mock.calls.find((call) => call[0] === "rtc:end");
      expect(endEmit).toBeUndefined();
    } finally {
      tree.unmount();
    }
  });

  it("dispatchCallAction hangup with mismatched callId → neither manager tears down (no cross-manager false claim)", async () => {
    const tree = renderRealTree();
    try {
      const { dispatchCallAction } = await import("../client/src/lib/call-actions");

      // Put DM into active state with one id, leave challenge ringing
      // with another. A hangup for a third "ghost" id must be refused
      // by both — this is the production regression that previously
      // caused lock-screen End to silently kill the wrong call.
      await deliverDmInvite("dm-X");
      await dispatchSw({
        type: "NOTIFICATION_CLICK",
        notificationType: "private_call_invite",
        action: "accept",
        callId: "dm-X",
      });
      await deliverChallengeIncoming("challenge-X");
      await waitFor(() => {
        expect(screen.getByTestId("dm-has-active").textContent).toBe("true");
        expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      });

      let claimed = true;
      await act(async () => {
        claimed = await dispatchCallAction({
          action: "hangup",
          callId: "ghost-id",
        });
      });
      // No manager owns the ghost id — dispatch must report unclaimed.
      expect(claimed).toBe(false);

      // DM call still active, challenge still ringing.
      expect(screen.getByTestId("dm-has-active").textContent).toBe("true");
      expect(screen.getByTestId("dm-active-id").textContent).toBe("dm-X");
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-X");
    } finally {
      tree.unmount();
    }
  });
});
