import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import type { UseCallSessionReturn } from "@/hooks/use-call-session";

interface CallModalProps {
  call: UseCallSessionReturn;
}

/**
 * Renders both incoming-ring and active-call states. Closes itself once the
 * underlying session goes back to idle.
 */
export function CallModal({ call }: CallModalProps) {
  const { t } = useI18n();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
    }
  }, [call.localStream]);

  useEffect(() => {
    if (call.callType === "video" && remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
    }
    if (remoteAudioRef.current && call.remoteStream) {
      remoteAudioRef.current.srcObject = call.remoteStream;
    }
  }, [call.remoteStream, call.callType]);

  const open = call.status !== "idle" && call.status !== "ended";
  if (!open) return null;

  const isIncoming = call.status === "ringing-in" && !!call.incoming;
  const isVideo = call.callType === "video";

  const statusLabel =
    call.status === "ringing-out" ? t("rtcCall.ringing")
      : call.status === "ringing-in" ? (call.incoming ? t("rtcCall.incomingFrom").replace("{{name}}", call.incoming.fromUsername) : t("rtcCall.ringing"))
      : call.status === "connecting" ? t("rtcCall.connecting")
      : call.status === "connected" ? t("rtcCall.connected")
      : call.status === "failed" ? t("rtcCall.failed")
      : "";

  const tierLabel =
    call.tier === "relay" ? t("rtcCall.tier.relay")
      : call.tier === "text-only" ? t("rtcCall.tier.text-only")
      : t("rtcCall.tier.p2p");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) call.hangup(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-call">
        <DialogHeader>
          <DialogTitle>
            {isVideo ? t("rtcCall.video") : t("rtcCall.voice")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground" data-testid="text-call-status">{statusLabel}</span>
            {call.status === "connected" && (
              <Badge variant={call.tier === "p2p" ? "default" : call.tier === "relay" ? "secondary" : "destructive"} data-testid="badge-call-tier">
                {tierLabel}
              </Badge>
            )}
          </div>

          {isVideo && (
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute right-2 bottom-2 h-24 w-32 rounded border border-white/30 object-cover" />
            </div>
          )}
          {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

          <div className="flex items-center justify-center gap-2 pt-2">
            {isIncoming ? (
              <>
                <Button onClick={call.acceptIncoming} variant="default" data-testid="button-call-accept">
                  <Phone className="h-4 w-4 mr-2" /> {t("rtcCall.accept")}
                </Button>
                <Button onClick={call.declineIncoming} variant="destructive" data-testid="button-call-decline">
                  <PhoneOff className="h-4 w-4 mr-2" /> {t("rtcCall.decline")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={call.toggleMute}
                  variant="ghost"
                  size="icon"
                  aria-label={call.muted ? t("rtcCall.unmute") : t("rtcCall.mute")}
                  data-testid="button-call-mute"
                >
                  {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                {isVideo && (
                  <Button
                    onClick={call.toggleVideo}
                    variant="ghost"
                    size="icon"
                    aria-label={call.videoEnabled ? t("rtcCall.cameraOff") : t("rtcCall.cameraOn")}
                    data-testid="button-call-toggle-video"
                  >
                    {call.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </Button>
                )}
                <Button onClick={() => call.hangup()} variant="destructive" data-testid="button-call-hangup">
                  <PhoneOff className="h-4 w-4 mr-2" /> {t("rtcCall.hangup")}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
