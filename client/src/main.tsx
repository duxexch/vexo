import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
      console.log('[SW] registered:', registration.scope);

      // Check for updates every 60 seconds
      setInterval(() => registration.update(), 60_000);

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
            showUpdateBanner(registration);
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

function showUpdateBanner(registration: ServiceWorkerRegistration) {
  // Avoid duplicates
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
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
  text.textContent = 'تحديث جديد متاح — A new update is available';
  Object.assign(text.style, { color: '#e4e6ea', fontSize: '13px', flex: '1' });

  const btn = document.createElement('button');
  btn.textContent = 'تحديث / Update';
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
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    banner.remove();
  };

  banner.append(text, btn);
  document.body.appendChild(banner);
}

if (!isRedirectingToCanonicalHost) {
  createRoot(document.getElementById("root")!).render(<App />);
}
