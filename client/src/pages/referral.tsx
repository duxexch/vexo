import { useQuery } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Copy,
  Share2,
  Gift,
  UserPlus,
  CheckCircle,
  Award,
  Link2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const REFERRAL_REWARDS = [
  { friends: 1, reward: "$1.00" },
  { friends: 3, reward: "$3.00" },
  { friends: 5, reward: "$5.00" },
  { friends: 10, reward: "$15.00" },
  { friends: 25, reward: "$50.00" },
];

export default function ReferralPage() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const { t, language, dir } = useI18n();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Fetch referral stats
  const { data: referralData, isLoading } = useQuery({
    queryKey: ["/api/me/referrals"],
    queryFn: async () => {
      const res = await fetch("/api/me/referrals", { headers });
      if (!res.ok) return { referralCount: 0, referrals: [] };
      return res.json();
    },
    enabled: !!user?.id,
  });

  const referralCode = user?.accountId || user?.id?.slice(0, 8) || "VEXUSER";
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;
  const referralCount = referralData?.referralCount || 0;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: t('referral.copied'),
        description: t('referral.copiedDesc'),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t('referral.copyError'),
        description: t('referral.copyFailed'),
        variant: "destructive",
      });
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('referral.shareTitle'),
          text: t('referral.shareText'),
          url: referralLink,
        });
      } catch {
        // User cancelled sharing
      }
    } else {
      copyToClipboard(referralLink);
    }
  };

  // Find current tier based on referral count
  const currentTier = REFERRAL_REWARDS.reduce((prev, tier) => {
    return referralCount >= tier.friends ? tier : prev;
  }, REFERRAL_REWARDS[0]);
  const nextTier = REFERRAL_REWARDS.find((t) => t.friends > referralCount);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto" dir={dir}>
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          {t('referral.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('referral.description')}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{referralCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('referral.friendsInvited')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Gift className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{currentTier?.reward || "$0"}</p>
            <p className="text-xs text-muted-foreground">
              {t('referral.currentReward')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Award className="h-5 w-5 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold">{nextTier?.friends || "MAX"}</p>
            <p className="text-xs text-muted-foreground">
              {t('referral.nextGoal')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Referral Link */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {t('referral.yourLink')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={referralLink}
              readOnly
              className="font-mono text-sm"
              onClick={() => copyToClipboard(referralLink)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(referralLink)}
              className="shrink-0"
            >
              {copied ? <CheckCircle className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={shareLink}>
              <Share2 className="h-4 w-4 me-2" />
              {t('referral.shareLink')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(referralCode)}>
              <Copy className="h-4 w-4 me-2" />
              {t('referral.copyCode')}: {referralCode}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reward Milestones */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" />
            {t('referral.milestones')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {REFERRAL_REWARDS.map((tier, idx) => {
              const isCompleted = referralCount >= tier.friends;
              const isCurrent = !isCompleted && (idx === 0 || referralCount >= REFERRAL_REWARDS[idx - 1].friends);

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isCompleted
                      ? "border-primary/30 bg-primary/5"
                      : isCurrent
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-muted bg-muted/20 opacity-60"
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    isCompleted ? "bg-primary/10" : isCurrent ? "bg-amber-500/10" : "bg-muted"
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    ) : (
                      <UserPlus className={`h-5 w-5 ${isCurrent ? "text-amber-500" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {t('referral.inviteFriends', { count: String(tier.friends) })}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-muted-foreground">
                        {t('referral.remaining', { count: String(tier.friends - referralCount) })}
                      </p>
                    )}
                  </div>
                  <Badge variant={isCompleted ? "default" : "outline"} className={
                    isCompleted ? "" : isCurrent ? "border-amber-500/50 text-amber-500" : ""
                  }>
                    {tier.reward}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Referrals */}
      {referralData?.referrals?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('referral.referredFriends')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referralData.referrals.map((ref: Record<string, unknown>, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {String(ref.username || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="font-medium">{String(ref.username)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ref.createdAt as string).toLocaleDateString(language === "ar" ? "ar-SA" : undefined)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* How it Works */}
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">
            {t('referral.howItWorks')}
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>{t('referral.step1')}</li>
            <li>{t('referral.step2')}</li>
            <li>{t('referral.step3')}</li>
            <li>{t('referral.step4')}</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
