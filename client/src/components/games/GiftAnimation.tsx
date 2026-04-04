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
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);

  useEffect(() => {
    if (gift) {
      setIsVisible(true);

      const newParticles = Array.from({ length: 24 }, (_, i) => ({
        id: i,
        x: Math.random() * 220 - 110,
        y: Math.random() * 220 - 110,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 280,
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 1500);

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,205,90,0.22),transparent_52%)] gift-aurora" />

      <div
        className={cn(
          "relative rounded-2xl p-6 shadow-2xl border border-white/20",
          "bg-[linear-gradient(150deg,rgba(26,16,55,0.92),rgba(6,9,28,0.9))]",
          "animate-in zoom-in-50 fade-in duration-300 gift-pop-card"
        )}
      >
        <div className="absolute inset-0 rounded-2xl border border-white/20 opacity-70 gift-glare" />
        <div className="absolute inset-0 rounded-2xl gift-shockwave" />

        {particles.map((particle) => (
          <div
            key={particle.id}
            className={cn(
              "absolute rounded-full shadow-xl",
              iconColor.replace("text-", "bg-")
            )}
            style={{
              left: "50%",
              top: "50%",
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animation: `gift-particle-fly 1300ms cubic-bezier(0.19, 1, 0.22, 1) forwards`,
              animationDelay: `${particle.delay}ms`,
              transform: `translate(${particle.x}px, ${particle.y}px)`,
            }}
          />
        ))}

        <div className="text-center space-y-3">
          <div
            className={cn(
              "mx-auto w-24 h-24 rounded-full flex items-center justify-center",
              "bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.45),rgba(255,255,255,0.12)_35%,rgba(20,20,40,0.25)_70%)]",
              "border border-white/35 shadow-[0_20px_50px_rgba(6,10,24,0.55)]",
              "gift-orb-3d"
            )}
          >
            <IconComponent className={cn("w-14 h-14 drop-shadow-2xl", iconColor)} />
          </div>

          <div className="space-y-1">
            <p className="text-xl font-extrabold text-white tracking-wide">
              {gift.quantity > 1 ? `${gift.quantity}x ` : ""}{giftName}
            </p>
            <p className="text-sm text-white/80">
              {language === "ar" ? "من" : "from"}{" "}
              <span className="font-semibold text-yellow-300">{gift.senderUsername}</span>
            </p>
          </div>

          {gift.message && (
            <p className="text-sm italic text-white/75 max-w-xs">
              "{gift.message}"
            </p>
          )}

          <div className="flex items-center justify-center gap-1 text-xs text-white/75">
            <Sparkles className="w-3 h-3 text-yellow-300" />
            <span>${parseFloat(gift.giftItem.price).toFixed(2)}</span>
            <Sparkles className="w-3 h-3 text-yellow-300" />
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
