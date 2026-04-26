import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Task #179: launch perf telemetry. Marked here as the very first thing the
// JS bundle does so the gap between bundle-eval-start and app-first-paint is
// observable in the Performance panel and via the runtime measure below.
if (typeof performance !== "undefined" && typeof performance.mark === "function") {
  try {
    performance.mark("app-bundle-eval-start");
  } catch {
    // mark() can throw on very old browsers; perf telemetry is best-effort.
  }
}

const UPDATE_POLL_INTERVAL_MS = 60_000;
const UPDATE_BANNER_ID = "app-update-banner";
const UPDATE_FORCE_GATE_ID = "app-force-update-gate";
const UPDATE_BANNER_TEXT = "تحديث جديد متاح — A new update is available";
const UPDATE_BUTTON_TEXT = "تحديث / Update";

function isGameplayPath(pathname: string): boolean {
  return /^\/challenge\/\d+\/(play|watch)$/.test(pathname) || /^\/game\//.test(pathname);
}

interface ReleaseInfo {
  webVersion: string;
  releasedAt: string;
  nativeLatestVersion: string | null;
  nativeUpdateUrlAndroid: string | null;
  nativeUpdateUrlIos: string | null;
  forceNativeUpdate: boolean;
}

let swRegistration: ServiceWorkerRegistration | null = null;
let initialWebVersion: string | null = null;
let announcedWebVersion: string | null = null;
let announcedNativeVersion: string | null = null;

