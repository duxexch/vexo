/**
 * Native-Android regression coverage for the root-cause permission fix
 * (Task #129). Task #124 added Vitest coverage only for the rationale
 * modal's CTA states — but the *actual* production bug was that on
 * Android the Capacitor 8 BridgeWebChromeClient auto-resolves
 * `getUserMedia` as soon as the host app's runtime permission is
 * missing, so the OS popup never gets a chance to appear. The fix is
 * to call the native plugin's `requestCallMediaPermissions` BEFORE
 * `navigator.mediaDevices.getUserMedia`.
 *
 * If a future refactor re-orders or removes that call, the production
 * OS popup silently disappears again on Android and we only learn
 * about it via user reports. These tests pin the contract on both
 * call entrypoints (`useCallSession` for friend calls, `VoiceChat`
 * for in-match voice) so a regression fails CI loudly instead.
 *
 * Strategy:
 *   1. Mock `@capacitor/core` so `Capacitor.isNativePlatform()` →
 *      true and `Capacitor.getPlatform()` → "android". This is what
 *      makes `ensureCallPermissions` take the hard-gate path.
 *   2. Mock `registerPlugin` so the `NativeCallUI` plugin's
 *      `requestCallMediaPermissions` is a Vitest spy that records its
 *      invocation order against `navigator.mediaDevices.getUserMedia`.
 *   3. Trigger the production code paths (mounting the hook /
 *      component and starting a call) and assert the call order.
 *   4. Repeat with the plugin returning
 *      `microphonePermanentlyDenied: true` and assert the rationale
 *      modal is opened with `permanentlyDenied: true` so the modal
 *      hides "Allow" — which is the visible half of the fix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import * as React from "react";

const hoisted = vi.hoisted(() => {
  const callOrder: string[] = [];
  const requestCallMediaPermissions = vi.fn();
  const checkCallMediaPermissions = vi.fn();
  const ensureCallRationaleSpy = vi.fn();
  const getUserMedia = vi.fn();
  return {
    callOrder,
    requestCallMediaPermissions,
    checkCallMediaPermissions,
    ensureCallRationaleSpy,
    getUserMedia,
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    isPluginAvailable: () => true,
  },
  registerPlugin: () => ({
    requestCallMediaPermissions: hoisted.requestCallMediaPermissions,
    checkCallMediaPermissions: hoisted.checkCallMediaPermissions,
    checkOverlayPermission: vi.fn(async () => ({
      granted: true,
      supported: true,
      platform: "android",
    })),
    requestOverlayPermission: vi.fn(async () => ({
      granted: true,
      supported: true,
      platform: "android",
    })),
    isAvailable: vi.fn(async () => ({ available: false, platform: "android" })),
    reportIncomingCall: vi.fn(async () => {}),
    reportOutgoingCall: vi.fn(async () => {}),
    updateCallState: vi.fn(async () => {}),
    endCall: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    removeAllListeners: vi.fn(async () => {}),
    schedule: vi.fn(async () => {}),
    requestPermissions: vi.fn(async () => ({})),
    checkPermissions: vi.fn(async () => ({})),
    register: vi.fn(async () => {}),
  }),
}));

// `@/lib/call-permission-rationale` — keep `ensureCallRationale` as a
// spy we can introspect, but stub `registerRationaleListener` to a
// no-op so any mounted `CallPermissionPrompt` would not interfere.
vi.mock("@/lib/call-permission-rationale", () => ({
  ensureCallRationale: hoisted.ensureCallRationaleSpy,
  registerRationaleListener: () => () => {},
  hasSeenCallRationale: () => true,
  markCallRationaleSeen: () => {},
  clearCallRationale: () => {},
}));

// Heavy collaborators stubbed at the module boundary so the hooks /
// components mount in jsdom without crashing.
const fakeSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock("@/lib/socket-io-client", () => ({
  getRtcSocket: () => fakeSocket,
  getChatSocket: () => fakeSocket,
  disconnectAllSockets: vi.fn(),
}));

vi.mock("@/lib/call-ringtone", () => ({
  startCallRingtone: vi.fn(),
  stopCallRingtone: vi.fn(async () => {}),
}));

vi.mock("@/lib/call-actions", () => ({
  registerCallActionHandler: () => () => {},
  dispatchCallAction: vi.fn(),
}));

vi.mock("@/lib/native-call-ui", () => ({
  endNativeCall: vi.fn(async () => {}),
  presentIncomingCall: vi.fn(async () => {}),
  reportOutgoingCall: vi.fn(async () => {}),
  updateNativeCallState: vi.fn(async () => {}),
}));

// VoiceChat-specific dependency mocks.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    token: "test-token",
    user: { id: "user-self", username: "self" },
  }),
  useAuthHeaders: () => ({}),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    lang: "en",
    setLang: vi.fn(),
    isRtl: false,
  }),
  isRtl: () => false,
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { rtc: undefined } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  toast: vi.fn(),
}));

vi.mock("@/lib/rtc-config", () => ({
  buildRtcConfiguration: () => ({ iceServers: [] }),
}));

vi.mock("@/lib/startup-permissions", () => ({
  openMicrophoneSettings: vi.fn(async () => {}),
  openAppSettings: vi.fn(async () => {}),
}));

import { useCallSession, type UseCallSessionReturn } from "@/hooks/use-call-session";
import { VoiceChat } from "@/components/games/VoiceChat";
import { TooltipProvider } from "@/components/ui/tooltip";

/* ────────────────────────────────────────────────────────────────────
 * Browser-API polyfills missing from jsdom that the production code
 * touches on mount.
 * ──────────────────────────────────────────────────────────────────── */

