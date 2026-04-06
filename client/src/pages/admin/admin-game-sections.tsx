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

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Game Sections</h1>
          <p className="text-muted-foreground">Customize game category names and appearance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => initializeSectionsMutation.mutate()}
            disabled={initializeSectionsMutation.isPending}
            data-testid="button-init-sections"
          >
            <RefreshCw className={`h-4 w-4 me-2 ${initializeSectionsMutation.isPending ? "animate-spin" : ""}`} />
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
              <Button data-testid="button-add-section">
                <Plus className="h-4 w-4 me-2" />
                Add Section
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Key (unique identifier)</Label>
                  <Input
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    placeholder="e.g., crash, slots, dice"
                    disabled={!!editingSection}
                    data-testid="input-section-key"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name (English)</Label>
                    <Input
                      value={formData.nameEn}
                      onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                      placeholder="Crash Games"
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
                      data-testid="input-section-name-ar"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Icon</Label>
                    <Select
                      value={formData.icon}
                      onValueChange={(value) => setFormData({ ...formData, icon: value })}
                    >
                      <SelectTrigger data-testid="select-section-icon">
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
                    <Select
                      value={formData.iconColor}
                      onValueChange={(value) => setFormData({ ...formData, iconColor: value })}
                    >
                      <SelectTrigger data-testid="select-section-color">
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

                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                    data-testid="input-section-sort"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    data-testid="switch-section-active"
                  />
                  <Label>Active</Label>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-section"
                >
                  {editingSection ? "Update Section" : "Create Section"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {sections.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No sections configured. Click "Initialize Sections" to import existing categories, or "Add Section" to create one manually.
            </CardContent>
          </Card>
        ) : (
          sections.map((section) => {
            const IconComponent = getIconComponent(section.icon);
            return (
              <Card key={section.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className={`p-2 rounded-lg bg-muted`}>
                        <IconComponent className={`h-5 w-5 ${section.iconColor}`} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{section.nameEn}</h3>
                        <Badge variant={section.isActive ? "default" : "secondary"}>
                          {section.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{section.key}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" dir="rtl">{section.nameAr}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(section)}
                        data-testid={`button-edit-section-${section.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(section.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-section-${section.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
