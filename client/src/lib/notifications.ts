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

export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
      ),
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
  const hasPermission = await requestNotificationPermission();

  if (hasPermission) {
    const registration = await registerServiceWorker();
    if (registration) {
      return registration;
    }
  }

  return null;
}
