/**
 * Chess Board Themes — unlockable by player activity / level
 * Themes are ordered by rarity (free → common → rare → epic → legendary)
 */

export interface BoardTheme {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  lightSquare: string;
  darkSquare: string;
  selectedBg: string;
  lastMoveBg: string;
  legalMoveDot: string;
  captureRing: string;
  checkGlow: string;
  borderColor: string;
  labelLight: string;
  labelDark: string;
  boardBg?: string;
  pieceFilter?: string; // CSS filter for pieces
  rarity: 'free' | 'common' | 'rare' | 'epic' | 'legendary';
  unlock: ThemeUnlock;
  preview: string; // gradient/color for the preview card
}

export interface ThemeUnlock {
  type: 'free' | 'gamesPlayed' | 'gamesWon' | 'winStreak' | 'vipLevel' | 'chessWon';
  value: number;
  labelEn: string;
  labelAr: string;
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  currentWinStreak: number;
  longestWinStreak: number;
  vipLevel: number;
  chessWon: number;
  chessPlayed: number;
}

export const BOARD_THEMES: BoardTheme[] = [
  // ═══ FREE ═══
  {
    id: 'classic',
    name: 'Classic',
    nameAr: 'كلاسيكي',
    description: 'Traditional amber wood board',
    descriptionAr: 'رقعة خشبية كهرمانية تقليدية',
    lightSquare: '#f0d9b5',
    darkSquare: '#b58863',
    selectedBg: 'rgba(20, 85, 200, 0.5)',
    lastMoveBg: 'rgba(255, 255, 0, 0.4)',
    legalMoveDot: 'rgba(0, 0, 0, 0.25)',
    captureRing: 'rgba(0, 0, 0, 0.25)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#8b6914',
    labelLight: '#b58863',
    labelDark: '#f0d9b5',
    rarity: 'free',
    unlock: { type: 'free', value: 0, labelEn: 'Free', labelAr: 'مجاني' },
    preview: 'linear-gradient(135deg, #f0d9b5 50%, #b58863 50%)'
  },
  {
    id: 'forest',
    name: 'Forest',
    nameAr: 'الغابة',
    description: 'Natural green tones',
    descriptionAr: 'ألوان خضراء طبيعية',
    lightSquare: '#eeeed2',
    darkSquare: '#769656',
    selectedBg: 'rgba(20, 85, 30, 0.5)',
    lastMoveBg: 'rgba(155, 199, 0, 0.41)',
    legalMoveDot: 'rgba(0, 0, 0, 0.2)',
    captureRing: 'rgba(0, 0, 0, 0.2)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#4a7030',
    labelLight: '#769656',
    labelDark: '#eeeed2',
    rarity: 'free',
    unlock: { type: 'free', value: 0, labelEn: 'Free', labelAr: 'مجاني' },
    preview: 'linear-gradient(135deg, #eeeed2 50%, #769656 50%)'
  },
  {
    id: 'ocean',
    name: 'Ocean',
    nameAr: 'المحيط',
    description: 'Cool blue sea tones',
    descriptionAr: 'ألوان بحرية زرقاء',
    lightSquare: '#dee3e6',
    darkSquare: '#8ca2ad',
    selectedBg: 'rgba(20, 85, 200, 0.5)',
    lastMoveBg: 'rgba(0, 150, 255, 0.3)',
    legalMoveDot: 'rgba(0, 0, 0, 0.2)',
    captureRing: 'rgba(0, 0, 0, 0.2)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,50,50,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#5a7a8a',
    labelLight: '#8ca2ad',
    labelDark: '#dee3e6',
    rarity: 'free',
    unlock: { type: 'free', value: 0, labelEn: 'Free', labelAr: 'مجاني' },
    preview: 'linear-gradient(135deg, #dee3e6 50%, #8ca2ad 50%)'
  },

  // ═══ COMMON ═══
  {
    id: 'marble',
    name: 'Marble',
    nameAr: 'رخام',
    description: 'Elegant white marble',
    descriptionAr: 'رخام أبيض أنيق',
    lightSquare: '#f5f5f0',
    darkSquare: '#b0b0a8',
    selectedBg: 'rgba(100, 100, 200, 0.4)',
    lastMoveBg: 'rgba(180, 180, 0, 0.3)',
    legalMoveDot: 'rgba(0, 0, 0, 0.18)',
    captureRing: 'rgba(0, 0, 0, 0.18)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#888880',
    labelLight: '#999990',
    labelDark: '#f0f0e8',
    rarity: 'common',
    unlock: { type: 'gamesPlayed', value: 5, labelEn: 'Play 5 games', labelAr: 'العب 5 مباريات' },
    preview: 'linear-gradient(135deg, #f5f5f0 50%, #b0b0a8 50%)'
  },
  {
    id: 'walnut',
    name: 'Walnut',
    nameAr: 'جوز',
    description: 'Rich dark wood',
    descriptionAr: 'خشب جوز داكن فاخر',
    lightSquare: '#d2a86b',
    darkSquare: '#6b3a1f',
    selectedBg: 'rgba(255, 170, 0, 0.5)',
    lastMoveBg: 'rgba(255, 200, 0, 0.35)',
    legalMoveDot: 'rgba(255, 255, 255, 0.3)',
    captureRing: 'rgba(255, 255, 255, 0.3)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,60,60,0.7) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#4a2810',
    labelLight: '#6b3a1f',
    labelDark: '#d2a86b',
    rarity: 'common',
    unlock: { type: 'gamesPlayed', value: 15, labelEn: 'Play 15 games', labelAr: 'العب 15 مباراة' },
    preview: 'linear-gradient(135deg, #d2a86b 50%, #6b3a1f 50%)'
  },
  {
    id: 'midnight',
    name: 'Midnight',
    nameAr: 'منتصف الليل',
    description: 'Dark navy elegance',
    descriptionAr: 'أناقة كحلية داكنة',
    lightSquare: '#c8ccd0',
    darkSquare: '#2c3e50',
    selectedBg: 'rgba(52, 152, 219, 0.5)',
    lastMoveBg: 'rgba(52, 152, 219, 0.3)',
    legalMoveDot: 'rgba(255, 255, 255, 0.35)',
    captureRing: 'rgba(255, 255, 255, 0.35)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,60,60,0.7) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#1a252f',
    labelLight: '#2c3e50',
    labelDark: '#c8ccd0',
    rarity: 'common',
    unlock: { type: 'gamesPlayed', value: 30, labelEn: 'Play 30 games', labelAr: 'العب 30 مباراة' },
    preview: 'linear-gradient(135deg, #c8ccd0 50%, #2c3e50 50%)'
  },

  // ═══ RARE ═══
  {
    id: 'rosegold',
    name: 'Rose Gold',
    nameAr: 'ذهب وردي',
    description: 'Luxurious pink gold tones',
    descriptionAr: 'ألوان ذهبية وردية فاخرة',
    lightSquare: '#f8e8e0',
    darkSquare: '#c4836a',
    selectedBg: 'rgba(196, 131, 106, 0.6)',
    lastMoveBg: 'rgba(248, 200, 180, 0.5)',
    legalMoveDot: 'rgba(120, 50, 30, 0.3)',
    captureRing: 'rgba(120, 50, 30, 0.3)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#a0604a',
    labelLight: '#c4836a',
    labelDark: '#f8e8e0',
    rarity: 'rare',
    unlock: { type: 'gamesWon', value: 5, labelEn: 'Win 5 games', labelAr: 'اربح 5 مباريات' },
    preview: 'linear-gradient(135deg, #f8e8e0 50%, #c4836a 50%)'
  },
  {
    id: 'emerald',
    name: 'Emerald',
    nameAr: 'زمرد',
    description: 'Rich emerald crystal board',
    descriptionAr: 'رقعة كريستال زمردية فاخرة',
    lightSquare: '#d4edda',
    darkSquare: '#28744a',
    selectedBg: 'rgba(40, 116, 74, 0.6)',
    lastMoveBg: 'rgba(100, 220, 140, 0.4)',
    legalMoveDot: 'rgba(0, 50, 20, 0.3)',
    captureRing: 'rgba(0, 50, 20, 0.3)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,50,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#1a5030',
    labelLight: '#28744a',
    labelDark: '#d4edda',
    rarity: 'rare',
    unlock: { type: 'gamesWon', value: 15, labelEn: 'Win 15 games', labelAr: 'اربح 15 مباراة' },
    preview: 'linear-gradient(135deg, #d4edda 50%, #28744a 50%)'
  },
  {
    id: 'royal',
    name: 'Royal',
    nameAr: 'ملكي',
    description: 'Purple and gold royalty',
    descriptionAr: 'بنفسجي وذهبي ملكي',
    lightSquare: '#e8dcf0',
    darkSquare: '#6b3fa0',
    selectedBg: 'rgba(180, 140, 255, 0.5)',
    lastMoveBg: 'rgba(180, 140, 255, 0.3)',
    legalMoveDot: 'rgba(50, 0, 80, 0.3)',
    captureRing: 'rgba(50, 0, 80, 0.3)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,200,0,0.6) 0%, rgba(255,150,0,0) 70%)',
    borderColor: '#4a2a70',
    labelLight: '#6b3fa0',
    labelDark: '#e8dcf0',
    rarity: 'rare',
    unlock: { type: 'gamesWon', value: 30, labelEn: 'Win 30 games', labelAr: 'اربح 30 مباراة' },
    preview: 'linear-gradient(135deg, #e8dcf0 50%, #6b3fa0 50%)'
  },

  // ═══ EPIC ═══
  {
    id: 'ice',
    name: 'Ice Crystal',
    nameAr: 'كريستال ثلجي',
    description: 'Frozen ice beauty',
    descriptionAr: 'جمال الثلج المتجمد',
    lightSquare: '#e8f4f8',
    darkSquare: '#5ba4c9',
    selectedBg: 'rgba(91, 164, 201, 0.5)',
    lastMoveBg: 'rgba(150, 220, 255, 0.4)',
    legalMoveDot: 'rgba(0, 50, 100, 0.3)',
    captureRing: 'rgba(0, 50, 100, 0.3)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,100,100,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#3a7a9a',
    labelLight: '#5ba4c9',
    labelDark: '#e8f4f8',
    rarity: 'epic',
    unlock: { type: 'winStreak', value: 5, labelEn: '5 win streak', labelAr: '5 انتصارات متتالية' },
    preview: 'linear-gradient(135deg, #e8f4f8 50%, #5ba4c9 50%)'
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    nameAr: 'سبج',
    description: 'Dark volcanic glass',
    descriptionAr: 'زجاج بركاني داكن',
    lightSquare: '#5a5a5a',
    darkSquare: '#1a1a1a',
    selectedBg: 'rgba(200, 200, 200, 0.3)',
    lastMoveBg: 'rgba(255, 255, 255, 0.15)',
    legalMoveDot: 'rgba(255, 255, 255, 0.35)',
    captureRing: 'rgba(255, 255, 255, 0.35)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,50,50,0.7) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#0a0a0a',
    labelLight: '#1a1a1a',
    labelDark: '#888',
    pieceFilter: 'drop-shadow(0 0 2px rgba(255,255,255,0.5))',
    rarity: 'epic',
    unlock: { type: 'winStreak', value: 10, labelEn: '10 win streak', labelAr: '10 انتصارات متتالية' },
    preview: 'linear-gradient(135deg, #5a5a5a 50%, #1a1a1a 50%)'
  },
  {
    id: 'cherry',
    name: 'Cherry Blossom',
    nameAr: 'زهر الكرز',
    description: 'Soft pink blossoms',
    descriptionAr: 'أزهار وردية ناعمة',
    lightSquare: '#fce4ec',
    darkSquare: '#e57398',
    selectedBg: 'rgba(229, 115, 152, 0.5)',
    lastMoveBg: 'rgba(255, 183, 213, 0.5)',
    legalMoveDot: 'rgba(100, 0, 30, 0.25)',
    captureRing: 'rgba(100, 0, 30, 0.25)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.5) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#c0506a',
    labelLight: '#e57398',
    labelDark: '#fce4ec',
    rarity: 'epic',
    unlock: { type: 'chessWon', value: 50, labelEn: 'Win 50 chess games', labelAr: 'اربح 50 مباراة شطرنج' },
    preview: 'linear-gradient(135deg, #fce4ec 50%, #e57398 50%)'
  },

  // ═══ LEGENDARY ═══
  {
    id: 'golden',
    name: 'Golden Luxury',
    nameAr: 'ذهبي فاخر',
    description: 'Pure gold luxury board',
    descriptionAr: 'رقعة ذهبية فاخرة',
    lightSquare: '#fdf0d0',
    darkSquare: '#c9a23a',
    selectedBg: 'rgba(201, 162, 58, 0.6)',
    lastMoveBg: 'rgba(255, 215, 0, 0.4)',
    legalMoveDot: 'rgba(100, 70, 0, 0.35)',
    captureRing: 'rgba(100, 70, 0, 0.35)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0) 70%)',
    borderColor: '#a08020',
    labelLight: '#c9a23a',
    labelDark: '#fdf0d0',
    rarity: 'legendary',
    unlock: { type: 'vipLevel', value: 1, labelEn: 'VIP Level 1', labelAr: 'مستوى VIP 1' },
    preview: 'linear-gradient(135deg, #fdf0d0 50%, #c9a23a 50%)'
  },
  {
    id: 'neon',
    name: 'Neon Cyber',
    nameAr: 'نيون سايبر',
    description: 'Futuristic neon glow',
    descriptionAr: 'توهج نيون مستقبلي',
    lightSquare: '#1a1a2e',
    darkSquare: '#0f0f1a',
    selectedBg: 'rgba(0, 255, 255, 0.3)',
    lastMoveBg: 'rgba(0, 255, 150, 0.2)',
    legalMoveDot: 'rgba(0, 255, 255, 0.5)',
    captureRing: 'rgba(255, 0, 255, 0.5)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,0,100,0.7) 0%, rgba(255,0,100,0) 70%)',
    borderColor: '#00ffff',
    labelLight: '#00cccc',
    labelDark: '#00ffff',
    pieceFilter: 'drop-shadow(0 0 4px rgba(0,255,255,0.6))',
    boardBg: 'linear-gradient(135deg, #0a0a20, #1a0a30)',
    rarity: 'legendary',
    unlock: { type: 'vipLevel', value: 3, labelEn: 'VIP Level 3', labelAr: 'مستوى VIP 3' },
    preview: 'linear-gradient(135deg, #1a1a2e 50%, #00ffff 50%)'
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    nameAr: 'كوني',
    description: 'Galaxy space board',
    descriptionAr: 'رقعة فضائية مجرّية',
    lightSquare: '#2d1b69',
    darkSquare: '#0d0628',
    selectedBg: 'rgba(150, 100, 255, 0.4)',
    lastMoveBg: 'rgba(100, 50, 200, 0.3)',
    legalMoveDot: 'rgba(200, 150, 255, 0.5)',
    captureRing: 'rgba(200, 150, 255, 0.5)',
    checkGlow: 'radial-gradient(ellipse at center, rgba(255,100,200,0.7) 0%, rgba(255,0,150,0) 70%)',
    borderColor: '#6a3fa0',
    labelLight: '#6a3fa0',
    labelDark: '#c8a0ff',
    pieceFilter: 'drop-shadow(0 0 3px rgba(200,150,255,0.7))',
    boardBg: 'linear-gradient(135deg, #0d0628, #2d1b69, #0d0628)',
    rarity: 'legendary',
    unlock: { type: 'vipLevel', value: 5, labelEn: 'VIP Level 5', labelAr: 'مستوى VIP 5' },
    preview: 'linear-gradient(135deg, #2d1b69 50%, #0d0628 50%)'
  }
];

