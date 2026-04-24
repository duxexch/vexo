import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const CSS_VAR_NAME = "--keyboard-inset-bottom";

let consumerCount = 0;
let frame = 0;
let listenersAttached = false;

function update(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  const inset = Math.max(
    0,
    Math.round(window.innerHeight - vv.height - vv.offsetTop),
  );
  document.documentElement.style.setProperty(CSS_VAR_NAME, `${inset}px`);
}

function schedule(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    update();
  });
}

function attachListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("orientationchange", schedule);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
  }
  window.removeEventListener("orientationchange", schedule);
  listenersAttached = false;
  if (frame) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * Subscribes to the visual viewport so the
 * `--keyboard-inset-bottom` CSS variable on the document root reflects
 * the height of the on-screen keyboard (or 0 when no keyboard is open
 * or the platform doesn't support `visualViewport`).
 *
 * On Capacitor native shells (iOS + Android) the inset is forced to 0:
 * the OS / WebView already lifts the chat composer above the keyboard
 * via Capacitor's `Keyboard.resize: 'body'` (iOS) and Android's default
 * `windowSoftInputMode=adjustResize`. Adding our own padding on top
 * would double-shift the composer (Task #43).
 *
 * Use the variable in arbitrary Tailwind values to lift sticky chat
 * composers above the keyboard, e.g.
 * `pb-[max(0.75rem,env(safe-area-inset-bottom),var(--keyboard-inset-bottom,0px))]`.
 *
 * Safe to call from multiple components simultaneously: the underlying
 * listener is reference-counted so an unmount never clobbers the value
 * for another mounted consumer.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    // Native: the OS / Capacitor already lifts the composer.
    if (Capacitor.isNativePlatform()) {
      root.style.setProperty(CSS_VAR_NAME, "0px");
      return;
    }

    if (!window.visualViewport) {
      root.style.setProperty(CSS_VAR_NAME, "0px");
      return;
    }

    consumerCount += 1;
    if (consumerCount === 1) {
      attachListeners();
      update();
    }

    return () => {
      consumerCount = Math.max(0, consumerCount - 1);
      if (consumerCount === 0) {
        detachListeners();
        root.style.setProperty(CSS_VAR_NAME, "0px");
      }
    };
  }, []);
}
