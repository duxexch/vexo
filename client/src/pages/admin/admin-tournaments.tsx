import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GameConfigIcon } from "@/components/GameConfigIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { buildGameConfig, FALLBACK_GAME_CONFIG, getGameIconSurfaceClass, getGameIconToneClass, type MultiplayerGameFromAPI } from "@/lib/game-config";
import {
  Trophy,
  Plus,
  Play,
  Users,
  DollarSign,
  Calendar,
  Loader2,
  Crown,
  Swords,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  Trash2,
  Ban,
  ArrowRight,
} from "lucide-react";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

const GAME_TYPES = [
  { value: "chess", label: "Chess", labelAr: "شطرنج" },
  { value: "backgammon", label: "Backgammon", labelAr: "طاولة" },
  { value: "dominoes", label: "Dominoes", labelAr: "دومينو" },
  { value: "baloot", label: "Baloot", labelAr: "بلوت" },
  { value: "tarneeb", label: "Tarneeb", labelAr: "طرنيب" },
  { value: "snake", label: "Snake Arena", labelAr: "أرينا الثعبان" },
];

const TOURNAMENT_GAME_TYPE_ALIASES: Record<string, string> = {
  dominoes: "domino",
};

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  registration: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  in_progress: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  completed: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  registration: "Registration Open",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface TournamentItem {
  id: string;
  name: string;
  nameAr?: string;
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  minPlayers: number;
  entryFee: string;
  prizePool: string;
  startsAt: string | null;
  endsAt: string | null;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  participantCount?: number;
  description?: string;
  descriptionAr?: string;
  [key: string]: unknown;
}

interface TournamentParticipant {
  id: string;
  userId: string;
  username?: string;
  nickname?: string;
  seed?: number;
  wins?: number;
  losses?: number;
  isEliminated?: boolean;
  placement?: number;
}

interface TournamentMatch {
  id: string;
  round: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: string;
  player1Score?: number;
  player2Score?: number;
}

interface TournamentDetail extends TournamentItem {
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
}

interface TournamentForm {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  gameType: string;
  format: string;
  maxPlayers: number;
  minPlayers: number;
  entryFee: string;
  prizePool: string;
  startsAt: string;
  endsAt: string;
  registrationStartsAt: string;
  registrationEndsAt: string;
}

const defaultForm: TournamentForm = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  gameType: "chess",
  format: "single_elimination",
  maxPlayers: 16,
  minPlayers: 4,
  entryFee: "5.00",
  prizePool: "0",
  startsAt: "",
  endsAt: "",
  registrationStartsAt: "",
  registrationEndsAt: "",
};

