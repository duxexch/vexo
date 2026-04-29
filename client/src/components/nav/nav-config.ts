export type SidebarIconAccent = { active: string; inactive: string };

export const SIDEBAR_ICON_ACCENTS: Record<string, SidebarIconAccent> = {
  dashboard: {
    active: "bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 border-blue-200/50",
    inactive: "bg-gradient-to-br from-indigo-500/85 via-blue-500/85 to-cyan-500/85 border-blue-200/35",
  },
  wallet: {
    active: "bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 border-emerald-200/50",
    inactive: "bg-gradient-to-br from-emerald-500/85 via-green-500/85 to-teal-500/85 border-emerald-200/35",
  },
  multiplayer: {
    active: "bg-gradient-to-br from-blue-500 via-cyan-500 to-indigo-500 border-cyan-200/50",
    inactive: "bg-gradient-to-br from-blue-500/85 via-cyan-500/85 to-indigo-500/85 border-cyan-200/35",
  },
  "game-management": {
    active: "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 border-violet-200/50",
    inactive: "bg-gradient-to-br from-fuchsia-500/85 via-violet-500/85 to-indigo-500/85 border-violet-200/35",
  },
  challenges: {
    active: "bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 border-rose-200/50",
    inactive: "bg-gradient-to-br from-rose-500/85 via-red-500/85 to-orange-500/85 border-rose-200/35",
  },
  announcements: {
    active: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 border-amber-200/50",
    inactive: "bg-gradient-to-br from-amber-500/85 via-orange-500/85 to-rose-500/85 border-amber-200/35",
  },
  tournaments: {
    active: "bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500 border-amber-200/50",
    inactive: "bg-gradient-to-br from-amber-500/85 via-yellow-500/85 to-orange-500/85 border-amber-200/35",
  },
  "game-history": {
    active: "bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 border-sky-200/50",
    inactive: "bg-gradient-to-br from-sky-500/85 via-blue-500/85 to-cyan-500/85 border-sky-200/35",
  },
  lobby: {
    active: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 border-emerald-200/50",
    inactive: "bg-gradient-to-br from-emerald-500/85 via-teal-500/85 to-cyan-500/85 border-emerald-200/35",
  },
  leaderboard: {
    active: "bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 border-orange-200/50",
    inactive: "bg-gradient-to-br from-orange-500/85 via-amber-500/85 to-yellow-500/85 border-orange-200/35",
  },
  profile: {
    active: "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 border-violet-200/50",
    inactive: "bg-gradient-to-br from-violet-500/85 via-fuchsia-500/85 to-pink-500/85 border-violet-200/35",
  },
  friends: {
    active: "bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-500 border-cyan-200/50",
    inactive: "bg-gradient-to-br from-teal-500/85 via-cyan-500/85 to-blue-500/85 border-cyan-200/35",
  },
  chat: {
    active: "bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 border-sky-200/50",
    inactive: "bg-gradient-to-br from-sky-500/85 via-blue-500/85 to-indigo-500/85 border-sky-200/35",
  },
  p2p: {
    active: "bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 border-orange-200/50",
    inactive: "bg-gradient-to-br from-orange-500/85 via-red-500/85 to-pink-500/85 border-orange-200/35",
  },
  free: {
    active: "bg-gradient-to-br from-lime-500 via-emerald-500 to-green-500 border-lime-200/50",
    inactive: "bg-gradient-to-br from-lime-500/85 via-emerald-500/85 to-green-500/85 border-lime-200/35",
  },
  "daily-rewards": {
    active: "bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500 border-yellow-200/50",
    inactive: "bg-gradient-to-br from-yellow-500/85 via-amber-500/85 to-orange-500/85 border-yellow-200/35",
  },
  referral: {
    active: "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-500 border-cyan-200/50",
    inactive: "bg-gradient-to-br from-cyan-500/85 via-sky-500/85 to-blue-500/85 border-cyan-200/35",
  },
  transactions: {
    active: "bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-500 border-amber-200/50",
    inactive: "bg-gradient-to-br from-amber-500/85 via-orange-500/85 to-yellow-500/85 border-amber-200/35",
  },
  complaints: {
    active: "bg-gradient-to-br from-red-500 via-rose-500 to-orange-500 border-red-200/50",
    inactive: "bg-gradient-to-br from-red-500/85 via-rose-500/85 to-orange-500/85 border-red-200/35",
  },
  support: {
    active: "bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 border-purple-200/50",
    inactive: "bg-gradient-to-br from-purple-500/85 via-indigo-500/85 to-blue-500/85 border-purple-200/35",
  },
  notifications: {
    active: "bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 border-pink-200/50",
    inactive: "bg-gradient-to-br from-pink-500/85 via-rose-500/85 to-red-500/85 border-pink-200/35",
  },
  settings: {
    active: "bg-gradient-to-br from-slate-500 via-zinc-500 to-neutral-500 border-slate-200/50",
    inactive: "bg-gradient-to-br from-slate-500/85 via-zinc-500/85 to-neutral-500/85 border-slate-200/35",
  },
  "install-app": {
    active: "bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 border-blue-200/50",
    inactive: "bg-gradient-to-br from-blue-500/85 via-indigo-500/85 to-violet-500/85 border-blue-200/35",
  },
  coin: {
    active: "bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 border-amber-200/50",
    inactive: "bg-gradient-to-br from-yellow-400/85 via-amber-500/85 to-orange-500/85 border-amber-200/35",
  },
  invest: {
    active: "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 border-emerald-200/50",
    inactive: "bg-gradient-to-br from-emerald-400/85 via-teal-500/85 to-cyan-600/85 border-emerald-200/35",
  },
  "agents-program": {
    active: "bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 border-violet-200/50",
    inactive: "bg-gradient-to-br from-violet-500/85 via-purple-600/85 to-indigo-700/85 border-violet-200/35",
  },
  affiliates: {
    active: "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-rose-600 border-pink-200/50",
    inactive: "bg-gradient-to-br from-pink-500/85 via-fuchsia-500/85 to-rose-600/85 border-pink-200/35",
  },
};

export const DEFAULT_SIDEBAR_ICON_ACCENT: SidebarIconAccent = {
  active: "bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-500 border-blue-200/50",
  inactive: "bg-gradient-to-br from-cyan-500/85 via-blue-500/85 to-indigo-500/85 border-blue-200/35",
};

export type BottomNavAccent = {
  active: string;
  inactive: string;
  glow: string;
};

export const BOTTOM_NAV_ACCENTS: Record<string, BottomNavAccent> = {
  p2p: {
    active: "bg-gradient-to-br from-orange-500 via-rose-500 to-pink-600 border-orange-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-orange-500/45",
  },
  main: {
    active: "bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600 border-cyan-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-cyan-500/45",
  },
  play: {
    active: "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 border-violet-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-violet-500/45",
  },
  challenges: {
    active: "bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 border-rose-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-rose-500/45",
  },
  tournaments: {
    active: "bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 border-amber-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-amber-400/45",
  },
  chat: {
    active: "bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 border-sky-200/65",
    inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
    glow: "bg-sky-500/45",
  },
};

export const DEFAULT_BOTTOM_NAV_ACCENT: BottomNavAccent = {
  active: "bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600 border-cyan-200/65",
  inactive: "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 border-slate-500/45",
  glow: "bg-cyan-500/45",
};
