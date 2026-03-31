import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Languages, Loader2 } from "lucide-react";
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

export default function AdminLanguagesPage() {
  const { toast } = useToast();
  const { t, language: currentLang } = useI18n();
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
    if (editingLanguage) {
      updateMutation.mutate({ id: editingLanguage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {isArabic ? "إدارة اللغات" : "Language Management"}
          </h1>
          <p className="text-muted-foreground">
            {isArabic ? "إدارة اللغات المدعومة في التطبيق" : "Manage supported languages in the application"}
          </p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-language">
          <Plus className="me-2 h-4 w-4" />
          {isArabic ? "إضافة لغة" : "Add Language"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {isArabic ? "اللغات" : "Languages"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isArabic ? "الرمز" : "Code"}</TableHead>
                  <TableHead>{isArabic ? "الاسم" : "Name"}</TableHead>
                  <TableHead>{isArabic ? "الاسم المحلي" : "Native Name"}</TableHead>
                  <TableHead>{isArabic ? "الاتجاه" : "Direction"}</TableHead>
                  <TableHead>{isArabic ? "افتراضي" : "Default"}</TableHead>
                  <TableHead>{isArabic ? "نشط" : "Active"}</TableHead>
                  <TableHead>{isArabic ? "الإجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {languages?.map((lang) => (
                  <TableRow key={lang.id} data-testid={`row-language-${lang.id}`}>
                    <TableCell className="font-mono">{lang.code}</TableCell>
                    <TableCell>{lang.name}</TableCell>
                    <TableCell>{lang.nativeName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {lang.direction === "rtl" ? "RTL" : "LTR"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lang.isDefault && (
                        <Badge variant="default">{isArabic ? "افتراضي" : "Default"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={lang.isActive ? "default" : "secondary"}>
                        {lang.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(lang)}
                          data-testid={`button-edit-language-${lang.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
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
                {!languages?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {isArabic ? "لا توجد لغات" : "No languages found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLanguage
                ? (isArabic ? "تعديل اللغة" : "Edit Language")
                : (isArabic ? "إضافة لغة جديدة" : "Add New Language")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isArabic ? "الرمز" : "Code"}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="en"
                        disabled={!!editingLanguage}
                        data-testid="input-language-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isArabic ? "الاسم" : "Name"}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="English" data-testid="input-language-name" />
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
                      <Input {...field} placeholder="English" data-testid="input-language-native-name" />
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
                        <SelectTrigger data-testid="select-language-direction">
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
              <div className="flex items-center gap-6">
                <FormField
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-language-default"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">{isArabic ? "افتراضي" : "Default"}</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-language-active"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">{isArabic ? "نشط" : "Active"}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-language">
                  {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {editingLanguage ? (isArabic ? "تحديث" : "Update") : (isArabic ? "إضافة" : "Add")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
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
