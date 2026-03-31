import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Heart,
  Flame,
  Trophy,
  Crown,
  Rocket,
  Gem,
  Star,
  Zap,
  Gift,
  ThumbsUp,
  PartyPopper,
  Coffee,
  Coins,
  X,
  Send,
  Sparkles,
} from "lucide-react";

/* ─── Gift catalog ─── */
interface GiftDef {
  id: string;
  icon: string;
  name: string;
  nameAr: string;
  price: number;
  color: string;         // tailwind text class
  bgColor: string;       // tailwind bg class for the circle
  animation: "bounce" | "spin" | "pulse" | "shake" | "float";
}

const ALL_GIFTS: GiftDef[] = [
  { id: "rose",          icon: "heart",       name: "Rose",      nameAr: "وردة",      price: 1,    color: "text-red-500",    bgColor: "bg-red-500/15",    animation: "pulse" },
  { id: "finger_heart",  icon: "thumbsUp",    name: "Like",      nameAr: "إعجاب",     price: 5,    color: "text-blue-500",   bgColor: "bg-blue-500/15",   animation: "bounce" },
  { id: "ice_cream",     icon: "gem",         name: "Ice Cream", nameAr: "آيس كريم",  price: 5,    color: "text-cyan-400",   bgColor: "bg-cyan-400/15",   animation: "bounce" },
  { id: "doughnut",      icon: "coffee",      name: "Coffee",    nameAr: "قهوة",      price: 10,   color: "text-amber-600",  bgColor: "bg-amber-600/15",  animation: "shake" },
  { id: "wishing_bottle", icon: "star",       name: "Star",      nameAr: "نجمة",      price: 10,   color: "text-yellow-400", bgColor: "bg-yellow-400/15", animation: "spin" },
  { id: "sunglasses",    icon: "zap",         name: "Energy",    nameAr: "طاقة",      price: 20,   color: "text-yellow-300", bgColor: "bg-yellow-300/15", animation: "pulse" },
  { id: "party",         icon: "partyPopper", name: "Party",     nameAr: "حفلة",      price: 50,   color: "text-pink-500",   bgColor: "bg-pink-500/15",   animation: "shake" },
  { id: "fire",          icon: "flame",       name: "Fire",      nameAr: "نار",       price: 50,   color: "text-orange-500", bgColor: "bg-orange-500/15", animation: "pulse" },
  { id: "diamond",       icon: "gem",         name: "Diamond",   nameAr: "ألماس",     price: 100,  color: "text-purple-400", bgColor: "bg-purple-400/15", animation: "spin" },
  { id: "crown",         icon: "crown",       name: "Crown",     nameAr: "تاج",       price: 200,  color: "text-yellow-500", bgColor: "bg-yellow-500/15", animation: "float" },
  { id: "rocket",        icon: "rocket",      name: "Rocket",    nameAr: "صاروخ",     price: 500,  color: "text-blue-400",   bgColor: "bg-blue-400/15",   animation: "bounce" },
  { id: "trophy",        icon: "trophy",      name: "Trophy",    nameAr: "كأس",       price: 1000, color: "text-yellow-400", bgColor: "bg-yellow-400/15", animation: "shake" },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  flame: Flame,
  trophy: Trophy,
  crown: Crown,
  rocket: Rocket,
  gem: Gem,
  star: Star,
  zap: Zap,
  thumbsUp: ThumbsUp,
  partyPopper: PartyPopper,
  coffee: Coffee,
  sparkles: Sparkles,
  gift: Gift,
};

/* ─── Props ─── */
interface FullScreenGiftPanelProps {
  open: boolean;
  onClose: () => void;
  onSendGift: (giftId: string, playerId: string) => void;
  player1Id?: string;
  player2Id?: string;
  player1Name?: string;
  player2Name?: string;
  player1Avatar?: string;
  player2Avatar?: string;
  disabled?: boolean;
}

