import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  MoreVertical,
  Check,
  X
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
  return {
    id: mp.id,
    _type: "multiplayer",
    _original: mp,
    iconUrl,
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
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
            description: data.descriptionEn || "",
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
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
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
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
                    <Input {...field} type="number" step="0.01" data-testid="input-min-stake" />
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
                    <Input {...field} type="number" step="0.01" data-testid="input-max-stake" />
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
                    <Input {...field} type="number" step="0.01" placeholder="0.05" data-testid="input-house-fee" />
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
                  <Input {...field} type="number" step="0.01" placeholder="0" data-testid="input-price-vex" />
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
                    <Input {...field} type="number" min="0" data-testid="input-free-play-limit" />
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
                  <Input {...field} type="number" min="1" data-testid="input-min-players" />
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
                  <Input {...field} type="number" min="1" data-testid="input-max-players" />
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

  // Merge both types into unified array
  const allGames: UnifiedGame[] = [
    ...mpGames.map(toUnifiedGame),
    ...spGames.map(toUnifiedGameFromSingle),
  ];

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
    },
    onError: (error: Error) => {
      toast({
        title: language === "ar" ? "فشل تحديث الحالة" : "Failed to update status",
        description: error.message,
        variant: "destructive"
      });
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
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
    mutationFn: async ({ game, file }: { game: UnifiedGame; file: File }) => {
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
        ? { iconName: uploadedUrl }
        : { imageUrl: uploadedUrl, thumbnailUrl: uploadedUrl };

      await adminFetch(endpoint, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      return uploadedUrl;
    },
    onSuccess: () => {
      toast({
        title: language === "ar" ? "تم رفع الأيقونة بنجاح" : "Icon uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
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

  const handleRequestIconUpload = (game: UnifiedGame) => {
    if (uploadIconMutation.isPending) return;
    setIconUploadTarget(game);
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

    uploadIconMutation.mutate({ game: iconUploadTarget, file });
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
          if (data.type === "game_config_changed") {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/multiplayer-games"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6" />
          {language === "ar" ? "إدارة الألعاب" : "Games Management"}
          <Badge variant="secondary" className="text-sm font-normal">
            {allGames.length}
          </Badge>
        </h1>
        <Button onClick={() => { setEditingGame(null); setIsFormOpen(true); }} data-testid="button-add-game">
          <Plus className="h-4 w-4 me-2" />
          {language === "ar" ? "إضافة لعبة" : "Add Game"}
        </Button>
      </div>

      <input
        ref={iconFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleIconFileChange}
        className="hidden"
        data-testid="input-upload-game-icon"
      />

      {/* Display Location Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={displayLocationFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setDisplayLocationFilter("all")}
          data-testid="tab-location-all"
          className="gap-2"
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
              variant={displayLocationFilter === loc.key ? "default" : "outline"}
              size="sm"
              onClick={() => setDisplayLocationFilter(loc.key)}
              data-testid={`tab-location-${loc.key}`}
              className="gap-2"
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

      {/* Search and Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === "ar" ? "بحث..." : "Search..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-10"
            data-testid="input-search"
          />
        </div>

        <Select value={activeCategory} onValueChange={setActiveCategory}>
          <SelectTrigger className="w-40" data-testid="select-category-filter">
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
          <SelectTrigger className="w-36" data-testid="select-status-filter">
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
      </div>

      {filteredGames.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Gamepad2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              {displayLocationFilter !== "all"
                ? (language === "ar"
                  ? `لا توجد ألعاب في قسم "${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelAr}"`
                  : `No games in "${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelEn}" section`)
                : (language === "ar"
                  ? "لا توجد ألعاب تطابق الفلاتر المحددة"
                  : "No games match the selected filters")
              }
            </p>
            {displayLocationFilter !== "all" && (
              <p className="text-muted-foreground text-sm mb-4">
                {language === "ar"
                  ? "يمكنك إضافة ألعاب لهذا القسم من قسم 'جميع الألعاب'"
                  : "You can add games to this section from 'All Games'"}
              </p>
            )}
            <div className="flex items-center justify-center gap-2">
              {displayLocationFilter !== "all" && (
                <Button variant="outline" onClick={() => setDisplayLocationFilter("all")}>
                  <LayoutGrid className="h-4 w-4 me-2" />
                  {language === "ar" ? "عرض جميع الألعاب" : "View All Games"}
                </Button>
              )}
              <Button onClick={() => { setEditingGame(null); setIsFormOpen(true); }}>
                <Plus className="h-4 w-4 me-2" />
                {language === "ar" ? "إضافة لعبة جديدة" : "Add New Game"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
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
              {filteredGames.map((game) => {
                const IconComp = getIconComponent(game.iconName);
                const categoryInfo = GAME_CATEGORIES.find((c) => c.key === game.category);
                const hasCustomIcon = isCustomImagePath(game.iconUrl);
                return (
                  <TableRow key={`${game._type}-${game.id}`} data-testid={`row-game-${game.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${hasCustomIcon ? "bg-muted/60 border border-border" : game.colorClass}`}>
                          {hasCustomIcon ? (
                            <img
                              src={String(game.iconUrl)}
                              alt={language === "ar" ? `أيقونة ${game.nameAr}` : `${game.name} icon`}
                              className="h-5 w-5 rounded object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <IconComp className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{language === "ar" ? game.nameAr : game.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {game.key}
                            {game._type === "multiplayer" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">MP</Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {language === "ar" ? categoryInfo?.labelAr : categoryInfo?.labelEn}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={game.status}
                        onValueChange={(value) => toggleStatusMutation.mutate({ id: game.id, status: value, gameType: game._type })}
                      >
                        <SelectTrigger className={`w-32 ${STATUS_COLORS[game.status as keyof typeof STATUS_COLORS] || ""}`} data-testid={`select-status-${game.id}`}>
                          <SelectValue />
                        </SelectTrigger>
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
                          {game.freePlayLimit}/{game.freePlayPeriod === "daily" ? (language === "ar" ? "يوم" : "day") : game.freePlayPeriod === "weekly" ? (language === "ar" ? "أسبوع" : "week") : (language === "ar" ? "شهر" : "month")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(game.displayLocations || []).map((loc) => {
                          const locInfo = DISPLAY_LOCATIONS.find((l) => l.key === loc);
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
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRequestIconUpload(game)}
                          disabled={uploadIconMutation.isPending}
                          title={language === "ar" ? "رفع أيقونة من الجهاز" : "Upload icon from device"}
                          data-testid={`button-upload-icon-${game.id}`}
                        >
                          <Upload className={`h-4 w-4 ${uploadIconMutation.isPending && iconUploadTarget?.id === game.id ? "animate-pulse" : ""}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(game)}
                          data-testid={`button-edit-${game.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-actions-${game.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                              {language === "ar" ? "أماكن العرض" : "Display Locations"}
                            </DropdownMenuLabel>
                            {DISPLAY_LOCATIONS.map((loc) => {
                              const LocIcon = loc.icon;
                              const currentLocations = Array.isArray(game.displayLocations) ? game.displayLocations : [];
                              const isInLocation = currentLocations.includes(loc.key);
                              return (
                                <DropdownMenuItem
                                  key={loc.key}
                                  onClick={() => toggleDisplayLocation(game, loc.key)}
                                  data-testid={`menu-toggle-${loc.key}-${game.id}`}
                                >
                                  <LocIcon className="h-4 w-4 me-2" />
                                  {language === "ar" ? loc.labelAr : loc.labelEn}
                                  {isInLocation && <Check className="h-4 w-4 ml-auto text-green-500" />}
                                </DropdownMenuItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                            {displayLocationFilter !== "all" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteGameId(game.id);
                                  setDeleteMode("remove_from_section");
                                }}
                                data-testid={`menu-remove-from-section-${game.id}`}
                              >
                                <X className="h-4 w-4 me-2" />
                                {language === "ar"
                                  ? `إزالة من ${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelAr || "هذا القسم"}`
                                  : `Remove from ${DISPLAY_LOCATIONS.find(l => l.key === displayLocationFilter)?.labelEn || "this section"}`
                                }
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setDeleteGameId(game.id);
                                setDeleteMode("permanent");
                              }}
                              data-testid={`menu-delete-${game.id}`}
                            >
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
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
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
              onCancel={() => setIsFormOpen(false)}
            />
          )}
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
    </div>
  );
}
