import { useCallback, useEffect, useRef, useState } from "react";
import { getRtcSocket } from "@/lib/socket-io-client";
import type { CallTier, CallType, IceServersResponse } from "@shared/socketio-events";

export type CallStatus =
  | "idle"
  | "ringing-out"
  | "ringing-in"
  | "connecting"
  | "connected"
  | "ended"
  | "failed";

export interface IncomingCallInfo {
  sessionId: string;
  fromUserId: string;
  fromUsername: string;
  callType: CallType;
}

export interface UseCallSessionReturn {
  status: CallStatus;
  tier: CallTier;
  callType: CallType | null;
  incoming: IncomingCallInfo | null;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  muted: boolean;
  videoEnabled: boolean;
  startCall: (toUserId: string, callType: CallType, context?: { challengeId?: string }) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  hangup: (reason?: string) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

interface CallContext {
  sessionId: string;
  peerUserId: string;
  callType: CallType;
  pc: RTCPeerConnection;
  isCaller: boolean;
}

async function fetchIceServers(): Promise<IceServersResponse> {
  const res = await fetch("/api/rtc/ice-servers", { credentials: "include" });
  if (!res.ok) throw new Error(`ice-servers failed: ${res.status}`);
  return (await res.json()) as IceServersResponse;
}

/**
 * Single-call session manager.
 *
 * Implements the 3-tier fallback contract:
 *   1. p2p     — direct peer-to-peer (host/srflx candidates)
 *   2. relay   — TURN-relayed media (relay candidates)
 *   3. text-only — both ICE attempts failed; signal partner and degrade
 *
 * Tier is inferred from `pc.iceConnectionState` + chosen candidate pair.
 */
export function useCallSession(): UseCallSessionReturn {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [tier, setTier] = useState<CallTier>("p2p");
  const [callType, setCallType] = useState<CallType | null>(null);
  const [incoming, setIncoming] = useState<IncomingCallInfo | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const ctxRef = useRef<CallContext | null>(null);
  const pendingRemoteIceRef = useRef<RTCIceCandidateInit[]>([]);
  const tierTimerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) {
      try { ctx.pc.close(); } catch { /* ignore */ }
    }
    if (tierTimerRef.current) {
      window.clearTimeout(tierTimerRef.current);
      tierTimerRef.current = null;
    }
    ctxRef.current = null;
    pendingRemoteIceRef.current = [];
    setLocalStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; });
    setRemoteStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; });
  }, []);

  const announceTier = useCallback((sessionId: string, nextTier: CallTier) => {
    setTier(nextTier);
    try { getRtcSocket().emit("rtc:tier", { sessionId, tier: nextTier }); } catch { /* ignore */ }
  }, []);

  const buildPeerConnection = useCallback(
    async (sessionId: string, peerUserId: string): Promise<RTCPeerConnection> => {
      const ice = await fetchIceServers();
      const pc = new RTCPeerConnection({
        iceServers: ice.iceServers,
        iceTransportPolicy: "all",
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          getRtcSocket().emit("rtc:ice", {
            sessionId,
            toUserId: peerUserId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setRemoteStream(stream);
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === "connected" || s === "completed") {
          setStatus("connected");
          // Determine relay vs p2p from selected candidate pair
          void inferTierFromPc(pc).then((t) => {
            if (ctxRef.current?.sessionId === sessionId) announceTier(sessionId, t);
          });
        } else if (s === "failed") {
          // ICE fully failed — degrade to text-only
          if (ctxRef.current?.sessionId === sessionId) {
            announceTier(sessionId, "text-only");
            setStatus("failed");
          }
        }
      };

      // 12-second hard timer: if not connected, degrade
      tierTimerRef.current = window.setTimeout(() => {
        if (ctxRef.current?.sessionId === sessionId && pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
          announceTier(sessionId, "text-only");
          setStatus("failed");
        }
      }, 12_000);

      return pc;
    },
    [announceTier],
  );

  const attachLocalMedia = useCallback(async (pc: RTCPeerConnection, type: CallType): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    setLocalStream(stream);
    return stream;
  }, []);

  const flushPendingIce = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const queued = pendingRemoteIceRef.current.splice(0);
    for (const cand of queued) {
      try { await ctx.pc.addIceCandidate(cand); } catch { /* ignore */ }
    }
  }, []);

  /* --------------------- listen for inbound signaling --------------------- */
  useEffect(() => {
    const sock = getRtcSocket();

    const onIncoming = (p: { sessionId: string; fromUserId: string; fromUsername: string; callType: CallType }) => {
      // Reject if already on a call
      if (ctxRef.current) {
        sock.emit("rtc:end", { sessionId: p.sessionId, reason: "busy" });
        return;
      }
      setIncoming({ sessionId: p.sessionId, fromUserId: p.fromUserId, fromUsername: p.fromUsername, callType: p.callType });
      setCallType(p.callType);
      setStatus("ringing-in");
    };

    const onSdp = async (p: { sessionId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.sessionId !== p.sessionId) return;
      await ctx.pc.setRemoteDescription(p.sdp);
      if (p.sdp.type === "offer") {
        const answer = await ctx.pc.createAnswer();
        await ctx.pc.setLocalDescription(answer);
        sock.emit("rtc:sdp", { sessionId: p.sessionId, toUserId: p.fromUserId, sdp: answer });
      }
      await flushPendingIce();
    };

    const onIce = async (p: { sessionId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.sessionId !== p.sessionId) return;
      if (!ctx.pc.remoteDescription) {
        pendingRemoteIceRef.current.push(p.candidate);
        return;
      }
      try { await ctx.pc.addIceCandidate(p.candidate); } catch { /* ignore */ }
    };

    const onEnded = (p: { sessionId: string; fromUserId: string; reason?: string }) => {
      // Caller cancelled / timed out while we were still ringing (the user
      // never accepted). Clear the inbound invite *and* reset status so the
      // CallModal closes and we return to the page they were on.
      if (incoming?.sessionId === p.sessionId) {
        setIncoming(null);
        if (!ctxRef.current) setStatus("ended");
      }
      // Active/accepted call ended on the wire — tear down the peer.
      if (ctxRef.current?.sessionId === p.sessionId) {
        setStatus("ended");
        cleanup();
      }
    };

    const onTier = (p: { sessionId: string; fromUserId: string; tier: CallTier }) => {
      if (ctxRef.current?.sessionId === p.sessionId) setTier(p.tier);
    };

    sock.on("rtc:incoming", onIncoming);
    sock.on("rtc:sdp", onSdp);
    sock.on("rtc:ice", onIce);
    sock.on("rtc:ended", onEnded);
    sock.on("rtc:tier", onTier);

    return () => {
      sock.off("rtc:incoming", onIncoming);
      sock.off("rtc:sdp", onSdp);
      sock.off("rtc:ice", onIce);
      sock.off("rtc:ended", onEnded);
      sock.off("rtc:tier", onTier);
    };
  }, [cleanup, flushPendingIce, incoming]);

  /* ----------------------------- public API ------------------------------ */

  const startCall = useCallback(
    async (toUserId: string, type: CallType, context?: { challengeId?: string }) => {
      if (ctxRef.current) throw new Error("already_in_call");
      const sessionId = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
      const sock = getRtcSocket();
      setCallType(type);
      setStatus("ringing-out");

      const pc = await buildPeerConnection(sessionId, toUserId);
      ctxRef.current = { sessionId, peerUserId: toUserId, callType: type, pc, isCaller: true };

      // Acquire mic/camera. If the user denies permission (or no device
      // exists), bail out gracefully and surface 'failed' so the UI can
      // fall back to text-only chat.
      try {
        await attachLocalMedia(pc, type);
      } catch (err) {
        setStatus("failed");
        announceTier(sessionId, "text-only");
        cleanup();
        throw err instanceof Error ? err : new Error("media_unavailable");
      }

      sock.emit("rtc:invite", { sessionId, toUserId, callType: type, context }, async (res) => {
        if (!res?.ok) {
          setStatus("failed");
          cleanup();
          return;
        }
        setStatus("connecting");
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sock.emit("rtc:sdp", { sessionId, toUserId, sdp: offer });
        } catch {
          sock.emit("rtc:end", { sessionId, reason: "sdp_failed" });
          setStatus("failed");
          cleanup();
        }
      });
    },
    [announceTier, attachLocalMedia, buildPeerConnection, cleanup],
  );

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    const { sessionId, fromUserId, callType: type } = incoming;
    const sock = getRtcSocket();
    setStatus("connecting");

    const pc = await buildPeerConnection(sessionId, fromUserId);
    ctxRef.current = { sessionId, peerUserId: fromUserId, callType: type, pc, isCaller: false };

    try {
      await attachLocalMedia(pc, type);
    } catch (err) {
      // Permission denied / no device — decline the call deterministically
      sock.emit("rtc:end", { sessionId, reason: "media_denied" });
      setStatus("failed");
      announceTier(sessionId, "text-only");
      cleanup();
      setIncoming(null);
      throw err instanceof Error ? err : new Error("media_unavailable");
    }

    setIncoming(null);
    // Caller will send the SDP offer next; the listener handles it.
  }, [announceTier, attachLocalMedia, buildPeerConnection, cleanup, incoming]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    // Include `toUserId` so the server can directly notify the caller even
    // before any SDP has been exchanged (caller is in the call room, but
    // belt-and-suspenders for pre-SDP cancellation).
    getRtcSocket().emit("rtc:end", {
      sessionId: incoming.sessionId,
      reason: "declined",
      toUserId: incoming.fromUserId,
    });
    setIncoming(null);
    setStatus("idle");
  }, [incoming]);

  const hangup = useCallback(
    (reason?: string) => {
      const ctx = ctxRef.current;
      if (ctx) {
        // Include the explicit peer for ringing-state cancellations where the
        // callee may not yet have joined the per-call room.
        getRtcSocket().emit("rtc:end", {
          sessionId: ctx.sessionId,
          reason: reason || "hangup",
          toUserId: ctx.peerUserId,
        });
      } else if (incoming) {
        getRtcSocket().emit("rtc:end", {
          sessionId: incoming.sessionId,
          reason: reason || "hangup",
          toUserId: incoming.fromUserId,
        });
        setIncoming(null);
      }
      setStatus("ended");
      cleanup();
    },
    [cleanup, incoming],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    setVideoEnabled((v) => {
      const next = !v;
      localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    status,
    tier,
    callType,
    incoming,
    remoteStream,
    localStream,
    muted,
    videoEnabled,
    startCall,
    acceptIncoming,
    declineIncoming,
    hangup,
    toggleMute,
    toggleVideo,
  };
}

async function inferTierFromPc(pc: RTCPeerConnection): Promise<CallTier> {
  try {
    const stats = await pc.getStats();
    let selectedPairId: string | undefined;
    stats.forEach((report: { type?: string; selected?: boolean; nominated?: boolean; id?: string }) => {
      if (report.type === "candidate-pair" && (report.selected || report.nominated)) {
        selectedPairId = report.id;
      }
    });
    if (!selectedPairId) return "p2p";
    const pair = stats.get(selectedPairId) as { localCandidateId?: string; remoteCandidateId?: string } | undefined;
    if (!pair) return "p2p";
    const local = stats.get(pair.localCandidateId || "") as { candidateType?: string } | undefined;
    const remote = stats.get(pair.remoteCandidateId || "") as { candidateType?: string } | undefined;
    if (local?.candidateType === "relay" || remote?.candidateType === "relay") return "relay";
    return "p2p";
  } catch {
    return "p2p";
  }
}
