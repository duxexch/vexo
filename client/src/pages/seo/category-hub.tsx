import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PublicCategory {
  slug: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  gameKeys: string[];
}

interface PublicGame {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
}

export default function CategoryHubPage() {
  const { language } = useI18n();
  const isAr = language === "ar";
  const [, params] = useRoute("/games/:category");
  const category = (params?.category || "").toLowerCase();

  const { data: catsData } = useQuery<{ categories: PublicCategory[] }>({
    queryKey: ["/api/public/categories"],
  });
  const { data: gamesData } = useQuery<{ games: PublicGame[] }>({
    queryKey: ["/api/public/games"],
  });

  const cat = catsData?.categories.find((c) => c.slug === category);
  const games = (gamesData?.games || []).filter((g) => cat?.gameKeys.includes(g.key));

  if (!catsData) {
    return <div className="max-w-3xl mx-auto p-4">{isAr ? "جاري التحميل..." : "Loading..."}</div>;
  }

  if (!cat) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-2">{isAr ? "تصنيف غير موجود" : "Category not found"}</h1>
        <Link href="/games" className="text-primary hover:underline">
          {isAr ? "تصفح كل الألعاب" : "Browse all games"}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="page-category-hub">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">{isAr ? "الرئيسية" : "Home"}</Link>
        <span className="mx-2">/</span>
        <Link href="/games" className="hover:underline">{isAr ? "الألعاب" : "Games"}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{isAr ? cat.titleAr : cat.titleEn}</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{isAr ? cat.titleAr : cat.titleEn}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base">{isAr ? cat.descriptionAr : cat.descriptionEn}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {games.map((g) => (
          <Card key={g.key} data-testid={`card-game-${g.key}`}>
            <CardHeader>
              <CardTitle className="text-lg">{isAr ? g.nameAr : g.nameEn}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {isAr ? g.descriptionAr : g.descriptionEn}
              </p>
              <Link href={`/game/${g.key}`}>
                <Button variant="outline" size="sm">
                  {isAr ? "تفاصيل اللعبة" : "Game details"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
