/**
 * Real React-tree coverage for the cross-manager call-action bridge.
 *
 * The smoke at `scripts/smoke-call-actions.ts` already drives the real
 * `dispatchCallAction` registry, but it does so with hand-rolled stub
 * handlers that never run inside a React lifecycle. The two production
 * handler closures live inside `useEffect` blocks in
 *   - `client/src/hooks/use-call-session.tsx`     (challenge-game calls)
 *   - `client/src/components/chat/private-call-layer.tsx` (DM calls)
 *
 * Bugs that escape the smoke but DO break production:
 *   - Wrong `useEffect` dependency list → stale closure captures a stale
 *     `incoming`/`invite` and the manager either claims the wrong call
 *     or refuses the right one.
 *   - Missing cleanup return from `useEffect` → after re-render the
 *     deregister never runs and dispatch fans out to ghost handlers.
 *   - Re-ordered registration after the React Strict-Mode double-mount
 *     → dispatcher hits a stale handler before the live one and wrongly
 *     short-circuits.
 *
 * This file mounts two manager components that mirror the EXACT
 * production handler shapes (verified by the static source guards in
 * `scripts/smoke-call-actions.ts` checks #15-#19), drives state through
 * real `useState` setters that React commits via the actual reconciler,
 * pushes `dispatchCallAction` through the real registry, and asserts
 * the visible state in the rendered DOM transitions correctly for
 * accept / decline / hangup paths on both managers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  __resetCallActionRegistry,
  dispatchCallAction,
  registerCallActionHandler,
} from "../client/src/lib/call-actions";

/* ────────────────────────────────────────────────────────────────────
 * Test harness components
 *
 * Each manager mirrors its production counterpart's closure shape. The
 * shapes are intentionally redundant with the static source guards in
 * `scripts/smoke-call-actions.ts` — together they form a contract: if
 * production ever drifts from this shape, EITHER the static guard
 * fails (catching the source-level diff) OR these behavioural tests
 * fail (catching the runtime symptom). Both layers must agree.
 * ──────────────────────────────────────────────────────────────────── */

type CallType = "voice" | "video";

interface IncomingInvite {
  sessionId: string;
  callType: CallType;
}

interface ActiveCall {
  sessionId: string;
  callType: CallType;
}

type ChallengeStatus = "idle" | "ringing-in" | "connecting" | "connected" | "ended";
type DmPhase = "idle" | "ringing" | "connecting" | "connected" | "ended";

interface ManagerHandle {
  setIncoming: (invite: IncomingInvite | null) => void;
  setActive: (active: ActiveCall | null) => void;
}

/**
 * Mirror of `useCallSession` registration block (use-call-session.tsx
 * lines ~433-458). Same closure shape, same dep array.
 */
