import { useState, useEffect } from "react";
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
} from "lucide-react";

interface GiftItem {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  price: string;
}

interface GiftAnimationEvent {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  giftItem: GiftItem;
  quantity: number;
  message?: string;
}

interface GiftAnimationProps {
  gift: GiftAnimationEvent | null;
  onComplete?: () => void;
}

const GIFT_ICONS: Record<string, any> = {
  heart: Heart,
  flame: Flame,
  trophy: Trophy,
  crown: Crown,
  rocket: Rocket,
  gem: Gem,
  star: Star,
  zap: Zap,
  sparkles: Sparkles,
  gift: Gift,
};

const GIFT_COLORS: Record<string, string> = {
  heart: "text-red-500",
  flame: "text-orange-500",
  trophy: "text-yellow-500",
  crown: "text-yellow-400",
  rocket: "text-blue-500",
  gem: "text-purple-500",
  star: "text-yellow-400",
  zap: "text-yellow-300",
  sparkles: "text-pink-400",
  gift: "text-primary",
};

export function GiftAnimation({ gift, onComplete }: GiftAnimationProps) {
  const { language } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    if (gift) {
      setIsVisible(true);
      
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [gift, onComplete]);

  if (!gift || !isVisible) return null;

  const iconName = gift.giftItem.icon?.toLowerCase() || "gift";
  const IconComponent = GIFT_ICONS[iconName] || Gift;
  const iconColor = GIFT_COLORS[iconName] || "text-primary";
  const giftName = language === "ar" ? gift.giftItem.nameAr || gift.giftItem.name : gift.giftItem.name;

  return (
    <div 
      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
      data-testid="gift-animation-overlay"
    >
      <div 
        className={cn(
          "relative bg-background/95 backdrop-blur-sm rounded-xl p-6 shadow-2xl border-2 border-primary/30",
          "animate-in zoom-in-50 fade-in duration-300"
        )}
      >
        {particles.map((particle) => (
          <div
            key={particle.id}
            className={cn(
              "absolute w-2 h-2 rounded-full",
              iconColor.replace("text-", "bg-")
            )}
            style={{
              left: "50%",
              top: "50%",
              animation: `particle-fly 1s ease-out forwards`,
              transform: `translate(${particle.x}px, ${particle.y}px)`,
            }}
          />
        ))}

        <div className="text-center space-y-3">
          <div 
            className={cn(
              "mx-auto w-20 h-20 rounded-full flex items-center justify-center",
              "bg-gradient-to-br from-primary/20 to-primary/5",
              "animate-bounce"
            )}
          >
            <IconComponent className={cn("w-12 h-12", iconColor)} />
          </div>

          <div className="space-y-1">
            <p className="text-lg font-bold">
              {gift.quantity > 1 ? `${gift.quantity}x ` : ""}{giftName}
            </p>
            <p className="text-sm text-muted-foreground">
              {language === "ar" ? "من" : "from"}{" "}
              <span className="font-medium text-foreground">{gift.senderUsername}</span>
            </p>
          </div>

          {gift.message && (
            <p className="text-sm italic text-muted-foreground max-w-xs">
              "{gift.message}"
            </p>
          )}

          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            <span>${parseFloat(gift.giftItem.price).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GiftFloatingIcon({ icon, className }: { icon: string; className?: string }) {
  const IconComponent = GIFT_ICONS[icon?.toLowerCase()] || Gift;
  const iconColor = GIFT_COLORS[icon?.toLowerCase()] || "text-primary";

  return <IconComponent className={cn("w-4 h-4", iconColor, className)} />;
}
