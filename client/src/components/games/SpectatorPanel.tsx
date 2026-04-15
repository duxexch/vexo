import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { FullScreenGiftPanel } from "./FullScreenGiftPanel";
import {
  Eye,
  Gift,
  UserPlus,
  UserCheck,
  TrendingUp,
  MessageCircle,
} from "lucide-react";

interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  vipLevel?: number;
  rating?: {
    wins: number;
    losses: number;
    winRate: number;
    rank: string;
  };
}

interface SpectatorPanelProps {
  challengeId: string;
  player1?: Player;
  player2?: Player;
  player3?: Player;
  player4?: Player;
  spectatorCount: number;
  totalMoves?: number;
  currentTurn?: string;
  gameStatus?: string;
  panelMode?: "spectator" | "player";
  onSendGift?: (giftId: string, playerId: string, meta?: { price?: number; name?: string }) => void;
  chatMessages?: Array<{
    id?: string;
    userId?: string;
    username: string;
    message: string;
    timestamp: string | number;
  }>;
  supportCount?: number;
  supportTotalText?: string;
  giftCount?: number;
  giftTotalText?: string;
  onSendChat?: (message: string) => void;
  canSendChat?: boolean;
}

const RANK_COLORS: Record<string, string> = {
  bronze: "bg-amber-700/20 text-amber-600",
  silver: "bg-gray-400/20 text-gray-400",
  gold: "bg-yellow-500/20 text-yellow-500",
  platinum: "bg-cyan-400/20 text-cyan-400",
  diamond: "bg-purple-400/20 text-purple-400",
};

