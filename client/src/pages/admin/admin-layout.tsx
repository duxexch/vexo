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
  Share2,
  Coins,
  Heart,
  Trophy,
  FileText,
  LayoutGrid,
  Gift,
  Swords,
  MessageCircle,
  Bot,
} from "lucide-react";
import { AdminAlertsDropdown } from "@/components/admin/AdminAlertsDropdown";
import { useAdminAlertCountsBySection } from "@/hooks/use-admin-alert-counts";

const AdminLoginPage = lazy(() => import("./admin-login"));

interface AdminLayoutProps {
  children: React.ReactNode;
}

function AdminSidebar() {
  const [location, setLocation] = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const { data: sectionCounts } = useAdminAlertCountsBySection();

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
    { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { title: "Users", url: "/admin/users", icon: Users, hasBadge: true },
    { title: "Games", url: "/admin/games", icon: Gamepad2 },
    { title: "Game Sections", url: "/admin/game-sections", icon: LayoutGrid },
    { title: "Challenges", url: "/admin/challenges", icon: Swords },
    { title: "Challenge Settings", url: "/admin/challenge-settings", icon: Settings },
    { title: "P2P Management", url: "/admin/p2p", icon: ArrowLeftRight, hasBadge: true },
    { title: "Support Settings", url: "/admin/support-settings", icon: Heart, hasBadge: true },
    { title: "ID Verification", url: "/admin/id-verification", icon: IdCard, hasBadge: true },
    { title: "Support Contacts", url: "/admin/support", icon: Headset },
    { title: "Anti-Cheat", url: "/admin/anti-cheat", icon: Shield },
    { title: "Payment Security", url: "/admin/payment-security", icon: ShieldAlert, hasBadge: true },
    { title: "Chat Management", url: "/admin/chat-management", icon: MessageCircle },
    { title: "SAM9 Control", url: "/admin/sam9", icon: Bot },
    { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
    { title: "Disputes", url: "/admin/disputes", icon: AlertTriangle, hasBadge: true },
    { title: "Free Play", url: "/admin/free-play", icon: Gift },
    { title: "Tournaments", url: "/admin/tournaments", icon: Trophy },
    { title: "Audit Logs", url: "/admin/audit-logs", icon: FileText },
  ];

  const settingsItems = [
    { title: "App Settings", url: "/admin/app-settings", icon: Cog },
    { title: "Project Currency", url: "/admin/currency", icon: Coins },
    { title: "SEO Settings", url: "/admin/seo", icon: Search },
    { title: "Section Controls", url: "/admin/sections", icon: Settings },
    { title: "Social Platforms", url: "/admin/social-platforms", icon: Share2 },
    { title: "Languages", url: "/admin/languages", icon: Languages },
    { title: "Badges", url: "/admin/badges", icon: Award },
    { title: "Notifications", url: "/admin/notifications", icon: Bell },
    { title: "Payment Methods", url: "/admin/payment-methods", icon: CreditCard },
    { title: "Integrations", url: "/admin/integrations", icon: Settings },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <VexLogo size={32} />
          <div>
            <h2 className="font-bold text-lg">VEX Admin</h2>
            <p className="text-xs text-muted-foreground">Control Panel</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
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
                      data-testid={`admin-link-${item.title.toLowerCase().replace(' ', '-')}`}
                    >
                      <div className="relative">
                        <item.icon />
                        {count > 0 && !isActive && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1 animate-in fade-in zoom-in duration-200">
                            {count > 99 ? "99+" : count}
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

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={location === item.url}
                    onClick={() => handleNavClick(item.url)}
                    data-testid={`admin-link-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Quick Links</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => window.open("/", "_blank")}>
                  <Home />
                  <span>View User App</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Logged in as</span>
            <p className="font-semibold">Administrator</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
            data-testid="button-admin-logout"
          >
            <LogOut className="me-2 h-4 w-4" />
            Sign Out
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
    const token = localStorage.getItem("adminToken");
    setIsAuthenticated(!!token);
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
      <div className="flex h-screen w-full">
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
