import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { buildRtcConfiguration } from "@/lib/rtc-config";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { openMicrophoneSettings } from "@/lib/startup-permissions";
import { ensureCallRationale } from "@/lib/call-permission-rationale";
import { Capacitor } from "@capacitor/core";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceChatProps {
  challengeId: string;
  isEnabled: boolean;
  onToggle: () => void;
  isMicMuted: boolean;
  onMicMuteToggle: () => void;
  role?: "player" | "spectator";
  showInlineControls?: boolean;
  peerAudioMutedOverride?: Record<string, boolean>;
  onConnectedPeersChange?: (peerUserIds: string[]) => void;
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

type VoicePeerRole = "player" | "spectator";

type VoiceWsMessage = {
  type: string;
  error?: string;
  code?: string;
  details?: {
    requiredRate?: number;
    walletBalance?: number;
    [key: string]: unknown;
  };
  timestamp?: number;
  peers?: Array<{ userId: string; role?: VoicePeerRole }>;
  peerUserId?: string;
  fromUserId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 25_000;
const JOIN_ACK_TIMEOUT_MS = 4_000;
const VOICE_REJOIN_THROTTLE_MS = 1_500;

export function VoiceChat({
  challengeId,
  isEnabled,
  onToggle: _onToggle,
  isMicMuted,
  onMicMuteToggle,
  role = "player",
  showInlineControls = true,
  peerAudioMutedOverride,
  onConnectedPeersChange,
}: VoiceChatProps) {
  const { token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const { settings } = useSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  // Tracks the most recent voice_error so the mic-icon tooltip can surface
  // the actual reason (pricing gate vs. not a participant vs. generic) instead
  // of a generic "tap to retry" hint.
  const [lastVoiceErrorCode, setLastVoiceErrorCode] = useState<"pricing_gate" | "not_participant" | "other" | null>(null);
  const [lastVoiceErrorRequiredRate, setLastVoiceErrorRequiredRate] = useState<number | null>(null);
  const [peerOrder, setPeerOrder] = useState<string[]>([]);
  const [peerRoles, setPeerRoles] = useState<Record<string, VoicePeerRole>>({});
  const [peerAudioMuted, setPeerAudioMuted] = useState<Record<string, boolean>>({});
  const isSpectatorRole = role === "spectator";
  const effectivePeerAudioMuted = peerAudioMutedOverride ?? peerAudioMuted;

  const rtcConfiguration = useMemo(
    () => buildRtcConfiguration(settings?.rtc),
    [settings?.rtc],
  );

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferPeersRef = useRef<Set<string>>(new Set());
  const remoteDescriptionPeersRef = useRef<Set<string>>(new Set());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const joinAckTimerRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastPongAtRef = useRef(0);
  const lastVoiceRejoinAttemptAtRef = useRef(0);
  const isAuthenticatedRef = useRef(false);
  const suppressReconnectOnCloseRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const startingRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearJoinAckTimer = useCallback(() => {
    if (joinAckTimerRef.current !== null) {
      window.clearTimeout(joinAckTimerRef.current);
      joinAckTimerRef.current = null;
    }
  }, []);

  const clearHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const isFatalVoiceError = useCallback((errorType: string, errorMessage?: string): boolean => {
    if (errorType === "auth_error") {
      return true;
    }

    const normalized = String(errorMessage || "").toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      normalized.includes("not authorized for this match")
      || normalized.includes("insufficient project currency balance for challenge voice")
      || normalized.includes("invalid room identifier")
    );
  }, []);

  const syncPeerAudioElement = useCallback((peerUserId: string) => {
    const element = remoteAudioElementsRef.current.get(peerUserId);
    const stream = remoteStreamsRef.current.get(peerUserId);
    if (!element || !stream) {
      return;
    }

    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }

    const muted = !!effectivePeerAudioMuted[peerUserId];
    element.muted = muted;
    element.volume = muted ? 0 : 1;

    if (!muted) {
      void element.play().catch(() => {
        // Autoplay may be blocked on some browsers.
      });
    }
  }, [effectivePeerAudioMuted]);

  const upsertPeer = useCallback((peerUserId: string, peerRole?: VoicePeerRole) => {
    setPeerOrder((previous) => (previous.includes(peerUserId) ? previous : [...previous, peerUserId]));
    if (peerRole) {
      setPeerRoles((previous) => ({ ...previous, [peerUserId]: peerRole }));
    }
    setPeerAudioMuted((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, peerUserId)) {
        return previous;
      }
      return { ...previous, [peerUserId]: false };
    });
  }, []);

  const removePeer = useCallback((peerUserId: string) => {
    setPeerOrder((previous) => previous.filter((id) => id !== peerUserId));
    setPeerRoles((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, peerUserId)) {
        return previous;
      }

      const { [peerUserId]: _removed, ...next } = previous;
      return next;
    });
    setPeerAudioMuted((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, peerUserId)) {
        return previous;
      }

      const { [peerUserId]: _removed, ...next } = previous;
      return next;
    });
    remoteStreamsRef.current.delete(peerUserId);
    remoteAudioElementsRef.current.delete(peerUserId);
  }, []);

  const closePeerConnection = useCallback((peerUserId: string) => {
    const pc = peerConnectionsRef.current.get(peerUserId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerUserId);
    }

    makingOfferPeersRef.current.delete(peerUserId);
    remoteDescriptionPeersRef.current.delete(peerUserId);
    iceCandidateQueueRef.current.delete(peerUserId);
    removePeer(peerUserId);
  }, [removePeer]);

  const closeAllPeerConnections = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((peerUserId) => {
      closePeerConnection(peerUserId);
    });
    peerConnectionsRef.current.clear();
    makingOfferPeersRef.current.clear();
    remoteDescriptionPeersRef.current.clear();
    iceCandidateQueueRef.current.clear();
  }, [closePeerConnection]);

  const safelySend = useCallback((payload: Record<string, unknown>) => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    } catch (error) {
      console.error("[VoiceChat] Failed to send WS message", error);
    }
  }, []);

  const scheduleJoinAckTimeout = useCallback(() => {
    clearJoinAckTimer();
    joinAckTimerRef.current = window.setTimeout(() => {
      joinAckTimerRef.current = null;
      if (!intentionalStopRef.current && isEnabled) {
        toast({
          variant: "destructive",
          title: t("challenge.voiceErrorRetry"),
          description: t("challenge.voiceRtcNetworkHint"),
        });
        setConnectionState("error");
        const socket = wsRef.current;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          socket.close();
        }
      }
    }, JOIN_ACK_TIMEOUT_MS);
  }, [clearJoinAckTimer, isEnabled, t, toast]);

  const attemptVoiceRoomRejoin = useCallback(() => {
    if (!isAuthenticatedRef.current || intentionalStopRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastVoiceRejoinAttemptAtRef.current < VOICE_REJOIN_THROTTLE_MS) {
      return;
    }

    lastVoiceRejoinAttemptAtRef.current = now;
    setConnectionState("connecting");
    safelySend({ type: "voice_join", matchId: challengeId });
    scheduleJoinAckTimeout();
  }, [challengeId, safelySend, scheduleJoinAckTimeout]);

  const startHeartbeat = useCallback(() => {
    clearHeartbeatInterval();
    lastPongAtRef.current = Date.now();

    heartbeatIntervalRef.current = window.setInterval(() => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !isAuthenticatedRef.current) {
        return;
      }

      if (Date.now() - lastPongAtRef.current > HEARTBEAT_TIMEOUT_MS) {
        if (!intentionalStopRef.current) {
          setConnectionState("error");
        }
        socket.close();
        return;
      }

      safelySend({
        type: "voice_ping",
        matchId: challengeId,
        timestamp: Date.now(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  }, [challengeId, clearHeartbeatInterval, safelySend]);

  const processQueuedIceCandidates = useCallback(async (peerUserId: string) => {
    const pc = peerConnectionsRef.current.get(peerUserId);
    if (!pc || !remoteDescriptionPeersRef.current.has(peerUserId)) {
      return;
    }

    const queue = iceCandidateQueueRef.current.get(peerUserId) || [];
    while (queue.length > 0) {
      const queued = queue.shift();
      if (!queued) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(queued));
      } catch (error) {
        console.error("[VoiceChat] Failed to process queued ICE candidate", error);
      }
    }

    iceCandidateQueueRef.current.set(peerUserId, queue);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!isEnabled || intentionalStopRef.current) {
      return;
    }

    clearReconnectTimer();
    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current += 1;
    const delayMs = Math.min(1000 * Math.pow(2, attempt), 7000);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isEnabled && !intentionalStopRef.current) {
        setConnectionState("disconnected");
      }
    }, delayMs);
  }, [clearReconnectTimer, isEnabled]);

  const showMicPermissionToast = useCallback(() => {
    const openSettingsLabel = t("permissions.gate.openSettings") || t("common.retry");

    toast({
      variant: "destructive",
      title: t("challenge.voiceMicPermissionNeeded"),
      description: t("challenge.voiceMicPermissionHint"),
      action: (
        <ToastAction
          altText={openSettingsLabel}
          onClick={() => {
            void openMicrophoneSettings();
          }}
        >
          {openSettingsLabel}
        </ToastAction>
      ),
    });
  }, [openMicrophoneSettings, t, toast]);

  const isPermissionDeniedError = useCallback((error: unknown): boolean => {
    const candidate = error as { name?: string } | null;
    const name = typeof candidate?.name === "string" ? candidate.name : "";
    return ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name);
  }, []);

  const acquireMicrophoneStream = useCallback(async (): Promise<MediaStream> => {
    const preferredConstraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 },
      },
      video: false,
    };

    try {
      return await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (primaryError) {
      // Some Android devices reject advanced audio constraints; retry with minimal audio request.
      if (!isPermissionDeniedError(primaryError)) {
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      throw primaryError;
    }
  }, [isPermissionDeniedError]);

  const ensureLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (isSpectatorRole) {
      return null;
    }

    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showMicPermissionToast();
      setConnectionState("error");
      return null;
    }

    // Show the in-app rationale before triggering the OS / WebView mic prompt.
    // On native Android the WebView occasionally drops getUserMedia silently
    // when the rationale modal hasn't been acknowledged.
    const rationaleDecision = await ensureCallRationale("voice");
    if (rationaleDecision === "dismiss") {
      showMicPermissionToast();
      setConnectionState("error");
      return null;
    }

    let stream: MediaStream;
    try {
      stream = await acquireMicrophoneStream();
    } catch (error) {
      console.error("[VoiceChat] Failed to access microphone", error);

      if (isPermissionDeniedError(error)) {
        showMicPermissionToast();

        // After OS-level denial, force-render the in-app rationale modal so
        // the user gets the explicit Open Settings action (matches the
        // established pattern in use-call-session.tsx). The modal itself
        // handles native-vs-web settings handoff; we no longer jump straight
        // to openAppSettings() because that bypasses the modal explanation.
        void ensureCallRationale("voice", { force: true });
      } else {
        toast({
          variant: "destructive",
          title: t("challenge.voiceErrorRetry"),
          description: t("challenge.voiceRtcNetworkHint"),
        });
      }

      setConnectionState("error");
      return null;
    }

    localStreamRef.current = stream;
    return stream;
  }, [
    acquireMicrophoneStream,
    isPermissionDeniedError,
    isSpectatorRole,
    showMicPermissionToast,
    t,
    toast,
  ]);

  const createPeerConnection = useCallback((peerUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(peerUserId);
    if (existing) {
      return existing;
    }

    upsertPeer(peerUserId);

    const pc = new RTCPeerConnection(rtcConfiguration);
    peerConnectionsRef.current.set(peerUserId, pc);

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.enabled = !isMicMuted;
        pc.addTrack(track, localStream);
      });
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && isAuthenticatedRef.current) {
        const serializedCandidate =
          typeof event.candidate.toJSON === "function"
            ? event.candidate.toJSON()
            : {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            };

        safelySend({
          type: "voice_ice_candidate",
          matchId: challengeId,
          targetUserId: peerUserId,
          candidate: serializedCandidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [firstStream] = event.streams;
      if (firstStream) {
        remoteStreamsRef.current.set(peerUserId, firstStream);
      } else if (event.track) {
        const fallbackStream = remoteStreamsRef.current.get(peerUserId) || new MediaStream();
        if (!fallbackStream.getTracks().some((track) => track.id === event.track.id)) {
          fallbackStream.addTrack(event.track);
        }
        remoteStreamsRef.current.set(peerUserId, fallbackStream);
      }

      syncPeerAudioElement(peerUserId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setConnectionState("connected");
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        closePeerConnection(peerUserId);
      }
    };

    return pc;
  }, [challengeId, clearReconnectTimer, closePeerConnection, isMicMuted, rtcConfiguration, safelySend, syncPeerAudioElement, upsertPeer]);

  const initiateOfferToPeer = useCallback(async (peerUserId: string) => {
    const pc = createPeerConnection(peerUserId);
    if (makingOfferPeersRef.current.has(peerUserId)) {
      return;
    }

    if (pc.signalingState !== "stable") {
      return;
    }

    makingOfferPeersRef.current.add(peerUserId);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      if (pc.signalingState !== "stable") {
        return;
      }
      await pc.setLocalDescription(offer);
      safelySend({
        type: "voice_offer",
        matchId: challengeId,
        targetUserId: peerUserId,
        offer: pc.localDescription,
      });
    } finally {
      makingOfferPeersRef.current.delete(peerUserId);
    }
  }, [challengeId, createPeerConnection, safelySend]);

  const stopVoiceChat = useCallback(() => {
    clearReconnectTimer();
    clearJoinAckTimer();
    clearHeartbeatInterval();
    suppressReconnectOnCloseRef.current = true;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      safelySend({ type: "voice_leave", matchId: challengeId });
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    closeAllPeerConnections();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    remoteStreamsRef.current.clear();
    remoteAudioElementsRef.current.clear();
    setPeerOrder([]);
    setPeerRoles({});
    setPeerAudioMuted({});

    isAuthenticatedRef.current = false;
    startingRef.current = false;
    suppressReconnectOnCloseRef.current = false;
    setConnectionState("disconnected");
  }, [challengeId, clearHeartbeatInterval, clearJoinAckTimer, clearReconnectTimer, closeAllPeerConnections, safelySend]);

  const startVoiceChat = useCallback(async () => {
    if (startingRef.current) {
      return;
    }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!token) {
      setConnectionState("error");
      return;
    }

    startingRef.current = true;
    intentionalStopRef.current = false;
    suppressReconnectOnCloseRef.current = false;
    clearReconnectTimer();
    clearHeartbeatInterval();
    setConnectionState("connecting");

    const localStream = await ensureLocalStream();
    if (!isSpectatorRole && !localStream) {
      startingRef.current = false;
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      safelySend({ type: "auth", token });
    };

    ws.onmessage = async (event) => {
      if (wsRef.current !== ws) return;

      let data: VoiceWsMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      try {
        switch (data.type) {
          case "auth_success":
            isAuthenticatedRef.current = true;
            startHeartbeat();
            safelySend({ type: "voice_join", matchId: challengeId });
            scheduleJoinAckTimeout();
            break;

          case "auth_error":
          case "voice_error":
            if (
              data.type === "voice_error"
              && String(data.error || "").toLowerCase().includes("not in voice room")
            ) {
              attemptVoiceRoomRejoin();
              break;
            }

            suppressReconnectOnCloseRef.current = isFatalVoiceError(data.type, data.error);

            if (data.type === "voice_error" && data.code === "pricing_gate") {
              const requiredRate = typeof data.details?.requiredRate === "number"
                ? data.details.requiredRate
                : null;
              setLastVoiceErrorCode("pricing_gate");
              setLastVoiceErrorRequiredRate(requiredRate);
              toast({
                variant: "destructive",
                title: t("challenge.voicePricingGateTitle"),
                description: requiredRate !== null
                  ? t("challenge.voicePricingGateHint", { price: requiredRate })
                  : t("challenge.voicePricingGateHintFallback"),
              });
            } else if (data.type === "voice_error" && data.code === "not_participant") {
              setLastVoiceErrorCode("not_participant");
              setLastVoiceErrorRequiredRate(null);
              toast({
                variant: "destructive",
                title: t("challenge.voiceNotParticipantTitle"),
                description: t("challenge.voiceNotParticipantHint"),
              });
            } else {
              setLastVoiceErrorCode("other");
              setLastVoiceErrorRequiredRate(null);
              toast({
                variant: "destructive",
                title: t("challenge.voiceErrorRetry"),
                description: typeof data.error === "string" && data.error.length > 0
                  ? data.error
                  : t("challenge.voiceRtcNetworkHint"),
              });
            }

            setConnectionState("error");
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close();
            }
            break;

          case "voice_pong":
            lastPongAtRef.current = Date.now();
            break;

          case "voice_joined":
            clearJoinAckTimer();
            lastVoiceRejoinAttemptAtRef.current = 0;
            reconnectAttemptsRef.current = 0;
            setConnectionState("connected");
            setLastVoiceErrorCode(null);
            setLastVoiceErrorRequiredRate(null);

            for (const peer of data.peers || []) {
              if (!peer?.userId) {
                continue;
              }
              upsertPeer(peer.userId, peer.role);
              await initiateOfferToPeer(peer.userId);
            }
            break;

          case "voice_peer_joined": {
            const peerUserId = data.peerUserId;
            if (!peerUserId) {
              break;
            }

            upsertPeer(peerUserId);
            await initiateOfferToPeer(peerUserId);
            break;
          }

          case "voice_offer": {
            const fromUserId = data.fromUserId;
            if (!fromUserId || !data.offer) {
              break;
            }

            upsertPeer(fromUserId);
            const currentPc = createPeerConnection(fromUserId);
            const offerDescription = new RTCSessionDescription(data.offer);
            const isOfferCollision = makingOfferPeersRef.current.has(fromUserId) || currentPc.signalingState !== "stable";

            if (isOfferCollision && currentPc.signalingState !== "stable") {
              await Promise.all([
                currentPc.setLocalDescription({ type: "rollback" }),
                currentPc.setRemoteDescription(offerDescription),
              ]);
            } else {
              await currentPc.setRemoteDescription(offerDescription);
            }

            remoteDescriptionPeersRef.current.add(fromUserId);
            await processQueuedIceCandidates(fromUserId);

            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);

            safelySend({
              type: "voice_answer",
              matchId: challengeId,
              targetUserId: fromUserId,
              answer: currentPc.localDescription,
            });
            break;
          }

          case "voice_answer": {
            const fromUserId = data.fromUserId;
            if (!fromUserId || !data.answer) {
              break;
            }

            upsertPeer(fromUserId);
            const currentPc = peerConnectionsRef.current.get(fromUserId);
            if (!currentPc) {
              break;
            }

            await currentPc.setRemoteDescription(new RTCSessionDescription(data.answer));
            remoteDescriptionPeersRef.current.add(fromUserId);
            await processQueuedIceCandidates(fromUserId);
            break;
          }

          case "voice_ice_candidate": {
            const fromUserId = data.fromUserId;
            const candidateInit = data.candidate as RTCIceCandidateInit;
            if (!fromUserId || !candidateInit) break;

            upsertPeer(fromUserId);
            const currentPc = peerConnectionsRef.current.get(fromUserId) || createPeerConnection(fromUserId);

            if (remoteDescriptionPeersRef.current.has(fromUserId)) {
              await currentPc.addIceCandidate(new RTCIceCandidate(candidateInit));
            } else {
              const queue = iceCandidateQueueRef.current.get(fromUserId) || [];
              queue.push(candidateInit);
              iceCandidateQueueRef.current.set(fromUserId, queue);
            }
            break;
          }

          case "voice_peer_left": {
            const peerUserId = data.peerUserId;
            if (peerUserId) {
              closePeerConnection(peerUserId);
            }
            break;
          }

          default:
            break;
        }
      } catch (error) {
        console.error("[VoiceChat] Failed to process message", error);
        setConnectionState("error");
      }
    };

    ws.onerror = () => {
      if (!intentionalStopRef.current) {
        toast({
          variant: "destructive",
          title: t("challenge.voiceErrorRetry"),
          description: t("challenge.voiceRtcNetworkHint"),
        });
        setConnectionState("error");
      }
    };

    ws.onclose = () => {
      clearJoinAckTimer();
      clearHeartbeatInterval();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      const suppressReconnect = suppressReconnectOnCloseRef.current;
      suppressReconnectOnCloseRef.current = false;

      closeAllPeerConnections();

      if (!intentionalStopRef.current && isEnabled && !suppressReconnect) {
        setConnectionState("connecting");
        scheduleReconnect();
        return;
      }

      if (!intentionalStopRef.current && suppressReconnect) {
        setConnectionState("error");
      }
    };

    startingRef.current = false;
  }, [
    challengeId,
    clearJoinAckTimer,
    clearHeartbeatInterval,
    clearReconnectTimer,
    closeAllPeerConnections,
    closePeerConnection,
    createPeerConnection,
    ensureLocalStream,
    initiateOfferToPeer,
    attemptVoiceRoomRejoin,
    isFatalVoiceError,
    isEnabled,
    isSpectatorRole,
    processQueuedIceCandidates,
    safelySend,
    scheduleJoinAckTimeout,
    scheduleReconnect,
    startHeartbeat,
    t,
    toast,
    token,
    upsertPeer,
  ]);

  useEffect(() => {
    if (isEnabled && connectionState === "disconnected") {
      startVoiceChat();
    } else if (!isEnabled && connectionState !== "disconnected") {
      intentionalStopRef.current = true;
      stopVoiceChat();
    }
  }, [isEnabled, connectionState, startVoiceChat, stopVoiceChat]);

  useEffect(() => {
    if (localStreamRef.current && !isSpectatorRole) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMicMuted;
      });
    }
  }, [isMicMuted, isSpectatorRole]);

  useEffect(() => {
    peerOrder.forEach((peerUserId) => {
      syncPeerAudioElement(peerUserId);
    });
  }, [effectivePeerAudioMuted, peerOrder, syncPeerAudioElement]);

  useEffect(() => {
    if (onConnectedPeersChange) {
      onConnectedPeersChange(peerOrder);
    }
  }, [onConnectedPeersChange, peerOrder]);

  const bindPeerAudioElement = useCallback((peerUserId: string, element: HTMLAudioElement | null) => {
    if (element) {
      remoteAudioElementsRef.current.set(peerUserId, element);
      syncPeerAudioElement(peerUserId);
      return;
    }

    remoteAudioElementsRef.current.delete(peerUserId);
  }, [syncPeerAudioElement]);

  const togglePeerAudioMute = useCallback((peerUserId: string) => {
    if (peerAudioMutedOverride) {
      return;
    }

    setPeerAudioMuted((previous) => ({
      ...previous,
      [peerUserId]: !previous[peerUserId],
    }));
  }, [peerAudioMutedOverride]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      stopVoiceChat();
    };
  }, [stopVoiceChat]);

  return (
    <div className={showInlineControls ? "flex items-center gap-1" : "hidden"}>
      {peerOrder.map((peerUserId) => (
        <audio
          key={`voice-audio-${peerUserId}`}
          ref={(element) => bindPeerAudioElement(peerUserId, element)}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}

      {showInlineControls && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="h-8 px-2 text-xs bg-transparent border"
              data-testid="voice-connection-status"
            >
              {connectionState === "connecting" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("challenge.voiceLive")
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {connectionState === "connecting" && t("challenge.voiceConnecting")}
            {connectionState === "connected" && t("challenge.voiceConnected")}
            {connectionState === "disconnected" && t("challenge.voiceConnecting")}
            {connectionState === "error" && lastVoiceErrorCode === "pricing_gate" && (
              lastVoiceErrorRequiredRate !== null
                ? t("challenge.voicePricingGateHint", { price: lastVoiceErrorRequiredRate })
                : t("challenge.voicePricingGateHintFallback")
            )}
            {connectionState === "error" && lastVoiceErrorCode === "not_participant" && t("challenge.voiceNotParticipantHint")}
            {connectionState === "error" && (lastVoiceErrorCode === "other" || lastVoiceErrorCode === null) && t("challenge.voiceErrorRetry")}
          </TooltipContent>
        </Tooltip>
      )}

      {showInlineControls && isEnabled && (
        <>
          {!isSpectatorRole && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isMicMuted ? "destructive" : "ghost"}
                  size="icon"
                  onClick={onMicMuteToggle}
                  data-testid="button-mic-toggle"
                >
                  {isMicMuted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isMicMuted ? t("challenge.voiceUnmuteMic") : t("challenge.voiceMuteMic")}
              </TooltipContent>
            </Tooltip>
          )}

          {peerOrder.map((peerUserId, index) => {
            const muted = !!effectivePeerAudioMuted[peerUserId];
            const peerRole = peerRoles[peerUserId] || "player";
            const testIdSuffix = peerUserId.replace(/[^a-zA-Z0-9_-]/g, "-");

            return (
              <Tooltip key={`peer-audio-toggle-${peerUserId}`}>
                <TooltipTrigger asChild>
                  <Button
                    variant={muted ? "destructive" : "ghost"}
                    size="icon"
                    onClick={() => togglePeerAudioMute(peerUserId)}
                    data-testid={`button-peer-audio-toggle-${testIdSuffix}`}
                  >
                    {muted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {muted ? t("challenge.voiceUnmuteSpeaker") : t("challenge.voiceMuteSpeaker")} #{index + 1}
                  {peerRole === "spectator" ? " · S" : " · P"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </>
      )}
    </div>
  );
}
