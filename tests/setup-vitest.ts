/**
 * Vitest global setup. Polyfills the few browser APIs that jsdom does
 * not ship but the call-actions registry's collaborators touch when
 * mounted in a real React tree.
 *
 * This runs once per test file; keep it light — anything heavyweight
 * belongs in per-file `beforeEach` so individual specs can opt out.
 */

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import React from "react";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

vi.mock("@testing-library/react", async () => {
  const actual = await vi.importActual<typeof import("@testing-library/react")>("@testing-library/react");

  function renderWithQueryClient(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    return actual.render(
      React.createElement(QueryClientProvider, { client: testQueryClient }, ui),
      options,
    );
  }

  return {
    ...actual,
    render: renderWithQueryClient,
  };
});

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
      addListener: () => { },
      removeListener: () => { },
      addEventListener: () => { },
      removeEventListener: () => { },
      dispatchEvent: () => false,
    }),
  });
}

// Radix UI primitives (Select, Dropdown, Popover, …) drive their open/close
// state through Pointer Events / pointer capture and call `scrollIntoView`
// on the active item. jsdom ships none of those, so the popover never opens
// in a real `userEvent.click(trigger)` interaction. Stubbing the four APIs
// Radix actually touches lets every interaction test exercise the popover
// without per-file hacks.
if (typeof Element !== "undefined") {
  type ElementWithPointerCapture = Element & {
    hasPointerCapture: (id: number) => boolean;
    setPointerCapture: (id: number) => void;
    releasePointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  };
  const proto = Element.prototype as ElementWithPointerCapture;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => { };
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => { };
  if (!proto.scrollIntoView) proto.scrollIntoView = () => { };
}