/** Get default theme */
export function getDefaultTheme(): BoardTheme {
  return BOARD_THEMES[0];
}

/** Check if a user can use a specific theme */
export function isThemeUnlocked(theme: BoardTheme, stats: UserStats): boolean {
  const { unlock } = theme;
  switch (unlock.type) {
    case 'free': return true;
    case 'gamesPlayed': return stats.gamesPlayed >= unlock.value;
    case 'gamesWon': return stats.gamesWon >= unlock.value;
    case 'winStreak': return stats.longestWinStreak >= unlock.value;
    case 'vipLevel': return stats.vipLevel >= unlock.value;
    case 'chessWon': return stats.chessWon >= unlock.value;
    default: return false;
  }
}

/** Get progress toward unlocking a theme (0-100) */
export function getUnlockProgress(theme: BoardTheme, stats: UserStats): number {
  const { unlock } = theme;
  if (unlock.type === 'free') return 100;
  let current = 0;
  switch (unlock.type) {
    case 'gamesPlayed': current = stats.gamesPlayed; break;
    case 'gamesWon': current = stats.gamesWon; break;
    case 'winStreak': current = stats.longestWinStreak; break;
    case 'vipLevel': current = stats.vipLevel; break;
    case 'chessWon': current = stats.chessWon; break;
  }
  return Math.min(100, Math.round((current / unlock.value) * 100));
}

