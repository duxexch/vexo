import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Users, ChevronRight } from "lucide-react";

interface PublicGame {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  thumbnailUrl?: string | null;
  category?: string;
  minPlayers?: number;
  maxPlayers?: number;
  totalGamesPlayed?: number;
}

export default function GameLandingPage() {
  const { language } = useI18n();
  const isAr = language === "ar";
  const [, params] = useRoute("/game/:slug");
  const slug = (params?.slug || "").toLowerCase();

  const { data, isLoading, isError } = useQuery<{ game: PublicGame }>({
    queryKey: [`/api/public/games/${slug}`],
    enabled: !!slug,
  });

  const { data: lbData } = useQuery<{ players: Array<{ username: string; nickname?: string | null }> }>({
    queryKey: [`/api/public/leaderboard/${slug}`],
    enabled: !!slug,
  });

  const { data: matchesData } = useQuery<{ matches: Array<{ id: string; endedAt: string | null }> }>({
    queryKey: [`/api/public/games/${slug}/recent-matches`],
    enabled: !!slug,
  });

  const game = data?.game;
  const topPlayers = (lbData?.players || []).slice(0, 10);
  const recentMatches = (matchesData?.matches || []).slice(0, 10);
  const name = game ? (isAr ? game.nameAr : game.nameEn) : slug;
  const description = game ? (isAr ? game.descriptionAr : game.descriptionEn) : "";

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="page-game-landing">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">{isAr ? "الرئيسية" : "Home"}</Link>
        <span className="mx-2">/</span>
        <Link href="/games" className="hover:underline">{isAr ? "الألعاب" : "Games"}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" />
            {isLoading ? (isAr ? "جاري التحميل..." : "Loading...") : name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && <p className="text-destructive">{isAr ? "تعذر تحميل اللعبة." : "Could not load game."}</p>}
          {description && <p className="text-base leading-relaxed">{description}</p>}

          {game?.minPlayers && game.maxPlayers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {isAr ? `عدد اللاعبين: ${game.minPlayers}-${game.maxPlayers}` : `Players: ${game.minPlayers}-${game.maxPlayers}`}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/">
              <Button data-testid="button-play-now">
                {isAr ? "العب الآن" : "Play Now"}
              </Button>
            </Link>
            <Link href={`/leaderboard/${slug}`}>
              <Button variant="outline" data-testid="link-leaderboard">
                {isAr ? "المتصدرون" : "Leaderboard"} <ChevronRight className="w-4 h-4 mx-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {topPlayers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isAr ? `أفضل لاعبي ${name}` : `Top ${name} players`}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm" data-testid="section-top-players">
            {topPlayers.map((p) => (
              <Link
                key={p.username}
                href={`/player/${p.username}`}
                className="hover:underline"
                data-testid={`link-player-${p.username}`}
              >
                {p.nickname || p.username}
              </Link>
            ))}
            <Link href={`/leaderboard/${slug}`} className="hover:underline text-primary mt-2">
              {isAr ? "عرض كل المتصدرين" : "View full leaderboard"}
            </Link>
          </CardContent>
        </Card>
      )}

      {recentMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isAr ? `آخر مباريات ${name}` : `Recent ${name} matches`}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm" data-testid="section-recent-matches">
            {recentMatches.map((m) => (
              <Link
                key={m.id}
                href={`/match/${m.id}`}
                className="hover:underline"
                data-testid={`link-match-${m.id}`}
              >
                {isAr ? "مباراة" : "Match"} #{m.id.slice(0, 8)}
                {m.endedAt ? ` — ${new Date(m.endedAt).toLocaleDateString(isAr ? "ar" : "en")}` : ""}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "روابط ذات صلة" : "Related links"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Link href="/games/board" className="hover:underline">{isAr ? "ألعاب الطاولة" : "Board games"}</Link>
          <Link href="/games/card" className="hover:underline">{isAr ? "ألعاب الورق" : "Card games"}</Link>
          <Link href="/tournaments" className="hover:underline">{isAr ? "البطولات" : "Tournaments"}</Link>
          <Link href="/challenges" className="hover:underline">{isAr ? "التحديات" : "Challenges"}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