function enforceCanonicalHost(): boolean {
  const canonicalHostMap: Record<string, string> = {
    "127.0.0.1": "localhost",
    "www.vixo.click": "vixo.click",
  };

  const currentHost = window.location.hostname.toLowerCase();
  const canonicalHost = canonicalHostMap[currentHost];
  if (!canonicalHost || canonicalHost === currentHost) {
    return false;
  }

  const nextUrl = `${window.location.protocol}//${canonicalHost}${window.location.port ? `:${window.location.port}` : ""}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(nextUrl);
  return true;
}

const isRedirectingToCanonicalHost = enforceCanonicalHost();

// ── Service Worker registration with auto-update detection ──
if (!isRedirectingToCanonicalHost && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      swRegistration = registration;
      console.log('[SW] registered:', registration.scope);

      // Check for updates every 60 seconds
      setInterval(() => registration.update(), UPDATE_POLL_INTERVAL_MS);

      // Register periodic background sync if supported
      if ('periodicSync' in registration) {
        try {
          const status = await navigator.permissions.query({ name: 'periodic-background-sync' as any });
          if (status.state === 'granted') {
            await (registration as any).periodicSync.register('vex-content-sync', {
              minInterval: 12 * 60 * 60 * 1000, // 12 hours
            });
            await (registration as any).periodicSync.register('vex-cache-refresh', {
              minInterval: 24 * 60 * 60 * 1000, // 24 hours
            });
          }
        } catch (_) { /* periodic sync not supported */ }
      }

      // When a new SW is waiting, offer to activate it
      registration.addEventListener('updatefound', () => {
        const newSW = registration.installing;
        if (!newSW) return;

        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Gameplay surfaces should never stay on stale bundles.
            if (isGameplayPath(window.location.pathname)) {
              activateLatestWebUpdate();
              return;
            }
            // New content available — show update banner
            showUpdateBanner(() => activateLatestWebUpdate());
          }
        });
      });
    } catch (err) {
      console.warn('[SW] registration failed:', err);
    }
  });

  // Listen for SW_UPDATED broadcast (sent on activate)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('[SW] updated to', event.data.version);
    }
  });

  // Reload once the new SW takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

async function startReleaseMonitoring(): Promise<void> {
  if (isRedirectingToCanonicalHost) {
    return;
  }

  const firstRelease = await fetchReleaseInfo();
  if (firstRelease) {
    initialWebVersion = firstRelease.webVersion;
    await maybePromptNativeUpdate(firstRelease);
  }

  setInterval(async () => {
    const latestRelease = await fetchReleaseInfo();
    if (!latestRelease) {
      return;
    }

    if (!initialWebVersion) {
      initialWebVersion = latestRelease.webVersion;
    }

    if (
      initialWebVersion &&
      latestRelease.webVersion !== initialWebVersion &&
      announcedWebVersion !== latestRelease.webVersion
    ) {
      announcedWebVersion = latestRelease.webVersion;
      showUpdateBanner(() => activateLatestWebUpdate());
    }

    await maybePromptNativeUpdate(latestRelease);
  }, UPDATE_POLL_INTERVAL_MS);
}

function showUpdateBanner(onAction: () => void | Promise<void>) {
  // Avoid duplicates
  if (document.getElementById(UPDATE_BANNER_ID)) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = UPDATE_BANNER_ID;
  banner.dir = 'auto';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  Object.assign(banner.style, {
    position: 'fixed',
    // Task #179: clear Android 15 edge-to-edge gesture inset and the iPhone
    // home-indicator strip so the banner never sits behind a system handle.
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    background: '#1a1d23',
    border: '1px solid rgba(74,222,128,0.3)',
    borderRadius: '12px',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '90vw',
  });

  const text = document.createElement('span');
  text.textContent = UPDATE_BANNER_TEXT;
  Object.assign(text.style, { color: '#e4e6ea', fontSize: '13px', flex: '1' });

  const btn = document.createElement('button');
  btn.textContent = UPDATE_BUTTON_TEXT;
  Object.assign(btn.style, {
    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
    color: '#0f1419',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });
  btn.onclick = () => {
    void onAction();
    banner.remove();
  };

  banner.append(text, btn);
  document.body.appendChild(banner);
}

function showForceUpdateGate(onAction: () => void | Promise<void>) {
  if (document.getElementById(UPDATE_FORCE_GATE_ID)) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = UPDATE_FORCE_GATE_ID;
  overlay.dir = 'auto';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10001',
    background: 'rgba(10, 14, 18, 0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Task #179: keep the modal card clear of the status bar / notch and the
    // bottom gesture area on Android 15 edge-to-edge + iOS Dynamic Island.
    padding:
      'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)) 24px',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    width: 'min(420px, 100%)',
    background: '#1a1d23',
    border: '1px solid rgba(74,222,128,0.35)',
    borderRadius: '14px',
    padding: '20px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif',
  });

  const text = document.createElement('p');
  text.textContent = UPDATE_BANNER_TEXT;
  Object.assign(text.style, {
    color: '#e4e6ea',
    margin: '0',
    fontSize: '14px',
    lineHeight: '1.5',
  });

  const btn = document.createElement('button');
  btn.textContent = UPDATE_BUTTON_TEXT;
  Object.assign(btn.style, {
    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
    color: '#0f1419',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
  });
  btn.onclick = () => {
    void onAction();
  };

  card.append(text, btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function activateLatestWebUpdate() {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }

  window.location.reload();
}

function compareSemver(currentVersion: string, targetVersion: string): number {
  const toParts = (value: string): number[] =>
    value
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((part) => Number(part));

  const currentParts = toParts(currentVersion);
  const targetParts = toParts(targetVersion);
  const maxLength = Math.max(currentParts.length, targetParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const currentPart = currentParts[i] ?? 0;
    const targetPart = targetParts[i] ?? 0;
    if (currentPart > targetPart) {
      return 1;
    }
    if (currentPart < targetPart) {
      return -1;
    }
  }

  return 0;
}

function readReleaseInfo(payload: unknown): ReleaseInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const release = (payload as { release?: unknown }).release;
  if (!release || typeof release !== 'object') {
    return null;
  }

  const releaseData = release as Partial<ReleaseInfo>;
  if (!releaseData.webVersion) {
    return null;
  }

  return {
    webVersion: String(releaseData.webVersion),
    releasedAt: String(releaseData.releasedAt ?? ''),
    nativeLatestVersion: releaseData.nativeLatestVersion ? String(releaseData.nativeLatestVersion) : null,
    nativeUpdateUrlAndroid: releaseData.nativeUpdateUrlAndroid
      ? String(releaseData.nativeUpdateUrlAndroid)
      : null,
    nativeUpdateUrlIos: releaseData.nativeUpdateUrlIos ? String(releaseData.nativeUpdateUrlIos) : null,
    forceNativeUpdate: releaseData.forceNativeUpdate === true,
  };
}

async function fetchReleaseInfo(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch('/api/release', {
      cache: 'no-store',
      headers: {
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return readReleaseInfo(payload);
  } catch {
    return null;
  }
}

async function openNativeUpdateUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

async function maybePromptNativeUpdate(release: ReleaseInfo): Promise<void> {
  if (!Capacitor.isNativePlatform() || !release.nativeLatestVersion) {
    return;
  }

  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') {
    return;
  }

  const updateUrl = platform === 'android' ? release.nativeUpdateUrlAndroid : release.nativeUpdateUrlIos;
  if (!updateUrl) {
    return;
  }

  try {
    const info = await CapacitorApp.getInfo();
    if (compareSemver(info.version, release.nativeLatestVersion) >= 0) {
      return;
    }

    const triggerUpdate = () => openNativeUpdateUrl(updateUrl);

    if (release.forceNativeUpdate) {
      announcedNativeVersion = release.nativeLatestVersion;
      showForceUpdateGate(triggerUpdate);
      return;
    }

    if (announcedNativeVersion === release.nativeLatestVersion) {
      return;
    }

    announcedNativeVersion = release.nativeLatestVersion;
    showUpdateBanner(triggerUpdate);
  } catch {
    // Ignore native version lookup errors and keep app usable.
  }
}

function scheduleReleaseMonitoring(): void {
  const start = () => {
    void startReleaseMonitoring();
  };

  const requestIdle = (
    window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (typeof requestIdle === "function") {
    requestIdle(start, { timeout: 3000 });
    return;
  }

  window.setTimeout(start, 1500);
}

if (!isRedirectingToCanonicalHost && Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url || typeof url !== 'string') {
      return;
    }

    try {
      const parsed = new URL(url);
      const isTrustedHost =
        parsed.hostname === 'vixo.click' ||
        parsed.hostname.endsWith('.vixo.click') ||
        parsed.protocol === 'vexapp:';
      const isAuthCallback = parsed.pathname.startsWith('/auth/callback');

      if (!isTrustedHost || !isAuthCallback) {
        return;
      }

      const nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      window.history.replaceState({}, '', nextPath);
      window.dispatchEvent(new PopStateEvent('popstate'));

      // Close any in-app browser sheet after handing callback back to the app shell.
      try {
        await Browser.close();
      } catch {
        // Browser may already be closed on some platforms.
      }
    } catch {
      // Ignore malformed deep-link payloads.
    }
  });
}

// Task #179: idempotent splash-hide. Calling SplashScreen.hide() multiple
// times is safe — the plugin no-ops after the first successful hide — but we
// still gate locally to avoid stacking RAF callbacks and pointless awaits.
let splashHideRequested = false;

function hideSplashOnce(reason: "first-paint" | "watchdog" | "bootstrap-error"): void {
  if (splashHideRequested) return;
  splashHideRequested = true;

  if (!Capacitor.isNativePlatform()) return;

  void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {
    // Splash plugin not yet ready, already hidden, or native auto-hide
    // already won the race. All three are benign — the native auto-hide
    // configured in capacitor.config.ts (launchAutoHide:true, 2 s budget)
    // remains as a guaranteed fail-safe.
    void reason;
  });
}

function markFirstPaintAndHideSplash(): void {
  // Two RAFs: the first lands on the next vsync, the second guarantees the
  // browser has actually painted the first React tree. Without the second
  // RAF the splash can hide before the WebView commits any pixels, producing
  // a brief flash of background color on Android.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        if (typeof performance !== "undefined" && typeof performance.mark === "function") {
          performance.mark("app-first-paint");
          if (typeof performance.measure === "function") {
            try {
              performance.measure(
                "app-launch-to-first-paint",
                "app-bundle-eval-start",
                "app-first-paint",
              );
            } catch {
              // measure() throws if the start mark is missing; ignore.
            }
          }
        }
      } catch {
        // Perf telemetry must never block the splash hide.
      }

      hideSplashOnce("first-paint");
    });
  });
}

if (!isRedirectingToCanonicalHost) {
  // Task #179: belt-and-braces splash watchdog. Native config already has
  // launchAutoHide:true with a 2 s budget, but we mirror it in JS so that
  // even pathological cases (RAF starvation, hung effects in the first
  // render, etc.) still drop the splash promptly. setTimeout is registered
  // BEFORE render() so a synchronous render throw cannot bypass it.
  const splashWatchdog = setTimeout(() => hideSplashOnce("watchdog"), 1500);

  try {
    createRoot(document.getElementById("root")!).render(<App />);
    markFirstPaintAndHideSplash();
    scheduleReleaseMonitoring();
  } catch (err) {
    // Render threw synchronously: hide the splash immediately so the user
    // sees whatever fallback the OS / WebView shows instead of a frozen
    // splash, then re-throw so existing global error handlers still log it.
    clearTimeout(splashWatchdog);
    hideSplashOnce("bootstrap-error");
    throw err;
  }
}