/** Rarity display info */
export const RARITY_COLORS: Record<BoardTheme['rarity'], { bg: string; text: string; border: string; label: string; labelAr: string }> = {
  free:      { bg: 'bg-gray-100 dark:bg-gray-800',    text: 'text-gray-600 dark:text-gray-400',     border: 'border-gray-300 dark:border-gray-600',   label: 'Free',      labelAr: 'مجاني'   },
  common:    { bg: 'bg-green-50 dark:bg-green-950',    text: 'text-green-600 dark:text-green-400',   border: 'border-green-300 dark:border-green-700', label: 'Common',    labelAr: 'عادي'    },
  rare:      { bg: 'bg-blue-50 dark:bg-blue-950',      text: 'text-blue-600 dark:text-blue-400',     border: 'border-blue-300 dark:border-blue-700',   label: 'Rare',      labelAr: 'نادر'    },
  epic:      { bg: 'bg-purple-50 dark:bg-purple-950',  text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-700', label: 'Epic',    labelAr: 'ملحمي'   },
  legendary: { bg: 'bg-amber-50 dark:bg-amber-950',    text: 'text-amber-600 dark:text-amber-400',   border: 'border-amber-400 dark:border-amber-600', label: 'Legendary', labelAr: 'أسطوري' }
};

const THEME_KEY = 'vex-chess-board-theme';

/** Load saved theme from localStorage */
export function loadSavedTheme(): BoardTheme {
  try {
    const id = localStorage.getItem(THEME_KEY);
    if (id) {
      const found = BOARD_THEMES.find(t => t.id === id);
      if (found) return found;
    }
  } catch {}
  return getDefaultTheme();
}

/** Save selected theme to localStorage */
export function saveTheme(themeId: string): void {
  try {
    localStorage.setItem(THEME_KEY, themeId);
  } catch {}
}
