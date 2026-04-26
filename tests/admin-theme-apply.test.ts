/**
 * Unit test for the admin-themes runtime hook (Task #195).
 *
 * The admin themes page lets the operator change colours / fonts / radii /
 * shadow intensity for one of four DB-stored presets, then click "Apply to
 * page now" to preview the result on the live document. The same path runs at
 * boot inside ThemeProvider when /api/themes/active returns the active theme.
 *
 * What we lock down here:
 *   1. applyAdminTheme() injects every variable in ADMIN_THEME_VAR_NAMES into
 *      documentElement.style — i.e. the cascade actually receives the new
 *      palette so consumers like `bg-primary` / `text-foreground` reflect it.
 *   2. clearAdminTheme() removes exactly the same variables, so toggling back
 *      to the static :root defaults from index.css works without leaving
 *      stale inline overrides behind.
 *   3. hexToHslString() converts admin-stored hex into the "H S% L%" tuple
 *      the existing CSS variables expect, with case-insensitive parsing and
 *      a safe `null` for invalid input.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_THEME_VAR_NAMES,
  applyAdminTheme,
  clearAdminTheme,
  hexToHslString,
  type AdminTheme,
} from "@/lib/theme";

const SAMPLE_THEME: AdminTheme = {
  id: "test-id",
  name: "vex-test",
  displayName: "VEX Test",
  primaryColor: "#00c853",
  secondaryColor: "#ff9800",
  accentColor: "#00e676",
  backgroundColor: "#0f1419",
  foregroundColor: "#ffffff",
  cardColor: "#1a1f2e",
  mutedColor: "#6b7280",
  borderColor: "#2d3748",
  destructiveColor: "#ef4444",
  mode: "dark",
  fontHeading: "Inter",
  fontBody: "Cairo",
  radiusSm: "0.25rem",
  radiusMd: "0.5rem",
  radiusLg: "0.75rem",
  shadowIntensity: "medium",
  isActive: true,
  isDefault: true,
};

afterEach(() => {
  clearAdminTheme();
});

describe("hexToHslString", () => {
  it("converts a 6-digit hex into the H S% L% tuple used by index.css", () => {
    expect(hexToHslString("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslString("#000000")).toBe("0 0% 0%");
    expect(hexToHslString("#ff0000")).toBe("0 100% 50%");
  });

  it("expands 3-digit shorthand and is case-insensitive", () => {
    expect(hexToHslString("#fff")).toBe("0 0% 100%");
    expect(hexToHslString("#FF9800")).toBe(hexToHslString("#ff9800"));
  });

  it("returns null for malformed input instead of corrupting the cascade", () => {
    expect(hexToHslString("not-a-color")).toBeNull();
    expect(hexToHslString("#zzzzzz")).toBeNull();
    expect(hexToHslString("")).toBeNull();
  });
});

describe("applyAdminTheme + clearAdminTheme", () => {
  it("injects every ADMIN_THEME_VAR_NAMES var onto documentElement", () => {
    const root = document.documentElement;
    // Start from a clean slate — no inline overrides.
    clearAdminTheme(root);
    for (const name of ADMIN_THEME_VAR_NAMES) {
      expect(root.style.getPropertyValue(name)).toBe("");
    }

    applyAdminTheme(SAMPLE_THEME, root);

    // Spot-check the key colour variables actually receive the converted HSL.
    expect(root.style.getPropertyValue("--primary")).toBe(hexToHslString(SAMPLE_THEME.primaryColor));
    expect(root.style.getPropertyValue("--background")).toBe(
      hexToHslString(SAMPLE_THEME.backgroundColor),
    );
    expect(root.style.getPropertyValue("--card")).toBe(hexToHslString(SAMPLE_THEME.cardColor));

    // Fonts get wrapped in quotes for the CSS font stack.
    expect(root.style.getPropertyValue("--font-sans")).toContain("Cairo");
    expect(root.style.getPropertyValue("--font-serif")).toContain("Inter");

    // Radii pass through verbatim.
    expect(root.style.getPropertyValue("--radius")).toBe(SAMPLE_THEME.radiusMd);
    expect(root.style.getPropertyValue("--radius-sm")).toBe(SAMPLE_THEME.radiusSm);
    expect(root.style.getPropertyValue("--radius-lg")).toBe(SAMPLE_THEME.radiusLg);

    // Every variable in the symmetrical list should now have *some* value.
    for (const name of ADMIN_THEME_VAR_NAMES) {
      expect(root.style.getPropertyValue(name)).not.toBe("");
    }
  });

  it("clearAdminTheme removes exactly the variables applyAdminTheme set", () => {
    const root = document.documentElement;
    applyAdminTheme(SAMPLE_THEME, root);
    clearAdminTheme(root);
    for (const name of ADMIN_THEME_VAR_NAMES) {
      expect(root.style.getPropertyValue(name)).toBe("");
    }
  });

  it("skips bad colour values rather than writing 'null' into the cascade", () => {
    const root = document.documentElement;
    const broken: AdminTheme = { ...SAMPLE_THEME, primaryColor: "not-a-hex" };
    applyAdminTheme(broken, root);
    // The bad primary is dropped (left blank) while everything else still fills in.
    expect(root.style.getPropertyValue("--primary")).toBe("");
    expect(root.style.getPropertyValue("--background")).toBe(
      hexToHslString(SAMPLE_THEME.backgroundColor),
    );
  });
});
