/**
 * Tiny helpers around "is the user inside an installed PWA?".
 *
 * Used by Task #143 — the iOS Safari tab cannot register for web push,
 * but the same domain installed via "Add to Home Screen" can. The
 * Permissions tab needs to detect that situation so we can show the
 * "install to enable notifications" hint instead of a dead "Allow"
 * button that the browser will reject silently.
 *
 * All helpers are SSR-safe (return false when window/navigator are
 * undefined) so they can be imported from anywhere in the bundle.
 */

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as Mac; the tell-tale sign is multi-touch.
  const maxTouch =
    typeof (navigator as { maxTouchPoints?: number }).maxTouchPoints === "number"
      ? (navigator as { maxTouchPoints?: number }).maxTouchPoints!
      : 0;
  if (ua.includes("Mac") && maxTouch > 1) return true;
  return false;
}

/**
 * True when the page is running as an installed PWA on iOS (Safari
 * standalone). Detects both the legacy `navigator.standalone` flag and
 * the modern `display-mode: standalone` media query so the result is
 * stable across iOS versions.
 */
export function isIOSStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (!isIOSDevice()) return false;
  const navStandalone = (navigator as { standalone?: boolean }).standalone;
  if (navStandalone === true) return true;
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/**
 * True when the page is loaded inside the Capacitor native shell. We
 * sniff the global at runtime instead of importing `@capacitor/core`
 * so this helper stays a zero-dependency leaf module that's safe to
 * pull into any bundle slice (including SSR).
 */
function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * True when the page is rendered inside a third-party in-app browser
 * (Facebook, Instagram, Line, TikTok, WeChat, …). These embedded
 * WebViews on iOS do NOT honour "Add to Home Screen" and behave like
 * a downgraded Safari, so they should be excluded from the
 * `isIOSSafariTab` flow that hints the user to install the PWA.
 */
function isIOSInAppBrowser(ua: string): boolean {
  return /(FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|WhatsApp|Snapchat|GSA\/|Pinterest)/i.test(
    ua,
  );
}

/**
 * True when the user is browsing the site in a regular iOS Safari tab
 * (NOT inside an installed PWA, NOT inside a Capacitor wrapper, NOT
 * inside a third-party in-app browser). This is the only configuration
 * where web push is unavailable until the user installs to home-screen,
 * which is exactly when the Permissions tab needs to surface its
 * "install to enable notifications" hint.
 */
export function isIOSSafariTab(): boolean {
  if (!isIOSDevice()) return false;
  if (isIOSStandalone()) return false;
  if (isCapacitorNative()) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Exclude Chrome / Firefox / Edge / Opera on iOS — they all use
  // WebKit but identify themselves with their own marker, and they
  // never receive the "Add to Home Screen" Safari treatment.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua)) return false;
  // Exclude well-known in-app browsers (Facebook, Instagram, …) that
  // embed WebKit but cannot install PWAs.
  if (isIOSInAppBrowser(ua)) return false;
  return /Safari/i.test(ua);
}
