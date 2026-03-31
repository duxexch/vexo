import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Sparkles,
  ThumbsUp,
  PartyPopper,
  Music2,
  Coffee,
  Pizza,
  Coins,
} from "lucide-react";

interface TikTokGift {
  id: string;
  icon: string;
  name: string;
  nameAr: string;
  price: number;
  color: string;
  animation: "bounce" | "spin" | "pulse" | "shake" | "float";
}

const TIKTOK_GIFTS: TikTokGift[] = [
  { id: "rose", icon: "heart", name: "Rose", nameAr: "وردة", price: 1, color: "text-red-500", animation: "pulse" },
  { id: "ice_cream", icon: "gem", name: "Ice Cream", nameAr: "آيس كريم", price: 5, color: "text-cyan-400", animation: "bounce" },
  { id: "finger_heart", icon: "thumbsUp", name: "Like", nameAr: "إعجاب", price: 5, color: "text-blue-500", animation: "bounce" },
  { id: "doughnut", icon: "coffee", name: "Coffee", nameAr: "قهوة", price: 10, color: "text-amber-600", animation: "shake" },
  { id: "wishing_bottle", icon: "star", name: "Star", nameAr: "نجمة", price: 10, color: "text-yellow-400", animation: "spin" },
  { id: "sunglasses", icon: "zap", name: "Energy", nameAr: "طاقة", price: 20, color: "text-yellow-300", animation: "pulse" },
  { id: "party", icon: "partyPopper", name: "Party", nameAr: "حفلة", price: 50, color: "text-pink-500", animation: "shake" },
  { id: "fire", icon: "flame", name: "Fire", nameAr: "نار", price: 50, color: "text-orange-500", animation: "pulse" },
  { id: "diamond", icon: "gem", name: "Diamond", nameAr: "ألماس", price: 100, color: "text-purple-400", animation: "spin" },
  { id: "crown", icon: "crown", name: "Crown", nameAr: "تاج", price: 200, color: "text-yellow-500", animation: "float" },
  { id: "rocket", icon: "rocket", name: "Rocket", nameAr: "صاروخ", price: 500, color: "text-blue-400", animation: "bounce" },
  { id: "trophy", icon: "trophy", name: "Trophy", nameAr: "كأس", price: 1000, color: "text-yellow-400", animation: "shake" },
];

const ICON_MAP: Record<string, any> = {
  heart: Heart,
  flame: Flame,
  trophy: Trophy,
  crown: Crown,
  rocket: Rocket,
  gem: Gem,
  star: Star,
  zap: Zap,
  sparkles: Sparkles,
  thumbsUp: ThumbsUp,
  partyPopper: PartyPopper,
  music: Music2,
  coffee: Coffee,
  pizza: Pizza,
  coins: Coins,
  gift: Gift,
};

interface FloatingGift {
  id: number;
  gift: TikTokGift;
  x: number;
  startY: number;
  duration: number;
  delay: number;
  scale: number;
}

interface TikTokGiftBarProps {
  onSendGift: (giftId: string, playerId: string) => void;
  player1Id?: string;
  player2Id?: string;
  player1Name?: string;
  player2Name?: string;
  disabled?: boolean;
  className?: string;
}

