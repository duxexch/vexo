/**
 * Domino table styles — player-pickable board surfaces.
 *
 * Each style ships a small bundle of CSS custom property values that the
 * <DominoBoard /> container reads from inline `style`. Switching the active
 * style swaps the props; nothing else in the layout solver changes.
 *
 * Persistence: localStorage only (no backend round-trip), mirroring the
 * chess-themes pattern in `client/src/lib/chess-themes.ts`.
 */

export interface DominoTableStyle {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Used in the picker preview swatch. */
  preview: string;
  /** CSS custom-property bundle applied to the board container. */
  vars: {
    "--domino-board-bg": string;
    "--domino-board-grain": string;
    "--domino-board-frame": string;
    "--domino-board-border": string;
    "--domino-tile-shadow": string;
  };
}

const NOISE_SVG_DATA_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.4 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")";

const WALNUT_GRAIN = [
  // Long horizontal wood grain — light + dark hairlines.
  "repeating-linear-gradient(86deg, rgba(255, 220, 170, 0.06) 0px, rgba(255, 220, 170, 0.06) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 6px, rgba(40, 20, 10, 0.18) 6px, rgba(40, 20, 10, 0.18) 7px, rgba(0, 0, 0, 0) 7px, rgba(0, 0, 0, 0) 14px)",
  // Plank seams every ~64px.
  "repeating-linear-gradient(90deg, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 62px, rgba(0, 0, 0, 0.55) 62px, rgba(0, 0, 0, 0.55) 64px)",
  // Subtle warm sheen across the board.
  "radial-gradient(ellipse at 30% 28%, rgba(255, 200, 140, 0.18), transparent 60%)",
  NOISE_SVG_DATA_URL,
].join(", ");

const MAHOGANY_GRAIN = [
  "repeating-linear-gradient(85deg, rgba(255, 200, 170, 0.07) 0px, rgba(255, 200, 170, 0.07) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 5px, rgba(50, 16, 12, 0.22) 5px, rgba(50, 16, 12, 0.22) 6px, rgba(0, 0, 0, 0) 6px, rgba(0, 0, 0, 0) 12px)",
  "repeating-linear-gradient(90deg, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 78px, rgba(0, 0, 0, 0.55) 78px, rgba(0, 0, 0, 0.55) 80px)",
  "radial-gradient(ellipse at 70% 30%, rgba(255, 150, 110, 0.22), transparent 65%)",
  NOISE_SVG_DATA_URL,
].join(", ");

const FELT_GREEN_GRAIN = [
  // Soft cloth highlights — preserves the legacy green-felt look.
  "radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.08), transparent 52%)",
  "radial-gradient(circle at 84% 76%, rgba(0, 0, 0, 0.18), transparent 50%)",
  "repeating-linear-gradient(-32deg, rgba(255, 255, 255, 0.02) 0px, rgba(255, 255, 255, 0.02) 8px, rgba(0, 0, 0, 0.02) 8px, rgba(0, 0, 0, 0.02) 16px)",
].join(", ");

const FELT_BLUE_GRAIN = [
  "radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.10), transparent 55%)",
  "radial-gradient(circle at 80% 80%, rgba(0, 0, 0, 0.22), transparent 50%)",
  "repeating-linear-gradient(-28deg, rgba(255, 255, 255, 0.025) 0px, rgba(255, 255, 255, 0.025) 8px, rgba(0, 0, 0, 0.03) 8px, rgba(0, 0, 0, 0.03) 16px)",
].join(", ");

const MARBLE_GRAIN = [
  // Veining — diagonal soft streaks.
  "linear-gradient(118deg, transparent 0%, transparent 24%, rgba(120, 95, 65, 0.18) 26%, transparent 30%, transparent 58%, rgba(120, 95, 65, 0.12) 60%, transparent 64%)",
  "linear-gradient(72deg, transparent 0%, transparent 35%, rgba(160, 130, 90, 0.12) 38%, transparent 42%, transparent 70%, rgba(160, 130, 90, 0.08) 72%, transparent 76%)",
  "radial-gradient(ellipse at 30% 32%, rgba(255, 245, 230, 0.35), transparent 55%)",
  NOISE_SVG_DATA_URL,
].join(", ");

