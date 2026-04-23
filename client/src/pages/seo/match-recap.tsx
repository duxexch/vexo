import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PublicMatch {
  id: string;
  gameType: string;
  winnerId: string | null;
  winningTeam: number | null;
  startedAt: string | null;
  endedAt: string | null;
  players: Array<{ id: string; username: string; nickname: string | null; profilePicture: string | null }>;
}

const GAME_NAMES: Record<string, { ar: string; en: string }> = {
  chess: { ar: "الشطرنج", en: "Chess" },
  backgammon: { ar: "الطاولة", en: "Backgammon" },
  domino: { ar: "الدومينو", en: "Dominoes" },
  tarneeb: { ar: "الطرنيب", en: "Tarneeb" },
  baloot: { ar: "البلوت", en: "Baloot" },
  languageduel: { ar: "تحدي اللغات", en: "Language Duel" },
};

export default function MatchRecapPage() {
  const { language } = useI18n();
  const isAr = language === "ar";
  const [, params] = useRoute("/match/:id");
  const id = params?.id || "";

  const { data, isLoading, isError } = useQuery<{ match: PublicMatch }>({
    queryKey: [`/api/public/matches/${id}`],
    enabled: !!id,
  });

  const match = data?.match;
  const gameLabel = match ? (GAME_NAMES[match.gameType.toLowerCase()] || { ar: match.gameType, en: match.gameType }) : null;
  const gameName = gameLabel ? (isAr ? gameLabel.ar : gameLabel.en) : "";

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="page-match-recap">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">{isAr ? "الرئيسية" : "Home"}</Link>
        <span className="mx-2">/</span>
        {match && (
          <>
            <Link href={`/game/${match.gameType.toLowerCase()}`} className="hover:underline">{gameName}</Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-foreground">{isAr ? "ملخص المباراة" : "Match recap"}</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {isLoading ? (isAr ? "جاري التحميل..." : "Loading...") : `${isAr ? "مباراة" : "Match"} ${gameName}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && <p className="text-destructive">{isAr ? "تعذر تحميل المباراة." : "Could not load match."}</p>}
          {match && (
            <>
              <div className="text-sm text-muted-foreground">
                {match.endedAt ? new Date(match.endedAt).toLocaleString(isAr ? "ar" : "en") : ""}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {match.players.map((p) => (
                  <Link key={p.id} href={`/player/${encodeURIComponent(p.username)}`}>
                    <div className={`flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 ${match.winnerId === p.id ? "border-primary" : ""}`} data-testid={`player-${p.username}`}>
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={p.profilePicture || undefined} alt={p.nickname || p.username} />
                        <AvatarFallback>{(p.nickname || p.username).slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{p.nickname || p.username}</div>
                        <div className="text-xs text-muted-foreground">@{p.username}</div>
                      </div>
                      {match.winnerId === p.id && (
                        <span className="text-xs font-bold text-primary">{isAr ? "الفائز" : "Winner"}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
