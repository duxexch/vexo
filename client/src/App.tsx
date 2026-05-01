import { Switch, Route, useLocation, Link } from "wouter";
import { getCanonicalUrl } from "@shared/runtime-config";
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
import {
    cancelStartupPermissionRequest,
    scheduleStartupPermissionRequest,
} from "@/lib/post-login-permission-scheduler";
import { lazy, Suspense, useEffect } from "react";

const LoginPage = lazy(() => import("@/pages/login"));
const SelectUsernamePage = lazy(() => import("@/pages/select-username"));
const ChallengesPage = lazy(() => import("@/pages/challenges"));
const TournamentsPage = lazy(() => import("@/pages/tournaments"));
const ChallengeWatchPage = lazy(() => import("@/pages/challenge-watch"));
const SeoGameLandingPage = lazy(() => import("@/pages/seo/game-landing"));
const SeoCategoryHubPage = lazy(() => import("@/pages/seo/category-hub"));
const SeoPlayerProfilePage = lazy(() => import("@/pages/seo/player-profile-public"));
const SeoMatchRecapPage = lazy(() => import("@/pages/seo/match-recap"));
const SeoLeaderboardGamePage = lazy(() => import("@/pages/seo/leaderboard-game"));
const ArcadePlayPage = lazy(() => import("@/pages/arcade-play"));
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

/**
 * Arms the one-time post-login OS permission burst (camera + mic +
 * notifications) sixty seconds after the user authenticates, and
 * cancels any pending timer when they sign out. Renders nothing.
 *
 * Mounted inside `<AuthProvider>` so it always has access to the
 * latest `isAuthenticated` flag without prop-drilling.
 */