class FakeMediaStream {
  getTracks() {
    return [] as Array<{ stop: () => void; enabled: boolean; id: string }>;
  }
  getAudioTracks() {
    return [] as Array<{ enabled: boolean }>;
  }
  getVideoTracks() {
    return [] as Array<{ enabled: boolean }>;
  }
  addTrack() {}
}

class FakePeerConnection {
  iceConnectionState = "new";
  signalingState = "stable";
  connectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack() {}
  addTransceiver() {}
  async createOffer() {
    return { type: "offer", sdp: "" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "" };
  }
  async setLocalDescription(d?: { type: string; sdp: string }) {
    if (d) this.localDescription = d;
  }
  async setRemoteDescription(d?: { type: string; sdp: string }) {
    if (d) this.remoteDescription = d;
  }
  async addIceCandidate() {}
  async getStats() {
    return new Map();
  }
  close() {}
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
    // Stay CONNECTING; we never need the socket to actually open for
    // the assertions we make. Holding it in CONNECTING avoids
    // triggering the auth/heartbeat side-effects mid-test.
  }
  send() {}
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Test setup
 * ──────────────────────────────────────────────────────────────────── */

function resetSpies() {
  hoisted.callOrder.length = 0;

  hoisted.requestCallMediaPermissions.mockReset();
  hoisted.requestCallMediaPermissions.mockImplementation(async () => {
    hoisted.callOrder.push("plugin.requestCallMediaPermissions");
    return { microphone: "granted", camera: "granted" };
  });

  hoisted.checkCallMediaPermissions.mockReset();
  hoisted.checkCallMediaPermissions.mockResolvedValue({
    microphone: "granted",
    camera: "granted",
  });

  hoisted.ensureCallRationaleSpy.mockReset();
  hoisted.ensureCallRationaleSpy.mockResolvedValue("allow");

  hoisted.getUserMedia.mockReset();
  hoisted.getUserMedia.mockImplementation(async () => {
    hoisted.callOrder.push("getUserMedia");
    return new FakeMediaStream();
  });

  fakeSocket.on.mockClear();
  fakeSocket.off.mockClear();
  fakeSocket.emit.mockReset();
  // Default: ack rtc:invite (third arg) with success so the production
  // start-call path completes. Other emits are no-ops.
  fakeSocket.emit.mockImplementation(
    (
      _event: string,
      _payload: unknown,
      ack?: (res: { ok: boolean }) => void,
    ) => {
      if (typeof ack === "function") ack({ ok: true });
    },
  );
}

beforeEach(() => {
  resetSpies();

  (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = FakePeerConnection;
  (globalThis as { RTCSessionDescription?: unknown }).RTCSessionDescription = class {
    constructor(public init: unknown) {}
  };
  (globalThis as { RTCIceCandidate?: unknown }).RTCIceCandidate = class {
    constructor(public init: unknown) {}
  };
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: hoisted.getUserMedia },
  });

  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ iceServers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ────────────────────────────────────────────────────────────────────
 * useCallSession (friend-call hook) coverage
 * ──────────────────────────────────────────────────────────────────── */

