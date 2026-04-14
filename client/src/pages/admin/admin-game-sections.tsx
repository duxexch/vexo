import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Plus, Trash2, Edit, GripVertical, TrendingUp, Dices, CircleDot,
  Star, Trophy, Gamepad2, Target, Zap, Crown, Coins, RefreshCw
} from "lucide-react";
import type { GameSection } from "@shared/schema";

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
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

const iconOptions = [
  { value: "TrendingUp", label: "Trending Up", Icon: TrendingUp },
  { value: "Dices", label: "Dice", Icon: Dices },
  { value: "CircleDot", label: "Circle", Icon: CircleDot },
  { value: "Star", label: "Star", Icon: Star },
  { value: "Trophy", label: "Trophy", Icon: Trophy },
  { value: "Gamepad2", label: "Gamepad", Icon: Gamepad2 },
  { value: "Target", label: "Target", Icon: Target },
  { value: "Zap", label: "Zap", Icon: Zap },
  { value: "Crown", label: "Crown", Icon: Crown },
  { value: "Coins", label: "Coins", Icon: Coins },
];

const colorOptions = [
  { value: "text-red-500", label: "Red" },
  { value: "text-blue-500", label: "Blue" },
  { value: "text-green-500", label: "Green" },
  { value: "text-yellow-500", label: "Yellow" },
  { value: "text-purple-500", label: "Purple" },
  { value: "text-orange-500", label: "Orange" },
  { value: "text-pink-500", label: "Pink" },
  { value: "text-cyan-500", label: "Cyan" },
  { value: "text-primary", label: "Primary" },
];

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 sm:max-w-2xl";

function getIconComponent(iconName: string) {
  const found = iconOptions.find((o) => o.value === iconName);
  return found?.Icon || Gamepad2;
}

