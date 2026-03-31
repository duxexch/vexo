import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Share2,
  Wifi,
  WifiOff,
  Users,
  MessageSquare,
  List,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface GameLayoutProps {
  /** Game title (e.g. "Chess", "Backgammon") */
  title: string;
  /** Opponent info to display in header */
  opponent?: { username: string } | null;
  /** WebSocket connection status */
  connectionStatus: "connecting" | "connected" | "reconnecting" | "error" | "disconnected";
  /** Count of spectators watching */
  spectatorCount?: number;
  /** Error message (shown in error state) */
  error?: string | null;
  /** Called when back button is pressed — default navigates to /play */
  onBack?: () => void;
  /** Called when share button is pressed */
  onShare?: () => void;
  /** Called to force reconnect on error */
  onRetry?: () => void;
  /** The game board element */
  board: ReactNode;
  /** Timer element (shown above board on mobile, beside it on desktop) */
  timer?: ReactNode;
  /** Chat panel */
  chat?: ReactNode;
  /** Move list / history panel */
  moveList?: ReactNode;
  /** Controls area (resign, draw, etc) — shown below board */
  controls?: ReactNode;
  /** Game result overlay */
  gameResult?: ReactNode;
  /** Additional content in sidebar */
  extra?: ReactNode;
  children?: ReactNode;
}

export function GameLayout({
  title,
  opponent,
  connectionStatus,
  spectatorCount = 0,
  error,
  onBack,
  onShare,
  onRetry,
  board,
  timer,
  chat,
  moveList,
  controls,
  gameResult,
  extra,
  children,
}: GameLayoutProps) {
  const { t, dir } = useI18n();
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();

  const handleBack = onBack || (() => setLocation("/games"));

  // Loading state
  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" dir={dir}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {connectionStatus === "reconnecting" ? t("common.reconnecting") || "Reconnecting..." : t("common.connecting") || "Connecting..."}
        </p>
      </div>
    );
  }

  // Error state
  if (connectionStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" dir={dir}>
        <WifiOff className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{error || t("common.error")}</p>
        {onRetry && (
          <Button onClick={onRetry} data-testid="button-retry">
            {t("auth.tryAgain")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-6 max-w-7xl" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Go back" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{title}</h1>
            {opponent && (
              <p className="text-muted-foreground text-xs sm:text-sm">
                vs {opponent.username}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Badge
            variant={connectionStatus === "connected" ? "default" : "secondary"}
            className="gap-1 text-xs"
            role="status"
            aria-live="polite"
          >
            {connectionStatus === "connected" ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">
              {connectionStatus === "connected" ? t("common.live") || "Live" : t("common.offline")}
            </span>
          </Badge>

          {spectatorCount > 0 && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Users className="w-3 h-3" />
              {spectatorCount}
            </Badge>
          )}

          {onShare && (
            <Button variant="outline" size="sm" onClick={onShare} data-testid="button-share" className="hidden sm:flex">
              <Share2 className="w-4 h-4 me-1.5" />
              {t("chess.share") || "Share"}
            </Button>
          )}
        </div>
      </div>

      {/* Game result */}
      {gameResult && (
        <div className="mb-4 sm:mb-6">{gameResult}</div>
      )}

      {/* Layout: Desktop = side-by-side, Mobile = stacked with tabs */}
      {isMobile ? (
        <div className="flex flex-col gap-3">
          {timer}
          <div className="flex justify-center">{board}</div>
          {controls}
          {(chat || moveList) && (
            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                {chat && (
                  <TabsTrigger value="chat" className="gap-1 text-xs">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {t("game.chat") || "Chat"}
                  </TabsTrigger>
                )}
                {moveList && (
                  <TabsTrigger value="moves" className="gap-1 text-xs">
                    <List className="w-3.5 h-3.5" />
                    {t("game.moves") || "Moves"}
                  </TabsTrigger>
                )}
                {spectatorCount > 0 && (
                  <TabsTrigger value="spectators" className="gap-1 text-xs">
                    <Eye className="w-3.5 h-3.5" />
                    {spectatorCount}
                  </TabsTrigger>
                )}
              </TabsList>
              {chat && <TabsContent value="chat">{chat}</TabsContent>}
              {moveList && <TabsContent value="moves">{moveList}</TabsContent>}
            </Tabs>
          )}
          {extra}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4 sm:gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-start gap-4 w-full justify-center">
              {timer}
              {board}
            </div>
            {controls}
          </div>

          <div className="space-y-4">
            {moveList}
            {chat}
            {extra}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
