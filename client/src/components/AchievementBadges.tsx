import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import {
  Trophy, Medal, Flame, Star, Crown, Gem, Target,
  Swords, Shield, Zap, Heart, Sparkles, Award,
  CircleDollarSign, Gamepad2, Clock, TrendingUp
} from "lucide-react";

interface AchievementDef {
  id: string;
  icon: typeof Trophy;
  color: string;
  bgColor: string;
  borderColor: string;
  tiers: { threshold: number; label: string; labelAr: string }[];
  getValue: (stats: PlayerAchievementStats) => number;
  category: 'general' | 'streak' | 'mastery' | 'wealth';
}

export interface PlayerAchievementStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  currentWinStreak: number;
  longestWinStreak: number;
  totalEarnings: string;
  totalWagered: string;
  totalWon: string;
  vipLevel: number;
  winRate: number;
  gameStats: { game: string; played: number; won: number; winRate: number }[];
}

const ACHIEVEMENTS: AchievementDef[] = [
  // General
  {
    id: 'first_steps',
    icon: Gamepad2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    category: 'general',
    tiers: [
      { threshold: 1, label: 'First Steps', labelAr: 'الخطوات الأولى' },
      { threshold: 10, label: 'Getting Started', labelAr: 'البداية' },
      { threshold: 50, label: 'Regular Player', labelAr: 'لاعب منتظم' },
      { threshold: 100, label: 'Dedicated', labelAr: 'مخلص' },
      { threshold: 500, label: 'Hardcore', labelAr: 'محترف صلب' },
    ],
    getValue: (s) => s.gamesPlayed,
  },
  {
    id: 'winner',
    icon: Trophy,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    category: 'general',
    tiers: [
      { threshold: 1, label: 'First Victory', labelAr: 'أول انتصار' },
      { threshold: 10, label: 'Winner', labelAr: 'فائز' },
      { threshold: 50, label: 'Champion', labelAr: 'بطل' },
      { threshold: 100, label: 'Legend', labelAr: 'أسطورة' },
      { threshold: 500, label: 'Unstoppable', labelAr: 'لا يُقهر' },
    ],
    getValue: (s) => s.gamesWon,
  },
  {
    id: 'accuracy',
    icon: Target,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    category: 'general',
    tiers: [
      { threshold: 30, label: 'Improving', labelAr: 'يتحسن' },
      { threshold: 50, label: 'Balanced', labelAr: 'متوازن' },
      { threshold: 65, label: 'Skilled', labelAr: 'ماهر' },
      { threshold: 80, label: 'Expert', labelAr: 'خبير' },
      { threshold: 95, label: 'Perfectionist', labelAr: 'كمالي' },
    ],
    getValue: (s) => s.winRate,
  },
  // Streak
  {
    id: 'hot_streak',
    icon: Flame,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    category: 'streak',
    tiers: [
      { threshold: 3, label: 'Warming Up', labelAr: 'إحماء' },
      { threshold: 5, label: 'On Fire', labelAr: 'مشتعل' },
      { threshold: 10, label: 'Blazing', labelAr: 'ملتهب' },
      { threshold: 15, label: 'Inferno', labelAr: 'جحيم' },
      { threshold: 25, label: 'Eternal Flame', labelAr: 'اللهب الأبدي' },
    ],
    getValue: (s) => s.longestWinStreak,
  },
  {
    id: 'current_fire',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    category: 'streak',
    tiers: [
      { threshold: 3, label: 'Sparking', labelAr: 'يشتعل' },
      { threshold: 5, label: 'Lightning', labelAr: 'برق' },
      { threshold: 8, label: 'Thunder', labelAr: 'رعد' },
      { threshold: 12, label: 'Storm', labelAr: 'عاصفة' },
    ],
    getValue: (s) => s.currentWinStreak,
  },
  // Mastery
  {
    id: 'chess_master',
    icon: Crown,
    color: 'text-amber-600',
    bgColor: 'bg-amber-600/10',
    borderColor: 'border-amber-600/30',
    category: 'mastery',
    tiers: [
      { threshold: 5, label: 'Pawn', labelAr: 'بيدق' },
      { threshold: 20, label: 'Knight', labelAr: 'فارس' },
      { threshold: 50, label: 'Bishop', labelAr: 'فيل' },
      { threshold: 100, label: 'Rook', labelAr: 'قلعة' },
      { threshold: 200, label: 'Grandmaster', labelAr: 'أستاذ كبير' },
    ],
    getValue: (s) => s.gameStats.find(g => g.game === 'chess')?.won ?? 0,
  },
  {
    id: 'backgammon_master',
    icon: Shield, 
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    category: 'mastery',
    tiers: [
      { threshold: 5, label: 'Beginner', labelAr: 'مبتدئ' },
      { threshold: 20, label: 'Regular', labelAr: 'منتظم' },
      { threshold: 50, label: 'Skilled', labelAr: 'ماهر' },
      { threshold: 100, label: 'Master', labelAr: 'محترف' },
      { threshold: 200, label: 'Grandmaster', labelAr: 'أستاذ كبير' },
    ],
    getValue: (s) => s.gameStats.find(g => g.game === 'backgammon')?.won ?? 0,
  },
  {
    id: 'domino_master',
    icon: Swords,
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    borderColor: 'border-blue-600/30',
    category: 'mastery',
    tiers: [
      { threshold: 5, label: 'Novice', labelAr: 'مبتدئ' },
      { threshold: 20, label: 'Player', labelAr: 'لاعب' },
      { threshold: 50, label: 'Expert', labelAr: 'خبير' },
      { threshold: 100, label: 'Master', labelAr: 'سيد' },
    ],
    getValue: (s) => s.gameStats.find(g => g.game === 'domino')?.won ?? 0,
  },
  {
    id: 'card_master',
    icon: Gem,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    category: 'mastery',
    tiers: [
      { threshold: 5, label: 'Dealer', labelAr: 'موزع' },
      { threshold: 20, label: 'Card Shark', labelAr: 'قرش البطاقات' },
      { threshold: 50, label: 'Card Master', labelAr: 'سيد البطاقات' },
      { threshold: 100, label: 'Card Legend', labelAr: 'أسطورة البطاقات' },
    ],
    getValue: (s) => {
      const tarneeb = s.gameStats.find(g => g.game === 'tarneeb')?.won ?? 0;
      const baloot = s.gameStats.find(g => g.game === 'baloot')?.won ?? 0;
      return tarneeb + baloot;
    },
  },
  // Wealth
  {
    id: 'earner',
    icon: CircleDollarSign,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    borderColor: 'border-green-600/30',
    category: 'wealth',
    tiers: [
      { threshold: 100, label: 'Pocket Change', labelAr: 'فكة' },
      { threshold: 1000, label: 'Money Maker', labelAr: 'صانع المال' },
      { threshold: 10000, label: 'Rich', labelAr: 'غني' },
      { threshold: 100000, label: 'Wealthy', labelAr: 'ثري' },
      { threshold: 1000000, label: 'Millionaire', labelAr: 'مليونير' },
    ],
    getValue: (s) => parseFloat(s.totalEarnings) || 0,
  },
  {
    id: 'vip_status',
    icon: Sparkles,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    category: 'wealth',
    tiers: [
      { threshold: 1, label: 'VIP Bronze', labelAr: 'VIP برونزي' },
      { threshold: 2, label: 'VIP Silver', labelAr: 'VIP فضي' },
      { threshold: 3, label: 'VIP Gold', labelAr: 'VIP ذهبي' },
      { threshold: 4, label: 'VIP Platinum', labelAr: 'VIP بلاتيني' },
      { threshold: 5, label: 'VIP Diamond', labelAr: 'VIP ماسي' },
    ],
    getValue: (s) => s.vipLevel,
  },
  {
    id: 'all_rounder',
    icon: Star,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/30',
    category: 'general',
    tiers: [
      { threshold: 2, label: 'Explorer', labelAr: 'مستكشف' },
      { threshold: 3, label: 'Versatile', labelAr: 'متعدد' },
      { threshold: 4, label: 'All-Rounder', labelAr: 'شامل' },
      { threshold: 5, label: 'Master of All', labelAr: 'سيد الكل' },
    ],
    getValue: (s) => s.gameStats.filter(g => g.won >= 1).length,
  },
];

