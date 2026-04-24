import { useEffect } from "react";

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
 * Use the variable in arbitrary Tailwind values to lift sticky chat
 * composers above the keyboard, e.g.
 * `pb-[max(0.75rem,env(safe-area-inset-bottom),var(--keyboard-inset-bottom,0px))]`.
 *
 * Platform behavior summary (Task #43 analysis):
 * - Mobile web (iOS Safari, Chrome, etc.): `vv.height` shrinks by the
 *   keyboard amount; the inset is the keyboard height. The composer
 *   gets lifted by our CSS variable.
 * - Android Capacitor (default `windowSoftInputMode=adjustResize`):
 *   the WebView itself shrinks, so `window.innerHeight` decreases and
 *   `vv.height` matches it. The math gives inset = 0 — exactly what we
 *   want, because the OS already lifted the composer by resizing the
 *   WebView.
 * - Android Capacitor with `adjustPan`: `innerHeight` stays full but
 *   `vv.height` shrinks; the math gives inset = keyboardHeight, which
 *   correctly lifts the composer over the keyboard.
 * Real-device verification on Android Capacitor is recommended (see
 * the follow-up task) — the math is sound but a hardware pass on the
 * latest build is the only way to lock the behavior.
 *
 * Safe to call from multiple components simultaneously: the underlying
 * listener is reference-counted so an unmount never clobbers the value
 * for another mounted consumer.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

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
