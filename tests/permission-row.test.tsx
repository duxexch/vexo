/**
 * Component test for the redesigned <PermissionRow /> used inside the
 * Settings → Permissions tab (Task #143).
 *
 * Asserts the four-state CTA matrix the row promises:
 *   - granted     → status pill only, no action buttons
 *   - prompt      → "Allow" button wired to onAllow
 *   - denied      → "Open settings" button wired to onOpenSettings
 *   - unavailable → muted "Not supported" hint, no action buttons
 *
 * Mocks the i18n module so the assertions can target the raw
 * translation keys instead of having to import the full provider stack.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Mic } from "lucide-react";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, language: "en" as const, dir: "ltr" }),
}));

import { PermissionRow } from "@/components/PermissionRow";

afterEach(() => {
  cleanup();
});

describe("<PermissionRow /> — state-driven CTA", () => {
  it("granted: shows status pill and no action buttons", () => {
    render(
      <PermissionRow
        id="microphone"
        icon={Mic}
        title="Microphone"
        helper="Needed for voice calls"
        state="granted"
        onAllow={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.getByTestId("status-perm-microphone-granted")).toBeTruthy();
    expect(screen.queryByTestId("btn-perm-microphone-allow")).toBeNull();
    expect(screen.queryByTestId("btn-perm-microphone-settings")).toBeNull();
    expect(screen.queryByTestId("hint-perm-microphone-unavailable")).toBeNull();
  });

  it("prompt: shows 'Allow' button and triggers onAllow when clicked", () => {
    const onAllow = vi.fn();
    render(
      <PermissionRow
        id="microphone"
        icon={Mic}
        title="Microphone"
        helper="Needed for voice calls"
        state="prompt"
        onAllow={onAllow}
        onOpenSettings={() => {}}
      />,
    );

    const allow = screen.getByTestId("btn-perm-microphone-allow");
    expect(allow).toBeTruthy();
    expect(screen.queryByTestId("btn-perm-microphone-settings")).toBeNull();

    fireEvent.click(allow);
    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  it("denied: shows 'Open settings' button and triggers onOpenSettings when clicked", () => {
    const onOpenSettings = vi.fn();
    render(
      <PermissionRow
        id="microphone"
        icon={Mic}
        title="Microphone"
        helper="Needed for voice calls"
        state="denied"
        onAllow={() => {}}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.queryByTestId("btn-perm-microphone-allow")).toBeNull();
    const settings = screen.getByTestId("btn-perm-microphone-settings");
    expect(settings).toBeTruthy();

    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("unavailable: shows muted hint and no action buttons", () => {
    render(
      <PermissionRow
        id="overlay"
        icon={Mic}
        title="Overlay"
        helper="Android only"
        state="unavailable"
        onAllow={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.getByTestId("status-perm-overlay-unavailable")).toBeTruthy();
    expect(screen.getByTestId("hint-perm-overlay-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("btn-perm-overlay-allow")).toBeNull();
    expect(screen.queryByTestId("btn-perm-overlay-settings")).toBeNull();
  });

  it("busy: keeps the visible CTA disabled", () => {
    render(
      <PermissionRow
        id="microphone"
        icon={Mic}
        title="Microphone"
        helper="..."
        state="prompt"
        onAllow={() => {}}
        onOpenSettings={() => {}}
        busy
      />,
    );

    const allow = screen.getByTestId("btn-perm-microphone-allow") as HTMLButtonElement;
    expect(allow.disabled).toBe(true);
  });

  it("prompt without onAllow: renders no Allow button (deep-link only permissions)", () => {
    render(
      <PermissionRow
        id="overlay"
        icon={Mic}
        title="Overlay"
        helper="Android"
        state="prompt"
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.queryByTestId("btn-perm-overlay-allow")).toBeNull();
  });
});
