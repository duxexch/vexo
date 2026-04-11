import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const UPDATE_POLL_INTERVAL_MS = 60_000;
const UPDATE_BANNER_ID = "app-update-banner";
const UPDATE_FORCE_GATE_ID = "app-force-update-gate";
const UPDATE_BANNER_TEXT = "تحديث جديد متاح — A new update is available";
const UPDATE_BUTTON_TEXT = "تحديث / Update";

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
    bottom: '24px',
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
    padding: '24px',
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

if (!isRedirectingToCanonicalHost) {
  void startReleaseMonitoring();
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

if (!isRedirectingToCanonicalHost) {
  createRoot(document.getElementById("root")!).render(<App />);
}