export const DOMINO_TABLE_STYLES: DominoTableStyle[] = [
  {
    id: "green-felt",
    nameEn: "Classic Green Felt",
    nameAr: "جوخ أخضر كلاسيكي",
    preview: "linear-gradient(135deg, hsl(142, 40%, 25%) 0%, hsl(142, 30%, 15%) 100%)",
    vars: {
      "--domino-board-bg": "hsl(var(--game-felt))",
      "--domino-board-grain": FELT_GREEN_GRAIN,
      "--domino-board-frame":
        "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 18px 28px rgba(8, 26, 19, 0.4)",
      "--domino-board-border": "rgba(29, 79, 59, 0.7)",
      "--domino-tile-shadow": "0 3px 6px rgba(8, 26, 19, 0.32)",
    },
  },
  {
    id: "walnut",
    nameEn: "Walnut Wood",
    nameAr: "خشب الجوز",
    preview: "linear-gradient(135deg, #6a4220 0%, #3d2412 100%)",
    vars: {
      "--domino-board-bg":
        "linear-gradient(178deg, #5a3820 0%, #4a2d18 50%, #3a2210 100%)",
      "--domino-board-grain": WALNUT_GRAIN,
      "--domino-board-frame":
        "inset 0 0 0 3px #2a1808, inset 0 0 0 4px rgba(255, 200, 140, 0.18), 0 22px 36px rgba(0, 0, 0, 0.55)",
      "--domino-board-border": "#1a0e04",
      "--domino-tile-shadow":
        "0 5px 10px rgba(0, 0, 0, 0.55), 0 1px 2px rgba(0, 0, 0, 0.4)",
    },
  },
  {
    id: "mahogany",
    nameEn: "Mahogany Wood",
    nameAr: "خشب الماهوجني",
    preview: "linear-gradient(135deg, #7a2e20 0%, #2e0e08 100%)",
    vars: {
      "--domino-board-bg":
        "linear-gradient(178deg, #6a2818 0%, #561e12 50%, #421510 100%)",
      "--domino-board-grain": MAHOGANY_GRAIN,
      "--domino-board-frame":
        "inset 0 0 0 3px #2c0a06, inset 0 0 0 4px rgba(255, 180, 140, 0.16), 0 22px 36px rgba(20, 0, 0, 0.55)",
      "--domino-board-border": "#1c0604",
      "--domino-tile-shadow":
        "0 5px 10px rgba(20, 0, 0, 0.55), 0 1px 2px rgba(20, 0, 0, 0.4)",
    },
  },
  {
    id: "blue-felt",
    nameEn: "Royal Blue Felt",
    nameAr: "جوخ أزرق ملكي",
    preview: "linear-gradient(135deg, #1e3a8a 0%, #0f1f56 100%)",
    vars: {
      "--domino-board-bg":
        "linear-gradient(178deg, #1e3d96 0%, #142f72 50%, #0f1f56 100%)",
      "--domino-board-grain": FELT_BLUE_GRAIN,
      "--domino-board-frame":
        "inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 18px 28px rgba(6, 14, 40, 0.5)",
      "--domino-board-border": "rgba(15, 31, 86, 0.85)",
      "--domino-tile-shadow": "0 4px 8px rgba(6, 14, 40, 0.45)",
    },
  },
  {
    id: "cafe-marble",
    nameEn: "Café Marble",
    nameAr: "رخام الكافيه",
    preview: "linear-gradient(135deg, #f0e6d2 0%, #c8b89a 100%)",
    vars: {
      "--domino-board-bg":
        "linear-gradient(178deg, #f0e6d2 0%, #e2d4ba 50%, #c8b89a 100%)",
      "--domino-board-grain": MARBLE_GRAIN,
      "--domino-board-frame":
        "inset 0 0 0 3px #8b6f3e, inset 0 0 0 4px rgba(255, 240, 210, 0.4), 0 22px 36px rgba(70, 50, 28, 0.35)",
      "--domino-board-border": "#8b6f3e",
      "--domino-tile-shadow":
        "0 4px 9px rgba(80, 55, 28, 0.32), 0 1px 2px rgba(80, 55, 28, 0.25)",
    },
  },
];

const STORAGE_KEY = "vex-domino-table-style";

export function getDefaultTableStyle(): DominoTableStyle {
  return DOMINO_TABLE_STYLES[0];
}

export function getTableStyleById(id: string | null | undefined): DominoTableStyle {
  if (!id) return getDefaultTableStyle();
  const found = DOMINO_TABLE_STYLES.find((s) => s.id === id);
  return found ?? getDefaultTableStyle();
}

export function loadSavedTableStyle(): DominoTableStyle {
  if (typeof window === "undefined") return getDefaultTableStyle();
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    return getTableStyleById(id);
  } catch {
    return getDefaultTableStyle();
  }
}

export function saveTableStyle(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function getTableStyleCssVars(
  style: DominoTableStyle,
): React.CSSProperties {
  // Cast through unknown so TS accepts the CSS custom properties bag.
  return style.vars as unknown as React.CSSProperties;
}