export default function AdminTournamentsPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TournamentItem | null>(null);
  const [form, setForm] = useState<TournamentForm>({ ...defaultForm });
  const [filter, setFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<TournamentItem | null>(null);

  const { data: multiplayerGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ["/api/multiplayer-games"],
    staleTime: 60000,
  });

  const tournamentGameConfig = useMemo(
    () => ({ ...FALLBACK_GAME_CONFIG, ...buildGameConfig(multiplayerGames) }),
    [multiplayerGames],
  );

  const resolveTournamentGameConfig = (gameType?: string | null) => {
    const normalizedType = TOURNAMENT_GAME_TYPE_ALIASES[String(gameType || "")] || String(gameType || "");
    return tournamentGameConfig[normalizedType] || tournamentGameConfig.chess;
  };

  // Fetch tournaments using ADMIN endpoint
  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ["/api/admin/tournaments", filter],
    queryFn: () => {
      const params = filter !== "all" ? `?status=${filter}` : "";
      return adminFetch(`/api/admin/tournaments${params}`);
    },
  });

  // Fetch tournament detail using ADMIN endpoint
  const { data: tournamentDetail } = useQuery({
    queryKey: ["/api/admin/tournaments", selectedTournament?.id],
    queryFn: () => adminFetch(`/api/admin/tournaments/${selectedTournament!.id}`),
    enabled: !!selectedTournament?.id,
  });

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: (data: TournamentForm) =>
      adminFetch("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          nameAr: data.nameAr,
          description: data.description || null,
          descriptionAr: data.descriptionAr || null,
          gameType: data.gameType,
          format: data.format,
          maxPlayers: Number(data.maxPlayers),
          minPlayers: Number(data.minPlayers),
          entryFee: data.entryFee || "0.00",
          prizePool: data.prizePool || "0.00",
          startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : null,
          endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
          registrationStartsAt: data.registrationStartsAt ? new Date(data.registrationStartsAt).toISOString() : null,
          registrationEndsAt: data.registrationEndsAt ? new Date(data.registrationEndsAt).toISOString() : null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Tournament Created", description: "Tournament has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      setShowCreate(false);
      setForm({ ...defaultForm });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Start tournament mutation
  const startMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/tournaments/${id}/start`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Tournament Started", description: "Bracket has been generated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      setSelectedTournament(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Change status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/api/admin/tournaments/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, vars) => {
      toast({
        title: "Status Updated",
        description: `Tournament status changed to ${STATUS_LABELS[vars.status] || vars.status}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      setSelectedTournament(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete tournament mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/tournaments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Tournament Deleted", description: "Tournament and all data removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      setSelectedTournament(null);
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Report match result mutation
  const [resultForm, setResultForm] = useState<{ matchId: string; winnerId: string; p1Score: string; p2Score: string }>({
    matchId: "",
    winnerId: "",
    p1Score: "0",
    p2Score: "0",
  });

  const reportResultMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/api/admin/tournaments/matches/${resultForm.matchId}/result`, {
        method: "POST",
        body: JSON.stringify({
          winnerId: resultForm.winnerId,
          player1Score: parseInt(resultForm.p1Score) || 0,
          player2Score: parseInt(resultForm.p2Score) || 0,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Result Recorded", description: "Match result has been saved and bracket updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      setResultForm({ matchId: "", winnerId: "", p1Score: "0", p2Score: "0" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tournamentList: TournamentItem[] = Array.isArray(tournaments) ? tournaments : [];

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Tournament Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, manage, and run tournaments
          </p>
        </div>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tournament
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", count: tournamentList.length, icon: Trophy, color: "text-primary" },
          { label: "Registration", count: tournamentList.filter((t) => t.status === "registration").length, icon: Users, color: "text-emerald-500" },
          { label: "In Progress", count: tournamentList.filter((t) => t.status === "in_progress").length, icon: Play, color: "text-amber-500" },
          { label: "Completed", count: tournamentList.filter((t) => t.status === "completed").length, icon: CheckCircle, color: "text-gray-500" },
          { label: "Cancelled", count: tournamentList.filter((t) => t.status === "cancelled").length, icon: XCircle, color: "text-red-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-lg font-bold">{stat.count}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max min-w-full gap-2">
          {["all", "upcoming", "registration", "in_progress", "completed", "cancelled"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              className="min-h-[40px] whitespace-nowrap"
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABELS[s] || s}
            </Button>
          ))}
        </div>
      </div>

      {/* Tournament List */}
      {tournamentList.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No tournaments found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tournamentList.map((tournament) => {
            const gameInfo = GAME_TYPES.find((g) => g.value === tournament.gameType);
            const gameConfig = resolveTournamentGameConfig(tournament.gameType);
            return (
              <Card
                key={tournament.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTournament(tournament)}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-muted/40 p-1 ${getGameIconSurfaceClass(gameConfig)}`}>
                    <GameConfigIcon
                      config={gameConfig}
                      fallbackIcon={gameConfig.icon}
                      className={gameConfig.iconUrl ? "h-full w-full" : `h-8 w-8 ${getGameIconToneClass(gameConfig.color)}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{tournament.name}</h3>
                      <Badge variant="outline" className={STATUS_COLORS[tournament.status] || ""}>
                        {STATUS_LABELS[tournament.status] || tournament.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {tournament.participantCount || 0}/{tournament.maxPlayers}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        ${tournament.entryFee} entry
                      </span>
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        ${tournament.prizePool} prize
                      </span>
                      {tournament.startsAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(tournament.startsAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="hidden sm:block h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* =================== CREATE TOURNAMENT DIALOG =================== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name (EN) *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Chess Championship"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name (AR) *</Label>
                <Input
                  value={form.nameAr}
                  onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  placeholder="بطولة الشطرنج"
                  dir="rtl"
                />
              </div>
            </div>

            {/* Descriptions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Description (EN)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Tournament description..."
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (AR)</Label>
                <Textarea
                  value={form.descriptionAr}
                  onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                  placeholder="وصف البطولة..."
                  dir="rtl"
                  rows={2}
                />
              </div>
            </div>

            {/* Game Type & Format */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Game Type *</Label>
                <Select value={form.gameType} onValueChange={(v) => setForm({ ...form, gameType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAME_TYPES.map((g) => {
                      const gameConfig = resolveTournamentGameConfig(g.value);

                      return (
                        <SelectItem key={g.value} value={g.value}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border p-0.5 ${getGameIconSurfaceClass(gameConfig)}`}>
                              <GameConfigIcon
                                config={gameConfig}
                                fallbackIcon={gameConfig.icon}
                                className={gameConfig.iconUrl ? "h-full w-full" : `h-4 w-4 ${getGameIconToneClass(gameConfig.color)}`}
                              />
                            </span>
                            <span>{g.label}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {(() => {
                    const selectedGameConfig = resolveTournamentGameConfig(form.gameType);
                    const selectedGameMeta = GAME_TYPES.find((g) => g.value === form.gameType);

                    return (
                      <>
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border p-0.5 ${getGameIconSurfaceClass(selectedGameConfig)}`}>
                          <GameConfigIcon
                            config={selectedGameConfig}
                            fallbackIcon={selectedGameConfig.icon}
                            className={selectedGameConfig.iconUrl ? "h-full w-full" : `h-4 w-4 ${getGameIconToneClass(selectedGameConfig.color)}`}
                          />
                        </span>
                        <span>{selectedGameMeta?.label || selectedGameConfig.name}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_elimination">Single Elimination</SelectItem>
                    <SelectItem value="double_elimination">Double Elimination</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="swiss">Swiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Player Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Players</Label>
                <Input
                  type="number"
                  value={form.minPlayers}
                  onChange={(e) => setForm({ ...form, minPlayers: parseInt(e.target.value) || 2 })}
                  min={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Players</Label>
                <Input
                  type="number"
                  value={form.maxPlayers}
                  onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 4 })}
                  min={4}
                />
              </div>
            </div>

            {/* Entry Fee & Prize Pool */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Entry Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.entryFee}
                  onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prize Pool ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prizePool}
                  onChange={(e) => setForm({ ...form, prizePool: e.target.value })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">Base prize pool (entry fees added automatically)</p>
              </div>
            </div>

            {/* Registration Dates */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Registration Period
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Registration Opens</Label>
                  <Input
                    type="datetime-local"
                    value={form.registrationStartsAt}
                    onChange={(e) => setForm({ ...form, registrationStartsAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Registration Closes</Label>
                  <Input
                    type="datetime-local"
                    value={form.registrationEndsAt}
                    onChange={(e) => setForm({ ...form, registrationEndsAt: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Tournament Dates */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" /> Tournament Schedule
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date & Time *</Label>
                  <Input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Auto-set when tournament completes</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="min-h-[44px] w-full sm:w-auto" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.name || !form.nameAr || !form.gameType}
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                "Create Tournament"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================== TOURNAMENT DETAIL DIALOG =================== */}
      <Dialog open={!!selectedTournament} onOpenChange={(open) => !open && setSelectedTournament(null)}>
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTournament && (() => {
                const selectedGameConfig = resolveTournamentGameConfig(selectedTournament.gameType);

                return (
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border p-1 ${getGameIconSurfaceClass(selectedGameConfig)}`}>
                    <GameConfigIcon
                      config={selectedGameConfig}
                      fallbackIcon={selectedGameConfig.icon}
                      className={selectedGameConfig.iconUrl ? "h-full w-full" : `h-5 w-5 ${getGameIconToneClass(selectedGameConfig.color)}`}
                    />
                  </span>
                );
              })()}
              {selectedTournament?.name}
              {selectedTournament?.nameAr && (
                <span className="text-muted-foreground text-sm font-normal">
                  ({selectedTournament.nameAr})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {tournamentDetail && (
            <div className="space-y-4">
              {(() => {
                const detailGameConfig = resolveTournamentGameConfig(tournamentDetail.gameType);
                const detailGameMeta = GAME_TYPES.find((g) => g.value === tournamentDetail.gameType);

                return (
                  <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-3">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border p-1 ${getGameIconSurfaceClass(detailGameConfig)}`}>
                      <GameConfigIcon
                        config={detailGameConfig}
                        fallbackIcon={detailGameConfig.icon}
                        className={detailGameConfig.iconUrl ? "h-full w-full" : `h-8 w-8 ${getGameIconToneClass(detailGameConfig.color)}`}
                      />
                    </span>
                    <div>
                      <p className="font-semibold">{detailGameMeta?.label || detailGameConfig.name}</p>
                      <p className="text-sm text-muted-foreground">{detailGameMeta?.labelAr || detailGameConfig.nameAr}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Status & Info */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_COLORS[tournamentDetail.status] || ""}>
                  {STATUS_LABELS[tournamentDetail.status] || tournamentDetail.status}
                </Badge>
                <Badge variant="outline" className="gap-2">
                  {(() => {
                    const detailGameConfig = resolveTournamentGameConfig(tournamentDetail.gameType);
                    const detailGameMeta = GAME_TYPES.find((g) => g.value === tournamentDetail.gameType);

                    return (
                      <>
                        <GameConfigIcon
                          config={detailGameConfig}
                          fallbackIcon={detailGameConfig.icon}
                          className={detailGameConfig.iconUrl ? "h-4 w-4" : `h-4 w-4 ${getGameIconToneClass(detailGameConfig.color)}`}
                        />
                        {detailGameMeta?.label || detailGameConfig.name}
                      </>
                    );
                  })()}
                </Badge>
                <Badge variant="outline">{tournamentDetail.format?.replace("_", " ")}</Badge>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <Users className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                    <p className="text-lg font-bold">{tournamentDetail.participants?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      / {tournamentDetail.maxPlayers} Players
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <DollarSign className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <p className="text-lg font-bold">${tournamentDetail.entryFee}</p>
                    <p className="text-xs text-muted-foreground">Entry Fee</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <Trophy className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                    <p className="text-lg font-bold">${tournamentDetail.prizePool}</p>
                    <p className="text-xs text-muted-foreground">Prize Pool</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <Swords className="h-4 w-4 mx-auto mb-1 text-orange-500" />
                    <p className="text-lg font-bold">
                      {tournamentDetail.currentRound || 0}/{tournamentDetail.totalRounds || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Rounds</p>
                  </CardContent>
                </Card>
              </div>

              {/* Dates Info */}
              <Card>
                <CardContent className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Registration:</span>{" "}
                      {formatDate(tournamentDetail.registrationStartsAt)} — {formatDate(tournamentDetail.registrationEndsAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tournament:</span>{" "}
                      {formatDate(tournamentDetail.startsAt)} — {formatDate(tournamentDetail.endsAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ===== ADMIN ACTIONS ===== */}
              <div className="flex gap-2 flex-wrap">
                {/* Open Registration */}
                {tournamentDetail.status === "upcoming" && (
                  <Button
                    className="min-h-[44px]"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: tournamentDetail.id, status: "registration" })}
                    disabled={statusMutation.isPending}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" /> Open Registration
                  </Button>
                )}

                {/* Start Tournament (from registration or upcoming) */}
                {(tournamentDetail.status === "registration" || tournamentDetail.status === "upcoming") && (
                  <Button
                    className="min-h-[44px]"
                    onClick={() => startMutation.mutate(tournamentDetail.id)}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting...</>
                    ) : (
                      <><Play className="h-4 w-4 mr-2" /> Start Tournament</>
                    )}
                  </Button>
                )}

                {/* Cancel (for upcoming, registration, or in_progress) */}
                {["upcoming", "registration", "in_progress"].includes(tournamentDetail.status) && (
                  <Button
                    className="min-h-[44px]"
                    variant="destructive"
                    onClick={() => statusMutation.mutate({ id: tournamentDetail.id, status: "cancelled" })}
                    disabled={statusMutation.isPending}
                  >
                    <Ban className="h-4 w-4 mr-2" /> Cancel Tournament
                  </Button>
                )}

                {/* Delete (always available) */}
                <Button
                  variant="outline"
                  className="min-h-[44px] text-red-500 border-red-500/30 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(tournamentDetail);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              </div>

              {/* Participants */}
              {tournamentDetail.participants?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Participants ({tournamentDetail.participants.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(tournamentDetail as TournamentDetail).participants.map((p: TournamentParticipant, idx: number) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-6 text-center">
                              #{p.seed || idx + 1}
                            </span>
                            <span className="font-medium">{p.nickname || p.username || p.userId}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {p.wins || 0}W - {p.losses || 0}L
                            </span>
                            {p.isEliminated && (
                              <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
                                Eliminated
                              </Badge>
                            )}
                            {p.placement === 1 && (
                              <Badge className="bg-amber-500 text-xs">
                                <Crown className="h-3 w-3 mr-1" /> Winner
                              </Badge>
                            )}
                            {p.placement === 2 && (
                              <Badge variant="outline" className="text-xs">2nd</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Matches / Bracket */}
              {tournamentDetail.matches?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Matches ({tournamentDetail.matches.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2 max-h-64 overflow-y-auto">
                    {(tournamentDetail as TournamentDetail).matches.map((match: TournamentMatch) => {
                      const p1 = (tournamentDetail as TournamentDetail).participants?.find((p) => p.userId === match.player1Id);
                      const p2 = (tournamentDetail as TournamentDetail).participants?.find((p) => p.userId === match.player2Id);
                      const isComplete = match.status === "completed";
                      const isBye = match.status === "bye";
                      const canReport =
                        match.status === "pending" && match.player1Id && match.player2Id;

                      return (
                        <div
                          key={match.id}
                          className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 rounded-lg border text-sm ${isComplete || isBye ? "bg-muted/30" : canReport ? "bg-amber-500/5 border-amber-500/30" : ""
                            }`}
                        >
                          <div className="text-xs text-muted-foreground w-8">R{match.round}</div>
                          <div className="flex-1 flex items-center gap-2">
                            <span
                              className={
                                match.winnerId === match.player1Id ? "font-bold text-primary" : ""
                              }
                            >
                              {p1?.nickname || p1?.username || match.player1Id || "BYE"}
                            </span>
                            {isComplete && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {match.player1Score}-{match.player2Score}
                              </span>
                            )}
                            <span className="text-muted-foreground">vs</span>
                            <span
                              className={
                                match.winnerId === match.player2Id ? "font-bold text-primary" : ""
                              }
                            >
                              {p2?.nickname || p2?.username || match.player2Id || "TBD"}
                            </span>
                          </div>
                          {isComplete || isBye ? (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1 text-primary" />
                              {isBye ? "Bye" : "Done"}
                            </Badge>
                          ) : canReport ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[40px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setResultForm({
                                  matchId: match.id,
                                  winnerId: "",
                                  p1Score: "0",
                                  p2Score: "0",
                                });
                              }}
                            >
                              Report Result
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" /> Waiting
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =================== REPORT RESULT DIALOG =================== */}
      <Dialog
        open={!!resultForm.matchId}
        onOpenChange={(open) => !open && setResultForm({ matchId: "", winnerId: "", p1Score: "0", p2Score: "0" })}
      >
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Match Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const match = (tournamentDetail as TournamentDetail | undefined)?.matches?.find(
                (m) => m.id === resultForm.matchId
              );
              if (!match) return null;
              const p1 = (tournamentDetail as TournamentDetail | undefined)?.participants?.find(
                (p) => p.userId === match.player1Id
              );
              const p2 = (tournamentDetail as TournamentDetail | undefined)?.participants?.find(
                (p) => p.userId === match.player2Id
              );
              return (
                <>
                  <Label>Select Winner</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant={resultForm.winnerId === match.player1Id ? "default" : "outline"}
                      className="min-h-[56px] flex-col gap-1"
                      onClick={() => setResultForm({ ...resultForm, winnerId: match.player1Id || "" })}
                    >
                      <Crown className="h-4 w-4" />
                      {p1?.nickname || p1?.username || "Player 1"}
                    </Button>
                    <Button
                      variant={resultForm.winnerId === match.player2Id ? "default" : "outline"}
                      className="min-h-[56px] flex-col gap-1"
                      onClick={() => setResultForm({ ...resultForm, winnerId: match.player2Id || "" })}
                    >
                      <Crown className="h-4 w-4" />
                      {p2?.nickname || p2?.username || "Player 2"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{p1?.nickname || p1?.username || "Player 1"} Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={resultForm.p1Score}
                        onChange={(e) => setResultForm({ ...resultForm, p1Score: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{p2?.nickname || p2?.username || "Player 2"} Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={resultForm.p2Score}
                        onChange={(e) => setResultForm({ ...resultForm, p2Score: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              variant="outline"
              onClick={() => setResultForm({ matchId: "", winnerId: "", p1Score: "0", p2Score: "0" })}
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => reportResultMutation.mutate()}
              disabled={reportResultMutation.isPending || !resultForm.winnerId}
            >
              {reportResultMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                "Submit Result"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================== DELETE CONFIRMATION =================== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all associated data (participants, matches).
              {parseFloat(deleteTarget?.entryFee || "0") > 0 && (
                <span className="block mt-2 text-amber-500 font-medium">
                  Entry fees will be refunded to all participants.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Tournament"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
