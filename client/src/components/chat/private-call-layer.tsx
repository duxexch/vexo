import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { buildRtcConfiguration } from "@/lib/rtc-config";
import {
  createQueuedEndOperation,
  enqueueChatCallOperation,
  pruneExpiredChatCallOperations,
  readChatCallOperationsQueue,
  writeChatCallOperationsQueue,
  type ChatCallQueuedOperation,
} from "@/lib/chat-call-ops-queue";
import { useToast } from "@/hooks/use-toast";
import { openAppSettings, openMicrophoneSettings } from "@/lib/startup-permissions";
import { Capacitor } from "@capacitor/core";
import { Minimize2, Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff, Loader2, Phone } from "lucide-react";

type CallType = "voice" | "video";
type CallPhase = "idle" | "ringing" | "connecting" | "connected" | "error";

interface InvitePayload {
  sessionId: string;
  callerId: string;
  receiverId: string;
  callType: CallType;
  ratePerMinute: number;
}

interface ActiveCall {
  sessionId: string;
  roomId: string;
  peerUserId: string;
  callType: CallType;
  ratePerMinute: number;
  isCaller: boolean;
  startedAtMs: number;
}

interface StartOutgoingCallInput {
  sessionId: string;
  peerUserId: string;
  callType: CallType;
  ratePerMinute: number;
  isCaller?: boolean;
}

interface MinimizedPosition {
  x: number;
  y: number;
}

interface PrivateCallLayerContextValue {
  startOutgoingCall: (input: StartOutgoingCallInput) => Promise<void>;
  endCurrentCall: () => Promise<void>;
  hasActiveCall: boolean;
  activeSessionId: string | null;
}

const PrivateCallLayerContext = createContext<PrivateCallLayerContextValue | null>(null);

function usePrivateCallLayerContext(): PrivateCallLayerContextValue {
  const context = useContext(PrivateCallLayerContext);
  if (!context) {
    throw new Error("usePrivateCallLayer must be used inside PrivateCallLayerProvider");
  }
  return context;
}

export function usePrivateCallLayer() {
  return usePrivateCallLayerContext();
}

