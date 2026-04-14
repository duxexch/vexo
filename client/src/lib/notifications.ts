/** Shared notification type used across pages, hooks, and components */
export interface AppNotification {
  id: string;
  userId: string;
  type: "announcement" | "transaction" | "security" | "promotion" | "system" | "p2p" | "id_verification" | "success" | "warning";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  titleAr: string | null;
  message: string;
  messageAr: string | null;
  link: string | null;
  metadata: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export function parseNotificationMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "string") return {};
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function getFinancialNotificationReference(notification: AppNotification): string | null {
  const metadata = parseNotificationMetadata(notification.metadata);
  const candidates = [
    metadata.referenceId,
    metadata.reference,
    metadata.transactionReference,
    metadata.publicReference,
    metadata.ref,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (notification.type === "transaction") {
    return `NTX-${notification.id.slice(0, 8).toUpperCase()}`;
  }

  return null;
}

/** Defense-in-depth: validate notification links on client side before navigation */
export function normalizeSafeNotificationLink(link: string | null | undefined): string | null {
  if (!link || typeof link !== 'string') return null;

  const trimmed = link.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'ftp:', 'ws:', 'wss:'];
  if (dangerousProtocols.some((protocol) => lowered.startsWith(protocol))) {
    return null;
  }

  // Block protocol-relative and backslash-prefixed links.
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }

    const normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalizedPath.startsWith('/')) {
      return null;
    }

    return normalizedPath;
  } catch {
    return null;
  }
}

export function isSafeNotificationLink(link: string | null | undefined): link is string {
  return normalizeSafeNotificationLink(link) !== null;
}

export function navigateToSafeNotificationLink(link: string | null | undefined): boolean {
  const safeLink = normalizeSafeNotificationLink(link);
  if (!safeLink) {
    return false;
  }

  window.location.assign(safeLink);
  return true;
}

const NOTIFICATION_SOUNDS = {
  default: '/sounds/notification.mp3',
  message: '/sounds/message.mp3',
  transaction: '/sounds/coin.mp3',
  p2p: '/sounds/p2p.mp3',
  alert: '/sounds/alert.mp3',
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

export async function playNotificationSound(type: keyof typeof NOTIFICATION_SOUNDS = 'default') {
  try {
    const audio = new Audio(NOTIFICATION_SOUNDS[type] || NOTIFICATION_SOUNDS.default);
    audio.volume = 0.5;
    await audio.play();
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission was denied');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

interface PushPublicKeyResponse {
  enabled: boolean;
  vapidPublicKey: string | null;
}

function buildNotificationApiHeaders(authToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function fetchPushPublicKey(authToken?: string): Promise<string | null> {
  try {
    const response = await fetch('/api/notifications/push/public-key', {
      method: 'GET',
      credentials: 'include',
      headers: buildNotificationApiHeaders(authToken),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json() as PushPublicKeyResponse;
    if (!result.enabled || !result.vapidPublicKey) {
      return null;
    }

    return result.vapidPublicKey;
  } catch {
    return null;
  }
}

async function sendPushSubscriptionToServer(subscription: PushSubscription, authToken?: string): Promise<boolean> {
  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return false;
  }

  const response = await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: buildNotificationApiHeaders(authToken),
    body: JSON.stringify(payload),
  });

  return response.ok;
}

async function sendPushUnsubscribeToServer(endpoint: string, authToken?: string): Promise<void> {
  try {
    await fetch('/api/notifications/push/unsubscribe', {
      method: 'POST',
      credentials: 'include',
      headers: buildNotificationApiHeaders(authToken),
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Ignore network failures during cleanup.
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker is not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      return existing;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return subscription;
  } catch (error) {
    console.warn('Push subscription failed:', error);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function showLocalNotification(
  title: string,
  body: string,
  options?: {
    icon?: string;
    tag?: string;
    url?: string;
    sound?: keyof typeof NOTIFICATION_SOUNDS;
    requireInteraction?: boolean;
  }
) {
  if (options?.sound) {
    playNotificationSound(options.sound);
  }

  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: options?.icon || '/icons/vex-gaming-logo-192x192.png',
      tag: options?.tag || 'vex-notification',
      requireInteraction: options?.requireInteraction || false,
    });

    notification.onclick = () => {
      window.focus();
      navigateToSafeNotificationLink(options?.url);
      notification.close();
    };

    return notification;
  }

  return null;
}

export function showInAppNotification(
  title: string,
  body: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  sound?: keyof typeof NOTIFICATION_SOUNDS
) {
  if (sound) {
    playNotificationSound(sound);
  }

  const event = new CustomEvent('inAppNotification', {
    detail: { title, body, type },
  });
  window.dispatchEvent(event);
}

export async function initializeNotifications() {
  return syncPushSubscriptionWithServer();
}

export async function syncPushSubscriptionWithServer(authToken?: string): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    return null;
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return null;
  }

  const vapidPublicKey = await fetchPushPublicKey(authToken);
  if (!vapidPublicKey) {
    return registration;
  }

  let subscription = await subscribeToPush(registration, vapidPublicKey);
  if (!subscription) {
    return registration;
  }

  let synced = await sendPushSubscriptionToServer(subscription, authToken);
  if (synced) {
    return registration;
  }

  try {
    await subscription.unsubscribe();
  } catch {
    // Continue with creating a fresh subscription.
  }

  subscription = await subscribeToPush(registration, vapidPublicKey);
  if (!subscription) {
    return registration;
  }

  synced = await sendPushSubscriptionToServer(subscription, authToken);
  return synced ? registration : null;
}

export async function unsubscribePushNotifications(authToken?: string): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  await sendPushUnsubscribeToServer(subscription.endpoint, authToken);
  await subscription.unsubscribe().catch(() => { });
}
