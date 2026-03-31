import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2 } from "lucide-react";

interface VoiceChatProps {
  challengeId: string;
  isEnabled: boolean;
  onToggle: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export function VoiceChat({
  challengeId,
  isEnabled,
  onToggle,
  isMuted,
  onMuteToggle,
}: VoiceChatProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const setupPeerConnection = useCallback(async () => {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    const pc = new RTCPeerConnection(config);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "voice_ice_candidate",
          matchId: challengeId,
          candidate: event.candidate,
        }));
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          setConnectionState("connected");
          break;
        case "disconnected":
        case "failed":
          setConnectionState("error");
          break;
        case "closed":
          setConnectionState("disconnected");
          break;
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    } catch (err) {
      console.error("Failed to get audio stream:", err);
      setConnectionState("error");
      return null;
    }

    return pc;
  }, [challengeId]);

  const startVoiceChat = useCallback(async () => {
    setConnectionState("connecting");

    const token = localStorage.getItem("pwm_token");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = async () => {
      ws.send(JSON.stringify({ type: "auth", token }));
      ws.send(JSON.stringify({ type: "voice_join", matchId: challengeId }));

      const pc = await setupPeerConnection();
      if (!pc) return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: "voice_offer",
        matchId: challengeId,
        offer,
      }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "voice_offer":
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            ws.send(JSON.stringify({
              type: "voice_answer",
              matchId: challengeId,
              answer,
            }));
          }
          break;
        case "voice_answer":
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
          break;
        case "voice_ice_candidate":
          if (peerConnectionRef.current && data.candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
          break;
        case "voice_peer_joined":
          if (!peerConnectionRef.current) {
            const pc = await setupPeerConnection();
            if (pc) {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({
                type: "voice_offer",
                matchId: challengeId,
                offer,
              }));
            }
          }
          break;
        case "voice_peer_left":
          setConnectionState("disconnected");
          break;
      }
    };

    ws.onerror = () => {
      setConnectionState("error");
    };

    ws.onclose = () => {
      if (connectionState === "connecting" || connectionState === "connected") {
        setConnectionState("disconnected");
      }
    };
  }, [challengeId, setupPeerConnection, connectionState]);

  const stopVoiceChat = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "voice_leave", matchId: challengeId }));
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState("disconnected");
  }, [challengeId]);

  useEffect(() => {
    if (isEnabled && connectionState === "disconnected") {
      startVoiceChat();
    } else if (!isEnabled && connectionState !== "disconnected") {
      stopVoiceChat();
    }
  }, [isEnabled, connectionState, startVoiceChat, stopVoiceChat]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isSpeakerMuted;
    }
  }, [isSpeakerMuted]);

  useEffect(() => {
    return () => {
      stopVoiceChat();
    };
  }, [stopVoiceChat]);

  return (
    <div className="flex items-center gap-1">
      <audio ref={remoteAudioRef} autoPlay />
      
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
          {connectionState === "connecting" && "Connecting..."}
          {connectionState === "connected" && "Voice chat connected"}
          {connectionState === "disconnected" && "Start voice chat"}
          {connectionState === "error" && "Voice chat error - click to retry"}
        </TooltipContent>
      </Tooltip>

      {isEnabled && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isMuted ? "destructive" : "ghost"}
                size="icon"
                onClick={onMuteToggle}
                data-testid="button-mic-toggle"
              >
                {isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isMuted ? "Unmute microphone" : "Mute microphone"}
            </TooltipContent>
          </Tooltip>

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
              {isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
            </TooltipContent>
          </Tooltip>
        </>
      )}

      {connectionState === "connected" && (
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          Live
        </Badge>
      )}
    </div>
  );
}
