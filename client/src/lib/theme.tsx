import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

export interface AdminTheme {
  id: string;
  name: string;
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  cardColor: string;
  mutedColor: string;
  borderColor: string;
  destructiveColor: string | null;
  mode: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  radiusSm: string | null;
  radiusMd: string | null;
  radiusLg: string | null;
  shadowIntensity: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// CSS vars injected by applyAdminTheme / removed by clearAdminTheme.
export const ADMIN_THEME_VAR_NAMES = [
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--input",
  "--ring",
  "--destructive",
  "--destructive-foreground",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-accent",
  "--sidebar-border",
  "--font-sans",
  "--font-serif",
  "--radius",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--shadow-sm",
  "--shadow",
  "--shadow-md",
  "--shadow-lg",
] as const;

// Convert "#rgb" / "#rrggbb" to the "H S% L%" tuple used in index.css.
export function hexToHslString(hex: string): string | null {
  if (!hex) return null;
  let normalized = hex.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function pickContrastForeground(hex: string): string {
  const fallback = "0 0% 100%";
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "220 13% 10%" : "0 0% 100%";
}

const SHADOW_RECIPES: Record<string, { sm: string; base: string; md: string; lg: string }> = {
  soft: {
    sm: "0px 1px 2px 0px rgba(15,23,42,0.04)",
    base: "0px 2px 4px 0px rgba(15,23,42,0.04)",
    md: "0px 4px 8px -2px rgba(15,23,42,0.06)",
    lg: "0px 12px 24px -8px rgba(15,23,42,0.08)",
  },
  medium: {
    sm: "0px 1px 3px 0px rgba(15,23,42,0.10), 0px 1px 2px -1px rgba(15,23,42,0.10)",
    base: "0px 2px 4px 0px rgba(15,23,42,0.12), 0px 1px 2px -1px rgba(15,23,42,0.10)",
    md: "0px 6px 12px -2px rgba(15,23,42,0.16), 0px 3px 6px -3px rgba(15,23,42,0.10)",
    lg: "0px 16px 32px -8px rgba(15,23,42,0.22), 0px 6px 12px -6px rgba(15,23,42,0.12)",
  },
  strong: {
    sm: "0px 2px 4px 0px rgba(0,0,0,0.20)",
    base: "0px 4px 8px 0px rgba(0,0,0,0.24)",
    md: "0px 10px 20px -4px rgba(0,0,0,0.32)",
    lg: "0px 24px 48px -12px rgba(0,0,0,0.40)",
  },
};

export function applyAdminTheme(theme: AdminTheme, root: HTMLElement = document.documentElement): void {
  const setVar = (name: string, value: string | null | undefined) => {
    if (value == null || value === "") return;
    root.style.setProperty(name, value);
  };

  const primaryHsl = hexToHslString(theme.primaryColor);
  const secondaryHsl = hexToHslString(theme.secondaryColor);
  const accentHsl = hexToHslString(theme.accentColor);
  const backgroundHsl = hexToHslString(theme.backgroundColor);
  const foregroundHsl = hexToHslString(theme.foregroundColor);
  const cardHsl = hexToHslString(theme.cardColor);
  const mutedHsl = hexToHslString(theme.mutedColor);
  const borderHsl = hexToHslString(theme.borderColor);

  setVar("--primary", primaryHsl);
  setVar("--primary-foreground", pickContrastForeground(theme.primaryColor));
  setVar("--secondary", secondaryHsl);
  setVar("--secondary-foreground", pickContrastForeground(theme.secondaryColor));
  setVar("--accent", accentHsl);
  setVar("--accent-foreground", pickContrastForeground(theme.accentColor));
  setVar("--background", backgroundHsl);
  setVar("--foreground", foregroundHsl);
  setVar("--card", cardHsl);
  setVar("--card-foreground", foregroundHsl);
  setVar("--muted", mutedHsl);
  setVar("--muted-foreground", foregroundHsl);
  setVar("--border", borderHsl);
  setVar("--input", borderHsl);
  setVar("--ring", primaryHsl);
  if (theme.destructiveColor) {
    const destructiveHsl = hexToHslString(theme.destructiveColor);
    setVar("--destructive", destructiveHsl);
    setVar("--destructive-foreground", pickContrastForeground(theme.destructiveColor));
  }
  setVar("--sidebar", cardHsl);
  setVar("--sidebar-foreground", foregroundHsl);
  setVar("--sidebar-primary", primaryHsl);
  setVar("--sidebar-accent", accentHsl);
  setVar("--sidebar-border", borderHsl);

  if (theme.fontHeading) {
    setVar("--font-serif", `'${theme.fontHeading}', sans-serif`);
  }
  if (theme.fontBody) {
    setVar("--font-sans", `'${theme.fontBody}', sans-serif`);
  }
  if (theme.radiusMd) setVar("--radius", theme.radiusMd);
  if (theme.radiusSm) setVar("--radius-sm", theme.radiusSm);
  if (theme.radiusMd) setVar("--radius-md", theme.radiusMd);
  if (theme.radiusLg) setVar("--radius-lg", theme.radiusLg);

  const recipe = SHADOW_RECIPES[(theme.shadowIntensity || "medium").toLowerCase()] || SHADOW_RECIPES.medium;
  setVar("--shadow-sm", recipe.sm);
  setVar("--shadow", recipe.base);
  setVar("--shadow-md", recipe.md);
  setVar("--shadow-lg", recipe.lg);
}

export function clearAdminTheme(root: HTMLElement = document.documentElement): void {
  for (const name of ADMIN_THEME_VAR_NAMES) {
    root.style.removeProperty(name);
  }
}

async function fetchActiveTheme(): Promise<AdminTheme | null> {
  try {
    const res = await fetch("/api/themes/active");
    if (!res.ok) return null;
    return (await res.json()) as AdminTheme;
  } catch {
    return null;
  }
}

// Set only when the user explicitly toggles. The "theme" key is auto-written
// every render so it can't be used as the pin signal.
const THEME_PINNED_KEY = "themeUserPinned";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme;
      if (stored) return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveTheme().then((active) => {
      if (cancelled || !active) return;
      applyAdminTheme(active);
      const userPinned =
        typeof window !== "undefined" &&
        localStorage.getItem(THEME_PINNED_KEY) === "1";
      if (!userPinned && (active.mode === "light" || active.mode === "dark")) {
        setTheme(active.mode);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePinned = (next: Theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_PINNED_KEY, "1");
    }
    setTheme(next);
  };

  const toggleTheme = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_PINNED_KEY, "1");
    }
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemePinned, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
