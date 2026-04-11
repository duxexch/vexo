import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { buildRtcConfiguration } from "@/lib/rtc-config";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { openAppSettings, openMicrophoneSettings } from "@/lib/startup-permissions";
import { Capacitor } from "@capacitor/core";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2 } from "lucide-react";

interface VoiceChatProps {
  challengeId: string;
  isEnabled: boolean;
  onToggle: () => void;
  isMicMuted: boolean;
  onMicMuteToggle: () => void;
  role?: "player" | "spectator";
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

type VoicePeerRole = "player" | "spectator";

type VoiceWsMessage = {
  type: string;
  error?: string;
  peers?: Array<{ userId: string; role?: VoicePeerRole }>;
  peerUserId?: string;
  fromUserId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export function VoiceChat({
  challengeId,
  isEnabled,
  onToggle,
  isMicMuted,
  onMicMuteToggle,
  role = "player",
}: VoiceChatProps) {
  const { token } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const { settings } = useSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const isSpectatorRole = role === "spectator";

  const rtcConfiguration = useMemo(
    () => buildRtcConfiguration(settings?.rtc),
    [settings?.rtc],
  );

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferPeersRef = useRef<Set<string>>(new Set());
  const remoteDescriptionPeersRef = useRef<Set<string>>(new Set());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteMixStreamRef = useRef<MediaStream>(new MediaStream());
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const joinAckTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isAuthenticatedRef = useRef(false);
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

  const cleanupEndedRemoteTracks = useCallback(() => {
    const stream = remoteMixStreamRef.current;
    stream.getTracks().forEach((track) => {
      if (track.readyState === "ended") {
        stream.removeTrack(track);
      }
    });
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
    cleanupEndedRemoteTracks();
  }, [cleanupEndedRemoteTracks]);

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

    let stream: MediaStream;
    try {
      stream = await acquireMicrophoneStream();
    } catch (error) {
      console.error("[VoiceChat] Failed to access microphone", error);

      if (isPermissionDeniedError(error)) {
        showMicPermissionToast();

        if (Capacitor.isNativePlatform()) {
          // Force-open app settings on native when microphone permission is denied.
          void openAppSettings();
        }
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
    openAppSettings,
    showMicPermissionToast,
    t,
    toast,
  ]);

  const createPeerConnection = useCallback((peerUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(peerUserId);
    if (existing) {
      return existing;
    }

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
        safelySend({
          type: "voice_ice_candidate",
          matchId: challengeId,
          targetUserId: peerUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      event.streams.forEach((stream) => {
        stream.getAudioTracks().forEach((track) => {
          const exists = remoteMixStreamRef.current.getAudioTracks().some((existingTrack) => existingTrack.id === track.id);
          if (!exists) {
            remoteMixStreamRef.current.addTrack(track);
            track.onended = () => {
              cleanupEndedRemoteTracks();
            };
          }
        });
      });

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteMixStreamRef.current;
        void remoteAudioRef.current.play().catch(() => {
          // Autoplay can be blocked on some browsers; user interaction already exists via toggle.
        });
      }
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
  }, [challengeId, cleanupEndedRemoteTracks, clearReconnectTimer, closePeerConnection, isMicMuted, rtcConfiguration, safelySend]);

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

    remoteMixStreamRef.current.getTracks().forEach((track) => {
      remoteMixStreamRef.current.removeTrack(track);
    });

    isAuthenticatedRef.current = false;
    startingRef.current = false;
    setConnectionState("disconnected");
  }, [challengeId, clearJoinAckTimer, clearReconnectTimer, closeAllPeerConnections, safelySend]);

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
    clearReconnectTimer();
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
            safelySend({ type: "voice_join", matchId: challengeId });
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
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                  ws.close();
                }
                scheduleReconnect();
              }
            }, 4000);
            break;

          case "auth_error":
          case "voice_error":
            toast({
              variant: "destructive",
              title: t("challenge.voiceErrorRetry"),
              description: typeof data.error === "string" && data.error.length > 0
                ? data.error
                : t("challenge.voiceRtcNetworkHint"),
            });
            setConnectionState("error");
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close();
            }
            if (!intentionalStopRef.current) {
              scheduleReconnect();
            }
            break;

          case "voice_joined":
            clearJoinAckTimer();
            reconnectAttemptsRef.current = 0;
            setConnectionState("connected");

            for (const peer of data.peers || []) {
              if (!peer?.userId) {
                continue;
              }
              await initiateOfferToPeer(peer.userId);
            }
            break;

          case "voice_peer_joined": {
            const peerUserId = data.peerUserId;
            if (!peerUserId) {
              break;
            }

            await initiateOfferToPeer(peerUserId);
            break;
          }

          case "voice_offer": {
            const fromUserId = data.fromUserId;
            if (!fromUserId || !data.offer) {
              break;
            }

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
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (!intentionalStopRef.current && isEnabled) {
        closeAllPeerConnections();
        setConnectionState("connecting");
        scheduleReconnect();
      }
    };

    startingRef.current = false;
  }, [
    challengeId,
    clearJoinAckTimer,
    clearReconnectTimer,
    closeAllPeerConnections,
    closePeerConnection,
    createPeerConnection,
    ensureLocalStream,
    initiateOfferToPeer,
    isEnabled,
    isSpectatorRole,
    processQueuedIceCandidates,
    safelySend,
    scheduleReconnect,
    t,
    toast,
    token,
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
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isSpeakerMuted;
      remoteAudioRef.current.volume = isSpeakerMuted ? 0 : 1;
    }
  }, [isSpeakerMuted]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      stopVoiceChat();
    };
  }, [stopVoiceChat]);

  return (
    <div className="flex items-center gap-1">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isEnabled ? (connectionState === "connected" ? "default" : "secondary") : "ghost"}
            size="icon"
            onClick={onToggle}
            className={cn(
              connectionState === "connected" && "bg-green-600 hover:bg-green-700",
              connectionState === "error" && "bg-destructive hover:bg-destructive/90"
            )}
            data-testid="button-voice-toggle"
          >
            {connectionState === "connecting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEnabled ? (
              <Phone className="h-4 w-4" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {connectionState === "connecting" && t("challenge.voiceConnecting")}
          {connectionState === "connected" && t("challenge.voiceConnected")}
          {connectionState === "disconnected" && t("challenge.voiceStart")}
          {connectionState === "error" && t("challenge.voiceErrorRetry")}
        </TooltipContent>
      </Tooltip>

      {isEnabled && (
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSpeakerMuted ? "destructive" : "ghost"}
                size="icon"
                onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                data-testid="button-speaker-toggle"
              >
                {isSpeakerMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSpeakerMuted ? t("challenge.voiceUnmuteSpeaker") : t("challenge.voiceMuteSpeaker")}
            </TooltipContent>
          </Tooltip>
        </>
      )}

      {connectionState === "connected" && (
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          {t("challenge.voiceLive")}
        </Badge>
      )}
    </div>
  );
}