function normalizeRoomId(sessionId: string): string {
  return `private:${sessionId}`;
}

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const CHAT_CALL_STATUS_EVENT = "vex:chat-call-status-changed";
const MINIMIZED_WIDGET_MARGIN = 12;
const MINIMIZED_WIDGET_ESTIMATED_WIDTH = 220;
const MINIMIZED_WIDGET_ESTIMATED_HEIGHT = 58;
const MINIMIZED_WIDGET_BOTTOM_RESERVED = 90;
const CALL_END_OPERATION_TTL_MS = 15 * 60_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function PrivateCallLayerProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [incomingInvite, setIncomingInvite] = useState<InvitePayload | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [tick, setTick] = useState(0);
  const [minimizedPosition, setMinimizedPosition] = useState<MinimizedPosition | null>(null);
  const [isDraggingMinimized, setIsDraggingMinimized] = useState(false);

  const rtcConfiguration = useMemo(() => buildRtcConfiguration(settings?.rtc), [settings?.rtc]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const joinTimeoutRef = useRef<number | null>(null);
  const processingQueuedEndsRef = useRef(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const makingOfferRef = useRef(false);
  const hasRemoteDescriptionRef = useRef(false);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const minimizedCardRef = useRef<HTMLDivElement | null>(null);

  const dragPointerIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<MinimizedPosition>({ x: 0, y: 0 });

  const activeCallRef = useRef<ActiveCall | null>(null);
  const incomingInviteRef = useRef<InvitePayload | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingInviteRef.current = incomingInvite;
  }, [incomingInvite]);

  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const safelySend = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(payload));
  }, []);

  const emitCallStatusChanged = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new CustomEvent(CHAT_CALL_STATUS_EVENT));
  }, []);

  const isRetryableStatusCode = useCallback((statusCode: number): boolean => {
    return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
  }, []);

  const enqueueEndCallRetry = useCallback((sessionId: string) => {
    enqueueChatCallOperation(createQueuedEndOperation({
      sessionId,
      ttlMs: CALL_END_OPERATION_TTL_MS,
    }));
  }, []);

  const getMinimizedBounds = useCallback(() => {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 360;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 640;
    const widgetWidth = minimizedCardRef.current?.offsetWidth || MINIMIZED_WIDGET_ESTIMATED_WIDTH;
    const widgetHeight = minimizedCardRef.current?.offsetHeight || MINIMIZED_WIDGET_ESTIMATED_HEIGHT;

    return {
      minX: MINIMIZED_WIDGET_MARGIN,
      maxX: Math.max(MINIMIZED_WIDGET_MARGIN, viewportWidth - widgetWidth - MINIMIZED_WIDGET_MARGIN),
      minY: MINIMIZED_WIDGET_MARGIN,
      maxY: Math.max(MINIMIZED_WIDGET_MARGIN, viewportHeight - widgetHeight - MINIMIZED_WIDGET_BOTTOM_RESERVED),
    };
  }, []);

  const clampMinimizedPosition = useCallback((position: MinimizedPosition): MinimizedPosition => {
    const bounds = getMinimizedBounds();
    return {
      x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, position.y)),
    };
  }, [getMinimizedBounds]);

  const getDefaultMinimizedPosition = useCallback((): MinimizedPosition => {
    const bounds = getMinimizedBounds();
    return { x: bounds.maxX, y: bounds.maxY };
  }, [getMinimizedBounds]);

  const ensureMinimizedPosition = useCallback(() => {
    setMinimizedPosition((previous) => clampMinimizedPosition(previous || getDefaultMinimizedPosition()));
  }, [clampMinimizedPosition, getDefaultMinimizedPosition]);

  const attachStreams = useCallback(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      void remoteAudioRef.current.play().catch(() => {
        // Ignore autoplay restrictions.
      });
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    hasRemoteDescriptionRef.current = false;
    iceQueueRef.current = [];
    makingOfferRef.current = false;
  }, []);

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  const resetCallUiState = useCallback(() => {
    setPhase("idle");
    setActiveCall(null);
    setIsMinimized(false);
    setIsDraggingMinimized(false);
    setMinimizedPosition(null);
    setIsMicMuted(false);
    setIsCameraEnabled(true);
    dragPointerIdRef.current = null;
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const cleanupAfterCall = useCallback(() => {
    clearJoinTimeout();
    closePeerConnection();
    stopLocalStream();
    resetCallUiState();
  }, [clearJoinTimeout, closePeerConnection, resetCallUiState, stopLocalStream]);

  const processIceQueue = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !hasRemoteDescriptionRef.current) {
      return;
    }

    while (iceQueueRef.current.length > 0) {
      const candidate = iceQueueRef.current.shift();
      if (!candidate) {
        continue;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Keep call running if a stale candidate fails.
      }
    }
  }, []);

  const createPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = new RTCPeerConnection(rtcConfiguration);
    peerConnectionRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      const active = activeCallRef.current;
      if (!active) {
        return;
      }

      const payload = typeof event.candidate.toJSON === "function"
        ? event.candidate.toJSON()
        : {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        };

      safelySend({
        type: "voice_ice_candidate",
        matchId: active.roomId,
        targetUserId,
        candidate: payload,
      });
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        remoteStreamRef.current = stream;
      } else if (event.track) {
        const fallback = remoteStreamRef.current || new MediaStream();
        if (!fallback.getTracks().some((track) => track.id === event.track.id)) {
          fallback.addTrack(event.track);
        }
        remoteStreamRef.current = fallback;
      }

      attachStreams();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        reconnectAttemptsRef.current = 0;
        setPhase("connected");
      }

      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setPhase("error");
      }
    };

    return pc;
  }, [attachStreams, rtcConfiguration, safelySend]);

  const ensureLocalStream = useCallback(async (callType: CallType): Promise<boolean> => {
    const needsVideo = callType === "video";

    if (localStreamRef.current) {
      return true;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      return false;
    }

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: needsVideo,
      });
      setIsCameraEnabled(needsVideo);
      attachStreams();
      return true;
    } catch (error) {
      const errorName = (error as { name?: string } | null)?.name;
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        toast({
          variant: "destructive",
          title: t("challenge.voiceMicPermissionNeeded"),
          description: t("challenge.voiceErrorRetry"),
        });

        void openMicrophoneSettings();
        if (Capacitor.isNativePlatform()) {
          void openAppSettings();
        }
      }
      setPhase("error");
      return false;
    }
  }, [attachStreams, t, toast]);

  const leaveVoiceRoom = useCallback(() => {
    const active = activeCallRef.current;
    if (!active) {
      return;
    }
    safelySend({ type: "voice_leave", matchId: active.roomId });
  }, [safelySend]);

  const joinVoiceRoom = useCallback((roomId: string) => {
    safelySend({ type: "voice_join", matchId: roomId });
    clearJoinTimeout();
    joinTimeoutRef.current = window.setTimeout(() => {
      joinTimeoutRef.current = null;
      if (activeCallRef.current) {
        setPhase("error");
      }
    }, 5000);
  }, [clearJoinTimeout, safelySend]);

  const connectWs = useCallback(() => {
    if (!token) {
      return;
    }

    const current = wsRef.current;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      safelySend({ type: "auth", token });
      if (activeCallRef.current) {
        joinVoiceRoom(activeCallRef.current.roomId);
      }
    };

    ws.onmessage = async (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "private_call_invite") {
        const invite = data as InvitePayload;
        if (user?.id && invite.receiverId === user.id && !activeCallRef.current) {
          setIncomingInvite(invite);
          setPhase("ringing");
          emitCallStatusChanged();
        }
        return;
      }

      if (data.type === "private_call_ended") {
        const sessionId = String(data.sessionId || "");
        if (activeCallRef.current?.sessionId === sessionId) {
          cleanupAfterCall();
        }
        if (incomingInviteRef.current?.sessionId === sessionId) {
          setIncomingInvite(null);
          setPhase("idle");
        }
        emitCallStatusChanged();
        return;
      }

      if (data.type === "voice_error") {
        setPhase("error");
        return;
      }

      const active = activeCallRef.current;
      if (!active) {
        return;
      }

      if (!isNonEmptyString(data.matchId) || data.matchId !== active.roomId) {
        return;
      }

      try {
        if (data.type === "voice_joined") {
          clearJoinTimeout();
          setPhase("connecting");

          const peers = Array.isArray(data.peers) ? data.peers : [];
          const peer = peers.find((entry: any) => entry?.userId === active.peerUserId);
          if (peer && active.isCaller) {
            const pc = createPeerConnection(active.peerUserId);
            if (!makingOfferRef.current && pc.signalingState === "stable") {
              makingOfferRef.current = true;
              const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: active.callType === "video" });
              await pc.setLocalDescription(offer);
              safelySend({
                type: "voice_offer",
                matchId: active.roomId,
                targetUserId: active.peerUserId,
                offer: pc.localDescription,
              });
              makingOfferRef.current = false;
            }
          }
          return;
        }

        if (data.type === "voice_peer_joined") {
          if (active.isCaller && data.peerUserId === active.peerUserId) {
            const pc = createPeerConnection(active.peerUserId);
            if (!makingOfferRef.current && pc.signalingState === "stable") {
              makingOfferRef.current = true;
              const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: active.callType === "video" });
              await pc.setLocalDescription(offer);
              safelySend({
                type: "voice_offer",
                matchId: active.roomId,
                targetUserId: active.peerUserId,
                offer: pc.localDescription,
              });
              makingOfferRef.current = false;
            }
          }
          return;
        }

        if (data.type === "voice_offer" && data.fromUserId === active.peerUserId && data.offer) {
          const pc = createPeerConnection(active.peerUserId);
          const offer = new RTCSessionDescription(data.offer);
          if (pc.signalingState !== "stable") {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }),
              pc.setRemoteDescription(offer),
            ]);
          } else {
            await pc.setRemoteDescription(offer);
          }

          hasRemoteDescriptionRef.current = true;
          await processIceQueue();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          safelySend({
            type: "voice_answer",
            matchId: active.roomId,
            targetUserId: active.peerUserId,
            answer: pc.localDescription,
          });
          return;
        }

        if (data.type === "voice_answer" && data.fromUserId === active.peerUserId && data.answer) {
          const pc = createPeerConnection(active.peerUserId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          hasRemoteDescriptionRef.current = true;
          await processIceQueue();
          return;
        }

        if (data.type === "voice_ice_candidate" && data.fromUserId === active.peerUserId && data.candidate) {
          const candidate = data.candidate as RTCIceCandidateInit;
          const pc = createPeerConnection(active.peerUserId);
          if (hasRemoteDescriptionRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            iceQueueRef.current.push(candidate);
          }
          return;
        }

        if (data.type === "voice_peer_left" && data.peerUserId === active.peerUserId) {
          setPhase("connecting");
        }
      } catch {
        setPhase("error");
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (activeCallRef.current) {
        setPhase("connecting");
        emitCallStatusChanged();
      }

      clearJoinTimeout();

      if (!token) {
        return;
      }

      clearReconnectTimer();
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 7000);
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectWs();
      }, delay);
    };

    ws.onerror = () => {
      if (activeCallRef.current) {
        setPhase("connecting");
      }
    };
  }, [clearJoinTimeout, clearReconnectTimer, cleanupAfterCall, createPeerConnection, emitCallStatusChanged, joinVoiceRoom, processIceQueue, safelySend, token, user?.id]);

  useEffect(() => {
    if (!token) {
      return;
    }

    connectWs();

    return () => {
      clearReconnectTimer();
      clearJoinTimeout();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearJoinTimeout, clearReconnectTimer, connectWs, token]);

  useEffect(() => {
    if (!activeCall?.sessionId) {
      return;
    }

    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.sessionId]);

  useEffect(() => {
    if (!isMinimized) {
      setIsDraggingMinimized(false);
      return;
    }
    ensureMinimizedPosition();
  }, [ensureMinimizedPosition, isMinimized]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setMinimizedPosition((previous) => (previous ? clampMinimizedPosition(previous) : previous));
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [clampMinimizedPosition]);

  const startOutgoingCall = useCallback(async (input: StartOutgoingCallInput) => {
    if (!token) {
      throw new Error("auth_required");
    }

    const ready = await ensureLocalStream(input.callType);
    if (!ready) {
      throw new Error("media_stream_unavailable");
    }

    const nextCall: ActiveCall = {
      sessionId: input.sessionId,
      roomId: normalizeRoomId(input.sessionId),
      peerUserId: input.peerUserId,
      callType: input.callType,
      ratePerMinute: input.ratePerMinute,
      isCaller: input.isCaller ?? true,
      startedAtMs: Date.now(),
    };

    setIncomingInvite(null);
    setActiveCall(nextCall);
    setPhase("connecting");
    emitCallStatusChanged();

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWs();
      return;
    }

    joinVoiceRoom(nextCall.roomId);
  }, [connectWs, emitCallStatusChanged, ensureLocalStream, joinVoiceRoom, token]);

  const acceptInvite = useCallback(async () => {
    const invite = incomingInvite;
    if (!invite) {
      return;
    }

    const ready = await ensureLocalStream(invite.callType);
    if (!ready) {
      return;
    }

    const nextCall: ActiveCall = {
      sessionId: invite.sessionId,
      roomId: normalizeRoomId(invite.sessionId),
      peerUserId: invite.callerId,
      callType: invite.callType,
      ratePerMinute: invite.ratePerMinute,
      isCaller: false,
      startedAtMs: Date.now(),
    };

    setIncomingInvite(null);
    setActiveCall(nextCall);
    setPhase("connecting");
    emitCallStatusChanged();

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWs();
      return;
    }

    joinVoiceRoom(nextCall.roomId);
  }, [connectWs, emitCallStatusChanged, ensureLocalStream, incomingInvite, joinVoiceRoom]);

  const endSessionApi = useCallback(async (sessionId: string) => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/chat/calls/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok && isRetryableStatusCode(response.status)) {
        enqueueEndCallRetry(sessionId);
      }
    } catch {
      enqueueEndCallRetry(sessionId);
    }
  }, [enqueueEndCallRetry, isRetryableStatusCode, token]);

  const processQueuedEndOperations = useCallback(async () => {
    if (!token || processingQueuedEndsRef.current) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    processingQueuedEndsRef.current = true;
    try {
      const now = Date.now();
      const existingQueue = readChatCallOperationsQueue();
      const activeQueue = pruneExpiredChatCallOperations(existingQueue, now);
      const nextQueue: ChatCallQueuedOperation[] = [];

      for (const operation of activeQueue) {
        if (operation.kind !== "end") {
          nextQueue.push(operation);
          continue;
        }

        if (operation.nextRetryAt > now) {
          nextQueue.push(operation);
          continue;
        }

        try {
          const response = await fetch("/api/chat/calls/end", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sessionId: operation.sessionId }),
          });

          if (response.ok) {
            emitCallStatusChanged();
            continue;
          }

          if (isRetryableStatusCode(response.status) && operation.attempts + 1 < 6 && operation.expiresAt > now) {
            const nextAttempt = operation.attempts + 1;
            const retryDelayMs = Math.min(60_000, 2_000 * Math.pow(2, nextAttempt - 1));
            nextQueue.push({
              ...operation,
              attempts: nextAttempt,
              nextRetryAt: now + retryDelayMs,
            });
          }
        } catch {
          if (operation.attempts + 1 < 6 && operation.expiresAt > now) {
            const nextAttempt = operation.attempts + 1;
            const retryDelayMs = Math.min(60_000, 2_000 * Math.pow(2, nextAttempt - 1));
            nextQueue.push({
              ...operation,
              attempts: nextAttempt,
              nextRetryAt: now + retryDelayMs,
            });
          }
        }
      }

      if (nextQueue.length !== activeQueue.length || activeQueue.length !== existingQueue.length) {
        writeChatCallOperationsQueue(nextQueue);
      }
    } finally {
      processingQueuedEndsRef.current = false;
    }
  }, [emitCallStatusChanged, isRetryableStatusCode, token]);

  useEffect(() => {
    void processQueuedEndOperations();
  }, [processQueuedEndOperations]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const handleOnline = () => {
      void processQueuedEndOperations();
    };

    const handleLifecycleResume = () => {
      if (document.visibilityState === "visible") {
        void processQueuedEndOperations();
      }
    };

    const intervalId = window.setInterval(() => {
      void processQueuedEndOperations();
    }, 6000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleLifecycleResume);
    document.addEventListener("visibilitychange", handleLifecycleResume);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleLifecycleResume);
      document.removeEventListener("visibilitychange", handleLifecycleResume);
    };
  }, [processQueuedEndOperations]);

  const rejectInvite = useCallback(async () => {
    if (!incomingInvite?.sessionId) {
      return;
    }

    const sessionId = incomingInvite.sessionId;
    setIncomingInvite(null);
    setPhase("idle");
    await endSessionApi(sessionId);
    emitCallStatusChanged();
  }, [emitCallStatusChanged, endSessionApi, incomingInvite]);

  const endCurrentCall = useCallback(async () => {
    const active = activeCallRef.current;
    if (!active) {
      return;
    }

    leaveVoiceRoom();
    cleanupAfterCall();
    await endSessionApi(active.sessionId);
    emitCallStatusChanged();
  }, [cleanupAfterCall, emitCallStatusChanged, endSessionApi, leaveVoiceRoom]);

  const minimizeCallWidget = useCallback(() => {
    setIsMinimized(true);
    ensureMinimizedPosition();
  }, [ensureMinimizedPosition]);

  const expandCallWidget = useCallback(() => {
    setIsDraggingMinimized(false);
    setIsMinimized(false);
  }, []);

  const handleMinimizedPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMinimized) {
      return;
    }

    const start = minimizedPosition || getDefaultMinimizedPosition();
    if (!minimizedPosition) {
      setMinimizedPosition(start);
    }

    dragPointerIdRef.current = event.pointerId;
    dragOffsetRef.current = {
      x: event.clientX - start.x,
      y: event.clientY - start.y,
    };

    setIsDraggingMinimized(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getDefaultMinimizedPosition, isMinimized, minimizedPosition]);

  const handleMinimizedPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMinimized || dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    const nextPosition = clampMinimizedPosition({
      x: event.clientX - dragOffsetRef.current.x,
      y: event.clientY - dragOffsetRef.current.y,
    });

    setMinimizedPosition(nextPosition);
  }, [clampMinimizedPosition, isMinimized]);

  const handleMinimizedPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    dragPointerIdRef.current = null;
    setIsDraggingMinimized(false);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore stale pointer capture releases.
    }
  }, []);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });
  }, [isMicMuted]);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = isCameraEnabled;
    });
  }, [isCameraEnabled]);

  const elapsedLabel = useMemo(() => {
    if (!activeCall) {
      return "00:00";
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - activeCall.startedAtMs) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activeCall, tick]);

  const estimatedCost = useMemo(() => {
    if (!activeCall) {
      return 0;
    }

    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - activeCall.startedAtMs) / 1000));
    const minutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
    return Number((minutes * activeCall.ratePerMinute).toFixed(2));
  }, [activeCall, tick]);

  const phaseLabel = useMemo(() => {
    if (phase === "connected") {
      return t("challenge.voiceConnected");
    }
    if (phase === "connecting") {
      return t("challenge.voiceConnecting");
    }
    if (phase === "error") {
      return t("challenge.voiceErrorRetry");
    }
    return t("common.loading");
  }, [phase, t]);

  const contextValue = useMemo<PrivateCallLayerContextValue>(() => ({
    startOutgoingCall,
    endCurrentCall,
    hasActiveCall: !!activeCall,
    activeSessionId: activeCall?.sessionId || null,
  }), [activeCall, endCurrentCall, startOutgoingCall]);

  return (
    <PrivateCallLayerContext.Provider value={contextValue}>
      {children}

      {incomingInvite && !activeCall && (
        <div className="fixed inset-x-3 top-20 z-[120] mx-auto max-w-md rounded-3xl border border-sky-200 bg-white/95 p-4 shadow-[0_24px_60px_-24px_rgba(2,132,199,0.55)] backdrop-blur dark:border-sky-900 dark:bg-slate-950/95">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {incomingInvite.callType === "video" ? t("chat.video") : t("challenge.voiceStart")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {phase === "ringing" ? t("challenge.voiceConnecting") : t("common.loading")}
              </p>
            </div>
            <Badge variant="outline" className="h-7 rounded-full px-3 text-xs">
              {incomingInvite.ratePerMinute}
            </Badge>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px] rounded-2xl"
              onClick={() => void rejectInvite()}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="min-h-[44px] rounded-2xl bg-sky-600 text-white hover:bg-sky-500"
              onClick={() => void acceptInvite()}
            >
              {t("common.accept")}
            </Button>
          </div>
        </div>
      )}

      {activeCall && (
        <div
          className={isMinimized
            ? "fixed z-[120] transition-transform duration-200 ease-out"
            : "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] end-3 z-[120] w-[min(94vw,380px)]"
          }
          style={isMinimized ? { left: minimizedPosition?.x ?? MINIMIZED_WIDGET_MARGIN, top: minimizedPosition?.y ?? MINIMIZED_WIDGET_MARGIN } : undefined}
        >
          {isMinimized ? (
            <div ref={minimizedCardRef} className={`rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.55)] backdrop-blur transition-transform duration-150 dark:border-slate-800 dark:bg-slate-950/95 ${isDraggingMinimized ? "scale-[1.03]" : "scale-100"}`}>
              <div className="flex items-center gap-2">
                <div
                  className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-2 touch-none active:cursor-grabbing"
                  onPointerDown={handleMinimizedPointerDown}
                  onPointerMove={handleMinimizedPointerMove}
                  onPointerUp={handleMinimizedPointerUp}
                  onPointerCancel={handleMinimizedPointerUp}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white">
                    {activeCall.callType === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{elapsedLabel}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{phaseLabel} | ~ {estimatedCost}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={expandCallWidget}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => void endCurrentCall()}>
                  <PhoneOff className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_32px_80px_-30px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
              <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold">
                    {activeCall.callType === "video" ? t("chat.video") : t("challenge.voiceStart")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {phaseLabel}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{elapsedLabel}</p>
                  <p className="text-[11px] text-muted-foreground">~ {estimatedCost}</p>
                </div>
              </div>

              <div className="relative aspect-[4/5] bg-slate-900">
                {activeCall.callType === "video" ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="h-full w-full object-cover"
                    />
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute bottom-3 end-3 h-24 w-16 rounded-xl border border-white/30 object-cover shadow-lg"
                    />
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="rounded-full bg-white/10 p-6 text-white">
                      <Phone className="h-8 w-8" />
                    </div>
                    <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2 p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={isMicMuted ? "destructive" : "outline"}
                      className="min-h-[44px] rounded-2xl"
                      onClick={() => setIsMicMuted((value) => !value)}
                    >
                      {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isMicMuted ? t("challenge.voiceUnmuteMic") : t("challenge.voiceMuteMic")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={isCameraEnabled ? "outline" : "destructive"}
                      className="min-h-[44px] rounded-2xl"
                      disabled={activeCall.callType !== "video"}
                      onClick={() => setIsCameraEnabled((value) => !value)}
                    >
                      {isCameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("chat.video")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] rounded-2xl"
                      onClick={minimizeCallWidget}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("common.back")}</TooltipContent>
                </Tooltip>

                <div className="col-span-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-[44px] w-full rounded-2xl"
                    onClick={() => void endCurrentCall()}
                  >
                    {phase === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PrivateCallLayerContext.Provider>
  );
}
