import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Gift, 
  Play, 
  Users, 
  Calendar, 
  Video, 
  Copy, 
  Check, 
  Coins, 
  Star,
  Clock,
  Share2,
  Link2,
  TrendingUp,
  DollarSign,
  Gamepad2
} from "lucide-react";

interface FreeRewardsData {
  enabled: boolean;
  dailyBonus: {
    available: boolean;
    claimed: boolean;
    amount: number;
    streak: number;
    nextDay: number;
    nextClaim: string | null;
  };
  adsWatched: number;
  maxAdsPerDay: number;
  adReward: number;
  totalAdEarnings: number;
  referrals: number;
  referralReward: number;
  totalReferralEarnings: number;
  totalDailyEarnings: number;
  freeGames: { id: string; name: string; imageUrl: string | null }[];
  freePlayLimit: number;
  todayGamesPlayed: number;
  referralCode: string;
}

export default function FreePage() {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const referralCode = user?.accountId || user?.username || "";
  const referralLink = `${window.location.origin}/login?ref=${referralCode}`;

  const { data: freeRewards } = useQuery<FreeRewardsData>({
    queryKey: ['/api/free/rewards'],
  });

  const claimDailyMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/free/claim-daily'),
    onSuccess: async (res: Response) => {
      const data = typeof res?.json === 'function' ? await res.json() : res;
      const amount = data?.amount || 0;
      toast({
        title: isAr ? 'تم المطالبة بنجاح!' : 'Claimed!',
        description: isAr ? `حصلت على $${amount.toFixed(2)}` : `You received $${amount.toFixed(2)}` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/free/rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (err: Error) => {
      toast({ title: isAr ? 'خطأ' : 'Error', description: err.message, variant: "destructive" });
    }
  });

  const watchAdMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/free/watch-ad'),
    onSuccess: async (res: Response) => {
      const data = typeof res?.json === 'function' ? await res.json() : res;
      const amount = data?.amount || 0;
      toast({
        title: isAr ? 'تمت المشاهدة!' : 'Ad Watched!',
        description: isAr ? `حصلت على $${amount.toFixed(2)}` : `You earned $${amount.toFixed(2)}` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/free/rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (err: Error) => {
      toast({ title: isAr ? 'خطأ' : 'Error', description: err.message, variant: "destructive" });
    }
  });

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast({ title: isAr ? 'تم النسخ' : 'Copied!', description: isAr ? 'تم نسخ كود الإحالة' : 'Referral code copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    toast({ title: isAr ? 'تم النسخ' : 'Copied!', description: isAr ? 'تم نسخ رابط الإحالة' : 'Referral link copied' });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareReferral = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: isAr ? 'انضم إلى VEX واحصل على رصيد مجاني!' : 'Join VEX and Get Free Balance!',
          text: isAr ? `انضم عبر رابط الإحالة الخاص بي: ${referralCode}` : `Join using my referral: ${referralCode}`,
          url: referralLink,
        });
      } catch {
        copyLink();
      }
    } else {
      setShowShareDialog(true);
    }
  };

  const rewards = freeRewards || {
    enabled: true,
    dailyBonus: { available: true, claimed: false, amount: 0.50, streak: 0, nextDay: 1, nextClaim: null },
    adsWatched: 0,
    maxAdsPerDay: 10,
    adReward: 0.10,
    totalAdEarnings: 0,
    referrals: 0,
    referralReward: 5.00,
    totalReferralEarnings: 0,
    totalDailyEarnings: 0,
    freeGames: [],
    freePlayLimit: 0,
    todayGamesPlayed: 0,
    referralCode: '',
  };

  const totalEarnings = (rewards.totalDailyEarnings + rewards.totalAdEarnings + rewards.totalReferralEarnings).toFixed(2);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/20">
          <Gift className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{isAr ? 'المكافآت المجانية' : 'Free Rewards'}</h1>
          <p className="text-muted-foreground text-sm">{isAr ? 'اكسب رصيد مجاني يومياً' : 'Earn free balance daily'}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold text-green-500">${totalEarnings}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي الأرباح' : 'Total Earned'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold text-primary">{rewards.dailyBonus.streak}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'أيام متتالية' : 'Day Streak'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Video className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold text-orange-500">{rewards.adsWatched}/{rewards.maxAdsPerDay}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'إعلانات اليوم' : 'Ads Today'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-blue-500">{rewards.referrals}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'الإحالات' : 'Referrals'}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="daily">
            <Calendar className="w-4 h-4 me-1" />
            <span className="hidden sm:inline">{isAr ? 'يومي' : 'Daily'}</span>
          </TabsTrigger>
          <TabsTrigger value="ads">
            <Video className="w-4 h-4 me-1" />
            <span className="hidden sm:inline">{isAr ? 'إعلانات' : 'Ads'}</span>
          </TabsTrigger>
          <TabsTrigger value="referral">
            <Users className="w-4 h-4 me-1" />
            <span className="hidden sm:inline">{isAr ? 'إحالة' : 'Referral'}</span>
          </TabsTrigger>
          <TabsTrigger value="games">
            <Gamepad2 className="w-4 h-4 me-1" />
            <span className="hidden sm:inline">{isAr ? 'ألعاب' : 'Games'}</span>
          </TabsTrigger>
        </TabsList>

        {/* ===== DAILY BONUS ===== */}
        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                {isAr ? 'المكافأة اليومية' : 'Daily Bonus'}
              </CardTitle>
              <CardDescription>{isAr ? 'سجل دخولك يومياً واحصل على مكافآت متزايدة' : 'Log in daily for increasing rewards'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/20">
                    <Coins className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">${rewards.dailyBonus.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? `اليوم ${rewards.dailyBonus.nextDay} من 7` : `Day ${rewards.dailyBonus.nextDay} of 7`}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => claimDailyMutation.mutate()}
                  disabled={rewards.dailyBonus.claimed || claimDailyMutation.isPending}
                >
                  {claimDailyMutation.isPending ? (
                    <Clock className="w-4 h-4 animate-spin me-2" />
                  ) : (
                    <Gift className="w-4 h-4 me-2" />
                  )}
                  {rewards.dailyBonus.claimed 
                    ? (isAr ? 'تم المطالبة' : 'Claimed') 
                    : (isAr ? 'اطلب المكافأة' : 'Claim')}
                </Button>
              </div>

              {/* Streak Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{isAr ? 'تقدم الأيام المتتالية' : 'Streak Progress'}</span>
                  <span>{rewards.dailyBonus.streak}/7 {isAr ? 'أيام' : 'days'}</span>
                </div>
                <Progress value={((rewards.dailyBonus.streak % 7) / 7) * 100} />
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'أكمل 7 أيام متتالية للحصول على مكافأة $5.00' : 'Complete 7 days for $5.00 bonus'}
                </p>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-7 gap-1 mt-4">
                {[0.50, 0.75, 1.00, 1.50, 2.00, 3.00, 5.00].map((amount, i) => {
                  const dayNum = i + 1;
                  const isCurrent = dayNum === rewards.dailyBonus.nextDay;
                  const isPast = dayNum < rewards.dailyBonus.nextDay;
                  return (
                    <div key={dayNum} className={`text-center p-2 rounded-lg border text-xs ${
                      isCurrent ? 'border-primary bg-primary/10 font-bold' : 
                      isPast ? 'bg-muted text-muted-foreground' : 'border-dashed'
                    }`}>
                      <p className="font-medium">{isAr ? `ي${dayNum}` : `D${dayNum}`}</p>
                      <p className="text-primary">${amount}</p>
                      {isPast && <Check className="w-3 h-3 mx-auto text-green-500" />}
                    </div>
                  );
                })}
              </div>

              <div className="text-center text-sm text-muted-foreground mt-2">
                <TrendingUp className="w-4 h-4 inline me-1" />
                {isAr ? `إجمالي أرباح المكافأة اليومية: $${rewards.totalDailyEarnings.toFixed(2)}` : `Total daily earnings: $${rewards.totalDailyEarnings.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== AD WATCHING ===== */}
        <TabsContent value="ads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-orange-500" />
                {isAr ? 'مشاهدة الإعلانات' : 'Watch Ads'}
              </CardTitle>
              <CardDescription>{isAr ? 'شاهد إعلانات واكسب رصيد' : 'Watch ads to earn balance'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/20">
                    <Coins className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">${rewards.adReward.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? 'لكل إعلان' : 'per ad'}</p>
                  </div>
                </div>
                <Button 
                  onClick={() => watchAdMutation.mutate()}
                  disabled={rewards.adsWatched >= rewards.maxAdsPerDay || watchAdMutation.isPending}
                  variant="outline"
                >
                  {watchAdMutation.isPending ? (
                    <Clock className="w-4 h-4 animate-spin me-2" />
                  ) : (
                    <Play className="w-4 h-4 me-2" />
                  )}
                  {rewards.adsWatched >= rewards.maxAdsPerDay 
                    ? (isAr ? 'الحد اليومي' : 'Daily Limit') 
                    : (isAr ? 'شاهد إعلان' : 'Watch Ad')}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{isAr ? 'الإعلانات المشاهدة اليوم' : 'Ads watched today'}</span>
                  <span>{rewards.adsWatched}/{rewards.maxAdsPerDay}</span>
                </div>
                <Progress value={(rewards.adsWatched / rewards.maxAdsPerDay) * 100} />
              </div>

              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 text-sm">
                <p className="font-medium text-orange-500">
                  {isAr ? `الربح المحتمل اليوم: $${(rewards.maxAdsPerDay * rewards.adReward).toFixed(2)}` 
                    : `Today's potential: $${(rewards.maxAdsPerDay * rewards.adReward).toFixed(2)}`}
                </p>
                <p className="text-muted-foreground mt-1">
                  {isAr ? `إجمالي أرباح الإعلانات: $${rewards.totalAdEarnings.toFixed(2)}` 
                    : `Total ad earnings: $${rewards.totalAdEarnings.toFixed(2)}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== REFERRAL ===== */}
        <TabsContent value="referral" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                {isAr ? 'دعوة الأصدقاء' : 'Invite Friends'}
              </CardTitle>
              <CardDescription>{isAr ? 'شارك الكود أو الرابط واكسب مكافآت' : 'Share your code or link and earn rewards'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Referral Code */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">{isAr ? 'كود الإحالة' : 'Referral Code'}</p>
                <div className="flex items-center gap-2">
                  <Input 
                    value={referralCode} 
                    readOnly 
                    className="font-mono font-bold text-lg"
                  />
                  <Button variant="outline" size="icon" onClick={copyCode}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Referral Link */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">{isAr ? 'رابط الإحالة' : 'Referral Link'}</p>
                <div className="flex items-center gap-2">
                  <Input 
                    value={referralLink} 
                    readOnly 
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                  <Button variant="outline" size="icon" onClick={copyLink}>
                    {copiedLink ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" onClick={shareReferral}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Reward Info */}
              <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div>
                  <p className="font-bold text-blue-500 text-lg">${rewards.referralReward.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{isAr ? 'لكل إحالة ناجحة' : 'per referral'}</p>
                </div>
                <div className="text-end">
                  <Badge variant="secondary" className="mb-1">
                    <Star className="w-3 h-3 me-1" />
                    {rewards.referrals} {isAr ? 'إحالة' : 'referred'}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? `الأرباح: $${rewards.totalReferralEarnings.toFixed(2)}` : `Earned: $${rewards.totalReferralEarnings.toFixed(2)}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== FREE GAMES ===== */}
        <TabsContent value="games" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-purple-500" />
                {isAr ? 'ألعاب مجانية' : 'Free Games'}
              </CardTitle>
              <CardDescription>{isAr ? 'العب ألعاب مجانية واكسب خبرة' : 'Play free games and gain experience'}</CardDescription>
            </CardHeader>
            <CardContent>
              {rewards.freePlayLimit > 0 && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <div className="flex justify-between text-sm mb-2">
                    <span>{isAr ? 'الألعاب اليوم' : 'Games Today'}</span>
                    <span>{rewards.todayGamesPlayed}/{rewards.freePlayLimit}</span>
                  </div>
                  <Progress value={(rewards.todayGamesPlayed / rewards.freePlayLimit) * 100} />
                </div>
              )}

              {rewards.freeGames.length > 0 ? (
                <div className="grid gap-3">
                  {rewards.freeGames.map((game) => (
                    <div key={game.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                          <Gamepad2 className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium">{game.name}</p>
                          <p className="text-xs text-muted-foreground">{isAr ? 'مجاني' : 'Free to play'}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { window.location.href = `/game-lobby/${game.id}`; }}>
                        <Play className="w-4 h-4 me-1" />
                        {isAr ? 'العب' : 'Play'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{isAr ? 'لا توجد ألعاب مجانية حالياً' : 'No free games available yet'}</p>
                  <p className="text-xs mt-1">{isAr ? 'ترقبوا الألعاب المجانية قريباً' : 'Stay tuned for free games'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? 'مشاركة رابط الإحالة' : 'Share Referral Link'}</DialogTitle>
            <DialogDescription>{isAr ? 'شارك الرابط للحصول على مكافآت' : 'Share to earn rewards'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{isAr ? 'كود الإحالة' : 'Referral Code'}</p>
              <Input value={referralCode} readOnly className="font-mono font-bold" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">{isAr ? 'رابط الإحالة' : 'Referral Link'}</p>
              <Input value={referralLink} readOnly className="font-mono text-sm" dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={copyCode} variant="outline">
                <Copy className="w-4 h-4 me-2" />
                {isAr ? 'نسخ الكود' : 'Copy Code'}
              </Button>
              <Button onClick={copyLink}>
                <Link2 className="w-4 h-4 me-2" />
                {isAr ? 'نسخ الرابط' : 'Copy Link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
