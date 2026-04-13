import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthHeaders } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Flame, Check, Lock, Star, Coins, Calendar, Trophy, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { playSound } from "@/hooks/use-sound-effects";
import { useState } from "react";

interface RewardDay {
  day: number;
  amount: string;
}

interface DailyRewardStatus {
  claimedToday: boolean;
  currentStreak: number;
  nextDay: number;
  nextRewardAmount: string | null;
  schedule: RewardDay[];
  recentClaims: Array<{
    day: number;
    amount: string;
    claimedAt: string;
    streakCount: number;
  }>;
  totalEarned: string;
}

export default function DailyRewardsPage() {
  const { t, language, dir } = useI18n();
  const headers = useAuthHeaders();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimAnimation, setClaimAnimation] = useState(false);
  const [lastReferenceId, setLastReferenceId] = useState("");
  const [copiedReference, setCopiedReference] = useState(false);

  const { data: status, isLoading } = useQuery<DailyRewardStatus>({
    queryKey: ["/api/daily-rewards/status"],
    queryFn: async () => {
      const res = await fetch("/api/daily-rewards/status", { headers });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/daily-rewards/claim", {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to claim");
      }
      return res.json();
    },
    onSuccess: (data) => {
      playSound('reward');
      setClaimAnimation(true);
      setTimeout(() => setClaimAnimation(false), 2000);
      const referenceId = typeof data?.referenceId === "string" ? data.referenceId : "";
      const amount = Number(data?.amount || 0);
      if (referenceId) {
        setLastReferenceId(referenceId);
      }
      const amountText = amount.toFixed(2);
      const claimDescription = referenceId
        ? t('dailyRewards.claimReceiptWithRef', { amount: amountText, reference: referenceId })
        : t('dailyRewards.claimReceiptNoRef', { amount: amountText });
      toast({
        title: t('dailyRewards.claimed'),
        description: claimDescription,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-rewards/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: t('dailyRewards.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyReference = async () => {
    if (!lastReferenceId) return;
    try {
      await navigator.clipboard.writeText(lastReferenceId);
      setCopiedReference(true);
      toast({
        title: t('dailyRewards.copiedTitle'),
        description: t('dailyRewards.referenceCopied'),
      });
      setTimeout(() => setCopiedReference(false), 2000);
    } catch {
      // Clipboard can fail in restricted browser contexts.
    }
  };

  const getDayIcon = (dayIndex: number, currentDay: number, claimedToday: boolean, streak: number) => {
    // Days already claimed in current streak
    if (dayIndex < currentDay - (claimedToday ? 0 : 1)) {
      return <Check className="h-4 w-4 text-primary" />;
    }
    // Today's day (claimed or not)
    if (dayIndex === currentDay - 1 && claimedToday) {
      return <Check className="h-4 w-4 text-primary" />;
    }
    // Next day to claim
    if (dayIndex === (claimedToday ? currentDay : currentDay - 1)) {
      return <Gift className="h-4 w-4 text-amber-500" />;
    }
    // Future days
    return <Lock className="h-3 w-3 text-muted-foreground" />;
  };

  const getDayStatus = (dayIndex: number, currentDay: number, claimedToday: boolean): 'claimed' | 'available' | 'locked' => {
    if (dayIndex < currentDay - (claimedToday ? 0 : 1)) return 'claimed';
    if (dayIndex === currentDay - 1 && claimedToday) return 'claimed';
    if (dayIndex === (claimedToday ? currentDay : currentDay - 1) && !claimedToday) return 'available';
    return 'locked';
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4" dir={dir}>
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const schedule = status?.schedule || [];
  const currentStreak = status?.currentStreak || 0;
  const claimedToday = status?.claimedToday || false;
  const nextDay = status?.nextDay || 1;
  const totalEarned = parseFloat(status?.totalEarned || "0");

  return (
    <div className="max-w-3xl mx-auto min-h-[100svh] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_45%)] p-3 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 sm:space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-amber-500" />
            {t('dailyRewards.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('dailyRewards.description')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full sm:w-auto">
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="font-semibold">{currentStreak}</span>
            <span className="text-muted-foreground text-xs">{t('dailyRewards.dayStreak')}</span>
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3">
            <Coins className="h-4 w-4 text-primary" />
            <span className="font-semibold">{totalEarned.toFixed(2)}</span>
            <span className="text-muted-foreground text-xs">{t('dailyRewards.total')}</span>
          </Badge>
        </div>
      </div>

      {lastReferenceId && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('dailyRewards.lastReferenceLabel')}
              </p>
              <p className="font-mono text-sm sm:text-base break-all">{lastReferenceId}</p>
            </div>
            <Button className="w-full sm:w-auto min-h-[44px]" variant="outline" onClick={copyReference}>
              {copiedReference ? <Check className="h-4 w-4 me-2" /> : <Copy className="h-4 w-4 me-2" />}
              {t('dailyRewards.copyReference')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reward Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t('dailyRewards.weeklySchedule')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[560px] grid-cols-7 gap-1.5 sm:gap-3">
              {schedule.map((reward, idx) => {
                const dayStatus = getDayStatus(idx, nextDay, claimedToday);
                const isDay7 = idx === 6;

                return (
                  <div
                    key={idx}
                    className={`
                    relative flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-3 rounded-xl border-2 transition-all
                    ${dayStatus === 'claimed'
                        ? 'border-primary/50 bg-primary/5'
                        : dayStatus === 'available'
                          ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20'
                          : 'border-muted bg-muted/30 opacity-60'}
                    ${isDay7 ? 'ring-2 ring-amber-500/30' : ''}
                  `}
                  >
                    {/* Day number */}
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                      {t('dailyRewards.day', { day: String(reward.day) })}
                    </span>

                    {/* Icon */}
                    <div className={`
                    p-1.5 sm:p-2 rounded-full
                    ${dayStatus === 'claimed' ? 'bg-primary/10' : dayStatus === 'available' ? 'bg-amber-500/20' : 'bg-muted'}
                  `}>
                      {isDay7 ? (
                        <Trophy className={`h-4 w-4 sm:h-5 sm:w-5 ${dayStatus === 'claimed' ? 'text-primary' : 'text-amber-500'}`} />
                      ) : (
                        getDayIcon(idx, nextDay, claimedToday, currentStreak)
                      )}
                    </div>

                    {/* Amount */}
                    <span className={`
                    text-xs sm:text-sm font-bold
                    ${dayStatus === 'claimed' ? 'text-primary' : dayStatus === 'available' ? 'text-amber-500' : 'text-muted-foreground'}
                  `}>
                      {reward.amount}
                    </span>

                    {/* Claimed checkmark */}
                    {dayStatus === 'claimed' && (
                      <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-primary rounded-full p-0.5">
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claim Button */}
      <Card className={claimAnimation ? 'ring-2 ring-primary animate-pulse' : ''}>
        <CardContent className="p-4 sm:p-6 flex flex-col items-center gap-4">
          {claimedToday ? (
            <>
              <div className="p-4 rounded-full bg-primary/10">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">
                  {t('dailyRewards.todayClaimed')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('dailyRewards.comeBack')}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-full bg-amber-500/10 animate-bounce">
                <Gift className="h-8 w-8 text-amber-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">
                  {t('dailyRewards.todayRewardProject', {
                    day: String(nextDay),
                    amount: status?.nextRewardAmount || '0.50',
                  })}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('dailyRewards.tapToClaim')}
                </p>
              </div>
              <Button
                size="lg"
                className="w-full max-w-xs min-h-[44px] text-lg font-semibold"
                onClick={() => claimMutation.mutate()}
                disabled={claimMutation.isPending}
              >
                {claimMutation.isPending
                  ? t('dailyRewards.claiming')
                  : t('dailyRewards.claimReward')}
                <Star className="h-5 w-5 ms-2" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">
            {t('dailyRewards.howItWorks')}
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('dailyRewards.tip1')}</li>
            <li>{t('dailyRewards.tip2')}</li>
            <li>{t('dailyRewards.tip3')}</li>
            <li>{t('dailyRewards.tip4')}</li>
            <li>{t('dailyRewards.tip5')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
