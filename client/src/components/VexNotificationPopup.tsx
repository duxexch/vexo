/**
 * VexNotificationPopup — Professional mobile-first popup notification system
 * 
 * Features:
 * - iOS/Android-style banner notifications at the top of the screen
 * - Responsive to all screen sizes
 * - Type-specific icons and color accents
 * - Auto-dismiss with progress bar
 * - Swipe-to-dismiss on mobile (touch support)
 * - Stacking multiple notifications with smooth animations
 * - RTL support
 * - Distinctive sounds per notification type
 */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { useI18n } from "@/lib/i18n";
import { navigateToSafeNotificationLink, normalizeSafeNotificationLink } from "@/lib/notifications";
import {
  Bell,
  DollarSign,
  Shield,
  Megaphone,
  MessageCircle,
  Swords,
  Headset,
  AlertTriangle,
  Trophy,
  Gift,
  Zap,
  ArrowLeftRight,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

/* ═══════════════ Types ═══════════════ */
export type NotifPopupType =
  | "transaction"
  | "p2p"
  | "security"
  | "warning"
  | "announcement"
  | "promotion"
  | "system"
  | "chat"
  | "challenge"
  | "support"
  | "success"
  | "game"
  | "level_up"
  | "info";

export type NotifPriority = "urgent" | "high" | "normal" | "low";

export interface NotifPopupData {
  id: string;
  type: NotifPopupType;
  priority: NotifPriority;
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  icon?: React.ReactNode;
  link?: string;
  duration?: number; // ms, default 5000
  timestamp?: number;
}

interface InternalNotif extends NotifPopupData {
  createdAt: number;
  dismissing: boolean;
  swipeX: number;
}

/* ═══════════════ Config Maps ═══════════════ */
const TYPE_ICON: Record<NotifPopupType, LucideIcon> = {
  transaction: DollarSign,
  p2p: ArrowLeftRight,
  security: Shield,
  warning: AlertTriangle,
  announcement: Megaphone,
  promotion: Gift,
  system: Bell,
  chat: MessageCircle,
  challenge: Swords,
  support: Headset,
  success: CheckCircle2,
  game: Trophy,
  level_up: Zap,
  info: Info,
};

const TYPE_ACCENT: Record<NotifPopupType, string> = {
  transaction: "from-amber-500 to-yellow-400",
  p2p: "from-blue-500 to-cyan-400",
  security: "from-red-600 to-rose-500",
  warning: "from-orange-500 to-amber-400",
  announcement: "from-indigo-500 to-purple-400",
  promotion: "from-pink-500 to-rose-400",
  system: "from-slate-500 to-gray-400",
  chat: "from-green-500 to-emerald-400",
  challenge: "from-violet-600 to-purple-500",
  support: "from-teal-500 to-cyan-400",
  success: "from-green-600 to-emerald-500",
  game: "from-yellow-500 to-orange-400",
  level_up: "from-fuchsia-500 to-pink-400",
  info: "from-sky-500 to-blue-400",
};

const TYPE_ICON_BG: Record<NotifPopupType, string> = {
  transaction: "bg-amber-500/20 text-amber-400",
  p2p: "bg-blue-500/20 text-blue-400",
  security: "bg-red-500/20 text-red-400",
  warning: "bg-orange-500/20 text-orange-400",
  announcement: "bg-indigo-500/20 text-indigo-400",
  promotion: "bg-pink-500/20 text-pink-400",
  system: "bg-slate-500/20 text-slate-400",
  chat: "bg-green-500/20 text-green-400",
  challenge: "bg-violet-500/20 text-violet-400",
  support: "bg-teal-500/20 text-teal-400",
  success: "bg-green-600/20 text-green-400",
  game: "bg-yellow-500/20 text-yellow-400",
  level_up: "bg-fuchsia-500/20 text-fuchsia-400",
  info: "bg-sky-500/20 text-sky-400",
};

const PRIORITY_RING: Record<NotifPriority, string> = {
  urgent: "ring-2 ring-red-500/60 shadow-red-500/20",
  high: "ring-1 ring-orange-400/40 shadow-orange-400/10",
  normal: "",
  low: "",
};

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 5000;
const URGENT_DURATION = 10000;

/* ═══════════════ Context ═══════════════ */
interface NotifPopupContextType {
  showPopup: (data: Omit<NotifPopupData, "id">) => void;
  dismissAll: () => void;
}

const NotifPopupContext = createContext<NotifPopupContextType>({
  showPopup: () => { },
  dismissAll: () => { },
});

export function useNotifPopup() {
  return useContext(NotifPopupContext);
}

/* ═══════════════ Single Notification Card ═══════════════ */
function NotifCard({
  notif,
  index,
  onDismiss,
  onClick,
}: {
  notif: InternalNotif;
  index: number;
  onDismiss: (id: string) => void;
  onClick: (notif: InternalNotif) => void;
}) {
  const progressRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const duration = notif.duration || (notif.priority === "urgent" ? URGENT_DURATION : DEFAULT_DURATION);
  const Icon = TYPE_ICON[notif.type] || Bell;
  const { language } = useI18n();
  const isAr = language === "ar";
  const localizedTitle = isAr && notif.titleAr ? notif.titleAr : notif.title;
  const localizedMessage = isAr && notif.messageAr ? notif.messageAr : notif.message;

  // Auto-dismiss timer with progress bar
  useEffect(() => {
    if (notif.dismissing) return;
    const start = Date.now();
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      if (progressRef.current) {
        progressRef.current.style.width = `${100 - pct}%`;
      }
      if (elapsed >= duration) {
        onDismiss(notif.id);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [notif.id, notif.dismissing, duration, onDismiss]);

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    if (dy > Math.abs(dx)) { setSwiping(false); return; }
    setSwipeOffset(dx);
  };

  const handleTouchEnd = () => {
    if (Math.abs(swipeOffset) > 100) {
      onDismiss(notif.id);
    } else {
      setSwipeOffset(0);
    }
    setSwiping(false);
  };

  const opacity = notif.dismissing ? 0 : Math.max(0, 1 - Math.abs(swipeOffset) / 200);
  const accentGradient = TYPE_ACCENT[notif.type] || TYPE_ACCENT.system;
  const iconBg = TYPE_ICON_BG[notif.type] || TYPE_ICON_BG.system;
  const priorityRing = PRIORITY_RING[notif.priority] || "";

  return (
    <div
      role="alert"
      aria-live={notif.priority === "urgent" ? "assertive" : "polite"}
      className={`
        w-full max-w-[min(420px,calc(100vw-1.5rem))] mx-auto
        transform transition-all duration-300 ease-out cursor-pointer select-none
        ${notif.dismissing ? "translate-y-[-20px] opacity-0 scale-95" : "translate-y-0 opacity-100 scale-100"}
      `}
      style={{
        transform: `translateX(${swipeOffset}px) ${notif.dismissing ? "translateY(-20px) scale(0.95)" : ""}`,
        opacity,
        zIndex: 10000 - index,
        marginTop: index > 0 ? "8px" : "0",
      }}
      onClick={() => onClick(notif)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`
          relative overflow-hidden rounded-2xl 
          bg-card/95 backdrop-blur-xl border border-border/50
          shadow-2xl shadow-black/20
          ${priorityRing}
          transition-shadow duration-200
          hover:shadow-3xl hover:shadow-black/30
        `}
      >
        {/* Top accent gradient line */}
        <div className={`absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r ${accentGradient}`} />

        <div className="flex items-start gap-3 p-3.5 pe-4">
          {/* Icon */}
          <div className={`
            flex-shrink-0 flex items-center justify-center
            w-10 h-10 rounded-xl ${iconBg}
            ${notif.priority === "urgent" ? "animate-pulse" : ""}
          `}>
            {notif.icon || <Icon className="w-5 h-5" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground truncate leading-tight">
                {localizedTitle}
              </h4>
              <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 tabular-nums">
                {formatTimeAgo(notif.createdAt, isAr)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {localizedMessage}
            </p>
          </div>

          {/* Close button */}
          <button
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full 
                       hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground 
                       transition-colors mt-0.5"
            onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }}
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-muted/30 w-full">
          <div
            ref={progressRef}
            className={`h-full bg-gradient-to-r ${accentGradient} transition-none`}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Time Formatter ═══════════════ */
function formatTimeAgo(ts: number, isAr: boolean): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (isAr) {
    if (diff < 5) return "الآن";
    if (diff < 60) return `${diff}ث`;
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    return `${Math.floor(diff / 3600)}س`;
  }
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

/* ═══════════════ Provider + Container ═══════════════ */
let idCounter = 0;

export function VexNotificationPopupProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<InternalNotif[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, dismissing: true } : n))
    );
    // Remove after animation
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 350);
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dismissing: true })));
    setTimeout(() => setNotifications([]), 350);
  }, []);

  const showPopup = useCallback((data: Omit<NotifPopupData, "id">) => {
    const id = `vex-popup-${++idCounter}-${Date.now()}`;
    const safeLink = normalizeSafeNotificationLink(data.link);
    const newNotif: InternalNotif = {
      ...data,
      id,
      link: safeLink || undefined,
      createdAt: data.timestamp || Date.now(),
      dismissing: false,
      swipeX: 0,
    };

    setNotifications((prev) => {
      // Limit visible notifications — dismiss oldest if exceeding
      const active = prev.filter((n) => !n.dismissing);
      if (active.length >= MAX_VISIBLE) {
        const oldest = active[active.length - 1];
        return [newNotif, ...prev.map((n) => n.id === oldest.id ? { ...n, dismissing: true } : n)];
      }
      return [newNotif, ...prev];
    });
  }, []);

  const handleClick = useCallback((notif: InternalNotif) => {
    dismiss(notif.id);
    navigateToSafeNotificationLink(notif.link);
  }, [dismiss]);

  // Listen for custom events from NotificationProvider
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) showPopup(detail);
    };
    window.addEventListener("vex-show-popup", handler);
    return () => window.removeEventListener("vex-show-popup", handler);
  }, [showPopup]);

  const visible = notifications.slice(0, MAX_VISIBLE + 2); // keep a couple extra for exit animations

  return (
    <NotifPopupContext.Provider value={{ showPopup, dismissAll }}>
      {children}

      {/* Popup Container — fixed at top, above everything */}
      {visible.length > 0 && (
        <div
          className="fixed top-0 inset-x-0 z-[99999] pointer-events-none pt-2 sm:pt-3 px-2 sm:px-4"
          aria-label="Notifications"
          role="region"
        >
          <div className="flex flex-col items-center pointer-events-auto">
            {visible.map((notif, i) => (
              <NotifCard
                key={notif.id}
                notif={notif}
                index={i}
                onDismiss={dismiss}
                onClick={handleClick}
              />
            ))}
          </div>
        </div>
      )}
    </NotifPopupContext.Provider>
  );
}
