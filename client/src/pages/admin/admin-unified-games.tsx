import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameAssetUploader } from "@/components/admin/games/GameAssetUploader";
import { GameIconPicker, GameColorPicker } from "@/components/admin/games/GameVisualPicker";
import { GameCardPreview } from "@/components/admin/games/GameCardPreview";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  Gamepad2,
  Power,
  Crown,
  Shuffle,
  Target,
  Gem,
  TrendingUp,
  Dices,
  CircleDot,
  Star,
  Trophy,
  Eye,
  EyeOff,
  Home,
  LayoutGrid,
  Swords,
  Sparkles,
  DollarSign,
  Coins,
  Gift,
  Settings2,
  Filter,
  Search,
  Upload,
  ImagePlus,
  Image as ImageIcon,
  MoreVertical,
  Check,
  X,
  List,
  Grid3x3,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { invalidateAllGameCaches } from "@/lib/game-cache-invalidation";
import { useToast } from "@/hooks/use-toast";

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
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

function invalidateGameConfigCaches() {
  invalidateAllGameCaches();
}

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
import { useI18n } from "@/lib/i18n";
import { ARCADE_GAMES } from "@shared/arcade-games";
import type { GameStatus } from "@shared/schema";

const GAME_CATEGORIES = [
  { key: "all", labelEn: "All Games", labelAr: "جميع الألعاب", icon: LayoutGrid },
  { key: "crash", labelEn: "Crash", labelAr: "انهيار", icon: TrendingUp },
  { key: "dice", labelEn: "Dice", labelAr: "نرد", icon: Dices },
  { key: "wheel", labelEn: "Wheel", labelAr: "عجلة", icon: CircleDot },
  { key: "slots", labelEn: "Slots", labelAr: "سلوتس", icon: Star },
  { key: "jackpot", labelEn: "Jackpot", labelAr: "جائزة كبرى", icon: Trophy },
  { key: "multiplayer", labelEn: "Multiplayer", labelAr: "متعددة اللاعبين", icon: Gamepad2 },
  { key: "board", labelEn: "Board", labelAr: "لوحة", icon: Target },
  { key: "cards", labelEn: "Cards", labelAr: "ورق", icon: Crown },
  { key: "single", labelEn: "Single Player", labelAr: "لاعب واحد", icon: Gem },
];

const DISPLAY_LOCATIONS = [
  { key: "home", labelEn: "Home Page", labelAr: "الصفحة الرئيسية", icon: Home },
  { key: "games", labelEn: "Games Section", labelAr: "قسم الألعاب", icon: LayoutGrid },
  { key: "challenges", labelEn: "Challenges", labelAr: "التحديات", icon: Swords },
  { key: "featured", labelEn: "Featured", labelAr: "المميزة", icon: Sparkles },
];

const STATUS_COLORS = {
  active: "bg-green-500/20 text-green-500 border-green-500/30",
  listed: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  inactive: "bg-red-500/20 text-red-500 border-red-500/30",
  maintenance: "bg-blue-500/20 text-blue-500 border-blue-500/30",
};

const STATUS_LABELS = {
  active: { en: "Active", ar: "نشطة" },
  listed: { en: "Listed", ar: "مدرجة" },
  inactive: { en: "Inactive", ar: "خاملة" },
  maintenance: { en: "Maintenance", ar: "صيانة" },
};

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const TABLE_WRAP_CLASS = "overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] dark:border-slate-800/70 dark:bg-slate-950/90";
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 sm:max-w-4xl";

function normalizeGameFormData(data: GameFormData): GameFormData {
  return {
    ...data,
    key: data.key.trim().toLowerCase(),
    nameEn: data.nameEn.trim(),
    nameAr: data.nameAr.trim(),
    descriptionEn: data.descriptionEn?.trim() || "",
    descriptionAr: data.descriptionAr?.trim() || "",
    minStake: data.minStake.trim(),
    maxStake: data.maxStake.trim(),
    priceVex: data.priceVex.trim(),
    houseFee: data.houseFee.trim(),
    defaultTimeLimit: data.defaultTimeLimit?.trim() || "",
    minPlayers: data.minPlayers.trim(),
    maxPlayers: data.maxPlayers.trim(),
    freePlayLimit: data.freePlayLimit.trim(),
    displayLocations: Array.from(new Set(data.displayLocations)),
  };
}

function getLocalizedCategoryLabel(category: string, language: string) {
  const categoryInfo = GAME_CATEGORIES.find((item) => item.key === category);
  if (!categoryInfo) return category;
  return language === "ar" ? categoryInfo.labelAr : categoryInfo.labelEn;
}

function getLocalizedLocationLabel(location: string, language: string) {
  const locationInfo = DISPLAY_LOCATIONS.find((item) => item.key === location);
  if (!locationInfo) return location;
  return language === "ar" ? locationInfo.labelAr : locationInfo.labelEn;
}

function formatFreePlayLabel(limit: number, period: string | null, language: string) {
  if (limit <= 0) {
    return language === "ar" ? "بدون لعب مجاني" : "No free play";
  }

  const periodLabel = period === "weekly"
    ? (language === "ar" ? "أسبوع" : "week")
    : period === "monthly"
      ? (language === "ar" ? "شهر" : "month")
      : (language === "ar" ? "يوم" : "day");

  return `${limit}/${periodLabel}`;
}

const gameFormSchema = z.object({
  key: z.string().min(1, "Game key is required").regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores"),
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  status: z.enum(["active", "listed", "inactive", "maintenance"]),
  minStake: z.string().min(1, "Minimum entry is required"),
  maxStake: z.string().min(1, "Maximum entry is required"),
  priceVex: z.string().min(1, "VEX price is required"),
  houseFee: z.string().min(1, "House fee is required"),
  defaultTimeLimit: z.string().optional(),
  minPlayers: z.string().min(1, "Minimum players is required"),
  maxPlayers: z.string().min(1, "Maximum players is required"),
  freePlayLimit: z.string().min(1, "Free play limit is required"),
  freePlayPeriod: z.enum(["daily", "weekly", "monthly"]),
  displayLocations: z.array(z.string()).min(1, "At least one display location is required"),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  iconUrl: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  thumbnailUrl: z.string().optional().default(""),
  iconName: z.string().optional().default("Gamepad2"),
  colorClass: z.string().optional().default(""),
  gradientClass: z.string().optional().default(""),
});

type GameFormData = z.infer<typeof gameFormSchema>;

interface MultiplayerGame {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  iconName: string;
  colorClass: string;
  gradientClass: string | null;
  category: string;
  status: "active" | "listed" | "inactive" | "maintenance";
  minStake: string;
  maxStake: string;
  priceVex: string;
  houseFee: string;
  defaultTimeLimit: number | null;
  minPlayers: number;
  maxPlayers: number;
  freePlayLimit: number;
  freePlayPeriod: "daily" | "weekly" | "monthly" | null;
  displayLocations: string[];
  isActive: boolean;
  isFeatured: boolean;
  totalGamesPlayed: number;
  totalVolume: string;
  createdAt: string;
  updatedAt: string | null;
}

