import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import type { PluginListenerHandle } from "@capacitor/core";

const CSS_VAR_NAME = "--keyboard-inset-bottom";

let consumerCount = 0;
let frame = 0;
let webListenersAttached = false;

// --- Native (Capacitor) attach state -----------------------------------
//
// `nativeHandles` holds the plugin listener handles once they've been
// resolved. `attachPromise` tracks the in-flight attach call so a
// concurrent unmount can await it before tearing the handles down.
// `attachGeneration` is bumped on every attach AND every detach: the
// async attach stores its starting generation and, when the listeners
// finally resolve, compares it against the current generation. If they
// differ (because we already detached / a newer attach started), the
// late handles are removed immediately so we never leak listeners or
// keep mutating the CSS variable from a screen the user has left.
let nativeHandles: PluginListenerHandle[] = [];
let attachPromise: Promise<void> | null = null;
let attachGeneration = 0;
// Generation that the in-flight `attachPromise` is for. Used so a
// brand-new attach request whose generation differs from the in-flight
// one does NOT silently inherit the doomed (already cancelled) promise
// — instead it queues a fresh attach behind it.
let attachPromiseGeneration = 0;

function setInset(px: number): void {
  if (typeof window === "undefined") return;
  const value = Math.max(0, Math.round(px));
  document.documentElement.style.setProperty(CSS_VAR_NAME, `${value}px`);
}

function updateFromVisualViewport(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  setInset(window.innerHeight - vv.height - vv.offsetTop);
}

function schedule(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    updateFromVisualViewport();
  });
}

function attachWebListeners(): void {
  if (webListenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("orientationchange", schedule);
  webListenersAttached = true;
}

function detachWebListeners(): void {
  if (!webListenersAttached || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
  }
  window.removeEventListener("orientationchange", schedule);
  webListenersAttached = false;
  if (frame) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }
}

async function removeHandles(handles: PluginListenerHandle[]): Promise<void> {
  // Best-effort: a handle can fail to remove if the plugin is gone, but
  // we never want to throw out of cleanup.
  await Promise.allSettled(handles.map((h) => h.remove()));
}

function attachNative(): Promise<void> {
  // Idempotent for *concurrent* attach requests within the same
  // generation: rapid mount cycles in the same generation reuse a
  // single in-flight attach. But if a detach has bumped the
  // generation since the in-flight attach started, the in-flight
  // promise is destined to self-cancel — so a fresh consumer arriving
  // during that cancellation must NOT silently inherit the doomed
  // promise. We track the in-flight attach's generation and only
  // reuse the promise when the generations still match. This is the
  // exact failure mode that bites React StrictMode dev double-invoke
  // (mount→cleanup→mount before the first attach resolves).
  if (attachPromise && attachPromiseGeneration === attachGeneration) {
    return attachPromise;
  }
  const myGeneration = ++attachGeneration;
  attachPromiseGeneration = myGeneration;
  const onShow = (info: { keyboardHeight: number }) => {
    setInset(info.keyboardHeight);
  };
  const onHide = () => {
    setInset(0);
  };
  // We add listeners one at a time so a mid-batch failure can roll
  // back the handles that already attached — `Promise.all` would let
  // the successful ones leak.
  const startedPromise = attachPromise;
  const newAttach = (async () => {
    // If a stale in-flight attach exists for an older generation,
    // wait for it to settle before we start so the plugin sees a
    // clean attach order. The old attach will self-cancel via the
    // generation mismatch in its own resolve branch.
    if (startedPromise) {
      try {
        await startedPromise;
      } catch {
        /* ignore — the old attach already cleared its own state */
      }
    }
    const handles: PluginListenerHandle[] = [];
    try {
      handles.push(await Keyboard.addListener("keyboardWillShow", onShow));
      handles.push(await Keyboard.addListener("keyboardDidShow", onShow));
      handles.push(await Keyboard.addListener("keyboardWillHide", onHide));
      handles.push(await Keyboard.addListener("keyboardDidHide", onHide));
    } catch (err) {
      // Roll back any partial listeners so we never leak on a failed
      // attach (e.g. plugin available for the first call but errors
      // mid-sequence).
      await removeHandles(handles);
      throw err;
    } finally {
      // Clear the in-flight marker only if we are still the current
      // in-flight attach. A newer attach may have superseded us.
      if (attachPromiseGeneration === myGeneration) {
        attachPromise = null;
      }
    }
    if (myGeneration !== attachGeneration) {
      // We were cancelled / superseded while attaching — drop the
      // handles immediately, before they can leak.
      await removeHandles(handles);
      // If consumers came back during our cancellation window,
      // kick off a fresh attach now that the stale one has cleaned
      // up. This is what saves StrictMode double-invoke from
      // ending up with no listeners attached.
      if (consumerCount > 0 && !attachPromise) {
        await attachNative();
      }
      return;
    }
    nativeHandles = handles;
  })();
  attachPromise = newAttach;
  return newAttach;
}

