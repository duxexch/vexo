import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useCallSession, type UseCallSessionReturn } from "@/hooks/use-call-session";
import { CallModal } from "./CallModal";

const CallSessionContext = createContext<UseCallSessionReturn | null>(null);

/**
 * App-wide owner of the Socket.IO call session.
 *
 * Mounting this once at the authenticated layout means a single
 * `useCallSession()` instance receives `rtc:incoming` from anywhere in the
 * app, and the `<CallModal>` ringer renders on every page — lobby, profile,
 * other games, etc. — not just inside `challenge-game`.
 *
 * Children that need to start outgoing calls or read state should call
 * `useCall()` instead of `useCallSession()` directly, otherwise they'd open
 * a second peer connection and double-handle signaling.
 */
export function CallSessionProvider({ children }: { children: ReactNode }) {
  const call = useCallSession();
  const [location, navigate] = useLocation();

  const preAcceptLocationRef = useRef<string | null>(null);
  const prevStatusRef = useRef(call.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const next = call.status;
    prevStatusRef.current = next;

    // Remember where the user was the moment they accepted an inbound call,
    // so we can return them after hangup. Only record on the inbound path —
    // outbound calls stay on the page that initiated them.
    if (prev === "ringing-in" && (next === "connecting" || next === "connected")) {
      preAcceptLocationRef.current = location;
    }

    // Restore prior location once the call wraps up. We only navigate when
    // we actually have a stored origin (inbound accept path); outbound
    // hangups stay where they are.
    if ((next === "ended" || next === "idle") && preAcceptLocationRef.current) {
      const target = preAcceptLocationRef.current;
      preAcceptLocationRef.current = null;
      if (target && target !== location) navigate(target);
    }
  }, [call.status, location, navigate]);

  return (
    <CallSessionContext.Provider value={call}>
      {children}
      <CallModal call={call} />
    </CallSessionContext.Provider>
  );
}

export function useCall(): UseCallSessionReturn {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error("useCall must be used inside <CallSessionProvider>");
  }
  return ctx;
}