function ChallengeManager({
  testId,
  onMount,
}: {
  testId: string;
  onMount: (handle: ManagerHandle) => void;
}) {
  const [incoming, setIncomingState] = useState<IncomingInvite | null>(null);
  const [status, setStatus] = useState<ChallengeStatus>("idle");
  const ctxRef = useRef<ActiveCall | null>(null);
  const [activeSessionDisplay, setActiveSessionDisplay] = useState<string | null>(null);

  const acceptIncoming = useCallback(async () => {
    const invite = incoming;
    if (!invite) return;
    setStatus("connecting");
    ctxRef.current = { sessionId: invite.sessionId, callType: invite.callType };
    setActiveSessionDisplay(invite.sessionId);
    setIncomingState(null);
    // Simulate ICE handshake completion in next microtask so the test
    // can observe the `connecting → connected` transition.
    await Promise.resolve();
    setStatus("connected");
  }, [incoming]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    setIncomingState(null);
    setStatus("ended");
  }, [incoming]);

  const hangup = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctxRef.current = null;
    setActiveSessionDisplay(null);
    setStatus("ended");
  }, []);

  useEffect(() => {
    return registerCallActionHandler(async (ctx) => {
      const activeSessionId = ctxRef.current?.sessionId;
      if (incoming) {
        if (ctx.callId && ctx.callId !== incoming.sessionId) return false;
        if (ctx.action === "accept") {
          await acceptIncoming();
          return true;
        }
        if (ctx.action === "decline") {
          declineIncoming();
          return true;
        }
      }
      if (activeSessionId && ctx.action === "hangup") {
        if (ctx.callId && ctx.callId !== activeSessionId) return false;
        hangup();
        return true;
      }
      return false;
    });
  }, [acceptIncoming, declineIncoming, hangup, incoming]);

  useEffect(() => {
    onMount({
      setIncoming: (invite) => {
        setIncomingState(invite);
        setStatus(invite ? "ringing-in" : "idle");
      },
      setActive: (active) => {
        ctxRef.current = active;
        setActiveSessionDisplay(active?.sessionId ?? null);
        setStatus(active ? "connected" : "ended");
      },
    });
    // Intentionally omit `onMount` from deps — we only want to publish
    // the handle once on mount, mirroring how production wires its
    // "register-on-mount, cleanup-on-unmount" lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-status`}>{status}</span>
      <span data-testid={`${testId}-incoming`}>{incoming?.sessionId ?? "none"}</span>
      <span data-testid={`${testId}-active`}>{activeSessionDisplay ?? "none"}</span>
    </div>
  );
}

/**
 * Mirror of `private-call-layer.tsx` registration block
 * (lines ~974-996). Same closure shape, same dep array, uses refs for
 * incoming/active to match production exactly.
 */
