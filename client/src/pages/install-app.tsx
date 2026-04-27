import { useI18n } from "@/lib/i18n";
import { useInstallPWA } from "@/hooks/use-install-pwa";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  Download, Smartphone, Monitor, Share, Plus, MoreVertical,
  CheckCircle2, Wifi, Bell, Zap, Shield, ArrowDown, RefreshCw,
  ExternalLink, Globe, Package, Star, Clock, HardDrive,
  X, Check, Sparkles, Image, MessageCircleQuestion, Share2,
  ChevronRight, Trophy, Gamepad2, ArrowUpRight
} from "lucide-react";
import { VexLogo } from "@/components/vex-logo";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef, useCallback } from "react";

interface StoreSettings {
  store_google_play_url?: string | null;
  store_apple_url?: string | null;
  store_show_pwa?: string | null;
  store_show_google_play?: string | null;
  store_show_apple?: string | null;
}

// Shape of /downloads/manifest.json — written by
// scripts/server/refresh-android-binaries.sh whenever a new build is
// published. The frontend reads this so the user's "Save as" dialog
// always shows VEX-<version>.apk and never the legacy app.apk name.
interface ApkManifest {
  version: string;
  apkFile: string;
  apkUrl: string;
  apkSize: number;
  apkSizeMb: number;
  apkSha256: string;
  aabFile?: string;
  aabSize?: number;
  aabSha256?: string;
  releasedAt?: string;
}

/* ══════════════════════════════════════════════════════════
   Animated counter hook — counts from 0 → target
   ══════════════════════════════════════════════════════════ */
function useAnimatedCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [started, target, duration]);

  return { count, ref };
}

