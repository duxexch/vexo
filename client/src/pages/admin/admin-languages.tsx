import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Plus, Pencil, Trash2, Languages, Loader2, Globe2, CheckCircle2, ArrowLeftRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

interface ManagedLanguage {
  id: string;
  code: string;
  name: string;
  nativeName: string | null;
  direction: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const languageSchema = z.object({
  code: z.string().min(2, "Code must be at least 2 characters").max(10),
  name: z.string().min(1, "Name is required"),
  nativeName: z.string().optional(),
  direction: z.enum(["ltr", "rtl"]),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type LanguageFormData = z.infer<typeof languageSchema>;

const SURFACE_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const STAT_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900/70";
const DATA_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900/70";
const TABLE_WRAP_CLASS = "overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/85 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:bg-slate-900/70";
const BUTTON_3D_CLASS = "rounded-xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_8px_0_0_rgba(148,163,184,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(148,163,184,0.45)] hover:brightness-105 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.82)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-xl border border-sky-600 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(3,105,161,0.52)] hover:brightness-105";
const BUTTON_3D_DANGER_CLASS = "rounded-xl border border-rose-700 bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 text-white shadow-[0_8px_0_0_rgba(159,18,57,0.48)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(159,18,57,0.44)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";
const INPUT_SURFACE_CLASS = "min-h-[46px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const DIALOG_SURFACE_CLASS = "max-w-2xl rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100 p-0 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.6)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const TOGGLE_ROW_CLASS = "flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60";

function normalizeLanguageData(data: LanguageFormData): LanguageFormData {
  return {
    ...data,
    code: data.code.trim().toLowerCase(),
    name: data.name.trim(),
    nativeName: data.nativeName?.trim() || "",
    isActive: data.isDefault ? true : data.isActive,
  };
}

export default function AdminLanguagesPage() {
  const { toast } = useToast();
  const { language: currentLang } = useI18n();
  const isArabic = currentLang === "ar";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<ManagedLanguage | null>(null);
  const [deleteLanguage, setDeleteLanguage] = useState<ManagedLanguage | null>(null);

  const form = useForm<LanguageFormData>({
    resolver: zodResolver(languageSchema),
    defaultValues: {
      code: "",
      name: "",
      nativeName: "",
      direction: "ltr",
      isDefault: false,
      isActive: true,
    },
  });

  const { data: languages, isLoading } = useQuery<ManagedLanguage[]>({
    queryKey: ["/api/admin/languages"],
    queryFn: () => adminFetch("/api/admin/languages"),
  });

  const createMutation = useMutation({
    mutationFn: async (data: LanguageFormData) => {
      return adminFetch("/api/admin/languages", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/languages"] });
      toast({ title: isArabic ? "تم الإنشاء" : "Created", description: isArabic ? "تمت إضافة اللغة بنجاح" : "Language added successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LanguageFormData> }) => {
      return adminFetch(`/api/admin/languages/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/languages"] });
      toast({ title: isArabic ? "تم التحديث" : "Updated", description: isArabic ? "تم تحديث اللغة بنجاح" : "Language updated successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminFetch(`/api/admin/languages/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/languages"] });
      toast({ title: isArabic ? "تم الحذف" : "Deleted", description: isArabic ? "تم حذف اللغة" : "Language deleted" });
      setDeleteLanguage(null);
    },
    onError: (error: Error) => {
      toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
      setDeleteLanguage(null);
    },
  });

  const openCreateDialog = () => {
    form.reset({
      code: "",
      name: "",
      nativeName: "",
      direction: "ltr",
      isDefault: false,
      isActive: true,
    });
    setEditingLanguage(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (lang: ManagedLanguage) => {
    form.reset({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName || "",
      direction: lang.direction as "ltr" | "rtl",
      isDefault: lang.isDefault,
      isActive: lang.isActive,
    });
    setEditingLanguage(lang);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingLanguage(null);
    form.reset();
  };

  const onSubmit = (data: LanguageFormData) => {
    const normalizedData = normalizeLanguageData(data);
    if (editingLanguage) {
      updateMutation.mutate({ id: editingLanguage.id, data: normalizedData });
    } else {
      createMutation.mutate(normalizedData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const sortedLanguages = [...(languages || [])].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return Number(right.isDefault) - Number(left.isDefault);
    if (left.isActive !== right.isActive) return Number(right.isActive) - Number(left.isActive);
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  const activeLanguagesCount = sortedLanguages.filter((lang) => lang.isActive).length;
  const rtlLanguagesCount = sortedLanguages.filter((lang) => lang.direction === "rtl").length;
  const defaultLanguage = sortedLanguages.find((lang) => lang.isDefault);
  const isDefaultSelected = form.watch("isDefault");

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Languages className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-page-title">
                {isArabic ? "إدارة اللغات" : "Language Management"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {isArabic ? "إدارة اللغات المدعومة في التطبيق" : "Manage supported languages in the application"}
              </p>
            </div>
          </div>
          <Button
            className={`${BUTTON_3D_PRIMARY_CLASS} w-full sm:w-auto`}
            onClick={openCreateDialog}
            data-testid="button-add-language"
          >
            <Plus className="me-2 h-4 w-4" />
            {isArabic ? "إضافة لغة" : "Add Language"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Languages className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "اللغات" : "Languages"}
              </p>
              <p className="mt-1 text-2xl font-bold">{sortedLanguages.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "نشط" : "Active"}
              </p>
              <p className="mt-1 text-2xl font-bold">{activeLanguagesCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Globe2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "افتراضي" : "Default"}
              </p>
              <p className="mt-1 truncate text-lg font-bold">{defaultLanguage?.name || "-"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {isArabic ? "الاتجاه" : "Direction"}
              </p>
              <p className="mt-1 text-lg font-bold">{rtlLanguagesCount} RTL</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={SURFACE_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {isArabic ? "اللغات" : "Languages"}
          </CardTitle>
          <CardDescription>
            {isArabic ? "استعراض اللغات وتعديل حالتها واتجاهها واللغة الافتراضية" : "Review languages, change their status and direction, and manage the default language"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`${DATA_CARD_CLASS} space-y-3`}>
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : !sortedLanguages.length ? (
            <div className={`${DATA_CARD_CLASS} text-center text-muted-foreground`}>
              {isArabic ? "لا توجد لغات" : "No languages found"}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:hidden">
                {sortedLanguages.map((lang) => (
                  <div key={lang.id} className={DATA_CARD_CLASS} data-testid={`row-language-${lang.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full border-none bg-slate-900 px-3 py-1 font-mono text-white dark:bg-slate-100 dark:text-slate-900">
                            {lang.code}
                          </Badge>
                          {lang.isDefault && (
                            <Badge className="rounded-full border-none bg-amber-500 px-3 py-1 text-white">
                              {isArabic ? "افتراضي" : "Default"}
                            </Badge>
                          )}
                          <Badge
                            className={`rounded-full border-none px-3 py-1 text-white ${lang.isActive ? "bg-emerald-600" : "bg-slate-500"}`}
                          >
                            {lang.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                          </Badge>
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold">{lang.name}</h3>
                          <p className="truncate text-sm text-muted-foreground">{lang.nativeName || "-"}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-semibold">
                        {lang.direction === "rtl" ? "RTL" : "LTR"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                          {isArabic ? "الرمز" : "Code"}
                        </p>
                        <p className="mt-2 font-mono text-sm font-semibold">{lang.code}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                          {isArabic ? "الاتجاه" : "Direction"}
                        </p>
                        <p className="mt-2 text-sm font-semibold">{lang.direction === "rtl" ? "RTL" : "LTR"}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className={`${BUTTON_3D_CLASS} flex-1 sm:flex-none`}
                        onClick={() => openEditDialog(lang)}
                        data-testid={`button-edit-language-${lang.id}`}
                      >
                        <Pencil className="me-2 h-4 w-4" />
                        {isArabic ? "تعديل" : "Edit"}
                      </Button>
                      <Button
                        className={`${BUTTON_3D_DANGER_CLASS} flex-1 sm:flex-none`}
                        onClick={() => setDeleteLanguage(lang)}
                        disabled={lang.isDefault}
                        data-testid={`button-delete-language-${lang.id}`}
                      >
                        <Trash2 className="me-2 h-4 w-4" />
                        {isArabic ? "حذف" : "Delete"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`hidden md:block ${TABLE_WRAP_CLASS}`}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200/80 dark:border-slate-800">
                      <TableHead>{isArabic ? "الرمز" : "Code"}</TableHead>
                      <TableHead>{isArabic ? "الاسم" : "Name"}</TableHead>
                      <TableHead>{isArabic ? "الاسم المحلي" : "Native Name"}</TableHead>
                      <TableHead>{isArabic ? "الاتجاه" : "Direction"}</TableHead>
                      <TableHead>{isArabic ? "افتراضي" : "Default"}</TableHead>
                      <TableHead>{isArabic ? "نشط" : "Active"}</TableHead>
                      <TableHead className="text-end">{isArabic ? "الإجراءات" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLanguages.map((lang) => (
                      <TableRow key={lang.id} data-testid={`row-language-${lang.id}`} className="border-slate-200/70 dark:border-slate-800">
                        <TableCell className="font-mono font-semibold">{lang.code}</TableCell>
                        <TableCell className="font-medium">{lang.name}</TableCell>
                        <TableCell>{lang.nativeName || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-semibold">
                            {lang.direction === "rtl" ? "RTL" : "LTR"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lang.isDefault ? (
                            <Badge className="rounded-full border-none bg-amber-500 px-3 py-1 text-white">
                              {isArabic ? "افتراضي" : "Default"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`rounded-full border-none px-3 py-1 text-white ${lang.isActive ? "bg-emerald-600" : "bg-slate-500"}`}
                          >
                            {lang.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              className={`${BUTTON_3D_CLASS} h-10 w-10`}
                              onClick={() => openEditDialog(lang)}
                              data-testid={`button-edit-language-${lang.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              className={`${BUTTON_3D_DANGER_CLASS} h-10 w-10`}
                              onClick={() => setDeleteLanguage(lang)}
                              disabled={lang.isDefault}
                              data-testid={`button-delete-language-${lang.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
            return;
          }
          setIsDialogOpen(true);
        }}
      >
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <div className="p-5 sm:p-6">
            <DialogHeader className="space-y-3">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.42)]">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">
                    {editingLanguage
                      ? (isArabic ? "تعديل اللغة" : "Edit Language")
                      : (isArabic ? "إضافة لغة جديدة" : "Add New Language")}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    {isArabic ? "إدارة اللغات المدعومة في التطبيق" : "Manage supported languages in the application"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "الرمز" : "Code"}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={INPUT_SURFACE_CLASS}
                            placeholder="en"
                            dir="ltr"
                            autoCapitalize="none"
                            autoCorrect="off"
                            disabled={!!editingLanguage}
                            onChange={(event) => field.onChange(event.target.value.toLowerCase())}
                            data-testid="input-language-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="direction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "الاتجاه" : "Direction"}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-language-direction">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ltr">LTR (Left to Right)</SelectItem>
                            <SelectItem value="rtl">RTL (Right to Left)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "الاسم" : "Name"}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={INPUT_SURFACE_CLASS}
                            placeholder="English"
                            data-testid="input-language-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nativeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isArabic ? "الاسم المحلي" : "Native Name"}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={INPUT_SURFACE_CLASS}
                            placeholder="English"
                            data-testid="input-language-native-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className={TOGGLE_ROW_CLASS}>
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                          <FormLabel className="!mt-0 text-sm font-semibold">{isArabic ? "افتراضي" : "Default"}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              if (checked) {
                                form.setValue("isActive", true, { shouldDirty: true });
                              }
                            }}
                            data-testid="switch-language-default"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className={TOGGLE_ROW_CLASS}>
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Globe2 className="h-4 w-4" />
                          </div>
                          <FormLabel className="!mt-0 text-sm font-semibold">{isArabic ? "نشط" : "Active"}</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isDefaultSelected}
                            data-testid="switch-language-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                  <Button className={`${BUTTON_3D_CLASS} w-full sm:w-auto`} type="button" onClick={closeDialog}>
                    {isArabic ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    className={`${BUTTON_3D_PRIMARY_CLASS} w-full sm:w-auto`}
                    type="submit"
                    disabled={isPending}
                    data-testid="button-save-language"
                  >
                    {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {editingLanguage ? (isArabic ? "تحديث" : "Update") : (isArabic ? "إضافة" : "Add")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteLanguage}
        title={isArabic ? "تأكيد الحذف" : "Confirm Deletion"}
        description={
          isArabic
            ? `هل أنت متأكد من حذف اللغة "${deleteLanguage?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
            : `Are you sure you want to delete the language "${deleteLanguage?.name}"? This action cannot be undone.`
        }
        variant="destructive"
        confirmLabel={isArabic ? "حذف" : "Delete"}
        cancelLabel={isArabic ? "إلغاء" : "Cancel"}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteLanguage && deleteMutation.mutate(deleteLanguage.id)}
        onCancel={() => setDeleteLanguage(null)}
      />
    </div>
  );
}
