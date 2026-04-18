import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Upload,
  Image as ImageIcon,
  Video,
  Globe,
  GlobeLock,
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

function normalizeTournamentGameType(gameType?: string | null): string {
  const normalizedType = String(gameType || "").trim().toLowerCase();
  return TOURNAMENT_GAME_TYPE_ALIASES[normalizedType] || normalizedType;
}

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

const PRIZE_DISTRIBUTION_OPTIONS = [
  { value: "winner_take_all", label: "Winner Takes All", preview: "100" },
  { value: "top_2", label: "Top 2", preview: "70, 30" },
  { value: "top_3", label: "Top 3", preview: "50, 30, 20" },
  { value: "top_4", label: "Top 4", preview: "45, 25, 18, 12" },
  { value: "top_5", label: "Top 5", preview: "40, 25, 15, 12, 8" },
  { value: "top_8_balanced", label: "Top 8 Balanced", preview: "28, 20, 14, 10, 8, 7, 7, 6" },
  { value: "custom", label: "Custom Percentages", preview: "e.g. 45, 25, 20, 10" },
] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatDateInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 16);
}

function parseDateTimeLocal(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseCustomDistribution(rawValue: string): number[] {
  if (!rawValue.trim()) return [];
  return rawValue
    .split(",")
    .map((entry) => Number.parseFloat(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);
}

function slugifyTournament(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

interface TournamentItem {
  id: string;
  name: string;
  nameAr?: string;
  isPublished?: boolean;
  publishedAt?: string | null;
  shareSlug?: string | null;
  coverImageUrl?: string | null;
  promoVideoUrl?: string | null;
  gameType: string;
  format: string;
  status: string;
  maxPlayers: number;
  minPlayers: number;
  autoStartOnFull?: boolean;
  autoStartPlayerCount?: number | null;
  entryFee: string;
  prizePool: string;
  prizeDistributionMethod?: string;
  prizeDistribution?: string | null;
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
  isPublished: boolean;
  shareSlug: string;
  coverImageUrl: string;
  promoVideoUrl: string;
  gameType: string;
  format: string;
  maxPlayers: number;
  minPlayers: number;
  autoStartOnFull: boolean;
  autoStartPlayerCount: number;
  entryFee: string;
  prizePool: string;
  prizeDistributionMethod: string;
  prizeDistributionCustom: string;
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
  isPublished: true,
  shareSlug: "",
  coverImageUrl: "",
  promoVideoUrl: "",
  gameType: "chess",
  format: "single_elimination",
  maxPlayers: 16,
  minPlayers: 4,
  autoStartOnFull: false,
  autoStartPlayerCount: 4,
  entryFee: "5.00",
  prizePool: "0",
  prizeDistributionMethod: "top_3",
  prizeDistributionCustom: "",
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

  const openCreateDialog = () => {
    const now = new Date();
    const startsAt = new Date(now.getTime() + (72 * 60 * 60 * 1000));
    const registrationStartsAt = new Date(now.getTime() + (10 * 60 * 1000));
    const registrationEndsAt = new Date(startsAt.getTime() - (2 * 60 * 60 * 1000));

    setForm({
      ...defaultForm,
      autoStartPlayerCount: defaultForm.minPlayers,
      startsAt: formatDateInputValue(startsAt),
      registrationStartsAt: formatDateInputValue(registrationStartsAt),
      registrationEndsAt: formatDateInputValue(registrationEndsAt),
    });
    setShowCreate(true);
  };

  const timelineIssues = useMemo(() => {
    const issues: string[] = [];
    const startsAt = parseDateTimeLocal(form.startsAt);
    const endsAt = parseDateTimeLocal(form.endsAt);
    const registrationOpensAt = parseDateTimeLocal(form.registrationStartsAt);
    const registrationClosesAt = parseDateTimeLocal(form.registrationEndsAt);

    if (form.minPlayers > form.maxPlayers) {
      issues.push("Min players cannot exceed max players");
    }

    if (endsAt && startsAt && endsAt.getTime() < startsAt.getTime()) {
      issues.push("Tournament end must be after start");
    }

    if (registrationOpensAt && registrationClosesAt && registrationClosesAt.getTime() < registrationOpensAt.getTime()) {
      issues.push("Registration close must be after registration open");
    }

    if (registrationClosesAt && startsAt && registrationClosesAt.getTime() > startsAt.getTime()) {
      issues.push("Registration must close before the tournament starts");
    }

    if (registrationOpensAt && startsAt && registrationOpensAt.getTime() > startsAt.getTime()) {
      issues.push("Registration cannot open after tournament start");
    }

    return issues;
  }, [
    form.endsAt,
    form.maxPlayers,
    form.minPlayers,
    form.registrationEndsAt,
    form.registrationStartsAt,
    form.startsAt,
  ]);

  const customDistributionIssues = useMemo(() => {
    if (form.prizeDistributionMethod !== "custom") return [];

    const values = parseCustomDistribution(form.prizeDistributionCustom);
    if (values.length === 0) {
      return ["Custom prize distribution is required"];
    }

    const sum = values.reduce((accumulator, value) => accumulator + value, 0);
    if (Math.abs(sum - 100) > 0.01) {
      return ["Custom prize distribution must total 100"];
    }

    return [];
  }, [form.prizeDistributionCustom, form.prizeDistributionMethod]);

  const canSubmitCreate = Boolean(
    form.name
    && form.nameAr
    && form.gameType
    && timelineIssues.length === 0
    && customDistributionIssues.length === 0,
  );

  const applySmartTimelineFix = () => {
    if (!form.startsAt) return;

    const startDate = parseDateTimeLocal(form.startsAt);
    if (!startDate) return;

    const suggestedClose = new Date(startDate.getTime() - (60 * 60 * 1000));
    const suggestedOpen = new Date(suggestedClose.getTime() - (24 * 60 * 60 * 1000));

    setForm((previous) => ({
      ...previous,
      registrationStartsAt: previous.registrationStartsAt || formatDateInputValue(suggestedOpen),
      registrationEndsAt: formatDateInputValue(suggestedClose),
    }));
  };

  const handleStartDateChange = (nextStartsAt: string) => {
    setForm((previous) => {
      const next = { ...previous, startsAt: nextStartsAt };
      const startDate = parseDateTimeLocal(nextStartsAt);
      const closeDate = parseDateTimeLocal(previous.registrationEndsAt);

      if (startDate && closeDate && closeDate.getTime() > startDate.getTime()) {
        const adjustedClose = new Date(startDate.getTime() - (15 * 60 * 1000));
        next.registrationEndsAt = formatDateInputValue(adjustedClose);
      }

      if (next.autoStartPlayerCount < next.minPlayers) {
        next.autoStartPlayerCount = next.minPlayers;
      }

      return next;
    });
  };

  const { data: multiplayerGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ["/api/multiplayer-games"],
    staleTime: 60000,
  });

  const tournamentGameConfig = useMemo(
    () => ({ ...FALLBACK_GAME_CONFIG, ...buildGameConfig(multiplayerGames) }),
    [multiplayerGames],
  );

  const resolveTournamentGameConfig = (gameType?: string | null) => {
    const normalizedType = normalizeTournamentGameType(gameType);
    return tournamentGameConfig[normalizedType] || tournamentGameConfig.chess;
  };

  const resolveTournamentGameMeta = (gameType?: string | null) => {
    const normalizedType = normalizeTournamentGameType(gameType);
    const direct = GAME_TYPES.find((g) => g.value === normalizedType);
    if (direct) return direct;

    const aliasKey = Object.keys(TOURNAMENT_GAME_TYPE_ALIASES)
      .find((key) => TOURNAMENT_GAME_TYPE_ALIASES[key] === normalizedType);
    if (aliasKey) {
      return GAME_TYPES.find((g) => g.value === aliasKey) || null;
    }

    return null;
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
          isPublished: data.isPublished,
          shareSlug: data.shareSlug || null,
          coverImageUrl: data.coverImageUrl || null,
          promoVideoUrl: data.promoVideoUrl || null,
          gameType: normalizeTournamentGameType(data.gameType),
          format: data.format,
          maxPlayers: Number(data.maxPlayers),
          minPlayers: Number(data.minPlayers),
          autoStartOnFull: Boolean(data.autoStartOnFull),
          autoStartPlayerCount: data.autoStartOnFull ? Number(data.autoStartPlayerCount) : null,
          entryFee: data.entryFee || "0.00",
          prizePool: data.prizePool || "0.00",
          prizeDistributionMethod: data.prizeDistributionMethod,
          prizeDistribution: data.prizeDistributionMethod === "custom" ? data.prizeDistributionCustom : null,
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

  const publishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      adminFetch(`/api/admin/tournaments/${id}/publish`, {
        method: "PUT",
        body: JSON.stringify({ isPublished }),
      }),
    onSuccess: (_, variables) => {
      toast({
        title: variables.isPublished ? "Tournament Published" : "Tournament Hidden",
        description: variables.isPublished
          ? "Tournament is now visible in public tournaments"
          : "Tournament has been hidden from public tournaments",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tournaments", variables.id] });
      if (selectedTournament?.id === variables.id) {
        setSelectedTournament({
          ...selectedTournament,
          isPublished: variables.isPublished,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: "image" | "video" }) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (kind === "image" && !isImage) {
        throw new Error("Please choose an image file");
      }

      if (kind === "video" && !isVideo) {
        throw new Error("Please choose a video file");
      }

      if (file.size > (10 * 1024 * 1024)) {
        throw new Error("File must be 10MB or smaller");
      }

      const fileData = await fileToDataUrl(file);
      const uploadResult = await adminFetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ fileData, fileName: file.name }),
      }) as { url?: string };

      if (!uploadResult.url) {
        throw new Error("Upload failed");
      }

      return { kind, url: uploadResult.url };
    },
    onSuccess: ({ kind, url }) => {
      setForm((previous) => ({
        ...previous,
        ...(kind === "image" ? { coverImageUrl: url } : { promoVideoUrl: url }),
      }));

      toast({
        title: kind === "image" ? "Tournament Cover Uploaded" : "Tournament Video Uploaded",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const handleCreateTournament = () => {
    if (!canSubmitCreate) {
      toast({
        title: "Cannot Create Tournament",
        description: "Fix validation issues in schedule or prize distribution first.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate(form);
  };

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
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={openCreateDialog}>
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
            const gameMeta = resolveTournamentGameMeta(tournament.gameType);
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
                      <Badge variant="outline" className={tournament.isPublished ? "text-emerald-500 border-emerald-500/30" : "text-orange-500 border-orange-500/30"}>
                        {tournament.isPublished ? "Published" : "Hidden"}
                      </Badge>
                      {tournament.autoStartOnFull && (
                        <Badge variant="outline" className="text-cyan-500 border-cyan-500/30">
                          Quick Start @{tournament.autoStartPlayerCount || tournament.minPlayers}
                        </Badge>
                      )}
                      <Badge variant="outline">{gameMeta?.label || gameConfig.name}</Badge>
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
                    {(tournament.coverImageUrl || tournament.promoVideoUrl) && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        {tournament.coverImageUrl && (
                          <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5">
                            <ImageIcon className="h-3 w-3" /> Public cover
                          </span>
                        )}
                        {tournament.promoVideoUrl && (
                          <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5">
                            <Video className="h-3 w-3" /> Promo video
                          </span>
                        )}
                      </div>
                    )}
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
            {(timelineIssues.length > 0 || customDistributionIssues.length > 0) && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 space-y-1">
                {timelineIssues.map((issue) => (
                  <p key={issue}>- {issue}</p>
                ))}
                {customDistributionIssues.map((issue) => (
                  <p key={issue}>- {issue}</p>
                ))}
                {!!form.startsAt && (
                  <Button type="button" size="sm" variant="outline" className="mt-2" onClick={applySmartTimelineFix}>
                    Fix Timeline Automatically
                  </Button>
                )}
              </div>
            )}

            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Public Visibility</h4>
                  <p className="text-xs text-muted-foreground">
                    Publish tournaments for users and sharing.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {form.isPublished ? <Globe className="h-4 w-4 text-emerald-500" /> : <GlobeLock className="h-4 w-4 text-orange-500" />}
                  <Switch
                    checked={form.isPublished}
                    onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Share Slug (optional)</Label>
                <Input
                  value={form.shareSlug}
                  onChange={(e) => setForm({ ...form, shareSlug: slugifyTournament(e.target.value) })}
                  placeholder="chess-pro-league"
                />
                <p className="text-xs text-muted-foreground">
                  Public URL: /tournaments/{form.shareSlug || slugifyTournament(form.name) || "tournament"}
                </p>
              </div>
            </div>

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name (EN) *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setForm((previous) => ({
                      ...previous,
                      name: nextName,
                      shareSlug: previous.shareSlug || slugifyTournament(nextName),
                    }));
                  }}
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
                  onChange={(e) => {
                    const nextMinPlayers = parseInt(e.target.value, 10) || 2;
                    setForm((previous) => ({
                      ...previous,
                      minPlayers: nextMinPlayers,
                      autoStartPlayerCount: Math.max(previous.autoStartPlayerCount, nextMinPlayers),
                    }));
                  }}
                  min={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Players</Label>
                <Input
                  type="number"
                  value={form.maxPlayers}
                  onChange={(e) => {
                    const nextMaxPlayers = parseInt(e.target.value, 10) || 4;
                    setForm((previous) => ({
                      ...previous,
                      maxPlayers: nextMaxPlayers,
                      autoStartPlayerCount: Math.min(previous.autoStartPlayerCount, nextMaxPlayers),
                    }));
                  }}
                  min={4}
                />
              </div>
            </div>

            {/* Quick start */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Quick Start</h4>
                  <p className="text-xs text-muted-foreground">
                    Start tournament automatically when participants reach the threshold.
                  </p>
                </div>
                <Switch
                  checked={form.autoStartOnFull}
                  onCheckedChange={(checked) => setForm({ ...form, autoStartOnFull: checked })}
                />
              </div>
              {form.autoStartOnFull && (
                <div className="space-y-1.5">
                  <Label>Auto-start player threshold</Label>
                  <Input
                    type="number"
                    value={form.autoStartPlayerCount}
                    min={form.minPlayers}
                    max={form.maxPlayers}
                    onChange={(e) => {
                      const nextValue = parseInt(e.target.value, 10) || form.minPlayers;
                      setForm({
                        ...form,
                        autoStartPlayerCount: Math.max(form.minPlayers, Math.min(form.maxPlayers, nextValue)),
                      });
                    }}
                  />
                </div>
              )}
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

            {/* Prize distribution */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4" /> Prize Distribution
              </h4>
              <div className="space-y-1.5">
                <Label>Distribution Model</Label>
                <Select
                  value={form.prizeDistributionMethod}
                  onValueChange={(value) => setForm({ ...form, prizeDistributionMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIZE_DISTRIBUTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center justify-between gap-3">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.preview}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.prizeDistributionMethod === "custom" && (
                <div className="space-y-1.5">
                  <Label>Custom Percentages</Label>
                  <Input
                    value={form.prizeDistributionCustom}
                    onChange={(e) => setForm({ ...form, prizeDistributionCustom: e.target.value })}
                    placeholder="45, 25, 20, 10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter comma-separated percentages. Total must equal 100.
                  </p>
                </div>
              )}
            </div>

            {/* Media upload */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" /> Public Media
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cover Image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0];
                      if (selectedFile) {
                        uploadMediaMutation.mutate({ file: selectedFile, kind: "image" });
                      }
                    }}
                  />
                  {form.coverImageUrl && (
                    <div className="rounded-xl border overflow-hidden">
                      <img
                        src={form.coverImageUrl}
                        alt="Tournament cover"
                        className="h-28 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Promo Video</Label>
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0];
                      if (selectedFile) {
                        uploadMediaMutation.mutate({ file: selectedFile, kind: "video" });
                      }
                    }}
                  />
                  {form.promoVideoUrl && (
                    <video
                      src={form.promoVideoUrl}
                      className="h-28 w-full rounded-xl border object-cover"
                      controls
                      preload="metadata"
                    />
                  )}
                </div>
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
                    onChange={(e) => handleStartDateChange(e.target.value)}
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
              onClick={handleCreateTournament}
              disabled={createMutation.isPending || uploadMediaMutation.isPending || !canSubmitCreate}
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
                const detailGameMeta = resolveTournamentGameMeta(tournamentDetail.gameType);

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

              {(tournamentDetail.coverImageUrl || tournamentDetail.promoVideoUrl) && (
                <div className="space-y-3">
                  {tournamentDetail.coverImageUrl && (
                    <img
                      src={String(tournamentDetail.coverImageUrl)}
                      alt="Tournament cover"
                      className="h-40 w-full rounded-2xl border object-cover"
                    />
                  )}
                  {tournamentDetail.promoVideoUrl && (
                    <video
                      src={String(tournamentDetail.promoVideoUrl)}
                      className="h-44 w-full rounded-2xl border object-cover"
                      controls
                      preload="metadata"
                    />
                  )}
                </div>
              )}

              {/* Status & Info */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_COLORS[tournamentDetail.status] || ""}>
                  {STATUS_LABELS[tournamentDetail.status] || tournamentDetail.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={tournamentDetail.isPublished ? "text-emerald-500 border-emerald-500/30" : "text-orange-500 border-orange-500/30"}
                >
                  {tournamentDetail.isPublished ? "Published" : "Hidden"}
                </Badge>
                <Badge variant="outline" className="gap-2">
                  {(() => {
                    const detailGameConfig = resolveTournamentGameConfig(tournamentDetail.gameType);
                    const detailGameMeta = resolveTournamentGameMeta(tournamentDetail.gameType);

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
                    <div className="sm:col-span-2 break-all">
                      <span className="text-muted-foreground">Share URL:</span>{" "}
                      /tournaments/{String(tournamentDetail.shareSlug || tournamentDetail.id)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prize Model:</span>{" "}
                      {String(tournamentDetail.prizeDistributionMethod || "top_3").replace(/_/g, " ")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quick Start:</span>{" "}
                      {tournamentDetail.autoStartOnFull
                        ? `On @ ${tournamentDetail.autoStartPlayerCount || tournamentDetail.minPlayers}`
                        : "Off"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ===== ADMIN ACTIONS ===== */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  className="min-h-[44px]"
                  variant="outline"
                  onClick={() => publishMutation.mutate({
                    id: tournamentDetail.id,
                    isPublished: !Boolean(tournamentDetail.isPublished),
                  })}
                  disabled={publishMutation.isPending}
                >
                  {Boolean(tournamentDetail.isPublished) ? (
                    <><GlobeLock className="h-4 w-4 mr-2" /> Hide From Public</>
                  ) : (
                    <><Globe className="h-4 w-4 mr-2" /> Publish To Public</>
                  )}
                </Button>

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
