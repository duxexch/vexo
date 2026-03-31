import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Trophy,
  Target,
  Flame,
  DollarSign,
  Users,
  Star,
  Crown,
  Medal,
  Zap,
  Gift,
  Lock,
  Check,
  Sparkles,
} from "lucide-react";

interface Achievement {
  id: string;
  key: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  category: string;
  rarity: string;
  icon: string;
  requirement: number;
  rewardAmount: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  rewardClaimed: boolean;
}

const CATEGORY_ICONS: Record<string, typeof Trophy> = {
  games: Target,
  wins: Trophy,
  earnings: DollarSign,
  streaks: Flame,
  social: Users,
  special: Star,
};

const RARITY_COLORS: Record<string, string> = {
  common: 'border-gray-500 bg-gray-500/10',
  uncommon: 'border-green-500 bg-green-500/10',
  rare: 'border-blue-500 bg-blue-500/10',
  epic: 'border-purple-500 bg-purple-500/10',
  legendary: 'border-amber-500 bg-amber-500/10',
};

const RARITY_TEXT: Record<string, string> = {
  common: 'text-gray-500',
  uncommon: 'text-green-500',
  rare: 'text-blue-500',
  epic: 'text-purple-500',
  legendary: 'text-amber-500',
};

const ICON_COMPONENTS: Record<string, typeof Trophy> = {
  trophy: Trophy,
  target: Target,
  flame: Flame,
  dollar: DollarSign,
  users: Users,
  star: Star,
  crown: Crown,
  medal: Medal,
  zap: Zap,
  gift: Gift,
  sparkles: Sparkles,
};

interface AchievementsPanelProps {
  userId?: string;
  compact?: boolean;
}

export function AchievementsPanel({ userId, compact = false }: AchievementsPanelProps) {
  const { t, language } = useI18n();
  const { toast } = useToast();

  const { data: achievements, isLoading } = useQuery<Achievement[]>({
    queryKey: ['/api/me/achievements'],
    enabled: !userId,
  });

  const claimMutation = useMutation({
    mutationFn: async (achievementId: string) => {
      const res = await apiRequest('POST', `/api/achievements/${achievementId}/claim`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('achievements.rewardClaimed'),
        description: `+$${data.amount}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/me/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('achievements.claimFailed'),
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const unlockedCount = achievements?.filter(a => a.unlocked).length || 0;
  const totalCount = achievements?.length || 0;

  const groupedAchievements = achievements?.reduce((acc, achievement) => {
    const category = achievement.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>) || {};

  const renderAchievement = (achievement: Achievement) => {
    const IconComponent = ICON_COMPONENTS[achievement.icon] || Trophy;
    const rarityColor = RARITY_COLORS[achievement.rarity] || RARITY_COLORS.common;
    const rarityTextColor = RARITY_TEXT[achievement.rarity] || RARITY_TEXT.common;
    const progressPercent = Math.min((achievement.progress / achievement.requirement) * 100, 100);
    const rewardAmount = parseFloat(achievement.rewardAmount);

    return (
      <div
        key={achievement.id}
        className={`relative p-4 rounded-lg border-2 transition-all ${
          achievement.unlocked ? rarityColor : 'border-muted bg-muted/30 opacity-70'
        }`}
        data-testid={`achievement-${achievement.key}`}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${achievement.unlocked ? 'bg-background' : 'bg-muted'}`}>
            {achievement.unlocked ? (
              <IconComponent className={`w-6 h-6 ${rarityTextColor}`} />
            ) : (
              <Lock className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold truncate">
                {language === 'ar' ? achievement.nameAr : achievement.name}
              </h4>
              <Badge variant="outline" className={rarityTextColor}>
                {t(`achievements.rarity.${achievement.rarity}`)}
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? achievement.descriptionAr : achievement.description}
            </p>
            
            {!achievement.unlocked && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{t('achievements.progress')}</span>
                  <span>{achievement.progress}/{achievement.requirement}</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>
            )}
            
            {achievement.unlocked && rewardAmount > 0 && (
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1 text-sm">
                  <Gift className="w-4 h-4 text-primary" />
                  <span className="text-primary font-medium">${rewardAmount}</span>
                </div>
                
                {achievement.rewardClaimed ? (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="w-3 h-3 me-1" />
                    {t('achievements.claimed')}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => claimMutation.mutate(achievement.id)}
                    disabled={claimMutation.isPending}
                    data-testid={`button-claim-${achievement.key}`}
                  >
                    {t('achievements.claimReward')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {achievement.unlocked && (
          <div className="absolute top-2 end-2">
            <Sparkles className={`w-4 h-4 ${rarityTextColor}`} />
          </div>
        )}
      </div>
    );
  };

  if (compact) {
    const recentUnlocked = achievements
      ?.filter(a => a.unlocked)
      .slice(0, 3) || [];
    
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              {t('profile.achievements')}
            </span>
            <Badge variant="secondary">{unlockedCount}/{totalCount}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentUnlocked.length > 0 ? (
            recentUnlocked.map(renderAchievement)
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{t('achievements.playToUnlock')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            {t('profile.achievements')}
          </span>
          <Badge variant="secondary" className="text-lg px-3">
            {unlockedCount}/{totalCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pe-4">
          <div className="space-y-6">
            {Object.entries(groupedAchievements).map(([category, categoryAchievements]) => {
              const CategoryIcon = CATEGORY_ICONS[category] || Trophy;
              const unlockedInCategory = categoryAchievements.filter(a => a.unlocked).length;
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">
                      {t(`achievements.categories.${category}`)}
                    </h3>
                    <Badge variant="outline" className="ml-auto">
                      {unlockedInCategory}/{categoryAchievements.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {categoryAchievements.map(renderAchievement)}
                  </div>
                </div>
              );
            })}
            
            {Object.keys(groupedAchievements).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('achievements.noAchievements')}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
