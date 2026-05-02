import { Switch, Route, useLocation, Link } from "wouter";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
    LayoutDashboard,
    Gamepad2,
    Dices,
    Clock3,
    Medal,
    DollarSign,
    AlertTriangle,
    Settings,
    LogOut,
    Wallet,
    ArrowLeftRight,
    Megaphone,
    Gift,
    Swords,
    Home,
    Headset,
    Users,
    MessageCircle,
    Trophy,
    User,
    CalendarCheck,
    UserPlus,
    Download,
    Bell,
    ArrowDownToLine,
    Coins,
    Crown,
    Building2,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    SidebarHeader,
    SidebarFooter,
    useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { prefetchPage } from "@/components/PrefetchLink";
import { VexLogo } from "@/components/vex-logo";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationProvider, useNotificationStatus } from "@/components/NotificationProvider";
import { VexNotificationPopupProvider } from "@/components/VexNotificationPopup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/error-boundary";
import { PrivateCallLayerProvider } from "@/components/chat/private-call-layer";
import { CallSessionProvider, useCall } from "@/components/calls/CallSessionProvider";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
    SIDEBAR_ICON_ACCENTS,
    DEFAULT_SIDEBAR_ICON_ACCENT,
    BOTTOM_NAV_ACCENTS,
    DEFAULT_BOTTOM_NAV_ACCENT,
    type BottomNavAccent,
} from "@/components/nav/nav-config";

import NotFound from "@/pages/not-found";
import AdminLayout from "@/pages/admin/admin-layout";

