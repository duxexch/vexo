import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Game } from "@shared/schema";
import { BackButton } from "@/components/BackButton";
import { useI18n } from "@/lib/i18n";
import { Search, Filter, Plus, Pencil, Trash2, Gamepad2, Loader2, Star, TrendingUp, Zap, Trophy } from "lucide-react";

export default function GamesPage() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const { toast } = useToast();
  const { t, dir } = useI18n();

  const categories = [
    { value: "all", label: t('games.allGames') },
    { value: "slots", label: t('games.categories.slots') },
    { value: "table", label: t('games.categories.table') },
    { value: "cards", label: t('games.categories.cards') },
    { value: "live", label: t('games.categories.live') },
    { value: "crash", label: t('games.categories.crash') },
  ];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "slots",
    rtp: "95.00",
    houseEdge: "5.00",
    volatility: "medium",
    minBet: "1.00",
    maxBet: "1000.00",
    status: "active",
  });

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    queryFn: async () => {
      const res = await fetch("/api/games", { headers });
      if (!res.ok) throw new Error("Failed to fetch games");
      return res.json();
    },
  });

  const filteredGames = games?.filter(game => {
    const matchesCategory = categoryFilter === "all" || game.category === categoryFilter;
    const matchesSearch = game.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }) || [];

  const mostPlayedGames = [...(games || [])].sort((a, b) => b.playCount - a.playCount).slice(0, 3);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/games", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t('common.success'), description: t('games.createSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/games/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setIsDialogOpen(false);
      setEditingGame(null);
      resetForm();
      toast({ title: t('common.success'), description: t('games.updateSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/games/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({ title: t('common.success'), description: t('games.deleteSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "slots",
      rtp: "95.00",
      houseEdge: "5.00",
      volatility: "medium",
      minBet: "1.00",
      maxBet: "1000.00",
      status: "active",
    });
  };

  const openEditDialog = (game: Game) => {
    setEditingGame(game);
    setFormData({
      name: game.name,
      description: game.description || "",
      category: game.category,
      rtp: game.rtp,
      houseEdge: game.houseEdge,
      volatility: game.volatility,
      minBet: game.minBet,
      maxBet: game.maxBet,
      status: game.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGame) {
      updateMutation.mutate({ id: editingGame.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isAdmin = user?.role === "admin";

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "slots": return <Zap className="h-4 w-4" />;
      case "table": return <Gamepad2 className="h-4 w-4" />;
      case "cards": return <Star className="h-4 w-4" />;
      case "live": return <TrendingUp className="h-4 w-4" />;
      case "crash": return <Trophy className="h-4 w-4" />;
      default: return <Gamepad2 className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="flex gap-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-[100svh] space-y-5 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_42%)] p-3 sm:space-y-6 sm:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <BackButton fallbackPath="/dashboard" />
          <div>
            <h1 className="text-2xl font-bold">{t('games.management')}</h1>
            <p className="text-sm text-muted-foreground">{t('games.managementDescription')}</p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingGame(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-game">
                <Plus className="me-2 h-4 w-4" /> {t('games.addGame')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingGame ? t('games.editGame') : t('games.addNewGame')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('games.gameName')}</Label>
                  <Input
                    data-testid="input-game-name"
                    value={formData.name}
                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('games.category')}</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slots">{t('games.categories.slots')}</SelectItem>
                        <SelectItem value="table">{t('games.categories.table')}</SelectItem>
                        <SelectItem value="cards">{t('games.categories.cards')}</SelectItem>
                        <SelectItem value="live">{t('games.categories.live')}</SelectItem>
                        <SelectItem value="crash">{t('games.categories.crash')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('games.volatilityLabel')}</Label>
                    <Select value={formData.volatility} onValueChange={(v) => setFormData(p => ({ ...p, volatility: v }))}>
                      <SelectTrigger data-testid="select-volatility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t('games.volatilityLevels.low')}</SelectItem>
                        <SelectItem value="medium">{t('games.volatilityLevels.medium')}</SelectItem>
                        <SelectItem value="high">{t('games.volatilityLevels.high')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('games.rtpPercent')}</Label>
                    <Input
                      data-testid="input-rtp"
                      type="number"
                      step="0.01"
                      value={formData.rtp}
                      onChange={(e) => setFormData(p => ({ ...p, rtp: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('games.houseEdgePercent')}</Label>
                    <Input
                      data-testid="input-house-edge"
                      type="number"
                      step="0.01"
                      value={formData.houseEdge}
                      onChange={(e) => setFormData(p => ({ ...p, houseEdge: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('games.minAmount')}</Label>
                    <Input
                      data-testid="input-min-bet"
                      type="number"
                      step="0.01"
                      value={formData.minBet}
                      onChange={(e) => setFormData(p => ({ ...p, minBet: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('games.maxAmount')}</Label>
                    <Input
                      data-testid="input-max-bet"
                      type="number"
                      step="0.01"
                      value={formData.maxBet}
                      onChange={(e) => setFormData(p => ({ ...p, maxBet: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('games.statusLabel')}</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(p => ({ ...p, status: v }))}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('games.statuses.active')}</SelectItem>
                      <SelectItem value="inactive">{t('games.statuses.inactive')}</SelectItem>
                      <SelectItem value="maintenance">{t('games.statuses.maintenance')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  data-testid="button-save-game"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
                  {editingGame ? t('games.updateGame') : t('games.createGame')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative w-full max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-games"
          placeholder={t('games.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-10"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <Button
            key={cat.value}
            variant={categoryFilter === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(cat.value)}
            data-testid={`filter-category-${cat.value}`}
            className="gap-2 shrink-0"
          >
            {cat.value !== "all" && getCategoryIcon(cat.value)}
            {cat.label}
          </Button>
        ))}
      </div>

      {mostPlayedGames.length > 0 && categoryFilter === "all" && !searchQuery && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">{t('games.mostPlayed')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mostPlayedGames.map((game, index) => (
              <Card
                key={game.id}
                data-testid={`card-featured-game-${game.id}`}
                className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-card/80 hover-elevate"
              >
                <div className="absolute top-0 end-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-bold rounded-es-lg">
                  #{index + 1}
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {getCategoryIcon(game.category)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{game.name}</CardTitle>
                      <p className="text-xs text-muted-foreground capitalize">{game.category}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('games.totalPlays')}</span>
                    <span className="font-bold text-primary">{game.playCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('games.volume')}</span>
                    <span className="font-medium">${parseFloat(game.totalVolume).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">{game.rtp}% {t('games.rtp')}</Badge>
                    <Badge
                      variant={game.status === "active" ? "default" : "secondary"}
                      className={`text-xs ${game.status === "active" ? "bg-primary" : ""}`}
                    >
                      {game.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {categoryFilter === "all" ? t('games.allGames') : categories.find(c => c.value === categoryFilter)?.label}
            </h2>
            <Badge variant="secondary" className="ms-2">{filteredGames.length}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGames.map((game) => (
            <Card
              key={game.id}
              data-testid={`card-game-${game.id}`}
              className="group hover-elevate transition-all duration-200"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                    {getCategoryIcon(game.category)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{game.name}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize">{game.category}</p>
                  </div>
                </div>
                <Badge
                  variant={game.status === "active" ? "default" : "secondary"}
                  className={game.status === "active" ? "bg-primary" : ""}
                >
                  {game.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">{game.volatility} {t('games.volatilityLabel')}</Badge>
                  <Badge variant="outline" className="text-xs">{game.rtp}% {t('games.rtp')}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground text-xs block">{t('games.minBet')}</span>
                    <span className="font-medium">${game.minBet}</span>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground text-xs block">{t('games.maxBet')}</span>
                    <span className="font-medium">${game.maxBet}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm border-t pt-3">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>{game.playCount} {t('games.plays')}</span>
                  </div>
                  <div className="text-muted-foreground">
                    ${parseFloat(game.totalVolume).toLocaleString()} {t('games.vol')}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-edit-game-${game.id}`}
                      onClick={() => openEditDialog(game)}
                      className="flex-1"
                    >
                      <Pencil className="h-4 w-4 me-2" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid={`button-delete-game-${game.id}`}
                      onClick={() => deleteMutation.mutate(game.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {filteredGames.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="p-4 rounded-full bg-muted w-fit mx-auto mb-4">
              <Gamepad2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">{t('games.noGamesFound')}</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery || categoryFilter !== "all"
                ? t('games.tryAdjusting')
                : t('games.addFirstGame')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
