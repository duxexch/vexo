/**
 * Regression test for Task #142 — the floating permissions banner used
 * to share `z-index: 50` with every Radix dialog and ended up clipped
 * diagonally by whichever modal was on screen (login, choose-nickname,
 * create-tournament, …). The fix unmounts the banner whenever any
 * modal-style surface is open, so the two layers can never visually
 * overlap.
 *
 * This test renders a real Radix Dialog (the one the rest of the app
 * uses, via @/components/ui/dialog) alongside the production
 * PermissionsBanner and asserts:
 *   1) Banner is rendered when no dialog is open.
 *   2) Banner disappears the moment a dialog opens.
 *   3) Banner returns when the dialog closes again.
 *
 * The DOM-observer hook the banner uses watches `data-state="open"`
 * on `[role="dialog"]` / `[role="alertdialog"]` nodes, so any future
 * modal type built on the same Radix primitive is covered for free.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The banner pulls translation strings via useI18n(); a passthrough
// stub keeps the test rendering deterministic without dragging in
// the full i18n provider stack.
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, lang: "en" as const, dir: "ltr" }),
}));

// Force the banner to consider itself "needs attention" and skip the
// async refresh so the test doesn't have to await network probes.
vi.mock("@/lib/startup-permissions", () => {
  const summary = {
    notifications: "denied",
    microphone: "denied",
    camera: "granted",
    overlay: "granted",
    nativePush: "denied",
    nativeLocalNotifications: "denied",
    checkedAt: new Date().toISOString(),
  };
  return {
    getCachedPermissionSummary: () => summary,
    refreshPermissionSummary: async () => summary,
  };
});

// Wouter's useLocation hook reads from window.location, but the banner
// hides itself on /settings*. Force a non-settings location so the
// "should render" branch fires.
vi.mock("wouter", () => ({
  useLocation: () => ["/", () => undefined] as const,
}));

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PermissionsBanner } from "@/components/PermissionsBanner";

afterEach(() => {
  cleanup();
  // Reset session storage between tests so the dismiss state from one
  // test never leaks into another (the banner remembers dismissal in
  // sessionStorage to avoid nagging users twice in a row).
  try {
    window.sessionStorage.removeItem("vixo:perm-banner-dismissed");
  } catch {
    // ignore — jsdom always supports sessionStorage
  }
});

function Harness() {
  return (
    <>
      <Dialog>
        <DialogTrigger data-testid="open-test-dialog">
          open dialog
        </DialogTrigger>
        <DialogContent data-testid="test-dialog-content">
          <p>dialog body</p>
        </DialogContent>
      </Dialog>
      <PermissionsBanner />
    </>
  );
}

describe("PermissionsBanner — never overlaps with modal dialogs", () => {
  it("renders the banner when no dialog is open", async () => {
    render(<Harness />);

    // The banner mounts asynchronously after the permission summary
    // resolves. A polling waitFor handles both sync (cached summary)
    // and async (refresh resolves) paths.
    await waitFor(() => {
      expect(screen.getByTestId("banner-permissions")).toBeTruthy();
    });
  });

  it("hides the banner the moment a Radix dialog opens, then restores it on close", async () => {
    render(<Harness />);

    // 1) Baseline: banner is visible, dialog is not.
    await waitFor(() => {
      expect(screen.getByTestId("banner-permissions")).toBeTruthy();
    });
    expect(screen.queryByTestId("test-dialog-content")).toBeNull();

    // 2) Open the dialog. Once Radix flips data-state="open" on the
    //    portaled content node, the banner's MutationObserver should
    //    fire and the banner should disappear from the DOM.
    fireEvent.click(screen.getByTestId("open-test-dialog"));

    await waitFor(() => {
      expect(screen.getByTestId("test-dialog-content")).toBeTruthy();
      expect(screen.queryByTestId("banner-permissions")).toBeNull();
    });

    // 3) Close the dialog with the Escape key (Radix's built-in
    //    dismissal). The banner should reappear because the page is
    //    no longer competing with a modal for the top-of-screen slot.
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("test-dialog-content")).toBeNull();
      expect(screen.getByTestId("banner-permissions")).toBeTruthy();
    });
  });
});
