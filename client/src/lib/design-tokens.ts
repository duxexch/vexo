/**
 * VEX Design Tokens — Single source of truth for all design constants
 * Use these instead of hardcoded values in components
 */

// ─── Breakpoints ───────────────────────────────────────────
export const BREAKPOINTS = {
  xs: 320,   // iPhone SE — smallest supported screen
  sm: 375,   // iPhone 12/13/14/15 standard
  md: 768,   // iPad portrait / mobile↔desktop switch
  lg: 1024,  // iPad landscape / small laptops
  xl: 1440,  // Desktop monitors
} as const;

// ─── Touch Targets (WCAG 2.1 compliant) ───────────────────
export const TOUCH = {
  /** WCAG 2.1 minimum touch target */
  minTarget: 44,
  /** Apple HIG comfortable target */
  comfortable: 48,
  /** Large primary action buttons */
  large: 56,
} as const;

// ─── Game Sizes ────────────────────────────────────────────
export const GAME_CARD = {
  /** Standard card size (Baloot + Tarneeb unified) */
  w: 56,   // w-14
  h: 80,   // h-20
  /** Small card for mobile */
  wSm: 48, // w-12
  hSm: 68, // h-17
} as const;

export const GAME_CHESS = {
  /** Minimum piece touch target */
  minPiece: 32,
  /** Comfortable piece size */
  comfortablePiece: 44,
} as const;

export const GAME_BACKGAMMON = {
  /** Checker minimum size */
  minChecker: 24,
  /** Comfortable checker size */
  comfortableChecker: 32,
} as const;

export const GAME_DOMINO = {
  /** Minimum dot diameter */
  minDot: 8,
  /** Comfortable dot in hand */
  handDot: 10,
} as const;

// ─── Game Board Layout ─────────────────────────────────────
export const GAME_LAYOUT = {
  /** Max board height — adapts to viewport */
  maxBoardHeight: 'min(600px, calc(100vh - 120px))',
  /** Max side panel height */
  maxPanelHeight: 'min(300px, 40vh)',
  /** Board max width on desktop */
  maxBoardWidth: 800,
} as const;

// ─── Animation Durations ───────────────────────────────────
export const ANIMATION = {
  /** Quick micro-interactions */
  fast: 150,
  /** Standard transitions */
  normal: 200,
  /** Game piece movement */
  piece: 250,
  /** Card throw / collect */
  card: 300,
  /** Dice roll */
  dice: 600,
  /** Page transitions */
  page: 200,
  /** Stagger delay between list items */
  stagger: 30,
} as const;

// ─── Spacing ───────────────────────────────────────────────
export const SPACING = {
  /** Base spacing unit (4px) */
  base: 4,
  /** Safe area bottom for iOS devices */
  safeAreaBottom: 'env(safe-area-inset-bottom, 0px)',
} as const;

// ─── Pagination Defaults ───────────────────────────────────
export const PAGINATION = {
  challenges: 10,
  p2p: 20,
  transactions: 20,
  friends: 20,
  complaints: 10,
  leaderboard: 25,
  chat: 15,
  adminUsers: 20,
  adminP2P: 20,
} as const;

// ─── Swipe ─────────────────────────────────────────────────
export const SWIPE = {
  /** Minimum distance in px to register as swipe */
  minDistance: 75,
} as const;

// ─── Types ─────────────────────────────────────────────────
export type Breakpoint = keyof typeof BREAKPOINTS;
export type PaginationKey = keyof typeof PAGINATION;
