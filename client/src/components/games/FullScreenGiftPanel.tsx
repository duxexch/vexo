import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
  onSendGift: (giftId: string, playerId: string, meta?: { price?: number; name?: string }) => void;
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

  const { data: giftCatalog = [] } = useQuery<Array<{
    id: string;
    name: string;
    nameAr?: string;
    iconUrl?: string;
    price: string;
    animationType?: string;
    isActive?: boolean;
  }>>({
    queryKey: ["/api/gifts"],
  });

  const allGifts: GiftDef[] = giftCatalog
    .filter((gift) => gift.isActive !== false)
    .slice(0, 12)
    .map((gift) => ({
      id: gift.id,
      icon: gift.iconUrl || "gift",
      name: gift.name,
      nameAr: gift.nameAr || gift.name,
      price: Number(gift.price || 0),
      color: "text-primary",
      bgColor: "bg-primary/15",
      animation: gift.animationType === "spin"
        ? "spin"
        : gift.animationType === "burst"
          ? "shake"
          : gift.animationType === "rain"
            ? "float"
            : "pulse",
    }));

  const handleGiftClick = useCallback((gift: GiftDef) => {
    setSelectedGift((prev) => (prev?.id === gift.id ? null : gift));
  }, []);

  const handlePlayerClick = useCallback((pid: string) => {
    setSelectedPlayer((prev) => (prev === pid ? null : pid));
  }, []);

  const handleSend = useCallback(() => {
    if (!selectedGift || !selectedPlayer || disabled) return;
    setSending(true);
    onSendGift(selectedGift.id, selectedPlayer, {
      price: selectedGift.price,
      name: selectedGift.name,
    });
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
      <div className="relative z-10 mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-black/90 backdrop-blur-md animate-in slide-in-from-bottom duration-300">

        {/* ─── Header ─── */}
        <div className="shrink-0 border-b border-white/10 px-4 pt-4 pb-3 bg-gradient-to-r from-primary/20 via-transparent to-amber-400/10">
          <div className="flex items-center justify-between">
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
          <p className="mt-1 text-xs text-white/65">
            {isRTL ? "اختر الهدية والمستلم ثم أرسل مباشرة داخل المباراة" : "Choose a gift and recipient, then send instantly in the live match"}
          </p>
        </div>

        {/* ─── Player selection ─── */}
        <div className="shrink-0 px-4 pb-3 pt-2">
          <p className="text-xs text-white/50 mb-2">
            {isRTL ? "اختر المستلم" : "Choose recipient"}
          </p>
          <div className="grid grid-cols-2 gap-3">
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 overscroll-contain">
          <div className="grid grid-cols-3 gap-3 content-start">
            {allGifts.map((gift) => {
              const IconComponent = ICON_MAP[gift.icon] || Gift;
              const isSelected = selectedGift?.id === gift.id;

              return (
                <button
                  key={gift.id}
                  onClick={() => handleGiftClick(gift)}
                  disabled={disabled}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all gift-card-3d",
                    "active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-[0_18px_45px_rgba(10,8,35,0.5)] scale-105"
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  {/* Icon circle */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-transform gift-icon-3d",
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
                      {gift.price.toFixed(2)} VXC
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

            {allGifts.length === 0 && (
              <div className="col-span-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/70">
                {isRTL ? "لا توجد هدايا متاحة الآن" : "No gifts available right now"}
              </div>
            )}
          </div>
        </div>

        {/* ─── Bottom: Send bar ─── */}
        <div className="shrink-0 border-t border-white/10 bg-black/55 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] backdrop-blur-xl">
          <div className="mb-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 flex items-center justify-between">
            <span>
              {isRTL ? "المستلم:" : "Recipient:"} <span className="font-semibold text-white">{effectivePlayer === player1Id ? (player1Name || "Player 1") : effectivePlayer === player2Id ? (player2Name || "Player 2") : (isRTL ? "غير محدد" : "Not selected")}</span>
            </span>
            <span>
              {isRTL ? "الهدية:" : "Gift:"} <span className="font-semibold text-white">{selectedGift ? (isRTL ? selectedGift.nameAr : selectedGift.name) : (isRTL ? "غير محددة" : "Not selected")}</span>
            </span>
          </div>
          <Button
            onClick={handleSend}
            disabled={!selectedGift || !effectivePlayer || disabled || sending}
            className={cn(
              "w-full h-14 text-base font-bold gap-2 rounded-2xl transition-all gift-send-button",
              selectedGift && effectivePlayer
                ? "bg-primary hover:bg-primary/90 shadow-[0_18px_45px_rgba(30,20,85,0.5)]"
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
                  {selectedGift.price.toFixed(2)} VXC
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

export { ICON_MAP as GIFT_ICON_MAP };