const DashboardPage = lazy(() => import("@/pages/dashboard"));
const GamesPage = lazy(() => import("@/pages/games"));
const TransactionsPage = lazy(() => import("@/pages/transactions"));
const ComplaintsPage = lazy(() => import("@/pages/complaints"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const P2PPage = lazy(() => import("@/pages/p2p"));
const AdminAnnouncementsPage = lazy(() => import("@/pages/admin/announcements"));
const FreePage = lazy(() => import("@/pages/free"));
const ChallengesPage = lazy(() => import("@/pages/challenges"));
const GameLobbyPage = lazy(() => import("@/pages/game-lobby"));
const P2PProfilePage = lazy(() => import("@/pages/p2p-profile"));
const P2PSettingsPage = lazy(() => import("@/pages/p2p-settings"));
const WalletPage = lazy(() => import("@/pages/wallet"));
const FriendsPage = lazy(() => import("@/pages/friends"));
const MultiplayerPage = lazy(() => import("@/pages/multiplayer"));
const SupportPage = lazy(() => import("@/pages/support"));
const ChatPage = lazy(() => import("@/pages/chat"));
const ChallengeGamePage = lazy(() => import("@/pages/challenge-game"));
const ChallengeWatchPage = lazy(() => import("@/pages/challenge-watch"));
const ChessGamePage = lazy(() => import("@/pages/games/ChessGame"));
const BackgammonGamePage = lazy(() => import("@/pages/games/BackgammonGame"));
const DominoGamePage = lazy(() => import("@/pages/games/DominoGame"));
const TarneebGamePage = lazy(() => import("@/pages/games/TarneebGame"));
const BalootGamePage = lazy(() => import("@/pages/games/BalootGame"));
const AimTrainerGamePage = lazy(() => import("@/pages/games/AimTrainerGame"));
const PlayerProfilePage = lazy(() => import("@/pages/player-profile"));
const LeaderboardPage = lazy(() => import("@/pages/leaderboard"));
const SeasonalLeaderboardPage = lazy(() => import("@/pages/seasonal-leaderboard"));
const GamesCatalogPage = lazy(() => import("@/pages/games-catalog"));
const ShareLinksPage = lazy(() => import("@/pages/share-links"));
const GameHistoryPage = lazy(() => import("@/pages/game-history"));
const TournamentsPage = lazy(() => import("@/pages/tournaments"));
const DailyRewardsPage = lazy(() => import("@/pages/daily-rewards"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const ReferralPage = lazy(() => import("@/pages/referral"));
const CoinPage = lazy(() => import("@/pages/coin"));
const AgentsProgramPage = lazy(() => import("@/pages/agents-program"));
const AffiliatesPage = lazy(() => import("@/pages/affiliates"));
const InvestPage = lazy(() => import("@/pages/invest"));
const GamePlayerPage = lazy(() => import("@/pages/game-player"));
const ArcadePlayPage = lazy(() => import("@/pages/arcade-play"));
const TermsPage = lazy(() => import("@/pages/terms"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const InstallAppPage = lazy(() => import("@/pages/install-app"));

const AdminLoginPage = lazy(() => import("@/pages/admin/admin-login"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/admin-dashboard"));
const AdminUsersPage = lazy(() => import("@/pages/admin/admin-users"));
const AdminTransactionsPage = lazy(() => import("@/pages/admin/admin-transactions"));
const AdminP2PPage = lazy(() => import("@/pages/admin/admin-p2p"));
const AdminCurrencyPage = lazy(() => import("@/pages/admin/admin-currency"));
const AdminSectionsPage = lazy(() => import("@/pages/admin/admin-sections"));
const AdminAntiCheatPage = lazy(() => import("@/pages/admin/admin-anti-cheat"));
const AdminAnalyticsPage = lazy(() => import("@/pages/admin/admin-analytics"));
const AdminDisputesPage = lazy(() => import("@/pages/admin/admin-disputes"));
const AdminSupportPage = lazy(() => import("@/pages/admin/admin-support"));
const AdminAppSettingsPage = lazy(() => import("@/pages/admin/admin-app-settings"));
const AdminLanguagesPage = lazy(() => import("@/pages/admin/admin-languages"));
const AdminBadgesPage = lazy(() => import("@/pages/admin/admin-badges"));
const AdminNotificationsPage = lazy(() => import("@/pages/admin/admin-notifications"));
const AdminGamesPage = lazy(() => import("@/pages/admin/admin-unified-games"));
const AdminIdVerificationPage = lazy(() => import("@/pages/admin/admin-id-verification"));
const AdminSeoPage = lazy(() => import("@/pages/admin/admin-seo"));
const AdminPaymentMethodsPage = lazy(() => import("@/pages/admin/admin-payment-methods"));
const AdminIntegrationsPage = lazy(() => import("@/pages/admin/admin-integrations"));
const AdminSocialPlatformsPage = lazy(() => import("@/pages/admin/admin-social-platforms"));
const AdminAdvertisementsPage = lazy(() => import("@/pages/admin/admin-advertisements"));
const AdminGameSectionsPage = lazy(() => import("@/pages/admin/admin-game-sections"));
const AdminSupportSettingsPage = lazy(() => import("@/pages/admin/admin-support-settings"));
const AdminTournamentsPage = lazy(() => import("@/pages/admin/admin-tournaments"));
const AdminFreePlayPage = lazy(() => import("@/pages/admin/admin-free-play"));
const AdminMarketersPage = lazy(() => import("@/pages/admin/admin-marketers"));
const AdminGiftsPage = lazy(() => import("@/pages/admin/admin-gifts"));
const AdminAgentsPage = lazy(() => import("@/pages/admin/admin-agents"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/admin-audit-logs"));
const AdminPaymentSecurityPage = lazy(() => import("@/pages/admin/admin-payment-security"));
const AdminRealtimePage = lazy(() => import("@/pages/admin/admin-realtime"));
const AdminFinancePage = lazy(() => import("@/pages/admin/admin-finance"));
const AdminInvestmentsPage = lazy(() => import("@/pages/admin/admin-investments"));
const AdminChallengeSettingsPage = lazy(() => import("@/pages/admin/admin-challenge-settings"));
const AdminChallengesPage = lazy(() => import("@/pages/admin/admin-challenges"));
const AdminChatPage = lazy(() => import("@/pages/admin/admin-chat"));
const AdminSam9Page = lazy(() => import("@/pages/admin/admin-sam9"));
const AdminExternalGamesPage = lazy(() => import("@/pages/admin/admin-external-games"));
const AdminThemesPage = lazy(() => import("@/pages/admin/admin-themes"));

const SupportChatHeaderTrigger = lazy(() =>
    import("@/components/support-chat-widget").then((m) => ({ default: m.SupportChatHeaderTrigger })),
);

const ChatBubblesLayer = lazy(() => import("@/components/ChatBubblesLayer"));

const SupportChatWidget = lazy(() =>
    import("@/components/support-chat-widget").then((m) => ({ default: m.SupportChatWidget })),
);

const LanguageSwitcher = lazy(() =>
    import("@/lib/i18n-ui").then((module) => ({ default: module.LanguageSwitcher })),
);

type MenuItem = {
    title: string;
    url: string;
    icon: React.ComponentType<{ className?: string }>;
    key: string;
    hasBadge?: boolean;
};

// Visual accent constants extracted to a dedicated config so this routing file
// stays focused on routing concerns and ships a smaller initial bundle.

function PageLoader() {
    const { t } = useI18n();

    return (
        <div className="min-h-[80vh] flex items-center justify-center" style={{ contain: "layout" }}>
            <div className="flex flex-col items-center gap-3">
                <VexLogo size={48} className="animate-pulse" />
                <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
            </div>
        </div>
    );
}

function SidebarBalanceDisplay({
    user,
    logout,
    t,
}: {
    user: { balance?: string | number | null; username?: string | null;[key: string]: unknown } | null;
    logout: () => void;
    t: (key: string) => string;
}) {
    return (
        <div className="space-y-3">
            <BalanceDisplay balance={String(user?.balance || "0")} variant="sidebar" />
            <div className="text-xs text-muted-foreground">@{String(user?.username || "")}</div>
            <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={logout}
                data-testid="button-logout"
            >
                <LogOut className="me-2 h-4 w-4" />
                {t("common.signOut")}
            </Button>
        </div>
    );
}

function AppSidebar({ side }: { side: "left" | "right" }) {
    const { user, logout } = useAuth();
    const { t } = useI18n();
    const { isSectionEnabled } = useSettings();
    const [location, setLocation] = useLocation();
    const { setOpenMobile, isMobile } = useSidebar();
    const { unreadCount, sectionCounts } = useNotificationStatus();

    const handleNavClick = (url: string) => {
        if (isMobile) {
            setOpenMobile(false);
        }
        setLocation(url);
    };

    const playerMenuItems: MenuItem[] = [
        { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, key: "dashboard" },
        { title: t("nav.wallet"), url: "/wallet", icon: Wallet, key: "wallet" },
        { title: t("nav.coin"), url: "/coin", icon: Coins, key: "coin" },
        { title: t("nav.multiplayer"), url: "/multiplayer", icon: Gamepad2, key: "multiplayer" },
        { title: t("nav.challenges"), url: "/challenges", icon: Swords, key: "challenges" },
        { title: t("nav.tournaments"), url: "/tournaments", icon: Trophy, key: "tournaments" },
        { title: t("nav.gameHistory"), url: "/games/history", icon: Clock3, key: "game-history" },
        { title: t("nav.lobby"), url: "/lobby", icon: Users, key: "lobby" },
        { title: t("nav.leaderboard"), url: "/leaderboard", icon: Medal, key: "leaderboard" },
        { title: t("nav.profile"), url: "/profile", icon: User, key: "profile" },
        { title: t("nav.friends"), url: "/friends", icon: Users, key: "friends" },
        { title: t("nav.chat"), url: "/chat", icon: MessageCircle, key: "chat" },
        { title: t("nav.p2p"), url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
        { title: t("nav.free"), url: "/free", icon: Gift, key: "free" },
        { title: t("nav.dailyRewards"), url: "/daily-rewards", icon: CalendarCheck, key: "daily-rewards" },
        { title: t("nav.referral"), url: "/referral", icon: UserPlus, key: "referral" },
        { title: t("nav.invest"), url: "/invest", icon: Building2, key: "invest" },
        { title: t("nav.agentsProgram"), url: "/agents-program", icon: Crown, key: "agents-program" },
        { title: t("nav.affiliates"), url: "/affiliates", icon: Megaphone, key: "affiliates" },
        { title: t("nav.transactions"), url: "/transactions", icon: DollarSign, key: "transactions" },
        { title: t("nav.complaints"), url: "/complaints", icon: AlertTriangle, key: "complaints" },
        { title: t("nav.support"), url: "/support", icon: Headset, key: "support" },
        { title: t("nav.notifications"), url: "/notifications", icon: Bell, key: "notifications", hasBadge: true },
        { title: t("nav.settings"), url: "/settings", icon: Settings, key: "settings" },
        { title: t("nav.installApp"), url: "/install-app", icon: Download, key: "install-app" },
    ];

    const adminMenuItems: MenuItem[] = [
        { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, key: "dashboard" },
        { title: t("nav.wallet"), url: "/wallet", icon: Wallet, key: "wallet" },
        { title: t("nav.coin"), url: "/coin", icon: Coins, key: "coin" },
        { title: t("nav.multiplayer"), url: "/multiplayer", icon: Gamepad2, key: "multiplayer" },
        { title: t("nav.gameManagement"), url: "/games", icon: Dices, key: "game-management" },
        { title: t("nav.announcements"), url: "/admin/announcements", icon: Megaphone, key: "announcements" },
        { title: t("nav.challenges"), url: "/challenges", icon: Swords, key: "challenges" },
        { title: t("nav.tournaments"), url: "/tournaments", icon: Trophy, key: "tournaments" },
        { title: t("nav.gameHistory"), url: "/games/history", icon: Clock3, key: "game-history" },
        { title: t("nav.lobby"), url: "/lobby", icon: Users, key: "lobby" },
        { title: t("nav.leaderboard"), url: "/leaderboard", icon: Medal, key: "leaderboard" },
        { title: t("nav.profile"), url: "/profile", icon: User, key: "profile" },
        { title: t("nav.friends"), url: "/friends", icon: Users, key: "friends" },
        { title: t("nav.chat"), url: "/chat", icon: MessageCircle, key: "chat" },
        { title: t("nav.p2p"), url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
        { title: t("nav.free"), url: "/free", icon: Gift, key: "free" },
        { title: t("nav.dailyRewards"), url: "/daily-rewards", icon: CalendarCheck, key: "daily-rewards" },
        { title: t("nav.referral"), url: "/referral", icon: UserPlus, key: "referral" },
        { title: t("nav.invest"), url: "/invest", icon: Building2, key: "invest" },
        { title: t("nav.agentsProgram"), url: "/agents-program", icon: Crown, key: "agents-program" },
        { title: t("nav.affiliates"), url: "/affiliates", icon: Megaphone, key: "affiliates" },
        { title: t("nav.transactions"), url: "/transactions", icon: DollarSign, key: "transactions" },
        { title: t("nav.complaints"), url: "/complaints", icon: AlertTriangle, key: "complaints" },
        { title: t("nav.support"), url: "/support", icon: Headset, key: "support" },
        { title: t("nav.notifications"), url: "/notifications", icon: Bell, key: "notifications", hasBadge: true },
        { title: t("nav.settings"), url: "/settings", icon: Settings, key: "settings" },
        { title: t("nav.installApp"), url: "/install-app", icon: Download, key: "install-app" },
    ];

    const baseItems = user?.role === "admin" ? adminMenuItems : playerMenuItems;
    const menuItems = baseItems.filter((item) => isSectionEnabled(item.key));

    return (
        <Sidebar side={side}>
            <SidebarHeader className="p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                    <VexLogo size={32} />
                    <div>
                        <p className="font-bold text-lg" aria-hidden="true">
                            VEX
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                            {user?.role === "admin" ? t("nav.admin") : t("nav.player")}
                        </p>
                    </div>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>{t("nav.navigation") || "Navigation"}</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {menuItems.map((item) => {
                                const badgeCount = item.key === "notifications" ? unreadCount : sectionCounts[item.key] || 0;
                                const isActive = location === item.url;
                                const accent = SIDEBAR_ICON_ACCENTS[item.key] || DEFAULT_SIDEBAR_ICON_ACCENT;
                                return (
                                    <SidebarMenuItem key={item.key}>
                                        <SidebarMenuButton
                                            isActive={isActive}
                                            onClick={() => handleNavClick(item.url)}
                                            onMouseEnter={() => prefetchPage(item.url)}
                                            aria-current={isActive ? "page" : undefined}
                                            data-testid={`link-${item.key}`}
                                        >
                                            <div className="relative">
                                                <span
                                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_rgba(0,0,0,0.28)] ${isActive ? accent.active : accent.inactive}`}
                                                >
                                                    <item.icon className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" />
                                                </span>
                                                {badgeCount > 0 && !isActive && (
                                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
                                                        {badgeCount > 99 ? "99+" : badgeCount}
                                                    </span>
                                                )}
                                            </div>
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-4 border-t border-sidebar-border">
                <SidebarBalanceDisplay user={user} logout={logout} t={t} />
            </SidebarFooter>
        </Sidebar>
    );
}

function BottomNavigation({
    onChatToggle,
    isChatOpen,
    isVisible,
}: {
    onChatToggle: () => void;
    isChatOpen: boolean;
    isVisible: boolean;
}) {
    const { t, language } = useI18n();
    const [location, setLocation] = useLocation();
    const { sectionCounts } = useNotificationStatus();
    const [pressedItemKey, setPressedItemKey] = useState<string | null>(null);
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchEndY = useRef<number | null>(null);

    const navItems: MenuItem[] = [
        { title: t("nav.p2p") || "P2P", url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
        { title: t("nav.main") || "Main", url: "/", icon: Home, key: "main" },
        { title: t("nav.tournaments") || "Tournaments", url: "/tournaments", icon: Trophy, key: "tournaments" },
        { title: t("nav.play") || "Games", url: "/games", icon: Gamepad2, key: "play" },
        { title: t("nav.challenges") || "Challenges", url: "/challenges", icon: Swords, key: "challenges" },
    ];

    const navigateToIndex = (direction: "left" | "right") => {
        const currentIndex = navItems.findIndex((item) => item.url === location);
        if (currentIndex === -1) return;

        let newIndex: number;
        const isRTL = language === "ar";

        if ((direction === "right" && !isRTL) || (direction === "left" && isRTL)) {
            newIndex = currentIndex < navItems.length - 1 ? currentIndex + 1 : 0;
        } else {
            newIndex = currentIndex > 0 ? currentIndex - 1 : navItems.length - 1;
        }

        setLocation(navItems[newIndex].url);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                navigateToIndex(e.key === "ArrowRight" ? "right" : "left");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [location, setLocation, language]);

    const handleNavTouchStart = (e: React.TouchEvent<HTMLElement>) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        touchEndX.current = null;
        touchEndY.current = null;
    };

    const handleNavTouchMove = (e: React.TouchEvent<HTMLElement>) => {
        touchEndX.current = e.touches[0].clientX;
        touchEndY.current = e.touches[0].clientY;
    };

    const handleNavTouchEnd = () => {
        const minSwipeDistance = 75;
        if (!touchStartX.current || !touchEndX.current || !touchStartY.current || !touchEndY.current) {
            return;
        }

        const deltaX = touchStartX.current - touchEndX.current;
        const deltaY = touchStartY.current - touchEndY.current;
        const isHorizontalSwipe = Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

        if (isHorizontalSwipe) {
            if (deltaX > 0) {
                navigateToIndex("right");
            } else {
                navigateToIndex("left");
            }
        }

        touchStartX.current = null;
        touchEndX.current = null;
        touchStartY.current = null;
        touchEndY.current = null;
    };

    const applyIconTilt = (event: React.MouseEvent<HTMLDivElement>) => {
        const host = event.currentTarget;
        const rect = host.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const rotateY = ((x / rect.width) - 0.5) * 10;
        const rotateX = (0.5 - (y / rect.height)) * 10;
        host.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
        host.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
    };

    const resetIconTilt = (event: React.MouseEvent<HTMLDivElement>) => {
        const host = event.currentTarget;
        host.style.setProperty("--tilt-x", "0deg");
        host.style.setProperty("--tilt-y", "0deg");
    };

    return (
        // When the on-screen keyboard opens, iOS Safari (and most mobile
        // browsers) shrink the visual viewport so that `bottom: 0` ends
        // up sitting ABOVE the keyboard — which would push this nav up
        // into the chat area, leaving an empty band between the keyboard
        // and the chat composer. Subtracting `--keyboard-inset-bottom`
        // slides the nav down by exactly the keyboard height so it
        // stays pinned to the real screen edge (hidden behind the
        // keyboard) and the composer can sit flush against the keyboard.
        <nav
            className={`fixed start-0 end-0 flex items-center justify-around gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-slate-950/95 backdrop-blur-md shadow-[0_-14px_30px_rgba(0,0,0,0.45)] md:hidden z-50 transition-transform duration-300 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-[120%] opacity-0 pointer-events-none"}`}
            style={{ bottom: "calc(0px - var(--keyboard-inset-bottom, 0px))" }}
            aria-label="Main navigation"
            onTouchStart={handleNavTouchStart}
            onTouchMove={handleNavTouchMove}
            onTouchEnd={handleNavTouchEnd}
        >
            {navItems.map((item) => {
                const isActive = location === item.url;
                const badgeCount = isActive ? 0 : sectionCounts[item.key] || 0;
                const accent = BOTTOM_NAV_ACCENTS[item.key] || DEFAULT_BOTTOM_NAV_ACCENT;
                const isPressed = pressedItemKey === item.key;
                return (
                    <Link
                        key={item.key}
                        href={item.url}
                        className={`group relative flex flex-col items-center gap-1 px-1.5 py-1 rounded-xl min-w-[3.2rem] transition-all duration-300 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        aria-current={isActive ? "page" : undefined}
                        data-testid={`nav-${item.key}`}
                        onPointerDown={() => setPressedItemKey(item.key)}
                        onPointerUp={() => setPressedItemKey(null)}
                        onPointerCancel={() => setPressedItemKey(null)}
                        onPointerLeave={() => setPressedItemKey(null)}
                    >
                        <div className="relative [perspective:900px]" onMouseMove={applyIconTilt} onMouseLeave={resetIconTilt}>
                            <span
                                className={`pointer-events-none absolute -inset-1 rounded-[14px] blur-md transition-all duration-300 ${accent.glow} ${isActive ? "opacity-70" : "opacity-0 group-hover:opacity-45"}`}
                            />
                            <span
                                className={`relative flex h-9 w-9 items-center justify-center rounded-[12px] border [transform-style:preserve-3d] shadow-[0_8px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.32)] transition-all duration-300 ease-out ${isActive ? accent.active : accent.inactive} ${isPressed ? "scale-[0.94]" : "group-hover:scale-[1.05]"}`}
                                style={{ transform: "translateZ(6px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg))" }}
                            >
                                <span className="pointer-events-none absolute inset-0 rounded-[12px] bg-gradient-to-b from-white/35 via-transparent to-black/30" />
                                <item.icon
                                    className={`relative h-[17px] w-[17px] transition-transform duration-300 ${isActive ? "scale-[1.06] text-white" : "text-slate-100/90 group-hover:text-white"}`}
                                />
                            </span>
                            {badgeCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5 shadow-[0_4px_10px_rgba(239,68,68,0.45)]">
                                    {badgeCount > 99 ? "99+" : badgeCount}
                                </span>
                            )}
                        </div>
                        <span
                            className={`text-[10px] font-medium leading-none tracking-[0.01em] transition-colors duration-300 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/90"}`}
                        >
                            {item.title}
                        </span>
                        {isActive && (
                            <div className="w-5 h-[2px] rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 shadow-[0_0_12px_rgba(56,189,248,0.45)]" />
                        )}
                    </Link>
                );
            })}
            {(() => {
                const chatAccent = BOTTOM_NAV_ACCENTS.chat || DEFAULT_BOTTOM_NAV_ACCENT;
                const isChatPressed = pressedItemKey === "chat";
                return (
                    <button
                        type="button"
                        className={`group relative flex flex-col items-center gap-1 px-1.5 py-1 rounded-xl min-w-[3.2rem] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isChatOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={onChatToggle}
                        data-testid="nav-chat"
                        onPointerDown={() => setPressedItemKey("chat")}
                        onPointerUp={() => setPressedItemKey(null)}
                        onPointerCancel={() => setPressedItemKey(null)}
                        onPointerLeave={() => setPressedItemKey(null)}
                    >
                        <div className="relative [perspective:900px]" onMouseMove={applyIconTilt} onMouseLeave={resetIconTilt}>
                            <span
                                className={`pointer-events-none absolute -inset-1 rounded-[14px] blur-md transition-all duration-300 ${chatAccent.glow} ${isChatOpen ? "opacity-70" : "opacity-0 group-hover:opacity-45"}`}
                            />
                            <span
                                className={`relative flex h-9 w-9 items-center justify-center rounded-[12px] border [transform-style:preserve-3d] shadow-[0_8px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.32)] transition-all duration-300 ease-out ${isChatOpen ? chatAccent.active : chatAccent.inactive} ${isChatPressed ? "scale-[0.94]" : "group-hover:scale-[1.05]"}`}
                                style={{ transform: "translateZ(6px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg))" }}
                            >
                                <span className="pointer-events-none absolute inset-0 rounded-[12px] bg-gradient-to-b from-white/35 via-transparent to-black/30" />
                                <MessageCircle
                                    className={`relative h-[17px] w-[17px] transition-transform duration-300 ${isChatOpen ? "scale-[1.06] text-white" : "text-slate-100/90 group-hover:text-white"}`}
                                />
                            </span>
                        </div>
                        <span
                            className={`text-[10px] font-medium leading-none tracking-[0.01em] transition-colors duration-300 ${isChatOpen ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/90"}`}
                        >
                            {t("nav.chat") || "Chat"}
                        </span>
                        {isChatOpen && (
                            <div className="w-5 h-[2px] rounded-full bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 shadow-[0_0_12px_rgba(56,189,248,0.45)]" />
                        )}
                    </button>
                );
            })()}
        </nav>
    );
}

/**
 * Mobile chat bottom-sheet host. Pulled out of `AuthenticatedLayout`
 * so it can subscribe to `useCall()` (which is only available beneath
 * `CallSessionProvider`) without dragging that subscription into the
 * whole layout tree.
 *
 * Two production concerns it owns:
 *  1. Tracks `--keyboard-inset-bottom` so the sheet rises above the
 *     soft keyboard instead of leaving a dead gap below the composer.
 *     `Capacitor.Keyboard.resize='none'` keeps the layout viewport
 *     pinned, so the sheet would otherwise float at
 *     `bottom: env(safe-area-inset-bottom)+4.75rem` *behind* the
 *     keyboard.
 *  2. Auto-dismisses the sheet the moment a call is dialing,
 *     ringing, connecting, or connected — otherwise the sheet sits at
 *     `z-100` and partially covers the call card.
 */
function ChatBottomSheet({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const { status: callStatus } = useCall();

    useEffect(() => {
        if (!isOpen) return;
        const callOccupiesScreen =
            callStatus === "ringing-out" ||
            callStatus === "ringing-in" ||
            callStatus === "connecting" ||
            callStatus === "connected";
        if (callOccupiesScreen) {
            onClose();
        }
    }, [isOpen, callStatus, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] md:hidden" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50" />
            <div
                className="absolute start-0 end-0 h-[70vh] bg-background rounded-t-xl overflow-hidden"
                style={{
                    bottom:
                        "calc(env(safe-area-inset-bottom) + 4.75rem + var(--keyboard-inset-bottom, 0px))",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <Suspense fallback={<PageLoader />}>
                    <ChatPage embedded />
                </Suspense>
            </div>
        </div>
    );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    const { t, language, dir } = useI18n();
    const [location] = useLocation();
    const sidebarSide = dir === "rtl" ? "right" : "left";
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
    // Drives `--keyboard-inset-bottom` on the document root so the
    // mobile chat sheet (and the composer it embeds) tracks the
    // on-screen keyboard instead of leaving a 4.75rem+keyboardHeight
    // void below the input — Capacitor sets `Keyboard.resize='none'`
    // so the layout viewport never reflows on its own.
    useKeyboardInset();
    const mainContentRef = useRef<HTMLElement | null>(null);
    const lastMainScrollTopRef = useRef(0);
    const bottomNavScrollIntentRef = useRef(0);

    const BOTTOM_NAV_MIN_REAL_SCROLLABLE_DISTANCE = 24;
    const BOTTOM_NAV_SCROLL_JITTER_PX = 6;
    const BOTTOM_NAV_HIDE_INTENT_THRESHOLD = 28;
    const BOTTOM_NAV_SHOW_INTENT_THRESHOLD = -20;

    const style = {
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "4rem",
    };
    const isHomeRoute = location === "/" || location.startsWith("/?");

    const toggleChat = () => {
        setIsChatOpen(!isChatOpen);
    };

    useEffect(() => {
        setIsBottomNavVisible(true);
        bottomNavScrollIntentRef.current = 0;
        if (mainContentRef.current) {
            lastMainScrollTopRef.current = mainContentRef.current.scrollTop;
        }
    }, [location]);

    useEffect(() => {
        if (isChatOpen) {
            setIsBottomNavVisible(true);
            bottomNavScrollIntentRef.current = 0;
        }
    }, [isChatOpen]);

    const getEffectiveScrollableDistance = (container: HTMLElement): number => {
        const maxScrollableDistance = Math.max(0, container.scrollHeight - container.clientHeight);
        const computedStyle = window.getComputedStyle(container);
        const bottomPadding = Number.parseFloat(computedStyle.paddingBottom || "0") || 0;

        // Ignore artificial scrolling introduced only by bottom safe-area/nav padding.
        return Math.max(0, maxScrollableDistance - bottomPadding);
    };

    const handleMainContentScroll = (event: React.UIEvent<HTMLElement>) => {
        const container = event.currentTarget;
        const currentScrollTop = container.scrollTop;
        const effectiveScrollableDistance = getEffectiveScrollableDistance(container);
        const scrollDelta = currentScrollTop - lastMainScrollTopRef.current;

        // Keep bottom nav stable on short pages where tiny elastic scrolls cause flicker.
        if (effectiveScrollableDistance <= BOTTOM_NAV_MIN_REAL_SCROLLABLE_DISTANCE) {
            if (!isBottomNavVisible) {
                setIsBottomNavVisible(true);
            }
            bottomNavScrollIntentRef.current = 0;
            lastMainScrollTopRef.current = currentScrollTop;
            return;
        }

        if (Math.abs(scrollDelta) < BOTTOM_NAV_SCROLL_JITTER_PX) {
            lastMainScrollTopRef.current = currentScrollTop;
            return;
        }

        if (currentScrollTop <= 12 || isChatOpen) {
            setIsBottomNavVisible(true);
            bottomNavScrollIntentRef.current = 0;
            lastMainScrollTopRef.current = currentScrollTop;
            return;
        }

        const nextIntent =
            scrollDelta > 0
                ? Math.max(0, bottomNavScrollIntentRef.current + scrollDelta)
                : Math.min(0, bottomNavScrollIntentRef.current + scrollDelta);

        bottomNavScrollIntentRef.current = nextIntent;

        if (nextIntent >= BOTTOM_NAV_HIDE_INTENT_THRESHOLD && currentScrollTop > 80) {
            if (isBottomNavVisible) {
                setIsBottomNavVisible(false);
            }
            bottomNavScrollIntentRef.current = 0;
        } else if (nextIntent <= BOTTOM_NAV_SHOW_INTENT_THRESHOLD) {
            if (!isBottomNavVisible) {
                setIsBottomNavVisible(true);
            }
            bottomNavScrollIntentRef.current = 0;
        }

        lastMainScrollTopRef.current = currentScrollTop;
    };

    return (
        <NotificationProvider>
            <PrivateCallLayerProvider>
                <CallSessionProvider>
                    <SidebarProvider style={style as React.CSSProperties}>
                        <div className="flex h-screen w-full" dir={dir}>
                            <a
                                href="#main-content"
                                className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2"
                            >
                                {t("nav.skipToContent") || "Skip to content"}
                            </a>
                            <AppSidebar side={sidebarSide} />
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b bg-background px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                                    <SidebarTrigger
                                        className="h-9 w-9"
                                        aria-label={t("nav.navigation") || "Navigation"}
                                        data-testid="button-sidebar-toggle"
                                    />
                                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-visible">
                                        {/* Primary action — one-tap deposit. Render a single anchor
                                        styled as a button (no a>button nesting) via Button's asChild slot. */}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    asChild
                                                    variant="default"
                                                    size="sm"
                                                    className="gap-1.5 font-semibold shadow-sm h-9"
                                                >
                                                    <Link
                                                        href="/wallet?modal=deposit"
                                                        aria-label={t("wallet.deposit") || "Deposit"}
                                                        data-testid="button-header-deposit"
                                                    >
                                                        <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                                                        <span className="hidden sm:inline">{t("wallet.deposit") || "Deposit"}</span>
                                                    </Link>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">{t("wallet.deposit") || "Deposit"}</TooltipContent>
                                        </Tooltip>

                                        {/* Visual separator between the action and the tools cluster */}
                                        <span
                                            aria-hidden="true"
                                            className="hidden sm:block h-6 w-px bg-border/70 mx-0.5"
                                        />

                                        {/* Tools cluster — wallet emphasised with subtle accent */}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                                                >
                                                    <Link
                                                        href="/wallet"
                                                        aria-label={t("nav.wallet") || "Wallet"}
                                                        data-testid="button-header-wallet"
                                                    >
                                                        <Wallet className="h-[18px] w-[18px]" />
                                                    </Link>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">{t("nav.wallet") || "Wallet"}</TooltipContent>
                                        </Tooltip>
                                        {isHomeRoute && (
                                            <Suspense fallback={null}>
                                                <SupportChatHeaderTrigger isLoggedIn={true} />
                                            </Suspense>
                                        )}
                                        <ThemeToggle />
                                        <NotificationBell />
                                        <Suspense fallback={null}>
                                            <LanguageSwitcher />
                                        </Suspense>
                                    </div>
                                </header>
                                <main
                                    id="main-content"
                                    ref={mainContentRef}
                                    onScroll={handleMainContentScroll}
                                    className="flex-1 overflow-auto animate-page-enter pb-[calc(env(safe-area-inset-bottom)+7.25rem)] md:pb-0"
                                >
                                    {children}
                                </main>
                                <BottomNavigation onChatToggle={toggleChat} isChatOpen={isChatOpen} isVisible={isBottomNavVisible} />
                            </div>
                            <ChatBottomSheet
                                isOpen={isChatOpen}
                                onClose={toggleChat}
                            />
                        </div>
                        <Suspense fallback={null}>
                            <SupportChatWidget isLoggedIn={true} showFloatingTrigger={false} />
                        </Suspense>
                        {/* Task #89: Messenger-style floating chat bubbles. Mounted
                        inside PrivateCallLayerProvider so it can suppress
                        bubbles while the user is on a private call. */}
                        <Suspense fallback={null}>
                            <ChatBubblesLayer />
                        </Suspense>
                    </SidebarProvider>
                </CallSessionProvider>
            </PrivateCallLayerProvider>
        </NotificationProvider>
    );
}

function AdminRouter() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
                <Switch>
                    <Route path="/admin" component={AdminLoginPage} />
                    <Route path="/admin/dashboard">
                        <AdminLayout>
                            <AdminDashboardPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/users">
                        <AdminLayout>
                            <AdminUsersPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/transactions">
                        <AdminLayout>
                            <AdminTransactionsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/sections">
                        <AdminLayout>
                            <AdminSectionsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/anti-cheat">
                        <AdminLayout>
                            <AdminAntiCheatPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/analytics">
                        <AdminLayout>
                            <AdminAnalyticsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/disputes">
                        <AdminLayout>
                            <AdminDisputesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/tournaments">
                        <AdminLayout>
                            <AdminTournamentsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/free-play">
                        <AdminLayout>
                            <AdminFreePlayPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/marketers">
                        <AdminLayout>
                            <AdminMarketersPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/gifts">
                        <AdminLayout>
                            <AdminGiftsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/agents">
                        <AdminLayout>
                            <AdminAgentsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/p2p">
                        <AdminLayout>
                            <AdminP2PPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/currency">
                        <AdminLayout>
                            <AdminCurrencyPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/support">
                        <AdminLayout>
                            <AdminSupportPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/app-settings">
                        <AdminLayout>
                            <AdminAppSettingsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/languages">
                        <AdminLayout>
                            <AdminLanguagesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/badges">
                        <AdminLayout>
                            <AdminBadgesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/notifications">
                        <AdminLayout>
                            <AdminNotificationsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/games">
                        <AdminLayout>
                            <AdminGamesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/external-games">
                        <AdminLayout>
                            <AdminExternalGamesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/themes">
                        <AdminLayout>
                            <AdminThemesPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/game-sections">
                        <AdminLayout>
                            <AdminGameSectionsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/id-verification">
                        <AdminLayout>
                            <AdminIdVerificationPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/seo">
                        <AdminLayout>
                            <AdminSeoPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/payment-methods">
                        <AdminLayout>
                            <AdminPaymentMethodsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/integrations">
                        <AdminLayout>
                            <AdminIntegrationsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/social-platforms">
                        <AdminLayout>
                            <AdminSocialPlatformsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/advertisements">
                        <AdminLayout>
                            <AdminAdvertisementsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/support-settings">
                        <AdminLayout>
                            <AdminSupportSettingsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/challenge-settings">
                        <AdminLayout>
                            <AdminChallengeSettingsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/finance">
                        <AdminLayout>
                            <AdminFinancePage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/investments">
                        <AdminLayout>
                            <AdminInvestmentsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/payment-security">
                        <AdminLayout>
                            <AdminPaymentSecurityPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/realtime">
                        <AdminLayout>
                            <AdminRealtimePage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/chat-management">
                        <AdminLayout>
                            <AdminChatPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/sam9">
                        <AdminLayout>
                            <AdminSam9Page />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/audit-logs">
                        <AdminLayout>
                            <AdminAuditLogsPage />
                        </AdminLayout>
                    </Route>
                    <Route path="/admin/payment-security">
                        <AdminLayout>
                            <AdminPaymentSecurityPage />
                        </AdminLayout>
                    </Route>
                </Switch>
            </Suspense>
        </ErrorBoundary>
    );
}

export default function PrivateRoutes() {
    const [location] = useLocation();

    if (location.startsWith("/admin")) {
        return (
            <VexNotificationPopupProvider>
                <AdminRouter />
            </VexNotificationPopupProvider>
        );
    }

    return (
        <VexNotificationPopupProvider>
            <AuthenticatedLayout>
                <Suspense fallback={<PageLoader />}>
                    <Switch>
                        <Route path="/">{() => <ErrorBoundary><DashboardPage /></ErrorBoundary>}</Route>
                        <Route path="/games">{() => <ErrorBoundary><GamesCatalogPage /></ErrorBoundary>}</Route>
                        <Route path="/games/history">{() => <ErrorBoundary><GameHistoryPage /></ErrorBoundary>}</Route>
                        <Route path="/share-links">{() => <ErrorBoundary><ShareLinksPage /></ErrorBoundary>}</Route>
                        <Route path="/play/:slug">{() => <ErrorBoundary><GamePlayerPage /></ErrorBoundary>}</Route>
                        <Route path="/challenges">{() => <ErrorBoundary><ChallengesPage /></ErrorBoundary>}</Route>
                        <Route path="/lobby">{() => <ErrorBoundary><GameLobbyPage /></ErrorBoundary>}</Route>
                        <Route path="/tournaments">{() => <ErrorBoundary><TournamentsPage /></ErrorBoundary>}</Route>
                        <Route path="/tournaments/:id">{() => <ErrorBoundary><TournamentsPage /></ErrorBoundary>}</Route>
                        <Route path="/daily-rewards">{() => <ErrorBoundary><DailyRewardsPage /></ErrorBoundary>}</Route>
                        <Route path="/notifications">{() => <ErrorBoundary><NotificationsPage /></ErrorBoundary>}</Route>
                        <Route path="/referral">{() => <ErrorBoundary><ReferralPage /></ErrorBoundary>}</Route>
                        <Route path="/coin">{() => <ErrorBoundary><CoinPage /></ErrorBoundary>}</Route>
                        <Route path="/agents-program">{() => <ErrorBoundary><AgentsProgramPage /></ErrorBoundary>}</Route>
                        <Route path="/affiliates">{() => <ErrorBoundary><AffiliatesPage /></ErrorBoundary>}</Route>
                        <Route path="/invest">{() => <ErrorBoundary><InvestPage /></ErrorBoundary>}</Route>
                        <Route path="/profile">{() => <ErrorBoundary><PlayerProfilePage /></ErrorBoundary>}</Route>
                        <Route path="/player/:userId">{() => <ErrorBoundary><PlayerProfilePage /></ErrorBoundary>}</Route>
                        <Route path="/leaderboard">{() => <ErrorBoundary><LeaderboardPage /></ErrorBoundary>}</Route>
                        <Route path="/seasons">{() => <ErrorBoundary><SeasonalLeaderboardPage /></ErrorBoundary>}</Route>
                        <Route path="/challenge/:id/play">{() => <ErrorBoundary><ChallengeGamePage /></ErrorBoundary>}</Route>
                        <Route path="/challenge/:id/watch">{() => <ErrorBoundary><ChallengeWatchPage /></ErrorBoundary>}</Route>
                        <Route path="/game/chess/:sessionId">{() => <ErrorBoundary><ChessGamePage /></ErrorBoundary>}</Route>
                        <Route path="/game/backgammon/:sessionId">{() => <ErrorBoundary><BackgammonGamePage /></ErrorBoundary>}</Route>
                        <Route path="/game/domino/:sessionId">{() => <ErrorBoundary><DominoGamePage /></ErrorBoundary>}</Route>
                        <Route path="/game/tarneeb/:sessionId">{() => <ErrorBoundary><TarneebGamePage /></ErrorBoundary>}</Route>
                        <Route path="/game/baloot/:sessionId">{() => <ErrorBoundary><BalootGamePage /></ErrorBoundary>}</Route>
                        <Route path="/game/aim_trainer/:sessionId">{() => <ErrorBoundary><AimTrainerGamePage /></ErrorBoundary>}</Route>
                        <Route path="/p2p">{() => <ErrorBoundary><P2PPage /></ErrorBoundary>}</Route>
                        <Route path="/p2p/profile/:userId?">{() => <ErrorBoundary><P2PProfilePage /></ErrorBoundary>}</Route>
                        <Route path="/p2p/settings">{() => <ErrorBoundary><P2PSettingsPage /></ErrorBoundary>}</Route>
                        <Route path="/free">{() => <ErrorBoundary><FreePage /></ErrorBoundary>}</Route>
                        <Route path="/wallet">{() => <ErrorBoundary><WalletPage /></ErrorBoundary>}</Route>
                        <Route path="/transactions">{() => <ErrorBoundary><TransactionsPage /></ErrorBoundary>}</Route>
                        <Route path="/complaints">{() => <ErrorBoundary><ComplaintsPage /></ErrorBoundary>}</Route>
                        <Route path="/friends">{() => <ErrorBoundary><FriendsPage /></ErrorBoundary>}</Route>
                        <Route path="/multiplayer">{() => <ErrorBoundary><MultiplayerPage /></ErrorBoundary>}</Route>
                        <Route path="/chat">{() => <ErrorBoundary><ChatPage /></ErrorBoundary>}</Route>
                        <Route path="/support">{() => <ErrorBoundary><SupportPage /></ErrorBoundary>}</Route>
                        <Route path="/settings">{() => <ErrorBoundary><SettingsPage /></ErrorBoundary>}</Route>
                        <Route path="/terms">{() => <ErrorBoundary><TermsPage /></ErrorBoundary>}</Route>
                        <Route path="/privacy">{() => <ErrorBoundary><PrivacyPage /></ErrorBoundary>}</Route>
                        <Route path="/install-app">{() => <ErrorBoundary><InstallAppPage /></ErrorBoundary>}</Route>
                        <Route path="/arcade/:gameKey">{() => <ErrorBoundary><ArcadePlayPage /></ErrorBoundary>}</Route>
                        <Route path="/arcade">{() => <ErrorBoundary><GamesPage /></ErrorBoundary>}</Route>
                        <Route path="/admin/announcements">{() => <ErrorBoundary><AdminAnnouncementsPage /></ErrorBoundary>}</Route>
                        <Route>{() => <ErrorBoundary><NotFound /></ErrorBoundary>}</Route>
                    </Switch>
                </Suspense>
            </AuthenticatedLayout>
        </VexNotificationPopupProvider>
    );
}
