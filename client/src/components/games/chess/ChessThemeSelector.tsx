import { useState, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import {
  BOARD_THEMES,
  RARITY_COLORS,
  isThemeUnlocked,
  getUnlockProgress,
  saveTheme,
  type BoardTheme,
  type UserStats
} from '@/lib/chess-themes';
import { X, Lock, Check, Sparkles } from 'lucide-react';

interface ChessThemeSelectorProps {
  currentTheme: BoardTheme;
  onSelectTheme: (theme: BoardTheme) => void;
  onClose: () => void;
}

export function ChessThemeSelector({
  currentTheme,
  onSelectTheme,
  onClose
}: ChessThemeSelectorProps) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const userStats: UserStats = useMemo(() => ({
    gamesPlayed: user?.gamesPlayed ?? 0,
    gamesWon: user?.gamesWon ?? 0,
    currentWinStreak: user?.currentWinStreak ?? 0,
    longestWinStreak: user?.longestWinStreak ?? 0,
    vipLevel: user?.vipLevel ?? 0,
    chessWon: user?.chessWon ?? 0,
    chessPlayed: user?.chessPlayed ?? 0,
  }), [user]);

  const [previewTheme, setPreviewTheme] = useState<BoardTheme | null>(null);

  const themesByRarity = useMemo(() => {
    const groups: Record<string, BoardTheme[]> = { free: [], common: [], rare: [], epic: [], legendary: [] };
    BOARD_THEMES.forEach(th => groups[th.rarity].push(th));
    return groups;
  }, []);

  const handleSelect = (theme: BoardTheme) => {
    if (!isThemeUnlocked(theme, userStats)) return;
    saveTheme(theme.id);
    onSelectTheme(theme);
  };

  const renderMiniBoard = (theme: BoardTheme, size: number = 4) => {
    const squares = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isLight = (r + c) % 2 === 0;
        squares.push(
          <div
            key={`${r}-${c}`}
            style={{
              backgroundColor: isLight ? theme.lightSquare : theme.darkSquare,
              width: `${100 / size}%`,
              height: `${100 / size}%`
            }}
          />
        );
      }
    }
    return (
      <div className="grid rounded-md overflow-hidden aspect-square" style={{
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        border: `2px solid ${theme.borderColor}`
      }}>
        {squares}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl border max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">
              {isAr ? 'تصميمات الرقعة' : 'Board Themes'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {(['free', 'common', 'rare', 'epic', 'legendary'] as const).map(rarity => {
            const themes = themesByRarity[rarity];
            if (!themes || themes.length === 0) return null;
            const rarityInfo = RARITY_COLORS[rarity];

            return (
              <div key={rarity}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rarityInfo.bg} ${rarityInfo.text} border ${rarityInfo.border}`}>
                    {isAr ? rarityInfo.labelAr : rarityInfo.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {themes.map(theme => {
                    const unlocked = isThemeUnlocked(theme, userStats);
                    const progress = getUnlockProgress(theme, userStats);
                    const isActive = currentTheme.id === theme.id;
                    const isPreviewing = previewTheme?.id === theme.id;

                    return (
                      <button
                        key={theme.id}
                        onClick={() => handleSelect(theme)}
                        onMouseEnter={() => unlocked && setPreviewTheme(theme)}
                        onMouseLeave={() => setPreviewTheme(null)}
                        disabled={!unlocked}
                        className={`relative rounded-xl p-2 text-start transition-all ${
                          isActive
                            ? 'ring-2 ring-primary bg-primary/10 scale-[1.02]'
                            : unlocked
                              ? 'hover:bg-muted/50 hover:scale-[1.02]'
                              : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        {/* Mini board preview */}
                        <div className="relative mb-2">
                          {renderMiniBoard(theme)}
                          {!unlocked && (
                            <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                              <Lock className="w-5 h-5 text-white/80" />
                            </div>
                          )}
                          {isActive && (
                            <div className="absolute top-1 end-1 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>

                        {/* Theme name */}
                        <p className="text-xs font-semibold truncate">
                          {isAr ? theme.nameAr : theme.name}
                        </p>

                        {/* Unlock progress */}
                        {!unlocked && (
                          <div className="mt-1">
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${progress}%`,
                                  background: theme.preview
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {isAr ? theme.unlock.labelAr : theme.unlock.labelEn}
                            </p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview footer */}
        {previewTheme && (
          <div className="p-3 border-t flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0">
              {renderMiniBoard(previewTheme)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{isAr ? previewTheme.nameAr : previewTheme.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {isAr ? previewTheme.descriptionAr : previewTheme.description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
