import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Plus, Pencil, Trash2, Award, Loader2, Star, Trophy, Crown, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as LucideIcons from "lucide-react";

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
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch");
  }
  return res.json();
}

interface BadgeCatalog {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  iconUrl: string | null;
  iconName: string | null;
  color: string | null;
  category: string | null;
  requirement: string | null;
  points: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

const badgeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  iconName: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color").optional().or(z.literal("")),
  category: z.enum(["achievement", "vip", "special", "event"]),
  points: z.coerce.number().min(0, "Points must be positive"),
  isActive: z.boolean().default(true),
});

type BadgeFormData = z.infer<typeof badgeSchema>;

const categoryIcons: Record<string, typeof Star> = {
  achievement: Trophy,
  vip: Crown,
  special: Sparkles,
  event: Star,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (IconComponent) {
    return <IconComponent className={className} />;
  }
  return <Award className={className} />;
}

export default function AdminBadgesPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBadge, setEditingBadge] = useState<BadgeCatalog | null>(null);
  const [deleteBadge, setDeleteBadge] = useState<BadgeCatalog | null>(null);

  const form = useForm<BadgeFormData>({
    resolver: zodResolver(badgeSchema),
    defaultValues: {
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      iconName: "Award",
      color: "#10b981",
      category: "achievement",
      points: 0,
      isActive: true,
    },
  });

  const { data: badges, isLoading } = useQuery<BadgeCatalog[]>({
    queryKey: ["/api/admin/badges"],
    queryFn: () => adminFetch("/api/admin/badges"),
  });

  const createMutation = useMutation({
    mutationFn: async (data: BadgeFormData) => {
      return adminFetch("/api/admin/badges", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
      toast({ title: isArabic ? "تم الإنشاء" : "Created", description: isArabic ? "تمت إضافة الشارة بنجاح" : "Badge added successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BadgeFormData> }) => {
      return adminFetch(`/api/admin/badges/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
      toast({ title: isArabic ? "تم التحديث" : "Updated", description: isArabic ? "تم تحديث الشارة بنجاح" : "Badge updated successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminFetch(`/api/admin/badges/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
      toast({ title: isArabic ? "تم الحذف" : "Deleted", description: isArabic ? "تم حذف الشارة" : "Badge deleted" });
      setDeleteBadge(null);
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
      setDeleteBadge(null);
    },
  });

  const openCreateDialog = () => {
    form.reset({
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      iconName: "Award",
      color: "#10b981",
      category: "achievement",
      points: 0,
      isActive: true,
    });
    setEditingBadge(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (badge: BadgeCatalog) => {
    form.reset({
      name: badge.name,
      nameAr: badge.nameAr || "",
      description: badge.description || "",
      descriptionAr: badge.descriptionAr || "",
      iconName: badge.iconName || "Award",
      color: badge.color || "#10b981",
      category: (badge.category as "achievement" | "vip" | "special" | "event") || "achievement",
      points: badge.points,
      isActive: badge.isActive,
    });
    setEditingBadge(badge);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingBadge(null);
    form.reset();
  };

  const onSubmit = (data: BadgeFormData) => {
    if (editingBadge) {
      updateMutation.mutate({ id: editingBadge.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      achievement: { en: "Achievement", ar: "إنجاز" },
      vip: { en: "VIP", ar: "VIP" },
      special: { en: "Special", ar: "خاص" },
      event: { en: "Event", ar: "حدث" },
    };
    return labels[category]?.[isArabic ? "ar" : "en"] || category;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {isArabic ? "إدارة الشارات" : "Badge Management"}
          </h1>
          <p className="text-muted-foreground">
            {isArabic ? "إدارة شارات ومكافآت المستخدمين" : "Manage user badges and rewards"}
          </p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-badge">
          <Plus className="me-2 h-4 w-4" />
          {isArabic ? "إضافة شارة" : "Add Badge"}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {badges?.map((badge) => {
            const CategoryIcon = categoryIcons[badge.category || "achievement"] || Star;
            return (
              <Card key={badge.id} data-testid={`card-badge-${badge.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: badge.color || "#10b981" }}
                      >
                        <DynamicIcon name={badge.iconName || "Award"} className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{isArabic && badge.nameAr ? badge.nameAr : badge.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            <CategoryIcon className="h-3 w-3 me-1" />
                            {getCategoryLabel(badge.category || "achievement")}
                          </Badge>
                          <Badge variant={badge.isActive ? "default" : "secondary"} className="text-xs">
                            {badge.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(badge)}
                        data-testid={`button-edit-badge-${badge.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteBadge(badge)}
                        data-testid={`button-delete-badge-${badge.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {isArabic && badge.descriptionAr ? badge.descriptionAr : badge.description || (isArabic ? "لا يوجد وصف" : "No description")}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">{badge.points} {isArabic ? "نقطة" : "points"}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!badges?.length && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{isArabic ? "لا توجد شارات" : "No badges found"}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBadge
                ? (isArabic ? "تعديل الشارة" : "Edit Badge")
                : (isArabic ? "إضافة شارة جديدة" : "Add New Badge")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "الاسم (إنجليزي)" : "Name (English)"}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-badge-name" />
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
                      <FormLabel>{isArabic ? "الاسم (عربي)" : "Name (Arabic)"}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" data-testid="input-badge-name-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isArabic ? "الوصف (إنجليزي)" : "Description (English)"}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="input-badge-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descriptionAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isArabic ? "الوصف (عربي)" : "Description (Arabic)"}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} dir="rtl" data-testid="input-badge-description-ar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="iconName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "اسم الأيقونة" : "Icon Name"}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Award, Star, Trophy..." data-testid="input-badge-icon" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "اللون" : "Color"}</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input {...field} placeholder="#10b981" data-testid="input-badge-color" />
                          <input
                            type="color"
                            value={field.value || "#10b981"}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-10 h-10 rounded border cursor-pointer"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "الفئة" : "Category"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-badge-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="achievement">{isArabic ? "إنجاز" : "Achievement"}</SelectItem>
                          <SelectItem value="vip">VIP</SelectItem>
                          <SelectItem value="special">{isArabic ? "خاص" : "Special"}</SelectItem>
                          <SelectItem value="event">{isArabic ? "حدث" : "Event"}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? "النقاط" : "Points"}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} data-testid="input-badge-points" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-badge-active"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">{isArabic ? "نشط" : "Active"}</FormLabel>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-badge">
                  {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {editingBadge ? (isArabic ? "تحديث" : "Update") : (isArabic ? "إضافة" : "Add")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteBadge}
        title={isArabic ? "تأكيد الحذف" : "Confirm Deletion"}
        description={
          isArabic
            ? `هل أنت متأكد من حذف الشارة "${deleteBadge?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to delete the badge "${deleteBadge?.name}"? This action cannot be undone.`
        }
        variant="destructive"
        confirmLabel={isArabic ? "حذف" : "Delete"}
        cancelLabel={isArabic ? "إلغاء" : "Cancel"}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteBadge && deleteMutation.mutate(deleteBadge.id)}
        onCancel={() => setDeleteBadge(null)}
      />
    </div>
  );
}
