/**
 * Smoke test for the cross-manager call-action bridge that powers
 * push-notification and lock-screen accept / decline / hangup taps.
 *
 * The bridge in `client/src/lib/call-actions.ts` is small but two
 * different React managers register handlers against it:
 *   - `client/src/hooks/use-call-session.tsx`  (challenge-game calls)
 *   - `client/src/components/chat/private-call-layer.tsx` (DM calls)
 *
 * If either handler ever drops its `sessionId` guard, claims actions it
 * shouldn't, or short-circuits the registry, push-button accept /
 * decline silently breaks — and the only place a user notices is
 * mid-call, when their phone is on the lock screen. This smoke locks
 * the contracts down so that regression is impossible to ship.
 *
 * Two layers of coverage:
 *
 * 1) **Behavioural tests** against the real `call-actions.ts`
 *    registry, using stub handlers that mirror the real two
 *    managers' state machines. Catches changes to dispatch order,
 *    error handling, and async-await semantics.
 *
 * 2) **Source-pattern guards** for the bridge plumbing only —
 *    `dispatchCallAction` try/catch, `registerCallActionHandler`
 *    cleanup closure, `CallSessionProvider` → `dispatchCallAction`
 *    wiring, the SW accept/decline action mapping, and the
 *    `native-call-ui.ts` CallKit/Telecom decline-first ordering.
 *
 * Behavioural coverage of the two managers' real handler bodies
 * (sessionId guards, accept/decline/hangup branches, mismatched-id
 * refusal) lives in `tests/call-actions-react-tree.test.tsx`, which
 * mounts the real `CallSessionProvider` + `PrivateCallLayerProvider`
 * with mocked browser APIs and dispatches real SW messages /
 * `dispatchCallAction` calls. The previous static source-pattern
 * guards on those handlers were retired once the React-tree spec
 * was in place — string regex on TSX would block legitimate
 * refactors (e.g. moving a guard into a helper, swapping `if`
 * chains for early-return) without adding behavioural value.
 *
 * No DB, no server, no React render. Pure TS, ~50 ms wall time.
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  dispatchCallAction,
  registerCallActionHandler,
  __resetCallActionRegistry,
  type CallAction,
  type CallActionContext,
  type CallActionHandler,
} from "../client/src/lib/call-actions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label: string): void {
  passed += 1;
  console.log(`[smoke:call-actions] PASS ${label}`);
}

function fail(label: string, detail?: string): void {
  failed += 1;
  console.log(`[smoke:call-actions] FAIL ${label}${detail ? `\n            -> ${detail}` : ""}`);
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Slice a balanced { ... } block from `src` starting at the first match of
 * `headerPattern` (which must end at the opening `{`). Returns the inner
 * body (between the opening and matching closing brace), or "" if the
 * pattern doesn't match or the braces don't balance.
 *
 * Used by the negative source guards to scope a regex search to a single
 * branch of the real call-action handlers (e.g. `if (incoming) { ... }`)
 * so we can assert that the slice does NOT contain a forbidden pattern
 * without false-positives from sibling branches in the same file.
 */
function extractBraceBlock(src: string | null, headerPattern: RegExp): string {
  if (!src) return "";
  const m = headerPattern.exec(src);
  if (!m) return "";
  const start = m.index + m[0].length;
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (inSingle) { if (c === "\\") { i++; continue; } if (c === "'") inSingle = false; continue; }
    if (inDouble) { if (c === "\\") { i++; continue; } if (c === '"') inDouble = false; continue; }
    if (inBacktick) { if (c === "\\") { i++; continue; } if (c === "`") inBacktick = false; continue; }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (c === "'") { inSingle = true; continue; }
    if (c === '"') { inDouble = true; continue; }
    if (c === "`") { inBacktick = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
  }
  return "";
}

/* ────────────────────────────────────────────────────────────────────
 * Stub handlers that mirror the real managers' shape.
 *
 * `makeChallengeHandler` / `makeDmHandler` mirror the actual `if
 * (incoming) {...} if (active && action==="hangup")` shape from the
 * real code. Each returns the spy + state references so each test can
 * configure exactly what's incoming/active and inspect what was called.
 * ──────────────────────────────────────────────────────────────────── */

