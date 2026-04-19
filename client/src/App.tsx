import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { SettingsProvider } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { VexLogo } from "@/components/vex-logo";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ErrorBoundary } from "@/components/error-boundary";
import { lazy, Suspense, useEffect } from "react";

const LoginPage = lazy(() => import("@/pages/login"));
const ChallengesPage = lazy(() => import("@/pages/challenges"));
const TournamentsPage = lazy(() => import("@/pages/tournaments"));
const TermsPage = lazy(() => import("@/pages/terms"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const AuthCallbackPage = lazy(() => import("@/pages/auth-callback"));
const PrivateRoutes = lazy(() => import("@/private-routes"));

const LanguageSwitcher = lazy(() =>
    import("@/lib/i18n-ui").then((module) => ({ default: module.LanguageSwitcher })),
);

const TranslationDebugger = import.meta.env.DEV
    ? lazy(() =>
        import("@/lib/i18n-ui").then((module) => ({ default: module.TranslationDebugger })),
    )
    : null;

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

function PublicLayout({ children }: { children: React.ReactNode }) {
    const { dir, t } = useI18n();
    return (
        <div className="min-h-screen bg-background" dir={dir}>
            <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b bg-background px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <Link href="/" aria-label="VEX Home">
                    <div className="flex items-center gap-2 cursor-pointer">
                        <VexLogo size={28} />
                        <span className="font-bold text-lg">VEX</span>
                    </div>
                </Link>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <Suspense fallback={null}>
                        <LanguageSwitcher />
                    </Suspense>
                    <Link href="/">
                        <Button size="sm" data-testid="button-login">
                            {t("auth.login")}
                        </Button>
                    </Link>
                </div>
            </header>
            <main className="p-4">{children}</main>
        </div>
    );
}

function Router() {
    const { isAuthenticated, isLoading } = useAuth();
    const [location] = useLocation();

    useEffect(() => {
        const link = document.querySelector('link[rel="canonical"]');
        if (link) {
            link.setAttribute("href", `https://vixo.click${location === "/" ? "/" : location}`);
        }
    }, [location]);

    if (location.startsWith("/admin")) {
        return (
            <Suspense fallback={<PageLoader />}>
                <PrivateRoutes />
            </Suspense>
        );
    }

    if (location === "/challenges" && !isAuthenticated) {
        return (
            <PublicLayout>
                <Suspense fallback={<PageLoader />}>
                    <ChallengesPage />
                </Suspense>
            </PublicLayout>
        );
    }

    const isPublicTournamentRoute = location === "/tournaments" || location.startsWith("/tournaments/");
    if (isPublicTournamentRoute && !isAuthenticated && !isLoading) {
        return (
            <PublicLayout>
                <Suspense fallback={<PageLoader />}>
                    <ErrorBoundary>
                        <TournamentsPage />
                    </ErrorBoundary>
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
        <Suspense fallback={<PageLoader />}>
            <PrivateRoutes />
        </Suspense>
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
                                <OfflineBanner />
                                <Toaster />
                                {TranslationDebugger && (
                                    <Suspense fallback={null}>
                                        <TranslationDebugger />
                                    </Suspense>
                                )}
                                <Router />
                            </AuthProvider>
                        </SettingsProvider>
                    </I18nProvider>
                </TooltipProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;
