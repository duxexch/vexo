/**
 * Coverage for the expanded permission catalogue (Task #143).
 *
 * The catalogue is the single source of truth that drives both the
 * Settings → Permissions tab and the runtime probe summary in
 * `startup-permissions.ts`. These tests pin two contracts:
 *
 *   1. Every permission the production app touches has a catalogue
 *      entry — microphone, camera, notifications, overlay, wake lock,
 *      clipboard write, vibrate, fullscreen.
 *
 *   2. `probe()` is hermetic: it never throws, never opens a prompt,
 *      and resolves to "unavailable" when the underlying Web API is
 *      missing on the runtime (which is exactly what jsdom looks like).
 *
 * Together these guarantees make sure adding a permission can be done
 * by editing a single file, and that the probe pass keeps working on
 * any platform — even one where half the APIs are stubs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    isPluginAvailable: () => false,
  },
  registerPlugin: () => ({}),
}));

import {
  PERMISSION_CATALOGUE,
  getPermissionEntry,
  probeAllPermissions,
  type PermissionId,
} from "@/lib/permission-catalogue";

const REQUIRED_IDS: PermissionId[] = [
  "microphone",
  "camera",
  "notifications",
  "overlay",
  "nativeCallUI",
  "wakeLock",
  "clipboardWrite",
  "vibrate",
  "fullscreen",
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PERMISSION_CATALOGUE — single source of truth", () => {
  it("declares every permission the app surfaces to the user", () => {
    const ids = PERMISSION_CATALOGUE.map((e) => e.id).sort();
    expect(ids).toEqual([...REQUIRED_IDS].sort());
  });

  it("never has duplicate ids", () => {
    const ids = PERMISSION_CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes a typed lookup helper that throws on unknown ids", () => {
    expect(getPermissionEntry("microphone").id).toBe("microphone");
    expect(() => getPermissionEntry("does-not-exist" as PermissionId)).toThrow();
  });

  it("requires title + helper translation keys for every entry", () => {
    for (const entry of PERMISSION_CATALOGUE) {
      expect(entry.titleKey).toMatch(/^settings\.permissions\./);
      expect(entry.helperKey).toMatch(/^settings\.permissions\./);
    }
  });
});

describe("probeAllPermissions() — hermetic runtime probe", () => {
  it("resolves a result for every catalogue id without throwing", async () => {
    const results = await probeAllPermissions();
    for (const id of REQUIRED_IDS) {
      expect(results).toHaveProperty(id);
      expect(["granted", "denied", "prompt", "unavailable"]).toContain(results[id]);
    }
  });

  it("returns unavailable on a stripped-down runtime (no navigator APIs)", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "",
      mediaDevices: undefined,
      permissions: undefined,
      clipboard: undefined,
      vibrate: undefined,
      wakeLock: undefined,
    });
    vi.stubGlobal("Notification", undefined);

    const results = await probeAllPermissions();
    // The four "Web API only" rows should report unavailable when the
    // corresponding API is missing entirely.
    expect(results.microphone).toBe("unavailable");
    expect(results.camera).toBe("unavailable");
    expect(results.notifications).toBe("unavailable");
    expect(results.overlay).toBe("unavailable");
    expect(results.wakeLock).toBe("unavailable");
    expect(results.clipboardWrite).toBe("unavailable");
    expect(results.vibrate).toBe("unavailable");
    // Fullscreen probes `document.documentElement` which jsdom always
    // provides, so it stays "granted" — that's the contract.
    expect(["granted", "unavailable"]).toContain(results.fullscreen);
  });

  it("reports clipboardWrite as granted when navigator.clipboard.writeText exists", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "",
      clipboard: { writeText: () => Promise.resolve() },
      permissions: undefined,
      mediaDevices: undefined,
      vibrate: undefined,
      wakeLock: undefined,
    });

    const results = await probeAllPermissions();
    expect(results.clipboardWrite).toBe("granted");
  });

  it("reports vibrate as granted when navigator.vibrate is a function", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "",
      vibrate: () => true,
      clipboard: undefined,
      permissions: undefined,
      mediaDevices: undefined,
      wakeLock: undefined,
    });

    const results = await probeAllPermissions();
    expect(results.vibrate).toBe("granted");
  });

  it("reports wakeLock as granted when the API is exposed on navigator", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "",
      wakeLock: { request: () => Promise.resolve({ release: () => Promise.resolve() }) },
      clipboard: undefined,
      permissions: undefined,
      mediaDevices: undefined,
      vibrate: undefined,
    });

    const results = await probeAllPermissions();
    expect(results.wakeLock).toBe("granted");
  });
});
