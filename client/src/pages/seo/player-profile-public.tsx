import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PublicPlayer {
  username: string;
  nickname: string | null;
  profilePicture: string | null;
  gamesPlayed: number;
  gamesWon: number;
  chessWon: number;
  backgammonWon: number;
  dominoWon: number;
  tarneebWon: number;
  balootWon: number;
  currentWinStreak: number;
  longestWinStreak: number;
  createdAt: string;
}

export default function PlayerProfilePublicPage() {
  const { language } = useI18n();
  const isAr = language === "ar";
  const [, params] = useRoute("/player/:username");
  const username = params?.username || "";

  const { data, isLoading, isError } = useQuery<{ player: PublicPlayer }>({
    queryKey: [`/api/public/players/${username}`],
    enabled: !!username,
  });

  const player = data?.player;
  const display = player?.nickname || player?.username || username;

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="page-player-public">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">{isAr ? "الرئيسية" : "Home"}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{display}</span>
      </nav>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={player?.profilePicture || undefined} alt={display} />
              <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{display}</CardTitle>
              <p className="text-sm text-muted-foreground">@{player?.username || username}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <p>{isAr ? "جاري التحميل..." : "Loading..."}</p>}
          {isError && <p className="text-destructive">{isAr ? "تعذر تحميل اللاعب." : "Could not load player."}</p>}
          {player && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Stat label={isAr ? "مباريات" : "Matches"} value={player.gamesPlayed} />
              <Stat label={isAr ? "انتصارات" : "Wins"} value={player.gamesWon} />
              <Stat label={isAr ? "أطول سلسلة" : "Longest streak"} value={player.longestWinStreak} />
              <Stat label={isAr ? "شطرنج" : "Chess wins"} value={player.chessWon} />
              <Stat label={isAr ? "طاولة" : "Backgammon wins"} value={player.backgammonWon} />
              <Stat label={isAr ? "دومينو" : "Domino wins"} value={player.dominoWon} />
              <Stat label={isAr ? "طرنيب" : "Tarneeb wins"} value={player.tarneebWon} />
              <Stat label={isAr ? "بلوت" : "Baloot wins"} value={player.balootWon} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}