export function TikTokGiftBar({
  onSendGift,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  disabled,
  className,
}: TikTokGiftBarProps) {
  const { language } = useI18n();
  const [selectedGift, setSelectedGift] = useState<TikTokGift | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleGiftClick = (gift: TikTokGift) => {
    if (selectedGift?.id === gift.id) {
      setSelectedGift(null);
      setSelectedPlayer(null);
    } else {
      setSelectedGift(gift);
      if (player1Id && !player2Id) {
        setSelectedPlayer(player1Id);
      } else if (player2Id && !player1Id) {
        setSelectedPlayer(player2Id);
      }
    }
  };

  const handleSend = () => {
    if (selectedGift && selectedPlayer) {
      onSendGift(selectedGift.id, selectedPlayer);
      setSelectedGift(null);
      setSelectedPlayer(null);
    }
  };

  return (
    <div className={cn("bg-background/80 backdrop-blur-sm border-t", className)}>
      {selectedGift && (
        <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {language === "ar" ? "إرسال إلى:" : "Send to:"}
            </span>
            {player1Id && (
              <Button
                size="sm"
                variant={selectedPlayer === player1Id ? "default" : "outline"}
                onClick={() => setSelectedPlayer(player1Id)}
                data-testid="button-gift-player1"
              >
                {player1Name || "Player 1"}
              </Button>
            )}
            {player2Id && (
              <Button
                size="sm"
                variant={selectedPlayer === player2Id ? "default" : "outline"}
                onClick={() => setSelectedPlayer(player2Id)}
                data-testid="button-gift-player2"
              >
                {player2Name || "Player 2"}
              </Button>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!selectedPlayer || disabled}
            className="gap-1"
            data-testid="button-send-gift"
          >
            <Gift className="w-4 h-4" />
            {language === "ar" ? "إرسال" : "Send"} ({selectedGift.price} 
            <Coins className="w-3 h-3" />)
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-1 p-2 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {TIKTOK_GIFTS.map((gift) => {
          const IconComponent = ICON_MAP[gift.icon] || Gift;
          const isSelected = selectedGift?.id === gift.id;

          return (
            <Button
              key={gift.id}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => handleGiftClick(gift)}
              className={cn(
                "flex-shrink-0 flex-col gap-0.5 toggle-elevate",
                isSelected && "toggle-elevated ring-2 ring-primary"
              )}
              aria-pressed={isSelected}
              data-testid={`tiktok-gift-${gift.id}`}
            >
              <div
                className={cn(
                  "p-1.5 rounded-full bg-muted/50 transition-transform",
                  isSelected && gift.animation === "bounce" && "animate-bounce",
                  isSelected && gift.animation === "pulse" && "animate-pulse",
                  isSelected && gift.animation === "spin" && "animate-spin"
                )}
              >
                <IconComponent className={cn("w-5 h-5", gift.color)} />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {gift.price}
                <Coins className="w-2 h-2 inline ms-0.5" />
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

interface FloatingGiftsOverlayProps {
  gifts: Array<{ id: string; giftId: string; senderName: string }>;
}

export function FloatingGiftsOverlay({ gifts }: FloatingGiftsOverlayProps) {
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    if (gifts.length === 0) return;

    const lastGift = gifts[gifts.length - 1];
    const giftConfig = TIKTOK_GIFTS.find((g) => g.id === lastGift.giftId);
    if (!giftConfig) return;

    const newFloatingGifts: FloatingGift[] = Array.from({ length: 5 }, () => ({
      id: counterRef.current++,
      gift: giftConfig,
      x: Math.random() * 80 + 10,
      startY: 100,
      duration: 2000 + Math.random() * 1000,
      delay: Math.random() * 500,
      scale: 0.8 + Math.random() * 0.6,
    }));

    setFloatingGifts((prev) => [...prev, ...newFloatingGifts]);

    const timer = setTimeout(() => {
      setFloatingGifts((prev) =>
        prev.filter((g) => !newFloatingGifts.some((ng) => ng.id === g.id))
      );
    }, 4000);

    return () => clearTimeout(timer);
  }, [gifts.length]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
      {floatingGifts.map((fg) => {
        const IconComponent = ICON_MAP[fg.gift.icon] || Gift;
        return (
          <div
            key={fg.id}
            className="absolute"
            style={{
              left: `${fg.x}%`,
              bottom: 0,
              animation: `float-up ${fg.duration}ms ease-out forwards`,
              animationDelay: `${fg.delay}ms`,
              transform: `scale(${fg.scale})`,
            }}
          >
            <div className={cn("p-2 rounded-full bg-background/80 backdrop-blur-sm shadow-lg", fg.gift.animation === "spin" && "animate-spin")}>
              <IconComponent className={cn("w-8 h-8", fg.gift.color)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GiftComboDisplayProps {
  senderName: string;
  giftName: string;
  giftIcon: string;
  comboCount: number;
  color: string;
}

export function GiftComboDisplay({
  senderName,
  giftName,
  giftIcon,
  comboCount,
  color,
}: GiftComboDisplayProps) {
  const IconComponent = ICON_MAP[giftIcon] || Gift;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-background/90 backdrop-blur-sm border shadow-lg animate-in slide-in-from-left duration-300">
      <div className={cn("p-1.5 rounded-full bg-muted")}>
        <IconComponent className={cn("w-6 h-6", color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{senderName}</p>
        <p className="text-xs text-muted-foreground">{giftName}</p>
      </div>
      {comboCount > 1 && (
        <Badge variant="secondary" className="text-lg font-bold">
          x{comboCount}
        </Badge>
      )}
    </div>
  );
}

export { TIKTOK_GIFTS, ICON_MAP };
