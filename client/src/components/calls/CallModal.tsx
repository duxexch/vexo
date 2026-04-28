import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Maximize, Shrink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useGameFullscreen } from "@/hooks/use-game-fullscreen";
import type { UseCallSessionReturn } from "@/hooks/use-call-session";

interface CallModalProps {
  call: UseCallSessionReturn;
}

/**
 * Shared button tokens — same palette as the friend-chat call layer so the
 * controls read identically across both entry points (challenge calls vs.
 * private chat calls). Solid backgrounds + white icons keep the affordance
 * visible against both the dialog chrome (light) and the black video frame
 * (dark) without depending on Tailwind variant styles.
 */
const CTRL_BASE =
  "min-h-[48px] rounded-2xl text-white border-0 shadow-md [&_svg]:size-5 [&_svg]:shrink-0 transition-colors";
const CTRL_NEUTRAL = `${CTRL_BASE} bg-slate-700 hover:bg-slate-800 active:bg-slate-900`;
const CTRL_OK = `${CTRL_BASE} bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800`;
const CTRL_DANGER = `${CTRL_BASE} bg-rose-600 hover:bg-rose-700 active:bg-rose-800`;
const CTRL_ACCENT = `${CTRL_BASE} bg-sky-600 hover:bg-sky-700 active:bg-sky-800`;

/**
 * Renders both incoming-ring and active-call states. Closes itself once the
 * underlying session goes back to idle.
 */
export function CallModal({ call }: CallModalProps) {
  const { t } = useI18n();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Same fullscreen primitive used by the games stack and by the friend-chat
  // call layer. Falls back to a CSS-fixed cover when the WebView refuses the
  // native Fullscreen API.
  const {
    containerRef: fullscreenRef,
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useGameFullscreen();

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

  // Defensively drop fullscreen when the modal closes — the dialog might
  // unmount while the document is still pinned to a stale element.
  useEffect(() => {
    if (!open && isFullscreen) {
      void exitFullscreen();
    }
  }, [open, isFullscreen, exitFullscreen]);

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
      <DialogContent
        ref={fullscreenRef}
        className={
          isFullscreen
            ? "flex h-screen w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-slate-950 p-4 text-white sm:rounded-none"
            : "max-w-md"
        }
        data-testid="dialog-call"
      >
        <DialogHeader>
          <DialogTitle className={isFullscreen ? "text-white" : ""}>
            {isVideo ? t("rtcCall.video") : t("rtcCall.voice")}
          </DialogTitle>
        </DialogHeader>

        <div className={isFullscreen ? "flex flex-1 flex-col gap-3" : "space-y-3"}>
          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${isFullscreen ? "text-white/70" : "text-muted-foreground"}`}
              data-testid="text-call-status"
            >
              {statusLabel}
            </span>
            {call.status === "connected" && (
              <Badge variant={call.tier === "p2p" ? "default" : call.tier === "relay" ? "secondary" : "destructive"} data-testid="badge-call-tier">
                {tierLabel}
              </Badge>
            )}
          </div>

          {isVideo && (
            <div
              className={
                isFullscreen
                  ? "relative w-full flex-1 overflow-hidden rounded-md bg-black"
                  : "relative aspect-video w-full overflow-hidden rounded-md bg-black"
              }
            >
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={
                  isFullscreen
                    ? "absolute right-3 bottom-3 h-32 w-44 rounded border border-white/40 object-cover shadow-lg"
                    : "absolute right-2 bottom-2 h-24 w-32 rounded border border-white/30 object-cover"
                }
              />
            </div>
          )}
          {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

          <div className="flex items-center justify-center gap-2 pt-2">
            {isIncoming ? (
              <>
                <Button
                  onClick={call.acceptIncoming}
                  className={`${CTRL_OK} px-5`}
                  data-testid="button-call-accept"
                >
                  <Phone className="mr-2" /> {t("rtcCall.accept")}
                </Button>
                <Button
                  onClick={call.declineIncoming}
                  className={`${CTRL_DANGER} px-5`}
                  data-testid="button-call-decline"
                >
                  <PhoneOff className="mr-2" /> {t("rtcCall.decline")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={call.toggleMute}
                  className={`${call.muted ? CTRL_DANGER : CTRL_OK} aspect-square min-w-[48px] p-0`}
                  aria-label={call.muted ? t("rtcCall.unmute") : t("rtcCall.mute")}
                  data-testid="button-call-mute"
                >
                  {call.muted ? <MicOff /> : <Mic />}
                </Button>
                {isVideo && (
                  <>
                    <Button
                      onClick={call.toggleVideo}
                      className={`${call.videoEnabled ? CTRL_ACCENT : CTRL_DANGER} aspect-square min-w-[48px] p-0`}
                      aria-label={call.videoEnabled ? t("rtcCall.cameraOff") : t("rtcCall.cameraOn")}
                      data-testid="button-call-toggle-video"
                    >
                      {call.videoEnabled ? <Video /> : <VideoOff />}
                    </Button>
                    <Button
                      onClick={() => void toggleFullscreen()}
                      className={`${CTRL_NEUTRAL} aspect-square min-w-[48px] p-0`}
                      aria-label={isFullscreen ? t("rtcCall.exitFullScreen") : t("rtcCall.fullScreen")}
                      data-testid="button-call-fullscreen"
                    >
                      {isFullscreen ? <Shrink /> : <Maximize />}
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => call.hangup()}
                  className={`${CTRL_DANGER} px-5`}
                  data-testid="button-call-hangup"
                >
                  <PhoneOff className="mr-2" /> {t("rtcCall.hangup")}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