function CallSessionHarness({
  onReady,
}: {
  onReady: (api: UseCallSessionReturn) => void;
}) {
  const session = useCallSession();
  // Always hand the latest session API back to the test — the hook
  // re-creates its closures on each render so we want the freshest one.
  React.useEffect(() => {
    onReady(session);
  }, [session, onReady]);
  return null;
}

describe("useCallSession on native Android — call-permission ordering", () => {
  it("invokes the plugin's requestCallMediaPermissions BEFORE navigator.mediaDevices.getUserMedia", async () => {
    let api: UseCallSessionReturn | null = null;
    render(<CallSessionHarness onReady={(s) => { api = s; }} />);
    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.startCall("peer-1", "voice");
    });

    // Both must have run exactly once and the plugin must have come
    // first — that is the entire fix from Task #124.
    expect(hoisted.requestCallMediaPermissions).toHaveBeenCalledTimes(1);
    expect(hoisted.getUserMedia).toHaveBeenCalledTimes(1);
    expect(hoisted.callOrder).toEqual([
      "plugin.requestCallMediaPermissions",
      "getUserMedia",
    ]);
  });

  it("opens the rationale modal with permanentlyDenied:true when the plugin reports microphonePermanentlyDenied", async () => {
    hoisted.requestCallMediaPermissions.mockImplementation(async () => {
      hoisted.callOrder.push("plugin.requestCallMediaPermissions");
      return {
        microphone: "denied",
        camera: "granted",
        microphonePermanentlyDenied: true,
      };
    });

    let api: UseCallSessionReturn | null = null;
    render(<CallSessionHarness onReady={(s) => { api = s; }} />);
    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await expect(api!.startCall("peer-2", "voice")).rejects.toBeDefined();
    });

    // getUserMedia must NEVER run when the plugin denied the
    // permission — that's the whole point of the hard-gate.
    expect(hoisted.getUserMedia).not.toHaveBeenCalled();

    // Two ensureCallRationale calls expected: the initial unforced
    // one, then the forced+permanently-denied re-prompt that hides
    // "Allow" in the modal.
    const calls = hoisted.ensureCallRationaleSpy.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe("voice");
    expect(lastCall[1]).toMatchObject({
      force: true,
      permanentlyDenied: true,
    });
  });
});

/* ────────────────────────────────────────────────────────────────────
 * VoiceChat (in-match voice component) coverage
 * ──────────────────────────────────────────────────────────────────── */

function renderVoiceChat() {
  return render(
    <TooltipProvider>
      <VoiceChat
        challengeId="match-test"
        isEnabled={true}
        onToggle={() => {}}
        isMicMuted={false}
        onMicMuteToggle={() => {}}
      />
    </TooltipProvider>,
  );
}

describe("VoiceChat on native Android — call-permission ordering", () => {
  it("invokes the plugin's requestCallMediaPermissions BEFORE navigator.mediaDevices.getUserMedia when the in-match voice toggle goes live", async () => {
    renderVoiceChat();

    // Mounting with isEnabled=true triggers the start-voice-chat
    // useEffect, which awaits ensureLocalStream → ensureCallPermissions
    // → getUserMedia. Wait until both spies have observed their calls.
    await waitFor(() => {
      expect(hoisted.requestCallMediaPermissions).toHaveBeenCalledTimes(1);
      expect(hoisted.getUserMedia).toHaveBeenCalledTimes(1);
    });

    expect(hoisted.callOrder).toEqual([
      "plugin.requestCallMediaPermissions",
      "getUserMedia",
    ]);
  });

  it("opens the rationale modal with permanentlyDenied:true and skips getUserMedia when the plugin reports microphonePermanentlyDenied", async () => {
    hoisted.requestCallMediaPermissions.mockImplementation(async () => {
      hoisted.callOrder.push("plugin.requestCallMediaPermissions");
      return {
        microphone: "denied",
        camera: "granted",
        microphonePermanentlyDenied: true,
      };
    });

    renderVoiceChat();

    // Wait for the production code to reach (and act on) the forced
    // rationale re-prompt — that's the second ensureCallRationale call.
    await waitFor(() => {
      expect(hoisted.ensureCallRationaleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(hoisted.getUserMedia).not.toHaveBeenCalled();

    const calls = hoisted.ensureCallRationaleSpy.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe("voice");
    expect(lastCall[1]).toMatchObject({
      force: true,
      permanentlyDenied: true,
    });
  });
});
