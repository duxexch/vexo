import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LeaderboardPlayer {
  username: string;
  nickname: string | null;
  profilePicture: string | null;
  wins: number;
  played: number;
}

const GAME_NAMES: Record<string, { ar: string; en: string }> = {
  chess: { ar: "الشطرنج", en: "Chess" },
  backgammon: { ar: "الطاولة", en: "Backgammon" },
  domino: { ar: "الدومينو", en: "Dominoes" },
  tarneeb: { ar: "الطرنيب", en: "Tarneeb" },
  baloot: { ar: "البلوت", en: "Baloot" },
  languageduel: { ar: "تحدي اللغات", en: "Language Duel" },
};

export default function LeaderboardGamePage() {
  const { language } = useI18n();
  const isAr = language === "ar";
  const [, params] = useRoute("/leaderboard/:game");
  const game = (params?.game || "").toLowerCase();
  const label = GAME_NAMES[game];
  const gameName = label ? (isAr ? label.ar : label.en) : game;

  const { data, isLoading, isError } = useQuery<{ players: LeaderboardPlayer[] }>({
    queryKey: [`/api/public/leaderboard/${game}`],
    enabled: !!game && !!label,
  });

  if (!label) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-2">{isAr ? "اللعبة غير موجودة" : "Game not found"}</h1>
        <Link href="/leaderboard" className="text-primary hover:underline">
          {isAr ? "اللوحة العامة" : "Global leaderboard"}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="page-leaderboard-game">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">{isAr ? "الرئيسية" : "Home"}</Link>
        <span className="mx-2">/</span>
        <Link href="/leaderboard" className="hover:underline">{isAr ? "المتصدرون" : "Leaderboard"}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{gameName}</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {isAr ? `متصدرو ${gameName}` : `Top ${gameName} Players`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p>{isAr ? "جاري التحميل..." : "Loading..."}</p>}
          {isError && <p className="text-destructive">{isAr ? "تعذر تحميل القائمة." : "Could not load leaderboard."}</p>}
          {data && (
            <ol className="space-y-2">
              {data.players.length === 0 && (
                <p className="text-sm text-muted-foreground">{isAr ? "لا يوجد لاعبون بعد." : "No players yet."}</p>
              )}
              {data.players.map((p, idx) => (
                <li key={p.username} className="flex items-center gap-3 rounded-lg border p-3" data-testid={`row-rank-${idx + 1}`}>
                  <span className="font-bold text-lg w-8 text-center text-muted-foreground">{idx + 1}</span>
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={p.profilePicture || undefined} alt={p.nickname || p.username} />
                    <AvatarFallback>{(p.nickname || p.username).slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link href={`/player/${encodeURIComponent(p.username)}`} className="font-medium hover:underline truncate block">
                      {p.nickname || p.username}
                    </Link>
                    <div className="text-xs text-muted-foreground">@{p.username}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{p.wins}</div>
                    <div className="text-xs text-muted-foreground">{isAr ? "فوز" : "wins"}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "متصدرو ألعاب أخرى" : "Other game leaderboards"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(GAME_NAMES).filter(([k]) => k !== game).map(([k, v]) => (
            <Link key={k} href={`/leaderboard/${k}`} className="text-sm text-primary hover:underline">
              {isAr ? v.ar : v.en}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