interface ManagerState {
  incomingSessionId: string | null;
  activeSessionId: string | null;
}

interface ManagerSpy {
  acceptCalls: number;
  declineCalls: number;
  hangupCalls: number;
}

function makeManager(state: ManagerState): { handler: CallActionHandler; spy: ManagerSpy; state: ManagerState } {
  const spy: ManagerSpy = { acceptCalls: 0, declineCalls: 0, hangupCalls: 0 };
  const handler: CallActionHandler = async (ctx) => {
    if (state.incomingSessionId) {
      if (ctx.callId && ctx.callId !== state.incomingSessionId) return false;
      if (ctx.action === "accept") {
        spy.acceptCalls += 1;
        return true;
      }
      if (ctx.action === "decline") {
        spy.declineCalls += 1;
        return true;
      }
    }
    if (state.activeSessionId && ctx.action === "hangup") {
      if (ctx.callId && ctx.callId !== state.activeSessionId) return false;
      spy.hangupCalls += 1;
      return true;
    }
    return false;
  };
  return { handler, spy, state };
}

async function dispatch(action: CallAction, callId?: string): Promise<boolean> {
  const ctx: CallActionContext = { action };
  if (callId) ctx.callId = callId;
  return dispatchCallAction(ctx);
}

async function main(): Promise<void> {
  /* ──────────── 1) registerCallActionHandler returns a deregister fn ─── */
  __resetCallActionRegistry();
  {
    const { handler } = makeManager({ incomingSessionId: "s1", activeSessionId: null });
    const off = registerCallActionHandler(handler);
    if (typeof off === "function") {
      pass("registerCallActionHandler returns a deregister function");
      off();
    } else {
      fail("registerCallActionHandler returns a deregister function", `Got: ${typeof off}`);
    }
    const handled = await dispatch("accept", "s1");
    if (!handled) {
      pass("After deregister, the handler is no longer in the registry");
    } else {
      fail("After deregister, the handler is no longer in the registry");
    }
  }

  /* ──────────── 2) Empty registry → dispatch returns false ─────────── */
  __resetCallActionRegistry();
  {
    const handled = await dispatch("accept", "anything");
    if (!handled) {
      pass("Empty registry → dispatchCallAction returns false");
    } else {
      fail("Empty registry → dispatchCallAction returns false");
    }
  }

  /* ──────────── 3) Single handler claims its incoming sessionId ────── */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: "challenge-123", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    const ok = await dispatch("accept", "challenge-123");
    if (ok && challenge.spy.acceptCalls === 1) {
      pass("Challenge manager claims accept when callId matches its incoming sessionId");
    } else {
      fail(
        "Challenge manager claims accept when callId matches its incoming sessionId",
        `dispatch=${ok}, accept count=${challenge.spy.acceptCalls}`,
      );
    }
  }

  /* ──────────── 4) Mismatched callId → manager returns false ───────── */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: "challenge-123", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    const ok = await dispatch("accept", "wrong-id");
    if (!ok && challenge.spy.acceptCalls === 0) {
      pass("Manager returns false (no claim) when callId doesn't match its sessionId — preserves fall-through");
    } else {
      fail(
        "Manager returns false when callId doesn't match its sessionId",
        `dispatch=${ok}, accept count=${challenge.spy.acceptCalls} — if a manager wrongly claims a call it doesn't own, the real manager never gets the action and the user's tap is silently dropped.`,
      );
    }
  }

  /* ──────────── 5) Two managers, second one owns the call ──────────── */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: "challenge-A", activeSessionId: null });
    const dm = makeManager({ incomingSessionId: "dm-B", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("accept", "dm-B");
    if (ok && challenge.spy.acceptCalls === 0 && dm.spy.acceptCalls === 1) {
      pass(
        "When the first manager doesn't own the call, the dispatcher falls through to the next one",
      );
    } else {
      fail(
        "Dispatcher falls through to the next manager when the first doesn't own the call",
        `challenge.accept=${challenge.spy.acceptCalls}, dm.accept=${dm.spy.acceptCalls}, ok=${ok}`,
      );
    }
  }

  /* ──────────── 6) Two managers, neither owns → dispatch returns false ─ */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: "challenge-A", activeSessionId: null });
    const dm = makeManager({ incomingSessionId: "dm-B", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("accept", "ghost-id");
    if (
      !ok
      && challenge.spy.acceptCalls === 0
      && dm.spy.acceptCalls === 0
    ) {
      pass("Both managers refuse → dispatch returns false (action is dropped, not silently swallowed)");
    } else {
      fail("Both managers refuse → dispatch returns false");
    }
  }

  /* ──────────── 7) decline routing matches accept routing ──────────── */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: "s-1", activeSessionId: null });
    const dm = makeManager({ incomingSessionId: "s-2", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    await dispatch("decline", "s-2");
    if (challenge.spy.declineCalls === 0 && dm.spy.declineCalls === 1) {
      pass("decline routes to the manager whose incoming sessionId matches");
    } else {
      fail("decline routes to the right manager", `challenge=${challenge.spy.declineCalls}, dm=${dm.spy.declineCalls}`);
    }
  }

  /* ──────────── 8) hangup only fires for the manager whose ACTIVE session matches ─ */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: null, activeSessionId: "active-A" });
    const dm = makeManager({ incomingSessionId: null, activeSessionId: "active-B" });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("hangup", "active-B");
    if (ok && challenge.spy.hangupCalls === 0 && dm.spy.hangupCalls === 1) {
      pass("hangup routes to the manager whose ACTIVE sessionId matches the callId");
    } else {
      fail(
        "hangup routes to the right active manager",
        `challenge.hangup=${challenge.spy.hangupCalls}, dm.hangup=${dm.spy.hangupCalls}, dispatch=${ok}`,
      );
    }
  }

  /* ──────────── 9) hangup with no active anywhere → dispatch returns false ─ */
  __resetCallActionRegistry();
  {
    const challenge = makeManager({ incomingSessionId: null, activeSessionId: null });
    const dm = makeManager({ incomingSessionId: null, activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("hangup", "anything");
    if (!ok) {
      pass("hangup with no active session anywhere → dispatch returns false (avoids racing in-flight cleanup)");
    } else {
      fail("hangup with no active session → dispatch returns false");
    }
  }

  /* ──────────── 10) hangup never claimed by a manager that only has an INCOMING invite ─ */
  __resetCallActionRegistry();
  {
    // Mirrors the real bug surface: an "incoming" invite must NOT be
    // hung up via the hangup action; only `decline` ends an invite. If
    // a manager wrongly claims hangup for an incoming invite, the call
    // ends locally but the inviter never sees a decline → infinite ring.
    const dm = makeManager({ incomingSessionId: "invite-X", activeSessionId: null });
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("hangup", "invite-X");
    if (!ok && dm.spy.hangupCalls === 0) {
      pass("Manager with only an INCOMING invite (no active) refuses to claim hangup");
    } else {
      fail(
        "Manager with only an incoming invite refuses to claim hangup",
        `dispatch=${ok}, hangup count=${dm.spy.hangupCalls} — claiming hangup for an invite would silently drop the decline path, leaving the caller ringing forever.`,
      );
    }
  }

  /* ──────────── 11) Dispatch order = registration order ───────────── */
  __resetCallActionRegistry();
  {
    const callOrder: string[] = [];
    const a: CallActionHandler = () => {
      callOrder.push("a");
      return false;
    };
    const b: CallActionHandler = () => {
      callOrder.push("b");
      return false;
    };
    const c: CallActionHandler = () => {
      callOrder.push("c");
      return true;
    };
    const d: CallActionHandler = () => {
      callOrder.push("d");
      return true;
    };
    registerCallActionHandler(a);
    registerCallActionHandler(b);
    registerCallActionHandler(c);
    registerCallActionHandler(d);
    await dispatch("accept");
    if (
      callOrder.length === 3
      && callOrder[0] === "a"
      && callOrder[1] === "b"
      && callOrder[2] === "c"
    ) {
      pass("Handlers are dispatched in registration order and stop at the first claim");
    } else {
      fail("Dispatch order = registration order, stops at first claim", `Got: ${callOrder.join(",")}`);
    }
  }

  /* ──────────── 12) A throwing handler does NOT swallow the action ─── */
  __resetCallActionRegistry();
  {
    const broken: CallActionHandler = () => {
      throw new Error("boom");
    };
    const dm = makeManager({ incomingSessionId: "dm-OK", activeSessionId: null });
    registerCallActionHandler(broken);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("accept", "dm-OK");
    if (ok && dm.spy.acceptCalls === 1) {
      pass("A throwing handler doesn't break the chain — the next manager still gets the action");
    } else {
      fail(
        "A throwing handler doesn't break the chain",
        `dispatch=${ok}, dm.accept=${dm.spy.acceptCalls} — without try/catch around handlers, one broken manager swallows every call action for every other manager.`,
      );
    }
  }

  /* ──────────── 13) Async handlers are awaited (not fire-and-forget) ── */
  __resetCallActionRegistry();
  {
    let acceptCompleted = false;
    const slowHandler: CallActionHandler = async () => {
      await new Promise((r) => setTimeout(r, 30));
      acceptCompleted = true;
      return true;
    };
    registerCallActionHandler(slowHandler);
    const ok = await dispatch("accept", "x");
    if (ok && acceptCompleted) {
      pass("dispatchCallAction awaits async handlers before returning");
    } else {
      fail(
        "dispatchCallAction awaits async handlers",
        `ok=${ok}, completed=${acceptCompleted} — without await, a UI that races a navigation immediately after dispatch can show a stale state.`,
      );
    }
  }

  /* ──────────── 14) Action context with no callId still routes via state ─ */
  __resetCallActionRegistry();
  {
    // PushKit on iOS sometimes delivers actions without an explicit
    // callId payload. In that case the manager that has SOMETHING
    // incoming should claim the action; the others should pass.
    const challenge = makeManager({ incomingSessionId: null, activeSessionId: null });
    const dm = makeManager({ incomingSessionId: "dm-only", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);
    const ok = await dispatch("accept");
    if (ok && challenge.spy.acceptCalls === 0 && dm.spy.acceptCalls === 1) {
      pass("Action without callId → routes to the only manager that has an incoming invite");
    } else {
      fail(
        "Action without callId routes to the manager that has an incoming",
        `challenge.accept=${challenge.spy.acceptCalls}, dm.accept=${dm.spy.acceptCalls}, ok=${ok}`,
      );
    }
  }

  /* ──────────── 15-18b) Manager handler shape & negative-claim guards ─
   *
   * RETIRED. The structural shape of the two real handlers (sessionId
   * guards on the `incoming`/`invite` branches, hangup branches keyed on
   * `activeSessionId`/`active.sessionId`, and the negative claim that
   * neither incoming-only branch swallows a `hangup` action) is now
   * covered behaviourally by `tests/call-actions-react-tree.test.tsx`,
   * which mounts the real `CallSessionProvider` + `PrivateCallLayerProvider`
   * with mocked browser APIs and exercises:
   *
   *   - SW-bridge accept / decline → real `acceptIncoming` / `acceptInvite`
   *     / `declineIncoming` / `rejectInvite` paths in both managers.
   *   - `dispatchCallAction({ action: "hangup", callId })` → real
   *     `useCallSession.hangup` and real `usePrivateCallLayer.endCurrentCall`,
   *     including assertions on the emitted `rtc:end` socket frame and
   *     the `/api/chat/calls/end` HTTP request body.
   *   - Mismatched-callId hangup → both managers refuse to claim and
   *     state stays unchanged (the lock-screen-End-on-the-wrong-call
   *     regression).
   *
   * Replacing the static regex guards with real React-tree behaviour
   * means legitimate refactors of either handler (extracting helpers,
   * swapping if-chains for early returns, switching to a switch
   * statement) no longer break the smoke run, while the actual
   * cross-manager safety property is now tested end-to-end.
   * ────────────────────────────────────────────────────────────────────── */

  /* ──────────── 19) Source guard: dispatchCallAction wraps each handler in try/catch ─ */
  const callActionsSrc = await readText(path.join(REPO_ROOT, "client/src/lib/call-actions.ts"));
  if (
    callActionsSrc
    && /for\s*\(\s*const\s+handler\s+of\s+handlers\s*\)\s*\{\s*try\s*\{[\s\S]{0,200}await\s+handler\(ctx\)/.test(callActionsSrc)
  ) {
    pass("dispatchCallAction wraps each handler in try/catch (a single broken manager can't swallow the action)");
  } else {
    fail("dispatchCallAction wraps each handler in try/catch");
  }

  /* ──────────── 20) Source guard: registerCallActionHandler returns a deregister function ─ */
  if (
    callActionsSrc
    && /registerCallActionHandler[\s\S]{0,160}handlers\.add\(handler\)[\s\S]{0,120}return\s*\(\s*\)\s*=>\s*\{[\s\S]{0,80}handlers\.delete\(handler\)/.test(callActionsSrc)
  ) {
    pass("registerCallActionHandler returns the deregister closure (so React useEffect cleanup works)");
  } else {
    fail("registerCallActionHandler returns the deregister closure");
  }

  /* ──────────── 21) Source guard: CallSessionProvider routes SW broadcasts via dispatchCallAction ─ */
  const providerSrc = await readText(
    path.join(REPO_ROOT, "client/src/components/calls/CallSessionProvider.tsx"),
  );
  if (
    providerSrc
    && /import\s*\{[^}]*dispatchCallAction[^}]*\}\s*from\s*["']@\/lib\/call-actions["']/.test(providerSrc)
    && /dispatchCallAction\s*\(\s*\{/.test(providerSrc)
  ) {
    pass("CallSessionProvider.tsx forwards SW notification clicks via dispatchCallAction (the only entry point)");
  } else {
    fail(
      "CallSessionProvider.tsx forwards SW notification clicks via dispatchCallAction",
      "Without this, push-button taps from the SW notification handler never reach either call manager.",
    );
  }

  /* ──────────── 21b) SW action mapping: "decline" stays "decline", everything else (incl. legacy "open_call") becomes "accept" ─ */
  // If this mapping ever degrades to a single hard-coded "accept", lock-screen
  // "Decline" buttons would silently start a call instead of declining it.
  if (
    providerSrc
    && /===\s*["']decline["']\s*\?\s*["']decline["']\s*:\s*["']accept["']/.test(providerSrc)
  ) {
    pass(`CallSessionProvider.tsx maps SW action with "decline" -> "decline" / fallback -> "accept" (legacy "open_call" still routes correctly)`);
  } else {
    fail(
      `CallSessionProvider.tsx preserves the decline-vs-accept SW action mapping`,
      `If the ternary 'rawAction === "decline" ? "decline" : "accept"' is removed, all notification taps would dispatch the same action — breaking the lock-screen Decline button.`,
    );
  }

  /* ──────────── 22) Source guard: native-call-ui.ts forwards CallKit/Telecom answer & hangup ─ */
  const nativeCallUiSrc = await readText(path.join(REPO_ROOT, "client/src/lib/native-call-ui.ts"));
  if (
    nativeCallUiSrc
    && /dispatchCallAction\s*\(\s*\{[\s\S]{0,200}action:\s*["']accept["']/.test(nativeCallUiSrc)
    && /dispatchCallAction\s*\(\s*\{[\s\S]{0,200}action:\s*["']hangup["']/.test(nativeCallUiSrc)
  ) {
    pass("native-call-ui.ts forwards CallKit/Telecom answer & hangup events through dispatchCallAction");
  } else {
    fail("native-call-ui.ts forwards CallKit answer & hangup events through dispatchCallAction");
  }

  /* ──────────── 22b) Native callEnded path: dispatch decline FIRST, fall back to hangup ─ */
  // Both "Decline while ringing" and "Hang up active call" arrive on the same
  // CallKit / Telecom "callEnded" channel. The bridge MUST try `decline` first
  // (only an incoming-invite manager will claim it) and fall back to `hangup`
  // only if no manager owned the decline. If this order is reversed or the
  // decline branch is dropped, lock-screen Decline on a still-ringing call
  // would silently no-op (because both managers correctly refuse to claim
  // hangup for an invite-only state).
  {
    const callEndedBlock = extractBraceBlock(
      nativeCallUiSrc,
      /addListener\s*\(\s*["']callEnded["']\s*,[\s\S]{0,80}=>\s*\{/,
    );
    // Use plain indexOf on the literal `action: "<name>"` token so the two
    // dispatch sites can never collide on the same starting offset (which
    // is what would happen with a wider [\s\S]{0,N} regex).
    const declineLiteralIdx = callEndedBlock.indexOf('action: "decline"');
    const hangupLiteralIdx = callEndedBlock.indexOf('action: "hangup"');
    if (
      callEndedBlock
      && declineLiteralIdx !== -1
      && hangupLiteralIdx !== -1
      && declineLiteralIdx < hangupLiteralIdx
      && /const\s+handled\s*=\s*await\s+dispatchCallAction\s*\(\s*\{[\s\S]{0,200}action:\s*["']decline["']/.test(callEndedBlock)
      && /if\s*\(\s*handled\s*\)\s*return/.test(callEndedBlock)
      && /await\s+dispatchCallAction\s*\(\s*\{[\s\S]{0,200}action:\s*["']hangup["']/.test(callEndedBlock)
    ) {
      pass("native-call-ui.ts callEnded path dispatches decline first, falls through to hangup only when unclaimed");
    } else {
      fail(
        "native-call-ui.ts callEnded path dispatches decline first, then hangup as fallback",
        "If decline is dropped or reordered, tapping Decline on a still-ringing CallKit screen will silently no-op because both call managers correctly refuse to claim hangup from an invite-only state.",
      );
    }
  }

  /* ──────────── 23) Behavioural: real-world fan-out scenario ─────── */
  __resetCallActionRegistry();
  {
    // Reproduce the actual production wiring: challenge manager
    // registers FIRST (use-call-session mounts at app root), then DM
    // layer mounts when the user opens a chat. Both share the registry.
    const challenge = makeManager({ incomingSessionId: null, activeSessionId: null });
    const dm = makeManager({ incomingSessionId: "dm-call-99", activeSessionId: null });
    registerCallActionHandler(challenge.handler);
    registerCallActionHandler(dm.handler);

    // 1. SW push notification "Accept" tap arrives
    const okAccept = await dispatch("accept", "dm-call-99");
    // 2. ... user taps "Decline" instead later (other notification)
    dm.state.incomingSessionId = "dm-call-100";
    const okDecline = await dispatch("decline", "dm-call-100");
    // 3. ... user taps "Hang up" on an in-progress call
    dm.state.incomingSessionId = null;
    dm.state.activeSessionId = "dm-call-101";
    const okHangup = await dispatch("hangup", "dm-call-101");

    if (
      okAccept && okDecline && okHangup
      && challenge.spy.acceptCalls === 0
      && challenge.spy.declineCalls === 0
      && challenge.spy.hangupCalls === 0
      && dm.spy.acceptCalls === 1
      && dm.spy.declineCalls === 1
      && dm.spy.hangupCalls === 1
    ) {
      pass("End-to-end: 3 sequential SW taps (accept → decline → hangup) all route correctly to the DM manager");
    } else {
      fail(
        "End-to-end SW-tap fan-out routes correctly",
        `accept=${okAccept}/${dm.spy.acceptCalls}, decline=${okDecline}/${dm.spy.declineCalls}, hangup=${okHangup}/${dm.spy.hangupCalls}`,
      );
    }
  }

  /* ──────────── Result ─────────────────────────────────────────────── */
  __resetCallActionRegistry();
  const total = passed + failed;
  if (failed === 0) {
    console.log(`[smoke:call-actions] OK — all ${total} check(s) passed`);
    process.exit(0);
  } else {
    console.log(`[smoke:call-actions] FAIL — ${failed}/${total} check(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke:call-actions] unexpected error", err);
  process.exit(1);
});