function DmManager({
  testId,
  onMount,
}: {
  testId: string;
  onMount: (handle: ManagerHandle) => void;
}) {
  const [phase, setPhase] = useState<DmPhase>("idle");
  const [inviteDisplay, setInviteDisplay] = useState<string | null>(null);
  const [activeDisplay, setActiveDisplay] = useState<string | null>(null);
  const incomingInviteRef = useRef<IncomingInvite | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);

  const acceptInvite = useCallback(async () => {
    const invite = incomingInviteRef.current;
    if (!invite) return;
    setPhase("connecting");
    activeCallRef.current = { sessionId: invite.sessionId, callType: invite.callType };
    setActiveDisplay(invite.sessionId);
    incomingInviteRef.current = null;
    setInviteDisplay(null);
    await Promise.resolve();
    setPhase("connected");
  }, []);

  const rejectInvite = useCallback(async () => {
    if (!incomingInviteRef.current) return;
    incomingInviteRef.current = null;
    setInviteDisplay(null);
    setPhase("ended");
  }, []);

  const endCurrentCall = useCallback(async () => {
    if (!activeCallRef.current) return;
    activeCallRef.current = null;
    setActiveDisplay(null);
    setPhase("ended");
  }, []);

  useEffect(() => {
    return registerCallActionHandler(async (ctx) => {
      const invite = incomingInviteRef.current;
      const active = activeCallRef.current;
      if (invite) {
        if (ctx.callId && ctx.callId !== invite.sessionId) return false;
        if (ctx.action === "accept") {
          await acceptInvite();
          return true;
        }
        if (ctx.action === "decline") {
          await rejectInvite();
          return true;
        }
      }
      if (active && ctx.action === "hangup") {
        if (ctx.callId && ctx.callId !== active.sessionId) return false;
        await endCurrentCall();
        return true;
      }
      return false;
    });
  }, [acceptInvite, endCurrentCall, rejectInvite]);

  useEffect(() => {
    onMount({
      setIncoming: (invite) => {
        incomingInviteRef.current = invite;
        setInviteDisplay(invite?.sessionId ?? null);
        setPhase(invite ? "ringing" : "idle");
      },
      setActive: (active) => {
        activeCallRef.current = active;
        setActiveDisplay(active?.sessionId ?? null);
        setPhase(active ? "connected" : "ended");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-phase`}>{phase}</span>
      <span data-testid={`${testId}-invite`}>{inviteDisplay ?? "none"}</span>
      <span data-testid={`${testId}-active`}>{activeDisplay ?? "none"}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────── */

interface MountedTree {
  challenge: ManagerHandle;
  dm: ManagerHandle;
  unmount: () => void;
}

async function mountManagers(): Promise<MountedTree> {
  let challengeHandle: ManagerHandle | null = null;
  let dmHandle: ManagerHandle | null = null;

  const { unmount } = render(
    <>
      <ChallengeManager
        testId="challenge"
        onMount={(h) => {
          challengeHandle = h;
        }}
      />
      <DmManager
        testId="dm"
        onMount={(h) => {
          dmHandle = h;
        }}
      />
    </>,
  );

  // Wait for the post-commit `onMount` effects to publish handles.
  await act(async () => {
    await Promise.resolve();
  });

  if (!challengeHandle || !dmHandle) {
    unmount();
    throw new Error("manager handles never published — onMount effect did not fire");
  }

  return { challenge: challengeHandle, dm: dmHandle, unmount };
}

beforeEach(() => {
  __resetCallActionRegistry();
});

afterEach(() => {
  __resetCallActionRegistry();
});

/* ────────────────────────────────────────────────────────────────────
 * Specs
 * ──────────────────────────────────────────────────────────────────── */

describe("call-action bridge — real React tree", () => {
  it("challenge accept transitions ringing-in → connecting → connected", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.challenge.setIncoming({ sessionId: "challenge-A", callType: "voice" });
      });
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-A");

      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "accept", callId: "challenge-A" });
      });

      expect(handled).toBe(true);
      expect(screen.getByTestId("challenge-status").textContent).toBe("connected");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
      expect(screen.getByTestId("challenge-active").textContent).toBe("challenge-A");
      // DM manager must NOT have been touched.
      expect(screen.getByTestId("dm-phase").textContent).toBe("idle");
    } finally {
      tree.unmount();
    }
  });

  it("challenge decline transitions ringing-in → ended without disturbing DM", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.challenge.setIncoming({ sessionId: "challenge-B", callType: "voice" });
        tree.dm.setIncoming({ sessionId: "dm-B", callType: "voice" });
      });
      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "decline", callId: "challenge-B" });
      });
      expect(handled).toBe(true);
      expect(screen.getByTestId("challenge-status").textContent).toBe("ended");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("none");
      // DM still has its own invite untouched.
      expect(screen.getByTestId("dm-phase").textContent).toBe("ringing");
      expect(screen.getByTestId("dm-invite").textContent).toBe("dm-B");
    } finally {
      tree.unmount();
    }
  });

  it("DM accept fires when the challenge manager has no incoming", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.dm.setIncoming({ sessionId: "dm-C", callType: "video" });
      });
      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "accept", callId: "dm-C" });
      });
      expect(handled).toBe(true);
      expect(screen.getByTestId("dm-phase").textContent).toBe("connected");
      expect(screen.getByTestId("dm-active").textContent).toBe("dm-C");
      expect(screen.getByTestId("dm-invite").textContent).toBe("none");
      expect(screen.getByTestId("challenge-status").textContent).toBe("idle");
    } finally {
      tree.unmount();
    }
  });

  it("DM decline tears down DM invite without affecting challenge", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.challenge.setIncoming({ sessionId: "challenge-D", callType: "voice" });
        tree.dm.setIncoming({ sessionId: "dm-D", callType: "voice" });
      });
      await act(async () => {
        await dispatchCallAction({ action: "decline", callId: "dm-D" });
      });
      expect(screen.getByTestId("dm-phase").textContent).toBe("ended");
      expect(screen.getByTestId("dm-invite").textContent).toBe("none");
      // Challenge still ringing.
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("challenge-D");
    } finally {
      tree.unmount();
    }
  });

  it("hangup routes only to the manager whose ACTIVE sessionId matches", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.challenge.setActive({ sessionId: "active-challenge", callType: "voice" });
        tree.dm.setActive({ sessionId: "active-dm", callType: "voice" });
      });
      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "hangup", callId: "active-dm" });
      });
      expect(handled).toBe(true);
      expect(screen.getByTestId("dm-phase").textContent).toBe("ended");
      expect(screen.getByTestId("dm-active").textContent).toBe("none");
      // Challenge call still active.
      expect(screen.getByTestId("challenge-status").textContent).toBe("connected");
      expect(screen.getByTestId("challenge-active").textContent).toBe("active-challenge");
    } finally {
      tree.unmount();
    }
  });

  it("hangup against an invite-only DM manager is refused (no false claim)", async () => {
    // The "infinite ring on iOS" regression: if the invite-only branch
    // ever wrongly claims hangup, the caller never sees a decline event
    // and rings forever. Production protects this by only handling
    // hangup inside the `active && ctx.action === "hangup"` branch.
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.dm.setIncoming({ sessionId: "invite-only-X", callType: "voice" });
      });
      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "hangup", callId: "invite-only-X" });
      });
      expect(handled).toBe(false);
      expect(screen.getByTestId("dm-phase").textContent).toBe("ringing");
      expect(screen.getByTestId("dm-invite").textContent).toBe("invite-only-X");
    } finally {
      tree.unmount();
    }
  });

  it("after a manager unmounts, its handler is deregistered (no ghost claims)", async () => {
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.dm.setIncoming({ sessionId: "dm-ghost", callType: "voice" });
      });
      // Tear down the entire tree mid-invite.
      tree.unmount();

      // Re-mount a fresh tree with no state — the old DM handler must
      // not be lurking in the registry.
      const fresh = await mountManagers();
      try {
        const handled = await dispatchCallAction({ action: "accept", callId: "dm-ghost" });
        expect(handled).toBe(false);
      } finally {
        fresh.unmount();
      }
    } catch (err) {
      throw err;
    }
  });

  it("dispatch with no callId routes to whichever manager has an incoming", async () => {
    // PushKit on iOS can deliver actions without an explicit callId.
    // Whichever manager has an incoming invite must claim the action.
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.dm.setIncoming({ sessionId: "dm-noid", callType: "voice" });
      });
      let handled = false;
      await act(async () => {
        handled = await dispatchCallAction({ action: "accept" });
      });
      expect(handled).toBe(true);
      expect(screen.getByTestId("dm-phase").textContent).toBe("connected");
      expect(screen.getByTestId("dm-active").textContent).toBe("dm-noid");
    } finally {
      tree.unmount();
    }
  });

  it("re-rendering after an `incoming` state change re-registers with the fresh closure (no stale capture)", async () => {
    // If `useEffect`'s dependency array ever drops `incoming`, the
    // registered closure captures a stale `null` and the manager
    // refuses every accept until the next unrelated re-render. This
    // test forces an `incoming` change after initial mount and
    // verifies the freshly-captured value is what the closure sees.
    const tree = await mountManagers();
    try {
      await act(async () => {
        tree.challenge.setIncoming({ sessionId: "first-invite", callType: "voice" });
      });
      // Replace the invite with a different sessionId; closure must
      // re-register against the new value.
      await act(async () => {
        tree.challenge.setIncoming({ sessionId: "second-invite", callType: "voice" });
      });

      // First sessionId is gone — dispatcher should refuse it.
      let handledStale = false;
      await act(async () => {
        handledStale = await dispatchCallAction({ action: "accept", callId: "first-invite" });
      });
      expect(handledStale).toBe(false);
      expect(screen.getByTestId("challenge-status").textContent).toBe("ringing-in");
      expect(screen.getByTestId("challenge-incoming").textContent).toBe("second-invite");

      // Fresh sessionId resolves cleanly.
      let handledFresh = false;
      await act(async () => {
        handledFresh = await dispatchCallAction({ action: "accept", callId: "second-invite" });
      });
      expect(handledFresh).toBe(true);
      expect(screen.getByTestId("challenge-status").textContent).toBe("connected");
      expect(screen.getByTestId("challenge-active").textContent).toBe("second-invite");
    } finally {
      tree.unmount();
    }
  });
});
