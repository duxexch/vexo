import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { GameConfigIcon } from "@/components/GameConfigIcon";
import { BackButton } from "@/components/BackButton";
import {
  buildGameConfig,
  resolveGameConfigEntry,
  type GameConfigItem,
  type MultiplayerGameFromAPI,
} from "@/lib/game-config";
import { Copy, Share2, Trophy, Swords, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TournamentLite {
  id: string;
  shareSlug?: string | null;
  name?: string | null;
  nameAr?: string | null;
  status?: string | null;
  gameType?: string | null;
  coverImageUrl?: string | null;
}

type ShareTarget = "whatsapp" | "telegram" | "twitter" | "facebook";

function buildShareUrl(target: ShareTarget, link: string, message: string): string {
  const u = encodeURIComponent(link);
  const m = encodeURIComponent(message);
  switch (target) {
    case "whatsapp":
      return `https://wa.me/?text=${m}%20${u}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${m}`;
    case "twitter":
      return `https://twitter.com/intent/tweet?url=${u}&text=${m}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
  }
}

function ShareRow({
  title,
  subtitle,
  iconNode,
  link,
  shareMessage,
  onCopied,
  testIdPrefix,
}: {
  title: string;
  subtitle?: string;
  iconNode: React.ReactNode;
  link: string;
  shareMessage: string;
  onCopied: () => void;
  testIdPrefix: string;
}) {
  const { language } = useI18n();
  const isAr = language === "ar";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      onCopied();
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        onCopied();
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: shareMessage, url: link });
        return;
      } catch {
        // User cancelled or unsupported — fall through to copy
      }
    }
    handleCopy();
  };

  return (
    <div
      className="rounded-lg border bg-card p-3 space-y-2.5"
      data-testid={`row-${testIdPrefix}`}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-10 w-10 rounded-md border bg-background/70 flex items-center justify-center overflow-hidden">
          {iconNode}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate" title={title}>
            {title}
          </div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground truncate" title={subtitle}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-md bg-muted/60 border border-border/50 px-2.5 py-2 flex items-center justify-between gap-2">
        <span
          className="text-xs font-mono truncate min-w-0 flex-1 select-all"
          title={link}
          dir="ltr"
        >
          {link}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={handleCopy}
          data-testid={`button-copy-${testIdPrefix}`}
        >
          <Copy className="h-3.5 w-3.5 me-1" />
          {isAr ? "نسخ" : "Copy"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={handleNativeShare}
          data-testid={`button-share-${testIdPrefix}`}
        >
          <Share2 className="h-3.5 w-3.5 me-1" />
          {isAr ? "مشاركة" : "Share"}
        </Button>
        <a
          href={buildShareUrl("whatsapp", link, shareMessage)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
          data-testid={`button-whatsapp-${testIdPrefix}`}
        >
          WhatsApp
        </a>
        <a
          href={buildShareUrl("telegram", link, shareMessage)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-sky-500/10 px-2.5 text-xs font-medium text-sky-600 hover:bg-sky-500/20 dark:text-sky-400"
          data-testid={`button-telegram-${testIdPrefix}`}
        >
          Telegram
        </a>
        <a
          href={buildShareUrl("twitter", link, shareMessage)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-foreground/5 px-2.5 text-xs font-medium hover:bg-foreground/10"
          data-testid={`button-twitter-${testIdPrefix}`}
        >
          X
        </a>
        <a
          href={buildShareUrl("facebook", link, shareMessage)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-blue-500/10 px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
          data-testid={`button-facebook-${testIdPrefix}`}
        >
          Facebook
        </a>
      </div>
    </div>
  );
}

export default function ShareLinksPage() {
  const { language, dir } = useI18n();
  const { toast } = useToast();
  const isAr = language === "ar";

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Prefer the production canonical when available so links look clean
      // when shared (avoid replit preview hosts in copied URLs).
      const isPreview = /\.replit\.|localhost|127\.0\.0\.1/.test(window.location.hostname);
      setOrigin(isPreview ? "https://vixo.click" : window.location.origin);
    }
  }, []);

  const { data: apiGames, isLoading: gamesLoading } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ["/api/multiplayer-games"],
    staleTime: 60_000,
  });

  const { data: tournaments, isLoading: tournamentsLoading } = useQuery<TournamentLite[]>({
    queryKey: ["/api/tournaments"],
    staleTime: 30_000,
  });

  const games = useMemo(() => {
    const config = buildGameConfig(apiGames);
    const entries = (apiGames || [])
      .filter((g) => g.isActive !== false)
      .map((g) => {
        const cfg = resolveGameConfigEntry(config, g.key);
        return cfg ? { key: g.key, cfg, raw: g } : null;
      })
      .filter((entry): entry is { key: string; cfg: GameConfigItem; raw: MultiplayerGameFromAPI } => entry !== null);
    return entries;
  }, [apiGames]);

  const notifyCopied = () => {
    toast({
      title: isAr ? "تم نسخ الرابط" : "Link copied",
      description: isAr ? "يمكنك لصقه في أي مكان لمشاركته" : "Paste anywhere to share it",
    });
  };

  const trimmedOrigin = origin.replace(/\/$/, "");

  return (
    <div className="min-h-[100svh] bg-background" dir={dir}>
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur px-3 py-2 flex items-center gap-2">
        <BackButton />
        <Link2 className="h-5 w-5 text-primary" />
        <h1 className="text-base font-semibold">
          {isAr ? "روابط للمشاركة" : "Share Links"}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto p-3 sm:p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "انسخ أو شارك أي رابط من هنا. اللينك يظهر صورة وتفاصيل عند مشاركته على واتساب وتليجرام وفيسبوك وX."
            : "Copy or share any link below. When shared on WhatsApp, Telegram, Facebook, or X, an image preview appears automatically."}
        </p>

        <Tabs defaultValue="games" className="space-y-3">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="games" data-testid="tab-games">
              {isAr ? "الألعاب" : "Games"}
            </TabsTrigger>
            <TabsTrigger value="tournaments" data-testid="tab-tournaments">
              {isAr ? "البطولات" : "Tournaments"}
            </TabsTrigger>
            <TabsTrigger value="hubs" data-testid="tab-hubs">
              {isAr ? "صفحات عامة" : "General"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="games" className="space-y-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Swords className="h-4 w-4" />
                  {isAr ? "روابط الألعاب" : "Game links"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {gamesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))}
                  </div>
                ) : games.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد ألعاب متاحة حاليًا" : "No games available"}
                  </div>
                ) : (
                  games.map(({ key, cfg, raw }) => {
                    const link = `${trimmedOrigin}/game/${key}`;
                    const title = isAr ? cfg.nameAr : cfg.name;
                    const message = isAr
                      ? `العب ${title} الآن على VEX 🎮`
                      : `Play ${title} now on VEX 🎮`;
                    return (
                      <ShareRow
                        key={key}
                        title={title}
                        subtitle={isAr ? cfg.descriptionAr : cfg.descriptionEn}
                        iconNode={
                          raw.thumbnailUrl ? (
                            <img
                              src={raw.thumbnailUrl}
                              alt={title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <GameConfigIcon
                              config={cfg}
                              fallbackIcon={cfg.icon}
                              className={cn("h-6 w-6")}
                            />
                          )
                        }
                        link={link}
                        shareMessage={message}
                        onCopied={notifyCopied}
                        testIdPrefix={`game-${key}`}
                      />
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tournaments" className="space-y-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  {isAr ? "روابط البطولات" : "Tournament links"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tournamentsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !tournaments || tournaments.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد بطولات منشورة حاليًا" : "No published tournaments"}
                  </div>
                ) : (
                  tournaments
                    .filter((t) => t && t.id)
                    .map((t) => {
                      const slug = t.shareSlug || t.id;
                      const link = `${trimmedOrigin}/tournaments/${slug}`;
                      const title = (isAr ? t.nameAr : t.name) || t.name || t.nameAr || "Tournament";
                      const message = isAr
                        ? `انضم إلى بطولة ${title} على VEX 🏆`
                        : `Join the ${title} tournament on VEX 🏆`;
                      return (
                        <ShareRow
                          key={t.id}
                          title={title}
                          subtitle={t.status ? `${isAr ? "الحالة" : "Status"}: ${t.status}` : undefined}
                          iconNode={
                            t.coverImageUrl ? (
                              <img
                                src={t.coverImageUrl}
                                alt={title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Trophy className="h-5 w-5 text-amber-500" />
                            )
                          }
                          link={link}
                          shareMessage={message}
                          onCopied={notifyCopied}
                          testIdPrefix={`tournament-${slug}`}
                        />
                      );
                    })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hubs" className="space-y-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  {isAr ? "روابط عامة للمنصة" : "Platform links"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ShareRow
                  title={isAr ? "الصفحة الرئيسية" : "VEX Homepage"}
                  subtitle={isAr ? "الصفحة الرئيسية للمنصة" : "Main landing page"}
                  iconNode={<Link2 className="h-5 w-5 text-primary" />}
                  link={`${trimmedOrigin}/`}
                  shareMessage={
                    isAr
                      ? "اكتشف منصة VEX للألعاب أونلاين 🎮"
                      : "Discover VEX — play online games 🎮"
                  }
                  onCopied={notifyCopied}
                  testIdPrefix="hub-home"
                />
                <ShareRow
                  title={isAr ? "كل البطولات" : "All Tournaments"}
                  subtitle={isAr ? "قائمة البطولات النشطة" : "Active tournaments hub"}
                  iconNode={<Trophy className="h-5 w-5 text-amber-500" />}
                  link={`${trimmedOrigin}/tournaments`}
                  shareMessage={
                    isAr
                      ? "تصفّح بطولات VEX 🏆"
                      : "Browse VEX tournaments 🏆"
                  }
                  onCopied={notifyCopied}
                  testIdPrefix="hub-tournaments"
                />
                <ShareRow
                  title={isAr ? "التحديات" : "Challenges"}
                  subtitle={isAr ? "تحديات اللاعبين النشطة" : "Live player challenges"}
                  iconNode={<Swords className="h-5 w-5 text-rose-500" />}
                  link={`${trimmedOrigin}/challenges`}
                  shareMessage={
                    isAr
                      ? "العب تحديات حقيقية على VEX ⚔️"
                      : "Join live challenges on VEX ⚔️"
                  }
                  onCopied={notifyCopied}
                  testIdPrefix="hub-challenges"
                />
              </CardContent>
            </Card>
            <Badge variant="outline" className="text-xs">
              {isAr
                ? "💡 رابط أي تحدي يعمل دون تسجيل دخول للمشاهدة"
                : "💡 Any challenge link works without login (view-only)"}
            </Badge>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
