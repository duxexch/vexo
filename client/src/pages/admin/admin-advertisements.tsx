import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  CheckCircle2,
  Code,
  Edit,
  GripVertical,
  Image,
  Link,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import type { Advertisement } from "@shared/schema";

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const BUTTON_3D_DESTRUCTIVE_CLASS = "rounded-2xl border border-red-500 bg-red-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(185,28,28,0.35)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-red-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(185,28,28,0.35)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[128px] rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-y-auto rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

const typeIcons: Record<string, any> = {
  image: Image,
  video: Video,
  link: Link,
  embed: Code,
};

function truncateText(value: string | null | undefined, maxLength = 54) {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getTypeLabel(type: Advertisement["type"], isArabic: boolean) {
  switch (type) {
    case "image":
      return isArabic ? "صورة" : "Image";
    case "video":
      return isArabic ? "فيديو" : "Video";
    case "link":
      return isArabic ? "رابط" : "Link";
    case "embed":
      return isArabic ? "كود مضمّن" : "Embed";
    default:
      return type;
  }
}

function getContentSummary(ad: Advertisement, isArabic: boolean) {
  if (ad.type === "embed") {
    return isArabic ? "كود مضمن جاهز" : "Embed code configured";
  }
  if (ad.assetUrl) {
    return truncateText(ad.assetUrl);
  }
  if (ad.targetUrl) {
    return truncateText(ad.targetUrl);
  }
  return isArabic ? "لا يوجد أصل مرتبط" : "No asset configured";
}

function getTargetSummary(ad: Advertisement, isArabic: boolean) {
  if (ad.type === "embed") {
    return isArabic ? "يظهر داخل السطح" : "Inline placement";
  }
  if (ad.targetUrl) {
    return truncateText(ad.targetUrl);
  }
  return isArabic ? "بدون وجهة نقر" : "No click target";
}

export default function AdminAdvertisementsPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const isArabic = language === "ar";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    titleAr: "",
    type: "image" as "image" | "video" | "link" | "embed",
    assetUrl: "",
    targetUrl: "",
    embedCode: "",
    displayDuration: 5000,
    sortOrder: 0,
    isActive: true,
  });

  const { data: ads = [], isLoading } = useQuery<Advertisement[]>({
    queryKey: ["/api/admin/advertisements"],
    queryFn: () => adminFetch("/api/admin/advertisements"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      adminFetch("/api/admin/advertisements", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: isArabic ? "تم إنشاء الإعلان" : "Advertisement created successfully",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "فشل إنشاء الإعلان" : "Failed to create advertisement",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      adminFetch(`/api/admin/advertisements/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      setIsDialogOpen(false);
      setEditingAd(null);
      resetForm();
      toast({
        title: isArabic ? "تم تحديث الإعلان" : "Advertisement updated successfully",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "فشل تحديث الإعلان" : "Failed to update advertisement",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/advertisements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      toast({
        title: isArabic ? "تم حذف الإعلان" : "Advertisement deleted",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "فشل حذف الإعلان" : "Failed to delete advertisement",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      titleAr: "",
      type: "image",
      assetUrl: "",
      targetUrl: "",
      embedCode: "",
      displayDuration: 5000,
      sortOrder: 0,
      isActive: true,
    });
  };

  const handleEdit = (ad: Advertisement) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title,
      titleAr: ad.titleAr || "",
      type: ad.type as "image" | "video" | "link" | "embed",
      assetUrl: ad.assetUrl || "",
      targetUrl: ad.targetUrl || "",
      embedCode: ad.embedCode || "",
      displayDuration: ad.displayDuration,
      sortOrder: ad.sortOrder,
      isActive: ad.isActive,
    });
    setIsDialogOpen(true);
  };

  const validateForm = (): string | null => {
    if (!formData.title.trim()) {
      return isArabic ? "عنوان الإعلان مطلوب" : "Title is required";
    }
    if ((formData.type === "image" || formData.type === "video") && !formData.assetUrl.trim()) {
      return isArabic ? "رابط الأصل مطلوب للصور والفيديو" : "Asset URL is required for image/video types";
    }
    if (formData.type === "embed" && !formData.embedCode.trim()) {
      return isArabic ? "كود التضمين مطلوب" : "Embed code is required for embed type";
    }
    if (Number.isNaN(formData.displayDuration) || formData.displayDuration < 1000) {
      return isArabic ? "مدة العرض يجب ألا تقل عن 1000 مللي ثانية" : "Display duration must be at least 1000ms";
    }
    if (Number.isNaN(formData.sortOrder)) {
      return isArabic ? "ترتيب الظهور يجب أن يكون رقمًا صالحًا" : "Sort order must be a valid number";
    }
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
      displayDuration: Math.max(1000, formData.displayDuration || 5000),
      sortOrder: formData.sortOrder || 0,
    };

    if (editingAd) {
      updateMutation.mutate({ id: editingAd.id, data: sanitizedData });
    } else {
      createMutation.mutate(sanitizedData);
    }
  };

  const sortedAds = [...ads].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return Number(right.isActive) - Number(left.isActive);
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.title.localeCompare(right.title);
  });

  const activeAdsCount = ads.filter((ad) => ad.isActive).length;
  const mediaAdsCount = ads.filter((ad) => ad.type === "image" || ad.type === "video").length;
  const linkedAdsCount = ads.filter((ad) => ad.type === "link" || ad.type === "embed").length;

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
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
              <Image className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {isArabic ? "الإعلانات" : "Advertisements"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {isArabic
                  ? "إدارة إعلانات الكاروسيل الظاهرة داخل صفحة الألعاب"
                  : "Manage carousel advertisements shown across the games page"}
              </p>
            </div>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingAd(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                className={BUTTON_3D_PRIMARY_CLASS}
                onClick={() => {
                  setEditingAd(null);
                  resetForm();
                }}
                data-testid="button-add-advertisement"
              >
                <Plus className="me-2 h-4 w-4" />
                {isArabic ? "إضافة إعلان" : "Add Advertisement"}
              </Button>
            </DialogTrigger>
            <DialogContent className={`${DIALOG_SURFACE_CLASS} sm:max-w-2xl`}>
              <div className="space-y-4 p-5 sm:p-6">
                <DialogHeader>
                  <DialogTitle>
                    {editingAd
                      ? isArabic
                        ? "تعديل الإعلان"
                        : "Edit Advertisement"
                      : isArabic
                        ? "إضافة إعلان"
                        : "Add Advertisement"}
                  </DialogTitle>
                  <DialogDescription>
                    {isArabic
                      ? "حدّد النوع، أصل الإعلان، وجهة النقر، ومدة الظهور مع الحفاظ على ترتيب العرض."
                      : "Choose the ad type, media source, click destination, and display timing while preserving slot order."}
                  </DialogDescription>
                </DialogHeader>

                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {isArabic ? "نوع الإعلان الحالي" : "Current Ad Type"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getTypeLabel(formData.type, isArabic)}
                        </p>
                      </div>
                      <Badge variant="outline" className="w-fit">
                        {formData.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "متوقف" : "Inactive")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{isArabic ? "العنوان بالإنجليزية" : "Title (English)"}</Label>
                    <Input
                      value={formData.title}
                      onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                      placeholder={isArabic ? "عنوان الإعلان" : "Advertisement title"}
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isArabic ? "العنوان بالعربية" : "Title (Arabic)"}</Label>
                    <Input
                      value={formData.titleAr}
                      onChange={(event) => setFormData({ ...formData, titleAr: event.target.value })}
                      placeholder={isArabic ? "عنوان الإعلان" : "Arabic title"}
                      dir="rtl"
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-title-ar"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{isArabic ? "نوع الإعلان" : "Type"}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value as "image" | "video" | "link" | "embed" })}
                  >
                    <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-ad-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">{isArabic ? "صورة" : "Image"}</SelectItem>
                      <SelectItem value="video">{isArabic ? "فيديو" : "Video"}</SelectItem>
                      <SelectItem value="link">{isArabic ? "رابط" : "Link"}</SelectItem>
                      <SelectItem value="embed">{isArabic ? "كود مضمّن" : "Embed Code"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(formData.type === "image" || formData.type === "video") && (
                  <div className="space-y-2">
                    <Label>{isArabic ? "رابط الأصل" : "Asset URL"}</Label>
                    <Input
                      value={formData.assetUrl}
                      onChange={(event) => setFormData({ ...formData, assetUrl: event.target.value })}
                      placeholder="https://example.com/image.jpg"
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-asset-url"
                    />
                  </div>
                )}

                {(formData.type === "image" || formData.type === "link") && (
                  <div className="space-y-2">
                    <Label>{isArabic ? "رابط الوجهة" : "Target URL"}</Label>
                    <Input
                      value={formData.targetUrl}
                      onChange={(event) => setFormData({ ...formData, targetUrl: event.target.value })}
                      placeholder="https://example.com"
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-target-url"
                    />
                  </div>
                )}

                {formData.type === "embed" && (
                  <div className="space-y-2">
                    <Label>{isArabic ? "كود التضمين (HTML)" : "Embed Code (HTML)"}</Label>
                    <Textarea
                      value={formData.embedCode}
                      onChange={(event) => setFormData({ ...formData, embedCode: event.target.value })}
                      placeholder="<iframe src='...'></iframe>"
                      className={TEXTAREA_SURFACE_CLASS}
                      data-testid="input-ad-embed-code"
                    />
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{isArabic ? "مدة العرض (مللي ثانية)" : "Display Duration (ms)"}</Label>
                    <Input
                      type="number"
                      value={formData.displayDuration}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        setFormData({ ...formData, displayDuration: Number.isNaN(value) ? 0 : value });
                      }}
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-duration"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isArabic ? "ترتيب الظهور" : "Sort Order"}</Label>
                    <Input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        setFormData({ ...formData, sortOrder: Number.isNaN(value) ? 0 : value });
                      }}
                      className={INPUT_SURFACE_CLASS}
                      data-testid="input-ad-sort-order"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div>
                    <Label>{isArabic ? "الحالة" : "Active Status"}</Label>
                    <p className="text-xs text-muted-foreground">
                      {isArabic ? "الإعلانات غير النشطة تبقى محفوظة دون ظهورها للمستخدمين." : "Inactive ads remain saved without being shown to users."}
                    </p>
                  </div>
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    data-testid="switch-ad-active"
                  />
                </div>

                <DialogFooter>
                  <Button className={BUTTON_3D_CLASS} onClick={() => setIsDialogOpen(false)}>
                    {isArabic ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    className={BUTTON_3D_PRIMARY_CLASS}
                    onClick={handleSubmit}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-advertisement"
                  >
                    {editingAd
                      ? isArabic
                        ? "تحديث الإعلان"
                        : "Update Advertisement"
                      : isArabic
                        ? "إنشاء الإعلان"
                        : "Create Advertisement"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Image className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "إجمالي الإعلانات" : "Total Ads"}</p>
              <p className="mt-1 text-2xl font-bold">{ads.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "الإعلانات النشطة" : "Active Ads"}</p>
              <p className="mt-1 text-2xl font-bold">{activeAdsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "إعلانات وسائط" : "Media Slots"}</p>
              <p className="mt-1 text-2xl font-bold">{mediaAdsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Link className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? "روابط أو تضمين" : "Link / Embed"}</p>
              <p className="mt-1 text-2xl font-bold">{linkedAdsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {sortedAds.length === 0 ? (
        <Card className={DATA_CARD_CLASS}>
          <CardContent className="p-8 text-center">
            <p className="text-base font-semibold">
              {isArabic ? "لا توجد إعلانات حتى الآن" : "No advertisements yet"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {isArabic ? "استخدم زر إضافة إعلان لإنشاء أول عنصر في الكاروسيل." : "Use Add Advertisement to create the first carousel item."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sortedAds.map((ad) => {
            const TypeIcon = typeIcons[ad.type] || Image;

            return (
              <Card key={ad.id} className={DATA_CARD_CLASS}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2 pt-1">
                        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                          <TypeIcon className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold sm:text-lg">{ad.title}</h3>
                          <Badge variant={ad.isActive ? "default" : "secondary"}>
                            {ad.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "متوقف" : "Inactive")}
                          </Badge>
                          <Badge variant="outline">{getTypeLabel(ad.type, isArabic)}</Badge>
                        </div>

                        {ad.titleAr && (
                          <p className="mt-2 text-sm text-muted-foreground" dir="rtl">
                            {ad.titleAr}
                          </p>
                        )}

                        <p className="mt-3 text-xs text-muted-foreground">
                          {isArabic ? "المحتوى" : "Content"}: {getContentSummary(ad, isArabic)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        className={BUTTON_3D_CLASS}
                        onClick={() => handleEdit(ad)}
                        data-testid={`button-edit-ad-${ad.id}`}
                      >
                        <Edit className="me-2 h-4 w-4" />
                        {isArabic ? "تعديل" : "Edit"}
                      </Button>
                      <Button
                        className={BUTTON_3D_DESTRUCTIVE_CLASS}
                        onClick={() => deleteMutation.mutate(ad.id)}
                        data-testid={`button-delete-ad-${ad.id}`}
                      >
                        <Trash2 className="me-2 h-4 w-4" />
                        {isArabic ? "حذف" : "Delete"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {isArabic ? "المدة" : "Duration"}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{ad.displayDuration}ms</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {isArabic ? "الترتيب" : "Order"}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{ad.sortOrder}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {isArabic ? "الوجهة" : "Target"}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{getTargetSummary(ad, isArabic)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {isArabic ? "المعرف" : "Ad ID"}
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold">{truncateText(ad.id, 24)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
