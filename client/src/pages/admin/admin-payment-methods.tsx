import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Building2,
  Wallet,
  Bitcoin,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Play,
} from "lucide-react";
import type { CountryPaymentMethod } from "@shared/schema";

const paymentMethodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  methodNumber: z.string().min(1, "Method number is required"),
  type: z.enum(["bank_transfer", "e_wallet", "crypto", "card"]),
  countryCode: z.string().min(2, "Country code is required"),
  minAmount: z.string().min(1, "Minimum amount is required"),
  maxAmount: z.string().min(1, "Maximum amount is required"),
  iconUrl: z.string().optional(),
  processingTime: z.string().optional(),
  instructions: z.string().optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  isWithdrawalEnabled: z.boolean(),
}).superRefine((value, context) => {
  const minAmount = Number(value.minAmount);
  const maxAmount = Number(value.maxAmount);

  if (!Number.isFinite(minAmount) || minAmount < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minAmount"],
      message: "Minimum amount must be a valid non-negative number",
    });
  }

  if (!Number.isFinite(maxAmount) || maxAmount < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxAmount"],
      message: "Maximum amount must be a valid non-negative number",
    });
  }

  if (Number.isFinite(minAmount) && Number.isFinite(maxAmount) && maxAmount < minAmount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxAmount"],
      message: "Maximum amount must be greater than or equal to minimum amount",
    });
  }
});

type PaymentMethodForm = z.infer<typeof paymentMethodSchema>;

const TYPE_ICONS = {
  bank_transfer: Building2,
  e_wallet: Wallet,
  crypto: Bitcoin,
  card: CreditCard,
};

const TYPE_LABELS = {
  bank_transfer: "Bank Transfer",
  e_wallet: "E-Wallet",
  crypto: "Cryptocurrency",
  card: "Credit/Debit Card",
};

type BulkAction = "activate" | "deactivate" | "enable_withdrawal" | "disable_withdrawal" | "delete";

const BULK_ACTION_OPTIONS: SearchableSelectOption[] = [
  { value: "activate", label: "Activate selected methods" },
  { value: "deactivate", label: "Deactivate selected methods" },
  { value: "enable_withdrawal", label: "Enable withdrawals for selected" },
  { value: "disable_withdrawal", label: "Disable withdrawals for selected" },
  { value: "delete", label: "Delete selected methods" },
];

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const TABLE_WRAP_CLASS = "overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] dark:border-slate-800/70 dark:bg-slate-950/90";
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[100px] rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-y-auto rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 sm:max-w-3xl";