async function detachNative(): Promise<void> {
  // Bump generation FIRST so a still-resolving attachNative() observes
  // the change and self-cleans the handles it's about to receive.
  attachGeneration += 1;
  // If an attach is mid-flight, wait for it so any handles it produces
  // are accounted for (the generation check above will already have
  // caused that attach to drop them, but awaiting keeps detach
  // ordering deterministic for callers who chain on it).
  if (attachPromise) {
    try {
      await attachPromise;
    } catch {
      /* swallow — attachPromise already cleared its own state */
    }
  }
  if (nativeHandles.length === 0) return;
  const toRemove = nativeHandles;
  nativeHandles = [];
  await removeHandles(toRemove);
}

/**
 * Subscribes to the visual viewport (web) or to Capacitor's Keyboard
 * plugin events (native iOS/Android) so the
 * `--keyboard-inset-bottom` CSS variable on the document root reflects
 * the height of the on-screen keyboard (or 0 when no keyboard is open
 * or the platform doesn't support it).
 *
 * Why two code paths:
 * - On Capacitor native shells the Keyboard plugin gives us the OS's
 *   authoritative keyboardHeight via "keyboardWillShow"/"keyboardDidShow"
 *   events. Combined with `Keyboard.resize: 'none'` in
 *   capacitor.config.ts, this guarantees a single, consistent shift on
 *   both iOS and Android regardless of the WebView's softInputMode.
 * - On web (mobile Safari, mobile Chrome, etc.) we use
 *   `window.visualViewport` because no plugin is available and the
 *   visual viewport is the standard web API for this signal.
 *
 * Use the variable in arbitrary Tailwind values to lift sticky chat
 * composers above the keyboard, e.g.
 * `pb-[max(0.75rem,env(safe-area-inset-bottom),var(--keyboard-inset-bottom,0px))]`.
 *
 * Safe to call from multiple components simultaneously: the underlying
 * listener is reference-counted so an unmount never clobbers the value
 * for another mounted consumer. The native attach path is also safe
 * against rapid mount→unmount cycles (incl. React StrictMode dev
 * double-invoke): an attach that resolves after the last consumer has
 * already left will tear down the handles it just created instead of
 * leaving them dangling.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const isNative =
      typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();

    if (!isNative && !window.visualViewport) {
      // Old web browser without visualViewport — leave the variable at
      // 0 so consumers fall back to safe-area only.
      root.style.setProperty(CSS_VAR_NAME, "0px");
      return;
    }

    consumerCount += 1;

    if (consumerCount === 1) {
      if (isNative) {
        attachNative().catch((err) => {
          // Fall back to the visualViewport path if the plugin fails to
          // attach (e.g. older runtime missing the plugin). Only do so
          // if we still have an active consumer — otherwise the screen
          // has already unmounted and the cleanup below will reset the
          // variable.
          console.warn(
            "[useKeyboardInset] Capacitor Keyboard plugin failed; falling back to visualViewport",
            err,
          );
          if (consumerCount > 0 && window.visualViewport) {
            attachWebListeners();
            updateFromVisualViewport();
          }
        });
      } else {
        attachWebListeners();
        updateFromVisualViewport();
      }
    }

    return () => {
      consumerCount = Math.max(0, consumerCount - 1);
      if (consumerCount === 0) {
        if (isNative) {
          // Best-effort detach; safe to ignore the resulting promise.
          // The generation bump inside detachNative() guarantees that
          // any in-flight attach will tear down its handles even if it
          // resolves after this cleanup has run.
          void detachNative();
        }
        // Always also clean up the web fallback in case we ever
        // attached it (native attach failed and we fell back).
        detachWebListeners();
        root.style.setProperty(CSS_VAR_NAME, "0px");
      }
    };
  }, []);
}