interface SinglePlayerGame {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: string;
  sections: string[];
  gameType: string;
  status: "active" | "inactive" | "maintenance";
  rtp: string;
  houseEdge: string;
  volatility: string;
  minBet: string;
  maxBet: string;
  multiplierMin: string;
  multiplierMax: string;
  playCount: number;
  totalVolume: string;
  isFeatured: boolean;
  sortOrder: number;
  maxPlayers: number;
  minPlayers: number;
  isFreeToPlay: boolean;
  playPrice: string | null;
  pricingType: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

// Unified game type to display both types in one table
interface UnifiedGame {
  id: string;
  _type: "multiplayer" | "single";
  _original: MultiplayerGame | SinglePlayerGame;
  iconUrl: string | null;
  thumbnailUrl: string | null;
  name: string;
  nameAr: string;
  key: string;
  category: string;
  status: string;
  minBet: string;
  maxBet: string;
  priceVex: string;
  isFeatured: boolean;
  displayLocations: string[];
  freePlayLimit: number;
  freePlayPeriod: string | null;
  iconName: string;
  colorClass: string;
  playCount: number;
}

function isCustomImagePath(value?: string | null): value is string {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return normalized.startsWith("/") || /^https?:\/\//i.test(normalized);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:")) {
        reject(new Error("Invalid file data"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function toUnifiedGame(mp: MultiplayerGame): UnifiedGame {
  const iconUrl = mp.iconUrl || mp.imageUrl || (isCustomImagePath(mp.iconName) ? mp.iconName : null);
  const thumbnailUrl = mp.thumbnailUrl || null;
  return {
    id: mp.id,
    _type: "multiplayer",
    _original: mp,
    iconUrl,
    thumbnailUrl,
    name: mp.nameEn,
    nameAr: mp.nameAr,
    key: mp.key,
    category: mp.category,
    status: mp.status,
    minBet: mp.minStake,
    maxBet: mp.maxStake,
    priceVex: mp.priceVex || "0",
    isFeatured: mp.isFeatured,
    displayLocations: mp.displayLocations || [],
    freePlayLimit: mp.freePlayLimit || 0,
    freePlayPeriod: mp.freePlayPeriod,
    iconName: isCustomImagePath(mp.iconName) ? "Gamepad2" : (mp.iconName || "Gamepad2"),
    colorClass: mp.colorClass || "bg-primary/20 text-primary",
    playCount: mp.totalGamesPlayed || 0,
  };
}

function toUnifiedGameFromSingle(g: SinglePlayerGame): UnifiedGame {
  return {
    id: g.id,
    _type: "single",
    _original: g,
    iconUrl: g.imageUrl || g.thumbnailUrl || null,
    thumbnailUrl: g.thumbnailUrl || g.imageUrl || null,
    name: g.name,
    nameAr: g.name, // single-player games don't have Arabic names
    key: g.name.toLowerCase().replace(/\s+/g, "_"),
    category: g.category,
    status: g.status,
    minBet: g.minBet,
    maxBet: g.maxBet,
    priceVex: g.playPrice || "0",
    isFeatured: g.isFeatured,
    displayLocations: g.sections || [],
    freePlayLimit: g.isFreeToPlay ? 1 : 0,
    freePlayPeriod: null,
    iconName: getCategoryIcon(g.category),
    colorClass: getCategoryColor(g.category),
    playCount: g.playCount || 0,
  };
}

function getCategoryIcon(category: string): string {
  const map: Record<string, string> = {
    crash: "TrendingUp", dice: "Dices", wheel: "CircleDot", slots: "Star",
    jackpot: "Trophy", board: "Target", cards: "Crown", multiplayer: "Gamepad2",
  };
  return map[category] || "Gem";
}

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    crash: "bg-red-500/20 text-red-500", dice: "bg-blue-500/20 text-blue-500",
    wheel: "bg-green-500/20 text-green-500", slots: "bg-purple-500/20 text-purple-500",
    jackpot: "bg-yellow-500/20 text-yellow-500", board: "bg-cyan-500/20 text-cyan-500",
    cards: "bg-pink-500/20 text-pink-500", multiplayer: "bg-primary/20 text-primary",
  };
  return map[category] || "bg-gray-500/20 text-gray-500";
}

function getIconComponent(iconName: string) {
  const icons: Record<string, typeof Gamepad2> = {
    Crown, Shuffle, Target, Gem, Gamepad2, TrendingUp, Dices, CircleDot, Star, Trophy
  };
  return icons[iconName] || Gamepad2;
}

// Visual section: asset uploaders + icon picker + color picker + live preview
function VisualSection({
  form,
  language,
}: {
  form: ReturnType<typeof useForm<GameFormData>>;
  language: string;
}) {
  const isAr = language === "ar";
  const watched = useWatch({ control: form.control });
  const iconUrl = String(watched.iconUrl || "");
  const imageUrl = String(watched.imageUrl || "");
  const thumbnailUrl = String(watched.thumbnailUrl || "");
  const iconName = String(watched.iconName || "Gamepad2");
  const colorClass = String(watched.colorClass || "");
  const gradientClass = String(watched.gradientClass || "");
  const nameEn = String(watched.nameEn || "");
  const nameAr = String(watched.nameAr || "");

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h4 className="font-semibold">
          {isAr ? "هوية اللعبة البصرية" : "Visual Identity"}
        </h4>
        <span className="text-xs text-muted-foreground">
          {isAr ? "(يُطبَّق فى كل مكان تظهر فيه اللعبة)" : "(applied everywhere the game appears)"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <GameAssetUploader
              label={isAr ? "أيقونة" : "Icon"}
              description={isAr ? "PNG/SVG شفّافة" : "Transparent PNG/SVG"}
              value={iconUrl}
              onChange={(v) => form.setValue("iconUrl", v, { shouldDirty: true })}
              recommendedSize="256×256"
              language={language}
              aspectRatio="square"
              testIdPrefix="upload-icon"
            />
            <GameAssetUploader
              label={isAr ? "مصغّرة" : "Thumbnail"}
              description={isAr ? "تظهر فى صالة الألعاب" : "Shown in lobby"}
              value={thumbnailUrl}
              onChange={(v) => form.setValue("thumbnailUrl", v, { shouldDirty: true })}
              recommendedSize="800×600"
              language={language}
              aspectRatio="card"
              testIdPrefix="upload-thumbnail"
            />
          </div>
          <GameAssetUploader
            label={isAr ? "صورة الخلفية / البانر" : "Background / Banner"}
            description={isAr ? "اختيارى — عرض كبير فى صفحة اللعبة" : "Optional — large view inside game page"}
            value={imageUrl}
            onChange={(v) => form.setValue("imageUrl", v, { shouldDirty: true })}
            recommendedSize="1600×900"
            language={language}
            aspectRatio="wide"
            testIdPrefix="upload-image"
          />
          <GameIconPicker
            value={iconName}
            onChange={(v) => form.setValue("iconName", v, { shouldDirty: true })}
            language={language}
          />
          <GameColorPicker
            colorClass={colorClass}
            gradientClass={gradientClass}
            onChange={({ colorClass: cc, gradientClass: gc }) => {
              form.setValue("colorClass", cc, { shouldDirty: true });
              form.setValue("gradientClass", gc, { shouldDirty: true });
            }}
            language={language}
          />
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4">
          <GameCardPreview
            nameEn={nameEn}
            nameAr={nameAr}
            iconUrl={iconUrl}
            thumbnailUrl={thumbnailUrl}
            imageUrl={imageUrl}
            iconName={iconName}
            colorClass={colorClass}
            gradientClass={gradientClass}
            language={language}
          />
        </div>
      </div>
    </div>
  );
}

// Horizontal toggle buttons for display locations (multi-select)
function DisplayLocationsField({
  form,
  language
}: {
  form: ReturnType<typeof useForm<GameFormData>>;
  language: string;
}) {
  // Use useWatch hook for proper reactivity without infinite loops
  const displayLocations = useWatch({
    control: form.control,
    name: "displayLocations",
    defaultValue: []
  });
  const currentValue = Array.isArray(displayLocations) ? displayLocations : [];

  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={currentValue}
      onValueChange={(value) => {
        form.setValue("displayLocations", value, {
          shouldValidate: true,
          shouldDirty: true
        });
      }}
      className="flex-wrap justify-start gap-2"
    >
      {DISPLAY_LOCATIONS.map((location) => {
        const IconComp = location.icon;
        return (
          <ToggleGroupItem
            key={location.key}
            value={location.key}
            data-testid={`toggle-location-${location.key}`}
          >
            <IconComp className="h-4 w-4" />
            <span>{language === "ar" ? location.labelAr : location.labelEn}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function GameForm({
  game,
  gameType = "multiplayer",
  onSuccess,
  onCancel
}: {
  game?: MultiplayerGame | null;
  gameType?: "multiplayer" | "single";
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const { language } = useI18n();
  const isEditing = !!game;

  const form = useForm<GameFormData>({
    resolver: zodResolver(gameFormSchema),
    defaultValues: {
      key: game?.key || "",
      nameEn: game?.nameEn || "",
      nameAr: game?.nameAr || "",
      descriptionEn: game?.descriptionEn || "",
      descriptionAr: game?.descriptionAr || "",
      category: game?.category || "multiplayer",
      status: game?.status || "active",
      minStake: game?.minStake || "1",
      maxStake: game?.maxStake || "1000",
      priceVex: game?.priceVex || "0",
      houseFee: game?.houseFee || "0.05",
      defaultTimeLimit: game?.defaultTimeLimit?.toString() || "300",
      minPlayers: game?.minPlayers?.toString() || "2",
      maxPlayers: game?.maxPlayers?.toString() || "2",
      freePlayLimit: game?.freePlayLimit?.toString() || "0",
      freePlayPeriod: game?.freePlayPeriod || "daily",
      displayLocations: game?.displayLocations || ["games"],
      isActive: game?.isActive ?? true,
      isFeatured: game?.isFeatured ?? false,
      iconUrl: game?.iconUrl || "",
      imageUrl: game?.imageUrl || "",
      thumbnailUrl: game?.thumbnailUrl || "",
      iconName: (game?.iconName && !game.iconName.startsWith("/") && !/^https?:\/\//i.test(game.iconName)) ? game.iconName : "Gamepad2",
      colorClass: game?.colorClass || "",
      gradientClass: game?.gradientClass || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: GameFormData) =>
      adminFetch("/api/admin/multiplayer-games", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          defaultTimeLimit: data.defaultTimeLimit ? parseInt(data.defaultTimeLimit) : 300,
          minPlayers: parseInt(data.minPlayers),
          maxPlayers: parseInt(data.maxPlayers),
          freePlayLimit: parseInt(data.freePlayLimit),
        }),
      }),
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم إنشاء اللعبة بنجاح" : "Game created successfully",
      });
      invalidateGameConfigCaches();
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل إنشاء اللعبة" : "Failed to create game",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: GameFormData) => {
      if (gameType === "single") {
        // Single-player games use /api/admin/games/:id with different field mapping
        return adminFetch(`/api/admin/games/${game!.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: data.nameEn,
            nameAr: data.nameAr,
            description: data.descriptionEn || "",
            descriptionAr: data.descriptionAr || "",
            category: data.category,
            status: data.status,
            sections: data.displayLocations,
            minBet: data.minStake,
            maxBet: data.maxStake,
            minPlayers: parseInt(data.minPlayers),
            maxPlayers: parseInt(data.maxPlayers),
            isFeatured: data.isFeatured,
            isFreeToPlay: parseInt(data.freePlayLimit) > 0,
            playPrice: data.priceVex,
            iconUrl: data.iconUrl || undefined,
            imageUrl: data.imageUrl || undefined,
            thumbnailUrl: data.thumbnailUrl || undefined,
          }),
        });
      }
      return adminFetch(`/api/admin/multiplayer-games/${game!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          defaultTimeLimit: data.defaultTimeLimit ? parseInt(data.defaultTimeLimit) : 300,
          minPlayers: parseInt(data.minPlayers),
          maxPlayers: parseInt(data.maxPlayers),
          freePlayLimit: parseInt(data.freePlayLimit),
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم تحديث اللعبة بنجاح" : "Game updated successfully",
      });
      invalidateGameConfigCaches();
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل تحديث اللعبة" : "Failed to update game",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const onSubmit = (data: GameFormData) => {
    const normalized = normalizeGameFormData(data);

    if (Number(normalized.maxStake) < Number(normalized.minStake)) {
      toast({
        title: language === "ar" ? "قيم دخول غير صحيحة" : "Invalid entry range",
        description: language === "ar" ? "يجب أن يكون الحد الأقصى أكبر من أو يساوي الحد الأدنى" : "Maximum entry must be greater than or equal to minimum entry",
        variant: "destructive",
      });
      return;
    }

    if (Number(normalized.maxPlayers) < Number(normalized.minPlayers)) {
      toast({
        title: language === "ar" ? "عدد لاعبين غير صحيح" : "Invalid player range",
        description: language === "ar" ? "يجب أن يكون الحد الأقصى للاعبين أكبر من أو يساوي الحد الأدنى" : "Maximum players must be greater than or equal to minimum players",
        variant: "destructive",
      });
      return;
    }

    if (isEditing) {
      updateMutation.mutate(normalized);
    } else {
      createMutation.mutate(normalized);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        <VisualSection form={form} language={language} />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "مفتاح اللعبة" : "Game Key"}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="chess" disabled={isEditing} data-testid="input-game-key" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "الفئة" : "Category"}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder={language === "ar" ? "اختر الفئة" : "Select category"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {GAME_CATEGORIES.filter(c => c.key !== "all").map((cat) => (
                      <SelectItem key={cat.key} value={cat.key}>
                        {language === "ar" ? cat.labelAr : cat.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nameEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Chess" data-testid="input-name-en" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nameAr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="شطرنج" dir="rtl" data-testid="input-name-ar" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{language === "ar" ? "الحالة" : "Status"}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder={language === "ar" ? "اختر الحالة" : "Select status"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      {language === "ar" ? "نشطة" : "Active"}
                    </span>
                  </SelectItem>
                  <SelectItem value="listed">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      {language === "ar" ? "مدرجة" : "Listed"}
                    </span>
                  </SelectItem>
                  <SelectItem value="inactive">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      {language === "ar" ? "خاملة" : "Inactive"}
                    </span>
                  </SelectItem>
                  <SelectItem value="maintenance">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      {language === "ar" ? "صيانة" : "Maintenance"}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {language === "ar" ? "التسعير" : "Pricing"}
          </h4>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="minStake"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === "ar" ? "الحد الأدنى (USD)" : "Min Entry (USD)"}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} data-testid="input-min-stake" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxStake"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === "ar" ? "الحد الأقصى (USD)" : "Max Entry (USD)"}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} data-testid="input-max-stake" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="houseFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === "ar" ? "عمولة المنصة" : "House Fee"}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} placeholder="0.05" data-testid="input-house-fee" />
                  </FormControl>
                  <FormDescription>5% = 0.05</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="priceVex"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  {language === "ar" ? "السعر بـ VEX" : "Price in VEX"}
                </FormLabel>
                <FormControl>
                  <MoneyInput {...field} placeholder="0" data-testid="input-price-vex" />
                </FormControl>
                <FormDescription>
                  {language === "ar" ? "السعر بعملة التطبيق (VEX Coins)" : "Price in app currency (VEX Coins)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Gift className="h-4 w-4" />
            {language === "ar" ? "اللعب المجاني" : "Free Play"}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="freePlayLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === "ar" ? "عدد المرات المجانية" : "Free Play Limit"}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} allowDecimal={false} data-testid="input-free-play-limit" />
                  </FormControl>
                  <FormDescription>
                    {language === "ar" ? "0 يعني بدون لعب مجاني" : "0 means no free plays"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="freePlayPeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === "ar" ? "فترة التجديد" : "Reset Period"}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-free-play-period">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="daily">{language === "ar" ? "يومياً" : "Daily"}</SelectItem>
                      <SelectItem value="weekly">{language === "ar" ? "أسبوعياً" : "Weekly"}</SelectItem>
                      <SelectItem value="monthly">{language === "ar" ? "شهرياً" : "Monthly"}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {language === "ar" ? "أماكن العرض" : "Display Locations"}
          </h4>

          <DisplayLocationsField form={form} language={language} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="minPlayers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "الحد الأدنى للاعبين" : "Min Players"}</FormLabel>
                <FormControl>
                  <MoneyInput {...field} allowDecimal={false} data-testid="input-min-players" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxPlayers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{language === "ar" ? "الحد الأقصى للاعبين" : "Max Players"}</FormLabel>
                <FormControl>
                  <MoneyInput {...field} allowDecimal={false} data-testid="input-max-players" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-6">
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-is-active"
                  />
                </FormControl>
                <FormLabel className="!mt-0">{language === "ar" ? "مفعّلة" : "Active"}</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isFeatured"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-is-featured"
                  />
                </FormControl>
                <FormLabel className="!mt-0">{language === "ar" ? "مميزة" : "Featured"}</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-background">
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
            {language === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending
              ? (language === "ar" ? "جاري الحفظ..." : "Saving...")
              : isEditing
                ? (language === "ar" ? "تحديث" : "Update")
                : (language === "ar" ? "إنشاء" : "Create")
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function AdminUnifiedGames() {
  const { toast } = useToast();
  const { language } = useI18n();
  const [activeCategory, setActiveCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [displayLocationFilter, setDisplayLocationFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<MultiplayerGame | null>(null);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<"permanent" | "remove_from_section">("permanent");
  const [iconUploadTarget, setIconUploadTarget] = useState<UnifiedGame | null>(null);
  const [mediaUploadMode, setMediaUploadMode] = useState<"icon" | "background">("icon");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [pendingStatusGameId, setPendingStatusGameId] = useState<string | null>(null);
  const iconFileInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch multiplayer games
  const { data: mpGames = [], isLoading: mpLoading } = useQuery<MultiplayerGame[]>({
    queryKey: ["/api/admin/multiplayer-games"],
    queryFn: () => adminFetch("/api/admin/multiplayer-games"),
  });

  // Fetch single-player games from games table
  const { data: spGames = [], isLoading: spLoading } = useQuery<SinglePlayerGame[]>({
    queryKey: ["/api/admin/games"],
    queryFn: () => adminFetch("/api/admin/games"),
  });

  const isLoading = mpLoading || spLoading;

  // Merge both types into a unified array, deduplicated by slug.
  // Many classic games (chess, backgammon, baloot, tarneeb, domino,
  // languageduel, snake) historically exist in BOTH `multiplayer_games`
  // and the legacy `games` table with the same slug. Showing both
  // creates confusing visual duplicates in the admin grid, so we keep
  // the multiplayer entry as canonical (it's the newer source of truth)
  // and drop the legacy single-player row when slugs collide. The DB
  // rows are untouched — only the admin display is deduped.
  const allGames: UnifiedGame[] = (() => {
    const seenSlugs = new Set<string>();
    const merged: UnifiedGame[] = [];
    for (const g of mpGames.map(toUnifiedGame)) {
      const slug = (g.key || g.id || "").toLowerCase();
      if (slug) seenSlugs.add(slug);
      merged.push(g);
    }
    for (const g of spGames.map(toUnifiedGameFromSingle)) {
      const slug = (g.key || g.id || "").toLowerCase();
      if (slug && seenSlugs.has(slug)) continue;
      if (slug) seenSlugs.add(slug);
      merged.push(g);
    }
    return merged;
  })();

  const deleteMutation = useMutation({
    mutationFn: ({ id, gameType }: { id: string; gameType: "multiplayer" | "single" }) => {
      const endpoint = gameType === "multiplayer"
        ? `/api/admin/multiplayer-games/${id}`
        : `/api/admin/games/${id}`;
      return adminFetch(endpoint, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم حذف اللعبة بنجاح" : "Game deleted successfully",
      });
      invalidateGameConfigCaches();
      setDeleteGameId(null);
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل حذف اللعبة" : "Failed to delete game",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status, gameType }: { id: string; status: string; gameType: "multiplayer" | "single" }) => {
      const endpoint = gameType === "multiplayer"
        ? `/api/admin/multiplayer-games/${id}`
        : `/api/admin/games/${id}`;
      return adminFetch(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
    },
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم تحديث الحالة" : "Status updated",
      });
      invalidateGameConfigCaches();
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل تحديث الحالة" : "Failed to update status",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const quickToggleStatus = (game: UnifiedGame) => {
    const nextStatus = game.status === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ id: game.id, status: nextStatus, gameType: game._type });
  };

  const isStatusPending = (gameId: string) => pendingStatusGameId === gameId || toggleStatusMutation.isPending;

  const updateDisplayLocationsMutation = useMutation({
    mutationFn: ({ id, displayLocations, gameType }: { id: string; displayLocations: string[]; gameType: "multiplayer" | "single" }) => {
      const endpoint = gameType === "multiplayer"
        ? `/api/admin/multiplayer-games/${id}`
        : `/api/admin/games/${id}`;
      const body = gameType === "multiplayer"
        ? { displayLocations }
        : { sections: displayLocations };
      return adminFetch(endpoint, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم تحديث أماكن العرض" : "Display locations updated",
      });
      invalidateGameConfigCaches();
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل تحديث أماكن العرض" : "Failed to update display locations",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const uploadIconMutation = useMutation({
    mutationFn: async ({
      game,
      file,
      mode,
    }: {
      game: UnifiedGame;
      file: File;
      mode: "icon" | "background";
    }) => {
      const fileData = await fileToDataUrl(file);

      const uploadResult = await adminFetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({
          fileData,
          fileName: file.name,
        }),
      }) as { url?: string };

      const uploadedUrl = typeof uploadResult?.url === "string" ? uploadResult.url : "";
      if (!uploadedUrl) {
        throw new Error(language === "ar" ? "فشل رفع الملف" : "Failed to upload file");
      }

      const endpoint = game._type === "multiplayer"
        ? `/api/admin/multiplayer-games/${game.id}`
        : `/api/admin/games/${game.id}`;

      const payload = game._type === "multiplayer"
        ? (mode === "icon" ? { iconName: uploadedUrl } : { thumbnailUrl: uploadedUrl })
        : (mode === "icon" ? { imageUrl: uploadedUrl } : { thumbnailUrl: uploadedUrl });

      await adminFetch(endpoint, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      return { uploadedUrl, mode };
    },
    onSuccess: (_result, variables) => {
      const isBackgroundUpload = variables.mode === "background";
      toast({
        title: isBackgroundUpload
          ? (language === "ar" ? "تم رفع صورة الخلفية بنجاح" : "Background image uploaded successfully")
          : (language === "ar" ? "تم رفع الأيقونة بنجاح" : "Icon uploaded successfully"),
      });
      invalidateGameConfigCaches();
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل رفع الأيقونة" : "Failed to upload icon",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIconUploadTarget(null);
      setMediaUploadMode("icon");
    },
  });

  const toggleDisplayLocation = (game: UnifiedGame, location: string) => {
    const currentLocations = Array.isArray(game.displayLocations) ? game.displayLocations : [];
    const isInLocation = currentLocations.includes(location);
    const newLocations = isInLocation
      ? currentLocations.filter(l => l !== location)
      : [...currentLocations, location];
    updateDisplayLocationsMutation.mutate({ id: game.id, displayLocations: newLocations, gameType: game._type });
  };

  const handleRequestMediaUpload = (game: UnifiedGame, mode: "icon" | "background") => {
    if (uploadIconMutation.isPending) return;
    setIconUploadTarget(game);
    setMediaUploadMode(mode);
    iconFileInputRef.current?.click();
  };

  const handleIconFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !iconUploadTarget) {
      setIconUploadTarget(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: language === "ar" ? "ملف غير صالح" : "Invalid file",
        description: language === "ar" ? "الرجاء اختيار صورة فقط" : "Please choose an image file",
        variant: "destructive",
      });
      setIconUploadTarget(null);
      return;
    }

    uploadIconMutation.mutate({ game: iconUploadTarget, file, mode: mediaUploadMode });
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const connectWs = () => {
      if (!isMounted) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.type === "game_config_changed" ||
            (data.type === "system_event" && data.event?.type === "game_config_changed")
          ) {
            invalidateGameConfigCaches();
          }
        } catch { }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (isMounted) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connectWs, delay);
        }
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const filteredGames = allGames.filter((game) => {
    const matchesCategory = activeCategory === "all" || game.category === activeCategory;
    const matchesStatus = statusFilter === "all" || game.status === statusFilter;
    const matchesDisplayLocation = displayLocationFilter === "all" ||
      (Array.isArray(game.displayLocations) && game.displayLocations.includes(displayLocationFilter));
    const matchesSearch = searchQuery === "" ||
      game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.nameAr.includes(searchQuery) ||
      game.key.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesStatus && matchesDisplayLocation && matchesSearch;
  });

  const getCategoryCounts = () => {
    const counts: Record<string, number> = { all: allGames.length };
    GAME_CATEGORIES.forEach((cat) => {
      if (cat.key !== "all") {
        counts[cat.key] = allGames.filter((g) => g.category === cat.key).length;
      }
    });
    return counts;
  };

  const getStatusCounts = () => {
    return {
      all: allGames.length,
      active: allGames.filter((g) => g.status === "active").length,
      listed: allGames.filter((g) => g.status === "listed").length,
      inactive: allGames.filter((g) => g.status === "inactive").length,
    };
  };

  const getDisplayLocationCounts = () => {
    const counts: Record<string, number> = { all: allGames.length };
    DISPLAY_LOCATIONS.forEach((loc) => {
      counts[loc.key] = allGames.filter((g) =>
        Array.isArray(g.displayLocations) && g.displayLocations.includes(loc.key)
      ).length;
    });
    return counts;
  };

  const categoryCounts = getCategoryCounts();
  const statusCounts = getStatusCounts();
  const displayLocationCounts = getDisplayLocationCounts();
  const activeGamesCount = allGames.filter((game) => game.status === "active").length;
  const featuredGamesCount = allGames.filter((game) => game.isFeatured).length;
  const multiplayerGamesCount = allGames.filter((game) => game._type === "multiplayer").length;
  const singlePlayerGamesCount = allGames.filter((game) => game._type === "single").length;
  const sortedFilteredGames = [...filteredGames].sort((left, right) => {
    if (left.isFeatured !== right.isFeatured) return Number(right.isFeatured) - Number(left.isFeatured);
    if (left.status !== right.status) return left.status.localeCompare(right.status);
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  const [editingGameType, setEditingGameType] = useState<"multiplayer" | "single">("multiplayer");

  const handleEdit = (game: UnifiedGame) => {
    // Track game type for correct endpoint routing
    setEditingGameType(game._type);
    if (game._type === "multiplayer") {
      setEditingGame(game._original as MultiplayerGame);
      setIsFormOpen(true);
    } else {
      // For single player games, open edit with single-player endpoint
      const sp = game._original as SinglePlayerGame;
      setEditingGame({
        id: sp.id,
        key: sp.name.toLowerCase().replace(/\s+/g, "_"),
        nameEn: sp.name,
        nameAr: sp.name,
        descriptionEn: sp.description,
        descriptionAr: null,
        iconUrl: sp.imageUrl,
        imageUrl: sp.imageUrl,
        thumbnailUrl: sp.thumbnailUrl,
        iconName: getCategoryIcon(sp.category),
        colorClass: getCategoryColor(sp.category),
        gradientClass: null,
        category: sp.category,
        status: sp.status as GameStatus,
        minStake: sp.minBet,
        maxStake: sp.maxBet,
        priceVex: sp.playPrice || "0",
        houseFee: (parseFloat(sp.houseEdge) / 100).toFixed(4),
        defaultTimeLimit: null,
        minPlayers: sp.minPlayers,
        maxPlayers: sp.maxPlayers,
        freePlayLimit: sp.isFreeToPlay ? 1 : 0,
        freePlayPeriod: "daily",
        displayLocations: sp.sections || [],
        isActive: sp.status === "active",
        isFeatured: sp.isFeatured,
        totalGamesPlayed: sp.playCount,
        totalVolume: sp.totalVolume,
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      } as MultiplayerGame);
      setIsFormOpen(true);
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingGame(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-5 sm:p-6`}>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-3 h-5 w-96 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={STAT_CARD_CLASS}>
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
        <div className={`${SURFACE_CARD_CLASS} p-5 sm:p-6`}>
          <Skeleton className="h-12 w-full" />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Settings2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {language === "ar" ? "إدارة الألعاب" : "Games Management"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {language === "ar" ? "إدارة الألعاب، التسعير، الظهور، وحالة التشغيل من شاشة واحدة" : "Manage pricing, visibility, and game status from one mobile-first surface"}
              </p>
            </div>
          </div>
          <Button className={`${BUTTON_3D_PRIMARY_CLASS} w-full sm:w-auto`} onClick={() => { setEditingGame(null); setIsFormOpen(true); }} data-testid="button-add-game">
            <Plus className="h-4 w-4 me-2" />
            {language === "ar" ? "إضافة لعبة" : "Add Game"}
          </Button>
        </div>
      </div>

      <Card className={SURFACE_CARD_CLASS} data-testid="panel-arcade-preview">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gamepad2 className="h-5 w-5 text-sky-600" />
            {language === "ar" ? "معاينة سريعة لألعاب الأركيد (HTML5)" : "Arcade Mini-Games — Quick Preview (HTML5)"}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {language === "ar"
              ? "افتح أي لعبة في تبويب جديد للتحقق منها قبل النشر."
              : "Open any game in a new tab to verify it before going live."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ARCADE_GAMES.map((g) => (
              <a
                key={g.key}
                href={`/play/${g.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500"
                data-testid={`link-arcade-preview-${g.key}`}
                style={{ borderInlineStartWidth: 4, borderInlineStartColor: g.color }}
              >
                <span className="text-lg leading-none" aria-hidden="true">{g.iconEmoji}</span>
                <span className="flex-1 truncate">
                  {language === "ar" ? g.titleAr : g.titleEn}
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {g.kind}
                </span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{language === "ar" ? "الإجمالي" : "Total"}</p>
              <p className="mt-1 text-2xl font-bold">{allGames.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Power className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{language === "ar" ? "نشطة" : "Active"}</p>
              <p className="mt-1 text-2xl font-bold">{activeGamesCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{language === "ar" ? "مميزة" : "Featured"}</p>
              <p className="mt-1 text-2xl font-bold">{featuredGamesCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Shuffle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{language === "ar" ? "الأنواع" : "Types"}</p>
              <p className="mt-1 text-lg font-bold">{multiplayerGamesCount} MP / {singlePlayerGamesCount} SP</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <input
        ref={iconFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleIconFileChange}
        className="hidden"
        data-testid="input-upload-game-icon"
      />

      <Card className={SURFACE_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {language === "ar" ? "الفلاتر والعرض" : "Filters and Views"}
          </CardTitle>
          <CardDescription>
            {language === "ar" ? "التبديل بين أقسام العرض والبحث السريع مع الحفاظ على نفس البيانات" : "Switch between display sections and filter the same dataset quickly"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              className={`${displayLocationFilter === "all" ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS} gap-2`}
              size="sm"
              onClick={() => setDisplayLocationFilter("all")}
              data-testid="tab-location-all"
            >
              <LayoutGrid className="h-4 w-4" />
              {language === "ar" ? "جميع الألعاب" : "All Games"}
              <Badge variant="secondary" className="ms-1 text-xs">
                {allGames.length}
              </Badge>
            </Button>
            {DISPLAY_LOCATIONS.map((loc) => {
              const IconComp = loc.icon;
              return (
                <Button
                  key={loc.key}
                  className={`${displayLocationFilter === loc.key ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS} gap-2`}
                  size="sm"
                  onClick={() => setDisplayLocationFilter(loc.key)}
                  data-testid={`tab-location-${loc.key}`}
                >
                  <IconComp className="h-4 w-4" />
                  {language === "ar" ? loc.labelAr : loc.labelEn}
                  <Badge variant="secondary" className="ms-1 text-xs">
                    {displayLocationCounts[loc.key] || 0}
                  </Badge>
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={language === "ar" ? "بحث..." : "Search..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${INPUT_SURFACE_CLASS} ps-10`}
                data-testid="input-search"
              />
            </div>

            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger className={`${INPUT_SURFACE_CLASS} w-40`} data-testid="select-category-filter">
                <SelectValue placeholder={language === "ar" ? "الفئة" : "Category"} />
              </SelectTrigger>
              <SelectContent>
                {GAME_CATEGORIES.map((cat) => {
                  const IconComp = cat.icon;
                  return (
                    <SelectItem key={cat.key} value={cat.key}>
                      <span className="flex items-center gap-2">
                        <IconComp className="h-4 w-4" />
                        {language === "ar" ? cat.labelAr : cat.labelEn} ({categoryCounts[cat.key] || 0})
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={`${INPUT_SURFACE_CLASS} w-36`} data-testid="select-status-filter">
                <SelectValue placeholder={language === "ar" ? "الحالة" : "Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {language === "ar" ? "جميع الحالات" : "All Statuses"}
                </SelectItem>
                <SelectItem value="active">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {language === "ar" ? "نشطة" : "Active"}
                  </span>
                </SelectItem>
                <SelectItem value="listed">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    {language === "ar" ? "مدرجة" : "Listed"}
                  </span>
                </SelectItem>
                <SelectItem value="inactive">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {language === "ar" ? "خاملة" : "Inactive"}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Results count - shows when filters reduce results */}
            {filteredGames.length !== allGames.length && (
              <span className="text-sm text-muted-foreground">
                {language === "ar"
                  ? `${filteredGames.length} نتيجة`
                  : `${filteredGames.length} results`
                }
              </span>
            )}

            <div className="ms-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/60">
              <Button
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`${viewMode === "grid" ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS} h-9 gap-1 px-3`}
                data-testid="button-view-grid"
                aria-pressed={viewMode === "grid"}
                title={language === "ar" ? "عرض شبكة الأيقونات" : "Icon grid view"}
              >
                <Grid3x3 className="h-4 w-4" />
                <span className="hidden sm:inline">{language === "ar" ? "شبكة" : "Grid"}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setViewMode("list")}
                className={`${viewMode === "list" ? BUTTON_3D_PRIMARY_CLASS : BUTTON_3D_CLASS} h-9 gap-1 px-3`}
                data-testid="button-view-list"
                aria-pressed={viewMode === "list"}
                title={language === "ar" ? "عرض القائمة" : "List view"}
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">{language === "ar" ? "قائمة" : "List"}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredGames.length === 0 ? (
        <Card className={SURFACE_CARD_CLASS}>
          <CardContent className="p-12 text-center">
            <Gamepad2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">
              {displayLocationFilter !== "all"
                ? (language === "ar"
                  ? `لا توجد ألعاب في قسم "${getLocalizedLocationLabel(displayLocationFilter, language)}"`
                  : `No games in "${getLocalizedLocationLabel(displayLocationFilter, language)}" section`)
                : (language === "ar"
                  ? "لا توجد ألعاب تطابق الفلاتر المحددة"
                  : "No games match the selected filters")}
            </p>
            {displayLocationFilter !== "all" && (
              <p className="mb-4 text-sm text-muted-foreground">
                {language === "ar"
                  ? "يمكنك إضافة ألعاب لهذا القسم من قسم 'جميع الألعاب'"
                  : "You can add games to this section from 'All Games'"}
              </p>
            )}
            <div className="flex items-center justify-center gap-2">
              {displayLocationFilter !== "all" && (
                <Button className={BUTTON_3D_CLASS} onClick={() => setDisplayLocationFilter("all")}>
                  <LayoutGrid className="h-4 w-4 me-2" />
                  {language === "ar" ? "عرض جميع الألعاب" : "View All Games"}
                </Button>
              )}
              <Button className={BUTTON_3D_PRIMARY_CLASS} onClick={() => { setEditingGame(null); setIsFormOpen(true); }}>
                <Plus className="h-4 w-4 me-2" />
                {language === "ar" ? "إضافة لعبة جديدة" : "Add New Game"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <Card className={SURFACE_CARD_CLASS}>
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
              {sortedFilteredGames.map((game) => {
                const IconComp = getIconComponent(game.iconName);
                const hasCustomIcon = isCustomImagePath(game.iconUrl);
                const statusDot =
                  game.status === "active" ? "bg-green-500" :
                    game.status === "listed" ? "bg-yellow-500" :
                      game.status === "inactive" ? "bg-red-500" : "bg-blue-500";
                const statusLabel = STATUS_LABELS[game.status as keyof typeof STATUS_LABELS];
                return (
                  <button
                    key={`${game._type}-${game.id}`}
                    type="button"
                    onClick={() => handleEdit(game)}
                    data-testid={`grid-game-${game.id}`}
                    className="group relative flex flex-col items-center gap-2 rounded-3xl border border-slate-200/70 bg-white/95 p-3 text-center shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] transition-all duration-150 hover:-translate-y-1 hover:border-sky-300 hover:shadow-[0_18px_45px_-18px_rgba(56,189,248,0.45)] active:translate-y-0 dark:border-slate-800/70 dark:bg-slate-950/90 dark:hover:border-sky-700"
                  >
                    {game.isFeatured && (
                      <span className="absolute end-2 top-2 z-10 rounded-full bg-amber-500 p-1 text-white shadow-[0_4px_0_0_rgba(180,83,9,0.5)]" title={language === "ar" ? "مميزة" : "Featured"}>
                        <Sparkles className="h-3 w-3" />
                      </span>
                    )}
                    <div className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl ${hasCustomIcon ? "border border-border bg-muted/60" : game.colorClass} shadow-inner`}>
                      {hasCustomIcon ? (
                        <img
                          src={String(game.iconUrl)}
                          alt={language === "ar" ? `أيقونة ${game.nameAr}` : `${game.name} icon`}
                          className="h-12 w-12 rounded-2xl object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <IconComp className="h-10 w-10" />
                      )}
                      <span
                        className={`absolute -bottom-1 -end-1 h-4 w-4 rounded-full border-2 border-white ${statusDot} dark:border-slate-950`}
                        title={statusLabel ? (language === "ar" ? statusLabel.ar : statusLabel.en) : game.status}
                      />
                    </div>
                    <div className="min-h-[2.75rem] w-full">
                      <p className="line-clamp-2 text-sm font-bold leading-tight">{language === "ar" ? game.nameAr : game.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{game.key}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px] font-semibold">
                        {game._type === "multiplayer" ? "MP" : "SP"}
                      </Badge>
                      {Number(game.priceVex) > 0 && (
                        <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px]">
                          {game.priceVex} VEX
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" />
              {language === "ar"
                ? "اضغط على أي لعبة لفتح إعداداتها الكاملة"
                : "Click any game to open its full settings card"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:hidden">
            {sortedFilteredGames.map((game) => {
              const IconComp = getIconComponent(game.iconName);
              const hasCustomIcon = isCustomImagePath(game.iconUrl);
              return (
                <Card key={`${game._type}-${game.id}`} className={DATA_CARD_CLASS} data-testid={`row-game-${game.id}`}>
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${hasCustomIcon ? "border border-border bg-muted/60" : game.colorClass}`}>
                          {hasCustomIcon ? (
                            <img src={String(game.iconUrl)} alt={language === "ar" ? `أيقونة ${game.nameAr}` : `${game.name} icon`} className="h-8 w-8 rounded object-contain" loading="lazy" />
                          ) : (
                            <IconComp className="h-6 w-6" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{language === "ar" ? game.nameAr : game.name}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{game.key}</span>
                            <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{game._type === "multiplayer" ? "MP" : "SP"}</Badge>
                            {game.isFeatured && <Badge className="rounded-full border-none bg-amber-500 px-2 py-0 text-[10px] text-white">{language === "ar" ? "مميزة" : "Featured"}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleRequestMediaUpload(game, "icon")} disabled={uploadIconMutation.isPending} data-testid={`button-upload-icon-${game.id}`}>
                          <Upload className={`h-4 w-4 ${uploadIconMutation.isPending && iconUploadTarget?.id === game.id && mediaUploadMode === "icon" ? "animate-pulse" : ""}`} />
                        </Button>
                        <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleRequestMediaUpload(game, "background")} disabled={uploadIconMutation.isPending} data-testid={`button-upload-background-${game.id}`}>
                          <ImagePlus className={`h-4 w-4 ${uploadIconMutation.isPending && iconUploadTarget?.id === game.id && mediaUploadMode === "background" ? "animate-pulse" : ""}`} />
                        </Button>
                        <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleEdit(game)} data-testid={`button-edit-${game.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{language === "ar" ? "الفئة" : "Category"}</p>
                        <p className="mt-2 text-sm font-semibold">{getLocalizedCategoryLabel(game.category, language)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{language === "ar" ? "اللعب المجاني" : "Free Play"}</p>
                        <p className="mt-2 text-sm font-semibold">{formatFreePlayLabel(game.freePlayLimit, game.freePlayPeriod, language)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{language === "ar" ? "السعر (USD)" : "Price (USD)"}</p>
                        <p className="mt-2 text-sm font-semibold">{game.minBet} - {game.maxBet}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{language === "ar" ? "السعر (VEX)" : "Price (VEX)"}</p>
                        <p className="mt-2 text-sm font-semibold">{game.priceVex || "0"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={game.status}
                        onValueChange={(value) => toggleStatusMutation.mutate({ id: game.id, status: value, gameType: game._type })}
                        disabled={isStatusPending(game.id)}
                      >
                        <SelectTrigger className={`${INPUT_SURFACE_CLASS} ${STATUS_COLORS[game.status as keyof typeof STATUS_COLORS] || ""}`} data-testid={`select-status-${game.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" />{language === "ar" ? "نشطة" : "Active"}</span></SelectItem>
                          <SelectItem value="listed"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" />{language === "ar" ? "مدرجة" : "Listed"}</span></SelectItem>
                          <SelectItem value="inactive"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />{language === "ar" ? "خاملة" : "Inactive"}</span></SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        className={`${BUTTON_3D_PRIMARY_CLASS} h-10 w-10 shrink-0`}
                        onClick={() => quickToggleStatus(game)}
                        disabled={isStatusPending(game.id)}
                        title={game.status === "active" ? (language === "ar" ? "تعطيل سريع" : "Quick disable") : (language === "ar" ? "تفعيل سريع" : "Quick enable")}
                        data-testid={`button-toggle-status-${game.id}`}
                      >
                        <Power className={`h-4 w-4 ${isStatusPending(game.id) ? "animate-pulse" : ""}`} />
                      </Button>
                      +                    </div>
                  </SelectTrigger>
                  *** End Patch

                  <div className="flex flex-wrap gap-2">
                    {(game.displayLocations || []).map((loc) => {
                      const locInfo = DISPLAY_LOCATIONS.find((item) => item.key === loc);
                      if (!locInfo) return null;
                      const LocIcon = locInfo.icon;
                      return (
                        <Badge key={loc} variant="outline" className="rounded-full px-3 py-1 text-xs">
                          <LocIcon className="me-1 h-3 w-3" />
                          {language === "ar" ? locInfo.labelAr : locInfo.labelEn}
                        </Badge>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} data-testid={`button-actions-${game.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{language === "ar" ? "أماكن العرض" : "Display Locations"}</DropdownMenuLabel>
                        {DISPLAY_LOCATIONS.map((loc) => {
                          const LocIcon = loc.icon;
                          const currentLocations = Array.isArray(game.displayLocations) ? game.displayLocations : [];
                          const isInLocation = currentLocations.includes(loc.key);
                          return (
                            <DropdownMenuItem key={loc.key} onClick={() => toggleDisplayLocation(game, loc.key)} data-testid={`menu-toggle-${loc.key}-${game.id}`}>
                              <LocIcon className="h-4 w-4 me-2" />
                              {language === "ar" ? loc.labelAr : loc.labelEn}
                              {isInLocation && <Check className="ml-auto h-4 w-4 text-green-500" />}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        {displayLocationFilter !== "all" && (
                          <DropdownMenuItem onClick={() => { setDeleteGameId(game.id); setDeleteMode("remove_from_section"); }} data-testid={`menu-remove-from-section-${game.id}`}>
                            <X className="h-4 w-4 me-2" />
                            {language === "ar"
                              ? `إزالة من ${getLocalizedLocationLabel(displayLocationFilter, language)}`
                              : `Remove from ${getLocalizedLocationLabel(displayLocationFilter, language)}`}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setDeleteGameId(game.id); setDeleteMode("permanent"); }} data-testid={`menu-delete-${game.id}`}>
                          <Trash2 className="h-4 w-4 me-2" />
                          {language === "ar" ? "حذف نهائي" : "Delete Permanently"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
                </Card>
          );
            })}
        </div>

      <div className={`hidden xl:block ${TABLE_WRAP_CLASS}`}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[250px]">{language === "ar" ? "اللعبة" : "Game"}</TableHead>
              <TableHead>{language === "ar" ? "الفئة" : "Category"}</TableHead>
              <TableHead>{language === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead>{language === "ar" ? "السعر (USD)" : "Price (USD)"}</TableHead>
              <TableHead>{language === "ar" ? "السعر (VEX)" : "Price (VEX)"}</TableHead>
              <TableHead>{language === "ar" ? "اللعب المجاني" : "Free Plays"}</TableHead>
              <TableHead>{language === "ar" ? "أماكن العرض" : "Display"}</TableHead>
              <TableHead className="text-end">{language === "ar" ? "الإجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFilteredGames.map((game) => {
              const IconComp = getIconComponent(game.iconName);
              const hasCustomIcon = isCustomImagePath(game.iconUrl);
              return (
                <TableRow key={`${game._type}-${game.id}`} data-testid={`row-game-${game.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${hasCustomIcon ? "border border-border bg-muted/60" : game.colorClass}`}>
                        {hasCustomIcon ? (
                          <img src={String(game.iconUrl)} alt={language === "ar" ? `أيقونة ${game.nameAr}` : `${game.name} icon`} className="h-5 w-5 rounded object-contain" loading="lazy" />
                        ) : (
                          <IconComp className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{language === "ar" ? game.nameAr : game.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {game.key}
                          {game._type === "multiplayer" && <Badge variant="outline" className="text-[10px] px-1 py-0">MP</Badge>}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getLocalizedCategoryLabel(game.category, language)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select value={game.status} onValueChange={(value) => toggleStatusMutation.mutate({ id: game.id, status: value, gameType: game._type })}>
                      <SelectTrigger className={`w-32 ${STATUS_COLORS[game.status as keyof typeof STATUS_COLORS] || ""}`} data-testid={`select-status-${game.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" />{language === "ar" ? "نشطة" : "Active"}</span></SelectItem>
                        <SelectItem value="listed"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500" />{language === "ar" ? "مدرجة" : "Listed"}</span></SelectItem>
                        <SelectItem value="inactive"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />{language === "ar" ? "خاملة" : "Inactive"}</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-3 w-3" />
                      {game.minBet} - {game.maxBet}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-primary font-medium">
                      <Coins className="h-3 w-3" />
                      {game.priceVex || "0"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {game.freePlayLimit > 0 ? (
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Gift className="h-3 w-3" />
                        {formatFreePlayLabel(game.freePlayLimit, game.freePlayPeriod, language)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(game.displayLocations || []).map((loc) => {
                        const locInfo = DISPLAY_LOCATIONS.find((item) => item.key === loc);
                        if (!locInfo) return null;
                        const LocIcon = locInfo.icon;
                        return (
                          <Badge key={loc} variant="outline" className="text-xs">
                            <LocIcon className="h-3 w-3 me-1" />
                            {language === "ar" ? locInfo.labelAr : locInfo.labelEn}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleRequestMediaUpload(game, "icon")} disabled={uploadIconMutation.isPending} title={language === "ar" ? "رفع أيقونة من الجهاز" : "Upload icon from device"} data-testid={`button-upload-icon-${game.id}`}>
                        <Upload className={`h-4 w-4 ${uploadIconMutation.isPending && iconUploadTarget?.id === game.id && mediaUploadMode === "icon" ? "animate-pulse" : ""}`} />
                      </Button>
                      <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleRequestMediaUpload(game, "background")} disabled={uploadIconMutation.isPending} title={language === "ar" ? "رفع صورة خلفية من الجهاز" : "Upload background image from device"} data-testid={`button-upload-background-${game.id}`}>
                        <ImagePlus className={`h-4 w-4 ${uploadIconMutation.isPending && iconUploadTarget?.id === game.id && mediaUploadMode === "background" ? "animate-pulse" : ""}`} />
                      </Button>
                      <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} onClick={() => handleEdit(game)} data-testid={`button-edit-${game.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" className={`${BUTTON_3D_CLASS} h-10 w-10`} data-testid={`button-actions-${game.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{language === "ar" ? "أماكن العرض" : "Display Locations"}</DropdownMenuLabel>
                          {DISPLAY_LOCATIONS.map((loc) => {
                            const LocIcon = loc.icon;
                            const currentLocations = Array.isArray(game.displayLocations) ? game.displayLocations : [];
                            const isInLocation = currentLocations.includes(loc.key);
                            return (
                              <DropdownMenuItem key={loc.key} onClick={() => toggleDisplayLocation(game, loc.key)} data-testid={`menu-toggle-${loc.key}-${game.id}`}>
                                <LocIcon className="h-4 w-4 me-2" />
                                {language === "ar" ? loc.labelAr : loc.labelEn}
                                {isInLocation && <Check className="h-4 w-4 ml-auto text-green-500" />}
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                          {displayLocationFilter !== "all" && (
                            <DropdownMenuItem onClick={() => { setDeleteGameId(game.id); setDeleteMode("remove_from_section"); }} data-testid={`menu-remove-from-section-${game.id}`}>
                              <X className="h-4 w-4 me-2" />
                              {language === "ar"
                                ? `إزالة من ${getLocalizedLocationLabel(displayLocationFilter, language)}`
                                : `Remove from ${getLocalizedLocationLabel(displayLocationFilter, language)}`}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setDeleteGameId(game.id); setDeleteMode("permanent"); }} data-testid={`menu-delete-${game.id}`}>
                            <Trash2 className="h-4 w-4 me-2" />
                            {language === "ar" ? "حذف نهائي" : "Delete Permanently"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsFormOpen(false);
            setEditingGame(null);
            return;
          }
          setIsFormOpen(true);
        }}
      >
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <div className="p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>
                {editingGame
                  ? (language === "ar" ? "تعديل اللعبة" : "Edit Game")
                  : (language === "ar" ? "إضافة لعبة جديدة" : "Add New Game")
                }
              </DialogTitle>
              <DialogDescription>
                {language === "ar"
                  ? "قم بتعبئة تفاصيل اللعبة أدناه"
                  : "Fill in the game details below"
                }
              </DialogDescription>
            </DialogHeader>
            {isFormOpen && (
              <GameForm
                key={editingGame?.id ?? "new"}
                game={editingGame}
                gameType={editingGame ? editingGameType : "multiplayer"}
                onSuccess={handleFormSuccess}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingGame(null);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGameId} onOpenChange={(open) => {
        if (!open) {
          setDeleteGameId(null);
          setDeleteMode("permanent");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteMode === "remove_from_section"
                ? (language === "ar" ? "إزالة من القسم؟" : "Remove from section?")
                : (language === "ar" ? "حذف نهائي؟" : "Delete permanently?")
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "remove_from_section"
                ? (language === "ar"
                  ? `سيتم إزالة هذه اللعبة من "${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelAr || "هذا القسم"}". يمكنك إضافتها مرة أخرى لاحقاً.`
                  : `This game will be removed from "${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelEn || "this section"}". You can add it back later.`
                )
                : (language === "ar"
                  ? "سيتم حذف هذه اللعبة نهائياً. لا يمكن التراجع عن هذا الإجراء."
                  : "This game will be permanently deleted. This action cannot be undone."
                )
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {language === "ar" ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteGameId) return;
                if (deleteMode === "remove_from_section") {
                  const game = allGames.find(g => g.id === deleteGameId);
                  if (game) {
                    const currentLocations = Array.isArray(game.displayLocations) ? game.displayLocations : [];
                    const newLocations = currentLocations.filter(l => l !== displayLocationFilter);
                    updateDisplayLocationsMutation.mutate({ id: deleteGameId, displayLocations: newLocations, gameType: game._type });
                  }
                  setDeleteGameId(null);
                } else {
                  const game = allGames.find(g => g.id === deleteGameId);
                  deleteMutation.mutate({ id: deleteGameId, gameType: game?._type || "multiplayer" });
                }
              }}
              className={deleteMode === "permanent" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="button-confirm-delete"
            >
              {deleteMode === "remove_from_section"
                ? (language === "ar" ? "إزالة" : "Remove")
                : (language === "ar" ? "حذف" : "Delete")
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
