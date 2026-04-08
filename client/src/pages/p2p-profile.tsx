import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  User,
  ShieldCheck,
  BadgeCheck,
  Zap,
  TrendingUp,
  Star,
  Crown,
  Award,
  Shield,
  UserCheck,
  Clock,
  CheckCircle,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  Calendar,
  MapPin,
  CreditCard,
  Wallet,
  Building2,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TraderProfile {
  id: string;
  username: string;
  p2pUsername: string;
  displayName: string;
  bio: string;
  region: string;
  verificationLevel: string;
  isOnline: boolean;
  lastSeenAt: string;
  memberSince: string;
  account?: {
    accountId: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    idVerificationStatus: string;
  } | null;
  settings?: {
    canTradeP2P: boolean;
    canCreateOffers: boolean;
    monthlyTradeLimit: string | null;
    autoReplyEnabled: boolean;
    notifyOnTrade: boolean;
    notifyOnDispute: boolean;
    notifyOnMessage: boolean;
  } | null;
  metrics: {
    totalTrades: number;
    completedTrades: number;
    cancelledTrades: number;
    completionRate: number;
    totalBuyTrades: number;
    totalSellTrades: number;
    totalVolumeUsdt: string;
    totalDisputes: number;
    disputesWon: number;
    disputesLost: number;
    disputeRate: number;
    avgReleaseTimeSeconds: number;
    avgPaymentTimeSeconds: number;
    avgResponseTimeSeconds: number;
    positiveRatings: number;
    negativeRatings: number;
    overallRating: number;
    trades30d: number;
    completion30d: number;
    volume30d: string;
    firstTradeAt: string;
    lastTradeAt: string;
  };
  badges: Array<{
    slug: string;
    name: string;
    nameAr: string;
    icon: string;
    color: string;
    earnedAt: string;
  }>;
  paymentMethods: Array<{
    id: string;
    type: string;
    name: string;
    displayLabel?: string | null;
    holderName: string;
    isVerified: boolean;
  }>;
  recentTrades: Array<{
    id: string;
    type: string;
    amount: string;
    currency: string;
    fiatAmount: string;
    counterparty: string;
    status: string;
    completedAt: string;
  }>;
}

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": ShieldCheck,
  "badge-check": BadgeCheck,
  "zap": Zap,
  "trending-up": TrendingUp,
  "star": Star,
  "crown": Crown,
  "award": Award,
  "shield": Shield,
  "user-check": UserCheck,
};

const PAYMENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  bank_transfer: Building2,
  e_wallet: Wallet,
  crypto: CreditCard,
  card: CreditCard,
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function P2PProfilePage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const params = useParams<{ userId?: string }>();
  const userId = params.userId || 'me';
  const isOwnProfile = userId === 'me' || userId === user?.id;

  const { data: profile, isLoading } = useQuery<TraderProfile>({
    queryKey: ['/api/p2p/profile', userId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/p2p/profile/${encodeURIComponent(userId)}`);
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('p2p.profile.notFound')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRatings = profile.metrics.positiveRatings + profile.metrics.negativeRatings;
  const positiveRate = totalRatings > 0
    ? (profile.metrics.positiveRatings / totalRatings) * 100
    : 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                  {profile.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold" data-testid="text-trader-name">{profile.displayName}</h1>
                  {profile.isOnline ? (
                    <Badge variant="default" className="bg-green-500">{t('p2p.profile.online')}</Badge>
                  ) : (
                    <Badge variant="secondary">{t('p2p.profile.offline')}</Badge>
                  )}
                </div>
                <p className="text-muted-foreground">@{profile.p2pUsername || profile.username}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profile.region}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {t('p2p.profile.memberSince')} {formatDistanceToNow(new Date(profile.memberSince), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
            {isOwnProfile && (
              <Link href="/p2p/settings">
                <Button variant="outline" data-testid="button-edit-profile">
                  <Settings className="h-4 w-4 me-2" />
                  {t('p2p.profile.settings')}
                </Button>
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {profile.badges.map(badge => {
              const Icon = BADGE_ICONS[badge.icon] || Shield;
              return (
                <Badge
                  key={badge.slug}
                  style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                  className="px-3 py-1"
                  data-testid={`badge-${badge.slug}`}
                >
                  <Icon className="h-4 w-4 me-1" />
                  {language === 'ar' ? badge.nameAr : badge.name}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-4 gap-4">
        <Card data-testid="card-trades-stat">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{profile.metrics.totalTrades}</p>
            <p className="text-sm text-muted-foreground">{t('p2p.profile.totalTrades')}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-completion-stat">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-500">{profile.metrics.completionRate}%</p>
            <p className="text-sm text-muted-foreground">{t('p2p.profile.completionRate')}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-volume-stat">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">${parseFloat(profile.metrics.totalVolumeUsdt).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{t('p2p.profile.totalVolume')}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-rating-stat">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              <p className="text-3xl font-bold">{profile.metrics.overallRating}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t('p2p.profile.rating')}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t('p2p.profile.overview')}</TabsTrigger>
          <TabsTrigger value="trades">{t('p2p.profile.recentTrades')}</TabsTrigger>
          <TabsTrigger value="payment">{t('p2p.profile.paymentMethods')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {isOwnProfile && profile.account && profile.settings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('p2p.settings.title')}</CardTitle>
                <CardDescription>{t('p2p.settings.description')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('auth.accountId')}</span>
                  <span className="font-medium">{profile.account.accountId || t('common.none')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.settings.idVerification')}</span>
                  <span className="font-medium">{profile.account.idVerificationStatus || t('common.none')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('auth.email')}</span>
                  <span className="font-medium">{profile.account.emailVerified ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('auth.phone')}</span>
                  <span className="font-medium">{profile.account.phoneVerified ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.trade')}</span>
                  <span className="font-medium">{profile.settings.canTradeP2P ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.createOffer')}</span>
                  <span className="font-medium">{profile.settings.canCreateOffers ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.settings.tradeLimits')}</span>
                  <span className="font-medium">{profile.settings.monthlyTradeLimit || t('common.none')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.settings.autoReply')}</span>
                  <span className="font-medium">{profile.settings.autoReplyEnabled ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.settings.tradeNotifications')}</span>
                  <span className="font-medium">{profile.settings.notifyOnTrade ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('p2p.settings.disputeNotifications')}</span>
                  <span className="font-medium">{profile.settings.notifyOnDispute ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between md:col-span-2">
                  <span className="text-muted-foreground">{t('p2p.settings.messageNotifications')}</span>
                  <span className="font-medium">{profile.settings.notifyOnMessage ? t('common.yes') : t('common.no')}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('p2p.profile.tradingStats')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.completedTrades')}</span>
                  <span className="font-medium flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    {profile.metrics.completedTrades}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.cancelledTrades')}</span>
                  <span className="font-medium flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-500" />
                    {profile.metrics.cancelledTrades}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.buyTrades')}</span>
                  <span className="font-medium flex items-center gap-1">
                    <ArrowDownRight className="h-4 w-4 text-green-500" />
                    {profile.metrics.totalBuyTrades}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.sellTrades')}</span>
                  <span className="font-medium flex items-center gap-1">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    {profile.metrics.totalSellTrades}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.trades30d')}</span>
                  <span className="font-medium">{profile.metrics.trades30d}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.volume30d')}</span>
                  <span className="font-medium">${parseFloat(profile.metrics.volume30d).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('p2p.profile.performance')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t('p2p.profile.avgReleaseTime')}</span>
                    <span className="font-medium">{formatDuration(profile.metrics.avgReleaseTimeSeconds)}</span>
                  </div>
                  <Progress value={Math.min(100, (300 - profile.metrics.avgReleaseTimeSeconds) / 3)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t('p2p.profile.avgPaymentTime')}</span>
                    <span className="font-medium">{formatDuration(profile.metrics.avgPaymentTimeSeconds)}</span>
                  </div>
                  <Progress value={Math.min(100, (600 - profile.metrics.avgPaymentTimeSeconds) / 6)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t('p2p.profile.avgResponseTime')}</span>
                    <span className="font-medium">{formatDuration(profile.metrics.avgResponseTimeSeconds)}</span>
                  </div>
                  <Progress value={Math.min(100, (120 - profile.metrics.avgResponseTimeSeconds) / 1.2)} />
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.disputes')}</span>
                  <span className="font-medium">{profile.metrics.totalDisputes}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('p2p.profile.disputeRate')}</span>
                  <span className={`font-medium ${profile.metrics.disputeRate < 2 ? 'text-green-500' : 'text-red-500'}`}>
                    {profile.metrics.disputeRate}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.profile.ratings')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8 flex-wrap">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-6 w-6 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{profile.metrics.positiveRatings}</p>
                    <p className="text-sm text-muted-foreground">{t('p2p.profile.positive')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThumbsDown className="h-6 w-6 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{profile.metrics.negativeRatings}</p>
                    <p className="text-sm text-muted-foreground">{t('p2p.profile.negative')}</p>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress
                    value={positiveRate}
                    className="h-3"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {positiveRate.toFixed(1)}% {t('p2p.profile.positiveRate')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.profile.recentTrades')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profile.recentTrades.map(trade => (
                  <div key={trade.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`trade-${trade.id}`}>
                    <div className="flex items-center gap-3">
                      <Badge variant={trade.type === 'buy' ? 'default' : 'secondary'}>
                        {trade.type === 'buy' ? <ArrowDownRight className="h-3 w-3 me-1" /> : <ArrowUpRight className="h-3 w-3 me-1" />}
                        {trade.type.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="font-medium">{trade.amount} {trade.currency}</p>
                        <p className="text-sm text-muted-foreground">{t('p2p.profile.with')} {trade.counterparty}</p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-medium">{trade.fiatAmount} EGP</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(trade.completedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.profile.paymentMethods')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profile.paymentMethods.map(method => {
                  const Icon = PAYMENT_ICONS[method.type] || CreditCard;
                  return (
                    <div key={method.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`payment-${method.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-primary/20">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{method.displayLabel?.trim() || method.name}</p>
                          {method.displayLabel?.trim() && method.displayLabel.trim() !== method.name ? (
                            <p className="text-xs text-muted-foreground">{method.name}</p>
                          ) : null}
                          <p className="text-sm text-muted-foreground">{method.holderName}</p>
                        </div>
                      </div>
                      {method.isVerified ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="h-3 w-3 me-1" />
                          {t('p2p.profile.verified')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t('p2p.profile.unverified')}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
