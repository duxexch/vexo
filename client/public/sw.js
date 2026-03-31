/**
 * VEX Platform — Production Service Worker v9
 *
 * Strategies:
 *   Static assets (JS/CSS/fonts/images) → Cache-first + stale-while-revalidate
 *   HTML navigation                     → Network-first (+ navigation preload) → cache → offline.html
 *   API / WebSocket                     → Pass-through (never cached)
 *
 * Features:
 *   ✓ Versioned caches with automatic old-cache cleanup
 *   ✓ Navigation Preload for instant network-first responses
 *   ✓ Broadcasts SW_UPDATED to all clients on activation
 *   ✓ Cache size cap (prevents storage overflow)
 *   ✓ SKIP_WAITING message support for controlled updates
 *   ✓ Offline fallback page
 *   ✓ Periodic Background Sync (content refresh)
 *   ✓ Background Sync (retry failed requests)
 */

const CACHE_VERSION = 'v9';
const STATIC_CACHE  = `vex-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `vex-dynamic-${CACHE_VERSION}`;
const MAX_DYNAMIC   = 150;

const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/vex-gaming-favicon.png',
  '/icons/vex-gaming-logo-192x192.png',
  '/icons/vex-gaming-logo-512x512.png',
];

const ASSET_RE = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif)$/i;
const BYPASS   = ['/api/', '/ws', '/socket.io', 'chrome-extension://'];

/* ───────── Install ───────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      // Don't call skipWaiting here — let the update banner control activation
  );
});

/* ───────── Activate ───────── */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge old caches
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
    );
    // Navigation Preload
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
    // Broadcast update to every open tab
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach((w) => w.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
  })());
});

/* ───────── Fetch ───────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (BYPASS.some((b) => url.pathname.startsWith(b) || url.href.includes(b))) return;

  // Static assets → cache-first + background revalidate
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirstSWR(request));
    return;
  }

  // HTML navigation → network-first (with preload)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstNav(event));
    return;
  }

  // Default → cache-first with network fallback
  event.respondWith(
    caches.match(request).then((c) => c || fetchAndPut(request, DYNAMIC_CACHE))
  );
});

/* ── Cache-first + stale-while-revalidate ── */
async function cacheFirstSWR(request) {
  const cached = await caches.match(request);
  // Always kick off a background update
  const netP = fetch(request).then(async (r) => {
    if (r && r.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, r.clone());
      await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC);
    }
    return r;
  }).catch(() => null);

  if (cached) return cached;           // instant from cache
  const nr = await netP;               // wait for network if no cache
  return nr || new Response('Offline', { status: 503 });
}

/* ── Network-first for navigation ── */
async function networkFirstNav(event) {
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const response = preload || await fetch(event.request);
    if (response && response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    return (await caches.match('/offline.html')) ||
      new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
}

/* ── Fetch + cache helper ── */
async function fetchAndPut(request, cacheName) {
  try {
    const r = await fetch(request);
    if (r && r.ok && r.type === 'basic') {
      const cache = await caches.open(cacheName);
      await cache.put(request, r.clone());
      await trimCache(cacheName, MAX_DYNAMIC);
    }
    return r;
  } catch (_) {
    // Only return offline.html for navigation (HTML) requests
    const isNav = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
    if (isNav) {
      return (await caches.match('/offline.html')) || new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503 });
  }
}

/* ── Trim cache to limit ── */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys  = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

/* ───────── Push Notifications ───────── */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  // Map notification type to appropriate icon
  const TYPE_ICONS = {
    transaction: '/icons/vex-gaming-logo-192x192.png',
    p2p: '/icons/vex-gaming-logo-192x192.png',
    security: '/icons/vex-gaming-logo-192x192.png',
    promotion: '/icons/vex-gaming-logo-192x192.png',
    announcement: '/icons/vex-gaming-logo-192x192.png',
    system: '/icons/vex-gaming-logo-192x192.png',
    chat: '/icons/vex-gaming-logo-192x192.png',
    challenge: '/icons/vex-gaming-logo-192x192.png',
    support: '/icons/vex-gaming-logo-192x192.png',
  };

  // Map priority to vibration pattern
  const VIBRATE_PATTERNS = {
    urgent: [200, 80, 200, 80, 200, 80, 200],
    high: [200, 100, 200, 100, 200],
    normal: [150, 80, 150],
    low: [100],
  };

  const notifType = data.notificationType || data.type || 'system';
  const priority = data.priority || 'normal';

  const opts = {
    body: data.body || 'لديك إشعار جديد',
    icon: data.icon || TYPE_ICONS[notifType] || '/icons/vex-gaming-logo-192x192.png',
    badge: '/icons/vex-gaming-logo-96x96.png',
    vibrate: VIBRATE_PATTERNS[priority] || VIBRATE_PATTERNS.normal,
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      primaryKey: data.id || Date.now(),
      notificationType: notifType,
      priority: priority,
      soundType: data.soundType || notifType,
    },
    actions: data.actions || [],
    tag: data.tag || `vex-${notifType}`,
    renotify: !!data.tag,
    requireInteraction: priority === 'urgent' || priority === 'high',
    silent: false,
    timestamp: Date.now(),
    dir: data.dir || 'auto',
    lang: data.lang || 'ar',
  };
  event.waitUntil(self.registration.showNotification(data.title || 'VEX', opts));
});

/* ───────── Notification Click ───────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/';
  const action = event.action;

  if (action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: url,
            notificationType: data.notificationType,
            soundType: data.soundType,
          });
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/* ───────── Message Handler ───────── */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  switch (event.data.type) {
    case 'SHOW_NOTIFICATION': {
      const { title, options } = event.data;
      self.registration.showNotification(title, options);
      break;
    }
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'GET_VERSION':
      event.source?.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
      break;
    case 'CLEAR_CACHE':
      caches.keys().then((ns) => Promise.all(ns.map((n) => caches.delete(n))));
      break;
  }
});

/* ───────── Periodic Background Sync ───────── */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'vex-content-sync') {
    event.waitUntil(syncContent());
  }
  if (event.tag === 'vex-cache-refresh') {
    event.waitUntil(refreshPrecache());
  }
});

async function syncContent() {
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    if (response.ok) {
      // Server is reachable — refresh cached navigation pages
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put('/', await fetch('/'));
    }
  } catch (_) {
    // Offline — skip sync
  }
}

async function refreshPrecache() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(
      PRECACHE.map(async (url) => {
        try {
          const r = await fetch(url, { cache: 'no-cache' });
          if (r.ok) await cache.put(url, r);
        } catch (_) { /* skip individual failures */ }
      })
    );
  } catch (_) { /* offline */ }
}

/* ───────── Background Sync (retry failed requests) ───────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'vex-retry-queue') {
    event.waitUntil(retryFailedRequests());
  }
});

async function retryFailedRequests() {
  try {
    const cache = await caches.open('vex-retry-queue');
    const requests = await cache.keys();
    await Promise.all(
      requests.map(async (request) => {
        try {
          const response = await fetch(request.clone());
          if (response.ok) {
            await cache.delete(request);
          }
        } catch (_) { /* still offline — keep in queue */ }
      })
    );
  } catch (_) { /* no retry queue */ }
}
