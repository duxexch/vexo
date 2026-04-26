import { useEffect, useState, type ReactNode } from "react";
import { Volume2, VolumeX, Settings, X, Maximize2, Minimize2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useGameAudio } from "@/hooks/use-game-audio";
import { useMediaQuery } from "@/hooks/use-media-query";
import { installAudioGestureUnlock } from "@/lib/game-audio";
import type { GameRoleCapabilities } from "@/hooks/use-game-role";

export interface GameLayoutProps {
  /** Game title shown in header (e.g. "Chess", "Backgammon"). */
  title: string;
  /** Optional subtitle (e.g. challenge id, stake amount). */
  subtitle?: string;
  /** Permission/role info from `useGameRole`. Drives spectator/player chrome. */
  role: GameRoleCapabilities;
  /** Number of spectators currently watching. */
  spectatorCount?: number;
  /** Live game status text (e.g. "White to move", "Game over"). */
  statusText?: string;
  /** Player strip rendered above the board (typically the opponent). */
  topPlayer?: ReactNode;
  /** Player strip rendered below the board (typically the current user). */
  bottomPlayer?: ReactNode;
  /** Centre board content. */
  children: ReactNode;
  /** Side / floating chat dock (rendered as right column on desktop, sheet on mobile). */
  chat?: ReactNode;
  /** Spectator-specific strip (gifts, tipping, list). */
  spectatorStrip?: ReactNode;
  /** Action buttons rendered in a sticky bottom dock (resign, draw offer, etc.). */
  actions?: ReactNode;
  /** Called when user clicks the close (X) button in the header. */
  onExit?: () => void;
  /** Optional fullscreen toggle handler. If supplied, a fullscreen icon is shown. */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  /** Extra controls placed inside the settings sheet. */
  extraSettings?: ReactNode;
  /** Compact HUD pills rendered in the header center (e.g. timer, score, balance). */
  hud?: ReactNode;
  /** Optional chrome above board (status banner replacement / mini scoreboard). */
  banner?: ReactNode;
  className?: string;
}

export function GameLayout({
  title,
  subtitle,
  role,
  spectatorCount,
  statusText,
  topPlayer,
  bottomPlayer,
  children,
  chat,
  spectatorStrip,
  actions,
  onExit,
  onToggleFullscreen,
  isFullscreen,
  extraSettings,
  hud,
  banner,
  className,
}: GameLayoutProps) {
  const { t, dir } = useI18n();
  const audio = useGameAudio();
  const [chatOpen, setChatOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    installAudioGestureUnlock();
  }, []);

  return (
    <div
      dir={dir}
      className={cn(
        "flex min-h-[100svh] w-full flex-col bg-background text-foreground",
        className,
      )}
      data-testid="game-layout"
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onExit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExit}
              aria-label={t("common.close") || "Close"}
              data-testid="button-game-exit"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight" data-testid="text-game-title">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground" data-testid="text-game-subtitle">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {hud && (
          <div
            className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 sm:flex"
            data-testid="container-game-hud"
          >
            {hud}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {role.isSpectator && (
            <Badge variant="outline" className="hidden gap-1 sm:inline-flex" data-testid="badge-spectator">
              <Eye className="h-3 w-3" />
              {t("game.spectator") || "Spectator"}
            </Badge>
          )}
          {typeof spectatorCount === "number" && spectatorCount > 0 && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-spectator-count">
              <Eye className="h-3 w-3" />
              {spectatorCount}
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={audio.toggleMute}
            aria-label={audio.muted ? (t("game.unmute") || "Unmute") : (t("game.mute") || "Mute")}
            data-testid="button-game-mute"
          >
            {audio.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>

          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              data-testid="button-game-fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("game.settings") || "Settings"} data-testid="button-game-settings">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-[min(100vw,360px)]">
              <SheetHeader>
                <SheetTitle>{t("game.settings") || "Settings"}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="audio-mute" className="flex items-center gap-2">
                      {audio.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      {t("game.sound") || "Sound"}
                    </Label>
                    <Switch
                      id="audio-mute"
                      checked={!audio.muted}
                      onCheckedChange={(v) => audio.setMuted(!v)}
                      data-testid="switch-game-sound"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("game.volume") || "Volume"}</span>
                      <span>{Math.round(audio.volume * 100)}%</span>
                    </div>
                    <Slider
                      value={[audio.volume * 100]}
                      max={100}
                      step={1}
                      onValueChange={(vals) => audio.setVolume((vals[0] ?? 0) / 100)}
                      disabled={audio.muted}
                      data-testid="slider-game-volume"
                    />
                  </div>
                </div>

                {extraSettings}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {hud && (
        <div
          className="flex items-center justify-center gap-1.5 border-b border-border/40 bg-background/95 px-3 py-1.5 sm:hidden"
          data-testid="container-game-hud-mobile"
        >
          {hud}
        </div>
      )}

      {banner && (
        <div className="border-b border-border/40 bg-muted/30 px-3 py-2" data-testid="container-game-banner">
          {banner}
        </div>
      )}

      {statusText && (
        <div
          className="border-b border-border/40 bg-muted/40 px-3 py-1 text-center text-xs font-medium"
          data-testid="text-game-status"
        >
          {statusText}
        </div>
      )}

      {/* Main grid */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex flex-1 flex-col">
          {topPlayer && (
            <div className="px-3 py-2" data-testid="container-top-player">
              {topPlayer}
            </div>
          )}

          <div className="flex flex-1 items-center justify-center p-2 sm:p-4" data-testid="container-board">
            {children}
          </div>

          {bottomPlayer && (
            <div className="px-3 py-2" data-testid="container-bottom-player">
              {bottomPlayer}
            </div>
          )}

          {spectatorStrip && (
            <div className="border-t border-border/40 bg-muted/30 px-3 py-2" data-testid="container-spectator-strip">
              {spectatorStrip}
            </div>
          )}
        </div>

        {chat && isDesktop && (
          <aside
            className="w-full max-w-[340px] border-s border-border/60 bg-background"
            data-testid="container-chat-desktop"
          >
            {chat}
          </aside>
        )}
      </div>

      {/* Sticky bottom: actions + (on mobile only) chat trigger */}
      {(actions || chat) && (
        <div
          className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-border/60 bg-background/95 px-3 py-2 backdrop-blur"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
          data-testid="container-game-actions"
        >
          {actions && <div className="flex flex-1 flex-wrap items-center gap-2">{actions}</div>}
          {chat && !isDesktop && (
            <Sheet open={chatOpen} onOpenChange={setChatOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-open-chat">
                  💬 {t("game.chat") || "Chat"}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70svh] p-0">
                <SheetHeader className="border-b border-border/60 px-4 py-3">
                  <SheetTitle>{t("game.chat") || "Chat"}</SheetTitle>
                </SheetHeader>
                <div className="h-[calc(70svh-3.5rem)] overflow-hidden">{chat}</div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}
    </div>
  );
}