export function FullScreenGiftPanel({
  open,
  onClose,
  onSendGift,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  player1Avatar,
  player2Avatar,
  disabled,
}: FullScreenGiftPanelProps) {
  const { language } = useI18n();
  const isRTL = language === "ar";

  const [selectedGift, setSelectedGift] = useState<GiftDef | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleGiftClick = useCallback((gift: GiftDef) => {
    setSelectedGift((prev) => (prev?.id === gift.id ? null : gift));
  }, []);

  const handlePlayerClick = useCallback((pid: string) => {
    setSelectedPlayer((prev) => (prev === pid ? null : pid));
  }, []);

  const handleSend = useCallback(() => {
    if (!selectedGift || !selectedPlayer || disabled) return;
    setSending(true);
    onSendGift(selectedGift.id, selectedPlayer);
    // brief visual feedback
    setTimeout(() => {
      setSending(false);
      setSelectedGift(null);
      onClose();
    }, 400);
  }, [selectedGift, selectedPlayer, disabled, onSendGift, onClose]);

  // Auto-select lone player
  const autoPlayer = player1Id && !player2Id ? player1Id : player2Id && !player1Id ? player2Id : null;
  const effectivePlayer = selectedPlayer ?? autoPlayer;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex flex-col h-full max-w-md mx-auto w-full animate-in slide-in-from-bottom duration-300">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {isRTL ? "إرسال هدية" : "Send Gift"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* ─── Player selection ─── */}
        <div className="px-4 pb-3">
          <p className="text-xs text-white/50 mb-2">
            {isRTL ? "اختر المستلم" : "Choose recipient"}
          </p>
          <div className="flex gap-3">
            {player1Id && (
              <button
                onClick={() => handlePlayerClick(player1Id)}
                className={cn(
                  "flex-1 flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all",
                  effectivePlayer === player1Id
                    ? "border-primary bg-primary/15 shadow-lg shadow-primary/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={player1Avatar} />
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {player1Name?.[0]?.toUpperCase() || "1"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-white truncate">
                  {player1Name || "Player 1"}
                </span>
              </button>
            )}
            {player2Id && (
              <button
                onClick={() => handlePlayerClick(player2Id)}
                className={cn(
                  "flex-1 flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all",
                  effectivePlayer === player2Id
                    ? "border-primary bg-primary/15 shadow-lg shadow-primary/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                )}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={player2Avatar} />
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {player2Name?.[0]?.toUpperCase() || "2"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-white truncate">
                  {player2Name || "Player 2"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ─── 3×4 Gift Grid ─── */}
        <div className="flex-1 px-4 flex flex-col justify-center">
          <div className="grid grid-cols-3 gap-3">
            {ALL_GIFTS.map((gift) => {
              const IconComponent = ICON_MAP[gift.icon] || Gift;
              const isSelected = selectedGift?.id === gift.id;

              return (
                <button
                  key={gift.id}
                  onClick={() => handleGiftClick(gift)}
                  disabled={disabled}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all",
                    "active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/25 scale-105"
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  {/* Icon circle */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-transform",
                      gift.bgColor,
                      isSelected && gift.animation === "bounce" && "animate-bounce",
                      isSelected && gift.animation === "pulse" && "animate-pulse",
                      isSelected && gift.animation === "spin" && "animate-spin",
                      isSelected && gift.animation === "shake" && "animate-pulse",
                      isSelected && gift.animation === "float" && "animate-bounce"
                    )}
                  >
                    <IconComponent className={cn("w-6 h-6", gift.color)} />
                  </div>

                  {/* Name */}
                  <span className="text-xs font-medium text-white/80 leading-tight">
                    {isRTL ? gift.nameAr : gift.name}
                  </span>

                  {/* Price */}
                  <div className="flex items-center gap-0.5">
                    <Coins className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs font-bold text-yellow-400">
                      ${gift.price}
                    </span>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Bottom: Send bar ─── */}
        <div className="px-4 py-4">
          <Button
            onClick={handleSend}
            disabled={!selectedGift || !effectivePlayer || disabled || sending}
            className={cn(
              "w-full h-14 text-base font-bold gap-2 rounded-2xl transition-all",
              selectedGift && effectivePlayer
                ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
                : "bg-white/10 text-white/40"
            )}
            data-testid="button-send-gift-fullscreen"
          >
            {sending ? (
              <>
                <Sparkles className="h-5 w-5 animate-spin" />
                {isRTL ? "جاري الإرسال..." : "Sending..."}
              </>
            ) : selectedGift ? (
              <>
                <Send className="h-5 w-5" />
                {isRTL ? "إرسال" : "Send"}{" "}
                {isRTL ? selectedGift.nameAr : selectedGift.name}{" "}
                <Badge variant="secondary" className="ms-1 bg-white/20 text-white border-0">
                  ${selectedGift.price}
                </Badge>
              </>
            ) : (
              <>
                <Gift className="h-5 w-5" />
                {isRTL ? "اختر هدية" : "Select a gift"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { ALL_GIFTS, ICON_MAP as GIFT_ICON_MAP };