const CATEGORY_LABELS: Record<string, { en: string; ar: string }> = {
  general: { en: 'General', ar: 'عام' },
  streak: { en: 'Streaks', ar: 'السلاسل' },
  mastery: { en: 'Game Mastery', ar: 'إتقان الألعاب' },
  wealth: { en: 'Wealth & Status', ar: 'الثروة والمكانة' },
};

interface AchievementBadgesProps {
  stats: PlayerAchievementStats;
  compact?: boolean;
}

interface ComputedAchievement {
  def: AchievementDef;
  currentValue: number;
  currentTier: number; // -1 = locked, 0 = first tier, etc.
  currentLabel: string;
  nextThreshold: number | null;
  progress: number; // 0-100
  isUnlocked: boolean;
  isMaxTier: boolean;
}

function computeAchievements(stats: PlayerAchievementStats, language: string): ComputedAchievement[] {
  return ACHIEVEMENTS.map(def => {
    const value = def.getValue(stats);
    let currentTier = -1;
    for (let i = def.tiers.length - 1; i >= 0; i--) {
      if (value >= def.tiers[i].threshold) {
        currentTier = i;
        break;
      }
    }
    const isUnlocked = currentTier >= 0;
    const isMaxTier = currentTier === def.tiers.length - 1;
    const nextTier = isMaxTier ? null : def.tiers[currentTier + 1];
    const prevThreshold = currentTier >= 0 ? def.tiers[currentTier].threshold : 0;
    const nextThreshold = nextTier ? nextTier.threshold : null;
    
    let progress = 0;
    if (isMaxTier) {
      progress = 100;
    } else if (nextThreshold !== null) {
      const range = nextThreshold - prevThreshold;
      const current = value - prevThreshold;
      progress = Math.min(100, Math.max(0, (current / range) * 100));
    }

    const currentLabel = isUnlocked
      ? (language === 'ar' ? def.tiers[currentTier].labelAr : def.tiers[currentTier].label)
      : (language === 'ar' ? def.tiers[0].labelAr : def.tiers[0].label);

    return {
      def,
      currentValue: value,
      currentTier,
      currentLabel,
      nextThreshold,
      progress,
      isUnlocked,
      isMaxTier,
    };
  });
}

