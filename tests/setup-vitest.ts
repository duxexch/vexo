/**
 * Vitest global setup. Polyfills the few browser APIs that jsdom does
 * not ship but the call-actions registry's collaborators touch when
 * mounted in a real React tree.
 *
 * This runs once per test file; keep it light — anything heavyweight
 * belongs in per-file `beforeEach` so individual specs can opt out.
 */

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia; some Radix-style hooks crash on
// first render without it. Provide a no-op stub.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