function StartupPermissionScheduler() {
    const { isAuthenticated } = useAuth();
    useEffect(() => {
        if (isAuthenticated) {
            scheduleStartupPermissionRequest();
        } else {
            cancelStartupPermissionRequest();
        }
    }, [isAuthenticated]);
    return null;
}

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
            <footer className="border-t mt-8 px-4 py-6 text-sm" data-testid="footer-seo-links">
                <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-6">
                    <div>
                        <div className="font-semibold mb-2">{dir === "rtl" ? "الفئات" : "Categories"}</div>
                        <ul className="space-y-1">
                            <li><Link href="/games/board" className="hover:underline">{dir === "rtl" ? "ألعاب الطاولة" : "Board games"}</Link></li>
                            <li><Link href="/games/card" className="hover:underline">{dir === "rtl" ? "ألعاب الورق" : "Card games"}</Link></li>
                            <li><Link href="/games/language" className="hover:underline">{dir === "rtl" ? "تحدي اللغات" : "Language"}</Link></li>
                        </ul>
                    </div>
                    <div>
                        <div className="font-semibold mb-2">{dir === "rtl" ? "الألعاب" : "Games"}</div>
                        <ul className="space-y-1">
                            <li><Link href="/game/chess" className="hover:underline">{dir === "rtl" ? "شطرنج" : "Chess"}</Link></li>
                            <li><Link href="/game/backgammon" className="hover:underline">{dir === "rtl" ? "طاولة" : "Backgammon"}</Link></li>
                            <li><Link href="/game/domino" className="hover:underline">{dir === "rtl" ? "دومينو" : "Domino"}</Link></li>
                            <li><Link href="/game/tarneeb" className="hover:underline">{dir === "rtl" ? "طرنيب" : "Tarneeb"}</Link></li>
                            <li><Link href="/game/baloot" className="hover:underline">{dir === "rtl" ? "بلوت" : "Baloot"}</Link></li>
                            <li><Link href="/game/languageduel" className="hover:underline">{dir === "rtl" ? "تحدي اللغة" : "Language Duel"}</Link></li>
                        </ul>
                    </div>
                    <div>
                        <div className="font-semibold mb-2">{dir === "rtl" ? "المتصدرون" : "Leaderboards"}</div>
                        <ul className="space-y-1">
                            <li><Link href="/leaderboard/chess" className="hover:underline">{dir === "rtl" ? "شطرنج" : "Chess"}</Link></li>
                            <li><Link href="/leaderboard/backgammon" className="hover:underline">{dir === "rtl" ? "طاولة" : "Backgammon"}</Link></li>
                            <li><Link href="/leaderboard/domino" className="hover:underline">{dir === "rtl" ? "دومينو" : "Domino"}</Link></li>
                            <li><Link href="/leaderboard/tarneeb" className="hover:underline">{dir === "rtl" ? "طرنيب" : "Tarneeb"}</Link></li>
                            <li><Link href="/leaderboard/baloot" className="hover:underline">{dir === "rtl" ? "بلوت" : "Baloot"}</Link></li>
                        </ul>
                    </div>
                    <div>
                        <div className="font-semibold mb-2">{dir === "rtl" ? "البرامج" : "Programs"}</div>
                        <ul className="space-y-1">
                            <li><Link href="/coin" className="hover:underline">{dir === "rtl" ? "عملة المشروع" : "Project Coin"}</Link></li>
                            <li><Link href="/invest" className="hover:underline">{dir === "rtl" ? "استثمر في فيكس" : "Invest in VEX"}</Link></li>
                            <li><Link href="/agents-program" className="hover:underline">{dir === "rtl" ? "برنامج الوكلاء" : "Agents Program"}</Link></li>
                            <li><Link href="/affiliates" className="hover:underline">{dir === "rtl" ? "برنامج المسوقين" : "Marketers Program"}</Link></li>
                        </ul>
                    </div>
                    <div>
                        <div className="font-semibold mb-2">{dir === "rtl" ? "روابط" : "Links"}</div>
                        <ul className="space-y-1">
                            <li><Link href="/tournaments" className="hover:underline">{dir === "rtl" ? "البطولات" : "Tournaments"}</Link></li>
                            <li><Link href="/challenges" className="hover:underline">{dir === "rtl" ? "التحديات" : "Challenges"}</Link></li>
                            <li><Link href="/terms" className="hover:underline">{dir === "rtl" ? "الشروط" : "Terms"}</Link></li>
                            <li><Link href="/privacy" className="hover:underline">{dir === "rtl" ? "الخصوصية" : "Privacy"}</Link></li>
                        </ul>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function Router() {
    const { isAuthenticated, isLoading, user } = useAuth();
    const [location] = useLocation();

    useEffect(() => {
        const link = document.querySelector('link[rel="canonical"]');
        if (link) {
            link.setAttribute("href", getCanonicalUrl(location));
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

    // ==================== Programmatic SEO public routes ====================
    // These crawlable landing pages are accessible to both authenticated and
    // anonymous users so search engines can index them. Authenticated users get
    // the same content; the global app shell handles navigation back to the app.
    const isSeoPublicRoute =
        /^\/game\/[A-Za-z0-9_-]+$/.test(location)
        || /^\/games\/[A-Za-z0-9_-]+$/.test(location)
        || /^\/arcade-play\/[A-Za-z0-9_-]+$/.test(location)
        || /^\/player\/[A-Za-z0-9_.-]+$/.test(location)
        || /^\/match\/[A-Fa-f0-9-]{8,}$/.test(location)
        || /^\/leaderboard\/[A-Za-z0-9_-]+$/.test(location);

    // Render unconditionally so search engines AND authenticated users land on
    // the same crawlable page (auth status only affects header CTA).
    if (isSeoPublicRoute) {
        return (
            <PublicLayout>
                <Suspense fallback={<PageLoader />}>
                    <ErrorBoundary>
                        <Switch>
                            <Route path="/game/:slug" component={SeoGameLandingPage} />
                            <Route path="/games/:category" component={SeoCategoryHubPage} />
                            <Route path="/arcade-play/:gameKey" component={ArcadePlayPage} />
                            <Route path="/player/:username" component={SeoPlayerProfilePage} />
                            <Route path="/match/:id" component={SeoMatchRecapPage} />
                            <Route path="/leaderboard/:game" component={SeoLeaderboardGamePage} />
                        </Switch>
                    </ErrorBoundary>
                </Suspense>
            </PublicLayout>
        );
    }

    // Public read-only spectator view for challenges. Anonymous visitors see
    // the live match in view-only mode; logged-in users get the full panel
    // (chat, gifts, stake actions) handled inside the page component.
    const isPublicChallengeWatch = /^\/challenge\/[A-Za-z0-9_-]+\/watch\/?$/.test(location);
    if (isPublicChallengeWatch && !isAuthenticated && !isLoading) {
        return (
            <PublicLayout>
                <Suspense fallback={<PageLoader />}>
                    <ErrorBoundary>
                        <Route path="/challenge/:id/watch" component={ChallengeWatchPage} />
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

    // Mandatory username selection on first login. Players whose account was
    // created by the one-click flow have usernameSelectedAt = null and must
    // pick a permanent username before reaching the rest of the app. Admins
    // are exempt (matches server-side gate in authMiddleware).
    if (user && user.role !== "admin" && !user.usernameSelectedAt) {
        return (
            <Suspense fallback={<PageLoader />}>
                <SelectUsernamePage />
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
                                <StartupPermissionScheduler />
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