export default function AchievementBadges({ stats, compact = false }: AchievementBadgesProps) {
  const { t, language } = useI18n();

  const achievements = useMemo(() => computeAchievements(stats, language), [stats, language]);
  const unlockedCount = achievements.filter(a => a.isUnlocked).length;
  const totalCount = achievements.length;

  if (compact) {
    const unlocked = achievements.filter(a => a.isUnlocked);
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              {t('profile.achievements')}
            </span>
            <Badge variant="outline" className="font-mono">
              {unlockedCount}/{totalCount}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unlocked.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {unlocked.map(a => {
                const Icon = a.def.icon;
                return (
                  <div
                    key={a.def.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${a.def.bgColor} ${a.def.borderColor} transition-transform hover:scale-105`}
                    title={a.currentLabel}
                  >
                    <Icon className={`w-4 h-4 ${a.def.color}`} />
                    <span className="text-xs font-medium">{a.currentLabel}</span>
                    {a.isMaxTier && <Sparkles className="w-3 h-3 text-amber-400" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              {t('profile.playToUnlock')}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const categories = ['general', 'streak', 'mastery', 'wealth'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            {t('profile.achievements')}
          </span>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">
              {unlockedCount}/{totalCount}
            </Badge>
            <div className="w-24">
              <Progress value={(unlockedCount / totalCount) * 100} className="h-2" />
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {categories.map(cat => {
          const catAchievements = achievements.filter(a => a.def.category === cat);
          const catLabel = CATEGORY_LABELS[cat];
          
          return (
            <div key={cat}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {language === 'ar' ? catLabel.ar : catLabel.en}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {catAchievements.map(a => {
                  const Icon = a.def.icon;
                  return (
                    <div
                      key={a.def.id}
                      className={`relative p-3 rounded-lg border transition-all ${
                        a.isUnlocked
                          ? `${a.def.bgColor} ${a.def.borderColor} hover:shadow-md`
                          : 'bg-muted/30 border-muted opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${a.isUnlocked ? a.def.bgColor : 'bg-muted'}`}>
                          <Icon className={`w-5 h-5 ${a.isUnlocked ? a.def.color : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium text-sm truncate ${!a.isUnlocked && 'text-muted-foreground'}`}>
                              {a.currentLabel}
                            </span>
                            {a.isMaxTier && (
                              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            )}
                            {a.isUnlocked && !a.isMaxTier && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                                {a.currentTier + 1}/{a.def.tiers.length}
                              </Badge>
                            )}
                          </div>
                          {!a.isMaxTier && (
                            <div className="mt-1.5">
                              <Progress value={a.progress} className="h-1.5" />
                              <div className="flex justify-between mt-0.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {Math.round(a.currentValue)}
                                </span>
                                {a.nextThreshold !== null && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {a.nextThreshold}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {a.isMaxTier && (
                            <span className="text-[10px] text-amber-500 font-medium">
                              ⭐ {language === 'ar' ? 'الحد الأقصى' : 'MAX'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
