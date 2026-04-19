import { useEffect, lazy, Suspense, useCallback, useState } from "react";
import { useLocation } from "wouter";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { VexLogo } from "@/components/vex-logo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  ShieldAlert,
  BarChart3,
  AlertTriangle,
  LogOut,
  Gamepad2,
  Home,
  Headset,
  ArrowLeftRight,
  Cog,
  Languages,
  Award,
  Bell,
  IdCard,
  Search,
  CreditCard,
  DollarSign,
  Share2,
  Coins,
  Heart,
  Trophy,
  Crown,
  FileText,
  LayoutGrid,
  Gift,
  Swords,
  MessageCircle,
  Bot,
} from "lucide-react";
import { AdminAlertsDropdown } from "@/components/admin/AdminAlertsDropdown";
import { useAdminAlertCountsBySection } from "@/hooks/use-admin-alert-counts";
import { useI18n } from "@/lib/i18n";

const AdminLoginPage = lazy(() => import("./admin-login"));

interface AdminLayoutProps {
  children: React.ReactNode;
}

function AdminSidebar() {
  const [location, setLocation] = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const { data: sectionCounts } = useAdminAlertCountsBySection();
  const { t } = useI18n();

  const handleNavClick = useCallback((url: string) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    setLocation(url);
  }, [isMobile, setOpenMobile, setLocation]);

  // Get unread alert count for a section by its deepLink URL
  const getSectionCount = (url: string): number => {
    if (!sectionCounts) return 0;
    return sectionCounts[url] || 0;
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setLocation("/admin");
  };

  const menuItems = [
    { id: "dashboard", titleKey: "admin.layout.menu.dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { id: "users", titleKey: "admin.layout.menu.users", url: "/admin/users", icon: Users, hasBadge: true },
    { id: "transactions", titleKey: "admin.layout.menu.transactions", url: "/admin/transactions", icon: DollarSign, hasBadge: true },
    { id: "games", titleKey: "admin.layout.menu.games", url: "/admin/games", icon: Gamepad2 },
    { id: "game-sections", titleKey: "admin.layout.menu.gameSections", url: "/admin/game-sections", icon: LayoutGrid },
    { id: "challenges", titleKey: "admin.layout.menu.challenges", url: "/admin/challenges", icon: Swords },
    { id: "challenge-settings", titleKey: "admin.layout.menu.challengeSettings", url: "/admin/challenge-settings", icon: Settings },
    { id: "p2p", titleKey: "admin.layout.menu.p2pManagement", url: "/admin/p2p", icon: ArrowLeftRight, hasBadge: true },
    { id: "support-settings", titleKey: "admin.layout.menu.supportSettings", url: "/admin/support-settings", icon: Heart, hasBadge: true },
    { id: "id-verification", titleKey: "admin.layout.menu.idVerification", url: "/admin/id-verification", icon: IdCard, hasBadge: true },
    { id: "support", titleKey: "admin.layout.menu.supportContacts", url: "/admin/support", icon: Headset },
    { id: "anti-cheat", titleKey: "admin.layout.menu.antiCheat", url: "/admin/anti-cheat", icon: Shield },
    { id: "payment-security", titleKey: "admin.layout.menu.paymentSecurity", url: "/admin/payment-security", icon: ShieldAlert, hasBadge: true },
    { id: "chat-management", titleKey: "admin.layout.menu.chatManagement", url: "/admin/chat-management", icon: MessageCircle },
    { id: "sam9", titleKey: "admin.layout.menu.sam9Control", url: "/admin/sam9", icon: Bot },
    { id: "analytics", titleKey: "admin.layout.menu.analytics", url: "/admin/analytics", icon: BarChart3 },
    { id: "disputes", titleKey: "admin.layout.menu.disputes", url: "/admin/disputes", icon: AlertTriangle, hasBadge: true },
    { id: "free-play", titleKey: "admin.layout.menu.freePlay", url: "/admin/free-play", icon: Gift },
    { id: "marketers", titleKey: "admin.layout.menu.marketers", url: "/admin/marketers", icon: Crown },
    { id: "gifts", titleKey: "admin.layout.menu.giftCatalog", url: "/admin/gifts", icon: Gift },
    { id: "tournaments", titleKey: "admin.layout.menu.tournaments", url: "/admin/tournaments", icon: Trophy },
    { id: "audit-logs", titleKey: "admin.layout.menu.auditLogs", url: "/admin/audit-logs", icon: FileText },
  ];

  const settingsItems = [
    { id: "app-settings", titleKey: "admin.layout.settings.appSettings", url: "/admin/app-settings", icon: Cog },
    { id: "currency", titleKey: "admin.layout.settings.projectCurrency", url: "/admin/currency", icon: Coins },
    { id: "seo", titleKey: "admin.layout.settings.seoSettings", url: "/admin/seo", icon: Search },
    { id: "sections", titleKey: "admin.layout.settings.sectionControls", url: "/admin/sections", icon: Settings },
    { id: "social-platforms", titleKey: "admin.layout.settings.socialPlatforms", url: "/admin/social-platforms", icon: Share2 },
    { id: "languages", titleKey: "admin.layout.settings.languages", url: "/admin/languages", icon: Languages },
    { id: "badges", titleKey: "admin.layout.settings.badges", url: "/admin/badges", icon: Award },
    { id: "notifications", titleKey: "admin.layout.settings.notifications", url: "/admin/notifications", icon: Bell },
    { id: "payment-methods", titleKey: "admin.layout.settings.paymentMethods", url: "/admin/payment-methods", icon: CreditCard },
    { id: "integrations", titleKey: "admin.layout.settings.integrations", url: "/admin/integrations", icon: Settings },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <VexLogo size={32} />
          <div>
            <h2 className="font-bold text-lg">{t("admin.layout.brandTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("admin.layout.brandSubtitle")}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("admin.layout.group.management")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const count = item.hasBadge ? getSectionCount(item.url) : 0;
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleNavClick(item.url)}
                      data-testid={`admin-link-${item.id}`}
                    >
                      <div className="relative">
                        <item.icon />
                        {count > 0 && !isActive && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1 animate-in fade-in zoom-in duration-200">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </div>
                      <span>{t(item.titleKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("admin.layout.group.settings")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={location === item.url}
                    onClick={() => handleNavClick(item.url)}
                    data-testid={`admin-link-${item.id}`}
                  >
                    <item.icon />
                    <span>{t(item.titleKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("admin.layout.group.quickLinks")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => window.open("/", "_blank")}>
                  <Home />
                  <span>{t("admin.layout.quickLinks.viewUserApp")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{t("admin.layout.loggedInAs")}</span>
            <p className="font-semibold">{t("admin.layout.administrator")}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
            data-testid="button-admin-logout"
          >
            <LogOut className="me-2 h-4 w-4" />
            {t("admin.layout.signOut")}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-16 w-16 rounded-full mx-auto" />
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const validateAdminSession = async () => {
      const token = localStorage.getItem("adminToken");
      if (!token) {
        if (active) {
          setIsAuthenticated(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/admin/alerts/count", {
          method: "GET",
          headers: {
            "x-admin-token": token,
          },
          credentials: "include",
        });

        if (!active) {
          return;
        }

        if (response.ok) {
          setIsAuthenticated(true);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");
        }

        setIsAuthenticated(false);
      } catch {
        if (active) {
          setIsAuthenticated(false);
        }
      }
    };

    void validateAdminSession();

    return () => {
      active = false;
    };
  }, []);

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return <LoginFallback />;
  }

  // If no token, render login page directly (no Redirect, no navigation loops)
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoginFallback />}>
        <AdminLoginPage />
      </Suspense>
    );
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="admin-clean-ui flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background sticky top-0 z-50">
            <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
            <div className="flex items-center gap-3">
              <AdminAlertsDropdown />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