export function SpectatorPanel({
  challengeId,
  player1,
  player2,
  player3,
  player4,
  spectatorCount,
  totalMoves,
  currentTurn,
  gameStatus,
  panelMode = "spectator",
  onSendGift,
  chatMessages,
  supportCount,
  supportTotalText,
  giftCount,
  giftTotalText,
  onSendChat,
  canSendChat = false,
}: SpectatorPanelProps) {
  const { language, t } = useI18n();
  const { toast } = useToast();

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [pointsAmount, setPointsAmount] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const isViewerPanel = panelMode === "spectator";
  const panelPlayers = [player1, player2, player3, player4].filter(
    (player): player is Player => Boolean(player),
  );
  const participantCount = panelPlayers.length;
  const currentTurnPlayerName = currentTurn
    ? panelPlayers.find((player) => player.id === currentTurn)?.username
    : undefined;

  const { data: followedChallengersRaw } = useQuery<{ id: string; followedId: string }[]>({
    queryKey: ["/api/challenger-follows"],
  });

  const followedChallengers = Array.isArray(followedChallengersRaw)
    ? followedChallengersRaw
    : Array.isArray((followedChallengersRaw as unknown as { follows?: unknown } | undefined)?.follows)
      ? ((followedChallengersRaw as unknown as { follows?: Array<{ id: string; followedId: string }> }).follows || [])
      : [];

  const followedIds = new Set(
    followedChallengers
      .map((followItem) => followItem.followedId)
      .filter((followedId): followedId is string => typeof followedId === "string" && followedId.length > 0),
  );

  const addPointsMutation = useMutation({
    mutationFn: (data: { challengeId: string; targetPlayerId: string; pointsAmount: number }) =>
      apiRequest("POST", "/api/challenge-points", data),
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تمت إضافة النقاط!" : "Points added!",
      });
      setShowPointsDialog(false);
      setPointsAmount("");
      setSelectedPlayer(null);
    },
    onError: (err: Error) => {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const followMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", "/api/challenger-follows", { followedId: userId }),
    onSuccess: () => {
      toast({ title: language === "ar" ? "تمت المتابعة!" : "Following!" });
      queryClient.invalidateQueries({ queryKey: ["/api/challenger-follows"] });
    },
    onError: (err: Error) => {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: err.message, variant: "destructive" });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/challenger-follows/${userId}`),
    onSuccess: () => {
      toast({ title: language === "ar" ? "تم إلغاء المتابعة" : "Unfollowed" });
      queryClient.invalidateQueries({ queryKey: ["/api/challenger-follows"] });
    },
    onError: (err: Error) => {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleFollow = (userId: string) => {
    if (followedIds.has(userId)) {
      unfollowMutation.mutate(userId);
    } else {
      followMutation.mutate(userId);
    }
  };

  const handleAddPoints = () => {
    if (!selectedPlayer || !pointsAmount) return;
    addPointsMutation.mutate({
      challengeId,
      targetPlayerId: selectedPlayer,
      pointsAmount: parseInt(pointsAmount),
    });
  };

  const openGiftPanel = (playerId?: string) => {
    if (playerId) setSelectedPlayer(playerId);
    setShowGiftPanel(true);
  };

  const handleSendChat = () => {
    const safeMessage = chatDraft.trim();
    if (!safeMessage || !onSendChat || !canSendChat) return;
    onSendChat(safeMessage);
    setChatDraft("");
  };

  const quickMessages = [
    t("chat.quickMessages.goodMove"),
    t("chat.quickMessages.wellPlayed"),
    t("chat.quickMessages.niceStrategy"),
    t("chat.quickMessages.exciting"),
  ].filter((message) => typeof message === "string" && message.trim().length > 0);

  const handleQuickReplySend = (message: string) => {
    const safeMessage = message.trim();
    if (!safeMessage || !onSendChat || !canSendChat) {
      return;
    }

    onSendChat(safeMessage);
    setChatDraft("");
    setShowQuickReplies(false);
  };

  const formatChatTime = (timestamp: string | number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const normalizedChatMessages = (chatMessages ?? []).slice(-40).map((msg, index) => ({
    ...msg,
    _key: msg.id || `${msg.userId || "msg"}-${index}-${String(msg.timestamp)}`,
  }));

  const groupedChatMessages = normalizedChatMessages.map((msg, index, list) => {
    const previous = index > 0 ? list[index - 1] : undefined;
    const next = index < list.length - 1 ? list[index + 1] : undefined;
    const currentSenderKey = `${String(msg.userId || "")}::${String(msg.username || "")}`;
    const previousSenderKey = previous
      ? `${String(previous.userId || "")}::${String(previous.username || "")}`
      : "";
    const nextSenderKey = next
      ? `${String(next.userId || "")}::${String(next.username || "")}`
      : "";

    return {
      ...msg,
      startsSequence: index === 0 || previousSenderKey !== currentSenderKey,
      endsSequence: index === list.length - 1 || nextSenderKey !== currentSenderKey,
    };
  });

  const renderPlayerCard = (player: Player | undefined, label: string) => {
    if (!player) return null;

    const isFollowing = followedIds.has(player.id);

    return (
      <Card className="mb-3 overflow-hidden border-border/60 bg-background/70 shadow-sm backdrop-blur-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={player.avatarUrl} />
              <AvatarFallback>{player.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{player.username}</p>
              <div className="flex items-center gap-2">
                {player.rating && (
                  <Badge className={cn("text-xs", RANK_COLORS[player.rating.rank])}>
                    {player.rating.winRate}%
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                openGiftPanel(player.id);
              }}
              data-testid={`button-gift-${player.id}`}
            >
              <Gift className="h-4 w-4 me-1" />
              {language === "ar" ? "هدية" : "Gift"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setSelectedPlayer(player.id);
                setShowPointsDialog(true);
              }}
              data-testid={`button-points-${player.id}`}
            >
              <TrendingUp className="h-4 w-4 me-1" />
              {language === "ar" ? "نقاط" : "Points"}
            </Button>
            <Button
              variant={isFollowing ? "secondary" : "outline"}
              size="icon"
              onClick={() => toggleFollow(player.id)}
              data-testid={`button-follow-${player.id}`}
            >
              {isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-full w-full flex-col md:w-72">
      <div className="border-b border-border/60 bg-gradient-to-r from-primary/5 via-transparent to-amber-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <span className="font-semibold">
              {isViewerPanel
                ? (language === "ar" ? "المشاهدة المباشرة" : "Live Spectating")
                : (language === "ar" ? "لوحة المباراة" : "Match Panel")}
            </span>
          </div>
          <Badge variant="secondary" className="rounded-full px-2.5">
            <Eye className="h-3 w-3 me-1" />
            {spectatorCount}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isViewerPanel
            ? (language === "ar" ? "لوحة متابعة سريعة وواضحة للمشاهدين." : "A cleaner, faster match overview for spectators.")
            : (language === "ar" ? "توضيح المشاركين الفعليين والمشاهدين داخل المباراة." : "A clear split between real participants and live viewers.")}
        </p>
      </div>

      <ScrollArea className="flex-1 p-3">
        {/* Live game status */}
        {gameStatus === "playing" && (
          <div className="mb-4 p-2 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {language === "ar" ? "الحركات" : "Moves"}
              </span>
              <span className="font-mono font-bold">{totalMoves ?? 0}</span>
            </div>
            {currentTurn && (
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {currentTurnPlayerName || (language === "ar" ? "لاعب" : "Player")}{" "}
                  {language === "ar" ? "يلعب الآن" : "is playing"}
                </span>
              </div>
            )}
          </div>
        )}
        {gameStatus === "finished" && (
          <div className="mb-4 p-2 rounded-lg bg-muted text-center">
            <span className="text-sm font-medium">
              {language === "ar" ? "انتهت المباراة" : "Match Ended"}
            </span>
          </div>
        )}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {language === "ar" ? "المشاركون" : "Participants"}
            </h4>
            <Badge variant="outline" className="rounded-full px-2 text-[10px]">
              {participantCount}
            </Badge>
          </div>
          {panelPlayers.map((player, index) =>
            renderPlayerCard(
              player,
              language === "ar" ? `لاعب ${index + 1}` : `Player ${index + 1}`,
            ),
          )}
        </div>

        <div className="mb-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            {language === "ar" ? "ملخص المشاهدة" : "Watch Summary"}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{language === "ar" ? "المشاهدون" : "Viewers"}</p>
              <p className="text-sm font-semibold">{spectatorCount}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{language === "ar" ? "مرات الدعم" : "Supports"}</p>
              <p className="text-sm font-semibold">{supportCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{language === "ar" ? "قيمة الدعم" : "Support Value"}</p>
              <p className="text-sm font-semibold truncate">{supportTotalText || "0"}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{language === "ar" ? "الهدايا" : "Gifts"}</p>
              <p className="text-sm font-semibold">{giftCount ?? 0}</p>
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
            <p className="text-[11px] text-muted-foreground">{language === "ar" ? "قيمة الهدايا" : "Gift Value"}</p>
            <p className="text-sm font-semibold">{giftTotalText || "0 VXC"}</p>
          </div>
        </div>

        <div className="mb-2">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageCircle className="h-4 w-4 text-primary" />
            {language === "ar" ? "الدردشة المباشرة" : "Live Match Chat"}
          </h4>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
            {groupedChatMessages.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {language === "ar" ? "لا توجد رسائل حتى الآن" : "No messages yet"}
              </p>
            ) : (
              groupedChatMessages.map((msg) => (
                <div
                  key={msg._key}
                  className={cn(
                    "rounded-md border bg-background/80 px-2.5 py-1.5",
                    msg.startsSequence ? "mt-2 first:mt-0" : "mt-1",
                  )}
                >
                  {msg.startsSequence && (
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{msg.username}</span>
                    </div>
                  )}
                  <p className="text-xs leading-5 break-words">{msg.message}</p>
                  {msg.endsSequence && (
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {formatChatTime(msg.timestamp)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {onSendChat && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={showQuickReplies ? "secondary" : "outline"}
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowQuickReplies((previous) => !previous)}
                  disabled={!canSendChat || quickMessages.length === 0}
                  aria-label={t("chat.quickReplies")}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Input
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder={language === "ar" ? "اكتب رسالة للمشاهدين..." : "Write a message to viewers..."}
                  maxLength={300}
                  disabled={!canSendChat}
                />
                <Button onClick={handleSendChat} disabled={!canSendChat || !chatDraft.trim()}>
                  {language === "ar" ? "إرسال" : "Send"}
                </Button>
              </div>
              {showQuickReplies && quickMessages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quickMessages.map((message) => (
                    <Button
                      key={message}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => handleQuickReplySend(message)}
                      disabled={!canSendChat}
                    >
                      {message}
                    </Button>
                  ))}
                </div>
              )}
              {!canSendChat && (
                <p className="text-xs text-muted-foreground">
                  {language === "ar" ? "سجّل الدخول للمشاركة في الدردشة المباشرة." : "Sign in to participate in live chat."}
                </p>
              )}
            </div>
          )}
        </div>

      </ScrollArea>

      <div className="border-t border-border/60 bg-background/80 p-3 backdrop-blur-sm">
        <Button
          variant="outline"
          className="h-12 w-full gap-2 rounded-xl border-primary/30 bg-gradient-to-r from-primary/5 to-amber-500/5"
          onClick={() => openGiftPanel()}
          data-testid="open-gift-panel"
        >
          <Gift className="h-5 w-5 text-primary" />
          {language === "ar" ? "إرسال هدية" : "Send a Gift"}
        </Button>
      </div>

      <FullScreenGiftPanel
        open={showGiftPanel}
        onClose={() => { setShowGiftPanel(false); setSelectedPlayer(null); }}
        onSendGift={onSendGift || (() => { })}
        player1Id={player1?.id}
        player2Id={player2?.id}
        player3Id={player3?.id}
        player4Id={player4?.id}
        player1Name={player1?.username}
        player2Name={player2?.username}
        player3Name={player3?.username}
        player4Name={player4?.username}
        player1Avatar={player1?.avatarUrl}
        player2Avatar={player2?.avatarUrl}
        player3Avatar={player3?.avatarUrl}
        player4Avatar={player4?.avatarUrl}
      />

      <Dialog open={showPointsDialog} onOpenChange={setShowPointsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ar" ? "إضافة نقاط للتحدي" : "Add Challenge Points"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {language === "ar"
                ? "أضف نقاط لرفع مستوى التحدي على هذا اللاعب"
                : "Add points to boost the challenge level for this player"}
            </p>

            <div>
              <label className="text-sm font-medium">
                {language === "ar" ? "عدد النقاط" : "Points Amount"}
              </label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                placeholder="100"
                data-testid="input-points-amount"
              />
            </div>

            <div className="flex gap-2">
              {[10, 50, 100, 500].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setPointsAmount(String(amount))}
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPointsDialog(false);
              setPointsAmount("");
              setSelectedPlayer(null);
            }}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleAddPoints}
              disabled={!pointsAmount || addPointsMutation.isPending}
            >
              <TrendingUp className="h-4 w-4 me-2" />
              {language === "ar" ? "إضافة" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