export default function InstallAppPage() {
  const { t, language, dir } = useI18n();
  const { isInstallable, isInstalled, isIOS, isAndroid, isStandalone, promptInstall } = useInstallPWA();
  const [installing, setInstalling] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [screenshotIdx, setScreenshotIdx] = useState(0);
  const { toast } = useToast();
  const instructionsRef = useRef<HTMLDivElement>(null);

  // Animated counters for social proof
  const downloads = useAnimatedCounter(12500, 2500);
  const rating = useAnimatedCounter(48, 1800); // 4.8 → displayed as 4.8

  // Fetch store link settings from admin config
  const { data: storeSettings } = useQuery<StoreSettings>({
    queryKey: ["/api/settings/store-links"],
    queryFn: async () => {
      const res = await fetch("/api/settings/store-links");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  // Fetch the APK release manifest written by refresh-android-binaries.sh.
  // The manifest is the single source of truth for the current APK
  // filename (VEX-<version>.apk), size, and SHA-256 — bumping
  // package.json -> version and re-running the refresh script updates
  // every download surface (this page + /downloads/index.html + the
  // /api/health release info) without any other code edit.
  const { data: apkManifest } = useQuery<ApkManifest | null>({
    queryKey: ["/downloads/manifest.json"],
    queryFn: async () => {
      try {
        const res = await fetch("/downloads/manifest.json", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as ApkManifest;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
  });

  const showPwa = storeSettings?.store_show_pwa !== "false";
  const showGooglePlay = storeSettings?.store_show_google_play !== "false";
  const showAppStore = storeSettings?.store_show_apple !== "false";
  const googlePlayUrl = storeSettings?.store_google_play_url || "";
  const appStoreUrl = storeSettings?.store_apple_url || "";

  // Determine platform recommendation
  const platformHint = isIOS ? 'pwa' : isAndroid ? 'apk' : 'pwa';

  const handleInstall = async () => {
    if (isInstallable) {
      setInstalling(true);
      const result = await promptInstall();
      setInstalling(false);
      if (result) {
        setShowSuccess(true);
      }
    } else {
      if (instructionsRef.current) {
        instructionsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      toast({
        title: t('install.followSteps'),
        description: t('install.followStepsDesc'),
      });
    }
  };

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'VEX Gaming',
      text: t('install.shareText'),
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast({ title: t('install.linkCopied') });
      }
    } catch { /* user cancelled */ }
  }, [t, toast]);

  // Animated pulse for the main CTA
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 2000);
    return () => clearInterval(timer);
  }, []);

  // Screenshot carousel auto-advance
  const screenshots = ['/screenshots/vex-gaming-mobile-screenshot.png', '/screenshots/vex-gaming-desktop-screenshot.png'];
  useEffect(() => {
    const timer = setInterval(() => setScreenshotIdx((i) => (i + 1) % screenshots.length), 4000);
    return () => clearInterval(timer);
  }, [screenshots.length]);

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] px-4 py-4 sm:py-6 pb-[max(1rem,env(safe-area-inset-bottom))]" dir={dir}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ══════════════════════════════════════════════════════════════
            ██  HERO SECTION — animated gradient with floating icons  ██
            ══════════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-500/10 border border-primary/20 p-5 sm:p-8 md:p-10 text-center">
          {/* Floating decorative elements */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/10 rounded-full blur-2xl animate-pulse" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/4 left-8 opacity-10 animate-bounce" style={{ animationDuration: '3s' }}>
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div className="absolute bottom-1/4 right-10 opacity-10 animate-bounce" style={{ animationDuration: '4s', animationDelay: '1.5s' }}>
            <Trophy className="w-7 h-7" />
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <VexLogo size={80} />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center border-2 border-background shadow-lg shadow-green-500/30">
                  <Download className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {t('install.title')}
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
              {t('install.description')}
            </p>

            {/* Stats strip */}
            <div className="flex items-center justify-center gap-5 pt-2" ref={downloads.ref}>
              <div className="text-center">
                <div className="text-lg md:text-xl font-bold text-primary">{downloads.count.toLocaleString()}+</div>
                <div className="text-[10px] text-muted-foreground">{t('install.totalDownloads')}</div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="text-center">
                <div className="text-lg md:text-xl font-bold text-yellow-500 flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-500" />
                  {(rating.count / 10).toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground">{t('install.userRating')}</div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="text-center">
                <div className="text-lg md:text-xl font-bold text-emerald-500">v1.1.0</div>
                <div className="text-[10px] text-muted-foreground">{t('install.latestVersion')}</div>
              </div>
            </div>

            {/* Version + share */}
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/60 backdrop-blur rounded-full border border-border/50 text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3 text-primary" />
                <span>{t('install.freeForever')}</span>
              </div>
              <button
                onClick={handleShare}
                className="inline-flex min-h-[40px] items-center gap-1.5 px-3 py-1.5 bg-background/60 backdrop-blur rounded-full border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Share2 className="w-3 h-3" />
                {t('install.shareApp')}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ██  SMART PLATFORM DETECTION BANNER  ██
            ══════════════════════════════════════════════════════════════ */}
        {!isInstalled && !showSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {isIOS ? <Smartphone className="w-5 h-5 text-primary" /> :
                isAndroid ? <Smartphone className="w-5 h-5 text-primary" /> :
                  <Monitor className="w-5 h-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{t('install.detectedDevice')}</p>
              <p className="text-xs text-muted-foreground">
                {isIOS ? t('install.bestForIos') :
                  isAndroid ? t('install.bestForAndroid') :
                    t('install.bestForDesktop')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        )}

        {/* ── Success State ── */}
        {(isInstalled || showSuccess) && (
          <Card className="border-green-500/30 bg-gradient-to-b from-green-500/10 to-green-500/5 overflow-hidden">
            <CardContent className="p-6 text-center space-y-4">
              <div className="relative inline-flex">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-bounce">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-green-500">
                {t('install.installed')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('install.installedDesc')}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5 min-h-[40px]">
                  <Share2 className="w-3.5 h-3.5" />
                  {t('install.shareWithFriends')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Store Download Buttons ── */}
        {(showGooglePlay || showAppStore) && (
          <Card className="border-border/50">
            <CardContent className="p-5 space-y-3">
              <h2 className="text-sm font-semibold text-center text-muted-foreground uppercase tracking-wider">
                {t('install.alsoAvailable')}
              </h2>
              <div className="flex justify-center gap-3 flex-wrap">
                {showGooglePlay && googlePlayUrl && (
                  <a href={googlePlayUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-gray-900 rounded-xl border border-white/10 transition-colors group">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.3 2.3-8.636-8.632z" />
                    </svg>
                    <div>
                      <p className="text-[10px] text-gray-400 leading-none">{t('install.getItOn')}</p>
                      <p className="text-sm font-semibold text-white leading-tight">Google Play</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300 ms-1" />
                  </a>
                )}
                {showAppStore && appStoreUrl && (
                  <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-gray-900 rounded-xl border border-white/10 transition-colors group">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    <div>
                      <p className="text-[10px] text-gray-400 leading-none">{t('install.downloadOn')}</p>
                      <p className="text-sm font-semibold text-white leading-tight">App Store</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300 ms-1" />
                  </a>
                )}
                {showGooglePlay && !googlePlayUrl && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 rounded-xl border border-border/50 opacity-50 cursor-not-allowed">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.3 2.3-8.636-8.632z" /></svg>
                    <div>
                      <p className="text-[10px] text-muted-foreground leading-none">{t('install.comingSoon')}</p>
                      <p className="text-sm font-semibold leading-tight">Google Play</p>
                    </div>
                  </div>
                )}
                {showAppStore && !appStoreUrl && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 rounded-xl border border-border/50 opacity-50 cursor-not-allowed">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    <div>
                      <p className="text-[10px] text-muted-foreground leading-none">{t('install.comingSoon')}</p>
                      <p className="text-sm font-semibold leading-tight">App Store</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ██  APP SCREENSHOTS PREVIEW  ██
            ══════════════════════════════════════════════════════════════ */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" />
                {t('install.appPreview')}
              </h3>
              <div className="flex gap-1.5">
                {screenshots.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setScreenshotIdx(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === screenshotIdx ? 'bg-primary' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>
            <div className="relative aspect-[16/9] bg-muted/20 overflow-hidden">
              {screenshots.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={`VEX App ${i === 0 ? 'Mobile' : 'Desktop'}`}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${i === screenshotIdx ? 'opacity-100' : 'opacity-0'}`}
                  loading="lazy"
                />
              ))}
            </div>
            <div className="px-5 py-2 text-center text-[11px] text-muted-foreground">
              {screenshotIdx === 0 ? t('install.screenshotMobile') : t('install.screenshotDesktop')}
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            ██  TABBED DOWNLOAD SECTION  ██
            ══════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">{t('install.chooseMethod')}</h2>
            <p className="text-sm text-muted-foreground">{t('install.chooseMethodDesc')}</p>
          </div>

          <Tabs defaultValue={platformHint} className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-12 rounded-2xl bg-muted/40 border border-border/60 p-1">
              <TabsTrigger value="pwa" className="gap-1.5 text-xs sm:text-sm rounded-xl data-[state=active]:text-primary data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Globe className="w-3.5 h-3.5" />
                PWA
              </TabsTrigger>
              <TabsTrigger value="apk" className="gap-1.5 text-xs sm:text-sm rounded-xl data-[state=active]:text-blue-500 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Package className="w-3.5 h-3.5" />
                APK
              </TabsTrigger>
            </TabsList>

            {/* ── Tab: PWA ── */}
            <TabsContent value="pwa">
              {showPwa && !isInstalled && !showSuccess ? (
                <Card
                  className="border-primary/40 bg-gradient-to-b from-primary/10 to-primary/5 overflow-hidden cursor-pointer hover:border-primary/70 hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-[0.98] relative"
                  onClick={!installing ? handleInstall : undefined}
                >
                  <div className="absolute top-3 end-3 z-20">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-full tracking-wider">
                      <Star className="w-3 h-3" />
                      {t('install.recommended')}
                    </span>
                  </div>
                  <CardContent className="p-6 relative">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full" />
                    <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-primary/5 rounded-full" />
                    <div className="relative z-10 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{t('install.pwaTitle')}</h3>
                          <p className="text-xs text-muted-foreground">{t('install.pwaSubtitle')}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md"><HardDrive className="w-3 h-3" /> {'< 1 MB'}</span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md"><RefreshCw className="w-3 h-3" /> {t('install.autoUpdate')}</span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md"><Globe className="w-3 h-3" /> {t('install.allPlatforms')}</span>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {['install.pwaPro1', 'install.pwaPro2', 'install.pwaPro3', 'install.pwaPro4'].map((key) => (
                          <li key={key} className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{t(key)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className={`w-full text-lg py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25 rounded-xl flex items-center justify-center gap-2 select-none transition-transform duration-700 ${pulse ? 'scale-[1.02]' : 'scale-100'}`}>
                        {installing ? (
                          <><RefreshCw className="h-5 w-5 animate-spin" />{t('install.installing')}</>
                        ) : (
                          <><Download className="h-6 w-6" />{t('install.tapToInstall')}</>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-green-500/20 bg-green-500/5">
                  <CardContent className="p-6 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                    <p className="text-sm font-medium text-green-600">{t('install.pwaAlreadyInstalled')}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Tab: APK ── */}
            <TabsContent value="apk">
              <Card className="border-blue-500/30 bg-gradient-to-b from-blue-500/5 to-transparent overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Package className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{t('install.directApk')}</h3>
                      <p className="text-xs text-muted-foreground">{t('install.apkSubtitle')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md">
                      <HardDrive className="w-3 h-3" />
                      {apkManifest?.apkSizeMb
                        ? `${apkManifest.apkSizeMb} MB`
                        : apkManifest?.apkSize
                          ? `${Math.round(apkManifest.apkSize / 1048576)} MB`
                          : '— MB'}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md"><Smartphone className="w-3 h-3" /> Android 7.0+</span>
                    <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md"><Shield className="w-3 h-3" /> {t('install.signedCert')}</span>
                    {apkManifest?.version && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-background/50 rounded-md font-mono">
                        v{apkManifest.version}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {['install.apkPro1', 'install.apkPro2', 'install.apkPro3'].map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        <span>{t(key)}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={apkManifest?.apkUrl || '#'}
                    download={apkManifest?.apkFile || true}
                    onClick={(e) => {
                      // Block premature clicks before the manifest finishes
                      // loading so the user never gets a 404 / empty file.
                      if (!apkManifest?.apkUrl) {
                        e.preventDefault();
                      }
                    }}
                    aria-disabled={!apkManifest?.apkUrl}
                    className={`flex min-h-[44px] items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/20 ${!apkManifest?.apkUrl ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <ArrowDown className="w-5 h-5" />
                    {t('install.downloadApk')}
                  </a>
                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    {t('install.apkNote')}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ██  COMPARISON TABLE — with colored icons  ██
            ══════════════════════════════════════════════════════════════ */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-border/50 bg-muted/30">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {t('install.comparison')}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/10">
                    <th className="text-start p-3 text-muted-foreground font-medium">{t('install.feature')}</th>
                    <th className="p-3 text-center">
                      <span className="text-primary font-bold">PWA</span>
                    </th>
                    <th className="p-3 text-center">
                      <span className="text-blue-500 font-bold">APK</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {[
                    { label: 'install.compSize', pwa: '< 1 MB', apk: '11.8 MB', isText: true },
                    { label: 'install.compUpdate', pwa: true, apk: false },
                    { label: 'install.compOffline', pwa: true, apk: true },
                    { label: 'install.compNotif', pwa: true, apk: true },
                    { label: 'install.compStore', pwa: false, apk: false },
                    { label: 'install.compNoInstall', pwa: true, apk: false },
                    { label: 'install.compNative', pwa: false, apk: true },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-medium">{t(row.label)}</td>
                      {(['pwa', 'apk'] as const).map((col) => (
                        <td key={col} className="p-3 text-center">
                          {'isText' in row && row.isText ? (
                            <span className="text-muted-foreground">{row[col] as string}</span>
                          ) : row[col] ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-red-400/50 mx-auto" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            ██  WHAT'S NEW — changelog section  ██
            ══════════════════════════════════════════════════════════════ */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {t('install.whatsNew')}
              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full">v1.1.0</span>
            </h3>
            <ul className="space-y-2">
              {['install.changelog1', 'install.changelog2', 'install.changelog3', 'install.changelog4'].map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <ArrowUpRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{t(key)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            ██  FEATURES GRID (2×2 mobile, 4-col on md)  ██
            ══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', titleKey: 'install.lightningFast', descKey: 'install.lightningFastDesc' },
            { icon: Wifi, color: 'text-blue-500', bg: 'bg-blue-500/10', titleKey: 'install.worksOffline', descKey: 'install.worksOfflineDesc' },
            { icon: Bell, color: 'text-purple-500', bg: 'bg-purple-500/10', titleKey: 'install.pushNotif', descKey: 'install.pushNotifDesc' },
            { icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10', titleKey: 'install.safeSecure', descKey: 'install.safeSecureDesc' },
          ].map((feature, i) => (
            <Card key={i} className="border-border/50 hover:border-border transition-colors group">
              <CardContent className="p-4 text-center space-y-2">
                <div className={`w-10 h-10 rounded-lg ${feature.bg} flex items-center justify-center mx-auto group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="text-xs font-semibold">{t(feature.titleKey)}</h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t(feature.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ██  MANUAL INSTALL INSTRUCTIONS  ██
            ══════════════════════════════════════════════════════════════ */}
        <div ref={instructionsRef} />

        {showPwa && isIOS && !isInstalled && (
          <Card className="border-blue-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="w-8 h-8 text-blue-500" />
                <h2 className="text-lg font-semibold">{t('install.iosInstall')}</h2>
              </div>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'install.tapShare', icon: Share, desc: 'install.safariBottom' },
                  { step: '2', title: 'install.tapAddHome', icon: Plus, desc: 'install.scrollDown' },
                  { step: '3', title: 'install.tapAdd', icon: null, desc: 'install.appOnHome' },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 font-bold text-sm">{s.step}</div>
                    <div>
                      <p className="font-medium">{t(s.title)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {s.icon && <s.icon className="w-5 h-5 text-blue-500" />}
                        <span className="text-sm text-muted-foreground">{t(s.desc)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showPwa && isAndroid && !isInstalled && (
          <Card className="border-green-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="w-8 h-8 text-green-500" />
                <h2 className="text-lg font-semibold">{t('install.androidInstall')}</h2>
              </div>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'install.tapMenu', icon: MoreVertical, desc: 'install.threeDots' },
                  { step: '2', title: 'install.tapInstallApp', icon: Download, desc: 'install.autoStart' },
                  { step: '3', title: 'install.openTheApp', icon: null, desc: 'install.findOnHome' },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 text-green-500 font-bold text-sm">{s.step}</div>
                    <div>
                      <p className="font-medium">{t(s.title)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {s.icon && <s.icon className="w-5 h-5 text-green-500" />}
                        <span className="text-sm text-muted-foreground">{t(s.desc)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showPwa && !isIOS && !isAndroid && !isInstalled && (
          <Card className="border-purple-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Monitor className="w-8 h-8 text-purple-500" />
                <h2 className="text-lg font-semibold">{t('install.desktopInstall')}</h2>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('install.desktopBrowser')}</p>
                <div className="flex items-center gap-2 p-3 bg-purple-500/5 rounded-md border border-purple-500/20">
                  <ArrowDown className="w-5 h-5 text-purple-500" />
                  <span className="text-sm">{t('install.lookForIcon')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ██  FAQ ACCORDION  ██
            ══════════════════════════════════════════════════════════════ */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-5 pb-2">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
              <MessageCircleQuestion className="w-4 h-4 text-primary" />
              {t('install.faqTitle')}
            </h3>
            <Accordion type="single" collapsible className="w-full">
              {[
                { q: 'install.faq1q', a: 'install.faq1a' },
                { q: 'install.faq2q', a: 'install.faq2a' },
                { q: 'install.faq3q', a: 'install.faq3a' },
                { q: 'install.faq4q', a: 'install.faq4a' },
              ].map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-border/30">
                  <AccordionTrigger className="text-sm py-3 hover:no-underline">
                    {t(faq.q)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {t(faq.a)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* ── Auto-update info ── */}
        <Card className="border-border/30">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              {t('install.autoUpdateHow')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('install.autoUpdateDesc')}
            </p>
          </CardContent>
        </Card>

        {/* ── Bottom CTA ── */}
        {!isInstalled && !showSuccess && (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-muted-foreground">{t('install.readyToPlay')}</p>
            <Button
              size="lg"
              onClick={handleInstall}
              disabled={installing}
              className="w-full sm:w-auto px-10 py-6 text-base bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20 rounded-xl"
            >
              <Download className="me-2 h-5 w-5" />
              {t('install.downloadNowFree')}
            </Button>
          </div>
        )}
      </div>

      {/* ── Floating Install FAB ── */}
      {showPwa && isInstallable && !isInstalled && !showSuccess && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <Button
            size="lg"
            onClick={handleInstall}
            disabled={installing}
            className="pointer-events-auto w-full max-w-sm py-6 text-base bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-2xl shadow-green-500/30 rounded-2xl"
          >
            <Download className="me-2 h-5 w-5" />
            {t('install.downloadApp')}
          </Button>
        </div>
      )}
    </div>
  );
}
