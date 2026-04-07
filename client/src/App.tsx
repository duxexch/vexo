import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider, LanguageSwitcher, useI18n, TranslationDebugger } from "@/lib/i18n";
import { SettingsProvider, useSettings } from "@/lib/settings";
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
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Gamepad2,
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
  Eye,
  EyeOff,
  Headset,
  Users,
  MessageCircle,
  Trophy,
  User,
  CalendarCheck,
  UserPlus,
  Download,
  Bell,
} from "lucide-react";
import { apiRequest } from "./lib/queryClient";
import { VexLogo } from "@/components/vex-logo";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationProvider, useNotificationStatus } from "@/components/NotificationProvider";
import { VexNotificationPopupProvider } from "@/components/VexNotificationPopup";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchPage } from "@/components/PrefetchLink";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SupportChatWidget } from "@/components/support-chat-widget";

import NotFound from "@/pages/not-found";
import AdminLayout from "@/pages/admin/admin-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const LoginPage = lazy(() => import("@/pages/login"));
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
type MenuItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; key: string; hasBadge?: boolean };

const ChallengeWatchPage = lazy(() => import("@/pages/challenge-watch"));
const ChessGamePage = lazy(() => import("@/pages/games/ChessGame"));
const BackgammonGamePage = lazy(() => import("@/pages/games/BackgammonGame"));
const DominoGamePage = lazy(() => import("@/pages/games/DominoGame"));
const TarneebGamePage = lazy(() => import("@/pages/games/TarneebGame"));
const BalootGamePage = lazy(() => import("@/pages/games/BalootGame"));
const PlayerProfilePage = lazy(() => import("@/pages/player-profile"));
const LeaderboardPage = lazy(() => import("@/pages/leaderboard"));
const SeasonalLeaderboardPage = lazy(() => import("@/pages/seasonal-leaderboard"));
const GamesCatalogPage = lazy(() => import("@/pages/games-catalog"));
const GameHistoryPage = lazy(() => import("@/pages/game-history"));
const TournamentsPage = lazy(() => import("@/pages/tournaments"));
const DailyRewardsPage = lazy(() => import("@/pages/daily-rewards"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const ReferralPage = lazy(() => import("@/pages/referral"));
const AuthCallbackPage = lazy(() => import("@/pages/auth-callback"));

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
const AdminGiftsPage = lazy(() => import("@/pages/admin/admin-gifts"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/admin-audit-logs"));
const AdminPaymentSecurityPage = lazy(() => import("@/pages/admin/admin-payment-security"));
const AdminChallengeSettingsPage = lazy(() => import("@/pages/admin/admin-challenge-settings"));
const AdminChallengesPage = lazy(() => import("@/pages/admin/admin-challenges"));
const AdminChatPage = lazy(() => import("@/pages/admin/admin-chat"));
const AdminSam9Page = lazy(() => import("@/pages/admin/admin-sam9"));
const AdminExternalGamesPage = lazy(() => import("@/pages/admin/admin-external-games"));
const GamePlayerPage = lazy(() => import("@/pages/game-player"));
const TermsPage = lazy(() => import("@/pages/terms"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const InstallAppPage = lazy(() => import("@/pages/install-app"));

function PageLoader() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center" style={{ contain: 'layout' }}>
      <div className="flex flex-col items-center gap-3">
        <VexLogo size={48} className="animate-pulse" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
}

function SidebarBalanceDisplay({ user, logout, t }: { user: { balance?: string | number | null; username?: string | null;[key: string]: unknown } | null; logout: () => void; t: (key: string) => string }) {
  return (
    <div className="space-y-3">
      <BalanceDisplay balance={String(user?.balance || "0")} variant="sidebar" />
      <div className="text-xs text-muted-foreground">
        @{String(user?.username || '')}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={logout}
        data-testid="button-logout"
      >
        <LogOut className="me-2 h-4 w-4" />
        {t('common.signOut')}
      </Button>
    </div>
  );
}

function AppSidebar({ side }: { side: "left" | "right" }) {
  const { user, logout } = useAuth();
  const { t, language } = useI18n();
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
    { title: t('nav.dashboard'), url: "/", icon: LayoutDashboard, key: "dashboard" },
    { title: t('nav.wallet'), url: "/wallet", icon: Wallet, key: "wallet" },
    { title: t('nav.multiplayer'), url: "/multiplayer", icon: Gamepad2, key: "multiplayer" },
    { title: t('nav.challenges'), url: "/challenges", icon: Swords, key: "challenges" },
    { title: t('nav.tournaments'), url: "/tournaments", icon: Trophy, key: "tournaments" },
    { title: t('nav.gameHistory'), url: "/games/history", icon: Trophy, key: "game-history" },
    { title: t('nav.lobby'), url: "/lobby", icon: Users, key: "lobby" },
    { title: t('nav.leaderboard'), url: "/leaderboard", icon: Trophy, key: "leaderboard" },
    { title: t('nav.profile'), url: "/profile", icon: User, key: "profile" },
    { title: t('nav.friends'), url: "/friends", icon: Users, key: "friends" },
    { title: t('nav.chat'), url: "/chat", icon: MessageCircle, key: "chat" },
    { title: t('nav.p2p'), url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
    { title: t('nav.free'), url: "/free", icon: Gift, key: "free" },
    { title: t('nav.dailyRewards'), url: "/daily-rewards", icon: CalendarCheck, key: "daily-rewards" },
    { title: t('nav.referral'), url: "/referral", icon: UserPlus, key: "referral" },
    { title: t('nav.transactions'), url: "/transactions", icon: DollarSign, key: "transactions" },
    { title: t('nav.complaints'), url: "/complaints", icon: AlertTriangle, key: "complaints" },
    { title: t('nav.support'), url: "/support", icon: Headset, key: "support" },
    { title: language === 'ar' ? 'الإشعارات' : 'Notifications', url: "/notifications", icon: Bell, key: "notifications", hasBadge: true },
    { title: t('nav.settings'), url: "/settings", icon: Settings, key: "settings" },
    { title: language === 'ar' ? 'تحميل التطبيق' : 'Install App', url: "/install-app", icon: Download, key: "install-app" },
  ];

  const adminMenuItems: MenuItem[] = [
    { title: t('nav.dashboard'), url: "/", icon: LayoutDashboard, key: "dashboard" },
    { title: t('nav.wallet'), url: "/wallet", icon: Wallet, key: "wallet" },
    { title: t('nav.multiplayer'), url: "/multiplayer", icon: Gamepad2, key: "multiplayer" },
    { title: t('nav.gameManagement'), url: "/games", icon: Gamepad2, key: "game-management" },
    { title: t('nav.announcements'), url: "/admin/announcements", icon: Megaphone, key: "announcements" },
    { title: t('nav.challenges'), url: "/challenges", icon: Swords, key: "challenges" },
    { title: t('nav.tournaments'), url: "/tournaments", icon: Trophy, key: "tournaments" },
    { title: t('nav.gameHistory'), url: "/games/history", icon: Trophy, key: "game-history" },
    { title: t('nav.lobby'), url: "/lobby", icon: Users, key: "lobby" },
    { title: t('nav.leaderboard'), url: "/leaderboard", icon: Trophy, key: "leaderboard" },
    { title: t('nav.profile'), url: "/profile", icon: User, key: "profile" },
    { title: t('nav.friends'), url: "/friends", icon: Users, key: "friends" },
    { title: t('nav.chat'), url: "/chat", icon: MessageCircle, key: "chat" },
    { title: t('nav.p2p'), url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
    { title: t('nav.free'), url: "/free", icon: Gift, key: "free" },
    { title: t('nav.dailyRewards'), url: "/daily-rewards", icon: CalendarCheck, key: "daily-rewards" },
    { title: t('nav.referral'), url: "/referral", icon: UserPlus, key: "referral" },
    { title: t('nav.transactions'), url: "/transactions", icon: DollarSign, key: "transactions" },
    { title: t('nav.complaints'), url: "/complaints", icon: AlertTriangle, key: "complaints" },
    { title: t('nav.support'), url: "/support", icon: Headset, key: "support" },
    { title: language === 'ar' ? 'الإشعارات' : 'Notifications', url: "/notifications", icon: Bell, key: "notifications", hasBadge: true },
    { title: t('nav.settings'), url: "/settings", icon: Settings, key: "settings" },
    { title: language === 'ar' ? 'تحميل التطبيق' : 'Install App', url: "/install-app", icon: Download, key: "install-app" },
  ];

  const baseItems = user?.role === "admin" ? adminMenuItems : playerMenuItems;
  const menuItems = baseItems.filter(item => isSectionEnabled(item.key));

  return (
    <Sidebar side={side}>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <VexLogo size={32} />
          <div>
            <p className="font-bold text-lg" aria-hidden="true">VEX</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role === 'admin' ? (t('nav.admin') || 'Admin') : (t('nav.player') || 'Player')}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.navigation') || 'Navigation'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const badgeCount = item.key === 'notifications' ? unreadCount : (sectionCounts[item.key] || 0);
                const isActive = location === item.url;
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
                        <item.icon />
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

function BalanceBar() {
  const { user } = useAuth();
  return <BalanceDisplay balance={user?.balance || "0"} variant="header" showDeposit />;
}

function BottomNavigation({ onChatToggle, isChatOpen }: { onChatToggle: () => void; isChatOpen: boolean }) {
  const { t, language } = useI18n();
  const [location, setLocation] = useLocation();
  const { sectionCounts } = useNotificationStatus();
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const navItems: MenuItem[] = [
    { title: t('nav.p2p') || 'P2P', url: "/p2p", icon: ArrowLeftRight, key: "p2p" },
    { title: t('nav.main') || 'Main', url: "/", icon: Home, key: "main" },
    { title: t('nav.play') || 'Games', url: "/games", icon: Gamepad2, key: "play" },
    { title: t('nav.challenges') || 'Challenges', url: "/challenges", icon: Swords, key: "challenges" },
  ];

  const navigateToIndex = (direction: 'left' | 'right') => {
    const currentIndex = navItems.findIndex(item => item.url === location);
    if (currentIndex === -1) return;

    let newIndex: number;
    const isRTL = language === 'ar';

    if ((direction === 'right' && !isRTL) || (direction === 'left' && isRTL)) {
      newIndex = currentIndex < navItems.length - 1 ? currentIndex + 1 : 0;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : navItems.length - 1;
    }

    setLocation(navItems[newIndex].url);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        navigateToIndex(e.key === 'ArrowRight' ? 'right' : 'left');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location, setLocation, language]);

  useEffect(() => {
    const minSwipeDistance = 75;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchEndX.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current) return;

      const distance = touchStartX.current - touchEndX.current;
      const isSwipe = Math.abs(distance) > minSwipeDistance;

      if (isSwipe) {
        if (distance > 0) {
          navigateToIndex('right');
        } else {
          navigateToIndex('left');
        }
      }

      touchStartX.current = null;
      touchEndX.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [location, setLocation, language]);

  return (
    <nav className="fixed bottom-0 start-0 end-0 flex items-center justify-around gap-1 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t bg-background md:hidden z-50" aria-label="Main navigation">
      {navItems.map((item) => {
        const isActive = location === item.url;
        const badgeCount = isActive ? 0 : (sectionCounts[item.key] || 0);
        return (
          <Link key={item.key} href={item.url}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md min-w-[3rem] transition-colors no-underline ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            aria-current={isActive ? "page" : undefined}
            data-testid={`nav-${item.key}`}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" />
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{item.title}</span>
            {isActive && <div className="w-4 h-0.5 bg-primary rounded-full mt-0.5" />}
          </Link>
        );
      })}
      <button
        className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md min-w-[3rem] transition-colors ${isChatOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        onClick={onChatToggle}
        data-testid="nav-chat"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none">{t('nav.chat') || 'Chat'}</span>
        {isChatOpen && <div className="w-4 h-0.5 bg-primary rounded-full mt-0.5" />}
      </button>
    </nav>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { t, language, dir } = useI18n();
  const sidebarSide = dir === 'rtl' ? 'right' : 'left';
  const [isChatOpen, setIsChatOpen] = useState(false);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };

  return (
    <NotificationProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full" dir={dir}>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2">
            {t('nav.skipToContent') || 'Skip to content'}
          </a>
          <AppSidebar side={sidebarSide} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center justify-between gap-4 p-3 border-b bg-background sticky top-0 z-50">
              <SidebarTrigger className="h-10 w-10" aria-label={t('nav.navigation') || 'Navigation'} data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-3 flex-wrap">
                <Link href="/wallet">
                  <Button variant="outline" size="sm" className="gap-2" aria-label={t('nav.wallet') || 'Wallet'} data-testid="button-header-wallet">
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('nav.wallet')}</span>
                  </Button>
                </Link>
                <ThemeToggle />
                <NotificationBell />
                <LanguageSwitcher />
              </div>
            </header>
            <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0 animate-page-enter">
              {children}
            </main>
            <BottomNavigation onChatToggle={toggleChat} isChatOpen={isChatOpen} />
          </div>
          {isChatOpen && (
            <div className="fixed inset-0 z-[100] md:hidden" onClick={toggleChat}>
              <div className="absolute inset-0 bg-black/50" />
              <div
                className="absolute bottom-16 start-0 end-0 h-[70vh] bg-background rounded-t-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <Suspense fallback={<PageLoader />}>
                  <ChatPage />
                </Suspense>
              </div>
            </div>
          )}
        </div>
        <SupportChatWidget isLoggedIn={true} />
      </SidebarProvider>
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
            <AdminLayout><AdminDashboardPage /></AdminLayout>
          </Route>
          <Route path="/admin/users">
            <AdminLayout><AdminUsersPage /></AdminLayout>
          </Route>
          <Route path="/admin/transactions">
            <AdminLayout><AdminTransactionsPage /></AdminLayout>
          </Route>
          <Route path="/admin/sections">
            <AdminLayout><AdminSectionsPage /></AdminLayout>
          </Route>
          <Route path="/admin/anti-cheat">
            <AdminLayout><AdminAntiCheatPage /></AdminLayout>
          </Route>
          <Route path="/admin/analytics">
            <AdminLayout><AdminAnalyticsPage /></AdminLayout>
          </Route>
          <Route path="/admin/disputes">
            <AdminLayout><AdminDisputesPage /></AdminLayout>
          </Route>
          <Route path="/admin/tournaments">
            <AdminLayout><AdminTournamentsPage /></AdminLayout>
          </Route>
          <Route path="/admin/free-play">
            <AdminLayout><AdminFreePlayPage /></AdminLayout>
          </Route>
          <Route path="/admin/gifts">
            <AdminLayout><AdminGiftsPage /></AdminLayout>
          </Route>
          <Route path="/admin/p2p">
            <AdminLayout><AdminP2PPage /></AdminLayout>
          </Route>
          <Route path="/admin/currency">
            <AdminLayout><AdminCurrencyPage /></AdminLayout>
          </Route>
          <Route path="/admin/support">
            <AdminLayout><AdminSupportPage /></AdminLayout>
          </Route>
          <Route path="/admin/app-settings">
            <AdminLayout><AdminAppSettingsPage /></AdminLayout>
          </Route>
          <Route path="/admin/languages">
            <AdminLayout><AdminLanguagesPage /></AdminLayout>
          </Route>
          <Route path="/admin/badges">
            <AdminLayout><AdminBadgesPage /></AdminLayout>
          </Route>
          <Route path="/admin/notifications">
            <AdminLayout><AdminNotificationsPage /></AdminLayout>
          </Route>
          <Route path="/admin/games">
            <AdminLayout><AdminGamesPage /></AdminLayout>
          </Route>
          <Route path="/admin/external-games">
            <AdminLayout><AdminExternalGamesPage /></AdminLayout>
          </Route>
          <Route path="/admin/game-sections">
            <AdminLayout><AdminGameSectionsPage /></AdminLayout>
          </Route>
          <Route path="/admin/id-verification">
            <AdminLayout><AdminIdVerificationPage /></AdminLayout>
          </Route>
          <Route path="/admin/seo">
            <AdminLayout><AdminSeoPage /></AdminLayout>
          </Route>
          <Route path="/admin/payment-methods">
            <AdminLayout><AdminPaymentMethodsPage /></AdminLayout>
          </Route>
          <Route path="/admin/integrations">
            <AdminLayout><AdminIntegrationsPage /></AdminLayout>
          </Route>
          <Route path="/admin/social-platforms">
            <AdminLayout><AdminSocialPlatformsPage /></AdminLayout>
          </Route>
          <Route path="/admin/advertisements">
            <AdminLayout><AdminAdvertisementsPage /></AdminLayout>
          </Route>
          <Route path="/admin/support-settings">
            <AdminLayout><AdminSupportSettingsPage /></AdminLayout>
          </Route>
          <Route path="/admin/challenge-settings">
            <AdminLayout><AdminChallengeSettingsPage /></AdminLayout>
          </Route>
          <Route path="/admin/challenges">
            <AdminLayout><AdminChallengesPage /></AdminLayout>
          </Route>
          <Route path="/admin/chat-management">
            <AdminLayout><AdminChatPage /></AdminLayout>
          </Route>
          <Route path="/admin/sam9">
            <AdminLayout><AdminSam9Page /></AdminLayout>
          </Route>
          <Route path="/admin/audit-logs">
            <AdminLayout><AdminAuditLogsPage /></AdminLayout>
          </Route>
          <Route path="/admin/payment-security">
            <AdminLayout><AdminPaymentSecurityPage /></AdminLayout>
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  const { dir } = useI18n();
  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <header className="flex items-center justify-between gap-4 p-3 border-b bg-background sticky top-0 z-50">
        <Link href="/" aria-label="VEX Home">
          <div className="flex items-center gap-2 cursor-pointer">
            <VexLogo size={28} />
            <span className="font-bold text-lg">VEX</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LanguageSwitcher />
          <Link href="/">
            <Button size="sm" data-testid="button-login">Login</Button>
          </Link>
        </div>
      </header>
      <main className="p-4">
        {children}
      </main>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  // Update canonical URL dynamically
  useEffect(() => {
    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', `https://vixo.click${location === '/' ? '/' : location}`);
  }, [location]);

  if (location.startsWith("/admin")) {
    return <AdminRouter />;
  }

  // Challenges page is public - accessible without login
  if (location === "/challenges" && !isAuthenticated) {
    return (
      <PublicLayout>
        <Suspense fallback={<PageLoader />}>
          <ChallengesPage />
        </Suspense>
      </PublicLayout>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <VexLogo size={64} className="animate-pulse" />
      </div>
    );
  }

  // Terms and Privacy pages are public - accessible without login
  if (!isAuthenticated && (location === "/terms" || location === "/privacy" || location.startsWith("/auth/callback"))) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/terms" component={TermsPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/auth/callback" component={AuthCallbackPage} />
        </Switch>
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  return (
    <AuthenticatedLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/">{() => <ErrorBoundary><DashboardPage /></ErrorBoundary>}</Route>
          <Route path="/games">{() => <ErrorBoundary><GamesCatalogPage /></ErrorBoundary>}</Route>
          <Route path="/games/history">{() => <ErrorBoundary><GameHistoryPage /></ErrorBoundary>}</Route>
          <Route path="/play/:slug">{() => <ErrorBoundary><GamePlayerPage /></ErrorBoundary>}</Route>
          <Route path="/challenges">{() => <ErrorBoundary><ChallengesPage /></ErrorBoundary>}</Route>
          <Route path="/lobby">{() => <ErrorBoundary><GameLobbyPage /></ErrorBoundary>}</Route>
          <Route path="/tournaments">{() => <ErrorBoundary><TournamentsPage /></ErrorBoundary>}</Route>
          <Route path="/tournaments/:id">{() => <ErrorBoundary><TournamentsPage /></ErrorBoundary>}</Route>
          <Route path="/daily-rewards">{() => <ErrorBoundary><DailyRewardsPage /></ErrorBoundary>}</Route>
          <Route path="/notifications">{() => <ErrorBoundary><NotificationsPage /></ErrorBoundary>}</Route>
          <Route path="/referral">{() => <ErrorBoundary><ReferralPage /></ErrorBoundary>}</Route>
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
          <Route path="/arcade">{() => <ErrorBoundary><GamesCatalogPage /></ErrorBoundary>}</Route>
          <Route path="/admin/announcements">{() => <ErrorBoundary><AdminAnnouncementsPage /></ErrorBoundary>}</Route>
          <Route>{() => <ErrorBoundary><NotFound /></ErrorBoundary>}</Route>
        </Switch>
      </Suspense>
    </AuthenticatedLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <I18nProvider>
            <SettingsProvider>
              <AuthProvider>
                <VexNotificationPopupProvider>
                  <OfflineBanner />
                  <Toaster />
                  <TranslationDebugger />
                  <Router />
                </VexNotificationPopupProvider>
              </AuthProvider>
            </SettingsProvider>
          </I18nProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