export default function AdminPaymentMethodsPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [editingMethod, setEditingMethod] = useState<CountryPaymentMethod | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("activate");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { data: paymentMethods, isLoading } = useQuery<CountryPaymentMethod[]>({
    queryKey: ["/api/admin/payment-methods"],
  });

  const countryCodeOptions = useMemo(() => {
    const defaults = ["ALL", "EG", "SA", "AE", "US", "GB", "EU", "QA", "KW", "OM", "BH"];
    const codes = new Set(defaults);

    for (const method of paymentMethods || []) {
      const normalizedCode = String(method.countryCode || "").trim().toUpperCase();
      if (normalizedCode) {
        codes.add(normalizedCode);
      }
    }

    return Array.from(codes).sort((left, right) => {
      if (left === "ALL") return -1;
      if (right === "ALL") return 1;
      return left.localeCompare(right);
    });
  }, [paymentMethods]);

  const countrySelectOptions = useMemo<SearchableSelectOption[]>(
    () => countryCodeOptions.map((countryCode) => ({ value: countryCode, label: countryCode })),
    [countryCodeOptions],
  );

  const typeSelectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "bank_transfer", label: "Bank Transfer" },
      { value: "e_wallet", label: "E-Wallet" },
      { value: "crypto", label: "Cryptocurrency" },
      { value: "card", label: "Credit/Debit Card" },
    ],
    [],
  );

  const form = useForm<PaymentMethodForm>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      name: "",
      methodNumber: "",
      type: "bank_transfer",
      countryCode: "ALL",
      minAmount: "10",
      maxAmount: "10000",
      iconUrl: "",
      processingTime: "",
      instructions: "",
      sortOrder: 0,
      isActive: true,
      isWithdrawalEnabled: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: PaymentMethodForm) =>
      apiRequest("POST", "/api/admin/payment-methods", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method created" });
      setShowDialog(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<PaymentMethodForm>) =>
      apiRequest("PATCH", `/api/admin/payment-methods/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method updated" });
      setShowDialog(false);
      setEditingMethod(null);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/payment-methods/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<PaymentMethodForm, "isActive" | "isWithdrawalEnabled">>;
    }) => apiRequest("PATCH", `/api/admin/payment-methods/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async (payload: { ids: string[]; action: BulkAction }) => {
      const response = await apiRequest("POST", "/api/admin/payment-methods/bulk-action", payload);
      return response.json() as Promise<{ success: boolean; action: BulkAction; affectedCount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setSelectedMethodIds([]);
      setShowBulkDeleteConfirm(false);

      toast({
        title: "Success",
        description: `Bulk action completed on ${result.affectedCount} method(s)`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!paymentMethods) {
      return;
    }

    const existingIds = new Set(paymentMethods.map((method) => method.id));
    setSelectedMethodIds((previous) => previous.filter((id) => existingIds.has(id)));
  }, [paymentMethods]);

  const handleToggleSelectMethod = (methodId: string, checked: boolean) => {
    setSelectedMethodIds((previous) => {
      if (checked) {
        if (previous.includes(methodId)) return previous;
        return [...previous, methodId];
      }
      return previous.filter((id) => id !== methodId);
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (!paymentMethods?.length) {
      setSelectedMethodIds([]);
      return;
    }

    setSelectedMethodIds(checked ? paymentMethods.map((method) => method.id) : []);
  };

  const handleApplyBulkAction = () => {
    if (selectedMethodIds.length === 0) {
      toast({ title: "Error", description: "Select at least one method", variant: "destructive" });
      return;
    }

    if (bulkAction === "delete") {
      setShowBulkDeleteConfirm(true);
      return;
    }

    bulkActionMutation.mutate({ ids: selectedMethodIds, action: bulkAction });
  };

  const openEditDialog = (method: CountryPaymentMethod) => {
    setEditingMethod(method);
    form.reset({
      name: method.name,
      methodNumber: method.methodNumber,
      type: method.type as "bank_transfer" | "e_wallet" | "crypto" | "card",
      countryCode: method.countryCode,
      minAmount: method.minAmount,
      maxAmount: method.maxAmount,
      iconUrl: method.iconUrl || "",
      processingTime: method.processingTime || "",
      instructions: method.instructions || "",
      sortOrder: method.sortOrder,
      isActive: method.isActive,
      isWithdrawalEnabled: method.isWithdrawalEnabled,
    });
    setShowDialog(true);
  };

  const openCreateDialog = () => {
    setEditingMethod(null);
    form.reset({
      name: "",
      methodNumber: "",
      type: "bank_transfer",
      countryCode: "ALL",
      minAmount: "10",
      maxAmount: "10000",
      iconUrl: "",
      processingTime: "",
      instructions: "",
      sortOrder: (paymentMethods?.length || 0) + 1,
      isActive: true,
      isWithdrawalEnabled: false,
    });
    setShowDialog(true);
  };

  const onSubmit = (data: PaymentMethodForm) => {
    if (editingMethod) {
      updateMutation.mutate({ id: editingMethod.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const totalMethods = paymentMethods?.length || 0;
  const selectedCount = selectedMethodIds.length;
  const activeMethodsCount = paymentMethods?.filter((method) => method.isActive).length || 0;
  const withdrawalEnabledCount = paymentMethods?.filter((method) => method.isWithdrawalEnabled).length || 0;
  const globalMethodsCount = paymentMethods?.filter((method) => String(method.countryCode).toUpperCase() === "ALL").length || 0;
  const sortedPaymentMethods = [...(paymentMethods || [])].sort((left, right) => {
    if (left.isActive !== right.isActive) return Number(right.isActive) - Number(left.isActive);
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name);
  });
  const selectAllState: boolean | "indeterminate" = selectedCount === 0
    ? false
    : selectedCount === totalMethods
      ? true
      : "indeterminate";

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <Skeleton className="h-6 w-40" />
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
    <div className="space-y-5 p-3 sm:p-4 md:p-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <CreditCard className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payment Methods</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">Manage payment methods for deposits and withdrawals</p>
            </div>
          </div>
          <Button className={BUTTON_3D_PRIMARY_CLASS} onClick={openCreateDialog} data-testid="button-add-payment-method">
            <Plus className="me-2 h-4 w-4" />
            Add Payment Method
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Total Methods</p>
              <p className="mt-1 text-2xl font-bold">{totalMethods}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Active</p>
              <p className="mt-1 text-2xl font-bold">{activeMethodsCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Withdrawal Enabled</p>
              <p className="mt-1 text-2xl font-bold">{withdrawalEnabledCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Global Scope</p>
              <p className="mt-1 text-2xl font-bold">{globalMethodsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={SURFACE_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Active Payment Methods</CardTitle>
          <CardDescription>Configure method availability and which ones users can select in withdrawal requests</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentMethods && paymentMethods.length > 0 ? (
            <>
              <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                    data-testid="checkbox-select-all-payment-methods"
                  />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckSquare className="h-4 w-4" />
                    <span>{selectedCount} selected</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="w-full sm:w-72">
                    <SearchableSelect
                      value={bulkAction}
                      onValueChange={(value) => setBulkAction(value as BulkAction)}
                      options={BULK_ACTION_OPTIONS}
                      placeholder="Choose bulk action"
                      searchPlaceholder="Type to filter action"
                      emptyText="No actions found"
                      triggerTestId="select-bulk-action"
                      searchInputTestId="input-search-bulk-action"
                    />
                  </div>
                  <Button
                    className={BUTTON_3D_CLASS}
                    type="button"
                    onClick={handleApplyBulkAction}
                    disabled={selectedCount === 0 || bulkActionMutation.isPending}
                    data-testid="button-apply-bulk-action"
                  >
                    <Play className="me-2 h-4 w-4" />
                    Apply to selected
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 xl:hidden">
                {sortedPaymentMethods.map((method) => {
                  const TypeIcon = TYPE_ICONS[method.type as keyof typeof TYPE_ICONS] || CreditCard;
                  const isSelected = selectedMethodIds.includes(method.id);

                  return (
                    <Card key={method.id} className={DATA_CARD_CLASS} data-testid={`row-payment-method-${method.id}`}>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleToggleSelectMethod(method.id, Boolean(checked))}
                              data-testid={`checkbox-select-payment-method-${method.id}`}
                            />
                            {method.iconUrl ? (
                              <img src={method.iconUrl} alt={method.name} loading="lazy" className="h-12 w-12 rounded-2xl object-contain" />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                                <TypeIcon className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{method.name}</p>
                              <p className="truncate text-xs text-muted-foreground">#{method.methodNumber || "-"}</p>
                              <p className="truncate text-sm text-muted-foreground">{TYPE_LABELS[method.type as keyof typeof TYPE_LABELS]}</p>
                            </div>
                          </div>
                          <Badge variant={method.isActive ? "default" : "secondary"}>{method.isActive ? "Active" : "Inactive"}</Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Limits</p>
                            <p className="mt-2 text-sm font-semibold">${method.minAmount} - ${method.maxAmount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Country</p>
                            <p className="mt-2 text-sm font-semibold">{method.countryCode}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <span className="text-sm font-medium">Withdrawals</span>
                            <Switch
                              checked={method.isWithdrawalEnabled}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isWithdrawalEnabled: checked } })}
                              data-testid={`switch-withdrawal-enabled-${method.id}`}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                            <span className="text-sm font-medium">Active</span>
                            <Switch
                              checked={method.isActive}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isActive: checked } })}
                              data-testid={`switch-toggle-${method.id}`}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Sort Order</p>
                          <p className="mt-2 text-sm font-semibold">{method.sortOrder}</p>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                            onClick={() => openEditDialog(method)}
                            data-testid={`button-edit-${method.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                            onClick={() => setDeleteMethodId(method.id)}
                            data-testid={`button-delete-${method.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className={`hidden xl:block ${TABLE_WRAP_CLASS}`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAllState}
                          onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                          data-testid="checkbox-select-all-payment-methods-header"
                        />
                      </TableHead>
                      <TableHead>Icon</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Method Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Withdrawals</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPaymentMethods.map((method) => {
                      const TypeIcon = TYPE_ICONS[method.type as keyof typeof TYPE_ICONS] || CreditCard;
                      const isSelected = selectedMethodIds.includes(method.id);

                      return (
                        <TableRow key={method.id} data-testid={`row-payment-method-${method.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleToggleSelectMethod(method.id, Boolean(checked))}
                              data-testid={`checkbox-select-payment-method-${method.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            {method.iconUrl ? (
                              <img src={method.iconUrl} alt={method.name} loading="lazy" className="h-8 w-8 rounded object-contain" />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                                <TypeIcon className="h-4 w-4 text-primary" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{method.name}</TableCell>
                          <TableCell className="text-sm">{method.methodNumber || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{TYPE_LABELS[method.type as keyof typeof TYPE_LABELS]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            ${method.minAmount} - ${method.maxAmount}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{method.countryCode}</Badge>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={method.isWithdrawalEnabled}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isWithdrawalEnabled: checked } })}
                              data-testid={`switch-withdrawal-enabled-${method.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={method.isActive}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isActive: checked } })}
                              data-testid={`switch-toggle-${method.id}`}
                            />
                          </TableCell>
                          <TableCell>{method.sortOrder}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                                onClick={() => openEditDialog(method)}
                                data-testid={`button-edit-${method.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                className={`${BUTTON_3D_CLASS} h-10 w-10 p-0`}
                                onClick={() => setDeleteMethodId(method.id)}
                                data-testid={`button-delete-${method.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No payment methods configured</p>
              <Button onClick={openCreateDialog} className={`${BUTTON_3D_CLASS} mt-4`}>
                <Plus className="h-4 w-4 me-2" />
                Add First Payment Method
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <div className="space-y-5 p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editingMethod ? "Edit Payment Method" : "Add Payment Method"}</DialogTitle>
              <DialogDescription>
                Configure a payment method for deposit and withdrawal flows
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="countryCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={String(field.value || "ALL").toUpperCase()}
                          onValueChange={(value) => field.onChange(value.toUpperCase())}
                          options={countrySelectOptions}
                          placeholder="Select country"
                          searchPlaceholder="Type country code"
                          emptyText="No country found"
                          triggerTestId="select-country-code"
                          searchInputTestId="input-search-country-code"
                        />
                      </FormControl>
                      <FormDescription>Use ALL for global availability</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Vodafone Cash" {...field} className={INPUT_SURFACE_CLASS} data-testid="input-method-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="methodNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 01012345678" {...field} className={INPUT_SURFACE_CLASS} data-testid="input-method-number" />
                      </FormControl>
                      <FormDescription>Number shown to users for this payment method</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={typeSelectOptions}
                          placeholder="Select type"
                          searchPlaceholder="Type payment type"
                          emptyText="No type found"
                          triggerTestId="select-method-type"
                          searchInputTestId="input-search-method-type"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="minAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Amount</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="10" {...field} className={INPUT_SURFACE_CLASS} data-testid="input-min-amount" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Amount</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="10000" {...field} className={INPUT_SURFACE_CLASS} data-testid="input-max-amount" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                            className={INPUT_SURFACE_CLASS}
                            data-testid="input-sort-order"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="iconUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} className={INPUT_SURFACE_CLASS} data-testid="input-icon-url" />
                      </FormControl>
                      <FormDescription>URL to the payment method icon (3D style recommended)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="processingTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Processing Time</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Instant, 1-2 hours" {...field} className={INPUT_SURFACE_CLASS} data-testid="input-processing-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Instructions for the user..."
                          {...field}
                          className={TEXTAREA_SURFACE_CLASS}
                          data-testid="input-instructions"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div>
                        <FormLabel>Active</FormLabel>
                        <FormDescription>Show this method to users</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-is-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isWithdrawalEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div>
                        <FormLabel>Enable for withdrawals</FormLabel>
                        <FormDescription>Allow users to pick this method when creating a withdrawal request</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-is-withdrawal-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" className={BUTTON_3D_CLASS} onClick={() => setShowDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className={BUTTON_3D_PRIMARY_CLASS}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-method"
                  >
                    {editingMethod ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Delete selected payment methods"
        description={`Are you sure you want to delete ${selectedCount} selected method(s)? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete selected"
        loading={bulkActionMutation.isPending}
        onConfirm={() => bulkActionMutation.mutate({ ids: selectedMethodIds, action: "delete" })}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!deleteMethodId}
        title={t("admin.payments.deleteTitle") || "Delete Payment Method"}
        description={t("admin.payments.deleteDescription") || "Are you sure you want to delete this payment method? This action cannot be undone."}
        variant="destructive"
        confirmLabel={t("common.delete") || "Delete"}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteMethodId) {
            deleteMutation.mutate(deleteMethodId, {
              onSettled: () => setDeleteMethodId(null),
            });
          }
        }}
        onCancel={() => setDeleteMethodId(null)}
      />
    </div>
  );
}