export default function AdminGameSectionsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<GameSection | null>(null);
  const [formData, setFormData] = useState({
    key: "",
    nameEn: "",
    nameAr: "",
    icon: "Gamepad2",
    iconColor: "text-primary",
    sortOrder: 0,
    isActive: true,
  });

  const { data: sections = [], isLoading } = useQuery<GameSection[]>({
    queryKey: ["/api/admin/game-sections"],
    queryFn: () => adminFetch("/api/admin/game-sections"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      adminFetch("/api/admin/game-sections", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/game-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sections"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Section created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create section", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      adminFetch(`/api/admin/game-sections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/game-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sections"] });
      setIsDialogOpen(false);
      setEditingSection(null);
      resetForm();
      toast({ title: "Section updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update section", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/game-sections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/game-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sections"] });
      toast({ title: "Section deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete section", variant: "destructive" });
    },
  });

  const initializeSectionsMutation = useMutation({
    mutationFn: () =>
      adminFetch("/api/admin/game-sections/initialize", {
        method: "POST",
      }),
    onSuccess: (result: { inserted?: number; skippedExisting?: number; discovered?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/game-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sections"] });

      const inserted = Number(result?.inserted ?? 0);
      const skipped = Number(result?.skippedExisting ?? 0);
      const discovered = Number(result?.discovered ?? 0);

      if (inserted > 0) {
        toast({
          title: "Sections initialized",
          description: `Added ${inserted} section${inserted === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped} existing.` : "."}`,
        });
        return;
      }

      toast({
        title: "No new sections",
        description: discovered > 0
          ? `All ${discovered} discovered section${discovered === 1 ? "" : "s"} already exist.`
          : "No game categories were found to initialize.",
      });
    },
    onError: () => {
      toast({ title: "Failed to initialize sections", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      key: "",
      nameEn: "",
      nameAr: "",
      icon: "Gamepad2",
      iconColor: "text-primary",
      sortOrder: 0,
      isActive: true,
    });
  };

  const handleEdit = (section: GameSection) => {
    setEditingSection(section);
    setFormData({
      key: section.key,
      nameEn: section.nameEn,
      nameAr: section.nameAr,
      icon: section.icon,
      iconColor: section.iconColor,
      sortOrder: section.sortOrder,
      isActive: section.isActive,
    });
    setIsDialogOpen(true);
  };

  const validateForm = (): string | null => {
    if (!formData.key.trim()) return "Key is required";
    if (!formData.nameEn.trim()) return "English name is required";
    if (!formData.nameAr.trim()) return "Arabic name is required";
    if (isNaN(formData.sortOrder)) return "Sort order must be a valid number";
    return null;
  };

  const handleSubmit = () => {
    const error = validateForm();
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }

    const sanitizedData = {
      ...formData,
      sortOrder: formData.sortOrder || 0,
    };

    if (editingSection) {
      updateMutation.mutate({ id: editingSection.id, data: sanitizedData });
    } else {
      createMutation.mutate(sanitizedData);
    }
  };

  const activeSectionsCount = sections.filter((section) => section.isActive).length;
  const inactiveSectionsCount = sections.length - activeSectionsCount;
  const uniqueIconsCount = new Set(sections.map((section) => section.icon)).size;
  const sortedSections = [...sections].sort((left, right) => left.sortOrder - right.sortOrder || left.nameEn.localeCompare(right.nameEn));
  const FormPreviewIcon = getIconComponent(formData.icon);

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <div className="h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
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
              <GripVertical className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Game Sections</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Control storefront categories, labels, icon styling, and activation state with a cleaner mobile-first admin surface.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              className={BUTTON_3D_CLASS}
              onClick={() => initializeSectionsMutation.mutate()}
              disabled={initializeSectionsMutation.isPending}
              data-testid="button-init-sections"
            >
              <RefreshCw className={`me-2 h-4 w-4 ${initializeSectionsMutation.isPending ? "animate-spin" : ""}`} />
              {initializeSectionsMutation.isPending ? "Initializing..." : "Initialize Sections"}
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingSection(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button className={BUTTON_3D_PRIMARY_CLASS} data-testid="button-add-section">
                  <Plus className="me-2 h-4 w-4" />
                  Add Section
                </Button>
              </DialogTrigger>
              <DialogContent className={DIALOG_SURFACE_CLASS}>
                <div className="space-y-5 p-5 sm:p-6">
                  <DialogHeader>
                    <DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-950">
                      <FormPreviewIcon className={`h-5 w-5 ${formData.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Live preview</p>
                      <p className="text-xs text-muted-foreground">Icon, name, and status update as you edit the section.</p>
                    </div>
                    <Badge variant={formData.isActive ? "default" : "secondary"} className="ms-auto">
                      {formData.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Key (unique identifier)</Label>
                      <Input
                        value={formData.key}
                        onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                        placeholder="e.g., crash, slots, dice"
                        disabled={!!editingSection}
                        className={INPUT_SURFACE_CLASS}
                        data-testid="input-section-key"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Name (English)</Label>
                        <Input
                          value={formData.nameEn}
                          onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                          placeholder="Crash Games"
                          className={INPUT_SURFACE_CLASS}
                          data-testid="input-section-name-en"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Name (Arabic)</Label>
                        <Input
                          value={formData.nameAr}
                          onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                          placeholder="ألعاب الانهيار"
                          dir="rtl"
                          className={INPUT_SURFACE_CLASS}
                          data-testid="input-section-name-ar"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Icon</Label>
                        <Select value={formData.icon} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                          <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-section-icon">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {iconOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <option.Icon className="h-4 w-4" />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Icon Color</Label>
                        <Select value={formData.iconColor} onValueChange={(value) => setFormData({ ...formData, iconColor: value })}>
                          <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-section-color">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {colorOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`h-3 w-3 rounded-full ${option.value.replace('text-', 'bg-')}`} />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="space-y-2">
                        <Label>Sort Order</Label>
                        <Input
                          type="number"
                          value={formData.sortOrder}
                          onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                          className={INPUT_SURFACE_CLASS}
                          data-testid="input-section-sort"
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:min-w-[180px]">
                        <Label htmlFor="section-active-switch">Active</Label>
                        <Switch
                          id="section-active-switch"
                          checked={formData.isActive}
                          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                          data-testid="switch-section-active"
                        />
                      </div>
                    </div>

                    <Button
                      className={`${BUTTON_3D_PRIMARY_CLASS} w-full`}
                      onClick={handleSubmit}
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-section"
                    >
                      {editingSection ? "Update Section" : "Create Section"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <GripVertical className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Total Sections</p>
              <p className="mt-1 text-2xl font-bold">{sections.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Active</p>
              <p className="mt-1 text-2xl font-bold">{activeSectionsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <CircleDot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Inactive</p>
              <p className="mt-1 text-2xl font-bold">{inactiveSectionsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Icons Used</p>
              <p className="mt-1 text-2xl font-bold">{uniqueIconsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={SURFACE_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Configured Sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300/80 p-10 text-center text-muted-foreground dark:border-slate-700">
              No sections configured. Click "Initialize Sections" to import existing categories, or "Add Section" to create one manually.
            </div>
          ) : (
            sortedSections.map((section) => {
              const IconComponent = getIconComponent(section.icon);
              return (
                <Card key={section.id} className={DATA_CARD_CLASS}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <div className="flex items-center gap-2 pt-1">
                          <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                          <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
                            <IconComponent className={`h-5 w-5 ${section.iconColor}`} />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{section.nameEn}</h3>
                            <Badge variant={section.isActive ? "default" : "secondary"}>
                              {section.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{section.key}</Badge>
                            <Badge variant="outline">Sort {section.sortOrder}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground" dir="rtl">{section.nameAr}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                          onClick={() => handleEdit(section)}
                          data-testid={`button-edit-section-${section.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                          onClick={() => deleteMutation.mutate(section.id)}
                          data-testid={`button-delete-section-${section.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
